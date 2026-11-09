/** Placement-panel focus stays with the request that still owns the panel.
 *  Viewport 1280 by 900. This is not a phone. */
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 400) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 260) : ''));
}
async function makePdf(path, label) {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]).drawText(label, { x: 72, y: 700, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
  writeFileSync(path, await doc.save());
}
await makePdf('/tmp/assist-focus.pdf', 'Full name');
await makePdf('/tmp/assist-focus-next.pdf', 'Second page');

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const prompts = ['Ada Lane', 'Bea Shore'];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.setDefaultTimeout(20000);
page.on('dialog', async (d) => {
  if (d.type() === 'prompt') await d.accept(prompts.shift() || 'Ada Lane');
  else await d.accept();
});

async function personLabel() {
  return page.evaluate(() => {
    const pick = document.getElementById('recoverPerson');
    const option = pick && pick.selectedOptions && pick.selectedOptions[0];
    return option ? option.textContent : '';
  });
}
async function focusSnap() {
  return page.evaluate(() => {
    const bar = document.getElementById('recoverBar');
    const modal = document.getElementById('downloadModal');
    const el = document.activeElement;
    return {
      id: el && el.id,
      tag: el && el.tagName,
      open: !!(bar && !bar.hidden),
      inside: !!(bar && bar.contains(el)),
      dialog: !!(modal && !modal.hidden && modal.contains(el)),
      file: (document.getElementById('fileName') || {}).textContent || ''
    };
  });
}
async function holdLoads() {
  await page.evaluate(() => {
    const real = window.FormProfiles.load.bind(window.FormProfiles);
    const queue = [];
    window.__heldLoads = () => queue.length;
    window.__releaseLoad = () => { const next = queue.shift(); if (next) next(); };
    window.FormProfiles.load = function () {
      const result = real();
      return new Promise((resolve, reject) => { queue.push(() => result.then(resolve, reject)); });
    };
  });
}
async function held(atLeast) {
  await page.waitForFunction((n) => window.__heldLoads && window.__heldLoads() >= n, atLeast);
}
async function focusBody() {
  await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
}
async function release() {
  const before = await page.evaluate(() => window.__heldLoads());
  await page.evaluate(() => window.__releaseLoad());
  await page.waitForFunction((n) => window.__heldLoads() === n, before - 1);
}

await page.goto('http://127.0.0.1:8777/tools/forms-filler/?focus=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.evaluate(() => ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-editor'].forEach((name) => indexedDB.deleteDatabase(name)));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.click('#profileToggle');
await page.click('#profileAdd');
await page.locator('#factKey').selectOption('name');
await page.locator('#factValue').fill('Ada Lane');
await page.click('#factAdd');
await page.waitForFunction(() => { const input = document.querySelector('#profileFacts input'); return input && input.value === 'Ada Lane'; });
await page.click('#profileAdd');
await page.locator('#profilePick').selectOption({ label: 'Bea Shore' });
await page.locator('#factKey').selectOption('name');
await page.locator('#factValue').fill('Bea Shore');
await page.click('#factAdd');
await page.waitForFunction(() => { const input = document.querySelector('#profileFacts input'); return input && input.value === 'Bea Shore'; });
await page.keyboard.press('Escape');
const chooser = page.waitForEvent('filechooser');
await page.click('#formDrop');
await (await chooser).setFiles('/tmp/assist-focus.pdf');
await page.waitForFunction(() => document.getElementById('placeMissing') && !document.getElementById('placeMissing').disabled);
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForFunction(() => /Ada Lane/.test((document.getElementById('recoverPerson') || {}).innerText || ''));
const opened = await focusSnap();
check('the placement panel is open and focus is inside it', opened.open && opened.inside && opened.id === 'recoverPerson', JSON.stringify(opened));
await page.keyboard.press('Tab');
const next = await focusSnap();
check('the next tab stays inside the placement panel', next.inside, JSON.stringify(next));

async function switchPerson() {
  const current = await personLabel();
  const label = current === 'Bea Shore' ? 'Ada Lane' : 'Bea Shore';
  await page.locator('#recoverPerson').selectOption({ label });
  return label;
}
await holdLoads();
const textPerson = await switchPerson();
await held(1);
await page.locator('#addText').focus();
await release();
const typed = await focusSnap();
check('a held list load does not steal focus from Text', typed.id === 'addText' && (await personLabel()) === textPerson, JSON.stringify(typed));

const dialogPerson = await switchPerson();
await held(1);
await page.click('#downloadBtn');
await page.waitForSelector('#downloadModal:not([hidden])');
await page.waitForFunction(() => {
  const modal = document.getElementById('downloadModal');
  return modal && modal.contains(document.activeElement);
});
await release();
const dialog = await focusSnap();
check('a held list load does not steal focus from Download', dialog.dialog && (await personLabel()) === dialogPerson, JSON.stringify(dialog));
await page.keyboard.press('Escape');

