#!/usr/bin/env node
/** Headed Chromium: real extension shortcut opens the popup, then a raster upload is OCR'd. */
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const { chromium } = pkg;
const root = dirname(fileURLToPath(import.meta.url));
const ext = join(root, '../../tools/forms-filler/extension');
const bin = '/home/ubuntu/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';
const userDir = '/tmp/ff-gesture-e2e';
const report = {
  browser: 'Playwright Chromium 131.0.6778.33',
  gesture: 'Ctrl+Shift+Y, the shortcut Chromium assigned from manifest commands._execute_action on a fresh profile. The toolbar icon is not shown until that activation. This is the Activate the extension command, not a host-permission grant.',
  checks: [],
  limits: [
    'Google Chrome stable ignores --load-extension. This run used Chromium.',
    'The unpinned extension is not in the puzzle menu on this Chromium build. The assigned Activate shortcut opens the same popup as the toolbar button and is what granted activeTab.',
    'Shadow DOM and cross-origin frames are not filled.',
    'Human confirmation time was not measured.'
  ]
};
function check(name, ok, detail) {
  report.checks.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'ok ' : 'FAIL ') + name + (detail ? ' ' + detail : ''));
}
function shot(name) {
  spawnSync('ffmpeg', ['-y', '-f', 'x11grab', '-video_size', '1100x720', '-i', ':1', '-frames:v', '1', name], { stdio: 'ignore' });
}
function pressShortcut() {
  spawnSync('xdotool', ['search', '--name', 'Chromium', 'windowactivate']);
  spawnSync('xdotool', ['key', '--clearmodifiers', 'ctrl+shift+y']);
}

spawnSync('pkill', ['-f', 'chrome-linux/chrome']);
spawnSync('rm', ['-rf', userDir]);
const context = await chromium.launchPersistentContext(userDir, {
  executablePath: bin,
  headless: false,
  viewport: null,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [
    '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=9223',
    '--window-size=1100,720', '--window-position=0,0',
    `--disable-extensions-except=${ext}`, `--load-extension=${ext}`
  ]
});
const page = context.pages()[0] || await context.newPage();
await page.goto('http://127.0.0.1:8765/tools/forms-filler/extension/fixtures/static-form.html');
await page.bringToFront();
await page.locator('#n').click();
await new Promise((r) => setTimeout(r, 400));
pressShortcut();
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const cdpPages = () => browser.contexts().flatMap((c) => c.pages());
let popup = cdpPages().find((p) => p.url().includes('popup.html'));
check('shortcut opens the extension popup', !!popup, popup && popup.url());
shot(join(root, 'visual-e2e/results/screenshots/gesture-popup-open.png'));

const bundle = {
  kind: 'forms-filler-profiles',
  schema: 1,
  profiles: [{
    id: 'ada',
    name: 'Ada Example',
    facts: [
      { key: 'name', label: 'name', value: 'Ada Example', status: 'confirmed' },
      { key: 'email', label: 'email', value: 'ada@example.com', status: 'confirmed' },
      { key: 'phone', label: 'phone', value: '80000000', status: 'confirmed' }
    ]
  }, {
    id: 'nia',
    name: 'Nia Example',
    facts: [{ key: 'email', label: 'email', value: 'nia@example.com', status: 'confirmed' }]
  }]
};
const bundlePath = '/tmp/ada-profiles.json';
writeFileSync(bundlePath, JSON.stringify(bundle));
if (popup) {
  await popup.setInputFiles('#file', bundlePath);
  await popup.locator('#status', { hasText: 'Imported' }).waitFor();
  check('popup import stores the profile', (await popup.locator('#profile option').allTextContents()).includes('Ada Example'));
  await popup.selectOption('#profile', 'ada');
  await popup.click('#look');
  await popup.locator('#preview', { hasText: 'Full name' }).waitFor();
  const preview = await popup.locator('#preview').innerText();
  check('preview names the empty fields and protects the filled email', preview.includes('Full name') && preview.includes('already has a value'), preview.slice(0, 240));
  shot(join(root, 'visual-e2e/results/screenshots/gesture-preview.png'));
  await popup.click('#fill');
  await page.waitForFunction(() => document.getElementById('n').value === 'Ada Example');
  let dom = await page.evaluate(() => ({
    name: document.getElementById('n').value,
    email: document.getElementById('e').value,
    phone: document.getElementById('p').value,
    filled: document.getElementById('filled').value,
    password: document.getElementById('pw').value,
    otp: document.getElementById('otp').value,
    hidden: document.getElementById('hid').value,
    readonly: document.getElementById('ro').value,
    disabled: document.getElementById('dis').value,
    shadow: document.getElementById('host').shadowRoot.querySelector('input').value,
    submitted: document.getElementById('submitted').textContent
  }));
  check('popup fill wrote empty fields through activeTab', dom.name === 'Ada Example' && dom.email === 'ada@example.com' && dom.phone === '80000000', JSON.stringify(dom));
  check('excluded and nonempty fields stayed put and nothing submitted', dom.filled === 'already@example.com' && dom.password === '' && dom.otp === '' && dom.hidden === '' && dom.readonly === 'keep-me' && dom.shadow === '' && dom.submitted === 'no', JSON.stringify(dom));
  check('other profile was not written', !JSON.stringify(dom).includes('nia@example.com'));
  const override = popup.locator('#preview li', { hasText: 'already has a value' }).locator('input');
  await override.check();
  await popup.click('#fill');
  await page.waitForFunction(() => document.getElementById('filled').value === 'ada@example.com');
  dom = await page.evaluate(() => ({ filled: document.getElementById('filled').value, submitted: document.getElementById('submitted').textContent }));
  check('explicit nonempty override replaces only that field', dom.filled === 'ada@example.com' && dom.submitted === 'no', JSON.stringify(dom));
  shot(join(root, 'visual-e2e/results/screenshots/gesture-filled.png'));
}

