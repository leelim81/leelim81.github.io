#!/usr/bin/env node
/** Score scan-dev only. Calibration and audit are refused. */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
import { createRequire } from 'module';
import { norm } from '../visual-gold/metrics.mjs';

const require = createRequire(import.meta.url);
const { decideAll } = require('../../../tools/forms-filler/select.js');
const { fieldKind } = require('../../../tools/forms-filler/evidence.js');
const { chromium } = pkg;
const root = dirname(fileURLToPath(import.meta.url));
const split = process.argv[2] || 'scan-dev';
if (split !== 'scan-dev') throw new Error('Refusing ' + split + '. It stays unread until the freeze.');

const gold = readFileSync(join(root, 'gold', split + '.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
const gate = {
  autofill: { name: true, nric: true, dob: true, phone: true, email: true, address: true, postal: false, mailbox: false },
  ocrAutofill: { name: false, nric: false, dob: false, phone: false, email: false, address: false, postal: false, mailbox: false }
};

function hit(det, goldRect) {
  if (!det.rect || !goldRect) return false;
  const g = { x: goldRect[0], y: goldRect[1], w: goldRect[2], h: goldRect[3] };
  const ix = Math.min(det.rect.x + det.rect.width, g.x + g.w) - Math.max(det.rect.x, g.x);
  const iy = Math.min(det.rect.y + (det.rect.height || 12), g.y + Math.max(g.h, 14)) - Math.max(det.rect.y, g.y);
  return ix > 6 && iy > -2;
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const page = await browser.newPage();
page.setDefaultTimeout(120000);
await page.goto('http://127.0.0.1:8765/tools/forms-filler/bench.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.FormBench && window.FormFields);

const rows = [];
let detTP = 0;
let detFP = 0;
let detFN = 0;
let labelOK = 0;
const t0 = Date.now();
for (const record of gold) {
  const started = Date.now();
  const form = Array.from(readFileSync(join(root, record.form_pdf)));
  const ref = Array.from(readFileSync(join(root, record.reference_pdf)));
  const run = await page.evaluate(async ({ form, ref, gate }) => {
    const out = await FormBench.run(new Uint8Array(form), new Uint8Array(ref), gate, 'autofill');
    return {
      kind: out.kind,
      channel: out.channel,
      text: out.text,
      fields: out.fields,
      msNote: out.channel
    };
  }, { form, ref, gate });
  const detected = run.fields || [];
  const used = new Set();
  const pairs = [];
  record.fields.forEach((field, index) => {
    let match = null;
    detected.forEach((item, di) => {
      if (used.has(di) || match) return;
      if (hit(item, field.rect)) match = { item, di };
    });
    if (!match) {
      if (field.kind !== 'other') detFN += 1;
      pairs.push({ gold: field.label_drawn, detected: '', kind: field.kind });
      return;
    }
    used.add(match.di);
    const sameLabel = String(match.item.label || '').toLowerCase().replace(/\s+/g, ' ') === field.label_drawn.toLowerCase();
    const sameKind = fieldKind(match.item) === field.kind;
    if (field.kind === 'other') detFP += 1;
    else if (sameKind) {
      detTP += 1;
      if (sameLabel) labelOK += 1;
    } else detFP += 1;
    pairs.push({ gold: field.label_drawn, detected: match.item.label, kind: field.kind, sameKind, sameLabel });
  });
  detected.forEach((item, di) => { if (!used.has(di)) detFP += 1; });
  const decisions = decideAll(detected, run.text, gate, { channel: run.channel });
  const answerable = record.fields.filter((field) => field.answerable);
  let correct = 0;
  let wrong = 0;
  let review = 0;
  let reviewCorrect = 0;
  let abstain = 0;
  answerable.forEach((field) => {
    const matches = detected.filter((item) => fieldKind(item) === field.kind && !/patient/.test(String(item.label || '').toLowerCase()) === !/patient/.test(field.label_drawn.toLowerCase()));
    const one = matches.length === 1 ? matches[0] : null;
    const decision = one ? decisions.find((row) => row.fieldId === one.id) : null;
    const value = decision ? decision.value || '' : '';
    const same = norm(field.kind, value) === norm(field.kind, field.gold);
    const other = (record.other_values[field.kind] || []).some((item) => norm(field.kind, item) === norm(field.kind, value) && value);
    if (decision && decision.decision === 'autofill') {
      if (same && !other) correct += 1;
      else wrong += 1;
    } else if (decision && decision.decision === 'review' && value) {
      review += 1;
      if (same && !other) reviewCorrect += 1;
    } else abstain += 1;
  });
  rows.push({
    id: record.id,
    ms: Date.now() - started,
    kind: run.kind,
    channel: run.channel,
    detected: detected.length,
    pairs,
    answerable: answerable.length,
    correct, wrong, review, reviewCorrect, abstain,
    text: String(run.text || '').slice(0, 220)
  });
  console.log(record.id, run.kind, run.channel, 'fields', detected.length, 'fill', correct + '/' + answerable.length, 'wrong', wrong, 'ms', Date.now() - started);
}
await browser.close();
const prec = detTP + detFP ? detTP / (detTP + detFP) : null;
const recall = detTP + detFN ? detTP / (detTP + detFN) : null;
const summary = {
  split,
  ms: Date.now() - t0,
  detection: { tp: detTP, fp: detFP, fn: detFN, precision: prec, recall, labelExact: labelOK },
  fill: rows.reduce((acc, row) => {
    acc.answerable += row.answerable;
    acc.correct += row.correct;
    acc.wrong += row.wrong;
    acc.review += row.review;
    acc.reviewCorrect += row.reviewCorrect;
    acc.abstain += row.abstain;
    return acc;
  }, { answerable: 0, correct: 0, wrong: 0, review: 0, reviewCorrect: 0, abstain: 0 }),
  rows
};
const tag = process.argv[3] || 'score';
writeFileSync(join(root, 'results', split + '-' + tag + '.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ detection: summary.detection, fill: summary.fill }, null, 2));
