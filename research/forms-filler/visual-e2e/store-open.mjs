/** A failed database open must not claim a document was found or that the page was saved. Viewport 1100 by 900. Not a phone. */
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
const doc = await PDFDocument.create();
doc.addPage([612, 792]).drawText('Store page', { x: 72, y: 700, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
writeFileSync('/tmp/store-open.pdf', await doc.save());
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

async function arm(page) {
  await page.addInitScript(() => {
    const orig = indexedDB.open.bind(indexedDB);
    window.__failEditorOpen = /failopen=1/.test(location.search);
    indexedDB.open = function (name, version) {
      const req = orig(name, version);
      if (name !== 'tools-edit-sign-pdf' || !window.__failEditorOpen) return req;
      req.addEventListener('success', function (ev) {
        ev.stopImmediatePropagation();
        const err = new DOMException('unavailable', 'UnknownError');
        Object.defineProperty(req, 'error', { configurable: true, get: () => err });
        setTimeout(function () { if (typeof req.onerror === 'function') req.onerror.call(req, ev); }, 0);
      }, true);
      return req;
    };
  });
}
async function toast(page) { return page.locator('#toast').innerText().catch(() => ''); }
async function statusOf(page) { return page.locator('#saveState').innerText(); }

{
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true })).newPage();
  page.setDefaultTimeout(15000);
  await arm(page);
  await page.goto('http://127.0.0.1:8860/tools/pdf-editor/?failopen=1&closed=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /could not open saved documents/i.test((document.getElementById('toast') || {}).textContent || ''));
  const said = await toast(page);
  const empty = await page.locator('#empty').isVisible();
  check('a closed database does not claim a document was found', empty && /could not open saved documents/i.test(said) && !/was found/i.test(said) && !/reload/i.test(said), said);
  check('a closed database does not say Saved', (await statusOf(page)) !== 'Saved', await statusOf(page));
  await page.evaluate(() => { window.__failEditorOpen = false; });
  await page.locator('#fileInput').setInputFiles('/tmp/store-open.pdf');
  await page.waitForSelector('#pages canvas', { state: 'visible' });
  await page.locator('#addText').click();
  await page.locator('.ann-body').click();
  await page.keyboard.type('Kept on screen');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Saved');
  await page.evaluate(() => { window.__failEditorOpen = true; });
  await page.locator('.ann-body').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Only on screen');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Not saved');
  const failed = await toast(page);
  check('the unsaved edit stays on screen and is not called Saved', (await page.locator('.ann-body').innerText()) === 'Only on screen' && (await statusOf(page)) === 'Not saved' && !/reload/i.test(failed), (await statusOf(page)) + ' ' + failed);
  await page.locator('#downloadBtn').click();
  await page.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
  const download = page.waitForEvent('download');
  await page.locator('#sizeOptions button[data-level="100"]').click();
  await (await download).saveAs('/tmp/store-open-export.pdf');
  const pdf = pdfWords('/tmp/store-open-export.pdf');
  check('download exports the on-screen edit while storage is closed', pdf.includes('Only on screen') && !pdf.includes('Kept on screen'), pdf.slice(0, 180));
  await page.evaluate(() => { window.__failEditorOpen = false; });
  await page.goto('http://127.0.0.1:8860/tools/pdf-editor/?restore=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#pages .ann-body');
  check('reload keeps the last stored text and not the edit storage refused', (await page.locator('.ann-body').innerText()) === 'Kept on screen' && (await statusOf(page)) === 'Saved', await page.locator('.ann-body').innerText());
  await page.close();
}

{
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
  page.setDefaultTimeout(15000);
  await page.goto('http://127.0.0.1:8860/tools/pdf-editor/?open=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => indexedDB.deleteDatabase('tools-edit-sign-pdf'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  check('an empty editor does not warn that a document failed to restore', (await toast(page)) === '' && await page.locator('#empty').isVisible(), await toast(page));
  await page.close();
}

console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
