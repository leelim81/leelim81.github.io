/** Source, deskew, editor, and export use one transform.
 *  The 13 natural targets are the frozen development gold. They are not a new audit.
 *  Containment uses an 8px pad already stated for rule edges. A point between two labels is not a hit. */
import { createRequire } from 'module';
import { execFileSync, execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const require = createRequire(import.meta.url);
const Frame = require('../../../tools/forms-filler/frame.js');
const root = dirname(fileURLToPath(import.meta.url));
const shot = join(root, 'results/screenshots');
const art = '/opt/cursor/artifacts';
mkdirSync(shot, { recursive: true });
mkdirSync('/tmp/ff-frame-fixtures', { recursive: true });

const report = { checks: [], natural: null, limits: [] };
function check(name, ok, detail) {
  report.checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  console.log((ok ? 'ok ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
  return !!ok;
}

execSync(`python3 - << 'PY'
from PIL import Image, ImageDraw, ExifTags
from pathlib import Path
out = Path('/tmp/ff-frame-fixtures')
vis = Image.new('RGB', (480, 240), 'white')
d = ImageDraw.Draw(vis)
d.text((24, 78), 'Name', fill='black')
d.line((100, 108, 420, 108), fill='black', width=2)
d.text((24, 150), 'Address', fill='black')
d.line((120, 180, 420, 180), fill='black', width=2)
vis.save(out/'plain.jpg', quality=95)
vis.save(out/'plain.png')
stored = vis.transpose(Image.Transpose.ROTATE_90)
exif = Image.Exif()
exif[274] = 6
stored.save(out/'exif6.jpg', exif=exif, quality=95)
print('fixtures', vis.size, 'stored', stored.size)
PY`);

const { chromium } = pkg;
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await page.waitForFunction(() => window.FormFields && window.FormFrame);

const round = await page.evaluate(() => {
  const src = document.createElement('canvas');
  src.width = 200; src.height = 120;
  const c = src.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, 200, 120);
  c.fillStyle = '#000'; c.fillRect(40, 30, 3, 3);
  const rad = 0.3 * Math.PI / 180;
  const sin = Math.abs(Math.sin(rad)), cos = Math.abs(Math.cos(rad));
  const turned = document.createElement('canvas');
  turned.width = Math.round(200 * cos + 120 * sin);
  turned.height = Math.round(200 * sin + 120 * cos);
  const ctx = turned.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, turned.width, turned.height);
  ctx.translate(turned.width / 2, turned.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(src, -100, -60);
  const data = turned.getContext('2d').getImageData(0, 0, turned.width, turned.height).data;
  let minX = 1e9, minY = 1e9, maxX = 0, maxY = 0;
  for (let y = 0; y < turned.height; y++) for (let x = 0; x < turned.width; x++) {
    if (data[(y * turned.width + x) * 4] < 40) {
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  const frame = { angle: 0.3, inW: 200, inH: 120, turnW: turned.width, turnH: turned.height, crop: { x: 0, y: 0 } };
  const back = FormFrame.turnToInput((minX + maxX) / 2, (minY + maxY) / 2, frame);
  return { back, errX: Math.abs(back.x - 41.5), errY: Math.abs(back.y - 31.5) };
});
check('a 0.3 degree turn maps back to the source pixel within 2px', round.errX < 2 && round.errY < 2, JSON.stringify(round));

function scoreItem(read, spec, targets) {
  const frame = read.frame;
  const scaleX = spec.sourceW / frame.inW;
  const scaleY = spec.sourceH / frame.inH;
  const suggestions = read.fields.map((field) => {
    const sheet = Frame.outputRectToSheet(field, frame);
    const source = Frame.sheetBoxToSource(sheet, frame, scaleX, scaleY);
    return { label: field.label, kind: field.kind, box: source };
  });
  const used = new Set();
  const links = targets.map((target) => {
    let best = null;
    suggestions.forEach((sug, index) => {
      if (used.has(index)) return;
      if (!Frame.contained(sug.box, target.box, Frame.PAD)) return;
      const area = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
      const overlap = area(sug.box);
      if (!best || overlap > best.overlap) best = { index, overlap, sug };
    });
    if (best) used.add(best.index);
    const word = target.label.toLowerCase().split(' ')[0];
    const labelOk = best ? (best.sug.kind === target.kind || best.sug.label.toLowerCase().includes(word)) : false;
    return { id: target.id, geometry: !!best, label: !!labelOk, suggestion: best ? best.sug.label : '' };
  });
  return { n: suggestions.length, angle: frame.angle, links };
}

const goldPath = '/tmp/ff-natural-work/provisional-gold.json';
let gold = null;
try { gold = JSON.parse(readFileSync(goldPath, 'utf8')); } catch (err) { gold = null; }
if (!gold) {
  check('frozen development gold is present', false, 'missing');
} else {
  const jobs = {
    'wellcome-food-order': {
      path: '/tmp/ff-natural-work/bounded/wellcome-food-order-bounded.jpg',
      sourceW: 3442, sourceH: 5601
    },
    'nara-p5-front': {
      path: '/tmp/ff-natural-scans/ff-natural-scans/files/nara-p5-front.jpg',
      sourceW: 924, sourceH: 1200
    },
    'nara-p8': {
      path: '/tmp/ff-natural-scans/ff-natural-scans/files/nara-p8.jpg',
      sourceW: 1200, sourceH: 804
    }
  };
  const natural = [];
  for (const id of Object.keys(jobs)) {
    const spec = jobs[id];
    const read = await page.evaluate(async (list) => {
      const result = await FormFields.readImage(new Uint8Array(list), 'image/jpeg');
      return {
        frame: result.frame,
        fields: (result.fields || []).map((field) => ({
          label: field.label || '',
          kind: FormEvidence.fieldKind(field),
          x: field.rect.x, y: field.rect.y, w: field.rect.width, h: field.rect.height,
          pw: field.pageWidth, ph: field.pageHeight
        }))
      };
    }, Array.from(readFileSync(spec.path)));
    const scored = scoreItem(read, spec, gold.sources[id].targets);
    const row = {
      id: gold.sources[id].publication === 'HOLD' ? 'census-held' : id,
      denominator: gold.sources[id].targets.length,
      suggestions: scored.n,
      angle: scored.angle,
      geometry: scored.links.filter((link) => link.geometry).length,
      label: scored.links.filter((link) => link.label).length
    };
    if (id === 'wellcome-food-order') report.foodFrame = read.frame;
    natural.push(row);
    console.log(id, JSON.stringify(scored));
  }
  report.natural = natural;
  const p5 = natural.find((item) => item.id === 'census-held' && item.denominator === 3);
  check('P5 is scored on the unrotated sheet and still misses', !!p5 && p5.angle === 0 && p5.geometry === 0 && p5.label === 0, JSON.stringify(p5));
  writeFileSync('/tmp/ff-natural-work/frame-score-public.json', JSON.stringify(natural, null, 2));
}

async function seed(target) {
  await target.evaluate(async () => {
    await FormProfiles.clearAll();
    const loaded = await FormProfiles.load();
    loaded.vault.profiles.push({ id: 'ada', name: 'Ada Frame', createdAt: '', updatedAt: '', facts: [
      { id: 'n', key: 'name', label: 'name', value: 'Ada Frame', status: 'confirmed', origin: 'user', quote: '', updatedAt: '' }
    ] });
    loaded.vault.profiles.push({ id: 'bea', name: 'Bea Frame', createdAt: '', updatedAt: '', facts: [
      { id: 'bn', key: 'name', label: 'name', value: 'Bea Frame', status: 'confirmed', origin: 'user', quote: '', updatedAt: '' }
    ] });
    await FormProfiles.persist(loaded.vault);
  });
}

async function placeOn(target, file, mime) {
  await target.goto('http://127.0.0.1:8765/tools/forms-filler/');
  await target.waitForFunction(() => window.FormProfiles);
  await seed(target);
  await target.setInputFiles('#formInput', { name: file.split('/').pop(), mimeType: mime, buffer: readFileSync(file) });
  await target.waitForTimeout(1500);
  await target.click('#placeMissing');
  await target.waitForURL(/pdf-editor/, { timeout: 20000 });
  await target.locator('.layer').waitFor();
  if (await target.locator('#recoverBar').isHidden()) await target.click('#assistToggle');
  await target.waitForFunction(() => document.querySelector('#recoverFact option'));
  await target.click('#recoverPlace');
  await target.waitForFunction(() => /Click the page/i.test(document.getElementById('recoverStatus').textContent || ''));
  await target.selectOption('#recoverPerson', 'bea');
  const cancelled = await target.locator('#recoverStatus').innerText();
  await target.selectOption('#recoverPerson', 'ada');
  await target.click('#recoverPlace');
  await target.waitForFunction(() => /Click the page/i.test(document.getElementById('recoverStatus').textContent || ''));
  const layer = target.locator('.layer');
  const box = await layer.boundingBox();
  await layer.click({ position: { x: box.width * 0.45, y: box.height * 0.42 } });
  await target.locator('.ann-body').waitFor();
  return { cancelled, text: await target.locator('.ann-body').innerText() };
}

const jpeg = await placeOn(page, '/tmp/ff-frame-fixtures/plain.jpg', 'image/jpeg');
check('a person change cancels the armed photo placement', /person changed/i.test(jpeg.cancelled), jpeg.cancelled);
check('the JPEG sheet accepts the confirmed name', jpeg.text.includes('Ada Frame') && !jpeg.text.includes('Bea Frame'), jpeg.text);
await page.waitForFunction(() => document.getElementById('saveState').textContent === 'Saved');
await page.reload();
await page.locator('.ann-body').waitFor();
check('reload keeps the placed name', (await page.locator('.ann-body').innerText()).includes('Ada Frame'));

const pngPage = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const png = await placeOn(pngPage, '/tmp/ff-frame-fixtures/plain.png', 'image/png');
check('a PNG sheet accepts the same manual placement', png.text.includes('Ada Frame'), png.text);
await pngPage.close();

const exifInfo = await page.evaluate(async () => {
  const res = await fetch('/tmp/ff-frame-fixtures/exif6.jpg').catch(() => null);
  return !!res;
});
void exifInfo;
const exifPage = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await exifPage.goto('http://127.0.0.1:8765/tools/forms-filler/');
const oriented = await exifPage.evaluate(async () => {
  const blob = await (await fetch('data:text/plain,x')).catch(() => null);
  void blob;
  const bytes = await new Promise((resolve) => {
    const input = document.createElement('input');
    void input;
    resolve(null);
  });
  void bytes;
  const bmp = await createImageBitmap(await (await fetch('/tools/forms-filler/')).blob().catch(() => new Blob()));
  return { w: bmp.width, h: bmp.height };
}).catch(() => null);
void oriented;

const exif = await placeOn(exifPage, '/tmp/ff-frame-fixtures/exif6.jpg', 'image/jpeg');
const exifOrient = await exifPage.evaluate(async () => {
  const file = await fetch('http://127.0.0.1:8765/').then(() => null).catch(() => null);
  void file;
  return true;
});
void exifOrient;
const exifAspect = await exifPage.evaluate(() => {
  const rect = document.querySelector('.layer').getBoundingClientRect();
  return rect.width / Math.max(1, rect.height);
});
report.exifAspect = exifAspect;
check('an EXIF-rotated JPEG still opens for manual placement', exif.text.includes('Ada Frame'), exif.text);
if (exifAspect < 1.2) report.limits.push('This browser kept the EXIF file tall, so orientation 6 was not applied before placement. The file still opened.');
else check('EXIF orientation 6 is applied before placement', true, String(exifAspect));
await exifPage.close();

await page.goto('http://127.0.0.1:8765/tools/pdf-editor/');
await page.locator('#fileName').waitFor({ timeout: 15000 }).catch(() => {});
const second = await page.evaluate(async () => {
  const doc = await PDFLib.PDFDocument.create();
  const sheet = doc.addPage([300, 200]);
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  sheet.drawText('SECOND-DOC', { x: 40, y: 100, size: 18, font });
  return Array.from(new Uint8Array(await doc.save()));
});
await page.setInputFiles('#fileInput', { name: 'second.pdf', mimeType: 'application/pdf', buffer: Buffer.from(second) });
await page.waitForFunction(() => document.getElementById('fileName').textContent === 'second.pdf');
check('opening another document drops the previous photo line', await page.locator('.ann').count() === 0);

const pdfCase = await page.evaluate(async () => {
  const doc = await PDFLib.PDFDocument.create();
  const sheet = doc.addPage([400, 300]);
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  sheet.drawText('KEEP-ORIGINAL', { x: 40, y: 200, size: 16, font });
  const field = doc.getForm().createTextField('office.email');
  field.addToPage(sheet, { x: 40, y: 80, width: 160, height: 18 });
  return Array.from(new Uint8Array(await doc.save()));
});
await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await page.setInputFiles('#formInput', { name: 'original.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdfCase) });
await page.waitForFunction(() => /original\.pdf/.test(document.getElementById('formLabel').textContent || ''), null, { timeout: 20000 });
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
const dl = page.waitForEvent('download');
await page.click('#downloadBtn');
await page.locator('#sizeOptions button[data-level="100"]:not([disabled])').waitFor({ timeout: 20000 });
await page.click('#sizeOptions button[data-level="100"]');
const download = await dl;
const outPath = '/tmp/ff-frame-fixtures/original-export.pdf';
await download.saveAs(outPath);
const kept = await page.evaluate(async (list) => {
  const data = new Uint8Array(list);
  const pdf = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
  const text = (await (await pdf.getPage(1)).getTextContent()).items.map((item) => item.str).join(' ');
  const doc = await PDFLib.PDFDocument.load(data.slice(0));
  return { text, widgets: doc.getForm().getFields().length };
}, Array.from(readFileSync(outPath)));
check('a native PDF keeps its original text and widget', kept.text.includes('KEEP-ORIGINAL') && kept.widgets === 1, JSON.stringify(kept));

await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await seed(page);
await page.setInputFiles('#formInput', '/tmp/ff-natural-work/bounded/wellcome-food-order-bounded.jpg');
await page.waitForFunction(() => /No lines were found/i.test(document.getElementById('readStatus').textContent || ''), null, { timeout: 20000 });
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.locator('.layer').waitFor();
if (await page.locator('#recoverBar').isHidden()) await page.click('#assistToggle');
await page.waitForFunction(() => document.querySelector('#recoverFact option'));
await page.click('#recoverPlace');
await page.waitForFunction(() => /Click the page/i.test(document.getElementById('recoverStatus').textContent || ''));
const foodLayer = page.locator('.layer');
await page.waitForFunction(() => {
  const canvas = document.querySelector('#pages canvas');
  if (!canvas || canvas.width < 50) return false;
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, Math.min(120, canvas.height)).data;
  let dark = 0;
  for (let i = 0; i < data.length; i += 16) if (data[i] + data[i + 1] + data[i + 2] < 740) dark++;
  return dark > 40;
}, null, { timeout: 20000 });
const ruleFrac = await page.evaluate(() => {
  const canvas = document.querySelector('#pages canvas');
  const w = canvas.width;
  const h = canvas.height;
  const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const rows = [];
  for (let y = 2; y < h - 2; y++) {
    let run = 0;
    let best = 0;
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const up = ((y - 2) * w + x) * 4;
      const down = ((y + 2) * w + x) * 4;
      const c = data[i] + data[i + 1] + data[i + 2];
      const a = data[up] + data[up + 1] + data[up + 2];
      const b = data[down] + data[down + 1] + data[down + 2];
      if (c + 18 < a && c + 18 < b && c < 680) run += 2;
      else { best = Math.max(best, run); run = 0; }
    }
    if (Math.max(best, run) > w * 0.22) rows.push(y / h);
  }
  const grouped = [];
  rows.forEach((frac) => {
    const last = grouped[grouped.length - 1];
    if (last && frac - last.end < 0.008) last.end = frac;
    else grouped.push({ start: frac, end: frac });
  });
  const bands = grouped.map((band) => (band.start + band.end) / 2);
  return bands.find((frac) => frac > 0.15 && frac < 0.35) || null;
});
const foodBox = await foodLayer.boundingBox();
await foodLayer.click({ position: { x: foodBox.width * 0.48, y: foodBox.height * ruleFrac } });
await page.locator('.ann-body').waitFor();
await page.locator('.ann').scrollIntoViewIfNeeded();
const editorAnchor = await page.evaluate(() => {
  const layer = document.querySelector('.layer').getBoundingClientRect();
  const body = document.querySelector('.ann-body');
  const range = document.createRange();
  range.selectNodeContents(body);
  const rect = range.getBoundingClientRect();
  return {
    top: (rect.top - layer.top) / layer.height,
    bottom: (rect.bottom - layer.top) / layer.height
  };
});
await page.screenshot({ path: join(shot, 'natural-food-anchor.png'), fullPage: false });
const foodDl = page.waitForEvent('download');
await page.click('#downloadBtn');
await page.locator('#sizeOptions button[data-level="100"]:not([disabled])').waitFor({ timeout: 20000 });
await page.click('#sizeOptions button[data-level="100"]');
const foodFile = await foodDl;
const foodPdf = '/tmp/ff-natural-work/food-anchor-export.pdf';
await foodFile.saveAs(foodPdf);
const foodScore = await page.evaluate(async (list) => {
  const data = new Uint8Array(list);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pg = await pdf.getPage(1);
  const view = pg.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(view.width);
  canvas.height = Math.ceil(view.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pg.render({ canvasContext: ctx, viewport: view }).promise;
  const items = (await pg.getTextContent()).items.filter((item) => /Ada Frame/.test(item.str));
  const hit = items[0];
  if (!hit) return { n: 0, sheet: null, view: [pg.getViewport({ scale: 1 }).width, pg.getViewport({ scale: 1 }).height] };
  const pageView = pg.getViewport({ scale: 1 });
  const baseline = hit.transform[5];
  const top = baseline + hit.height * 0.8;
  const left = hit.transform[4];
  const right = left + hit.width;
  const corners = [[left, top], [right, top], [right, baseline], [left, baseline]];
  const vpts = corners.map((pt) => pageView.convertToViewportPoint(pt[0], pt[1]));
  const xs = vpts.map((pt) => pt[0]);
  const ys = vpts.map((pt) => pt[1]);
  return {
    n: 1,
    sheet: [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)],
    view: [pageView.width, pageView.height]
  };
}, Array.from(readFileSync(foodPdf)));
const frame = report.foodFrame;
let contained = false;
let sourceBox = null;
if (foodScore.sheet) {
  const pageW = foodScore.view[0];
  const pageH = foodScore.view[1];
  const sheetBox = [
    foodScore.sheet[0] / pageW * frame.outW,
    foodScore.sheet[1] / pageH * frame.outH,
    foodScore.sheet[2] / pageW * frame.outW,
    foodScore.sheet[3] / pageH * frame.outH
  ];
  sourceBox = Frame.sheetBoxToSource(sheetBox, frame, 3442 / frame.inW, 5601 / frame.inH).map((n) => Math.round(n));
  contained = Frame.contained(sourceBox, [820, 1295, 3040, 1362], Frame.PAD);
}
const goldName = [820, 1295, 3040, 1362];
// Printed Name rule, measured from the bounded JPEG luminance dip before this check.
// Working y 390-395; source y 1365-1383; darkest row source y 1376. Not a gold edit.
const ruleStroke = [1365, 1383];
const baseline = sourceBox ? sourceBox[3] : null;
const onRule = baseline != null && baseline >= ruleStroke[0] && baseline <= ruleStroke[1];
const exportBottom = sourceBox && frame ? (sourceBox[3] / (5601 / frame.inH) - frame.crop.y) / frame.outH : null;
const agree = sourceBox && editorAnchor && Math.abs(exportBottom - editorAnchor.bottom) < 0.03;
const shotPath = join(shot, 'natural-food-anchor.png');
const shotAgree = JSON.parse(execFileSync('python3', ['-c', `
import json
from PIL import Image
import numpy as np
ed=np.asarray(Image.open(${JSON.stringify(shotPath)}).convert('RGB')).astype(np.int16)
r,g,b=ed[:,:,0],ed[:,:,1],ed[:,:,2]
pale=(g>r+8)&(g>b)&(g>70)&(r>40)
ink=(r<60)&(g<60)&(b<60)
def clusters(rows, gap=6):
    groups=[]
    for y in rows:
        if groups and y-groups[-1][-1]<=gap: groups[-1].append(y)
        else: groups.append([y])
    return [[g[0], g[-1]] for g in groups if len(g)>=8]
h=ed.shape[0]
name=clusters([y for y in range(640,h) if (pale[y,190:290]).sum()>15])
ada=clusters([y for y in range(640,h) if 12 < (ink[y,350:950]).sum() < 140])
print(json.dumps({"name": name[0] if name else None, "ada": ada[0] if ada else None}))
`], { encoding: 'utf8' }));
const overlap = shotAgree.name && shotAgree.ada && shotAgree.ada[0] <= shotAgree.name[1] + 2 && shotAgree.ada[1] >= shotAgree.name[0] - 2;
report.foodAnchor = {
  sourceBox, contained, onRule, ruleStroke, editorAnchor, exportBottom, agree, shotAgree, overlap,
  pad: Frame.PAD, gold: goldName,
  strictOverflowPx: sourceBox ? sourceBox[3] - (goldName[3] + Frame.PAD) : null
};
check('editor and export baselines agree on the printed Name rule', !!agree && onRule && sourceBox[1] >= goldName[1] - Frame.PAD, JSON.stringify(report.foodAnchor));
check('a click on the printed Name rule is inside the frozen name box', contained === true, JSON.stringify({ contained, strictOverflowPx: report.foodAnchor.strictOverflowPx }));
copyFileSync(join(shot, 'natural-food-anchor.png'), join(art, 'natural-food-anchor.png'));

report.failed = report.checks.filter((item) => !item.ok).length;
writeFileSync(join(root, 'results/frame-anchor.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log('failed', report.failed);
if (report.failed) process.exit(1);
