#!/usr/bin/env node
/** Run one split in the browser. The page receives PDF bytes and a gate, never the answer key. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const { chromium } = pkg;
const root = dirname(fileURLToPath(import.meta.url));
const split = process.argv[2];
const mode = process.argv[3] || 'score';
if (!/^[a-z0-9-]+$/.test(split)) throw new Error('bad split name');
if (split === 'test' && !existsSync(join(root, 'FROZEN-e2e.json'))) {
  throw new Error('Refusing the test split before FROZEN-e2e.json exists');
}

const gold = readFileSync(join(root, 'gold', `${split}.jsonl`), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const frozen = mode === 'probe'
  ? {
      autofill: { name: true, nric: true, dob: true, phone: true, email: true, address: true, postal: true, mailbox: true },
      ocrAutofill: { name: true, nric: true, dob: true, phone: true, email: true, address: true, postal: true, mailbox: true }
    }
  : JSON.parse(readFileSync(join(root, 'FROZEN-e2e.json'), 'utf8'));

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8765/tools/forms-filler/bench.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.FormBench && window.FormExtract);

const outDir = join(root, 'results');
mkdirSync(outDir, { recursive: true });
const rows = [];
for (const record of gold) {
  const started = Date.now();
  const form = readFileSync(join(root, record.form_pdf));
  const ref = readFileSync(join(root, record.reference_pdf));
  const result = await page.evaluate(async ({ form, ref, frozen, paint }) => {
    function toBytes(list) { return new Uint8Array(list); }
    const run = await FormBench.run(toBytes(form), toBytes(ref), frozen, paint);
    delete run.painted;
    return run;
  }, {
    form: Array.from(form),
    ref: Array.from(ref),
    frozen,
    paint: mode === 'probe' ? 'probe' : 'autofill'
  });
  rows.push({
    id: record.id,
    ms: Date.now() - started,
    kind: result.kind,
    channel: result.channel,
    text: result.text,
    words: result.words,
    transform: result.transform,
    fields: result.fields,
    candidate: result.candidate,
    baseline: result.baseline,
    placed: result.placed
  });
  console.log(JSON.stringify({ id: record.id, ms: rows[rows.length - 1].ms, channel: result.channel, fields: result.fields.length, text: String(result.text || '').slice(0, 180) }));
}
writeFileSync(join(outDir, `${split}-${mode}.json`), JSON.stringify({ split, mode, frozen: mode === 'probe' ? 'probe' : frozen.ocrAutofill, rows }, null, 2));
await browser.close();
