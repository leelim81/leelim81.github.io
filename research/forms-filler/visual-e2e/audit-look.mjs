#!/usr/bin/env node
/** One look at the frozen audit family. Refuses to run if a fixture hash moved. */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
import { report } from './join.mjs';

const { chromium } = pkg;
const root = dirname(fileURLToPath(import.meta.url));
const freeze = JSON.parse(readFileSync(join(root, 'AUDIT-FREEZE.json'), 'utf8'));
if (freeze.looked) throw new Error('This family was already looked at. It is a regression set.');
for (const [rel, meta] of Object.entries(freeze.files)) {
  const bytes = readFileSync(join(root, rel));
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== meta.sha256) throw new Error('Hash moved before the look: ' + rel);
}
for (const [rel, sha] of Object.entries(freeze.codeHashes)) {
  const got = createHash('sha256').update(readFileSync(join(root, '../../..', rel))).digest('hex');
  if (got !== sha) throw new Error('Code hash moved before the look: ' + rel);
}

const run = spawnSync('node', ['run-split.mjs', 'audit', 'score'], { cwd: root, encoding: 'utf8' });
process.stdout.write(run.stdout || '');
process.stderr.write(run.stderr || '');
if (run.status !== 0) process.exit(run.status || 1);

const scored = report('audit', 'score');
const manual = { confirms: 0, types: 0, automatic: 0 };
scored.rows.forEach((row) => {
  if (!row.answerable) return;
  if (row.decision === 'autofill' && row.value) manual.automatic += 1;
  else if (row.decision === 'review' && row.value) manual.confirms += 1;
  else manual.types += 1;
});

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8765/tools/forms-filler/bench.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.FormBench);
const saved = JSON.parse(readFileSync(join(root, 'results/audit-score.json'), 'utf8'));
const geometry = [];
for (const row of saved.rows) {
  const form = Array.from(readFileSync(join(root, 'fixtures/audit-quill', row.id + '.form.pdf')));
  const reviews = (row.candidate || []).filter((item) => item.decision === 'review' && item.value);
  const autos = (row.candidate || []).filter((item) => item.decision === 'autofill' && item.value);
  const readback = await page.evaluate(async ({ form, jobs }) => {
    const bytes = new Uint8Array(form);
    const read = await FormFields.read(bytes);
    const values = {};
    jobs.forEach((job) => { values[job.fieldId] = job.value; });
    const painted = read.kind === 'acro'
      ? await FormFields.fill(bytes, read.fields, values, { flatten: true })
      : await (async () => {
        const doc = await PDFLib.PDFDocument.load(bytes.slice(0));
        const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
        const sheet = doc.getPages()[0];
        read.fields.forEach((field) => {
          const value = values[field.id];
          if (!value || !field.rect) return;
          sheet.drawText(String(value).slice(0, 80), { x: field.rect.x + 2, y: field.rect.y + 4, size: 11, font });
        });
        return new Uint8Array(await doc.save());
      })();
    const pdf = await pdfjsLib.getDocument({ data: painted.slice(0) }).promise;
    const content = await pdf.getPage(1).then((p) => p.getTextContent());
    const text = content.items.map((item) => item.str).join('\n');
    const hits = jobs.map((job) => ({ fieldId: job.fieldId, value: job.value, present: text.includes(String(job.value).slice(0, 12)) }));
    return { kind: read.kind, fields: read.fields.length, hits };
  }, { form, jobs: autos.concat(reviews) });
  geometry.push({ id: row.id, kind: readback.kind, fields: readback.fields, hits: readback.hits });
  console.log(row.id, readback.kind, 'widgets', readback.fields, 'readback', readback.hits.filter((hit) => hit.present).length + '/' + readback.hits.length);
}
await browser.close();

const out = {
  family: 'audit-quill',
  gate: 'shipped ocrAutofill false',
  denominator: 'answerable gold fields. Unavailable and not-answerable fields are counted separately and are not an all-blank win.',
  candidate: scored.candidate,
  baseline: scored.baseline,
  manualProxy: manual,
  manualNote: 'A review row is one confirmation. An answerable abstain is one value the user types. Automatic rows are not a manual step. Human time was not measured.',
  geometry,
  rows: scored.rows
};
writeFileSync(join(root, 'results/audit-look.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ candidate: scored.candidate, baseline: scored.baseline, manual }, null, 2));
