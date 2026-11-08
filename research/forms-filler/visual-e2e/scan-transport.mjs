/** Review-only transport of unchanged scan spots through the coordinate ledger.
 *  Gates are fixed below. The fresh layout runs only after the gold checks pass.
 *  Fixture variants of the gold form are coordinate regressions, not new audits. */
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const { chromium } = pkg;
const root = dirname(fileURLToPath(import.meta.url));
const shot = join(root, 'results/screenshots');
const art = '/opt/cursor/artifacts';
mkdirSync(shot, { recursive: true });
mkdirSync(art, { recursive: true });

const GATES = {
  transport: 'quarter-turn rotation, finite CropBox, UserUnit in (0, 75000] matching this pdf.js',
  refuseWithoutDetector: ['rotation other than 0/90/180/270', 'UserUnit missing, non-positive, or not matching the reader', 'crop width or height not positive'],
  abstainInsteadOfTurning: 'bestLineAngle other than 0, or no detector spot on the unturned viewport',
  autofill: 'off for transported spots; ocrAutofill and line thresholds are not edited',
  uprightPath: 'rotation 0, crop equal to media, UserUnit 1 stays on the existing raster path'
};

const report = {
  gates: GATES,
  baseline: {
    parent: 'dc1fdcb',
    rot90ms: 254,
    cropms: 245,
    unit2ms: 246,
    rot45ms: 244,
    unit0ms: 2378,
    unit0note: 'UserUnit 0 was not refused. pdf.js reported 1, so the detector ran and returned 2 spots.',
    uprightms: 2445,
    uprightLabels: ['Email', 'Name']
  },
  checks: [],
  cases: [],
  limits: []
};
function check(name, ok, detail) {
  report.checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  console.log((ok ? 'ok ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
  return !!ok;
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await page.waitForFunction(() => window.FormFields && window.FormCoords && window.FormSelect && window.FormEvidence);

const built = await page.evaluate(async () => {
  function pngOf(draw) {
    const canvas = document.createElement('canvas');
    canvas.width = 612;
    canvas.height = 792;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 612, 792);
    ctx.fillStyle = '#111';
    ctx.font = '28px Helvetica, Arial, sans-serif';
    draw(ctx);
    const bin = atob(canvas.toDataURL('image/png').split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  const goldPng = pngOf((ctx) => {
    ctx.fillText('Email', 48, 180);
    ctx.fillText('Name', 48, 280);
    ctx.fillRect(180, 186, 320, 3);
    ctx.fillRect(180, 286, 320, 3);
  });
  const freshPng = pngOf((ctx) => {
    ctx.font = '32px Helvetica, Arial, sans-serif';
    ctx.fillText('Ward list', 48, 90);
    ctx.font = '28px Helvetica, Arial, sans-serif';
    ctx.fillText('Phone', 48, 390);
    ctx.fillRect(48, 410, 200, 3);
    ctx.fillText('City', 360, 640);
    ctx.fillRect(360, 590, 180, 3);
  });
  async function pack(png, mutate) {
    const doc = await PDFLib.PDFDocument.create();
    const sheet = doc.addPage([612, 792]);
    const image = await doc.embedPng(png);
    sheet.drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
    if (mutate) await mutate(sheet, doc, image);
    return Array.from(new Uint8Array(await doc.save()));
  }
  const upright = await pack(goldPng);
  const unit2 = await pack(goldPng, (sheet) => {
    sheet.node.set(PDFLib.PDFName.of('UserUnit'), PDFLib.PDFNumber.of(2));
  });
  const offset = await (async () => {
    const doc = await PDFLib.PDFDocument.create();
    const sheet = doc.addPage([680, 880]);
    const image = await doc.embedPng(goldPng);
    sheet.setMediaBox(0, 0, 680, 880);
    sheet.setCropBox(36, 44, 612, 792);
    sheet.drawImage(image, { x: 36, y: 44, width: 612, height: 792 });
    return Array.from(new Uint8Array(await doc.save()));
  })();
  const rot90 = await (async () => {
    const doc = await PDFLib.PDFDocument.create();
    const sheet = doc.addPage([792, 612]);
    sheet.setRotation(PDFLib.degrees(90));
    const image = await doc.embedPng(goldPng);
    sheet.drawImage(image, { x: 792, y: 0, width: 612, height: 792, rotate: PDFLib.degrees(90) });
    return Array.from(new Uint8Array(await doc.save()));
  })();
  const sideways = await pack(goldPng, (sheet) => sheet.setRotation(PDFLib.degrees(90)));
  const rot45 = await pack(goldPng, (sheet) => sheet.node.set(PDFLib.PDFName.of('Rotate'), PDFLib.PDFNumber.of(45)));
  const unit0 = await pack(goldPng, (sheet) => sheet.node.set(PDFLib.PDFName.of('UserUnit'), PDFLib.PDFNumber.of(0)));
  const fresh = await (async () => {
    const doc = await PDFLib.PDFDocument.create();
    const sheet = doc.addPage([680, 880]);
    const image = await doc.embedPng(freshPng);
    sheet.setCropBox(36, 44, 612, 792);
    sheet.drawImage(image, { x: 36, y: 44, width: 612, height: 792 });
    return Array.from(new Uint8Array(await doc.save()));
  })();
  const widget = await (async () => {
    const doc = await PDFLib.PDFDocument.create();
    const sheet = doc.addPage([612, 792]);
    const field = doc.getForm().createTextField('office.email');
    field.addToPage(sheet, { x: 72, y: 700, width: 180, height: 18 });
    return Array.from(new Uint8Array(await doc.save()));
  })();
  const reference = await (async () => {
    const doc = await PDFLib.PDFDocument.create();
    const sheet = doc.addPage([612, 792]);
    const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    sheet.drawText('Applicant', { x: 72, y: 720, size: 16, font });
    sheet.drawText('Email: ada.gold@example.com', { x: 72, y: 680, size: 14, font });
    sheet.drawText('Name: Ada Gold', { x: 72, y: 650, size: 14, font });
    return Array.from(new Uint8Array(await doc.save()));
  })();
  return { upright, unit2, offset, rot90, sideways, rot45, unit0, fresh, widget, reference };
});

function bytes(list) { return Buffer.from(list); }
const files = {
  upright: bytes(built.upright),
  unit2: bytes(built.unit2),
  offset: bytes(built.offset),
  rot90: bytes(built.rot90),
  sideways: bytes(built.sideways),
  rot45: bytes(built.rot45),
  unit0: bytes(built.unit0),
  fresh: bytes(built.fresh),
  widget: bytes(built.widget),
  reference: bytes(built.reference)
};
report.hashes = {};
Object.keys(files).forEach((name) => {
  report.hashes[name] = createHash('sha256').update(files[name]).digest('hex');
});

async function inspect(name, buf) {
  return page.evaluate(async ({ list, name }) => {
    const data = new Uint8Array(list);
    const t0 = performance.now();
    const read = await FormFields.read(data);
    const ms = Math.round(performance.now() - t0);
    return {
      name,
      ms,
      route: read.route,
      block: read.placementBlock || '',
      n: (read.fields || []).length,
      transport: read.reviewTransport || null,
      fields: (read.fields || []).map((field) => ({
        label: field.label,
        kind: window.FormEvidence ? FormEvidence.fieldKind(field) : '',
        untrusted: !!field.untrusted,
        transport: field.transport || '',
        page: field.page,
        x: field.rect && field.rect.x,
        y: field.rect && field.rect.y,
        w: field.rect && field.rect.width,
        h: field.rect && field.rect.height,
        pw: field.pageWidth,
        ph: field.pageHeight
      }))
    };
  }, { list: Array.from(buf), name });
}

function labelsOf(row) {
  return row.fields.map((field) => field.label).sort();
}
function stacked(row) {
  const email = row.fields.find((field) => /email/i.test(field.label || ''));
  const name = row.fields.find((field) => /^name$/i.test(field.label || ''));
  return !!(email && name && email.kind === 'email' && name.kind === 'name' && email.y > name.y);
}

const upright = await inspect('upright', files.upright);
report.cases.push(upright);
check('upright unit page stays on the existing raster path', upright.route === 'raster' && upright.n === 2 && stacked(upright) && !upright.fields.some((field) => field.transport), JSON.stringify({ route: upright.route, labels: labelsOf(upright), ms: upright.ms }));

const unit2 = await inspect('unit2', files.unit2);
report.cases.push(unit2);
let goldOk = check('UserUnit 2 transports the same Email and Name spots for review', unit2.route === 'raster-review' && stacked(unit2) && unit2.fields.every((field) => field.transport === 'viewport-review'), JSON.stringify({ route: unit2.route, labels: labelsOf(unit2), ms: unit2.ms, block: unit2.block }));

const offset = await inspect('offset', files.offset);
report.cases.push(offset);
goldOk = check('an offset crop transports the same spots for review', offset.route === 'raster-review' && stacked(offset), JSON.stringify({ route: offset.route, labels: labelsOf(offset), ms: offset.ms, block: offset.block })) && goldOk;

const rot90 = await inspect('rot90', files.rot90);
report.cases.push(rot90);
const rot90Pass = rot90.route === 'raster-review' && stacked(rot90);
const rot90Abstain = rot90.n === 0 && /not turned/i.test(rot90.block);
goldOk = check('a view-upright 90 degree page transports the spots or abstains without turning', rot90Pass || rot90Abstain, JSON.stringify({ route: rot90.route, labels: labelsOf(rot90), ms: rot90.ms, block: rot90.block })) && goldOk;

const sideways = await inspect('sideways', files.sideways);
report.cases.push(sideways);
goldOk = check('a sideways page is not turned and gains no scan spot', sideways.n === 0 && /not turned/i.test(sideways.block), JSON.stringify({ ms: sideways.ms, block: sideways.block, transport: sideways.transport })) && goldOk;

const rot45 = await inspect('rot45', files.rot45);
report.cases.push(rot45);
goldOk = check('a 45 degree page stays refused before a detector look', rot45.n === 0 && /rotated/i.test(rot45.block) && rot45.ms < 800 && !(rot45.transport && rot45.transport.looked), JSON.stringify({ ms: rot45.ms, block: rot45.block })) && goldOk;

const unit0 = await inspect('unit0', files.unit0);
report.cases.push(unit0);
goldOk = check('a non-positive UserUnit stays refused before a detector look', unit0.n === 0 && /scale/i.test(unit0.block) && unit0.ms < 800 && !(unit0.transport && unit0.transport.looked), JSON.stringify({ ms: unit0.ms, block: unit0.block })) && goldOk;

const widget = await inspect('widget', files.widget);
report.cases.push(widget);
goldOk = check('a native widget is unchanged and not a scan estimate', widget.route === 'acro' && widget.n === 1 && !widget.transport, JSON.stringify({ route: widget.route, n: widget.n })) && goldOk;

const people = await page.evaluate(async ({ list, notes }) => {
  const read = await FormFields.read(new Uint8Array(list));
  const two = 'Applicant\nEmail: ada.gold@example.com\nName: Ada Gold\n\nSpouse\nName: Bea Gold\nEmail: bea.gold@example.com\n';
  const decisions = FormSelect.decideAll(read.fields, two, FormThresholds, { channel: 'text-layer' });
  return decisions.map((row) => ({ kind: row.kind, decision: row.decision, value: row.value, reason: row.reason }));
}, { list: Array.from(files.unit2), notes: '' });
report.cases.push({ name: 'two-person', people });
goldOk = check('two people on an unspecified line abstain instead of confirming the wrong person', people.every((row) => row.decision === 'abstain' && !/bea\.gold/i.test(row.value || '')), JSON.stringify(people)) && goldOk;

if (!goldOk) {
  report.stopped = 'Gold transport failed. The fresh layout was not opened.';
  writeFileSync(join(root, 'results/scan-transport.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(report.stopped);
  await browser.close();
  process.exit(1);
}

await page.setInputFiles('#formInput', { name: 'unit2-form.pdf', mimeType: 'application/pdf', buffer: files.unit2 });
await page.locator('#scanReview').waitFor({ state: 'visible', timeout: 20000 });
const preview = await page.locator('#scanReview').innerText();
const closed = await page.locator('#profileBox').isHidden();
check('the destination preview names the label, the binding, the estimate, and that value and person are open', /Label read: Email/.test(preview) && /Label read: Name/.test(preview) && /Binding: email/.test(preview) && /scan estimate/.test(preview) && /not a form widget/i.test(preview) && /Value: not chosen/.test(preview) && /Person: not confirmed/.test(preview), preview);
check('saved values stay collapsed while the estimates are shown', closed);
await page.screenshot({ path: join(shot, 'scan-review-estimates.png') });

await page.setInputFiles('#refInput', { name: 'applicant-note.pdf', mimeType: 'application/pdf', buffer: files.reference });
await page.waitForFunction(() => !document.getElementById('fillBtn').disabled, null, { timeout: 20000 });
await page.click('#fillBtn');
await page.locator('#reviewBox').waitFor({ state: 'visible', timeout: 20000 });
const reviewText = await page.locator('#reviewBox').innerText();
check('review shows an unconfirmed value, the person, the label binding, and the location', /Value not confirmed: email ada\.gold@example.com/.test(reviewText) && /Person on the paper: applicant/.test(reviewText) && /Label binding: Email as email/.test(reviewText) && /scan estimate/.test(reviewText) && !/bea\.gold/i.test(reviewText), reviewText);
const boxes = page.locator('#reviewList input[type="checkbox"]');
const count = await boxes.count();
for (let i = 0; i < count; i++) {
  const text = await boxes.nth(i).locator('xpath=..').innerText();
  if (/email ada\.gold@example.com/.test(text)) await boxes.nth(i).check();
}
await page.click('#reviewUse');
await page.waitForURL(/pdf-editor/, { timeout: 20000 });
await page.locator('.ann').waitFor();
const editor = await page.evaluate(() => ({
  n: document.querySelectorAll('.ann').length,
  text: Array.from(document.querySelectorAll('.ann-body')).map((node) => node.innerText),
  recover: document.getElementById('recoverBar').hidden,
  map: document.getElementById('mapBox').hidden,
  textTool: !document.getElementById('addText').hidden,
  ann: Array.from(document.querySelectorAll('.ann')).map((el) => ({
    x: parseFloat(el.style.left) / 100,
    y: parseFloat(el.style.top) / 100,
    w: parseFloat(el.style.width) / 100,
    h: parseFloat(el.style.height) / 100,
    fontSize: Number(el.dataset.fontSize)
  }))
}));
check('only the checked email is carried, and the extra panels stay closed', editor.n === 1 && editor.text.some((item) => item.includes('ada.gold@example.com')) && !editor.text.some((item) => /Ada Gold|bea/i.test(item)) && editor.recover && editor.map && editor.textTool, JSON.stringify(editor));

const placed = await page.evaluate(async ({ list, ann }) => {
  const data = new Uint8Array(list);
  const doc = await PDFLib.PDFDocument.load(data.slice(0));
  const lib = doc.getPages()[0];
  const pdf = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
  const js = await pdf.getPage(1);
  const frame = FormCoords.frameOf(lib, js, 0);
  const origin = FormCoords.textOrigin(ann, frame.crop, frame.rotation, ann.fontSize || 12);
  const view = js.getViewport({ scale: 1 });
  const back = view.convertToPdfPoint(ann.x * view.width, ann.y * view.height);
  const got = FormCoords.fractionToPdf(ann.x, ann.y, frame.crop, frame.rotation);
  return {
    frameOk: frame.ok,
    userUnit: frame.userUnit,
    rotation: frame.rotation,
    crop: frame.crop,
    origin,
    cornerDx: Math.abs(got.x - back[0]),
    cornerDy: Math.abs(got.y - back[1])
  };
}, { list: Array.from(files.unit2), ann: editor.ann[0] });
check('the stored fraction matches the ledger corner, not a raw pixel used as a PDF point', placed.frameOk && placed.userUnit === 2 && placed.cornerDx < 0.05 && placed.cornerDy < 0.05, JSON.stringify(placed));

const downloadPromise = page.waitForEvent('download');
await page.click('#downloadBtn');
await page.locator('#sizeOptions button[data-level="100"]:not([disabled])').waitFor({ timeout: 20000 });
await page.click('#sizeOptions button[data-level="100"]');
const download = await downloadPromise;
const exportPath = join(root, 'results/scan-transport-export.pdf');
await download.saveAs(exportPath);
const exportBytes = (await import('fs')).readFileSync(exportPath);
const exportScore = await page.evaluate(async ({ list, origin }) => {
  const data = new Uint8Array(list);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pg = await pdf.getPage(1);
  const content = await pg.getTextContent();
  const hit = content.items.find((item) => /ada\.gold@example.com/i.test(item.str));
  const view = pg.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(view.width);
  canvas.height = Math.ceil(view.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pg.render({ canvasContext: ctx, viewport: view }).promise;
  const dx = hit ? Math.abs(hit.transform[4] - origin.x) : null;
  const dy = hit ? Math.abs(hit.transform[5] - origin.y) : null;
  const spot = hit ? pg.getViewport({ scale: 1 }).convertToViewportPoint(hit.transform[4], hit.transform[5]) : null;
  const emailY = 186 / 792 * view.height;
  const nameY = 286 / 792 * view.height;
  const nearerEmail = spot ? Math.abs(spot[1] * 2 - emailY) < Math.abs(spot[1] * 2 - nameY) : false;
  return {
    dx, dy, spot, nearerEmail,
    other: content.items.some((item) => /Ada Gold|bea\.gold/i.test(item.str)),
    png: canvas.toDataURL('image/png')
  };
}, { list: Array.from(exportBytes), origin: placed.origin });
report.export = { dx: exportScore.dx, dy: exportScore.dy, nearerEmail: exportScore.nearerEmail, other: exportScore.other };
check('the exported email sits on the email line in user units and not on the name line', exportScore.dx != null && exportScore.dx < 1.5 && exportScore.dy < 1.5 && exportScore.nearerEmail && !exportScore.other, JSON.stringify(report.export));
const png = Buffer.from(exportScore.png.split(',')[1], 'base64');
writeFileSync(join(shot, 'scan-review-export.png'), png);
copyFileSync(join(shot, 'scan-review-estimates.png'), join(art, 'scan-review-estimates.png'));
copyFileSync(join(shot, 'scan-review-export.png'), join(art, 'scan-review-export.png'));

await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await page.waitForFunction(() => window.FormFields);
const fresh = await inspect('fresh', files.fresh);
report.fresh = fresh;
const phone = fresh.fields.find((field) => /phone/i.test(field.label || ''));
const city = fresh.fields.find((field) => /city/i.test(field.label || ''));
const freshMiss = fresh.fields.filter((field) => !/phone|city/i.test(field.label || ''));
report.freshVerdict = {
  phone: !!phone,
  city: !!city,
  otherLabels: freshMiss.map((field) => field.label),
  abstained: fresh.n === 0,
  ms: fresh.ms
};
check('the new layout was looked at once and is not claimed beyond its raw labels', true, JSON.stringify(report.freshVerdict));
if (fresh.n === 0) report.limits.push('The new ward-list layout produced no detector position on an offset crop. The refusal stays. That is not coverage.');
else if (!phone || !city || freshMiss.length) report.limits.push('The new layout did not bind both Phone and City. Raw labels: ' + labelsOf(fresh).join(', ') + '. No threshold was changed.');
else report.limits.push('The new layout bound Phone and City on one offset-crop look. That is one page, not a rate.');

report.pdfjsVersion = await page.evaluate(() => pdfjsLib.version || '');
report.failed = report.checks.filter((item) => !item.ok).length;
report.limits.push('Latency figures are script wall clocks for these pages. They are not a reliability rate.');
report.limits.push('No phone was used. Chrome 156 Load unpacked was not clicked again.');
writeFileSync(join(root, 'results/scan-transport.json'), JSON.stringify(report, null, 2) + '\n');
await browser.close();
console.log('failed', report.failed, 'of', report.checks.length);
if (report.failed) process.exit(1);
