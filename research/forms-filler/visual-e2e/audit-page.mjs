#!/usr/bin/env node
/** Real page upload of the frozen native mixed form. Not an extension test. */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const { chromium } = pkg;
const root = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const page = await browser.newPage();
const report = [];
function check(name, ok, detail) {
  report.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'ok ' : 'FAIL ') + name + (detail ? ' ' + detail : ''));
}
await page.goto('http://127.0.0.1:8765/tools/forms-filler/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.FormProfiles);
await page.evaluate(async () => { await FormProfiles.clearAll(); });
await page.setInputFiles('#formInput', join(root, 'fixtures/audit-quill/quill-native-01.form.pdf'));
await page.waitForFunction(() => window.FormDesk && FormDesk.fields().length === 7, null, { timeout: 20000 });
check('native form exposes 7 widgets', (await page.evaluate(() => FormDesk.fields().length)) === 7);
await page.setInputFiles('#refInput', join(root, 'fixtures/audit-quill/quill-native-01.reference.pdf'));
await page.waitForFunction(() => FormDesk.refs().every((r) => r.status && r.status !== 'reading'), null, { timeout: 20000 });
await page.click('#fillBtn');
await page.waitForTimeout(1500);
if (await page.locator('#reviewSkip').isVisible().catch(() => false)) await page.locator('#reviewSkip').click();
await page.waitForTimeout(800);
let vault = await page.evaluate(async () => (await FormProfiles.load()).vault);
const names = vault.profiles.map((p) => p.name);
check('patient-first reference saves Nils Quill', names.includes('Nils Quill'), names.join(','));
check('Ned Brook is not a saved profile', !names.includes('Ned Brook'), JSON.stringify(vault.pending.map((row) => row.role + ':' + row.value)));
const nils = vault.profiles.find((p) => p.name === 'Nils Quill');
check('saved facts are not the patient date', !!nils && nils.facts.every((fact) => fact.value !== '04/04/1974'));
await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await page.waitForFunction(() => window.FormProfiles);
await page.setInputFiles('#formInput', join(root, 'fixtures/audit-quill/quill-native-02.form.pdf'));
await page.waitForFunction(() => FormDesk.fields().length === 7);
await page.setInputFiles('#refInput', join(root, 'fixtures/audit-quill/quill-native-02.reference.pdf'));
await page.waitForFunction(() => FormDesk.refs().every((r) => r.status && r.status !== 'reading'));
await page.click('#fillBtn');
await page.waitForTimeout(1500);
if (await page.locator('#reviewSkip').isVisible().catch(() => false)) await page.locator('#reviewSkip').click();
vault = await page.evaluate(async () => (await FormProfiles.load()).vault);
check('two applicant names do not create a new profile', vault.profiles.length === 1 && vault.profiles[0].name === 'Nils Quill', vault.profiles.map((p) => p.name).join(','));
check('the conflict is pending', vault.pending.some((row) => row.reason === 'conflict'));
writeFileSync(join(root, 'results/audit-page.json'), JSON.stringify({ browser: 'Google Chrome 156.0.8078.47 headless', report }, null, 2) + '\n');
await browser.close();
if (report.some((item) => !item.ok)) process.exit(1);
