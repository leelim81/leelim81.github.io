/** One native-resolution measurement of the food-order publisher JPEG.
 *  Frozen before the decode:
 *  - same eight ink-mask crops as lineLocalOcr (w >= 80, longest first, max 8)
 *  - sheet crop is 28px above the line and 8px below, width capped at 420
 *  - map that rectangle through the working crop and the 983×1600 to 3442×5601 scale
 *  - PSM 7, confidence 35, original colors, no upscale of the crop
 *  - at most 8 crops, 1.5e6 OCR pixels, 15s of OCR after the bitmap is closed
 *  - one full-frame decode, one ImageBitmap, close it before OCR
 *  - stop before allocating if MemAvailable is under 512MB
 *  - a decode error is recorded once and not retried
 *  Gold is applied only after words exist. Census files are not opened.
 */
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const PAD = 8;
const OCR_PIXEL_CAP = 1500000;
const OCR_BUDGET_MS = 15000;
const SOURCE = '/tmp/ff-natural-scans/ff-natural-scans/files/wellcome-food-order.jpg';
const WORKING = '/tmp/ff-natural-work/bounded/wellcome-food-order-bounded.jpg';
const EXPECT_SHA = 'ccfc3b242c83750b92e9fd88812709b246d6bdb06ed6f09bad7bcaeae9d69031';
const ORIG_W = 3442;
const ORIG_H = 5601;

function meminfo() {
  const text = readFileSync('/proc/meminfo', 'utf8');
  const pick = (key) => {
    const hit = text.match(new RegExp('^' + key + ':\\s+(\\d+)', 'm'));
    return hit ? Number(hit[1]) : null;
  };
  const vm = readFileSync('/proc/vmstat', 'utf8');
  const pages = (key) => {
    const hit = vm.match(new RegExp('^' + key + '\\s+(\\d+)', 'm'));
    return hit ? Number(hit[1]) : 0;
  };
  const rss = Number(execSync('ps -eo rss= | awk \'{s+=$1} END {print s}\'', { encoding: 'utf8' }).trim());
  return {
    memAvailableKiB: pick('MemAvailable'),
    memFreeKiB: pick('MemFree'),
    memTotalKiB: pick('MemTotal'),
    balloonPages: pages('balloon_inflate') - pages('balloon_deflate'),
    processRssKiB: rss
  };
}

function contains(ink, target) {
  return ink[0] >= target[0] - PAD && ink[1] >= target[1] - PAD && ink[2] <= target[2] + PAD && ink[3] <= target[3] + PAD;
}

function fieldBox(field, frame) {
  const top = (1 - (field.y + field.h) / field.ph) * frame.outH;
  const bot = (1 - field.y / field.ph) * frame.outH;
  const left = field.x / field.pw * frame.outW;
  const right = (field.x + field.w) / field.pw * frame.outW;
  const sx = ORIG_W / frame.inW;
  const sy = ORIG_H / frame.inH;
  return [
    Math.round((left + frame.crop.x) * sx),
    Math.round((top + frame.crop.y) * sy),
    Math.round((right + frame.crop.x) * sx),
    Math.round((bot + frame.crop.y) * sy)
  ];
}

const sha = execSync('sha256sum ' + JSON.stringify(SOURCE), { encoding: 'utf8' }).split(' ')[0];
const sourceBytes = readFileSync(SOURCE);
if (sha !== EXPECT_SHA || sourceBytes.length !== 1888605) {
  throw new Error('source hash or size mismatch: ' + sha + ' ' + sourceBytes.length);
}

const memory = meminfo();
const rgbaBytes = ORIG_W * ORIG_H * 4;
const memorySafe = memory.memAvailableKiB >= 512 * 1024;
const prior = {
  surreyRgbaBytes: 4842 * 5964 * 4,
  surreyDecodeMs: 490,
  note: 'Surrey full decode already completed. MemAvailable is the conservative figure; the balloon can hide more. usedJSHeapSize is not bitmap memory.'
};

const gold = JSON.parse(readFileSync('/tmp/ff-natural-work/provisional-gold.json', 'utf8')).sources['wellcome-food-order'];
const { chromium } = pkg;
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-http-cache'],
  headless: true
});

