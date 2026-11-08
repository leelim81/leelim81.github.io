/** Composition is not saved until it ends on the mark that is still on the page.
 *  These composition events are dispatched in the page. This is not an operating-system input method.
 *  Viewport 390 by 700. This is not a phone. */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { inflateSync } from 'zlib';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { chromium } = pkg;
const LINE = 'one two three four five six seven eight nine ten';
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 500) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 320) : ''));
}
function flat(value) { return String(value || '').replace(/\u00a0/g, ' ').replace(/\n$/, ''); }
function decode(buf) {
  const raw = Buffer.from(buf).toString('latin1');
  const out = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = re.exec(raw))) {
    const chunk = Buffer.from(match[1], 'latin1');
    try { out.push(inflateSync(chunk)); } catch (err) { out.push(chunk); }
  }
  const body = Buffer.concat(out).toString('latin1');
  return [...body.matchAll(/<([0-9A-Fa-f\s]+)>/g)].map((item) => Buffer.from(item[1].replace(/\s+/g, ''), 'hex').toString('utf8')).join(' ');
}
const doc = await PDFDocument.create();
doc.addPage([612, 792]).drawText('Full name', { x: 72, y: 700, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
writeFileSync('/tmp/life-blank.pdf', await doc.save());
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 700 }, acceptDownloads: true })).newPage();
page.setDefaultTimeout(20000);
page.on('dialog', (dialog) => dialog.accept());
await page.goto('http://127.0.0.1:8777/tools/pdf-editor/?life=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.evaluate(() => ['tools-forms-editor', 'tools-forms-profiles'].forEach((name) => indexedDB.deleteDatabase(name)));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('#fileInput').setInputFiles('/tmp/life-blank.pdf');
await page.waitForFunction(() => window.PDFLib && document.querySelector('#pages .layer'));
await page.evaluate(() => {
  const orig = PDFLib.PDFDocument.create.bind(PDFLib.PDFDocument);
  PDFLib.PDFDocument.create = function () {
    return new Promise((resolve) => { window.__releaseFont = () => resolve(orig()); });
  };
});
await page.locator('#addText').click();
await page.locator('.ann-body').click();
await page.evaluate(() => document.activeElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
await page.keyboard.type('Keep');
const coldBefore = flat(await page.locator('.ann-body').innerText());
await page.evaluate(() => window.__releaseFont());
await page.waitForTimeout(250);
const coldAfter = flat(await page.locator('.ann-body').innerText());
check('a late font paint does not erase an open composition', coldBefore === 'Keep' && coldAfter === 'Keep', JSON.stringify({ coldBefore, coldAfter }));
await page.evaluate(() => document.activeElement.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'Keep' })));
check('ending that composition keeps the visible word', flat(await page.locator('.ann-body').innerText()) === 'Keep', flat(await page.locator('.ann-body').innerText()));

await page.evaluate(() => ['tools-forms-editor', 'tools-forms-profiles'].forEach((name) => indexedDB.deleteDatabase(name)));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  const loaded = await FormProfiles.load();
  const now = new Date().toISOString();
  const vault = loaded.vault;
  vault.profiles.push({ id: 'ada', name: 'Ada Lane', createdAt: now, updatedAt: now, facts: [] });
  vault.profiles.push({ id: 'bea', name: 'Bea Shore', createdAt: now, updatedAt: now, facts: [] });
  await FormProfiles.persist(vault);
});
await page.locator('#fileInput').setInputFiles('/tmp/life-blank.pdf');
await page.waitForFunction(() => document.querySelector('#pages .layer'));
await page.locator('#assistToggle').click();
await page.waitForFunction(() => document.getElementById('recoverPerson').options.length >= 2);
await page.locator('#addText').click();
await page.locator('.ann-body').click();
await page.keyboard.type(LINE);
await page.keyboard.press('Control+End');
await page.keyboard.press('Backspace');
check('Backspace removes the last character of a wrapped line', flat(await page.locator('.ann-body').innerText()) === 'one two three four five six seven eight nine te', flat(await page.locator('.ann-body').innerText()));
await page.keyboard.press('Control+z');
check('Ctrl+Z restores that character', flat(await page.locator('.ann-body').innerText()) === LINE, flat(await page.locator('.ann-body').innerText()));
await page.keyboard.press('Control+y');
check('Ctrl+Y removes it again', flat(await page.locator('.ann-body').innerText()) === 'one two three four five six seven eight nine te', flat(await page.locator('.ann-body').innerText()));
await page.keyboard.press('Control+z');
await page.keyboard.press('Control+Home');
for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight');
await page.keyboard.press('Delete');
check('Delete removes the selected first word', flat(await page.locator('.ann-body').innerText()) === 'two three four five six seven eight nine ten', flat(await page.locator('.ann-body').innerText()));
await page.keyboard.press('Control+z');
check('Ctrl+Z restores the deleted word', flat(await page.locator('.ann-body').innerText()) === LINE, flat(await page.locator('.ann-body').innerText()));
await page.keyboard.press('Escape');

