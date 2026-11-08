/** Upright PDF scans keep the original file. A line score may turn a private
 *  copy; a spot is offered only after that copy is mapped back, and only when
 *  the mapped box lands on the original page. Frozen before the run:
 *  a known rule is a hit only when the offered box contains that point within
 *  8 PDF points. A spot somewhere else is a failure. No spot means manual
 *  placement, not a made-up field. The line thresholds are not changed. */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const root = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(root, 'results'), { recursive: true });
const report = { checks: [], limits: [] };
function check(name, ok, detail) {
  report.checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  console.log((ok ? 'ok ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
  return !!ok;
}

const { chromium } = pkg;
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.setDefaultTimeout(40000);
await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await page.waitForFunction(() => window.FormFields && window.FormFrame && window.FormCoords && window.FormSelect);

const round = await page.evaluate(() => {
  function forward(lx, ly, w, h, angle) {
    const rad = angle * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const outW = Math.round(w * Math.abs(cos) + h * Math.abs(sin));
    const outH = Math.round(w * Math.abs(sin) + h * Math.abs(cos));
    const dx = lx - w / 2;
    const dy = ly - h / 2;
    return {
      x: outW / 2 + cos * dx - sin * dy,
      y: outH / 2 + sin * dx + cos * dy,
      outW, outH
    };
  }
  const w = 200;
  const h = 120;
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const c = src.getContext('2d');
  c.fillStyle = '#fff';
  c.fillRect(0, 0, w, h);
  c.fillStyle = '#000';
  c.fillRect(40, 30, 3, 3);
  const cases = [];
  [4, -4].forEach((angle) => {
    const rad = angle * Math.PI / 180;
    const outW = Math.round(w * Math.abs(Math.cos(rad)) + h * Math.abs(Math.sin(rad)));
    const outH = Math.round(w * Math.abs(Math.sin(rad)) + h * Math.abs(Math.cos(rad)));
    const turned = document.createElement('canvas');
    turned.width = outW;
    turned.height = outH;
    const ctx = turned.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.translate(outW / 2, outH / 2);
    ctx.rotate(rad);
    ctx.drawImage(src, -w / 2, -h / 2);
    const data = ctx.getImageData(0, 0, outW, outH).data;
    let n = 0, sx = 0, sy = 0;
    for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
      if (data[(y * outW + x) * 4] < 40) { n++; sx += x; sy += y; }
    }
    const back = FormFrame.turnToInput(sx / n, sy / n, { angle, inW: w, inH: h, turnW: outW, turnH: outH });
    const grown = forward(40, 30, w, h, angle);
    cases.push({
      angle, outW, outH, grown: outW > w && outH > h,
      errX: Math.abs(back.x - 41.5), errY: Math.abs(back.y - 31.5),
      forward: grown
    });
  });
  return cases;
});
check('a turned dot comes back within 2px, including the opposite sign and the grown canvas', round.every((item) => item.errX < 2 && item.errY < 2 && item.grown), JSON.stringify(round));

const built = await page.evaluate(async () => {
  function drawLevel() {
    const canvas = document.createElement('canvas');
    canvas.width = 500;
    canvas.height = 700;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 500, 700);
    ctx.fillStyle = '#111';
    ctx.font = '32px Helvetica, Arial, sans-serif';
    ctx.fillText('Email', 36, 200);
    ctx.fillRect(40, 220, 420, 4);
    ctx.fillText('Name', 36, 300);
    ctx.fillRect(40, 320, 420, 4);
    return canvas;
  }
  function rotateBitmap(src, angle) {
    const rad = angle * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const outW = Math.round(src.width * Math.abs(cos) + src.height * Math.abs(sin));
    const outH = Math.round(src.width * Math.abs(sin) + src.height * Math.abs(cos));
    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.translate(outW / 2, outH / 2);
    ctx.rotate(rad);
    ctx.drawImage(src, -src.width / 2, -src.height / 2);
    return out;
  }
  function pngBytes(canvas) {
    const bin = atob(canvas.toDataURL('image/png').split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function ruleOnPage(canvasY, pageH) {
    return { x: 250, y: pageH - (canvasY + 2), canvasY };
  }
  const level = drawLevel();
  const tilt = rotateBitmap(level, 5);
  const other = rotateBitmap(level, -5);
  const levelRule = ruleOnPage(220, 700);
  const font = null;
  async function pageOf(doc, canvas, mark) {
    const sheet = doc.addPage([canvas.width, canvas.height]);
    const image = await doc.embedPng(pngBytes(canvas));
    sheet.drawImage(image, { x: 0, y: 0, width: canvas.width, height: canvas.height });
    const face = font || await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    sheet.drawText(mark, { x: 8, y: 8, size: 8, font: face, color: PDFLib.rgb(1, 1, 1) });
    return sheet;
  }
  const doc = await PDFLib.PDFDocument.create();
  await pageOf(doc, level, 'ORIG-P1');
  await pageOf(doc, tilt, 'ORIG-P2');
  const multi = Array.from(new Uint8Array(await doc.save()));
  const one = await PDFLib.PDFDocument.create();
  await pageOf(one, other, 'ORIG-NEG');
  const negative = Array.from(new Uint8Array(await one.save()));
  const gold = drawLevel();
  async function pack(mutate) {
    const packed = await PDFLib.PDFDocument.create();
    const sheet = packed.addPage([612, 792]);
    const image = await packed.embedPng(pngBytes(gold));
    sheet.drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
    if (mutate) await mutate(sheet, packed);
    const face = await packed.embedFont(PDFLib.StandardFonts.Helvetica);
    sheet.drawText('ORIG', { x: 8, y: 8, size: 8, font: face, color: PDFLib.rgb(1, 1, 1) });
    return Array.from(new Uint8Array(await packed.save()));
  }
  const upright = await pack();
  const unit2 = await pack((sheet) => sheet.node.set(PDFLib.PDFName.of('UserUnit'), PDFLib.PDFNumber.of(2)));
  const offset = await (async () => {
    const packed = await PDFLib.PDFDocument.create();
    const sheet = packed.addPage([680, 880]);
    sheet.setCropBox(36, 44, 612, 792);
    const image = await packed.embedPng(pngBytes(gold));
    sheet.drawImage(image, { x: 36, y: 44, width: 612, height: 792 });
    return Array.from(new Uint8Array(await packed.save()));
  })();
  const sideways = await pack((sheet) => sheet.setRotation(PDFLib.degrees(90)));
  const reference = await (async () => {
    const packed = await PDFLib.PDFDocument.create();
    const sheet = packed.addPage([612, 792]);
    const face = await packed.embedFont(PDFLib.StandardFonts.Helvetica);
    sheet.drawText('Applicant', { x: 72, y: 720, size: 16, font: face });
    sheet.drawText('Email: ada.gold@example.com', { x: 72, y: 680, size: 14, font: face });
    sheet.drawText('Name: Ada Gold', { x: 72, y: 650, size: 14, font: face });
    sheet.drawText('Spouse', { x: 72, y: 600, size: 16, font: face });
    sheet.drawText('Email: bea.gold@example.com', { x: 72, y: 560, size: 14, font: face });
    return Array.from(new Uint8Array(await packed.save()));
  })();
  const solo = await (async () => {
    const packed = await PDFLib.PDFDocument.create();
    const sheet = packed.addPage([612, 792]);
    const face = await packed.embedFont(PDFLib.StandardFonts.Helvetica);
    sheet.drawText('Applicant', { x: 72, y: 720, size: 16, font: face });
    sheet.drawText('Email: ada.gold@example.com', { x: 72, y: 680, size: 14, font: face });
    sheet.drawText('Name: Ada Gold', { x: 72, y: 650, size: 14, font: face });
    return Array.from(new Uint8Array(await packed.save()));
  })();
  return {
    multi, negative, upright, unit2, offset, sideways, reference, solo,
    known: {
      level: { w: 500, h: 700, email: levelRule, name: ruleOnPage(320, 700) },
      tilt: { w: tilt.width, h: tilt.height, angle: 5 },
      other: { w: other.width, h: other.height, angle: -5 }
    }
  };
});

function containsPoint(field, pageW, pageH, point, pad) {
  if (!field || !field.rect) return false;
  const x0 = field.rect.x / field.pw * pageW - pad;
  const x1 = (field.rect.x + field.rect.width) / field.pw * pageW + pad;
  const y0 = field.rect.y / field.ph * pageH - pad;
  const y1 = (field.rect.y + field.rect.height) / field.ph * pageH + pad;
  return point.x >= x0 && point.x <= x1 && point.y >= y0 && point.y <= y1;
}

async function inspect(list) {
  return page.evaluate(async (bytes) => {
    const read = await FormFields.read(new Uint8Array(bytes));
    return {
      route: read.route,
      block: read.placementBlock || '',
      replaced: !!(read.bytes && read.bytes.length),
      deskew: read.deskewDeg || 0,
      transport: read.reviewTransport || null,
      fields: (read.fields || []).map((field) => ({
        label: field.label || '',
        page: field.page || 0,
        transport: field.transport || '',
        detectAngle: field.detectAngle || 0,
        rect: field.rect,
        pw: field.pageWidth,
        ph: field.pageHeight
      }))
    };
  }, list);
}

const levelRead = await inspect(built.upright);
const levelEmail = levelRead.fields.find((field) => field.page === 0 && /email/i.test(field.label));
function centerPdf(field, pageW, pageH) {
  return {
    x: (field.rect.x + field.rect.width / 2) / field.pw * pageW,
    y: (field.rect.y + field.rect.height / 2) / field.ph * pageH
  };
}
const emailRule = { x: 250 / 500 * 612, y: 792 - (222 / 700 * 792) };
const nameRule = { x: 250 / 500 * 612, y: 792 - (322 / 700 * 792) };
const levelCenter = levelEmail ? centerPdf(levelEmail, 612, 792) : null;
const nearerEmail = levelCenter && Math.hypot(levelCenter.x - emailRule.x, levelCenter.y - emailRule.y) + 40 < Math.hypot(levelCenter.x - nameRule.x, levelCenter.y - nameRule.y);
check(
  'a level upright scan keeps the original file, does not turn, and the email spot is nearer the email rule than the name rule',
  !levelRead.replaced && levelRead.deskew === 0 && !!nearerEmail,
  JSON.stringify({ route: levelRead.route, deskew: levelRead.deskew, levelCenter, emailRule, nameRule })
);

function forwardPoint(lx, ly, w, h, angle) {
  const rad = angle * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const outW = Math.round(w * Math.abs(cos) + h * Math.abs(sin));
  const outH = Math.round(w * Math.abs(sin) + h * Math.abs(cos));
  const dx = lx - w / 2;
  const dy = ly - h / 2;
  return { x: outW / 2 + cos * dx - sin * dy, y: outH - (outH / 2 + sin * dx + cos * dy), outW, outH };
}
const tiltedRule = forwardPoint(250, 222, 500, 700, 5);
const negativeRule = forwardPoint(250, 222, 500, 700, -5);
const multi = await inspect(built.multi);
const page0 = multi.fields.filter((field) => field.page === 0 && /email/i.test(field.label));
const page1 = multi.fields.filter((field) => field.page === 1 && /email/i.test(field.label));
function emailHit(fields, pageW, pageH, point) {
  return fields.some((field) => containsPoint(field, pageW, pageH, point, 8));
}
function centerDist(field, pageW, pageH, point) {
  const cx = (field.rect.x + field.rect.width / 2) / field.pw * pageW;
  const cy = (field.rect.y + field.rect.height / 2) / field.ph * pageH;
  return Math.hypot(cx - point.x, cy - point.y);
}
const levelKnown = { x: 250, y: 700 - 222 };
const multiAngles = (multi.transport && multi.transport.angles) || [];
const angle0 = multiAngles.find((item) => item.page === 0);
const angle1 = multiAngles.find((item) => item.page === 1);
check(
  'page 1 is turned the other way from a +5 degree raster, and its spot contains that tilted rule within 8pt',
  !multi.replaced && angle0 && angle0.angle === 0 && angle1 && angle1.angle < -0.5
    && emailHit(page1, tiltedRule.outW, tiltedRule.outH, { x: tiltedRule.x, y: tiltedRule.y }),
  JSON.stringify({ angles: multiAngles, tiltedRule, page1: page1[0] })
);

const negative = await inspect(built.negative);
const negEmail = negative.fields.find((field) => /email/i.test(field.label));
const negHit = negEmail ? containsPoint(negEmail, negativeRule.outW, negativeRule.outH, { x: negativeRule.x, y: negativeRule.y }, 8) : false;
check(
  'a -5 degree raster is mapped back onto the original page within 8pt, and the file is not replaced',
  !negative.replaced && negative.deskew > 0.5 && !!negHit && negEmail.transport === 'viewport-review',
  JSON.stringify({ route: negative.route, deskew: negative.deskew, negHit, negativeRule, field: negEmail })
);

const unit2 = await inspect(built.unit2);
const offset = await inspect(built.offset);
const sideways = await inspect(built.sideways);
check(
  'UserUnit, an offset crop, and a quarter turn keep the ledger path and the original file',
  !unit2.replaced && unit2.route === 'raster-review'
    && !offset.replaced && offset.route === 'raster-review'
    && !sideways.replaced && sideways.fields.length === 0 && /not turned/i.test(sideways.block),
  JSON.stringify({
    unit2: { route: unit2.route, n: unit2.fields.length },
    offset: { route: offset.route, n: offset.fields.length },
    sideways: { n: sideways.fields.length, block: sideways.block }
  })
);

const people = await page.evaluate(async (list) => {
  const read = await FormFields.read(new Uint8Array(list));
  const notes = 'Applicant\nEmail: ada.gold@example.com\nName: Ada Gold\n\nSpouse\nEmail: bea.gold@example.com\n';
  const decisions = FormSelect.decideAll(read.fields, notes, FormThresholds, { channel: 'text-layer' });
  return {
    decisions: decisions.map((row) => ({ kind: row.kind, decision: row.decision, value: row.value })),
    scan: read.fields.filter((field) => field.transport === 'viewport-review').map((field) => field.label)
  };
}, built.negative);
const noAuto = people.decisions.every((row) => row.decision !== 'autofill');
const noBea = people.decisions.every((row) => !/bea\.gold/i.test(row.value || ''));
check('reference text does not autofill a tilted scan spot, and the other person is not chosen', noAuto && noBea, JSON.stringify(people));

await page.evaluate(async () => {
  await FormProfiles.clearAll();
  const loaded = await FormProfiles.load();
  loaded.vault.profiles.push({ id: 'ada', name: 'Ada Raster', createdAt: '', updatedAt: '', facts: [
    { id: 'e', key: 'email', label: 'email', value: 'ada.gold@example.com', status: 'confirmed', origin: 'user', quote: '', updatedAt: '' }
  ] });
  await FormProfiles.persist(loaded.vault);
});
await page.setInputFiles('#formInput', { name: 'tilt-scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from(built.negative) });
await page.waitForFunction(() => {
  const status = document.getElementById('readStatus').textContent || '';
  return /tilted|scan estimates|No lines were found|Form ready/i.test(status);
}, null, { timeout: 30000 });
const opened = await page.evaluate(async () => {
  const status = document.getElementById('readStatus').textContent || '';
  return { status, review: !document.getElementById('scanReview').hidden };
});
await page.setInputFiles('#refInput', { name: 'note.pdf', mimeType: 'application/pdf', buffer: Buffer.from(built.solo) });
await page.waitForFunction(() => !document.getElementById('fillBtn').disabled, null, { timeout: 20000 });
await page.click('#fillBtn');
await page.locator('#reviewBox').waitFor({ state: 'visible', timeout: 20000 });
const boxes = page.locator('#reviewList input[type="checkbox"]');
const count = await boxes.count();
let checkedEmail = false;
let checkedName = false;
for (let i = 0; i < count; i++) {
  const text = await boxes.nth(i).locator('xpath=..').innerText();
  if (/email/i.test(text) && /ada\.gold@example.com/.test(text)) {
    await boxes.nth(i).check();
    checkedEmail = true;
  }
}
check('the reference value is offered for review and is not written before it is checked', checkedEmail && count >= 1, String(count));
await page.click('#reviewUse');
await page.waitForURL(/pdf-editor/);
await page.locator('.ann').waitFor();
const ann = await page.evaluate(() => {
  const el = document.querySelector('.ann');
  return el ? {
    text: document.querySelector('.ann-body').textContent,
    x: parseFloat(el.style.left) / 100,
    y: parseFloat(el.style.top) / 100,
    w: parseFloat(el.style.width) / 100,
    h: parseFloat(el.style.height) / 100,
    fontSize: Number(el.dataset.fontSize) || 12
  } : null;
});
const dl = page.waitForEvent('download');
await page.click('#downloadBtn');
await page.locator('#sizeOptions button[data-level="100"]:not([disabled])').waitFor({ timeout: 20000 });
await page.click('#sizeOptions button[data-level="100"]');
const file = await dl;
const out = '/tmp/ff-raster-export.pdf';
await file.saveAs(out);
const rendered = await page.evaluate(async (list) => {
  const data = new Uint8Array(list);
  const pdf = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
  const pg = await pdf.getPage(1);
  const items = (await pg.getTextContent()).items;
  const text = items.map((item) => item.str).join(' ');
  const hit = items.find((item) => /ada\.gold@example.com/.test(item.str));
  const view = pg.getViewport({ scale: 1 });
  return { text, glyph: hit ? { x: hit.transform[4], y: hit.transform[5] } : null, w: view.width, h: view.height };
}, Array.from(readFileSync(out)));
const expected = ann ? {
  x: ann.x * rendered.w + 1,
  y: (1 - ann.y) * rendered.h - ann.fontSize * 0.85
} : null;
const formulaErr = expected && rendered.glyph ? Math.hypot(rendered.glyph.x - expected.x, rendered.glyph.y - expected.y) : 99;
const boxHoldsRule = ann ? (
  negativeRule.x >= ann.x * rendered.w - 8
  && negativeRule.x <= (ann.x + ann.w) * rendered.w + 8
  && negativeRule.y >= (1 - (ann.y + ann.h)) * rendered.h - 8
  && negativeRule.y <= (1 - ann.y) * rendered.h + 8
) : false;
check(
  'the original page text remains, the unchecked name is absent, and the checked glyph is on the known tilted rule',
  /ORIG-NEG/.test(rendered.text) && !/Ada Gold/.test(rendered.text) && !/bea\.gold/i.test(rendered.text) && formulaErr < 1.5 && boxHoldsRule,
  JSON.stringify({ opened, formulaErr, boxHoldsRule, ann, glyph: rendered.glyph, negativeRule, text: rendered.text.slice(0, 200) })
);

report.failed = report.checks.filter((item) => !item.ok).length;
writeFileSync(join(root, 'results/pdf-raster-geometry.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log('failed', report.failed);
if (report.failed) process.exit(1);
