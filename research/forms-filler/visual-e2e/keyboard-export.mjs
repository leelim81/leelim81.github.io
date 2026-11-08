/** Keyboard opens Download inside the dialog, then the rendered PDF keeps the typed text.
 *  Viewport is 390 by 700 at 1.5 zoom. This is not a phone. */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { inflateSync } from 'zlib';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 400) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 240) : ''));
}
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
  return [...body.matchAll(/<([0-9A-Fa-f\s]+)>/g)].map((item) => Buffer.from(item[1].replace(/\s+/g, ''), 'hex').toString('utf8')).join(' | ');
}
const doc = await PDFDocument.create();
doc.addPage([612, 792]).drawText('Full name', { x: 72, y: 700, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
writeFileSync('/tmp/key-blank.pdf', await doc.save());
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 700 }, acceptDownloads: true })).newPage();
page.setDefaultTimeout(20000);
await page.goto('http://127.0.0.1:8777/tools/pdf-editor/?key=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.evaluate(() => indexedDB.deleteDatabase('tools-forms-editor'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('#fileInput').setInputFiles('/tmp/key-blank.pdf');
await page.waitForFunction(() => document.querySelector('#pages .layer'));
await page.evaluate(() => { document.documentElement.style.zoom = '1.5'; });
await page.locator('#addText').focus();
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains('ann-body'));
await page.keyboard.type('Ada Kept');
await page.keyboard.press('Escape');
await page.waitForFunction(() => document.getElementById('saveState').textContent === 'Saved');
await page.locator('#downloadBtn').focus();
await page.keyboard.press('Enter');
await page.waitForFunction(() => !document.getElementById('downloadModal').hidden);
const opened = await page.evaluate(() => {
  const el = document.activeElement;
  const modal = document.getElementById('downloadModal');
  return { inside: !!(el && modal.contains(el)), id: el && el.id };
});
check('Enter on Download moves focus into the dialog', opened.inside && opened.id === 'dlClose', JSON.stringify(opened));
await page.keyboard.press('Shift+Tab');
const shifted = await page.evaluate(() => {
  const el = document.activeElement;
  return { inside: document.getElementById('downloadModal').contains(el), level: el && el.getAttribute('data-level') };
});
check('Shift+Tab stays inside the dialog', shifted.inside, JSON.stringify(shifted));
await page.keyboard.press('Escape');
const closed = await page.evaluate(() => ({
  hidden: document.getElementById('downloadModal').hidden,
  id: document.activeElement && document.activeElement.id
}));
check('Escape closes Download and returns to the Download button', closed.hidden && closed.id === 'downloadBtn', JSON.stringify(closed));
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelector('#sizeOptions button[data-level="100"]:not([disabled])'));
let reached = false;
for (let i = 0; i < 6; i++) {
  const level = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-level'));
  if (level === '100') { reached = true; break; }
  await page.keyboard.press('Tab');
}
check('Tab reaches the full-quality download', reached, '');
const download = page.waitForEvent('download');
await page.keyboard.press('Enter');
await (await download).saveAs('/tmp/keyboard-export.pdf');
const pdf = decode(readFileSync('/tmp/keyboard-export.pdf'));
check('the rendered PDF contains the typed text', pdf.includes('Ada Kept'), pdf.slice(0, 120));
await page.waitForFunction(() => document.getElementById('saveState').textContent === 'Saved');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('.ann-body'));
const reloaded = await page.evaluate(() => Array.from(document.querySelectorAll('.ann-body')).map((node) => node.innerText));
check('reload keeps the typed text', reloaded.some((text) => text.indexOf('Ada Kept') === 0), reloaded.join('|'));
console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
