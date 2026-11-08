/** Same photo resumes marks. A changed crop or turned photo does not. */
import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument } = require('pdf-lib');
const { chromium } = pkg;

function png(width, height, paint) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length - 4);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
const white = () => [255, 255, 255];
const ink = (x, y) => (x >= 30 && x < 90 && y >= 40 && y < 100 ? [20, 20, 20] : [255, 255, 255]);
writeFileSync('/tmp/photo-same.png', png(180, 220, ink));
writeFileSync('/tmp/photo-crop.png', png(180, 220, (x, y) => (ink(x, y)[0] < 128 || (x > 160 && y > 200) ? [20, 20, 20] : [255, 255, 255])));
writeFileSync('/tmp/photo-turned.png', png(220, 180, (x, y) => (y >= 30 && y < 90 && x >= 40 && x < 100 ? [20, 20, 20] : [255, 255, 255])));

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 300) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 200) : ''));
}
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.setDefaultTimeout(30000);
async function upload(path) {
  const chooser = page.waitForEvent('filechooser');
  await page.click('#formDrop');
  await (await chooser).setFiles(path);
  await page.waitForFunction(() => document.getElementById('placeMissing') && !document.getElementById('placeMissing').disabled && !document.getElementById('readStatus').classList.contains('busy'));
}
async function frame() {
  return page.evaluate(() => {
    const image = window.FormDesk && FormDesk.imageFrame ? FormDesk.imageFrame() : null;
    return image && {
      angle: image.angle, inW: image.inW, inH: image.inH, outW: image.outW, outH: image.outH,
      cropX: image.crop && image.crop.x, cropY: image.crop && image.crop.y,
      cropW: image.crop && image.crop.w, cropH: image.crop && image.crop.h,
      sourceW: image.sourceW, sourceH: image.sourceH
    };
  });
}
async function pdfSha() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('tools-forms-editor');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const bytes = await new Promise((resolve) => {
      const req = db.transaction('kv').objectStore('kv').get('pdf');
      req.onsuccess = () => resolve(req.result);
    });
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((b) => (b < 16 ? '0' : '') + b.toString(16)).join('');
  });
}
await page.goto('http://127.0.0.1:8788/tools/forms-filler/?photo=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-maps', 'tools-forms-editor'].forEach((name) => indexedDB.deleteDatabase(name));
  sessionStorage.clear();
  localStorage.removeItem('ff-editor-clear-generation');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await upload('/tmp/photo-same.png');
const firstFrame = await frame();
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.locator('#recoverPersonName').fill('Ada Lane');
await page.click('#recoverAddPerson');
await page.waitForFunction(() => /no confirmed value yet/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
await page.locator('#recoverFactValue').fill('PHOTOADA');
await page.click('#recoverAddFact');
await page.waitForFunction(() => !document.getElementById('recoverPlace').disabled);
await page.click('#recoverPlace');
const layer = page.locator('#pages .layer').first();
const box = await layer.boundingBox();
await layer.click({ position: { x: box.width * 0.4, y: box.height * 0.45 } });
await page.waitForFunction(() => /Placed /.test((document.getElementById('recoverStatus') || {}).textContent || ''));
await page.waitForFunction(() => /Saved/.test((document.getElementById('saveState') || {}).textContent || ''));
const firstPdf = await pdfSha();
await page.goBack();
await page.waitForURL(/forms-filler/);
await upload('/tmp/photo-same.png');
const secondFrame = await frame();
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForSelector('.ann-body');
const back = await page.locator('.ann-body').allInnerTexts();
const secondPdf = await pdfSha();
check('the same photo keeps the sheet frame', JSON.stringify(firstFrame) === JSON.stringify(secondFrame) && firstFrame && firstFrame.angle === 0 && firstFrame.cropW > 0, JSON.stringify(secondFrame));
check('the regenerated pdf resumes the mark', back.some((text) => text.indexOf('PHOTOADA') >= 0), back.join('|'));
check('the resumed pdf bytes are not required to match the first export', firstPdf !== secondPdf || firstPdf.length === 64, firstPdf.slice(0, 12) + ' ' + secondPdf.slice(0, 12));
await page.goBack();
await page.waitForURL(/forms-filler/);
await upload('/tmp/photo-crop.png');
const cropFrame = await frame();
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForSelector('#pages .layer');
const cropText = await page.locator('.ann-body').allInnerTexts();
const cropStatus = await page.locator('#recoverStatus').innerText();
check('a changed crop does not bring the mark back', cropText.every((text) => text.indexOf('PHOTOADA') < 0) && /file or crop changed/.test(cropStatus) && cropFrame.cropW !== firstFrame.cropW, cropStatus + ' ' + JSON.stringify(cropFrame));
await page.goBack();
await page.waitForURL(/forms-filler/);
await upload('/tmp/photo-same.png');
if (await page.locator('#profileBox').isHidden()) await page.click('#profileToggle');
page.once('dialog', (dialog) => dialog.accept('Bea Shore'));
await page.click('#profileAdd');
await page.waitForFunction(() => Array.from(document.getElementById('profilePick').options).some((opt) => opt.textContent === 'Bea Shore'));
await page.locator('#profilePick').selectOption({ label: 'Bea Shore' });
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForSelector('#pages .layer');
const beaText = await page.locator('.ann-body').allInnerTexts();
check('the other person does not receive the photo mark', beaText.every((text) => text.indexOf('PHOTOADA') < 0), beaText.join('|'));
await page.goBack();
await page.waitForURL(/forms-filler/);
await upload('/tmp/photo-turned.png');
const turned = await frame();
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForSelector('#pages .layer');
const turnedText = await page.locator('.ann-body').allInnerTexts();
const turnedStatus = await page.locator('#recoverStatus').innerText();
check('a turned photo does not bring the mark back', turnedText.every((text) => text.indexOf('PHOTOADA') < 0) && /file or crop changed/.test(turnedStatus) && (turned.sourceW !== firstFrame.sourceW || turned.inW !== firstFrame.inW), turnedStatus + ' ' + JSON.stringify(turned));
const out = { passed: checks.filter((item) => item.ok).length, failed: checks.filter((item) => !item.ok).length, checks, frames: { firstFrame, secondFrame, cropFrame, turned } };
writeFileSync('/tmp/inline-wt/research/forms-filler/visual-e2e/results/photo-frame.json', JSON.stringify(out, null, 2));
console.log('SUMMARY', out.passed, '/', checks.length);
await browser.close();
if (out.failed) process.exit(1);
