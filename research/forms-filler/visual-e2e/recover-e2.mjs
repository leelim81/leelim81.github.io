#!/usr/bin/env node
/** Browser check for placing a confirmed value on a missed line. Scripted steps are not human timing. */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const { chromium } = pkg;
const root = dirname(fileURLToPath(import.meta.url));
const shot = join(root, 'results/screenshots');
const report = { browser: 'Chrome headless', scriptedSteps: 0, checks: [], limits: [] };
function check(name, ok, detail) {
  report.checks.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'ok ' : 'FAIL ') + name);
}
function step() { report.scriptedSteps += 1; }

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await page.waitForFunction(() => window.FormProfiles);
const closed = await page.evaluate(() => document.getElementById('profileBox').hidden);
check('saved values stay collapsed', closed);
await page.screenshot({ path: join(shot, 'recover-collapsed.png') });
const href = await page.locator('#extensionZip').getAttribute('href');
const zipUrl = new URL(href, page.url()).href;
const zip = Buffer.from(await (await fetch(zipUrl)).arrayBuffer());
const disk = readFileSync(join(root, '../../../tools/forms-filler/extension/forms-filler-profiles-0.1.2.zip'));
check('download is the 0.1.2 zip byte for byte', href.endsWith('forms-filler-profiles-0.1.2.zip') && zip.equals(disk), createHash('sha256').update(zip).digest('hex'));

await page.evaluate(async () => {
  await FormProfiles.clearAll();
  const ada = await FormProfiles.load();
  ada.vault.profiles.push({ id: 'ada', name: 'Ada Recover', createdAt: '', updatedAt: '', facts: [
    { id: 'ada-mail', key: 'email', label: 'email', value: 'ada.recover@example.com', status: 'confirmed', origin: 'user', quote: '', updatedAt: '' },
    { id: 'ada-name', key: 'name', label: 'name', value: 'Ada Recover', status: 'confirmed', origin: 'user', quote: '', updatedAt: '' },
    { id: 'ada-phone', key: 'phone', label: 'phone', value: '80001111', status: 'extracted', origin: 'reference', quote: '', updatedAt: '' }
  ] });
  ada.vault.profiles.push({ id: 'bea', name: 'Bea Recover', createdAt: '', updatedAt: '', facts: [
    { id: 'bea-mail', key: 'email', label: 'email', value: 'bea.recover@example.com', status: 'confirmed', origin: 'user', quote: '', updatedAt: '' }
  ] });
  ada.vault.pending.push({ id: 'pend', key: 'email', value: 'other.recover@example.com', reason: 'conflict' });
  await FormProfiles.persist(ada.vault);
});
check('profile panel stayed closed after seeding', await page.locator('#profileBox').isHidden());

await page.setInputFiles('#formInput', join(root, 'fixtures/scan-audit/bent-margin.form.pdf'));
step();
await page.locator('#placeMissing').waitFor();
await page.waitForFunction(() => !document.getElementById('placeMissing').disabled, null, { timeout: 40000 });
check('a missed margin form can open placement', true);
await page.screenshot({ path: join(shot, 'recover-form-ready.png') });
await page.click('#placeMissing');
step();
await page.waitForURL(/pdf-editor/);
await page.locator('#recoverBar').waitFor();
await page.locator('#recoverPerson').waitFor();
const people = await page.locator('#recoverPerson option').allTextContents();
check('both people are offered', people.includes('Ada Recover') && people.includes('Bea Recover'), people.join(','));
const facts = await page.locator('#recoverFact option').allTextContents();
check('unconfirmed phone and the other person are not in Ada’s list', facts.some((item) => item.includes('ada.recover@example.com')) && !facts.some((item) => item.includes('80001111') || item.includes('bea.recover')), facts.join(' | '));
check('address is absent because Ada has no confirmed address', !facts.some((item) => /address/i.test(item)));
await page.screenshot({ path: join(shot, 'recover-bar.png') });

await page.selectOption('#recoverPerson', 'bea');
step();
await page.waitForFunction(() => Array.from(document.getElementById('recoverFact').options).some((opt) => opt.textContent.includes('bea.recover@example.com')));
const beaFacts = await page.locator('#recoverFact option').allTextContents();
check('the same key shows Bea’s own email', beaFacts.length === 1 && beaFacts[0].includes('bea.recover@example.com'), beaFacts.join('|'));
await page.selectOption('#recoverPerson', 'ada');
step();
await page.selectOption('#recoverFact', { label: 'email: ada.recover@example.com' });
step();
const before = await page.locator('.ann').count();
await page.click('#recoverPlace');
step();
await page.click('#recoverCancel');
step();
await page.locator('.layer').click({ position: { x: 80, y: 80 } });
step();
check('cancel adds nothing', await page.locator('.ann').count() === before);