await page.locator('#recoverPerson').selectOption({ label: 'Ada Lane' });
await page.locator('#addText').click();
await page.locator('.ann-body').last().click();
await page.keyboard.type('Ada Secret');
await page.keyboard.press('Escape');
await page.locator('#recoverPerson').selectOption({ label: 'Bea Shore' });
await page.waitForFunction(() => !Array.from(document.querySelectorAll('.ann-body')).some((node) => /Ada Secret/.test(node.innerText)));
await page.locator('#addText').click();
await page.locator('.ann-body').click();
await page.keyboard.type('Bea');
await page.evaluate(() => document.activeElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
await page.keyboard.type('ZZ');
const beaBody = await page.locator('.ann-body').elementHandle();
await page.locator('#recoverPerson').selectOption({ label: 'Ada Lane' });
await page.waitForFunction(() => Array.from(document.querySelectorAll('.ann-body')).some((node) => /Ada Secret/.test(node.innerText)));
await page.evaluate((el) => el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'ZZ' })), beaBody);
const adaNow = await page.evaluate(() => Array.from(document.querySelectorAll('.ann-body')).map((node) => node.innerText.replace(/\u00a0/g, ' ')));
check('a late composition end does not reveal Bea or rewrite Ada', adaNow.some((text) => text === 'Ada Secret') && !adaNow.some((text) => /Bea/.test(text)), adaNow.join('|'));
await page.locator('#recoverPerson').selectOption({ label: 'Bea Shore' });
await page.waitForFunction(() => document.querySelector('.ann-body'));
const beaBack = flat(await page.locator('.ann-body').innerText());
check('the unfinished Bea composition was not stored', beaBack === 'Bea', beaBack);

await page.locator('.ann-body').click();
await page.keyboard.press('Control+End');
await page.evaluate(() => document.activeElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
await page.keyboard.type('QQ');
await page.keyboard.press('Backspace');
await page.keyboard.press('Backspace');
await page.evaluate(() => document.activeElement.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' })));
check('characters removed before composition end are not kept', flat(await page.locator('.ann-body').innerText()) === 'Bea', flat(await page.locator('.ann-body').innerText()));

await page.keyboard.press('Control+End');
await page.evaluate(() => document.activeElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
await page.keyboard.type('YY');
const pending = await page.locator('.ann-body').elementHandle();
await page.locator('#addText').focus();
const afterBlur = await page.evaluate((el) => ({
  text: el.innerText.replace(/\u00a0/g, ' ').replace(/\n$/, ''),
  connected: el.isConnected
}), pending);
check('blur leaves the pending composition in the field', afterBlur.connected && afterBlur.text === 'BeaYY', JSON.stringify(afterBlur));
await page.locator('#downloadBtn').focus();
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelector('#sizeOptions button[data-level="100"]:not([disabled])'));
await page.locator('#sizeOptions button[data-level="100"]').focus();
let download = page.waitForEvent('download');
await page.keyboard.press('Enter');
await (await download).saveAs('/tmp/life-pending.pdf');
const pendingPdf = decode(readFileSync('/tmp/life-pending.pdf'));
check('the export before composition end has Bea and not the pending letters', pendingPdf.includes('Bea') && !pendingPdf.includes('BeaYY') && !pendingPdf.includes('Ada'), pendingPdf.slice(0, 180));
await page.keyboard.press('Escape');
await page.evaluate((el) => el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'YY' })), pending);
check('the late composition end commits the visible letters', flat(await page.locator('.ann-body').innerText()) === 'BeaYY', flat(await page.locator('.ann-body').innerText()));
await page.locator('#downloadBtn').focus();
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelector('#sizeOptions button[data-level="100"]:not([disabled])'));
await page.locator('#sizeOptions button[data-level="100"]').focus();
download = page.waitForEvent('download');
await page.keyboard.press('Enter');
await (await download).saveAs('/tmp/life-committed.pdf');
const committedPdf = decode(readFileSync('/tmp/life-committed.pdf'));
check('the export after composition end contains the committed letters', committedPdf.includes('BeaYY') && !committedPdf.includes('Ada'), committedPdf.slice(0, 180));
await page.keyboard.press('Escape');
const committedBody = await page.locator('.ann-body').elementHandle();
await page.locator('.ann-del').click();
await page.evaluate((el) => el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'YY' })), committedBody);
await page.locator('#startOver').click();
await page.waitForFunction(() => !document.getElementById('empty').hidden);
await page.locator('#fileInput').setInputFiles('/tmp/life-blank.pdf');
await page.waitForFunction(() => document.querySelector('#pages .layer'));
await page.evaluate((el) => el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'ZZ' })), pending);
const fresh = await page.evaluate(() => Array.from(document.querySelectorAll('.ann-body')).map((node) => node.innerText));
check('a composition end from an old field does not enter the new document', fresh.length === 0, fresh.join('|'));
await page.waitForFunction(() => document.getElementById('saveState').textContent === 'Saved' || document.getElementById('empty').hidden);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(400);
const reloaded = await page.evaluate(() => Array.from(document.querySelectorAll('.ann-body')).map((node) => node.innerText.replace(/\u00a0/g, ' ')));
check('reload does not bring back the removed or pending composition', !reloaded.some((text) => /BeaYY|BeaZZ|QQ/.test(text)), reloaded.join('|'));
console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
