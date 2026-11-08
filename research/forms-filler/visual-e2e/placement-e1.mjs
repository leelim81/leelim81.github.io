import { writeFileSync } from 'fs';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const { chromium } = pkg;

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8765/tools/forms-filler/bench.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.FormFields && window.PDFLib && window.pdfjsLib);

const report = await page.evaluate(async () => {
  const out = { checks: [], transforms: [] };
  function check(name, ok, detail) {
    out.checks.push({ name, ok: !!ok, detail: detail || '' });
  }
  function textAt(item) {
    const t = item.transform || [];
    return { x: t[4], y: t[5], str: item.str };
  }

  async function sheet(draw) {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 800, 1000);
    ctx.fillStyle = '#111';
    ctx.font = '22px sans-serif';
    draw(ctx);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
    const jpeg = new Uint8Array(await blob.arrayBuffer());
    const doc = await PDFLib.PDFDocument.create();
    const image = await doc.embedJpg(jpeg);
    const pageHeight = 1000 * (595 / 800);
    const sheet = doc.addPage([595, pageHeight]);
    sheet.drawImage(image, { x: 0, y: 0, width: 595, height: pageHeight });
    return { bytes: new Uint8Array(await doc.save()), pageHeight };
  }

  function lineY(imageY, pageHeight) {
    return (1000 - imageY) / 1000 * pageHeight;
  }

  const below = await sheet((ctx) => {
    [['Applicant name', 140], ['Applicant NRIC', 280], ['Applicant phone', 420]].forEach(([label, y]) => {
      ctx.fillRect(40, y, 320, 2);
      ctx.fillText(label, 40, y + 28);
    });
  });
  const belowRead = await FormFields.read(below.bytes);
  const nameField = belowRead.fields.find((field) => /name/i.test(field.label));
  const nameY = lineY(140, below.pageHeight);
  const nricY = lineY(280, below.pageHeight);
  const nameRect = nameField && nameField.rect;
  check('a caption under its rule is nearer that rule than the next one', !!(nameRect && Math.abs(nameRect.y - nameY) + 8 < Math.abs(nameRect.y - nricY)), JSON.stringify({ nameRect, nameY, nricY }));

  const above = await sheet((ctx) => {
    [['Applicant name', 180], ['Applicant email', 340]].forEach(([label, y]) => {
      ctx.fillText(label, 40, y - 10);
      ctx.fillRect(40, y, 320, 2);
    });
  });
  const aboveRead = await FormFields.read(above.bytes);
  const aboveName = aboveRead.fields.find((field) => /name/i.test(field.label));
  check('a caption above its rule stays on that rule', aboveName && Math.abs(aboveName.rect.y - lineY(180, above.pageHeight)) < 8, JSON.stringify(aboveName && aboveName.rect));

  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const plain = doc.addPage([200, 200]);
  plain.drawText('Anchor', { x: 20, y: 100, size: 12, font });
  const plainBytes = new Uint8Array(await doc.save());
  const plainPdf = await pdfjsLib.getDocument({ data: plainBytes.slice(0) }).promise;
  const plainPage = await plainPdf.getPage(1);
  const plainText = await plainPage.getTextContent();
  const anchor = textAt(plainText.items[0] || {});
  check('drawn text round-trips within one point', Math.abs(anchor.x - 20) < 1 && Math.abs(anchor.y - 100) < 1, JSON.stringify(anchor));
  out.transforms.push({ case: 'identity', rotate: plainPage.getViewport({ scale: 1 }).rotation, userUnit: plainPage.getViewport({ scale: 1 }).userUnit, viewBox: plainPage.getViewport({ scale: 1 }).viewBox, anchor });

  const turned = await PDFLib.PDFDocument.create();
  const turnedFont = await turned.embedFont(PDFLib.StandardFonts.Helvetica);
  const turnedPage = turned.addPage([200, 200]);
  turnedPage.setRotation(PDFLib.degrees(90));
  turnedPage.drawText('Turn', { x: 30, y: 40, size: 12, font: turnedFont });
  const turnedBytes = new Uint8Array(await turned.save());
  const turnedPdf = await pdfjsLib.getDocument({ data: turnedBytes.slice(0) }).promise;
  const turnedView = (await turnedPdf.getPage(1)).getViewport({ scale: 1 });
  const turnedItem = textAt((await (await turnedPdf.getPage(1)).getTextContent()).items[0] || {});
  out.transforms.push({ case: 'rotate90', width: turnedView.width, height: turnedView.height, rotation: turnedView.rotation, viewBox: turnedView.viewBox, text: turnedItem, note: 'Recorded. A 90 degree page is not a supported scan target in this experiment.' });

  const cropped = await PDFLib.PDFDocument.create();
  const cropFont = await cropped.embedFont(PDFLib.StandardFonts.Helvetica);
  const cropPage = cropped.addPage([220, 220]);
  cropPage.setCropBox(20, 20, 160, 160);
  cropPage.drawText('Crop', { x: 40, y: 40, size: 12, font: cropFont });
  const cropBytes = new Uint8Array(await cropped.save());
  const cropPdfPage = await (await pdfjsLib.getDocument({ data: cropBytes.slice(0) }).promise).getPage(1);
  const cropView = cropPdfPage.getViewport({ scale: 1 });
  const cropItem = textAt((await cropPdfPage.getTextContent()).items[0] || {});
  out.transforms.push({ case: 'cropBox', viewBox: cropView.viewBox, width: cropView.width, height: cropView.height, text: cropItem, note: 'pdf.js viewBox follows the crop. Text stays in MediaBox user space.' });

  const paintedDoc = await PDFLib.PDFDocument.load(below.bytes.slice(0));
  const paintFont = await paintedDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  const paintPage = paintedDoc.getPages()[0];
  const target = nameRect;
  paintPage.drawText('Amos Bent', { x: target.x + 2, y: target.y + 4, size: 11, font: paintFont });
  const paintedBytes = new Uint8Array(await paintedDoc.save());
  const paintedText = await (await pdfjsLib.getDocument({ data: paintedBytes.slice(0) }).promise).getPage(1);
  const paintedContent = await paintedText.getTextContent();
  const amos = paintedContent.items.map(textAt).find((item) => item.str === 'Amos Bent') || {};
  const dx = Math.abs((amos.x || 0) - (target.x + 2));
  const dy = Math.abs((amos.y || 0) - (target.y + 4));
  check('exported text sits on the chosen rule within one point', dx < 1 && dy < 1, JSON.stringify({ amos, expected: { x: target.x + 2, y: target.y + 4 }, dx, dy }));

  const auditResponse = await fetch('/research/forms-filler/visual-e2e/fixtures/scan-audit/bent-above.form.pdf');
  const auditBytes = new Uint8Array(await auditResponse.arrayBuffer());
  const audit = await FormFields.read(auditBytes.slice(0));
  const gold = {
    'Bent applicant name': [22.58, 751.91, 133.98, 8.78],
    'Bent applicant NRIC': [23.13, 707.28, 133.98, 8.78],
    'Bent applicant birth date': [23.67, 662.65, 133.98, 8.78],
    'Bent applicant phone': [24.22, 618.01, 133.98, 8.78],
    'Bent applicant email': [24.76, 573.38, 133.98, 8.78]
  };
  function overlap(rect, box) {
    const ix = Math.min(rect.x + rect.width, box[0] + box[2]) - Math.max(rect.x, box[0]);
    const iy = Math.min(rect.y + rect.height, box[1] + box[3]) - Math.max(rect.y, box[1]);
    return ix > 6 && iy > -2;
  }
  const shifted = [];
  Object.entries(gold).forEach(([label, box]) => {
    const field = audit.fields.find((item) => item.label === label);
    const own = !!(field && overlap(field.rect, box));
    const other = Object.entries(gold).some(([otherLabel, otherBox]) => otherLabel !== label && field && overlap(field.rect, otherBox));
    if (!own || other) shifted.push(label);
  });
  check('viewed above-label audit regression: each caption overlaps only its own gold', shifted.length === 0, shifted.join(', ') || 'five rules');

  async function framed(mutate) {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 500;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 400, 500);
    ctx.fillStyle = '#111';
    ctx.fillRect(40, 200, 220, 3);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    const jpeg = new Uint8Array(await blob.arrayBuffer());
    const doc = await PDFLib.PDFDocument.create();
    const image = await doc.embedJpg(jpeg);
    const page = doc.addPage([400, 500]);
    page.drawImage(image, { x: 0, y: 0, width: 400, height: 500 });
    if (mutate) mutate(page);
    const read = await FormFields.read(new Uint8Array(await doc.save()));
    return { fields: read.fields.length, route: read.route, block: read.placementBlock || '' };
  }
  const rotatedPage = await framed((sheet) => sheet.setRotation(PDFLib.degrees(90)));
  const croppedPage = await framed((sheet) => sheet.setCropBox(20, 20, 140, 140));
  const scaledPage = await framed((sheet) => sheet.node.set(PDFLib.PDFName.of('UserUnit'), PDFLib.PDFNumber.of(2)));
  const plainPageImage = await framed(null);
  check('a rotated page offers no scan positions', rotatedPage.fields === 0 && /rotated/.test(rotatedPage.block), JSON.stringify(rotatedPage));
  check('an offset crop offers no scan positions', croppedPage.fields === 0 && /cropped/.test(croppedPage.block), JSON.stringify(croppedPage));
  check('a page scale other than 1 offers no scan positions', scaledPage.fields === 0 && /page scale/.test(scaledPage.block), JSON.stringify(scaledPage));
  check('an ordinary page is not blocked by that gate', plainPageImage.block === '', JSON.stringify(plainPageImage));
  const native = await PDFLib.PDFDocument.create();
  const nativePage = native.addPage([400, 400]);
  const nativeFont = await native.embedFont(PDFLib.StandardFonts.Helvetica);
  nativePage.drawText('Applicant name', { x: 40, y: 80, size: 12, font: nativeFont });
  native.getForm().createTextField('Applicant name').addToPage(nativePage, { x: 40, y: 40, width: 200, height: 18 });
  nativePage.setRotation(PDFLib.degrees(90));
  const nativeRead = await FormFields.read(new Uint8Array(await native.save()));
  check('a rotated page with a real widget still returns that widget', nativeRead.route === 'acro' && nativeRead.fields.length === 1 && !nativeRead.placementBlock, JSON.stringify({ route: nativeRead.route, n: nativeRead.fields.length }));
  out.viewedAudit = { deskew: audit.deskewDeg, fields: audit.fields.map((field) => ({ label: field.label, rect: field.rect })) };

  const overlay = document.createElement('canvas');
  overlay.id = 'overlay';
  overlay.width = 595;
  overlay.height = 834;
  const pen = overlay.getContext('2d');
  const preview = await pdfjsLib.getDocument({ data: auditBytes.slice(0) }).promise;
  const previewPage = await preview.getPage(1);
  const previewView = previewPage.getViewport({ scale: 595 / previewPage.getViewport({ scale: 1 }).width });
  overlay.height = Math.ceil(previewView.height);
  await previewPage.render({ canvasContext: pen, viewport: previewView }).promise;
  pen.strokeStyle = '#0a7a32';
  Object.values(gold).forEach((box) => { pen.strokeRect(box[0], overlay.height - box[1] - box[3], box[2], box[3]); });
  pen.strokeStyle = '#b00020';
  audit.fields.forEach((field) => {
    const rect = field.rect;
    pen.strokeRect(rect.x, overlay.height - rect.y - rect.height, rect.width, rect.height);
  });
  document.body.appendChild(overlay);
  return out;
});

await page.locator('#overlay').screenshot({ path: new URL('./results/screenshots/placement-above-label.png', import.meta.url).pathname });
writeFileSync(new URL('./results/placement-e1.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
const failed = report.checks.filter((item) => !item.ok);
console.log(JSON.stringify({ checks: report.checks, transforms: report.transforms, failed: failed.length }, null, 2));
await browser.close();
if (failed.length) process.exit(1);
