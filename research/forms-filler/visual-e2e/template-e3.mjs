#!/usr/bin/env node
/** Exact blank-map reuse. Scripted steps are not human timing. */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { chromium } = pkg;
const root = dirname(fileURLToPath(import.meta.url));
const shot = join(root, 'results/screenshots');
const art = '/opt/cursor/artifacts';
mkdirSync(art, { recursive: true });
const report = { browser: 'Chrome headless', scriptedSteps: 0, checks: [], limits: [] };
function check(name, ok, detail) {
  report.checks.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'ok ' : 'FAIL ') + name + (detail ? ' ' + detail : ''));
}
function step() { report.scriptedSteps += 1; }

const dir = join(root, 'results');
async function blank(path, mark) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 540]);
  const form = doc.getForm();
  form.createTextField('Email line').addToPage(page, { x: 40, y: 40, width: 180, height: 16 });
  if (mark) {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText(mark, { x: 40, y: 500, size: 10, font });
  }
  doc.addPage([420, 540]);
  writeFileSync(path, await doc.save());
}
await blank(join(dir, 'blank-a.pdf'), '');
await blank(join(dir, 'blank-b.pdf'), 'other');
await blank(join(dir, 'blank-a-changed.pdf'), 'x');

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1100, height: 820 } });
await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await page.waitForFunction(() => window.FormProfiles && window.FormMaps);
check('saved values start collapsed', await page.locator('#profileBox').isHidden());
await page.evaluate(async () => {
  await FormProfiles.clearAll();
  await FormMaps.clearAll();
  const loaded = await FormProfiles.load();
  loaded.vault.profiles.push({
    id: 'SENTINEL_PROFILE_ADA', name: 'SENTINEL_PERSON_AdaRecover', createdAt: '', updatedAt: '',
    facts: [
      { id: 'a1', key: 'email', label: 'email', value: 'SENTINEL_ADA_EMAIL', status: 'confirmed', origin: 'user', quote: 'SENTINEL_SOURCE_CROP', updatedAt: '' },
      { id: 'a2', key: 'name', label: 'name', value: 'SENTINEL_ADA_NAME', status: 'confirmed', origin: 'user', quote: '', updatedAt: '' },
      { id: 'a3', key: 'phone', label: 'phone', value: 'SENTINEL_ADA_PHONE', status: 'confirmed', origin: 'user', quote: '', updatedAt: '' }
    ]
  });
  loaded.vault.profiles.push({
    id: 'SENTINEL_PROFILE_BEA', name: 'SENTINEL_PERSON_BeaRecover', createdAt: '', updatedAt: '',
    facts: [
      { id: 'b1', key: 'email', label: 'email', value: 'SENTINEL_BEA_EMAIL', status: 'confirmed', origin: 'user', quote: '', updatedAt: '' },
      { id: 'b2', key: 'name', label: 'name', value: 'SENTINEL_BEA_NAME', status: 'confirmed', origin: 'user', quote: '', updatedAt: '' },
      { id: 'b3', key: 'phone', label: 'phone', value: 'SENTINEL_UNCONFIRMED_PHONE', status: 'extracted', origin: 'reference', quote: '', updatedAt: '' }
    ]
  });
  await FormProfiles.persist(loaded.vault);
});
check('seeding does not open saved values', await page.locator('#profileBox').isHidden());

await page.setInputFiles('#formInput', join(dir, 'blank-a.pdf'));
step();
await page.waitForFunction(() => !document.getElementById('placeMissing').disabled, null, { timeout: 20000 });
await page.click('#placeMissing');
step();
await page.waitForURL(/pdf-editor/);
await page.locator('#recoverPlace').waitFor();
await page.selectOption('#recoverPerson', 'SENTINEL_PROFILE_ADA');
await page.selectOption('#recoverFact', { label: 'email: SENTINEL_ADA_EMAIL' });
await page.click('#recoverPlace');
step();
await page.click('#nextPage');
step();
const cancelled = await page.locator('#recoverStatus').innerText();
check('switching page cancels an armed placement', /page changed/i.test(cancelled), cancelled);
const before = await page.locator('.ann').count();
await page.locator('.layer').nth(1).click({ position: { x: 80, y: 80 } });
step();
check('the other page does not receive the cancelled placement', await page.locator('.ann').count() === before);

