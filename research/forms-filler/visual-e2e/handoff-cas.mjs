/** The editor handoff must commit the click's file, person, and generation. */
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument } = require('pdf-lib');
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 300) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 220) : ''));
}
async function blank(path) {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  writeFileSync(path, await doc.save());
}
await blank('/tmp/cas-a.pdf');
await blank('/tmp/cas-b.pdf');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
async function stored() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('tools-forms-editor');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const session = await new Promise((resolve) => {
      const req = db.transaction('kv').objectStore('kv').get('session');
      req.onsuccess = () => resolve(req.result || null);
    });
    return session;
  });
}
async function readyFile(path) {
  await page.goto('http://127.0.0.1:8788/tools/forms-filler/?cas=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-maps', 'tools-forms-editor'].forEach((name) => indexedDB.deleteDatabase(name));
    sessionStorage.clear();
    localStorage.removeItem('ff-editor-clear-generation');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const chooser = page.waitForEvent('filechooser');
  await page.click('#formDrop');
  await (await chooser).setFiles(path);
  await page.waitForFunction(() => document.getElementById('placeMissing') && !document.getElementById('placeMissing').disabled);
}
async function holdDigest() {
  await page.evaluate(() => {
    const real = crypto.subtle.digest.bind(crypto.subtle);
    const queued = [];
    crypto.subtle.digest = function (alg, data) {
      window.__digestQueued = queued.length + 1;
      return new Promise(function (resolve) { queued.push(function () { resolve(real(alg, data)); }); });
    };
    window.__digestQueued = 0;
    window.__releaseDigest = function () { const jobs = queued.splice(0); window.__digestQueued = 0; jobs.forEach(function (fn) { fn(); }); };
  });
}
await readyFile('/tmp/cas-a.pdf');
await holdDigest();
await page.click('#placeMissing');
await page.waitForFunction(() => window.__digestQueued > 0);
await page.click('#clearBtn');
await page.waitForFunction(() => /Started over/.test((document.getElementById('readStatus') || {}).textContent || ''));
await page.evaluate(() => window.__releaseDigest());
await page.waitForFunction(() => /Nothing was written/.test((document.getElementById('readStatus') || {}).textContent || ''));
const afterClear = await stored();
check('start over during the handoff does not reopen or restore bytes', /forms-filler/.test(page.url()) && !afterClear, await page.locator('#readStatus').innerText());

await readyFile('/tmp/cas-a.pdf');
await holdDigest();
await page.click('#placeMissing');
await page.waitForFunction(() => window.__digestQueued > 0);
const swap = page.waitForEvent('filechooser');
await page.click('#formDrop');
await (await swap).setFiles('/tmp/cas-b.pdf');
await page.waitForFunction(() => /cas-b\.pdf/.test((document.getElementById('formLabel') || {}).textContent || '') && !document.getElementById('readStatus').classList.contains('busy'));
await page.evaluate(() => window.__releaseDigest());
await page.waitForFunction(() => /form changed|Nothing was written/.test((document.getElementById('readStatus') || {}).textContent || ''));
const afterFile = await stored();
check('a different file during the handoff does not store the first bytes', /forms-filler/.test(page.url()) && !(afterFile && afterFile.fileName === 'cas-a.pdf'), await page.locator('#readStatus').innerText());

await readyFile('/tmp/cas-a.pdf');
await page.click('#profileToggle');
page.once('dialog', (dialog) => dialog.accept('Ada Lane'));
await page.click('#profileAdd');
await page.waitForFunction(() => Array.from(document.getElementById('profilePick').options).some((opt) => opt.textContent === 'Ada Lane'));
page.once('dialog', (dialog) => dialog.accept('Bea Shore'));
await page.click('#profileAdd');
await page.waitForFunction(() => Array.from(document.getElementById('profilePick').options).some((opt) => opt.textContent === 'Bea Shore'));
await page.locator('#profilePick').selectOption({ label: 'Ada Lane' });
await holdDigest();
await page.click('#placeMissing');
await page.waitForFunction(() => window.__digestQueued > 0);
await page.locator('#profilePick').evaluate((el) => {
  const bea = Array.from(el.options).filter((opt) => opt.textContent === 'Bea Shore')[0];
  el.value = bea.value;
});
await page.evaluate(() => window.__releaseDigest());
await page.waitForFunction(() => /person changed|Nothing was written/.test((document.getElementById('readStatus') || {}).textContent || ''));
check('a person change during the handoff does not open the editor', /forms-filler/.test(page.url()), await page.locator('#readStatus').innerText());

await readyFile('/tmp/cas-a.pdf');
const other = await context.newPage();
await other.goto(page.url(), { waitUntil: 'domcontentloaded' });
await holdDigest();
await page.click('#placeMissing');
await page.waitForFunction(() => window.__digestQueued > 0);
await other.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('tools-forms-editor');
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put({
      fileName: 'newer.pdf', epoch: Date.now() + 60000, generation: Date.now() + 60000,
      pages: [{ id: 'p', srcIndex: 0, rotation: 0, annotations: [{ id: 'n', type: 'text', x: 0.2, y: 0.2, w: 0.2, h: 0.05, text: 'NEWER', fontSize: 14, color: '#1a1612', profileId: 'person-b' }] }],
      resumeProfileId: 'person-b', pdfSha256: 'abc', source: 'forms'
    }, 'session');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
});
await page.evaluate(() => window.__releaseDigest());
await page.waitForFunction(() => /newer editor session|Nothing was replaced/.test((document.getElementById('readStatus') || {}).textContent || ''));
const kept = await stored();
check('a newer tab is not overwritten by this handoff', /forms-filler/.test(page.url()) && kept && kept.fileName === 'newer.pdf' && JSON.stringify(kept).indexOf('NEWER') >= 0, kept && kept.fileName);
const out = { passed: checks.filter((item) => item.ok).length, failed: checks.filter((item) => !item.ok).length, checks };
writeFileSync('/tmp/inline-wt/research/forms-filler/visual-e2e/results/handoff-cas.json', JSON.stringify(out, null, 2));
console.log('SUMMARY', out.passed, '/', checks.length);
await browser.close();
if (out.failed) process.exit(1);