await page.click('#recoverPlace');
step();
await page.locator('.layer').click({ position: { x: 460, y: 200 } });
step();
await page.locator('.ann-body').waitFor();
const placed = await page.locator('.ann-body').innerText();
const note = await page.locator('.ann-note').innerText();
check('the placed line is Ada’s confirmed email and names her', placed.includes('ada.recover@example.com') && /Ada Recover/.test(note) && /placed by you/.test(note), placed + ' / ' + note);
await page.screenshot({ path: join(shot, 'recover-placed.png') });
const x0 = await page.evaluate(() => {
  const id = document.querySelector('.ann').dataset.id;
  const pages = window.__pages;
  return null;
});
const xBefore = await page.evaluate(() => document.querySelector('.ann').style.left);
await page.click('#nudgeRight');
step();
const xAfter = await page.evaluate(() => document.querySelector('.ann').style.left);
check('a button nudge moves the line without dragging', xAfter !== xBefore, xBefore + ' -> ' + xAfter);
await page.keyboard.press('ArrowLeft');
step();
await page.click('#recoverUndo');
step();
await page.click('#recoverUndo');
step();
const xUndone = await page.evaluate(() => document.querySelector('.ann') ? document.querySelector('.ann').style.left : 'gone');
check('undo restores the line', xUndone === xBefore, xUndone);

await page.locator('.ann-body').click();
step();
await page.keyboard.press('End');
await page.keyboard.type('!');
step();
await page.waitForTimeout(300);
const edited = await page.evaluate(async () => {
  const loaded = await FormProfiles.load();
  const ada = loaded.vault.profiles.find((item) => item.id === 'ada');
  const bea = loaded.vault.profiles.find((item) => item.id === 'bea');
  return {
    ada: ada.facts.find((item) => item.key === 'email'),
    bea: bea.facts.find((item) => item.key === 'email').value
  };
});
check('editing the placed text updates only Ada and keeps Bea', edited.ada.value.indexOf('ada.recover@example.com') === 0 && edited.ada.origin === 'pdf-field' && edited.bea === 'bea.recover@example.com', JSON.stringify(edited));

await page.reload();
await page.locator('.ann-body').waitFor();
check('the placed line is still there after reload', (await page.locator('.ann-body').innerText()).includes('ada.recover@example.com'));

const downloadPromise = page.waitForEvent('download');
await page.click('#downloadBtn');
step();
await page.locator('#sizeOptions button[data-level="100"]:not([disabled])').waitFor({ timeout: 20000 });
await page.click('#sizeOptions button[data-level="100"]');
step();
const download = await downloadPromise;
const outPath = join(root, 'results/recover-export.pdf');
await download.saveAs(outPath);
const exported = await page.evaluate(async (bytes) => {
  const data = new Uint8Array(bytes);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const view = (await pdf.getPage(1)).getViewport({ scale: 1 });
  const items = (await (await pdf.getPage(1)).getTextContent()).items.map((item) => ({
    str: item.str,
    x: item.transform[4],
    y: item.transform[5]
  }));
  const hit = items.find((item) => String(item.str).includes('ada.recover'));
  return { pages: pdf.numPages, w: view.width, h: view.height, hit, bea: items.some((item) => String(item.str).includes('bea.recover')) };
}, Array.from(readFileSync(outPath)));
check('export draws Ada on the page and not Bea', exported.pages === 1 && exported.hit && exported.hit.x >= 0 && exported.hit.x <= exported.w && exported.hit.y >= 0 && exported.hit.y <= exported.h && !exported.bea, JSON.stringify(exported));

await page.setViewportSize({ width: 390, height: 844 });
if (await page.locator('#downloadModal').isVisible().catch(() => false)) await page.click('#dlClose');
if (await page.locator('#recoverBar').isHidden()) await page.click('#assistToggle');
await page.locator('#recoverBar').waitFor({ state: 'visible' });
await page.screenshot({ path: join(shot, 'recover-mobile.png'), fullPage: true });
const barBox = await page.locator('#recoverBar').boundingBox();
check('the placement bar fits a narrow viewport', !!barBox && barBox.width <= 390, JSON.stringify(barBox));
report.limits.push('The narrow screenshot is a viewport, not a phone.');

await page.setViewportSize({ width: 1100, height: 800 });
await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await page.setInputFiles('#formInput', join(root, 'fixtures/place-holdout/moss-turned.form.pdf'));
step();
await page.waitForFunction(() => /not offered|not turned|place the values yourself/i.test(document.getElementById('readStatus').textContent || ''), null, { timeout: 40000 });
const turnedScan = await page.locator('#readStatus').innerText();
check('a rotated scan is not given a guessed line', /not turned|not offered|place the values yourself/i.test(turnedScan) && !/scan estimates/i.test(turnedScan), turnedScan);
await page.click('#placeMissing');
step();
await page.waitForURL(/pdf-editor/);
await page.waitForFunction(() => document.querySelector('#recoverFact option'));
await page.click('#recoverPlace');
step();
await page.waitForFunction(() => /Click the page|quarter turn|not placed/i.test(document.getElementById('recoverStatus').textContent));
const turnedArmed = await page.locator('#recoverStatus').innerText();
check('a rotated page can take a value placed by hand', /Click the page/i.test(turnedArmed), turnedArmed);
await page.locator('.layer').click({ position: { x: 80, y: 40 } });
step();
await page.locator('.ann').waitFor();
check('the rotated page gained the placed line', await page.locator('.ann').count() === 1);
await page.screenshot({ path: join(shot, 'recover-rotated-placed.png') });

