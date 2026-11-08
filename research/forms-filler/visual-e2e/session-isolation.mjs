/** A cleared or newer session must not accept another tab's marks or a bad record. */
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
const doc = await PDFDocument.create();
doc.addPage([612, 792]);
writeFileSync('/tmp/iso-blank.pdf', await doc.save());
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
async function sessionText() {
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
    return JSON.stringify(session || {});
  });
}
await page.goto('http://127.0.0.1:8788/tools/forms-filler/?iso=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-maps', 'tools-forms-editor'].forEach((name) => indexedDB.deleteDatabase(name));
  sessionStorage.clear();
  localStorage.removeItem('ff-editor-clear-generation');
});
await page.reload({ waitUntil: 'domcontentloaded' });
const chooser = page.waitForEvent('filechooser');
await page.click('#formDrop');
await (await chooser).setFiles('/tmp/iso-blank.pdf');
await page.waitForFunction(() => document.getElementById('placeMissing') && !document.getElementById('placeMissing').disabled);
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.locator('#recoverPersonName').fill('Ada Lane');
await page.click('#recoverAddPerson');
await page.waitForFunction(() => /no confirmed value yet/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
await page.locator('#recoverFactValue').fill('ONLYA');
await page.click('#recoverAddFact');
await page.waitForFunction(() => !document.getElementById('recoverPlace').disabled);
await page.click('#recoverPlace');
const layer = page.locator('#pages .layer').first();
const box = await layer.boundingBox();
await layer.click({ position: { x: box.width * 0.3, y: box.height * 0.4 } });
await page.waitForFunction(() => /Placed /.test((document.getElementById('recoverStatus') || {}).textContent || ''));
await page.waitForFunction(() => /Saved/.test((document.getElementById('saveState') || {}).textContent || ''));
const other = await context.newPage();
await other.goto('http://127.0.0.1:8788/tools/forms-filler/?iso-clear=' + Date.now(), { waitUntil: 'domcontentloaded' });
await other.click('#clearBtn');
await other.waitForFunction(() => /Started over/.test((document.getElementById('readStatus') || {}).textContent || ''));
await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
await page.waitForTimeout(400);
const afterClear = await sessionText();
check('an old tab cannot resurrect marks after start over', afterClear.indexOf('ONLYA') < 0, afterClear.slice(0, 180));
await other.close();

await page.goto('http://127.0.0.1:8788/tools/forms-filler/?iso2=' + Date.now(), { waitUntil: 'domcontentloaded' });
const again = page.waitForEvent('filechooser');
await page.click('#formDrop');
await (await again).setFiles('/tmp/iso-blank.pdf');
await page.waitForFunction(() => document.getElementById('placeMissing') && !document.getElementById('placeMissing').disabled);
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForFunction(() => /Saved|Choose the person|no confirmed|could not be read|other person/.test((document.getElementById('recoverStatus') || {}).textContent || '') || document.querySelector('.ann-body'));
await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('tools-forms-editor');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const current = await new Promise((resolve) => {
    const req = db.transaction('kv').objectStore('kv').get('session');
    req.onsuccess = () => resolve(req.result);
  });
  const newer = Object.assign({}, current, {
    epoch: Date.now() + 60000,
    generation: Date.now() + 60000,
    resumeProfileId: 'person-b',
    pages: current.pages.map((item) => Object.assign({}, item, { annotations: [{ id: 'bmark', type: 'text', x: 0.2, y: 0.2, w: 0.3, h: 0.05, text: 'ONLYB', fontSize: 14, color: '#1a1612', profileId: 'person-b' }] }))
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(newer, 'session');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
});
await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
await page.waitForTimeout(400);
const raced = await sessionText();
check('an older tab does not overwrite the newer person', raced.indexOf('ONLYB') >= 0 && raced.indexOf('ONLYA') < 0 && raced.indexOf('person-b') >= 0, raced.slice(0, 220));

await page.goto('http://127.0.0.1:8788/tools/forms-filler/?iso3=' + Date.now(), { waitUntil: 'domcontentloaded' });
const third = page.waitForEvent('filechooser');
await page.click('#formDrop');
await (await third).setFiles('/tmp/iso-blank.pdf');
await page.waitForFunction(() => document.getElementById('placeMissing') && !document.getElementById('placeMissing').disabled);
await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('tools-forms-editor');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const current = await new Promise((resolve) => {
    const req = db.transaction('kv').objectStore('kv').get('session');
    req.onsuccess = () => resolve(req.result);
  });
  const bytes = await new Promise((resolve) => {
    const req = db.transaction('kv').objectStore('kv').get('pdf');
    req.onsuccess = () => resolve(req.result);
  });
  let sha = current && current.pdfSha256;
  if (!sha && bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    sha = Array.from(new Uint8Array(digest)).map((b) => (b < 16 ? '0' : '') + b.toString(16)).join('');
  }
  sessionStorage.removeItem('ff-editor-handoff');
  const bad = {
    fileName: 'iso-blank.pdf',
    pages: [{ id: 'p', srcIndex: 0, rotation: 0, annotations: { text: 'EVIL<script>alert(1)</script>' } }],
    epoch: Date.now(),
    generation: Date.now(),
    pdfSha256: sha,
    sourceSha256: '',
    resumeProfileId: 'person-b',
    source: 'forms'
  };
  await new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(bad, 'session');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
});
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForFunction(() => ((document.getElementById('recoverStatus') || {}).textContent || '').length > 0);
const body = await page.locator('body').innerText();
const status = await page.locator('#recoverStatus').textContent();
check('a malformed mark record is not shown', body.indexOf('EVIL') < 0 && /could not be read/.test(status || ''), (status || '') + ' ' + page.url());
const out = { passed: checks.filter((item) => item.ok).length, failed: checks.filter((item) => !item.ok).length, checks };
writeFileSync('/tmp/inline-wt/research/forms-filler/visual-e2e/results/session-isolation.json', JSON.stringify(out, null, 2));
console.log('SUMMARY', out.passed, '/', checks.length);
await browser.close();
if (out.failed) process.exit(1);
