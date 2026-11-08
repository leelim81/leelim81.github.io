#!/usr/bin/env node
/** One look at the placement holdout. Refuses a second look and a moved hash. */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
import { norm } from '../visual-gold/metrics.mjs';

const require = createRequire(import.meta.url);
const { decideAll } = require('../../../tools/forms-filler/select.js');
const { fieldKind } = require('../../../tools/forms-filler/evidence.js');
const { chromium } = pkg;
const root = dirname(fileURLToPath(import.meta.url));
const freezePath = join(root, 'PLACE-FREEZE.json');
const freeze = JSON.parse(readFileSync(freezePath, 'utf8'));
if (freeze.looked) throw new Error('place-holdout was already looked at');
function sha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
Object.entries(freeze.files).forEach(([rel, meta]) => {
  const got = sha(join(root, rel));
  if (got !== meta.sha256) throw new Error('Hash moved: ' + rel);
});
Object.entries(freeze.codeHashes).forEach(([rel, hash]) => {
  const got = sha(join(root, '../../..', rel));
  if (got !== hash) throw new Error('Code hash moved: ' + rel);
});

const gold = readFileSync(join(root, 'gold/place-holdout.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
const gate = { autofill: {}, ocrAutofill: { name: false, nric: false, dob: false, phone: false, email: false, address: false, postal: false, mailbox: false } };

function hit(det, goldRect) {
  if (!det || !det.rect || !goldRect) return false;
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
for (const record of gold) {
  const form = Array.from(readFileSync(join(root, record.form_pdf)));
  const ref = Array.from(readFileSync(join(root, record.reference_pdf)));
  const run = await page.evaluate(async ({ form, ref }) => {
    const formBytes = new Uint8Array(form);
    const refBytes = new Uint8Array(ref);
    const read = await FormFields.read(formBytes.slice(0));
    const spatial = await FormExtract.spatial(refBytes.slice(0), 'application/pdf');
    let exportDelta = null;
    if (read.fields && read.fields.length && read.bytes) {
      const doc = await PDFLib.PDFDocument.load(read.bytes.slice(0));
      const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
      const sheet = doc.getPages()[0];
      read.fields.forEach((field, index) => {
        if (!field.rect) return;
        sheet.drawText('M' + index, { x: field.rect.x + 2, y: field.rect.y + 4, size: 11, font });
      });
      const saved = new Uint8Array(await doc.save());
      const back = await pdfjsLib.getDocument({ data: saved.slice(0) }).promise;
      const items = (await (await back.getPage(1)).getTextContent()).items;
      const deltas = read.fields.map((field, index) => {
        const mark = items.find((item) => item.str === 'M' + index);
        if (!mark || !field.rect) return null;
        return { dx: Math.abs(mark.transform[4] - (field.rect.x + 2)), dy: Math.abs(mark.transform[5] - (field.rect.y + 4)) };
      }).filter(Boolean);
      if (deltas.length) exportDelta = { n: deltas.length, dx: Math.max(...deltas.map((item) => item.dx)), dy: Math.max(...deltas.map((item) => item.dy)) };
    }
    return {
      route: read.route,
      block: read.placementBlock || '',
      channel: spatial.channel,
      text: spatial.text,
      fields: (read.fields || []).map((field) => ({ id: field.id, label: field.label, rect: field.rect || null })),
      exportDelta
    };
  }, { form, ref });
  const row = { id: record.id, expect: record.expect, route: run.route, block: run.block, channel: run.channel, exportDelta: run.exportDelta, misses: [], wrongPlace: [], placed: 0 };
  if (record.expect === 'blocked') {
    row.ok = run.fields.length === 0 && !!run.block;
  } else if (record.expect === 'widgets') {
    row.ok = run.route === 'acro' && run.fields.length > 0 && !run.block;
    row.detected = run.fields.length;
  } else {
    const decisions = decideAll(run.fields, run.text, gate, { channel: 'ocr' });
    record.fields.forEach((field) => {
      const match = run.fields.find((item) => hit(item, field.rect) && fieldKind(item) === field.kind);
      if (!match) {
        row.misses.push(field.label_drawn);
        return;
      }
      const decision = decisions.find((item) => item.fieldId === match.id);
      const value = decision ? decision.value || '' : '';
      const same = norm(field.kind, value) === norm(field.kind, field.gold);
      const other = (record.other_values[field.kind] || []).some((item) => norm(field.kind, item) === norm(field.kind, value) && value);
      if (decision && decision.decision === 'autofill') row.wrongPlace.push(field.label_drawn + ' autofilled');
      else if (same && !other && decision && decision.decision === 'review') row.placed += 1;
      else if (same && !other) row.wrongPlace.push(field.label_drawn);
      else row.misses.push(field.label_drawn);
    });
    row.ok = row.misses.length === 0 && row.wrongPlace.length === 0 && run.exportDelta && run.exportDelta.dx < 1 && run.exportDelta.dy < 1;
    row.answerable = record.fields.length;
  }
  rows.push(row);
  console.log(record.id, row.ok ? 'ok' : 'FAIL', JSON.stringify(row));
}
await browser.close();
const summary = {
  split: 'place-holdout',
  nPlacementForms: rows.filter((row) => row.expect === 'place').length,
  note: 'Three placement forms. Not a population rate. Already-viewed Grove and audit pages were not re-scored here. OCR autofill stayed off.',
  rows
};
writeFileSync(join(root, 'results/place-holdout-once.json'), JSON.stringify(summary, null, 2) + '\n');
freeze.looked = true;
writeFileSync(freezePath, JSON.stringify(freeze, null, 2) + '\n');
const failed = rows.filter((row) => !row.ok);
if (failed.length) process.exit(1);