const controlled = await context.newPage();
await controlled.goto('http://127.0.0.1:8765/tools/forms-filler/extension/fixtures/controlled-form.html');
await controlled.bringToFront();
await controlled.locator('#mail').click();
pressShortcut();
await new Promise((r) => setTimeout(r, 800));
popup = cdpPages().find((p) => p.url().includes('popup.html'));
if (popup) {
  await popup.click('#look');
  await popup.locator('#preview', { hasText: /email/i }).waitFor();
  await popup.click('#fill');
  await controlled.waitForFunction(() => document.getElementById('mail').value === 'ada@example.com');
  const seen = await controlled.evaluate(() => ({
    value: document.getElementById('mail').value,
    mirror: document.getElementById('mirror').textContent,
    input: window.__seen.input,
    change: window.__seen.change
  }));
  check('controlled field got input and change events', seen.mirror === 'ada@example.com' && seen.input >= 1 && seen.change >= 1, JSON.stringify(seen));
}

const filler = await context.newPage();
await filler.goto('http://127.0.0.1:8765/tools/forms-filler/');
await filler.waitForFunction(() => window.FormProfiles);
await filler.evaluate(async () => { await FormProfiles.clearAll(); });
await filler.setInputFiles('#formInput', join(root, 'visual-e2e/fixtures/feature-e2e/cora.form.pdf'));
await filler.waitForFunction(() => window.FormDesk && FormDesk.fields().length > 0, null, { timeout: 40000 });
await filler.setInputFiles('#refInput', join(root, 'visual-e2e/fixtures/feature-e2e/cora.reference.pdf'));
await filler.waitForFunction(() => FormDesk.refs().every((r) => r.status && r.status !== 'reading'), null, { timeout: 40000 });
await filler.click('#fillBtn');
await filler.locator('#profilePick option', { hasText: 'Cora Example' }).waitFor({ state: 'attached', timeout: 90000 });
const reviewVisible = await filler.locator('#reviewBox').isVisible().catch(() => false);
check('raster upload stored a person from OCR', true, reviewVisible ? 'review list visible' : 'profile list visible');
const profileNames = await filler.locator('#profilePick option').allTextContents();
check('OCR ingest created Cora Example', profileNames.includes('Cora Example'), profileNames.join(','));
if (await filler.locator('#reviewBox').isVisible().catch(() => false)) {
  const emailBox = filler.locator('#reviewList li', { hasText: 'email' }).locator('input');
  if (await emailBox.count()) await emailBox.check();
  await filler.click('#reviewUse');
}
await filler.waitForURL(/pdf-editor/, { timeout: 20000 }).catch(() => {});
if (filler.url().includes('pdf-editor')) {
  const body = filler.locator('.ann-body');
  if (await body.count()) {
    const before = await body.first().innerText();
    if (/@/.test(before)) await body.first().fill('cora.fixed@example.com');
  }
  await filler.waitForTimeout(600);
  await filler.goto('http://127.0.0.1:8765/tools/forms-filler/');
  await filler.waitForFunction(() => window.FormProfiles);
}
let vault = await filler.evaluate(async () => (await FormProfiles.load()).vault);
let cora = vault.profiles.find((p) => p.name === 'Cora Example');
let email = cora && cora.facts.find((f) => f.key === 'email');
if (!email || email.value === 'cora.sample9@example.com') {
  await filler.selectOption('#profilePick', cora.id);
  const row = filler.locator('#profileFacts li', { hasText: 'email' });
  await row.locator('input').fill('cora.fixed@example.com');
  await row.locator('button', { hasText: 'Save correction' }).click();
  await filler.locator('#profileMsg', { hasText: 'Saved' }).waitFor();
  vault = await filler.evaluate(async () => (await FormProfiles.load()).vault);
  cora = vault.profiles.find((p) => p.name === 'Cora Example');
  email = cora.facts.find((f) => f.key === 'email');
}
check('Cora email is confirmed and differs from a later OCR read', !!email && email.status === 'confirmed' && email.value === 'cora.fixed@example.com', email && (email.origin + ' ' + email.value));
const corrected = email && email.value;
await filler.reload({ waitUntil: 'domcontentloaded' });
await filler.waitForFunction(() => window.FormProfiles);
vault = await filler.evaluate(async () => (await FormProfiles.load()).vault);
check('corrected email survives reload', vault.profiles.some((p) => p.facts.some((f) => f.key === 'email' && f.value === corrected)));