const out = {
  hypothesis: 'native-pixels-of-the-same-eight-line-crops',
  source: { sha256: sha, bytes: sourceBytes.length, width: ORIG_W, height: ORIG_H, sof: '0xC2' },
  rgbaBytes,
  memoryBefore: memory,
  memorySafe,
  prior,
  production: false,
  reason: ''
};

if (!memorySafe) {
  out.status = 'not-tested';
  out.reason = 'MemAvailable below 512MB, so the 77MB buffer was not allocated.';
  writeFileSync('/workspace/research/forms-filler/visual-e2e/results/native-source.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
  await browser.close();
  process.exit(0);
}

const selectPage = await browser.newPage();
selectPage.setDefaultTimeout(60000);
await selectPage.goto('http://127.0.0.1:8765/tools/forms-filler/?local=' + Date.now(), { waitUntil: 'domcontentloaded' });
await selectPage.waitForFunction(() => window.FormFields && window.FormFields.lineCropReport);

const working = Array.from(readFileSync(WORKING));
const selected = await selectPage.evaluate(async (list) => {
  return FormFields.lineCropReport(new Uint8Array(list), 'image/jpeg');
}, working);
await selectPage.close();

const planned = [];
let pixels = 0;
for (const crop of selected.crops) {
  const sx = ORIG_W / selected.frame.inW;
  const sy = ORIG_H / selected.frame.inH;
  const x0 = (crop.x + selected.frame.crop.x) * sx;
  const y0 = (crop.y + selected.frame.crop.y) * sy;
  const x1 = (crop.x + crop.w + selected.frame.crop.x) * sx;
  const y1 = (crop.y + crop.h + selected.frame.crop.y) * sy;
  const ix0 = Math.max(0, Math.floor(x0));
  const iy0 = Math.max(0, Math.floor(y0));
  const ix1 = Math.min(ORIG_W, Math.ceil(x1));
  const iy1 = Math.min(ORIG_H, Math.ceil(y1));
  const rect = {
    sheet: { x: crop.x, y: crop.y, w: crop.w, h: crop.h, line: crop.line },
    float: { x0, y0, x1, y1 },
    x: ix0,
    y: iy0,
    w: ix1 - ix0,
    h: iy1 - iy0
  };
  const area = rect.w * rect.h;
  if (planned.length >= 8 || pixels + area > OCR_PIXEL_CAP) {
    rect.skipped = 'pixel-cap';
    planned.push(rect);
    continue;
  }
  pixels += area;
  planned.push(rect);
}
const accepted = planned.filter((rect) => !rect.skipped);
out.frame = selected.frame;
out.sheet = { w: selected.sheetW, h: selected.sheetH };
out.transform = {
  sheetToNativeX: 'nativeX = (sheetX + crop.x) * (3442 / inW)',
  sheetToNativeY: 'nativeY = (sheetY + crop.y) * (5601 / inH)',
  inW: selected.frame.inW,
  inH: selected.frame.inH,
  crop: selected.frame.crop,
  scaleX: ORIG_W / selected.frame.inW,
  scaleY: ORIG_H / selected.frame.inH
};
out.crops = planned;
out.ocrPixelsPlanned = pixels;
out.frozen = {
  crops: accepted.length,
  ocrPixels: pixels,
  ocrBudgetMs: OCR_BUDGET_MS,
  psm: 7,
  minConfidence: 35,
  recolor: false
};

if (!accepted.length) {
  out.status = 'not-tested';
  out.reason = 'No native crop fit inside 1.5 million pixels.';
  writeFileSync('/workspace/research/forms-filler/visual-e2e/results/native-source.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
  await browser.close();
  process.exit(0);
}

const page = await browser.newPage();
page.setDefaultTimeout(60000);
await page.goto('http://127.0.0.1:8765/tools/forms-filler/?local=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.FormExtract && window.FormExtract.wordBoxes);
await page.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  canvas.getContext('2d').fillRect(0, 0, 32, 32);
  await FormExtract.wordBoxes(canvas, 7);
});

const decoded = await page.evaluate(async (payload) => {
  const blob = new Blob([new Uint8Array(payload.bytes)], { type: 'image/jpeg' });
  const started = performance.now();
  let bmp;
  try {
    bmp = await createImageBitmap(blob);
  } catch (err) {
    return { ok: false, error: String(err && err.message || err), name: err && err.name || '' };
  }
  const decodeMs = Math.round(performance.now() - started);
  const size = { w: bmp.width, h: bmp.height };
  if (size.w !== 3442 || size.h !== 5601) {
    if (bmp.close) bmp.close();
    return { ok: false, error: 'decoded size ' + size.w + 'x' + size.h, decodeMs, size };
  }
  const drawStarted = performance.now();
  window.__nativeCrops = payload.rects.map((rect) => {
    const canvas = document.createElement('canvas');
    canvas.width = rect.w;
    canvas.height = rect.h;
    canvas.getContext('2d').drawImage(bmp, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    return canvas;
  });
  const drawMs = Math.round(performance.now() - drawStarted);
  let closed = false;
  if (bmp.close) {
    bmp.close();
    closed = true;
  }
  bmp = null;
  return {
    ok: true,
    decodeMs,
    drawMs,
    closedBeforeOcr: closed,
    size,
    heap: performance.memory ? performance.memory.usedJSHeapSize : null
  };
}, { bytes: Array.from(sourceBytes), rects: accepted.map((rect) => ({ x: rect.x, y: rect.y, w: rect.w, h: rect.h })) });

out.decode = decoded;
if (!decoded.ok) {
  out.status = 'not-tested';
  out.reason = 'Decode failed once and was not retried: ' + decoded.error;
  writeFileSync('/workspace/research/forms-filler/visual-e2e/results/native-source.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
  await page.close();
  await browser.close();
  process.exit(0);
}

const ocr = await page.evaluate(async (budgetMs) => {
  const crops = window.__nativeCrops || [];
  const words = [];
  const started = Date.now();
  let pixels = 0;
  let ran = 0;
  let stopped = '';
  for (let i = 0; i < crops.length; i++) {
    const remain = budgetMs - (Date.now() - started);
    if (remain <= 0) { stopped = 'budget'; break; }
    const crop = crops[i];
    pixels += crop.width * crop.height;
    try {
      const found = await Promise.race([
        FormExtract.wordBoxes(crop, 7),
        new Promise((_, reject) => setTimeout(() => reject(new Error('ocr-budget')), remain))
      ]);
      ran++;
      (found || []).forEach((word) => {
        const box = word.bbox || {};
        words.push({
          crop: i,
          text: word.text || '',
          confidence: word.confidence == null ? null : Math.round(word.confidence),
          x0: box.x0 || 0,
          y0: box.y0 || 0,
          x1: box.x1 || box.x0 || 0,
          y1: box.y1 || box.y0 || 0
        });
      });
    } catch (err) {
      stopped = String(err && err.message || err);
      break;
    }
  }
  window.__nativeCrops = null;
  return {
    ms: Date.now() - started,
    crops: ran,
    pixels,
    stopped,
    words,
    heap: performance.memory ? performance.memory.usedJSHeapSize : null
  };
}, OCR_BUDGET_MS);

await page.close();

const nativeWords = ocr.words.map((word) => {
  const crop = accepted[word.crop];
  const nx0 = crop.x + word.x0;
  const ny0 = crop.y + word.y0;
  const nx1 = crop.x + word.x1;
  const ny1 = crop.y + word.y1;
  return {
    crop: word.crop,
    text: word.text,
    confidence: word.confidence,
    native: [Math.round(nx0), Math.round(ny0), Math.round(nx1), Math.round(ny1)]
  };
});

const controlPage = await browser.newPage();
await controlPage.goto('http://127.0.0.1:8765/tools/forms-filler/?local=' + Date.now(), { waitUntil: 'domcontentloaded' });
await controlPage.waitForFunction(() => window.FormFields && window.FormFields.fieldsFromWords && window.FormEvidence);

const sheetWords = nativeWords.map((word) => {
  const sx = selected.frame.inW / ORIG_W;
  const sy = selected.frame.inH / ORIG_H;
  const left = word.native[0] * sx - selected.frame.crop.x;
  const top = word.native[1] * sy - selected.frame.crop.y;
  const right = word.native[2] * sx - selected.frame.crop.x;
  const bot = word.native[3] * sy - selected.frame.crop.y;
  return {
    x: left,
    y: selected.sheetH - bot,
    w: Math.max(4, right - left),
    h: Math.max(6, bot - top),
    str: word.text
  };
});

const placed = await controlPage.evaluate(async (payload) => {
  const report = await FormFields.fieldsFromWords(new Uint8Array(payload.bytes), 'image/jpeg', payload.words);
  const kinds = payload.texts.map((text) => FormEvidence.fieldKind({ label: text }));
  return { report, kinds };
}, { bytes: working, words: sheetWords, texts: nativeWords.map((word) => word.text) });

const judged = placed.report.fields.map((field) => {
  const box = fieldBox(field, placed.report.frame);
  const hits = gold.targets.filter((target) => contains(box, target.box)).map((target) => ({ id: target.id, kind: target.kind }));
  return { kind: field.kind, label: field.label, hits, box };
});
const correct = judged.filter((item) => item.hits.length === 1 && item.kind === item.hits[0].kind && (item.kind === 'name' || item.kind === 'address'));
const wrongBox = judged.filter((item) => (item.kind === 'name' || item.kind === 'address') && !item.hits.length);
const falseFields = judged.filter((item) => !item.hits.length);

const upright = await controlPage.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 612; canvas.height = 792;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 612, 792);
  ctx.fillStyle = '#111'; ctx.font = '28px Helvetica, Arial, sans-serif';
  ctx.fillText('Email', 48, 180); ctx.fillRect(180, 186, 320, 3);
  ctx.fillText('Name', 48, 280); ctx.fillRect(180, 286, 320, 3);
  const bin = atob(canvas.toDataURL('image/png').split(',')[1]);
  const png = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) png[i] = bin.charCodeAt(i);
  const doc = await PDFLib.PDFDocument.create();
  const sheet = doc.addPage([612, 792]);
  sheet.drawImage(await doc.embedPng(png), { x: 0, y: 0, width: 612, height: 792 });
  const read = await FormFields.read(new Uint8Array(await doc.save()));
  return (read.fields || []).map((field) => field.label).sort();
});

