/** One preregistered label pass. Gold is loaded only after OCR, for the pad-8 score. */
import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
import { prepare, run } from '../rulenet/rulenet_fast.mjs';
import { segmentsFromProb } from '../rulenet/postprocess.mjs';

const { chromium } = pkg;
const require = createRequire(import.meta.url);
const Frame = require('../../../tools/forms-filler/frame.js');
const SX = 3442 / 983;
const SY = 5601 / 1600;
const MAX_PIXELS = 1500000;
const MAX_CROPS = 12;
const MAX_MS = 15000;

execFileSync('python3', ['-c', `
from PIL import Image
im=Image.open('/tmp/ff-natural-scans/ff-natural-scans/files/wellcome-food-order.jpg').convert('RGB')
if im.size!=(983,1600): im=im.resize((983,1600), Image.Resampling.LANCZOS)
im.save('/tmp/label-working.png')
print(im.size)
`]);

const meta = JSON.parse(readFileSync(new URL('../rulenet/rulenet.meta.json', import.meta.url), 'utf8'));
const weightBuf = readFileSync(new URL('../rulenet/rulenet.f32.bin', import.meta.url));
const flat = new Float32Array(weightBuf.buffer, weightBuf.byteOffset, weightBuf.byteLength / 4);
const png = readFileSync('/tmp/label-working.png');
const rgb = execFileSync('python3', ['-c', `
from PIL import Image
import sys
im=__import__('numpy').asarray(Image.open('/tmp/label-working.png').convert('RGB'))
assert im.shape==(1600,983,3)
im.tofile('/tmp/label-working.rgb')
print('ok')
`], { encoding: 'utf8' });
if (!rgb.includes('ok')) throw new Error('working raster');
const raw = readFileSync('/tmp/label-working.rgb');
const W = 983;
const H = 1600;
const rgba = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) {
  rgba[i * 4] = raw[i * 3];
  rgba[i * 4 + 1] = raw[i * 3 + 1];
  rgba[i * 4 + 2] = raw[i * 3 + 2];
  rgba[i * 4 + 3] = 255;
}
const prob = run(prepare(meta, flat), rgba, W, H);
const segs = segmentsFromProb(prob, rgba, W, H);

function cropOf(seg) {
  const x = seg[0];
  const w = seg[1] - seg[0];
  const yLine = seg[2];
  const x0 = Math.max(0, Math.round(x - 4));
  const x1 = Math.min(W, Math.round(Math.min(x + w, x + 420) + 4));
  const y0 = Math.max(0, Math.round(yLine - 28));
  const y1 = Math.min(H, Math.round(yLine + 8));
  if (x1 <= x0 || y1 <= y0) return null;
  return {
    x0, y0, x1, y1,
    nw: x1 - x0,
    nh: y1 - y0,
    nx0: Math.max(0, Math.round(x0 * SX)),
    ny0: Math.max(0, Math.round(y0 * SY)),
    nx1: Math.min(3442, Math.round(x1 * SX)),
    ny1: Math.min(5601, Math.round(y1 * SY))
  };
}

function take(list, native) {
  const out = [];
  let pixels = 0;
  for (let i = 0; i < list.length; i++) {
    const crop = list[i];
    const n = native ? Math.max(0, crop.nx1 - crop.nx0) * Math.max(0, crop.ny1 - crop.ny0) : crop.nw * crop.nh;
    if (out.length >= MAX_CROPS) break;
    if (pixels + n > MAX_PIXELS) break;
    pixels += n;
    out.push({ index: i, pixels: n, crop });
  }
  return { crops: out, pixels };
}

const crops = segs.map(cropOf).filter(Boolean);
const workingPlan = take(crops, false);
const nativePlan = take(crops, true);

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info']
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto('http://127.0.0.1:8772/tools/forms-filler/');
await page.waitForFunction(() => window.FormExtract && window.FormEvidence);

