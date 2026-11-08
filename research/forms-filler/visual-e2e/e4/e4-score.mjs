#!/usr/bin/env node
/** One look at the frozen E4 family. */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const { chromium } = pkg;
const root = dirname(fileURLToPath(import.meta.url));
const freezePath = join(root, 'E4-FREEZE.json');
const freeze = JSON.parse(readFileSync(freezePath, 'utf8'));
if (freeze.looked) throw new Error('E4 family was already looked at');
function sha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
Object.entries(freeze.files).forEach(([rel, meta]) => {
  const got = sha(join(root, rel));
  if (got !== meta.sha256) throw new Error('Hash moved: ' + rel);
});
Object.entries(freeze.codeHashes).forEach(([rel, hash]) => {
  const got = sha(join(root, '../../../..', rel));
  if (got !== hash) throw new Error('Code hash moved: ' + rel);
});
const gate = freeze.gate;
const gold = readFileSync(join(root, 'gold.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
const classes = ['text', 'choice', 'signature'];

function boxOf(rect) {
  return { x1: rect.x, y1: rect.y, x2: rect.x + rect.w, y2: rect.y + rect.h };
}
function iou(a, b) {
  const A = boxOf(a);
  const B = boxOf(b);
  const ix = Math.max(0, Math.min(A.x2, B.x2) - Math.max(A.x1, B.x1));
  const iy = Math.max(0, Math.min(A.y2, B.y2) - Math.max(A.y1, B.y1));
  const inter = ix * iy;
  const area = Math.max(0, A.x2 - A.x1) * Math.max(0, A.y2 - A.y1) + Math.max(0, B.x2 - B.x1) * Math.max(0, B.y2 - B.y1) - inter;
  return area > 0 ? inter / area : 0;
}
function scoreSet(dets, fields) {
  const cand = [];
  dets.forEach((det, di) => fields.forEach((field, gi) => {
    const hit = iou(det, { x: field.rect[0], y: field.rect[1], w: field.rect[2], h: field.rect[3] });
    if (hit >= gate.iou) cand.push({ di, gi, hit, same: (det.clsName || 'text') === field.cls });
  }));
  cand.sort((a, b) => b.hit - a.hit);
  const usedD = new Set();
  const usedG = new Set();
  let tp = 0;
  let wrongCls = 0;
  cand.forEach((item) => {
    if (usedD.has(item.di) || usedG.has(item.gi)) return;
    usedD.add(item.di);
    usedG.add(item.gi);
    if (item.same) tp += 1;
    else wrongCls += 1;
  });
  const fp = dets.length - tp;
  const fn = fields.length - tp;
  return { tp, fp, fn, wrongCls, nGold: fields.length, nDet: dets.length };
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const bench = await browser.newPage();
await bench.goto('http://127.0.0.1:8765/tools/forms-filler/bench.html', { waitUntil: 'domcontentloaded' });
await bench.waitForFunction(() => window.FormFields);
const quiet = [];
bench.on('request', (req) => quiet.push(req.url()));
await bench.goto('http://127.0.0.1:8765/tools/forms-filler/');
await bench.waitForFunction(() => window.FormProfiles);
const productRequests = quiet.filter((url) => /onnx|ort-wasm|ort\.min|form-field-v1/.test(url));
const page = await browser.newPage();
const cold = [];
page.on('response', async (res) => {
  const url = res.url();
  if (!/ort\.min|ort-wasm|form-field-v1-nano/.test(url)) return;
  const len = Number(res.headers()['content-length'] || 0);
  cold.push({ url: url.split('/').pop(), status: res.status(), bytes: len });
});
await page.goto('http://127.0.0.1:8765/research/forms-filler/visual-e2e/e4/harness.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.E4);
const rssBefore = Number(spawnSync('ps', ['-o', 'rss=', '-p', String(process.pid)], { encoding: 'utf8' }).stdout) || null;
const rows = [];
for (const record of gold) {
  const bytes = Array.from(readFileSync(join(root, record.pdf)));
  if (record.expect === 'guard') {
    const guard = await bench.evaluate(async (list) => {
      const read = await FormFields.read(new Uint8Array(list).slice(0));
      return { route: read.route || '', block: read.placementBlock || '', n: (read.fields || []).length };
    }, bytes);
    rows.push({ id: record.id, expect: 'guard', block: guard.block, route: guard.route, boxes: guard.n });
    console.log(record.id, guard.block ? 'blocked' : 'NOT BLOCKED', guard.route);
    continue;
  }
  const base = await bench.evaluate(async (list) => {
    const read = await FormFields.read(new Uint8Array(list).slice(0));
    return {
      boxes: (read.fields || []).filter((field) => field.rect).map((field) => ({
        x: field.rect.x, y: field.rect.y, w: field.rect.width, h: field.rect.height || 12, label: field.label || ''
      }))
    };
  }, bytes);
  const det = await page.evaluate(async (arg) => E4.detectPdf(arg.list, arg.gate), { list: bytes, gate: { score: gate.score, nms: gate.nms } });
  const baseBoxes = base.boxes.map((box) => ({ ...box, clsName: 'text' }));
  const detBoxes = det.boxes.map((box) => ({ ...box, clsName: classes[box.cls] || 'text' }));
  rows.push({
    id: record.id,
    layout: record.layout,
    ms: det.ms,
    baseline: scoreSet(baseBoxes, record.fields),
    candidate: scoreSet(detBoxes, record.fields),
    classes: classes.map((name) => ({
      name,
      baseline: scoreSet(baseBoxes.filter((box) => box.clsName === name), record.fields.filter((field) => field.cls === name)),
      candidate: scoreSet(detBoxes.filter((box) => box.clsName === name), record.fields.filter((field) => field.cls === name))
    }))
  });
  console.log(record.id, 'base', rows.at(-1).baseline, 'nano', rows.at(-1).candidate, 'ms', Math.round(det.ms));
}
const chromeRss = spawnSync('ps', ['-eo', 'rss=,comm='], { encoding: 'utf8' }).stdout
  .split('\n')
  .filter((line) => /chrome/.test(line))
  .map((line) => Number(line.trim().split(/\s+/)[0]))
  .reduce((sum, n) => sum + (n || 0), 0);
await browser.close();

function totals(key) {
  return rows.filter((row) => row[key]).reduce((acc, row) => {
    acc.tp += row[key].tp;
    acc.fp += row[key].fp;
    acc.fn += row[key].fn;
    acc.nGold += row[key].nGold;
    acc.nDet += row[key].nDet;
    return acc;
  }, { tp: 0, fp: 0, fn: 0, nGold: 0, nDet: 0 });
}
function rates(t) {
  return {
    ...t,
    precision: t.tp + t.fp ? t.tp / (t.tp + t.fp) : null,
    recall: t.tp + t.fn ? t.tp / (t.tp + t.fn) : null
  };
}
const baseline = rates(totals('baseline'));
const candidate = rates(totals('candidate'));
const pass = candidate.precision >= 0.95 && candidate.recall >= baseline.recall + 0.10;
const result = {
  looked: true,
  nForms: rows.filter((row) => row.baseline).length,
  nGold: candidate.nGold,
  baseline,
  candidate,
  passAccuracyGate: pass,
  decision: pass ? 'promising-not-adopted' : 'reject',
  reason: pass
    ? 'Accuracy gate passed on this small family. Placement, export, and a phone were not tested, so it is not adopted.'
    : 'Accuracy gate failed on the preregistered 0.3 / 0.6 settings. Not adopted. Thresholds were not refit.',
  productRequests: productRequests,
  coldRequests: cold,
  coldBytes: cold.reduce((sum, item) => sum + item.bytes, 0),
  wholeBrowserRssKb: chromeRss,
  rssNote: 'Sum of Chrome process RSS in KB while the page was open. This is not model RAM.',
  nodeRssKb: rssBefore,
  rows
};
writeFileSync(join(root, 'results.json'), JSON.stringify(result, null, 2) + '\n');
freeze.looked = true;
writeFileSync(freezePath, JSON.stringify(freeze, null, 2) + '\n');
console.log(JSON.stringify({ baseline, candidate, decision: result.decision, coldBytes: result.coldBytes, rssKb: chromeRss }, null, 2));