await page.selectOption('#recoverFact', { label: 'name: SENTINEL_ADA_NAME' });
await page.click('#recoverPlace');
step();
await page.locator('.layer').nth(1).click({ position: { x: 70, y: 90 } });
step();
await page.click('#prevPage');
step();
await page.selectOption('#recoverFact', { label: 'email: SENTINEL_ADA_EMAIL' });
await page.click('#recoverPlace');
step();
await page.locator('.layer').nth(0).click({ position: { x: 60, y: 70 } });
step();
await page.selectOption('#recoverFact', { label: 'phone: SENTINEL_ADA_PHONE' });
await page.click('#recoverPlace');
step();
await page.locator('.layer').nth(0).click({ position: { x: 60, y: 140 } });
step();
await page.click('#mapSave');
step();
await page.locator('#recoverStatus', { hasText: 'does not keep the person' }).waitFor();
const raw = await page.evaluate(async () => JSON.stringify(await FormMaps.load()));
const leaked = ['SENTINEL_ADA_EMAIL', 'SENTINEL_ADA_NAME', 'SENTINEL_ADA_PHONE', 'SENTINEL_BEA', 'SENTINEL_PERSON', 'SENTINEL_PROFILE', 'SENTINEL_SOURCE', 'SENTINEL_FILE', 'blank-a.pdf'].filter((token) => raw.includes(token));
check('the stored map has no person, value, source, or filename', leaked.length === 0, leaked.join(',') || 'clean');
await page.screenshot({ path: join(shot, 'template-saved.png') });

await page.reload();
await page.locator('#mapPick option', { hasText: 'Blank map' }).waitFor({ state: 'attached' });
check('the map is still listed after reload', true);

await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await page.setInputFiles('#formInput', join(dir, 'blank-a.pdf'));
step();
await page.waitForFunction(() => !document.getElementById('placeMissing').disabled, null, { timeout: 20000 });
await page.click('#placeMissing');
step();
await page.locator('#mapPick option', { hasText: 'Blank map' }).waitFor({ state: 'attached' });
await page.selectOption('#recoverPerson', 'SENTINEL_PROFILE_BEA');
step();
await page.click('#mapPreview');
step();
await page.locator('#mapPreviewText', { hasText: 'Preview only' }).waitFor();
const preview = await page.locator('#mapPreviewText').innerText();
check('preview names Bea’s ready places and skips the unconfirmed phone', /nothing written/i.test(preview) && /phone/i.test(preview) && /no confirmed/i.test(preview), preview);
await page.click('#mapApply');
step();
await page.locator('#recoverStatus', { hasText: 'not an automatic fill' }).waitFor();
const applied = await page.locator('.ann-body').allTextContents();
check('apply writes only Bea on the reviewed places', applied.some((item) => item.includes('SENTINEL_BEA_EMAIL')) && applied.some((item) => item.includes('SENTINEL_BEA_NAME')) && !applied.some((item) => item.includes('SENTINEL_ADA') || item.includes('SENTINEL_UNCONFIRMED')), applied.join(' | '));
const countOnce = await page.locator('.ann').count();
await page.click('#mapApply');
step();
check('applying again replaces instead of doubling', await page.locator('.ann').count() === countOnce, String(countOnce));
await page.click('#recoverUndo');
step();
check('undo restores the previous apply', await page.locator('.ann').count() === countOnce);

const downloadPromise = page.waitForEvent('download');
await page.click('#downloadBtn');
step();
await page.locator('#sizeOptions button[data-level="100"]:not([disabled])').waitFor({ timeout: 20000 });
await page.click('#sizeOptions button[data-level="100"]');
step();
const download = await downloadPromise;
const outPath = join(dir, 'template-export.pdf');
await download.saveAs(outPath);
const exported = await page.evaluate(async (b64) => {
  const bin = atob(b64);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  const pdf = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const text = (await (await pdf.getPage(i)).getTextContent()).items.map((item) => item.str).join('\n');
    pages.push(text);
  }
  const doc = await PDFLib.PDFDocument.load(data);
  return { pages, widgets: doc.getForm().getFields().length };
}, readFileSync(outPath).toString('base64'));
check('page 1 has Bea’s email and page 2 has Bea’s name', exported.pages[0].includes('SENTINEL_BEA_EMAIL') && !exported.pages[0].includes('SENTINEL_BEA_NAME') && exported.pages[1].includes('SENTINEL_BEA_NAME') && !exported.pages[1].includes('SENTINEL_BEA_EMAIL'), JSON.stringify(exported.pages));
check('the export does not contain Ada or the unconfirmed phone', !JSON.stringify(exported.pages).includes('SENTINEL_ADA') && !JSON.stringify(exported.pages).includes('SENTINEL_UNCONFIRMED'));
check('native widgets are still in the export', exported.widgets === 1, String(exported.widgets));
await page.screenshot({ path: join(shot, 'template-applied.png') });

await page.click('#dlClose');
await page.click('#moreTools');
step();
await page.click('#movePageDown');
step();
await page.click('#mapApply');
step();
const reordered = await page.locator('#recoverStatus').innerText();
check('reordered pages are not applied', /reordered|rotated/i.test(reordered), reordered);

