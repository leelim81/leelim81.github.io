/** One map apply, then one undo, for the person who is selected.
 *  The original assisted-journey.mjs is unchanged. It still reads the preview and the
 *  first apply before those actions finish. This file waits for the completion text.
 *  Viewport 1280 by 900. This is not a phone. */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 500) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 300) : ''));
}
const doc = await PDFDocument.create();
doc.addPage([612, 792]).drawText('Line label', { x: 72, y: 700, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
writeFileSync('/tmp/assist-map-once.pdf', await doc.save());

const prompts = ['Ada Lane', 'Bea Shore'];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })).newPage();
page.setDefaultTimeout(20000);
page.on('dialog', async (dialog) => {
  if (dialog.type() === 'prompt') await dialog.accept(prompts.shift() || 'Ada Lane');
  else await dialog.accept();
});

async function marks() {
  return page.evaluate(() => Array.from(document.querySelectorAll('#pages .ann')).map((el) => ({
    text: ((el.querySelector('.ann-body') || {}).innerText || '').replace(/\u00a0/g, ' '),
    note: (el.querySelector('.ann-note') || {}).innerText || '',
    left: el.style.left,
    top: el.style.top
  })));
}
function sameMarks(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
async function saveGen() {
  return page.locator('#saveState').getAttribute('data-gen');
}
async function savedPast(gen) {
  await page.waitForFunction((prev) => {
    const el = document.getElementById('saveState');
    return !!(el && el.textContent === 'Saved' && Number(el.dataset.gen || 0) > Number(prev || 0));
  }, gen || '0');
}
async function place(label, xFrac, yFrac) {
  await page.locator('#recoverFact').selectOption({ label });
  await page.click('#recoverPlace');
  await page.waitForFunction(() => /Click the page/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
  const layer = page.locator('#pages .layer').first();
  const box = await layer.boundingBox();
  const gen = await saveGen();
  await layer.click({ position: { x: Math.round(box.width * xFrac), y: Math.round(box.height * yFrac) } });
  await page.waitForFunction((wanted) => new RegExp(wanted).test((document.getElementById('recoverStatus') || {}).textContent || ''), 'Placed Ada Lane');
  await savedPast(gen);
}

await page.goto('http://127.0.0.1:8777/tools/forms-filler/?maponce=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.evaluate(() => ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-maps', 'tools-forms-editor', 'tools-edit-sign-pdf'].forEach((name) => indexedDB.deleteDatabase(name)));
await page.reload({ waitUntil: 'domcontentloaded' });
async function addFact(key, value) {
  await page.locator('#factKey').selectOption(key);
  await page.locator('#factValue').fill(value);
  await page.click('#factAdd');
  await page.waitForFunction((wanted) => Array.from(document.querySelectorAll('#profileFacts input')).some((input) => input.value === wanted), value);
}
await page.click('#profileToggle');
await page.click('#profileAdd');
await page.waitForFunction(() => /Ada Lane/.test((document.getElementById('profilePick') || {}).innerText || ''));
await addFact('name', 'Ada Lane');
await addFact('address', '14 Harbour Lane');
const adaId = await page.locator('#profilePick').inputValue();
await page.click('#profileAdd');
await page.waitForFunction(() => /Bea Shore/.test((document.getElementById('profilePick') || {}).innerText || ''));
await page.locator('#profilePick').selectOption({ label: 'Bea Shore' });
await page.waitForFunction(() => {
  const pick = document.getElementById('profilePick');
  const option = pick && pick.selectedOptions[0];
  const inputs = Array.from(document.querySelectorAll('#profileFacts input'));
  return !!(option && option.textContent === 'Bea Shore' && inputs.every((input) => input.value !== 'Ada Lane' && input.value !== '14 Harbour Lane'));
});
await addFact('name', 'Bea Shore');
await addFact('address', '8 Pier Street');
const beaId = await page.locator('#profilePick').inputValue();
check('Ada and Bea have different ids', adaId && beaId && adaId !== beaId, adaId + ' ' + beaId);

await page.goto('http://127.0.0.1:8777/tools/pdf-editor/?sheet=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.locator('#fileInput').setInputFiles('/tmp/assist-map-once.pdf');
await page.waitForSelector('#pages canvas', { state: 'visible' });
await page.waitForFunction(() => /assist-map-once/.test((document.getElementById('fileName') || {}).textContent || ''));
if (await page.locator('#recoverBar').isHidden()) await page.click('#assistToggle');
await page.waitForFunction(() => /Ada Lane/.test((document.getElementById('recoverPerson') || {}).innerText || ''));
await page.locator('#recoverPerson').selectOption({ label: 'Ada Lane' });
await page.waitForFunction(() => /14 Harbour Lane/.test((document.getElementById('recoverFact') || {}).innerText || ''));
await place('name: Ada Lane', 0.32, 0.30);
await place('address: 14 Harbour Lane', 0.36, 0.46);
const adaMarks = await marks();
check('Ada’s two places are on the page before the map is saved', adaMarks.length === 2 && adaMarks.every((mark) => /Ada Lane/.test(mark.note) && /placed by you/.test(mark.note)), JSON.stringify(adaMarks));

if (await page.locator('#mapBox').isHidden()) await page.click('#mapToggle');
await page.locator('#mapName').fill('Line places');
await page.click('#mapSave');
await page.waitForFunction(() => /Saved Line places for this exact file/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
const mapLabel = await page.locator('#mapPick option:checked').innerText();
check('the blank map is offered for this file', mapLabel === 'Line places · applicant', mapLabel);

await page.locator('#recoverPerson').selectOption({ label: 'Bea Shore' });
await page.waitForFunction(() => /8 Pier Street/.test((document.getElementById('recoverFact') || {}).innerText || '') && document.querySelectorAll('#pages .ann').length === 0);
const before = await marks();
const beforePerson = await page.evaluate(() => {
  const pick = document.getElementById('recoverPerson');
  return { id: pick.value, label: pick.selectedOptions[0] ? pick.selectedOptions[0].textContent : '' };
});
check('Bea is selected and Ada’s marks are not visible before apply', beforePerson.id === beaId && beforePerson.label === 'Bea Shore' && before.length === 0, JSON.stringify(beforePerson) + ' ' + JSON.stringify(before));

await page.click('#mapPreview');
await page.waitForFunction(() => {
  const text = (document.getElementById('mapPreviewText') || {}).textContent || '';
  return text.indexOf('Preview only, nothing written.') === 0
    && text.indexOf('2 place(s), 0 left blank.') > 0
    && text.indexOf('applicant name would be placed.') > 0
    && text.indexOf('applicant address would be placed.') > 0
    && text.indexOf('Ada') < 0
    && text.indexOf('Bea') < 0
    && text.indexOf('Harbour') < 0
    && text.indexOf('Pier') < 0;
});
const previewMarks = await marks();
const previewText = await page.locator('#mapPreviewText').innerText();
check('a finished preview writes nothing and names no person', sameMarks(previewMarks, before), previewText + ' || ' + JSON.stringify(previewMarks));

const applyGen = await saveGen();
await page.click('#mapApply');
await page.waitForFunction(() => {
  const text = (document.getElementById('recoverStatus') || {}).textContent || '';
  return text.indexOf('Applied 2 place(s) for Bea Shore as applicant.') === 0;
});
await savedPast(applyGen);
const applied = await marks();
const appliedText = applied.map((mark) => mark.text).sort();
const appliedNotes = applied.map((mark) => mark.note).sort();
check('one apply writes exactly Bea’s name and address', appliedText.join(' | ') === '8 Pier Street | Bea Shore' && appliedNotes.join(' | ') === 'Bea Shore · address · placed by you | Bea Shore · name · placed by you' && !JSON.stringify(applied).includes('Ada') && !JSON.stringify(applied).includes('Harbour'), JSON.stringify(applied));

await page.click('#downloadBtn');
await page.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
const appliedDownload = page.waitForEvent('download');
await page.locator('#sizeOptions button[data-level="100"]').click();
const appliedFile = '/tmp/assist-map-once-applied.pdf';
await (await appliedDownload).saveAs(appliedFile);
await page.locator('#dlClose').click();
await page.waitForFunction(() => document.getElementById('downloadModal').hidden);

const undoGen = await saveGen();
await page.click('#recoverUndo');
await page.waitForFunction(() => (document.getElementById('recoverStatus') || {}).textContent === 'Undid the last placement change.');
await savedPast(undoGen);
const undone = await marks();
check('one undo restores the exact pre-apply marks', sameMarks(undone, before), JSON.stringify(undone));

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => /assist-map-once/.test((document.getElementById('fileName') || {}).textContent || ''));
await page.waitForFunction((id) => {
  const pick = document.getElementById('recoverPerson');
  return !!(pick && pick.value === id && pick.selectedOptions[0] && pick.selectedOptions[0].textContent === 'Bea Shore');
}, beaId);
await page.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Saved');
const reloaded = await marks();
const reloadedPerson = await page.evaluate(() => {
  const pick = document.getElementById('recoverPerson');
  return { id: pick.value, file: document.getElementById('fileName').textContent };
});
check('reload keeps the undone page, Bea’s id, and the same file', sameMarks(reloaded, before) && reloadedPerson.id === beaId && /assist-map-once/.test(reloadedPerson.file), JSON.stringify(reloaded) + ' ' + JSON.stringify(reloadedPerson));

await page.click('#downloadBtn');
await page.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
const undoneDownload = page.waitForEvent('download');
await page.locator('#sizeOptions button[data-level="100"]').click();
const undoneFile = '/tmp/assist-map-once-undone.pdf';
await (await undoneDownload).saveAs(undoneFile);

async function pdfText(file) {
  const bytes = Array.from(readFileSync(file));
  const probe = await browser.newPage();
  await probe.goto('http://127.0.0.1:8777/tools/forms-filler/?pdf=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await probe.waitForFunction(() => window.pdfjsLib);
  const text = await probe.evaluate(async (list) => {
    const opened = await pdfjsLib.getDocument({ data: new Uint8Array(list) }).promise;
    const content = await (await opened.getPage(1)).getTextContent();
    return content.items.map((item) => item.str).join(' ');
  }, bytes);
  await probe.close();
  return text.replace(/\s+/g, ' ').trim();
}
const appliedPdf = await pdfText(appliedFile);
const undonePdf = await pdfText(undoneFile);
check('the applied PDF has Bea’s values and not Ada’s', /Bea Shore/.test(appliedPdf) && /8 Pier Street/.test(appliedPdf) && !/Ada Lane/.test(appliedPdf) && !/Harbour/.test(appliedPdf), appliedPdf);
check('the undone PDF has neither person’s placed values', !/Bea Shore/.test(undonePdf) && !/Pier Street/.test(undonePdf) && !/Ada Lane/.test(undonePdf) && !/Harbour/.test(undonePdf) && /Line label/.test(undonePdf), undonePdf);

console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