const jpeg = readFileSync('/tmp/ff-natural-scans/ff-natural-scans/files/wellcome-food-order.jpg').toString('base64');
const workingB64 = Buffer.from(raw).toString('base64');
const measured = await page.evaluate(async (payload) => {
  function rawToImage(b64, w, h) {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(w, h);
    for (let i = 0, p = 0; i < bytes.length; i += 3, p += 4) {
      image.data[p] = bytes[i];
      image.data[p + 1] = bytes[i + 1];
      image.data[p + 2] = bytes[i + 2];
      image.data[p + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }
  function cut(src, x0, y0, x1, y1) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, x1 - x0);
    canvas.height = Math.max(1, y1 - y0);
    canvas.getContext('2d').drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  async function readArm(canvases) {
    const started = performance.now();
    const words = [];
    let read = 0;
    let stopped = '';
    for (let i = 0; i < canvases.length; i++) {
      if (performance.now() - started > 15000) { stopped = 'time'; break; }
      const item = canvases[i];
      const found = await FormExtract.wordBoxes(item.canvas, 7);
      read += 1;
      found.forEach((word) => {
        const box = word.bbox || {};
        words.push({
          str: String(word.text || '').trim(),
          confidence: word.confidence,
          x: (box.x0 || 0) + item.x,
          y: (box.y0 || 0) + item.y,
          w: Math.max(4, (box.x1 || 0) - (box.x0 || 0)),
          h: Math.max(6, (box.y1 || 0) - (box.y0 || 0)),
          kind: FormEvidence.fieldKind({ label: word.text || '' }) || 'other',
          rule: item.rule
        });
      });
    }
    return {
      ms: performance.now() - started,
      read,
      stopped,
      words: words.map((word) => ({ str: word.str, confidence: word.confidence, kind: word.kind, rule: word.rule, x: word.x, y: word.y, w: word.w, h: word.h })),
      heap: performance.memory ? performance.memory.usedJSHeapSize : null
    };
  }
  const sheet = rawToImage(payload.working, 983, 1600);
  const workingCanvases = payload.workingCrops.map((crop) => ({
    canvas: cut(sheet, crop.x0, crop.y0, crop.x1, crop.y1),
    x: crop.x0,
    y: crop.y0,
    rule: crop.rule
  }));
  const working = await readArm(workingCanvases);
  const blob = await fetch('data:image/jpeg;base64,' + payload.jpeg).then((res) => res.blob());
  const bmp = await createImageBitmap(blob);
  const nativeSize = { w: bmp.width, h: bmp.height };
  const nativeCanvases = payload.nativeCrops.map((crop) => {
    const canvas = cut(bmp, crop.nx0, crop.ny0, crop.nx1, crop.ny1);
    return { canvas, x: crop.x0, y: crop.y0, rule: crop.rule, scaleX: (crop.nx1 - crop.nx0) / (crop.x1 - crop.x0), scaleY: (crop.ny1 - crop.ny0) / (crop.y1 - crop.y0) };
  });
  if (bmp.close) bmp.close();
  const nativeStarted = performance.now();
  const nativeWords = [];
  let nativeRead = 0;
  let nativeStopped = '';
  for (let i = 0; i < nativeCanvases.length; i++) {
    if (performance.now() - nativeStarted > 15000) { nativeStopped = 'time'; break; }
    const item = nativeCanvases[i];
    const found = await FormExtract.wordBoxes(item.canvas, 7);
    nativeRead += 1;
    found.forEach((word) => {
      const box = word.bbox || {};
      nativeWords.push({
        str: String(word.text || '').trim(),
        confidence: word.confidence,
        x: item.x + (box.x0 || 0) / item.scaleX,
        y: item.y + (box.y0 || 0) / item.scaleY,
        w: Math.max(4, ((box.x1 || 0) - (box.x0 || 0)) / item.scaleX),
        h: Math.max(6, ((box.y1 || 0) - (box.y0 || 0)) / item.scaleY),
        kind: FormEvidence.fieldKind({ label: word.text || '' }) || 'other',
        rule: item.rule
      });
    });
  }
  return {
    nativeSize,
    working,
    native: { ms: performance.now() - nativeStarted, read: nativeRead, stopped: nativeStopped, words: nativeWords, heap: performance.memory ? performance.memory.usedJSHeapSize : null }
  };
}, {
  jpeg,
  working: workingB64,
  workingCrops: workingPlan.crops.map((item) => ({ ...item.crop, rule: item.index })),
  nativeCrops: nativePlan.crops.map((item) => ({ ...item.crop, rule: item.index }))
});
await browser.close();

function link(words) {
  const Hpage = 1600;
  const rules = segs.map((seg) => ({ x: seg[0], y: Hpage - seg[2], w: seg[1] - seg[0] }));
  const texts = words.map((word) => ({
    x: word.x,
    y: Hpage - (word.y + word.h),
    w: word.w,
    h: word.h,
    str: word.str
  }));
  const scale = 595 / W;
  const primary = [];
  rules.forEach((line) => {
    const x = line.x * scale;
    const y = line.y * scale;
    const width = Math.max(40, line.w * scale);
    const occupied = primary.some((field) => {
      const rect = field.rect || {};
      const overlap = Math.min((rect.x || 0) + (rect.width || 0), x + width) - Math.max(rect.x || 0, x);
      return Math.abs((rect.y || 0) - y) < 18 && overlap > Math.min(rect.width || 0, width) * 0.45;
    });
    if (occupied) return;
    const candidates = [];
    texts.forEach((text) => {
      const vertical = text.y - line.y;
      const overlaps = text.x < line.x + line.w && text.x + text.w > line.x - 8;
      const above = overlaps && vertical >= 6 && vertical <= 80;
      const below = overlaps && vertical <= -4 && vertical >= -36;
      const gap = line.x - (text.x + text.w);
      const beside = gap >= -8 && gap <= 48 && Math.abs(vertical) <= 18;
      if (!above && !below && !beside) return;
      const dist = Math.abs(vertical);
      const nearer = rules.some((other) => {
        if (other === line) return false;
        const otherOverlap = text.x < other.x + other.w && text.x + text.w > other.x - 8;
        return otherOverlap && Math.abs(text.y - other.y) + 3 < dist;
      });
      if (nearer) return;
      candidates.push({ text, dy: dist });
    });
    const known = [];
    candidates.forEach((item) => {
      const itemKind = kindOf(item.text.str);
      if (!itemKind || itemKind === 'other') return;
      item.kind = itemKind;
      known.push(item);
    });
    if (!known.length) return;
    let best = known[0].text;
    let kind = known[0].kind;
    if (known.length > 1) {
      const sameKind = known.every((item) => item.kind === kind);
      const ys = known.map((item) => item.text.y);
      const spread = Math.max(...ys) - Math.min(...ys);
      if (!sameKind || spread > 18) return;
      known.sort((a, b) => a.text.x - b.text.x);
      best = { str: known.map((item) => item.text.str).join(' ') };
      kind = kindOf(best.str);
    }
    if (!kind || kind === 'other') return;
    const labelKey = String(best.str || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const repeated = primary.some((field) => {
      const rect = field.rect || {};
      const have = String(field.label || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (have !== labelKey) return false;
      const overlap = Math.min((rect.x || 0) + (rect.width || 0), x + width) - Math.max(rect.x || 0, x);
      return Math.abs((rect.y || 0) - y) < 32 && overlap > 20;
    });
    if (repeated) return;
    primary.push({
      label: best.str,
      kind,
      x, y, w: width, h: 16,
      pw: 595,
      ph: Hpage * scale
    });
  });
  return primary;
}

const kindCache = new Map();
function kindOf(label) {
  return kindCache.get(label) || 'other';
}

const browser2 = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const kindsPage = await browser2.newPage();
await kindsPage.goto('http://127.0.0.1:8772/tools/forms-filler/');
await kindsPage.waitForFunction(() => window.FormEvidence);
const labels = [];
for (const arm of [measured.working.words, measured.native.words]) {
  arm.forEach((word) => { if (!labels.includes(word.str)) labels.push(word.str); });
}
const kinds = await kindsPage.evaluate((list) => {
  const out = {};
  list.forEach((label) => { out[label] = FormEvidence.fieldKind({ label }) || 'other'; });
  return out;
}, labels);
await browser2.close();
Object.keys(kinds).forEach((label) => kindCache.set(label, kinds[label]));
measured.working.words.forEach((word) => { word.kind = kinds[word.str] || 'other'; });
measured.native.words.forEach((word) => { word.kind = kinds[word.str] || 'other'; });

const gold = JSON.parse(readFileSync('/tmp/ff-natural-work/provisional-gold.json', 'utf8'));
const targets = gold.sources['wellcome-food-order'].targets.filter((target) => target.kind === 'name' || target.kind === 'address');
const frame = {
  angle: 0, inW: 983, inH: 1600, turnW: 983, turnH: 1600,
  crop: { x: 0, y: 0, w: 983, h: 1600 },
  outW: 983, outH: 1600, sourceW: 3442, sourceH: 5601
};

function score(fields) {
  const suggestions = fields.map((field) => {
    const sheet = Frame.outputRectToSheet(field, frame);
    const source = Frame.sheetBoxToSource(sheet, frame, SX, SY);
    return { kind: field.kind, label: field.label, box: source.map((n) => Math.round(n * 100) / 100) };
  });
  const used = new Set();
  const hits = targets.map((target) => {
    let best = null;
    suggestions.forEach((sug, index) => {
      if (used.has(index) || sug.kind !== target.kind) return;
      if (!Frame.contained(sug.box, target.box, Frame.PAD)) return;
      best = index;
    });
    if (best != null) used.add(best);
    return { id: target.id, hit: best != null };
  });
  const falseFields = suggestions.filter((sug, index) => !used.has(index));
  return { hits, correct: hits.filter((hit) => hit.hit).length, falseFields: falseFields.length, suggestions };
}

const report = {
  segments: segs.length,
  working: {
    planned: workingPlan.crops.length,
    pixels: workingPlan.pixels,
    ...measured.working,
    fields: link(measured.working.words)
  },
  native: {
    planned: nativePlan.crops.length,
    pixels: nativePlan.pixels,
    firstY: nativePlan.crops.map((item) => Math.round(segs[item.index][2])),
    ...measured.native,
    fields: link(measured.native.words)
  }
};
report.working.score = score(report.working.fields);
report.native.score = score(report.native.fields);
report.working.words = report.working.words.map((word) => ({ str: word.str, kind: word.kind, confidence: Math.round(word.confidence || 0) }));
report.native.words = report.native.words.map((word) => ({ str: word.str, kind: word.kind, confidence: Math.round(word.confidence || 0) }));
writeFileSync(new URL('./label.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  segments: report.segments,
  working: { planned: report.working.planned, pixels: report.working.pixels, read: report.working.read, ms: Math.round(report.working.ms), stopped: report.working.stopped, words: report.working.words, score: report.working.score, heap: report.working.heap },
  native: { planned: report.native.planned, pixels: report.native.pixels, read: report.native.read, ms: Math.round(report.native.ms), stopped: report.native.stopped, firstY: report.native.firstY, words: report.native.words, score: report.native.score, heap: report.native.heap, size: measured.nativeSize }
}, null, 2));
