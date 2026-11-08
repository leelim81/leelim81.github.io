#!/usr/bin/env node
/** Route CC0 controls and two fetched government blanks. Does not print local paths. */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const { chromium } = pkg;
const root = dirname(fileURLToPath(import.meta.url));
const cases = [
  { id: 'cc0-form', file: join(root, 'fixtures/cc0/cc0-form.pdf'), sha: '5a681d44622f2ee577808e77f034525314d48a628b9cad26f7788564c9e922e8', expect: 'acro' },
  { id: 'cc0-blank', file: join(root, 'fixtures/cc0/cc0-blank-page.pdf'), sha: 'b2ec9ddd2ecdcabb89c212b2a0245ad24c3f0132fb6bf19d47d373b07dd6b58f', expect: 'empty' },
  { id: 'cc0-scanned', file: join(root, 'fixtures/cc0/cc0-scanned-negative.pdf'), sha: 'd32a62e246778d856c85b03bfc6c91c36c9a071756b733f78daf46b4253de634', expect: 'raster' },
  { id: 'irs-4506t', file: '/tmp/formcat/irs-4506t.pdf', sha: '4de7303eee766f31deb9afbb66aa538e8e04909d31307c494b328e69fbbe634e', expect: 'acro' },
  { id: 'gsa-sf91', file: '/tmp/formcat/gsa-sf91.pdf', sha: '18a11675590189964522114c294b8ea0974f86989fb7f49a31788ba2807d44ac', expect: 'acro' }
];

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const page = await browser.newPage();
page.setDefaultTimeout(90000);
await page.goto('http://127.0.0.1:8765/tools/forms-filler/bench.html');
await page.waitForFunction(() => window.FormFields);
const rows = [];
for (const item of cases) {
  if (!existsSync(item.file)) {
    rows.push({ id: item.id, skipped: true });
    continue;
  }
  const bytes = readFileSync(item.file);
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== item.sha) throw new Error(item.id + ' hash mismatch');
  const started = Date.now();
  const info = await page.evaluate(async (list) => {
    const read = await FormFields.read(new Uint8Array(list));
    const labels = (read.fields || []).map((field) => field.label);
    const opaque = labels.filter((label) => /topmost|subform|f1 /i.test(label)).length;
    return { route: read.route || read.kind, kind: read.kind, n: labels.length, opaque, sample: labels.slice(0, 4) };
  }, Array.from(bytes));
  const row = { id: item.id, ms: Date.now() - started, expect: item.expect, ...info, ok: info.route === item.expect };
  rows.push(row);
  console.log(item.id, row.ok ? 'ok' : 'FAIL', row.route, 'n', row.n, 'opaque', row.opaque, row.ms + 'ms', (row.sample || []).join(' | '));
}
writeFileSync(join(root, 'results/route-check.json'), JSON.stringify({ rows }, null, 2) + '\n');
await browser.close();
if (rows.some((row) => row.ok === false)) process.exit(1);