const olderPerson = await switchPerson();
await held(1);
const keptPerson = await switchPerson();
await held(2);
await focusBody();
await release();
const stalePerson = await focusSnap();
check('an older person load does not restore its selection or take focus', stalePerson.tag === 'BODY' && (await personLabel()) === keptPerson && keptPerson !== olderPerson, JSON.stringify(stalePerson) + ' ' + await personLabel());
await release();
const currentPerson = await focusSnap();
check('the current person load focuses the open panel', currentPerson.id === 'recoverPerson' && (await personLabel()) === keptPerson, JSON.stringify(currentPerson));

const reopenPerson = await switchPerson();
await held(1);
await page.click('#assistToggle');
await page.click('#assistToggle');
await held(2);
await focusBody();
await release();
const reopened = await focusSnap();
check('closing and reopening leaves the older load unable to focus the new panel', reopened.open && reopened.tag === 'BODY' && (await personLabel()) === reopenPerson, JSON.stringify(reopened));
while (await page.evaluate(() => window.__heldLoads() > 0)) await release();
await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const reopenNow = await focusSnap();
check('the reopened panel focuses once its own load finishes', reopenNow.id === 'recoverPerson' && (await personLabel()) === reopenPerson, JSON.stringify(reopenNow));

const replacedPerson = await switchPerson();
await held(1);
const newDocPerson = await switchPerson();
await held(2);
await page.locator('#fileInput').setInputFiles('/tmp/assist-focus-next.pdf');
await page.waitForFunction(() => /assist-focus-next/.test((document.getElementById('fileName') || {}).textContent || ''));
await focusBody();
const queued = await page.evaluate(() => window.__heldLoads());
await release();
await release();
const newDoc = await focusSnap();
check('an older document load does not rewrite or focus the new document', /assist-focus-next/.test(newDoc.file) && newDoc.tag === 'BODY' && (await personLabel()) === newDocPerson && newDocPerson !== replacedPerson, JSON.stringify(newDoc) + ' queued ' + queued);
await release();
const newCurrent = await focusSnap();
check('the new document focuses its own open panel', /assist-focus-next/.test(newCurrent.file) && newCurrent.id === 'recoverPerson' && (await personLabel()) === newDocPerson, JSON.stringify(newCurrent));

const empty = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
empty.setDefaultTimeout(20000);
empty.on('dialog', async (d) => { await d.accept(); });
await empty.goto('http://127.0.0.1:8777/tools/pdf-editor/?empty=' + Date.now(), { waitUntil: 'domcontentloaded' });
await empty.evaluate(() => ['tools-forms-profiles', 'tools-edit-sign-pdf', 'tools-forms-editor'].forEach((name) => indexedDB.deleteDatabase(name)));
await empty.reload({ waitUntil: 'domcontentloaded' });
await empty.locator('#fileInput').setInputFiles('/tmp/assist-focus.pdf');
await empty.waitForSelector('#assistToggle', { state: 'visible' });
await empty.evaluate(() => {
  const real = window.FormProfiles.load.bind(window.FormProfiles);
  const queue = [];
  window.__heldLoads = () => queue.length;
  window.__releaseLoad = () => { const next = queue.shift(); if (next) next(); };
  window.FormProfiles.load = function () {
    const result = real();
    return new Promise((resolve, reject) => { queue.push(() => result.then(resolve, reject)); });
  };
});
await empty.click('#assistToggle');
await empty.waitForFunction(() => window.__heldLoads() >= 1);
await empty.click('#assistToggle');
await empty.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
await empty.evaluate(() => window.__releaseLoad());
await empty.waitForFunction(() => window.__heldLoads() === 0);
const emptyClosed = await empty.evaluate(() => {
  const bar = document.getElementById('recoverBar');
  const el = document.activeElement;
  return { open: !!(bar && !bar.hidden), id: el && el.id, tag: el && el.tagName };
});
check('an empty-person load does not reopen or focus a panel that was closed', !emptyClosed.open && emptyClosed.tag === 'BODY' && emptyClosed.id !== 'recoverPersonName', JSON.stringify(emptyClosed));

await empty.click('#assistToggle');
await empty.waitForFunction(() => window.__heldLoads() >= 1);
await empty.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
await empty.evaluate(() => window.__releaseLoad());
await empty.waitForFunction(() => window.__heldLoads() === 0);
await empty.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const emptyOpen = await empty.evaluate(() => {
  const bar = document.getElementById('recoverBar');
  const el = document.activeElement;
  return { open: !!(bar && !bar.hidden), id: el && el.id, inside: !!(bar && bar.contains(el)) };
});
check('the current empty panel focuses its name field', emptyOpen.open && emptyOpen.inside && emptyOpen.id === 'recoverPersonName', JSON.stringify(emptyOpen));

await empty.click('#assistToggle');
await empty.click('#assistToggle');
await empty.waitForFunction(() => window.__heldLoads() >= 1);
await empty.locator('#addText').focus();
await empty.evaluate(() => window.__releaseLoad());
await empty.waitForFunction(() => window.__heldLoads() === 0);
const emptyText = await empty.evaluate(() => document.activeElement && document.activeElement.id);
check('an empty-person load does not steal focus from Text', emptyText === 'addText', emptyText);

console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