const words = nativeWords.map((word, i) => ({ ...word, kind: placed.kinds[i] }));
const nameAddressWords = words.filter((word) => word.kind === 'name' || word.kind === 'address');
const gates = correct.length === 2 && falseFields.length === 0 && upright.join() === 'Email,Name';
let verdict = 'rejected';
if (!ocr.crops && ocr.stopped) verdict = 'not-tested';
else if (nameAddressWords.length && correct.length === 2 && falseFields.length === 0) verdict = 'supported';
else if (nameAddressWords.length) verdict = 'rejected';
else verdict = 'rejected';

out.ocr = { ms: ocr.ms, crops: ocr.crops, pixels: ocr.pixels, stopped: ocr.stopped, heap: ocr.heap };
out.words = words;
out.wordKinds = words.reduce((acc, word) => { acc[word.kind] = (acc[word.kind] || 0) + 1; return acc; }, {});
out.fields = judged;
out.correct = correct.length;
out.wrongBox = wrongBox.length;
out.falseFields = falseFields.length;
out.upright = upright;
out.gatesPassed = gates;
out.production = false;
out.verdict = verdict;
out.status = 'measured';
out.reason = verdict === 'supported'
  ? 'Native crops produced name and address fields inside the frozen boxes. Production stays off until a decode budget is tested.'
  : (nameAddressWords.length
    ? 'Native crops returned name or address words, and the field boxes did not pass the frozen gate.'
    : 'Native crops did not return a name or address word. Source resolution did not restore those labels.');

writeFileSync('/workspace/research/forms-filler/visual-e2e/results/native-source.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  verdict: out.verdict,
  decode: out.decode,
  ocr: out.ocr,
  wordKinds: out.wordKinds,
  words: out.words,
  fields: out.fields,
  correct: out.correct,
  wrongBox: out.wrongBox,
  falseFields: out.falseFields,
  upright: out.upright,
  crops: out.crops.map((crop) => ({ x: crop.x, y: crop.y, w: crop.w, h: crop.h, skipped: crop.skipped || false })),
  pixels: out.ocrPixelsPlanned
}, null, 2));
await controlPage.close();
await browser.close();