await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await page.setInputFiles('#formInput', join(root, 'fixtures/place-holdout/moss-widgets.form.pdf'));
step();
await page.waitForFunction(() => !document.getElementById('placeMissing').disabled, null, { timeout: 20000 });
await page.click('#placeMissing');
step();
await page.locator('#recoverPlace').waitFor();
await page.selectOption('#recoverPerson', 'ada');
await page.click('#recoverPlace');
step();
const nativeStatus = await page.locator('#recoverStatus').innerText();
check('native widgets can take a manual line', !/rotated|cropped|scale/i.test(nativeStatus), nativeStatus);
await page.locator('.layer').click({ position: { x: 80, y: 100 } });
step();
const nativeDownload = page.waitForEvent('download');
await page.click('#downloadBtn');
await page.locator('#sizeOptions button[data-level="100"]:not([disabled])').waitFor({ timeout: 20000 });
await page.click('#sizeOptions button[data-level="100"]');
const nativeFile = await nativeDownload;
const nativePath = join(root, 'results/recover-native.pdf');
await nativeFile.saveAs(nativePath);
const widgets = await page.evaluate(async (bytes) => {
  const doc = await PDFLib.PDFDocument.load(new Uint8Array(bytes));
  return doc.getForm().getFields().length;
}, Array.from(readFileSync(nativePath)));
check('the export still has the original widgets', widgets === 5, String(widgets));

for (const extra of [
  ['fixtures/scan-dev/grove-table.form.pdf', 'table'],
  ['fixtures/scan-dev/grove-narrow.form.pdf', 'short rule']
]) {
  await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
  await page.setInputFiles('#formInput', join(root, extra[0]));
  step();
  await page.waitForFunction(() => !document.getElementById('placeMissing').disabled, null, { timeout: 40000 });
  await page.click('#placeMissing');
  step();
  await page.locator('#recoverPlace').waitFor();
  await page.selectOption('#recoverPerson', 'ada');
  await page.click('#recoverPlace');
  step();
  await page.locator('.layer').first().click({ position: { x: 90, y: 120 } });
  step();
  const body = await page.locator('.ann-body').last().innerText();
  check('a missed spot on the ' + extra[1] + ' page can take Ada’s saved email', body.includes('ada.recover@example.com'), body);
}

await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await page.setInputFiles('#formInput', join(root, 'fixtures/place-holdout/moss-crop.form.pdf'));
step();
await page.waitForFunction(() => /not offered|not turned|place the values yourself|scan estimates/i.test(document.getElementById('readStatus').textContent || ''), null, { timeout: 40000 });
const cropScan = await page.locator('#readStatus').innerText();
check('a cropped scan is a review estimate or a manual fallback, not an automatic fill', /scan estimates|not turned|not offered|place the values yourself/i.test(cropScan), cropScan);
await page.click('#placeMissing');
step();
await page.waitForURL(/pdf-editor/);
await page.waitForFunction(() => document.querySelector('#recoverFact option'));
await page.click('#recoverPlace');
step();
await page.waitForFunction(() => /Click the page|crop could not|not placed/i.test(document.getElementById('recoverStatus').textContent));
const cropStatus = await page.locator('#recoverStatus').innerText();
check('a cropped page can take a value placed by hand', /Click the page/i.test(cropStatus), cropStatus);
await page.locator('.layer').click({ position: { x: 70, y: 50 } });
step();
check('the cropped page gained the placed line', await page.locator('.ann').count() === 1);

await page.evaluate(async () => { await FormProfiles.clearAll(); });
await page.reload();
if (await page.locator('#recoverBar').isHidden()) await page.click('#assistToggle');
await page.locator('#recoverStatus').waitFor();
const empty = await page.locator('#recoverStatus').innerText();
check('no saved person is explained and placement stays off', /no one is saved/i.test(empty) && await page.locator('#recoverPlace').isDisabled(), empty);

report.comparison = 'Placing the saved email did not type its characters. Typing it into the existing Text tool would be one click plus one key for each character. These are scripted action counts, not a measured human-time difference, and not a claim that a person is faster.';
report.limits.push('Steps counted here are scripted browser actions, not observed human time.');
report.limits.push('Current Chrome stable and phones were not used.');
report.limits.push('The current extension package is 0.1.2. The 0.1.1 gesture file remains the earlier record.');
writeFileSync(join(root, 'results/recover-e2.json'), JSON.stringify(report, null, 2) + '\n');
await browser.close();
const failed = report.checks.filter((item) => !item.ok);
console.log('steps', report.scriptedSteps, 'failed', failed.length);
if (failed.length) {
  console.log(JSON.stringify(failed, null, 2));
  process.exit(1);
}
