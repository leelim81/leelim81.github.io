/** A blank upload leads to adding a person, not a closed bar. */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { inflateSync } from 'zlib';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument } = require('pdf-lib');
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 240) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 180) : ''));
}
const doc = await PDFDocument.create();
doc.addPage([612, 792]);
writeFileSync('/tmp/first-blank.pdf', await doc.save());
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.setDefaultTimeout(30000);
await page.goto('http://127.0.0.1:8788/tools/forms-filler/?first=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-maps', 'tools-forms-editor'].forEach((name) => indexedDB.deleteDatabase(name));
  sessionStorage.clear();
});
await page.reload({ waitUntil: 'domcontentloaded' });
const chooser = page.waitForEvent('filechooser');
await page.click('#formDrop');
await (await chooser).setFiles('/tmp/first-blank.pdf');
await page.waitForFunction(() => {
  const button = document.getElementById('placeMissing');
  return button && !button.disabled && /No lines were found/.test((document.getElementById('readStatus') || {}).textContent || '');
});
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForFunction(() => /No one is saved yet/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
const opened = await page.evaluate(() => ({
  bar: !document.getElementById('recoverBar').hidden,
  status: document.getElementById('recoverStatus').textContent,
  place: document.getElementById('recoverPlace').disabled,
  text: !document.getElementById('toolbar').hidden,
  create: !document.getElementById('recoverCreate').hidden,
  addPerson: !document.getElementById('recoverAddPerson').hidden
}));
check('an empty store opens the placement bar with a way to add a person', opened.bar && opened.create && opened.addPerson && opened.place && opened.text && /Add a person/.test(opened.status), opened.status);
await page.locator('#recoverPersonName').focus();
await page.keyboard.press('Escape');
check('escape collapses the placement bar and leaves Text available', await page.locator('#recoverBar').isHidden() && await page.locator('#addText').isVisible());
await page.click('#assistToggle');
await page.waitForSelector('#recoverBar:not([hidden])');
await page.locator('#recoverAddPerson').click();
check('an empty name is not saved', /Type a name/.test(await page.locator('#recoverStatus').innerText()));
await page.locator('#recoverPersonName').fill('Ada Lane');
await page.click('#recoverAddPerson');
await page.waitForFunction(() => /no confirmed value yet/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
check('a person without a value cannot be placed', await page.locator('#recoverPlace').isDisabled() && await page.locator('#recoverFactCreate').isVisible());
await page.locator('#recoverFactValue').fill('Ada Lane');
await page.click('#recoverAddFact');
await page.waitForFunction(() => !document.getElementById('recoverPlace').disabled);
await page.click('#recoverPlace');
const before = await page.locator('#recoverStatus').innerText();
const layer = page.locator('#pages .layer').first();
const box = await layer.boundingBox();
await layer.click({ position: { x: box.width * 0.3, y: box.height * 0.4 } });
await page.waitForFunction((prev) => /Placed /.test((document.getElementById('recoverStatus') || {}).textContent || '') && (document.getElementById('recoverStatus') || {}).textContent !== prev, before);
check('the confirmed value is placed', (await page.locator('.ann-body').innerText()) === 'Ada Lane');
await page.click('#downloadBtn');
await page.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
const dl = page.waitForEvent('download');
await page.locator('#sizeOptions button[data-level="100"]').click();
const outPath = '/tmp/first-out.pdf';
await (await dl).saveAs(outPath);
const raw = readFileSync(outPath).toString('latin1');
const parts = [];
const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
let m;
while ((m = re.exec(raw))) {
  try { parts.push(inflateSync(Buffer.from(m[1], 'latin1'))); } catch (err) {}
}
const pdf = Buffer.concat(parts).toString('latin1').toLowerCase();
check('the export contains the placed name', pdf.includes(Buffer.from('Ada Lane').toString('hex')));
await page.click('#dlClose');
await page.reload();
await page.waitForSelector('.ann-body');
check('reload keeps the first placement', (await page.locator('.ann-body').allInnerTexts()).some((text) => text === 'Ada Lane'));
await page.goBack();
await page.waitForURL(/forms-filler/);
await page.click('#profileToggle');
await page.waitForSelector('#profileBox:not([hidden])');
page.once('dialog', (dialog) => dialog.accept('Bea Shore'));
await page.click('#profileAdd');
await page.waitForFunction(() => document.getElementById('profilePick').options.length > 1);
await page.locator('#profilePick').selectOption({ index: 1 });
await page.locator('#factKey').selectOption('name');
await page.locator('#factValue').fill('Bea Shore');
await page.click('#factAdd');
await page.waitForFunction(() => Array.from(document.querySelectorAll('#profileFacts input')).some((input) => input.value === 'Bea Shore'));
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForSelector('#pages .layer');
if (await page.locator('#recoverBar').isHidden()) await page.click('#assistToggle');
await page.locator('#recoverPerson').selectOption({ label: 'Bea Shore' });
await page.locator('#recoverFact').selectOption({ index: 0 });
await page.click('#recoverPlace');
const beforeBea = await page.locator('#recoverStatus').innerText();
const layer2 = page.locator('#pages .layer').first();
const box2 = await layer2.boundingBox();
await layer2.click({ position: { x: box2.width * 0.3, y: box2.height * 0.55 } });
await page.waitForFunction((prev) => /Placed /.test((document.getElementById('recoverStatus') || {}).textContent || '') && (document.getElementById('recoverStatus') || {}).textContent !== prev, beforeBea);
check('the second person can be placed', (await page.locator('.ann-body').allInnerTexts()).some((text) => text === 'Bea Shore'));
await page.click('#recoverUndo');
await page.waitForFunction(() => /Undid/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
check('undo removes the second placement', !(await page.locator('.ann-body').allInnerTexts()).some((text) => text === 'Bea Shore'));
await page.waitForFunction(() => /Saved/.test((document.getElementById('saveState') || {}).textContent || ''));
await page.reload();
await page.waitForTimeout(800);
check('reload does not bring the undone placement back', !(await page.locator('.ann-body').allInnerTexts()).some((text) => text === 'Bea Shore'));
await page.goto('http://127.0.0.1:8788/tools/forms-filler/?nativefirst=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.FormFields);
const read = await page.evaluate(async () => {
  const res = await fetch('/research/forms-filler/visual-e2e/fixtures/cc0/cc0-form.pdf');
  const result = await FormFields.read(new Uint8Array(await res.arrayBuffer()));
  return { route: result.route || result.kind, n: (result.fields || []).length, auto: FormThresholds.ocrAutofill.name };
});
check('native widgets are unchanged and scan autofill stays off', read.route === 'acro' && read.n === 5 && read.auto === false, JSON.stringify(read));
const out = { passed: checks.filter((item) => item.ok).length, failed: checks.filter((item) => !item.ok).length, checks };
writeFileSync('/tmp/inline-wt/research/forms-filler/visual-e2e/results/first-place.json', JSON.stringify(out, null, 2));
console.log('SUMMARY', out.passed, '/', checks.length);
await browser.close();
if (out.failed) process.exit(1);
