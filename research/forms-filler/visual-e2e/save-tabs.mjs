/** Two tabs share one browser save. A later stamp must not replace another tab's committed edit. Viewport 1100 by 900. Not a phone. */
import { writeFileSync } from 'fs';
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
const doc = await PDFDocument.create();
doc.addPage([612, 792]).drawText('Shared page', { x: 72, y: 700, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
writeFileSync('/tmp/save-tabs.pdf', await doc.save());
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

async function pair() {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await context.addInitScript(() => {
    const origTimeout = window.setTimeout.bind(window);
    window.setTimeout = function (fn, delay) {
      return origTimeout(function () {
        if (delay === 160 && window.__tieStamp) {
          const real = Date.now;
          Date.now = function () { return window.__tieStamp; };
          try { return fn(); } finally { Date.now = real; }
        } else return fn();
      }, delay);
    };
    const orig = indexedDB.open.bind(indexedDB);
    const pending = [];
    window.__heldOpens = () => pending.length;
    window.__armHold = () => { window.__holdEditorDb = true; };
    window.__releaseOldest = () => { const fn = pending.shift(); if (fn) origTimeout(fn, 0); };
    indexedDB.open = function (name, version) {
      const req = orig(name, version);
      if (name !== 'tools-edit-sign-pdf' || !window.__holdEditorDb || window.__bypassHold) return req;
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
  const a = await context.newPage();
  const b = await context.newPage();
  for (const page of [a, b]) {
    page.setDefaultTimeout(15000);
    page.on('dialog', (d) => d.accept());
  }
  return { context, a, b };
}
async function marks(page) { return page.locator('#pages .ann-body').allInnerTexts(); }
async function statusOf(page) { return page.locator('#saveState').innerText(); }
async function toast(page) { return page.locator('#toast').innerText().catch(() => ''); }
async function stored(page) {
  return page.evaluate(() => new Promise((resolve) => {
    window.__bypassHold = true;
    const req = indexedDB.open('tools-edit-sign-pdf');
    req.onsuccess = () => {
      const sessionReq = req.result.transaction('kv', 'readonly').objectStore('kv').get('session');
      sessionReq.onsuccess = () => {
        const session = sessionReq.result;
        const text = session && session.pages && session.pages[0] && session.pages[0].annotations
          ? session.pages[0].annotations.map((ann) => ann.text || '').join(' | ') : '';
        resolve({ text: text, savedAt: session && session.savedAt || 0, present: !!session, revision: session && session.revision || 0 });
      };
    };
    req.onerror = () => resolve({ present: false, text: '' });
  }));
}
async function seed(a, b, token) {
  await a.goto('http://127.0.0.1:8840/tools/pdf-editor/?' + token, { waitUntil: 'domcontentloaded' });
  await a.evaluate(() => indexedDB.deleteDatabase('tools-edit-sign-pdf'));
  await a.reload({ waitUntil: 'domcontentloaded' });
  await a.locator('#fileInput').setInputFiles('/tmp/save-tabs.pdf');
  await a.waitForSelector('#pages canvas', { state: 'visible' });
  await a.locator('#addText').click();
  await a.locator('.ann-body').click();
  await a.keyboard.type('Shared');
  await a.keyboard.press('Escape');
  await a.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Saved');
  await b.goto('http://127.0.0.1:8840/tools/pdf-editor/?' + token + '-b', { waitUntil: 'domcontentloaded' });
  await b.waitForSelector('#pages .ann-body');
}
async function retitle(page, text) {
  await page.locator('.ann-body').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
}

{
  const { context, a, b } = await pair();
  await seed(a, b, 'next=' + Date.now());
  await retitle(b, 'From B');
  await b.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Saved');
  const kept = await stored(a);
  check('a tab that opened the committed file can save the next edit', kept.text === 'From B' && kept.revision > 0, JSON.stringify(kept));
  await retitle(a, 'From A later');
  await a.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Not saved');
  const refused = await stored(a);
  check('a stale tab does not replace the other tab’s committed text', refused.text === 'From B', JSON.stringify(refused));
  check('the stale tab says it was not saved', (await statusOf(a)) === 'Not saved' && /kept another save/.test(await toast(a)), (await statusOf(a)) + ' ' + await toast(a));
  check('the tab that committed still says Saved and shows its own text', (await statusOf(b)) === 'Saved' && (await marks(b)).join('|') === 'From B', (await statusOf(b)) + ' ' + (await marks(b)).join('|'));
  await a.reload({ waitUntil: 'domcontentloaded' });
  await a.waitForSelector('#pages .ann-body');
  check('reload shows the committed text in the tab that was refused', (await marks(a)).join('|') === 'From B', (await marks(a)).join('|'));
  await retitle(a, 'After reload');
  await a.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Saved');
  check('after reload that tab can save the next edit', (await stored(a)).text === 'After reload', (await stored(a)).text);
  await context.close();
}

async function tied(order) {
  const { context, a, b } = await pair();
  await seed(a, b, 'tie' + order + Date.now());
  await a.evaluate(() => { window.__tieStamp = 1893456000000; window.__armHold(); });
  await b.evaluate(() => { window.__tieStamp = 1893456000000; window.__armHold(); });
  await retitle(a, 'Tied A');
  await retitle(b, 'Tied B');
  await a.waitForFunction(() => window.__heldOpens() >= 1);
  await b.waitForFunction(() => window.__heldOpens() >= 1);
  const first = order === 'A' ? a : b;
  const second = order === 'A' ? b : a;
  const firstText = order === 'A' ? 'Tied A' : 'Tied B';
  await first.evaluate(() => window.__releaseOldest());
  await first.waitForFunction(() => window.__heldOpens() === 0 && (document.getElementById('saveState') || {}).textContent === 'Saved');
  await second.evaluate(() => window.__releaseOldest());
  await second.waitForFunction(() => window.__heldOpens() === 0 && (document.getElementById('saveState') || {}).textContent === 'Not saved');
  const final = await stored(a);
  check('an equal timestamp keeps the save that committed first (' + order + ' first)', final.text === firstText && final.savedAt === 1893456000000, JSON.stringify(final) + ' status ' + await statusOf(a) + '/' + await statusOf(b));
  check('the other tab is told that equal-time save was not stored (' + order + ' first)', /kept another save/.test(await toast(second)), await toast(second));
  await context.close();
}
await tied('A');
await tied('B');

{
  const { context, a, b } = await pair();
  await seed(a, b, 'clear' + Date.now());
  await b.evaluate(() => window.__armHold());
  await retitle(b, 'Late from B');
  await b.waitForFunction(() => window.__heldOpens() >= 1);
  await a.click('#startOver');
  await a.waitForSelector('#empty:not([hidden])');
  await b.evaluate(() => window.__releaseOldest());
  await b.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Not saved');
  const after = await stored(a);
  check('a late save does not bring back a file cleared in the other tab', !after.present && await a.locator('#empty').isVisible(), JSON.stringify(after));
  check('the late tab says the clear was kept', (await statusOf(b)) === 'Not saved' && /cleared this file/.test(await toast(b)), (await statusOf(b)) + ' ' + await toast(b));
  await b.reload({ waitUntil: 'domcontentloaded' });
  await b.waitForSelector('#empty:not([hidden])');
  check('reload stays empty after the late save', await b.locator('#empty').isVisible() && (await marks(b)).length === 0);
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const opener = await context.newPage();
  opener.setDefaultTimeout(15000);
  await opener.goto('http://127.0.0.1:8840/tools/pdf-editor/?open=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await opener.evaluate(() => indexedDB.deleteDatabase('tools-edit-sign-pdf'));
  await opener.reload({ waitUntil: 'domcontentloaded' });
  await opener.locator('#fileInput').setInputFiles('/tmp/save-tabs.pdf');
  await opener.waitForSelector('#pages canvas', { state: 'visible' });
  await opener.locator('#addText').click();
  await opener.locator('.ann-body').click();
  await opener.keyboard.type('Shared');
  await opener.keyboard.press('Escape');
  await opener.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Saved');
  await opener.evaluate(() => sessionStorage.setItem('ff-editor-canary', 'from-opener'));
  const popupPromise = opener.waitForEvent('popup');
  await opener.evaluate(() => window.open(location.pathname + '?child=1', '_blank'));
  const child = await popupPromise;
  child.setDefaultTimeout(15000);
  await child.waitForSelector('#pages .ann-body');
  const inherited = await child.evaluate(() => sessionStorage.getItem('ff-editor-canary'));
  check('a tab opened from this one inherits sessionStorage', inherited === 'from-opener', inherited);
  await retitle(child, 'From child');
  await child.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Saved');
  await retitle(opener, 'From opener later');
  await opener.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Not saved');
  const kept = await stored(opener);
  check('the opener cannot replace the save made in the tab it opened', kept.text === 'From child' && (await statusOf(opener)) === 'Not saved' && (await statusOf(child)) === 'Saved', JSON.stringify(kept) + ' ' + await statusOf(opener) + '/' + await statusOf(child));
  await opener.reload({ waitUntil: 'domcontentloaded' });
  await opener.waitForSelector('#pages .ann-body');
  check('reload restores the save from the opened tab', (await marks(opener)).join('|') === 'From child', (await marks(opener)).join('|'));
  await retitle(opener, 'After reload');
  await opener.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Saved');
  check('after reload the opener can save the next edit', (await stored(opener)).text === 'After reload', (await stored(opener)).text);
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const original = await context.newPage();
  original.setDefaultTimeout(15000);
  await original.goto('http://127.0.0.1:8840/tools/pdf-editor/?dup=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await original.evaluate(() => indexedDB.deleteDatabase('tools-edit-sign-pdf'));
  await original.reload({ waitUntil: 'domcontentloaded' });
  await original.locator('#fileInput').setInputFiles('/tmp/save-tabs.pdf');
  await original.waitForSelector('#pages canvas', { state: 'visible' });
  await original.locator('#addText').click();
  await original.locator('.ann-body').click();
  await original.keyboard.type('Shared');
  await original.keyboard.press('Escape');
  await original.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Saved');
  await original.evaluate(() => sessionStorage.setItem('ff-editor-tab', 'cloned-writer'));
  const duplicate = await context.newPage();
  duplicate.setDefaultTimeout(15000);
  await duplicate.addInitScript(() => { sessionStorage.setItem('ff-editor-tab', 'cloned-writer'); });
  await duplicate.goto('http://127.0.0.1:8840/tools/pdf-editor/?dup-child=1', { waitUntil: 'domcontentloaded' });
  await duplicate.waitForSelector('#pages .ann-body');
  const cloned = await duplicate.evaluate(() => sessionStorage.getItem('ff-editor-tab'));
  check('a duplicated tab does not keep the copied writer id', cloned !== 'cloned-writer', cloned);
  await retitle(duplicate, 'From duplicate');
  await duplicate.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Saved');
  await retitle(original, 'From original later');
  await original.waitForFunction(() => (document.getElementById('saveState') || {}).textContent === 'Not saved');
  const kept = await stored(original);
  check('a duplicated tab’s committed text survives the original tab’s later save', kept.text === 'From duplicate' && (await statusOf(duplicate)) === 'Saved', JSON.stringify(kept) + ' ' + await statusOf(original));
  await context.close();
}

console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
