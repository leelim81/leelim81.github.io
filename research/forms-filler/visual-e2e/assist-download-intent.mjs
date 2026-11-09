/** A download keeps the file and person from the moment Download was clicked.
 *  Viewport 1280 by 900. This is not a phone. Composition uses events, not a real input method. */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { inflateSync } from 'zlib';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 500) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 300) : ''));
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
async function makePdf(path, label) {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]).drawText(label, { x: 72, y: 700, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
  writeFileSync(path, await doc.save());
}
await makePdf('/tmp/dl-a.pdf', 'File A label');
await makePdf('/tmp/dl-b.pdf', 'File B label');
await makePdf('/tmp/dl-type.pdf', 'Full name');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

async function ready() {
  const prompts = ['Ada Lane', 'Bea Shore'];
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })).newPage();
  page.setDefaultTimeout(20000);
  page.on('dialog', async (d) => {
    if (d.type() === 'prompt') await d.accept(prompts.shift() || 'Ada Lane');
    else await d.accept();
  });
  async function addFact(value) {
    await page.locator('#factKey').selectOption('name');
    await page.locator('#factValue').fill(value);
    await page.click('#factAdd');
    await page.waitForFunction((wanted) => Array.from(document.querySelectorAll('#profileFacts input')).some((input) => input.value === wanted), value);
  }
  await page.goto('http://127.0.0.1:8777/tools/forms-filler/?dl=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-maps', 'tools-forms-editor', 'tools-edit-sign-pdf'].forEach((name) => indexedDB.deleteDatabase(name)));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.click('#profileToggle');
  await page.click('#profileAdd');
  await page.waitForFunction(() => /Ada Lane/.test((document.getElementById('profilePick') || {}).innerText || ''));
  await addFact('Ada Only');
  await page.click('#profileAdd');
  await page.waitForFunction(() => /Bea Shore/.test((document.getElementById('profilePick') || {}).innerText || ''));
  await page.locator('#profilePick').selectOption({ label: 'Bea Shore' });
  await addFact('Bea Only');
  await page.goto('http://127.0.0.1:8777/tools/pdf-editor/?dl=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.locator('#fileInput').setInputFiles('/tmp/dl-a.pdf');
  await page.waitForSelector('#pages canvas', { state: 'visible' });
  if (await page.locator('#recoverBar').isHidden()) await page.click('#assistToggle');
  async function place(person, value, y) {
    await page.locator('#recoverPerson').selectOption({ label: person });
    await page.waitForFunction((wanted) => (document.getElementById('recoverFact') || {}).innerText.includes(wanted), value);
    await page.locator('#recoverFact').selectOption({ label: 'name: ' + value });
    await page.click('#recoverPlace');
    await page.waitForFunction(() => /Click the page/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
    const layer = page.locator('#pages .layer').first();
    const box = await layer.boundingBox();
    await layer.click({ position: { x: Math.round(box.width * 0.4), y: Math.round(box.height * y) } });
    await page.waitForFunction((who) => new RegExp('Placed ' + who).test((document.getElementById('recoverStatus') || {}).textContent || ''), person);
  }
  await place('Ada Lane', 'Ada Only', 0.35);
  await place('Bea Shore', 'Bea Only', 0.55);
  await page.locator('#recoverPerson').selectOption({ label: 'Ada Lane' });
  await page.waitForFunction(() => {
    const texts = Array.from(document.querySelectorAll('#pages .ann-body')).map((el) => el.innerText);
    return texts.length === 1 && texts[0] === 'Ada Only';
  });
  return page;
}
async function holdLoads(page) {
  await page.evaluate(() => {
    const real = PDFLib.PDFDocument.load.bind(PDFLib.PDFDocument);
    window.__realPdfLoad = PDFLib.PDFDocument.load;
    const queue = [];
    window.__heldLoads = () => queue.length;
    window.__releaseLoad = () => {
      const item = queue.shift();
      if (!item) return Promise.resolve();
      return real(...item.args).then((doc) => {
        item.resolve(doc);
        return Promise.resolve().then(() => Promise.resolve());
      }, (err) => { item.reject(err); });
    };
    PDFLib.PDFDocument.load = function () {
      const args = Array.from(arguments);
      return new Promise((resolve, reject) => queue.push({ args, resolve, reject }));
    };
  });
}
async function release(page) {
  await page.evaluate(() => window.__releaseLoad());
}
async function outcome(page) {
  return page.evaluate(async () => {
    const modal = document.getElementById('downloadModal');
    const btn = document.querySelector('#sizeOptions button[data-level="100"]');
    let text = '';
    if (btn && btn._bytes && window.pdfjsLib) {
      const opened = await pdfjsLib.getDocument({ data: btn._bytes.slice(0) }).promise;
      const content = await (await opened.getPage(1)).getTextContent();
      text = content.items.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim();
    }
    return {
      hidden: !modal || modal.hidden,
      held: window.__heldLoads ? window.__heldLoads() : 0,
      ready: !!(btn && btn._bytes && !btn.disabled),
      text
    };
  });
}

const person = await ready();
await holdLoads(person);
await person.click('#downloadBtn');
await person.waitForFunction(() => window.__heldLoads() >= 1);
await person.locator('#recoverPerson').selectOption({ label: 'Bea Shore' });
await person.waitForFunction(() => {
  const texts = Array.from(document.querySelectorAll('#pages .ann-body')).map((el) => el.innerText);
  return texts.length === 1 && texts[0] === 'Bea Only';
});
await release(person);
const personEnd = await person.waitForFunction(() => {
  const modal = document.getElementById('downloadModal');
  const btn = document.querySelector('#sizeOptions button[data-level="100"]');
  if (modal && !modal.hidden && btn && btn._bytes) return 'built';
  if ((window.__heldLoads ? window.__heldLoads() : 0) === 0 && modal.hidden && !(btn && btn._bytes)) return 'cancelled';
  return '';
}).then((handle) => handle.jsonValue());
const personView = await outcome(person);
check('changing person before the dialog opens cancels that download', personEnd === 'cancelled' && personView.hidden && !personView.ready && !/Bea Only|Ada Only/.test(personView.text), personEnd + ' ' + JSON.stringify(personView));
await person.close();

const file = await ready();
await holdLoads(file);
await file.click('#downloadBtn');
await file.waitForFunction(() => window.__heldLoads() >= 1);
await release(file);
await file.waitForSelector('#downloadModal:not([hidden])');
await file.waitForFunction(() => window.__heldLoads() >= 1);
await file.keyboard.press('Escape');
await file.waitForFunction(() => document.getElementById('downloadModal').hidden);
await file.locator('#fileInput').setInputFiles('/tmp/dl-b.pdf');
await file.waitForFunction(() => /dl-b/.test((document.getElementById('fileName') || {}).textContent || ''));
await release(file);
await file.waitForFunction(() => {
  const btn = document.querySelector('#sizeOptions button[data-level="100"]');
  return !!(btn && btn._bytes && !btn.disabled);
});
const staleFile = await outcome(file);
check('a build already started keeps file A and Ada when a second PDF opens', /File A label/.test(staleFile.text) && /Ada Only/.test(staleFile.text) && !/File B label|Bea Only/.test(staleFile.text), staleFile.text);
await file.evaluate(() => { PDFLib.PDFDocument.load = window.__realPdfLoad; });
await file.click('#downloadBtn');
await file.waitForSelector('#downloadModal:not([hidden])');
await file.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
const nextDownload = file.waitForEvent('download');
await file.locator('#sizeOptions button[data-level="100"]').click();
const nextFile = await nextDownload;
await nextFile.saveAs('/tmp/dl-b-edited.pdf');
const nextText = decode(readFileSync('/tmp/dl-b-edited.pdf'));
check('the new download is file B and does not carry Ada', nextFile.suggestedFilename() === 'dl-b-edited.pdf' && /File B label/.test(nextText) && !/Ada Only|Bea Only|File A label/.test(nextText), nextFile.suggestedFilename() + ' ' + nextText.slice(0, 180));
await file.close();

const over = await ready();
await holdLoads(over);
await over.click('#downloadBtn');
await over.waitForFunction(() => window.__heldLoads() >= 1);
await over.click('#startOver');
await release(over);
await over.waitForSelector('#empty:not([hidden])');
const overEnd = await outcome(over);
check('Start over during the opening download does not produce a file', overEnd.hidden && !overEnd.ready && await over.locator('#empty').isVisible(), JSON.stringify(overEnd));
await over.reload({ waitUntil: 'domcontentloaded' });
await over.waitForSelector('#empty:not([hidden])');
check('reload after that Start over stays empty', await over.locator('#pages canvas').count() === 0);
await over.close();

const typed = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })).newPage();
typed.setDefaultTimeout(20000);
await typed.goto('http://127.0.0.1:8777/tools/pdf-editor/?type=' + Date.now(), { waitUntil: 'domcontentloaded' });
await typed.locator('#fileInput').setInputFiles('/tmp/dl-type.pdf');
await typed.waitForSelector('#pages canvas', { state: 'visible' });
await typed.locator('#addText').click();
await typed.locator('.ann-body').click();
await typed.keyboard.type('Hello');
await typed.keyboard.press('Shift+Enter');
await typed.keyboard.type('Next');
await typed.keyboard.press('Control+z');
await typed.keyboard.press('Escape');
await typed.locator('#downloadBtn').focus();
await typed.keyboard.press('Enter');
await typed.waitForFunction(() => document.querySelector('#sizeOptions button[data-level="100"]:not([disabled])'));
for (let i = 0; i < 6; i++) {
  const level = await typed.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-level'));
  if (level === '100') break;
  await typed.keyboard.press('Tab');
}
const typedDownload = typed.waitForEvent('download');
await typed.keyboard.press('Enter');
const typedFile = await typedDownload;
await typedFile.saveAs('/tmp/dl-typed.pdf');
const typedText = decode(readFileSync('/tmp/dl-typed.pdf'));
check('keyboard download keeps the multiline text after undo and the file name', typedFile.suggestedFilename() === 'dl-type-edited.pdf' && typedText.includes('Hello') && typedText.includes('Nex') && !typedText.includes('Next'), typedFile.suggestedFilename() + ' ' + typedText.slice(0, 180));
await typed.close();

console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