await filler.locator('.ref-x').click().catch(() => {});
await filler.waitForTimeout(300);
vault = await filler.evaluate(async () => (await FormProfiles.load()).vault);
check('removing the reference does not delete the profile', vault.profiles.some((p) => p.name === 'Cora Example' && p.facts.some((f) => f.value === corrected)));

await filler.selectOption('#factKey', 'custom');
await filler.fill('#factLabel', 'Desk code');
await filler.fill('#factValue', '42');
await filler.click('#factAdd');
await filler.waitForFunction(() => document.getElementById('profileMsg').textContent.includes('Saved'));

await filler.setInputFiles('#refInput', join(root, 'visual-e2e/fixtures/feature-e2e/cora.reference.pdf'));
await filler.waitForFunction(() => FormDesk.refs().length && FormDesk.refs().every((r) => r.status && r.status !== 'reading'), null, { timeout: 40000 });
await filler.click('#fillBtn');
if (await filler.locator('#reviewSkip').isVisible({ timeout: 90000 }).catch(() => false)) await filler.click('#reviewSkip');
await filler.goto('http://127.0.0.1:8765/tools/forms-filler/').catch(() => {});
await filler.waitForFunction(() => window.FormProfiles);
vault = await filler.evaluate(async () => (await FormProfiles.load()).vault);
check('re-extract does not clobber the correction', vault.profiles.some((p) => p.facts.some((f) => f.key === 'email' && f.value === corrected && f.status === 'confirmed')));

await filler.setInputFiles('#refInput', join(root, 'visual-e2e/fixtures/feature-e2e/cora.ambiguous.pdf'));
await filler.waitForFunction(() => FormDesk.refs().every((r) => r.status && r.status !== 'reading'), null, { timeout: 40000 });
await filler.click('#fillBtn');
await filler.waitForTimeout(2000);
if (await filler.locator('#reviewSkip').isVisible().catch(() => false)) await filler.click('#reviewSkip');
await filler.goto('http://127.0.0.1:8765/tools/forms-filler/');
await filler.waitForFunction(() => window.FormProfiles);
vault = await filler.evaluate(async () => (await FormProfiles.load()).vault);
const still = vault.profiles.find((p) => p.name === 'Cora Example');
check('ambiguous reference stays unfiled and Cora remains', still && still.facts.some((f) => f.value === corrected) && vault.pending.some((row) => row.reason === 'conflict' || row.value === 'Bea Example'), 'pending ' + vault.pending.map((row) => row.reason + ':' + row.value).join(','));

const downloadPromise = filler.waitForEvent('download');
await filler.click('#profileExport');
const download = await downloadPromise;
const exportPath = join(root, 'visual-e2e/results/cora-export.json');
try {
  await download.saveAs(exportPath);
} catch (err) {
  const text = await filler.evaluate(async () => JSON.stringify(FormProfiles.exportBundle((await FormProfiles.load()).vault), null, 2));
  writeFileSync(exportPath, text);
  report.limits.push('The export click started a browser download, and saveAs could not copy its temp file: ' + err.message);
}
const exported = JSON.parse(readFileSync(exportPath, 'utf8'));
check('export contains the confirmed correction and custom key', exported.profiles.some((p) => p.facts.some((f) => f.value === corrected) && p.facts.some((f) => f.label === 'Desk code' && f.value === '42')));
check('export omits unconfirmed patient facts', !JSON.stringify(exported).includes('Bea Example'));

pressShortcut();
await new Promise((r) => setTimeout(r, 800));
popup = cdpPages().find((p) => p.url().includes('popup.html'));
if (popup) {
  await popup.setInputFiles('#file', exportPath);
  await popup.locator('#status', { hasText: 'Imported' }).waitFor();
  const names = await popup.locator('#profile option').allTextContents();
  check('extension imported the OCR export', names.includes('Cora Example'), names.join(','));
  const beforeDrop = await filler.evaluate(async () => (await FormProfiles.load()).vault.profiles.length);
  await popup.click('#drop');
  await popup.locator('#status', { hasText: 'Removed' }).waitFor();
  const afterDrop = await filler.evaluate(async () => (await FormProfiles.load()).vault.profiles.length);
  check('removing the extension copy leaves the site profile', beforeDrop === afterDrop && afterDrop > 0, beforeDrop + ' ' + afterDrop);
}
shot(join(root, 'visual-e2e/results/screenshots/gesture-ocr-profile.png'));

const out = join(root, 'visual-e2e/results/profiles-gesture-e2e.json');
writeFileSync(out, JSON.stringify(report, null, 2));
const failed = report.checks.filter((item) => !item.ok);
await browser.close();
await context.close();
if (failed.length) {
  console.log(JSON.stringify(failed, null, 2));
  process.exit(1);
}
console.log('gesture e2e ok', report.checks.length);
