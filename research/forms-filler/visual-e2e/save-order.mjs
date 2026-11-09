/** An older editor save must not replace a newer one. Viewport 1100 by 900. Not a phone. */
import { readFileSync, writeFileSync } from 'fs';
import { inflateSync } from 'zlib';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 400) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 280) : ''));
}
function pdfWords(file) {
  const raw = readFileSync(file).toString('latin1');
  const out = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = re.exec(raw))) {
    const chunk = Buffer.from(match[1], 'latin1');
    try { out.push(inflateSync(chunk)); } catch (err) { out.push(chunk); }
  }
  const body = Buffer.concat(out).toString('latin1');
  return [...body.matchAll(/<([0-9A-Fa-f\s]+)>/g)].map((item) => Buffer.from(item[1].replace(/\s+/g, ''), 'hex').toString('utf8')).join(' | ');
}
async function makePdf(path, label) {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]).drawText(label, { x: 72, y: 700, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
  writeFileSync(path, await doc.save());
}
await makePdf('/tmp/save-a.pdf', 'File A page');
await makePdf('/tmp/save-b.pdf', 'File B page');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
async function boot() {
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true })).newPage();
  page.setDefaultTimeout(20000);
  page.on('dialog', async (d) => {
    console.log('DIALOG', d.type(), d.message().slice(0, 80));
    if (d.type() === 'prompt') await d.accept('Ada Lane');
    else await d.accept();
  });
  await page.addInitScript(() => {
    const orig = indexedDB.open.bind(indexedDB);
    const pending = [];
    window.__heldOpens = () => pending.length;
    window.__armHold = () => { window.__holdEditorDb = true; };
    window.__releaseOldest = () => { const fn = pending.shift(); if (fn) fn(); };
    window.__releaseNewest = () => { const fn = pending.pop(); if (fn) fn(); };
    indexedDB.open = function (name, version) {
      const req = orig(name, version);
      if (name !== 'tools-edit-sign-pdf' || !window.__holdEditorDb) return req;
      req.addEventListener('success', function (ev) {
        if (req.__pass) return;
        ev.stopImmediatePropagation();
        pending.push(() => {
          req.__pass = true;
          if (typeof req.onsuccess === 'function') req.onsuccess.call(req, ev);
        });
      }, true);
      return req;
    };
  });
  await page.goto('http://127.0.0.1:8777/tools/pdf-editor/?order=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => indexedDB.deleteDatabase('tools-edit-sign-pdf'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  return page;
}
async function marks(page) {
  return page.locator('#pages .ann-body').allInnerTexts();
}
async function settle(page) {
  const start = Date.now();
  while (Date.now() - start < 5000) {
    if (await page.evaluate(() => window.__heldOpens() > 0)) await page.evaluate(() => window.__releaseOldest());
    const ready = await page.evaluate(() => {
      const text = (document.getElementById('saveState') || {}).textContent || '';
      return window.__heldOpens() === 0 && (text === 'Saved' || text === '');
    });
    if (ready) return;
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 30)));
  }
  await page.waitForFunction(() => {
    const text = (document.getElementById('saveState') || {}).textContent || '';
    return text === 'Saved' || text === '';
  });
}

const edits = await boot();
await edits.locator('#fileInput').setInputFiles('/tmp/save-a.pdf');
await edits.waitForSelector('#pages canvas', { state: 'visible' });
await edits.locator('#addText').click();
await edits.locator('.ann-body').click();
await edits.keyboard.type('Mark A');
await edits.keyboard.press('Escape');
await edits.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Saved');
await edits.evaluate(() => window.__armHold());
await edits.locator('.ann-body').click();
await edits.keyboard.press('Control+a');
await edits.keyboard.type('Mark older');
await edits.keyboard.press('Escape');
await edits.waitForFunction(() => window.__heldOpens() >= 1);
await edits.locator('.ann-body').click();
await edits.keyboard.press('Control+a');
await edits.keyboard.type('Mark latest');
await edits.keyboard.press('Escape');
await edits.waitForFunction(() => window.__heldOpens() >= 2);
const screen = await marks(edits);
check('the page shows the latest typed text while the older save is held', screen.join(' | ') === 'Mark latest', screen.join(' | '));
await edits.evaluate(() => window.__releaseNewest());
await edits.evaluate(() => window.__releaseOldest());
await edits.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Saved');
await edits.reload({ waitUntil: 'domcontentloaded' });
await edits.waitForSelector('#pages .ann-body');
const reloaded = await marks(edits);
check('reload keeps the latest text and does not restore the older save', reloaded.join(' | ') === 'Mark latest', reloaded.join(' | '));
await edits.locator('#downloadBtn').click();
await edits.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
const download = edits.waitForEvent('download');
await edits.locator('#sizeOptions button[data-level="100"]').click();
const saved = await download;
await saved.saveAs('/tmp/save-order-latest.pdf');
const pdf = pdfWords('/tmp/save-order-latest.pdf');
check('the PDF has the latest text and not the older save', pdf.includes('Mark latest') && !pdf.includes('Mark older'), pdf.slice(0, 180));
await edits.close();

const over = await boot();
await over.locator('#fileInput').setInputFiles('/tmp/save-a.pdf');
await over.waitForSelector('#pages canvas', { state: 'visible' });
await over.locator('#addText').click();
await over.locator('.ann-body').click();
await over.keyboard.type('Should vanish');
await over.keyboard.press('Escape');
await over.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Saved');
await over.evaluate(() => window.__armHold());
await over.locator('.ann-body').click();
await over.keyboard.press('Control+a');
await over.keyboard.type('Still there');
await over.keyboard.press('Escape');
await over.waitForFunction(() => window.__heldOpens() >= 1);
await over.click('#startOver');
await settle(over);
await over.waitForSelector('#empty:not([hidden])');
check('Start over stays empty after the held save finishes', await over.locator('#empty').isVisible() && (await marks(over)).length === 0 && (await over.locator('#saveState').innerText()) !== 'Saved', await over.locator('#saveState').innerText());
await over.reload({ waitUntil: 'domcontentloaded' });
await over.waitForSelector('#empty:not([hidden])');
check('reload does not resurrect the cleared document', await over.locator('#empty').isVisible() && (await marks(over)).length === 0);
await over.close();

const file = await boot();
await file.locator('#fileInput').setInputFiles('/tmp/save-a.pdf');
await file.waitForSelector('#pages canvas', { state: 'visible' });
await file.locator('#addText').click();
await file.locator('.ann-body').click();
await file.keyboard.type('File A mark');
await file.keyboard.press('Escape');
await file.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Saved');
await file.evaluate(() => window.__armHold());
await file.locator('.ann-body').click();
await file.keyboard.press('Control+a');
await file.keyboard.type('File A edited');
await file.keyboard.press('Escape');
await file.waitForFunction(() => window.__heldOpens() >= 1);
await file.locator('#fileInput').setInputFiles('/tmp/save-b.pdf');
await file.waitForFunction(() => /save-b/.test((document.getElementById('fileName') || {}).textContent || ''));
await settle(file);
await file.reload({ waitUntil: 'domcontentloaded' });
await file.waitForFunction(() => /save-b/.test((document.getElementById('fileName') || {}).textContent || ''));
const fileMarks = await marks(file);
check('reload stays on the new PDF and does not restore the previous file’s mark', fileMarks.every((text) => !/File A/.test(text)), (await file.locator('#fileName').innerText()) + ' ' + fileMarks.join(' | '));
await file.close();

console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
