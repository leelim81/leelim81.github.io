/** A startup read that finishes after a new PDF is open must leave that PDF in place. Viewport 1100 by 900. Not a phone. */
import { readFileSync, writeFileSync } from 'fs';
import { inflateSync } from 'zlib';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 300) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 220) : ''));
}
async function makePdf(path, label) {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]).drawText(label, { x: 72, y: 700, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
  writeFileSync(path, await doc.save());
}
await makePdf('/tmp/boot-old.pdf', 'Old page');
await makePdf('/tmp/boot-new.pdf', 'New page');
function pdfWords(file) {
  const raw = readFileSync(file).toString('latin1');
  const out = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = re.exec(raw))) {
    const chunk = Buffer.from(match[1], 'latin1');
    try { out.push(inflateSync(chunk)); } catch (err) { out.push(chunk); }
  }
  return [...Buffer.concat(out).toString('latin1').matchAll(/\((?:\\.|[^\\)])*\)|<([0-9A-Fa-f\s]+)>/g)].map((item) => item[1] ? Buffer.from(item[1].replace(/\s+/g, ''), 'hex').toString('utf8') : item[0].slice(1, -1)).join(' | ');
}
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
async function newPage() {
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true })).newPage();
  page.setDefaultTimeout(15000);
  await page.addInitScript(() => {
    const orig = indexedDB.open.bind(indexedDB);
    window.__held = null;
    indexedDB.open = function (name, version) {
      const req = orig(name, version);
      if (name !== 'tools-edit-sign-pdf' || !/holdboot=1/.test(location.search) || window.__held) return req;
      req.addEventListener('success', function (ev) {
        if (req.__pass) return;
        ev.stopImmediatePropagation();
        window.__held = { req: req, ev: ev };
      }, true);
      return req;
    };
    window.__releaseHeld = function () {
      const held = window.__held;
      window.__held = null;
      if (!held) return;
      held.req.__pass = true;
      if (typeof held.req.onsuccess === 'function') held.req.onsuccess.call(held.req, held.ev);
    };
    window.__rejectHeld = function () {
      const held = window.__held;
      window.__held = null;
      if (!held) return;
      const err = new DOMException('unavailable', 'UnknownError');
      Object.defineProperty(held.req, 'error', { configurable: true, get: () => err });
      if (typeof held.req.onerror === 'function') held.req.onerror.call(held.req, held.ev);
    };
  });
  return page;
}
async function seed(page) {
  await page.goto('http://127.0.0.1:8862/tools/pdf-editor/?seed=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => indexedDB.deleteDatabase('tools-edit-sign-pdf'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#fileInput').setInputFiles('/tmp/boot-old.pdf');
  await page.waitForSelector('#pages canvas', { state: 'visible' });
  await page.locator('#addText').click();
  await page.locator('.ann-body').click();
  await page.keyboard.type('Old mark');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Saved');
}
async function openNew(page, text) {
  await page.goto('http://127.0.0.1:8862/tools/pdf-editor/?holdboot=1&n=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__held);
  await page.locator('#fileInput').setInputFiles('/tmp/boot-new.pdf');
  await page.waitForSelector('#pages canvas', { state: 'visible' });
  await page.locator('#addText').click();
  await page.locator('.ann-body').click();
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    const status = (document.getElementById('saveState') || {}).textContent || '';
    return status === 'Saved' || status === 'Not saved';
  });
}
async function snap(page) {
  return page.evaluate(() => ({
    file: (document.getElementById('fileName') || {}).textContent || '',
    status: (document.getElementById('saveState') || {}).textContent || '',
    toast: (document.getElementById('toast') || {}).textContent || '',
    screen: Array.from(document.querySelectorAll('#pages .ann-body')).map((el) => el.innerText).join(' | '),
    empty: !!(document.getElementById('empty') && !document.getElementById('empty').hidden)
  }));
}
async function words(page) {
  await page.locator('#downloadBtn').click();
  await page.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
  const download = page.waitForEvent('download');
  await page.locator('#sizeOptions button[data-level="100"]').click();
  const file = '/tmp/boot-owner-' + Date.now() + '.pdf';
  await (await download).saveAs(file);
  return pdfWords(file);
}

{
  const page = await newPage();
  await seed(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#pages .ann-body');
  const resumed = await snap(page);
  check('startup still restores the stored PDF', resumed.file === 'boot-old.pdf' && resumed.screen === 'Old mark' && resumed.status === 'Saved', JSON.stringify(resumed));
  await page.close();
}
{
  const page = await newPage();
  await seed(page);
  await openNew(page, 'New mark');
  await page.evaluate(() => window.__releaseHeld());
  await page.waitForTimeout(600);
  const after = await snap(page);
  const pdf = await words(page);
  check('a late startup read does not replace the new PDF', after.file === 'boot-new.pdf' && after.screen === 'New mark' && after.status === 'Saved' && !after.empty, JSON.stringify(after));
  check('download keeps the new mark', pdf.includes('New mark') && !pdf.includes('Old mark'), pdf.slice(0, 160));
  await page.goto('http://127.0.0.1:8862/tools/pdf-editor/?again=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#pages .ann-body');
  const stored = await snap(page);
  check('reload keeps the new PDF rather than the one startup had started reading', stored.file === 'boot-new.pdf' && stored.screen === 'New mark', JSON.stringify(stored));
  await page.close();
}
{
  const page = await newPage();
  await seed(page);
  await openNew(page, 'Kept mark');
  await page.evaluate(() => window.__rejectHeld());
  await page.waitForTimeout(600);
  const after = await snap(page);
  check('a late startup failure does not clear the new PDF or call it unrestored', after.file === 'boot-new.pdf' && after.screen === 'Kept mark' && !after.empty && !/nothing was restored/i.test(after.toast) && !/was found/i.test(after.toast), JSON.stringify(after));
  const pdf = await words(page);
  check('download still exports the new mark after the startup failure', pdf.includes('Kept mark'), pdf.slice(0, 120));
  await page.close();
}
{
  const page = await newPage();
  await page.goto('http://127.0.0.1:8862/tools/pdf-editor/?wipe=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => indexedDB.deleteDatabase('tools-edit-sign-pdf'));
  await page.goto('http://127.0.0.1:8862/tools/pdf-editor/?holdboot=1&empty=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__held);
  await page.locator('#fileInput').setInputFiles('/tmp/boot-new.pdf');
  await page.waitForSelector('#pages canvas', { state: 'visible' });
  await page.locator('#addText').click();
  await page.locator('.ann-body').click();
  await page.keyboard.type('Fresh mark');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Saved');
  await page.evaluate(() => window.__releaseHeld());
  await page.waitForTimeout(400);
  const after = await snap(page);
  check('an empty startup read does not clear a PDF opened while it waited', after.file === 'boot-new.pdf' && after.screen === 'Fresh mark' && after.status === 'Saved', JSON.stringify(after));
  await page.close();
}

console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
