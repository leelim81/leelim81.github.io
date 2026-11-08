/** A reference read finishes, abstains, or times out. It does not stay on Reading. */
import { copyFileSync, readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { chromium } = pkg;
const root = '/tmp/inline-wt/research/forms-filler/visual-e2e/fixtures/feature-e2e';
const amb = readFileSync(root + '/cora.ambiguous.pdf');
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 300) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 220) : ''));
}
const textDoc = await PDFDocument.create();
const page = textDoc.addPage([400, 200]);
const font = await textDoc.embedFont(StandardFonts.Helvetica);
page.drawText('Applicant full name is Ada Example and the phone is 80000000 today.', { x: 20, y: 120, size: 12, font });
writeFileSync('/tmp/ref-text.pdf', await textDoc.save());
writeFileSync('/tmp/ref-corrupt.pdf', Buffer.from('this is not a pdf'));
copyFileSync(root + '/cora.ambiguous.pdf', '/tmp/cora-hold.pdf');
copyFileSync(root + '/cora.ambiguous.pdf', '/tmp/cora-budget.pdf');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const ui = await browser.newPage({ viewport: { width: 1100, height: 800 } });
ui.setDefaultTimeout(30000);
await ui.goto('http://127.0.0.1:8788/tools/forms-filler/?read=' + Date.now(), { waitUntil: 'domcontentloaded' });
await ui.waitForFunction(() => window.FormExtract);
const paired = await ui.evaluate(async (b64) => {
  const bin = atob(b64);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  const started = performance.now();
  const both = await Promise.all([FormExtract.spatial(data, 'application/pdf'), FormExtract.spatial(data.slice(0), 'application/pdf')]);
  return {
    ms: Math.round(performance.now() - started),
    names: both.map((item) => ({ bea: /bea/i.test(item.text || ''), cora: /cora/i.test(item.text || ''), chars: (item.text || '').replace(/\s/g, '').length }))
  };
}, amb.toString('base64'));
check('two overlapping reads of the ambiguous scan both finish', paired.ms < 20000 && paired.names.every((item) => item.bea && item.cora), JSON.stringify(paired));

await ui.evaluate(() => {
  ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-maps', 'tools-forms-editor'].forEach((name) => indexedDB.deleteDatabase(name));
  sessionStorage.clear();
});
await ui.reload({ waitUntil: 'domcontentloaded' });
await ui.click('#profileToggle');
ui.once('dialog', (dialog) => dialog.accept('Cora Example'));
await ui.click('#profileAdd');
await ui.waitForFunction(() => Array.from(document.getElementById('profilePick').options).some((opt) => opt.textContent === 'Cora Example'));
await ui.locator('#factKey').selectOption('email');
await ui.locator('#factValue').fill('cora.fixed@example.com');
await ui.click('#factAdd');
await ui.waitForFunction(() => /Saved/.test((document.getElementById('profileMsg') || {}).textContent || ''));
await ui.locator('#refInput').setInputFiles(root + '/cora.ambiguous.pdf');
await ui.waitForFunction(() => {
  const refs = window.FormDesk.refs();
  return refs.length && refs.every((item) => item.status && item.status !== 'reading');
});
const read = await ui.evaluate(async () => {
  const refs = FormDesk.refs();
  const vault = (await FormProfiles.load()).vault;
  const cora = vault.profiles.filter((profile) => profile.name === 'Cora Example')[0];
  return { refs, email: cora && cora.facts.filter((fact) => fact.key === 'email')[0] };
});
check('the ambiguous scan leaves Reading without replacing the confirmed email', read.refs[0].status !== 'reading' && read.email && read.email.value === 'cora.fixed@example.com' && read.email.status === 'confirmed', JSON.stringify(read));

await ui.evaluate(() => { window.__ffOcrBudgetMs = 1; });
await ui.locator('#refInput').setInputFiles('/tmp/cora-budget.pdf');
await ui.waitForFunction(() => {
  const refs = window.FormDesk.refs();
  return refs.some((item) => item.name === 'cora-budget.pdf' && item.status && item.status !== 'reading');
});
const timed = await ui.evaluate(async () => {
  const ref = FormDesk.refs().filter((item) => item.name === 'cora-budget.pdf')[0];
  const preview = Array.from(document.querySelectorAll('.ref-preview')).map((node) => node.textContent).join(' | ');
  const vault = (await FormProfiles.load()).vault;
  const cora = vault.profiles.filter((profile) => profile.name === 'Cora Example')[0];
  return { status: ref && ref.status, preview, email: cora && cora.facts.filter((fact) => fact.key === 'email')[0] };
});
check('a read that exceeds its budget says so and keeps the confirmed email', timed.status === 'error' && /too long to read/.test(timed.preview) && timed.email && timed.email.value === 'cora.fixed@example.com', JSON.stringify(timed));

await ui.evaluate(() => { window.__ffOcrBudgetMs = 0; window.__ffHoldOcr = new Promise((resolve) => { window.__releaseOcr = resolve; }); });
await ui.locator('#refInput').setInputFiles('/tmp/cora-hold.pdf');
await ui.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'cora-hold.pdf' && item.status === 'reading'));
await ui.locator('.ref-row', { hasText: 'cora-hold.pdf' }).locator('.ref-x').click();
await ui.evaluate(() => window.__releaseOcr && window.__releaseOcr());
await ui.waitForTimeout(500);
const cancelled = await ui.evaluate(async () => {
  const vault = (await FormProfiles.load()).vault;
  return { refs: FormDesk.refs().map((item) => item.name + ':' + item.status), people: vault.profiles.map((profile) => profile.name) };
});
check('removing a reference cancels its read and adds no person', !cancelled.refs.some((item) => item.indexOf('cora-hold.pdf') === 0) && cancelled.people.join(',') === 'Cora Example', JSON.stringify(cancelled));

await ui.locator('#refInput').setInputFiles('/tmp/ref-text.pdf');
await ui.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'ref-text.pdf' && item.status && item.status !== 'reading'));
const textRead = await ui.evaluate(() => FormDesk.refs().filter((item) => item.name === 'ref-text.pdf')[0]);
check('a text pdf finishes without staying on Reading', textRead && textRead.status !== 'reading' && textRead.status !== 'error', JSON.stringify(textRead));

await ui.locator('#refInput').setInputFiles('/tmp/ref-corrupt.pdf');
await ui.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'ref-corrupt.pdf' && item.status && item.status !== 'reading'));
const corrupt = await ui.evaluate(() => FormDesk.refs().filter((item) => item.name === 'ref-corrupt.pdf')[0]);
check('a corrupt file is an error, not a successful empty read', corrupt && corrupt.status === 'error', JSON.stringify(corrupt));

await ui.click('#clearBtn');
await ui.waitForFunction(() => /Started over/.test((document.getElementById('readStatus') || {}).textContent || ''));
const cleared = await ui.evaluate(async () => (await FormProfiles.load()).vault.profiles.map((profile) => profile.name));
check('start over does not delete the confirmed person', cleared.join(',') === 'Cora Example', cleared.join(','));

const out = { passed: checks.filter((item) => item.ok).length, failed: checks.filter((item) => !item.ok).length, checks, paired };
writeFileSync('/tmp/inline-wt/research/forms-filler/visual-e2e/results/ref-read.json', JSON.stringify(out, null, 2));
console.log('SUMMARY', out.passed, '/', checks.length, 'paired-ms', paired.ms);
await browser.close();
if (out.failed) process.exit(1);
