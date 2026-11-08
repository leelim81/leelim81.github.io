/** An image or signature resumes for the same person and stays off for another. */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
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
writeFileSync('/tmp/raster-blank.pdf', await doc.save());
writeFileSync('/tmp/raster-dot.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.setDefaultTimeout(30000);
async function imageSrcs() {
  return page.locator('.ann img').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src') || '').filter((src) => src.indexOf('data:image/png') === 0 || src.indexOf('data:image/jpeg') === 0));
}
await page.goto('http://127.0.0.1:8788/tools/forms-filler/?raster=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-maps', 'tools-forms-editor'].forEach((name) => indexedDB.deleteDatabase(name));
  sessionStorage.clear();
});
await page.reload({ waitUntil: 'domcontentloaded' });
const chooser = page.waitForEvent('filechooser');
await page.click('#formDrop');
await (await chooser).setFiles('/tmp/raster-blank.pdf');
await page.waitForFunction(() => document.getElementById('placeMissing') && !document.getElementById('placeMissing').disabled);
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.locator('#recoverPersonName').fill('Ada Lane');
await page.click('#recoverAddPerson');
await page.waitForFunction(() => /no confirmed value yet/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
await page.locator('#imageInput').setInputFiles('/tmp/raster-dot.png');
await page.waitForFunction(() => document.querySelectorAll('.ann img').length >= 1);
await page.click('#addSignature');
await page.click('#tab-type');
await page.locator('#typeName').fill('Ada Sign');
await page.click('#sigApply');
await page.waitForFunction(() => document.querySelectorAll('.ann img').length >= 2);
const first = await imageSrcs();
check('the image and signature are png marks', first.length === 2 && first.every((src) => src.indexOf('data:image/png;base64,') === 0), String(first.length));
await page.waitForFunction(() => /Saved/.test((document.getElementById('saveState') || {}).textContent || ''));
await page.goBack();
await page.waitForURL(/forms-filler/);
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForFunction(() => document.querySelectorAll('.ann img').length >= 2);
const again = await imageSrcs();
check('the same person gets the same image and signature back', again.length === 2 && again[0] === first[0] && again[1] === first[1]);
await page.click('#downloadBtn');
await page.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
const download = page.waitForEvent('download');
await page.locator('#sizeOptions button[data-level="100"]').click();
const outPath = '/tmp/raster-out.pdf';
await (await download).saveAs(outPath);
const raw = readFileSync(outPath);
check('the export contains both pictures', raw.includes(Buffer.from('/Subtype /Image')) || raw.includes(Buffer.from('/Subtype/Image')), 'bytes ' + raw.length);
await page.click('#dlClose');
await page.goBack();
await page.waitForURL(/forms-filler/);
await page.click('#profileToggle');
page.once('dialog', (dialog) => dialog.accept('Bea Shore'));
await page.click('#profileAdd');
await page.waitForFunction(() => Array.from(document.getElementById('profilePick').options).some((opt) => opt.textContent === 'Bea Shore'));
await page.locator('#profilePick').selectOption({ label: 'Bea Shore' });
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForSelector('#pages .layer');
check('the other person does not receive the pictures', (await imageSrcs()).length === 0, String((await imageSrcs()).length));
await page.goBack();
await page.waitForURL(/forms-filler/);
if (await page.locator('#profileBox').isHidden()) await page.click('#profileToggle');
await page.locator('#profilePick').selectOption({ label: 'Ada Lane' });
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForFunction(() => document.querySelectorAll('.ann img').length >= 2);
const restored = await imageSrcs();
check('the pictures return with the first person', restored.length === 2 && restored[0] === first[0] && restored[1] === first[1]);

await page.goBack();
await page.waitForURL(/forms-filler/);
await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('tools-forms-editor');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const session = await new Promise((resolve) => {
    const req = db.transaction('kv').objectStore('kv').get('session');
    req.onsuccess = () => resolve(req.result);
  });
  session.pages[0].annotations.push({ id: 'bad', type: 'image', x: 0.1, y: 0.1, w: 0.2, h: 0.2, dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+', pixelAspect: 1, originProfileId: session.resumeProfileId });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(session, 'session');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  sessionStorage.removeItem('ff-editor-handoff');
});
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForFunction(() => /could not be read/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
const body = await page.locator('body').innerText();
check('an svg picture is not resumed', body.indexOf('<svg') < 0 && /could not be read/.test(await page.locator('#recoverStatus').innerText()));

await page.goBack();
await page.waitForURL(/forms-filler/);
await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('tools-forms-editor');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const session = await new Promise((resolve) => {
    const req = db.transaction('kv').objectStore('kv').get('session');
    req.onsuccess = () => resolve(req.result);
  });
  const canvas = document.createElement('canvas');
  canvas.width = 1700;
  canvas.height = 2;
  const big = canvas.toDataURL('image/png');
  const owner = session.resumeProfileId;
  session.pages[0].annotations = [
    { id: 'keep', type: 'text', x: 0.2, y: 0.2, w: 0.4, h: 0.05, text: 'ONLYKEEP', fontSize: 14, color: '#1a1612', profileId: owner },
    { id: 'bad', type: 'image', x: 0.1, y: 0.5, w: 0.2, h: 0.2, dataUrl: 'data:image/png;base64,AAAA', pixelAspect: 1, originProfileId: owner },
    { id: 'big', type: 'image', x: 0.1, y: 0.7, w: 0.4, h: 0.05, dataUrl: big, pixelAspect: 850, originProfileId: owner }
  ];
  await new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(session, 'session');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  sessionStorage.removeItem('ff-editor-handoff');
});
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForFunction(() => /ONLYKEEP|picture could not be read/.test((document.getElementById('recoverStatus') || {}).textContent || '') || document.querySelector('.ann-body'));
const keptText = await page.locator('.ann-body').allInnerTexts();
const pics = await imageSrcs();
const note = await page.locator('#recoverStatus').innerText();
check('a corrupt or oversized picture is left out and the text remains', keptText.some((text) => text.indexOf('ONLYKEEP') >= 0) && pics.every((src) => src.indexOf('AAAA') < 0) && /picture could not be read/.test(note), note + ' ' + keptText.join('|') + ' pics ' + pics.length);
const out = { passed: checks.filter((item) => item.ok).length, failed: checks.filter((item) => !item.ok).length, checks };
writeFileSync('/tmp/inline-wt/research/forms-filler/visual-e2e/results/raster-resume.json', JSON.stringify(out, null, 2));
console.log('SUMMARY', out.passed, '/', checks.length);
await browser.close();
if (out.failed) process.exit(1);