await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await page.setInputFiles('#formInput', join(dir, 'blank-b.pdf'));
step();
await page.waitForFunction(() => !document.getElementById('placeMissing').disabled, null, { timeout: 20000 });
await page.click('#placeMissing');
step();
await page.locator('#mapPick').waitFor();
const other = await page.locator('#mapPick').innerText();
check('a different blank has no map', /no map/i.test(other), other);
await page.setInputFiles('#fileInput', join(dir, 'blank-a-changed.pdf'));
step();
await page.locator('#mapPick').waitFor();
const changedPick = await page.locator('#mapPick').innerText();
check('a revised file does not match the saved map', /no map/i.test(changedPick), changedPick);

await page.setInputFiles('#fileInput', join(dir, 'blank-a.pdf'));
step();
await page.locator('#mapPick option', { hasText: 'Blank map' }).waitFor({ state: 'attached' });
await page.selectOption('#recoverRole', 'applicant');
await page.selectOption('#recoverPerson', 'SENTINEL_PROFILE_ADA');
await page.selectOption('#recoverFact', { label: 'email: SENTINEL_ADA_EMAIL' });
await page.click('#recoverPlace');
step();
await page.locator('.layer').first().click({ position: { x: 40, y: 180 } });
step();
await page.selectOption('#recoverRole', 'patient');
await page.click('#recoverPlace');
step();
await page.locator('.layer').first().click({ position: { x: 40, y: 240 } });
step();
await page.click('#mapSave');
step();
const mixed = await page.locator('#recoverStatus').innerText();
check('two roles are not saved as one map', /one role/i.test(mixed), mixed);

const quota = await page.evaluate(async () => {
  const real = DeskDB.set;
  DeskDB.set = function () { const err = new Error('full'); err.name = 'QuotaExceededError'; return Promise.reject(err); };
  const result = await FormMaps.persist(FormMaps.empty());
  DeskDB.set = real;
  return result.reason;
});
check('a full browser store reports quota and does not claim success', quota === 'quota', quota);
const hostile = await page.evaluate(() => {
  const version = FormMaps.migrate({ schema: 99, maps: [{ name: 'SENTINEL_PERSON_AdaRecover' }] });
  const bad = FormMaps.migrate({ schema: 1, maps: [{ fileSha256: 'aa', name: '__proto__', value: 'SENTINEL_ADA_EMAIL', pages: [] }] });
  return { version: version.reason, kept: JSON.stringify(bad).includes('SENTINEL_ADA_EMAIL') };
});
check('a bad map version and a hostile map are not kept', hostile.version === 'version' && hostile.kept === false, JSON.stringify(hostile));

await page.click('#mapDelete');
step();
await page.locator('#recoverStatus', { hasText: 'Deleted' }).waitFor();
const profilesLeft = await page.evaluate(async () => (await FormProfiles.load()).vault.profiles.length);
check('deleting a map keeps the people', profilesLeft === 2, String(profilesLeft));
page.once('dialog', (dialog) => dialog.accept());
await page.click('#mapClear');
step();
await page.locator('#recoverStatus', { hasText: 'Cleared every blank map' }).waitFor();

await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: join(shot, 'template-mobile.png'), fullPage: true });
const box = await page.locator('#mapBox').boundingBox();
check('the map controls fit a narrow viewport', !!box && box.width <= 390, JSON.stringify(box));
report.limits.push('The narrow screenshot is a viewport, not a phone.');
report.limits.push('Scripted steps are not a measured human time and not a speed claim.');
report.limits.push('Setup placed three lines by hand. Reuse was Preview plus Apply on the same blank, without placing those lines again. A revised file is a new valid PDF, not a corrupted byte, because a broken file would not open.');
report.limits.push('Current Chrome stable was not used. Scan autofill was not enabled.');
report.scriptedStepsNote = report.scriptedSteps;
writeFileSync(join(root, 'results/template-e3.json'), JSON.stringify(report, null, 2) + '\n');

function publish(name, src) {
  copyFileSync(src, join(art, name));
}
['template-saved.png', 'template-applied.png', 'template-mobile.png', 'recover-placed.png', 'recover-collapsed.png', 'recover-rotated-refused.png'].forEach((name) => {
  publish(name, join(shot, name));
});
publish('forms-filler-profiles-0.1.1.zip', join(root, '../../../tools/forms-filler/extension/forms-filler-profiles-0.1.1.zip'));
publish('template-export.pdf', outPath);

await browser.close();
const failed = report.checks.filter((item) => !item.ok);
console.log('steps', report.scriptedSteps, 'failed', failed.length);
if (failed.length) process.exit(1);
