/** Returning through Place a missing line keeps the same person's marks. */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { inflateSync } from 'zlib';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument } = require('pdf-lib');
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 300) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 220) : ''));
}
async function blank(path, width) {
  const doc = await PDFDocument.create();
  doc.addPage([width, 792]);
  writeFileSync(path, await doc.save());
}
await blank('/tmp/resume-a.pdf', 612);
await blank('/tmp/resume-b.pdf', 500);
function hexOf(text) {
  return Buffer.from(text).toString('hex');
}
function streamText(path) {
  const raw = readFileSync(path).toString('latin1');
  const parts = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = re.exec(raw))) {
    try { parts.push(inflateSync(Buffer.from(m[1], 'latin1'))); } catch (err) {}
  }
  return Buffer.concat(parts).toString('latin1').toLowerCase();
}
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.setDefaultTimeout(30000);
async function freshForm(path) {
  await page.goto('http://127.0.0.1:8788/tools/forms-filler/?resume=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-maps', 'tools-forms-editor'].forEach((name) => indexedDB.deleteDatabase(name));
    sessionStorage.clear();
    localStorage.removeItem('ff-editor-cleared');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const chooser = page.waitForEvent('filechooser');
  await page.click('#formDrop');
  await (await chooser).setFiles(path);
  await page.waitForFunction(() => {
    const button = document.getElementById('placeMissing');
    return button && !button.disabled && /No lines were found/.test((document.getElementById('readStatus') || {}).textContent || '');
  });
}
async function marks() {
  return page.evaluate(() => Array.from(document.querySelectorAll('.ann')).map((el) => ({
    text: (el.querySelector('.ann-body') || {}).value || (el.querySelector('.ann-body') || {}).textContent || '',
    left: el.style.left,
    top: el.style.top
  })).sort((a, b) => (a.top + a.left).localeCompare(b.top + b.left)));
}
async function placeFact(label, x, y) {
  if (await page.locator('#recoverBar').isHidden()) await page.click('#assistToggle');
  await page.locator('#recoverPerson').selectOption({ label: 'Ada Lane' });
  const fact = page.locator('#recoverFact option').filter({ hasText: label }).first();
  await page.locator('#recoverFact').selectOption({ label: await fact.innerText() });
  await page.click('#recoverPlace');
  const before = await page.locator('#recoverStatus').innerText();
  const layer = page.locator('#pages .layer').first();
  const box = await layer.boundingBox();
  await layer.click({ position: { x: box.width * x, y: box.height * y } });
  await page.waitForFunction((prev) => /Placed /.test((document.getElementById('recoverStatus') || {}).textContent || '') && (document.getElementById('recoverStatus') || {}).textContent !== prev, before);
  await page.waitForFunction(() => /Saved/.test((document.getElementById('saveState') || {}).textContent || ''));
}
await freshForm('/tmp/resume-a.pdf');
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForSelector('#recoverPersonName');
await page.locator('#recoverPersonName').fill('Ada Lane');
await page.click('#recoverAddPerson');
await page.waitForFunction(() => /no confirmed value yet/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
await page.locator('#recoverFactValue').fill('Ada Lane');
await page.click('#recoverAddFact');
await page.waitForFunction(() => !document.getElementById('recoverPlace').disabled);
await placeFact('name', 0.28, 0.36);
await placeFact('name', 0.58, 0.62);
let placed = await marks();
check('two marks are on the page', placed.length === 2 && placed.every((mark) => mark.text === 'Ada Lane'), JSON.stringify(placed));
await page.click('#recoverUndo');
await page.waitForFunction(() => /Undid/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
await page.waitForFunction(() => /Saved/.test((document.getElementById('saveState') || {}).textContent || ''));
await page.reload();
await page.waitForSelector('.ann');
const afterUndo = await marks();
check('undo and reload keep the remaining mark only', afterUndo.length === 1 && afterUndo[0].text === 'Ada Lane', JSON.stringify(afterUndo));
await placeFact('name', 0.58, 0.62);
placed = await marks();
check('the second mark can be placed again', placed.length === 2, JSON.stringify(placed));
await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('tools-forms-editor', 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    const store = tx.objectStore('kv');
    const get = store.get('session');
    get.onsuccess = () => {
      const session = get.result;
      session.pages.forEach((item) => { item.annotations = []; });
      session.editedAt = 1;
      store.put(session, 'session');
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
});
await page.goBack();
await page.waitForURL(/forms-filler/);
await page.waitForFunction(() => document.getElementById('placeMissing') && !document.getElementById('placeMissing').disabled);
await page.evaluate(() => {
  const button = document.getElementById('placeMissing');
  button.click();
  button.click();
});
await page.waitForURL(/pdf-editor/);
await page.waitForSelector('.ann-body');
const returned = await marks();
check('the same button brings the same marks back', JSON.stringify(returned) === JSON.stringify(placed), JSON.stringify(returned));
check('the return says these are the same marks', /same page and the same marks/.test(await page.locator('#recoverStatus').innerText()), await page.locator('#recoverStatus').innerText());
await page.click('#downloadBtn');
await page.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
const download = page.waitForEvent('download');
await page.locator('#sizeOptions button[data-level="100"]').click();
await (await download).saveAs('/tmp/resume-out.pdf');
const pdf = streamText('/tmp/resume-out.pdf');
check('the returned export still contains the placed name', pdf.includes(hexOf('Ada Lane')));
await page.click('#dlClose');
await page.click('#addText');
const gen = await page.locator('#saveState').getAttribute('data-gen');
await page.locator('.ann-body').last().fill('Manual note');
await page.waitForFunction((prev) => {
  const el = document.getElementById('saveState');
  return el && el.dataset.gen !== prev && /Saved/.test(el.textContent || '');
}, gen);
await page.goBack();
await page.waitForURL(/forms-filler/);
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForSelector('.ann-body');
const withManual = (await marks()).map((mark) => mark.text).sort();
check('the same person keeps an unassociated note', withManual.indexOf('Ada Lane') >= 0 && withManual.indexOf('Manual note') >= 0, withManual.join('|'));
await page.goBack();
await page.waitForURL(/forms-filler/);
await page.click('#profileToggle');
await page.waitForSelector('#profileBox:not([hidden])');
page.once('dialog', (dialog) => dialog.accept('Bea Shore'));
await page.click('#profileAdd');
await page.waitForFunction(() => Array.from(document.getElementById('profilePick').options).some((opt) => opt.textContent === 'Bea Shore'));
await page.locator('#profilePick').selectOption({ label: 'Bea Shore' });
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForSelector('#pages .layer');
const leaked = await marks();
const status = await page.locator('#recoverStatus').innerText();
check('a different person does not receive the earlier marks', leaked.length === 0, JSON.stringify(leaked));
check('the return says the other person was left off', /other person/.test(status), status);
await page.goBack();
await page.waitForURL(/forms-filler/);
if (await page.locator('#profileBox').isHidden()) await page.click('#profileToggle');
await page.locator('#profilePick').selectOption({ label: 'Ada Lane' });
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForSelector('.ann-body');
const restored = (await marks()).map((mark) => mark.text);
check('the first person gets the note back', restored.indexOf('Manual note') >= 0 && restored.indexOf('Ada Lane') >= 0, restored.join('|'));
await page.goBack();
await page.waitForURL(/forms-filler/);
const replace = page.waitForEvent('filechooser');
await page.click('#formDrop');
await (await replace).setFiles('/tmp/resume-b.pdf');
await page.waitForFunction(() => /resume-b\.pdf/.test((document.getElementById('formLabel') || {}).textContent || '') && !document.getElementById('readStatus').classList.contains('busy') && document.getElementById('placeMissing') && !document.getElementById('placeMissing').disabled);
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForSelector('#pages .layer');
const otherFile = await marks();
const otherStatus = await page.locator('#recoverStatus').innerText();
check('a different file does not bring the marks back', otherFile.length === 0 && /file or crop changed/.test(otherStatus), otherStatus + ' ' + JSON.stringify(otherFile));
await page.goBack();
await page.waitForURL(/forms-filler/);
await page.click('#clearBtn');
await page.waitForFunction(() => /Started over/.test((document.getElementById('readStatus') || {}).textContent || ''));
const chooser = page.waitForEvent('filechooser');
await page.click('#formDrop');
await (await chooser).setFiles('/tmp/resume-a.pdf');
await page.waitForFunction(() => document.getElementById('placeMissing') && !document.getElementById('placeMissing').disabled);
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForSelector('#pages .layer');
const cleared = await marks();
const clearedStatus = await page.locator('#recoverStatus').innerText();
check('start over removes the marks', cleared.length === 0 && !/same marks/.test(clearedStatus), clearedStatus);
await page.goBack();
await page.waitForURL(/forms-filler/);
await page.evaluate(() => {
  DeskDB.change = function () {
    const err = new Error('quota');
    err.name = 'QuotaExceededError';
    return Promise.reject(err);
  };
});
await page.click('#placeMissing');
await page.waitForFunction(() => /could not store/.test((document.getElementById('readStatus') || {}).textContent || ''));
check('a failed store does not open the editor or claim success', /forms-filler/.test(page.url()) && /Nothing was written/.test(await page.locator('#readStatus').innerText()) && await page.locator('#placeMissing').isEnabled(), await page.locator('#readStatus').innerText());
const out = { passed: checks.filter((item) => item.ok).length, failed: checks.filter((item) => !item.ok).length, checks };
writeFileSync('/tmp/inline-wt/research/forms-filler/visual-e2e/results/resume-marks.json', JSON.stringify(out, null, 2));
console.log('SUMMARY', out.passed, '/', checks.length);
await browser.close();
if (out.failed) process.exit(1);
