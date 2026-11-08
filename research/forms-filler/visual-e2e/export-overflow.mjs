/** Text that runs past the page is named before download. Coordinates stay put. */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { inflateSync } from 'zlib';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts, rgb, degrees, PDFName, PDFNumber } = require('pdf-lib');
const { chromium } = pkg;

const WORD = 'SupercalifragilisticexpialidociousSupercalifragilisticexpialidocious';
const ADDR = '14 Harbour Lane beside the long west warehouse and the south gate';
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 300) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 220) : ''));
}
function streams(buf) {
  const raw = Buffer.from(buf).toString('latin1');
  const out = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = re.exec(raw))) {
    const chunk = Buffer.from(m[1], 'latin1');
    try { out.push(inflateSync(chunk)); } catch (err) { out.push(chunk); }
  }
  return Buffer.concat(out).toString('latin1');
}

async function makePdf(kind) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 72, y: 500.6, width: 360, height: 1, color: rgb(0, 0, 0) });
  if (kind === 'rot') page.setRotation(degrees(arguments[1] || 0));
  if (kind === 'crop') page.setCropBox(36, 48, 520, 700);
  if (kind === 'unit') page.node.set(PDFName.of('UserUnit'), PDFNumber.of(2));
  const path = '/tmp/edge-' + kind + (arguments[1] || '') + '.pdf';
  writeFileSync(path, await doc.save());
  return path;
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
const ui = await context.newPage();
ui.setDefaultTimeout(30000);
let pendingName = 'Ada Lane';
ui.on('dialog', (dialog) => dialog.accept(pendingName));

async function openDesk(file, withBea) {
  await ui.goto('http://127.0.0.1:8777/tools/forms-filler/?edge=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await ui.evaluate(() => indexedDB.deleteDatabase('forms-filler'));
  await ui.reload({ waitUntil: 'domcontentloaded' });
  await ui.click('#profileToggle');
  pendingName = 'Ada Lane';
  await ui.click('#profileAdd');
  await ui.waitForFunction(() => document.getElementById('profilePick').options.length > 0);
  async function addFact(key, value) {
    await ui.locator('#factKey').selectOption(key);
    await ui.locator('#factValue').fill(value);
    await ui.click('#factAdd');
    await ui.waitForFunction((wanted) => Array.from(document.querySelectorAll('#profileFacts input')).some((input) => input.value === wanted), value);
  }
  await addFact('name', 'Ada Lane');
  await addFact('address', ADDR);
  await addFact('postal', WORD);
  if (withBea) {
    pendingName = 'Bea Shore';
    await ui.click('#profileAdd');
    await ui.waitForFunction(() => document.getElementById('profilePick').options.length > 1);
    await ui.locator('#profilePick').selectOption({ index: 1 });
    await addFact('name', 'Bea Shore');
    await addFact('postal', WORD + 'ZZ');
    await ui.locator('#profilePick').selectOption({ index: 0 });
  }
  const saved = await ui.evaluate(() => ({
    msg: (document.getElementById('profileMsg') || {}).textContent || '',
    keys: Array.from(document.querySelectorAll('#factKey option')).map((opt) => opt.value),
    facts: Array.from(document.querySelectorAll('#profileFacts input')).map((input) => input.value)
  }));
  await ui.waitForFunction((value) => {
    return Array.from(document.querySelectorAll('#profileFacts input')).some((input) => input.value === value);
  }, WORD);
  const chooser = ui.waitForEvent('filechooser');
  await ui.click('#formDrop');
  await (await chooser).setFiles(file);
  await ui.waitForFunction(() => {
    const button = document.getElementById('placeMissing');
    return button && !button.disabled;
  }, null, { timeout: 40000 });
  await ui.click('#placeMissing');
  await ui.waitForURL(/pdf-editor/);
  await ui.waitForFunction(() => document.querySelector('#pages .layer'));
}

async function arm(value) {
  if (await ui.locator('#recoverBar').isHidden()) await ui.click('#assistToggle');
  await ui.waitForSelector('#recoverBar:not([hidden])');
  await ui.waitForFunction(() => document.getElementById('recoverFact').options.length > 0);
  const picked = await ui.evaluate((wanted) => {
    const fact = document.getElementById('recoverFact');
    const opt = Array.from(fact.options).find((item) => item.dataset.value === wanted);
    if (!opt) return Array.from(fact.options).map((item) => item.textContent);
    fact.value = opt.value;
    return true;
  }, value);
  if (picked !== true) throw new Error('missing fact ' + JSON.stringify(picked));
  await ui.click('#recoverPlace');
  return ui.locator('#recoverStatus').innerText();
}
async function clickPage(fx, fy) {
  const before = await ui.locator('#recoverStatus').innerText();
  const layer = ui.locator('#pages .layer').first();
  const box = await layer.boundingBox();
  await layer.click({ position: { x: Math.max(4, box.width * fx), y: Math.max(4, box.height * fy) } });
  await ui.waitForFunction((prev) => {
    const text = (document.getElementById('recoverStatus') || {}).textContent || '';
    return text !== prev && /Placed /.test(text);
  }, before);
}
async function download() {
  await ui.click('#downloadBtn');
  await ui.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
  const warn = await ui.locator('#exportWarn').evaluate((el) => ({
    hidden: el.hidden,
    text: el.textContent || '',
    role: el.getAttribute('role')
  }));
  const enabled = await ui.locator('#sizeOptions button[data-level="100"]').isEnabled();
  const dl = ui.waitForEvent('download');
  await ui.locator('#sizeOptions button[data-level="100"]').click();
  const path = '/tmp/edge-out-' + Date.now() + '.pdf';
  await (await dl).saveAs(path);
  await ui.click('#dlClose');
  return { warn, enabled, path, body: streams(readFileSync(path)) };
}

const letter = await makePdf('letter');
await openDesk(letter, true);
await arm('Ada Lane');
await clickPage(0.2, (792 - 500.6) / 792);
const tops = await ui.locator('.ann').first().evaluate((el) => ({ top: el.style.top, left: el.style.left }));
await arm(WORD);
await clickPage(0.96, 0.4);
const editor = await ui.locator('.ann').nth(1).evaluate((el) => {
  const page = el.closest('.page').getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(el.querySelector('.ann-mirror'));
  const ink = range.getBoundingClientRect();
  return { text: el.querySelector('.ann-body').innerText, past: ink.right - page.right, top: el.style.top, left: el.style.left };
});
check('the editor shows the long word past the page', editor.past > 20 && editor.text === WORD, JSON.stringify(editor));
const first = await download();
check('download warns and stays available', first.warn.role === 'alert' && !first.warn.hidden && /runs past the page/.test(first.warn.text) && first.enabled, first.warn.text);
check('the export still contains the whole word', first.body.toLowerCase().includes(Buffer.from(WORD).toString('hex')), '');
check('the stored box did not move when the warning was built', (await ui.locator('.ann').nth(1).evaluate((el) => el.style.left + el.style.top)) === editor.left + editor.top);
const nameBox = await ui.locator('.ann').first().evaluate((el) => el.style.left + '|' + el.style.top);
if (await ui.locator('#mapBox').isHidden()) await ui.click('#mapToggle');
await ui.locator('#mapName').fill('Edge map');
await ui.click('#mapSave');
await ui.waitForFunction(() => /Saved /.test((document.getElementById('recoverStatus') || {}).textContent || ''));
check('saving a map does not move the name', (await ui.locator('.ann').first().evaluate((el) => el.style.left + '|' + el.style.top)) === nameBox, nameBox);
const nameItem = await ui.evaluate(async (list) => {
  const opened = await pdfjsLib.getDocument({ data: new Uint8Array(list) }).promise;
  const pdfPage = await opened.getPage(1);
  const content = await pdfPage.getTextContent();
  const view = pdfPage.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = view.width;
  canvas.height = view.height;
  await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport: view }).promise;
  const right = canvas.getContext('2d').getImageData(canvas.width - 4, 0, 2, canvas.height).data;
  let dark = 0;
  for (let i = 0; i < right.length; i += 4) if (right[i] < 40) dark++;
  const ada = content.items.find((item) => /Ada/.test(item.str || ''));
  return { ada: ada ? { y: ada.transform[5], h: ada.height } : null, dark };
}, Array.from(readFileSync(first.path)));
check('the name baseline is still on the rule', nameItem.ada && Math.abs(nameItem.ada.y - 500.6) < 1.5 && nameItem.ada.h === 14, JSON.stringify(nameItem.ada));
check('the rendered page cuts the word at the edge', nameItem.dark > 0, String(nameItem.dark));

await ui.click('#downloadBtn');
await ui.waitForSelector('#exportShow');
await ui.click('#exportShow');
const selected = await ui.locator('.ann.selected .ann-body').innerText();
check('show this text selects the overflowing word', selected === WORD, selected);
const beforeFont = selected;
await ui.locator('#fontSize').fill('22');
await ui.locator('#fontSize').dispatchEvent('input');
const afterFont = await ui.locator('.ann.selected .ann-body').innerText();
check('a larger size keeps the whole word', afterFont === beforeFont && await ui.locator('.ann.selected').evaluate((el) => el.dataset.fontSize) === '22', afterFont);
const left0 = await ui.locator('.ann.selected').evaluate((el) => el.style.left);
for (let i = 0; i < 25; i++) await ui.click('#nudgeLeft');
const left1 = await ui.locator('.ann.selected').evaluate((el) => el.style.left);
check('nudge moves the box and does not drop the word', left0 !== left1 && (await ui.locator('.ann.selected .ann-body').innerText()) === WORD, left0 + ' -> ' + left1);
await ui.locator('#fontSize').fill('14');
await ui.locator('#fontSize').dispatchEvent('input');
const nudged = await download();
check('a smaller size back on the page clears the warning', nudged.warn.hidden && (await ui.locator('.ann').nth(1).locator('.ann-body').innerText()) === WORD, nudged.warn.text);
await ui.locator('#recoverPerson').selectOption({ label: 'Bea Shore' });
await ui.click('#mapApply');
await ui.waitForFunction(() => /Applied /.test((document.getElementById('recoverStatus') || {}).textContent || ''));
const reapplied = await ui.locator('.ann').evaluateAll((els) => els.map((el) => ({
  at: el.style.left + '|' + el.style.top,
  text: el.querySelector('.ann-body').innerText
})));
check('a second person reuses the box with a longer value', reapplied.some((row) => row.at === nameBox) && reapplied.some((row) => /ZZ/.test(row.text)), JSON.stringify(reapplied.map((row) => row.at)));
await ui.locator('#recoverPerson').selectOption({ label: 'Ada Lane' });
await arm(ADDR);
await clickPage(0.3, 0.9);
await ui.locator('.ann').last().locator('.ann-body').click();
await ui.keyboard.press('End');
for (let i = 0; i < 6; i++) {
  await ui.keyboard.press('Shift+Enter');
  await ui.keyboard.type('Line ' + i);
}
const multiline = await ui.locator('.ann').last().locator('.ann-body').innerText();
check('newlines stay in the address', /Line 5/.test(multiline), multiline.slice(0, 120));
const bottom = await download();
check('lines that leave the bottom of the page are warned', !bottom.warn.hidden && /run past the page/.test(bottom.warn.text), bottom.warn.text);
await ui.click('#recoverUndo');
await ui.waitForFunction(() => /Undid/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
check('undo removes the last placement change', /Undid/.test(await ui.locator('#recoverStatus').innerText()));
await ui.reload();
await ui.waitForSelector('.ann-body');
const kept = await ui.locator('.ann-body').allInnerTexts();
check('reload keeps the placed name', kept.some((text) => /Ada/.test(text)), kept.join(' | ').slice(0, 160));

async function rotationCase(angle) {
  const path = await (async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    page.setRotation(degrees(angle));
    const file = '/tmp/edge-rot-' + angle + '.pdf';
    writeFileSync(file, await doc.save());
    return file;
  })();
  await openDesk(path);
  const statusBefore = await arm(WORD);
  let placed = true;
  try { await clickPage(0.96, 0.45); } catch (err) { placed = false; }
  if (!placed) return { angle, placed, status: statusBefore };
  const got = await download();
  return { angle, placed, warned: !got.warn.hidden, text: got.warn.text };
}
for (const angle of [0, 90, 180, 270]) {
  const row = await rotationCase(angle);
  check('quarter turn ' + angle + ' warns when the word leaves the page', row.placed && row.warned, JSON.stringify(row));
}

const cropFile = await (async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  page.setCropBox(36, 48, 520, 700);
  writeFileSync('/tmp/edge-crop.pdf', await doc.save());
  return '/tmp/edge-crop.pdf';
})();
await openDesk(cropFile);
await arm(WORD);
await clickPage(0.96, 0.4);
const cropDl = await download();
check('an offset crop box still warns', !cropDl.warn.hidden, cropDl.warn.text);

const unitFile = await (async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  page.node.set(PDFName.of('UserUnit'), PDFNumber.of(2));
  writeFileSync('/tmp/edge-unit.pdf', await doc.save());
  return '/tmp/edge-unit.pdf';
})();
await openDesk(unitFile);
const unitStatus = await (async () => {
  if (await ui.locator('#recoverBar').isHidden()) await ui.click('#assistToggle');
  await ui.evaluate((wanted) => {
    const fact = document.getElementById('recoverFact');
    const opt = Array.from(fact.options).find((item) => item.dataset.value === wanted);
    if (opt) fact.value = opt.value;
  }, WORD);
  await ui.click('#recoverPlace');
  const before = await ui.locator('#recoverStatus').innerText();
  const layer = ui.locator('#pages .layer').first();
  const box = await layer.boundingBox();
  await layer.click({ position: { x: box.width * 0.96, y: box.height * 0.4 } });
  await ui.waitForTimeout(500);
  return ui.locator('#recoverStatus').innerText();
})();
const unitPlaced = await ui.locator('.ann').count();
if (unitPlaced) {
  const unitDl = await download();
  check('UserUnit 2 warns when the word leaves the page', !unitDl.warn.hidden, unitDl.warn.text);
} else {
  check('UserUnit 2 is refused rather than placed off scale', /scale|not placed/i.test(unitStatus), unitStatus);
}

const narrow = await browser.newContext({ viewport: { width: 390, height: 800 }, acceptDownloads: true });
const phone = await narrow.newPage();
phone.setDefaultTimeout(30000);
phone.on('dialog', (dialog) => dialog.accept('Ada Lane'));
await phone.goto('http://127.0.0.1:8777/tools/forms-filler/?narrow=' + Date.now(), { waitUntil: 'domcontentloaded' });
await phone.click('#profileToggle');
await phone.click('#profileAdd');
await phone.waitForFunction(() => document.getElementById('profilePick').options.length > 0);
await phone.locator('#factKey').selectOption('postal');
await phone.locator('#factValue').fill(WORD);
await phone.click('#factAdd');
await phone.waitForFunction((value) => Array.from(document.querySelectorAll('#profileFacts input')).some((input) => input.value === value), WORD);
const narrowChoose = phone.waitForEvent('filechooser');
await phone.click('#formDrop');
await (await narrowChoose).setFiles(letter);
await phone.waitForFunction(() => {
  const button = document.getElementById('placeMissing');
  return button && !button.disabled;
}, null, { timeout: 40000 });
await phone.click('#placeMissing');
await phone.waitForURL(/pdf-editor/);
await phone.waitForFunction(() => document.querySelector('#pages .layer'));
if (await phone.locator('#recoverBar').isHidden()) await phone.click('#assistToggle');
await phone.evaluate((wanted) => {
  const fact = document.getElementById('recoverFact');
  fact.value = Array.from(fact.options).find((item) => item.dataset.value === wanted).value;
}, WORD);
await phone.click('#recoverPlace');
const narrowBefore = await phone.locator('#recoverStatus').innerText();
const narrowLayer = phone.locator('#pages .layer').first();
const narrowBox = await narrowLayer.boundingBox();
await narrowLayer.click({ position: { x: narrowBox.width * 0.96, y: narrowBox.height * 0.4 } });
await phone.waitForFunction((prev) => /Placed /.test((document.getElementById('recoverStatus') || {}).textContent || '') && (document.getElementById('recoverStatus') || {}).textContent !== prev, narrowBefore);
await phone.click('#downloadBtn');
await phone.waitForSelector('#exportWarn:not([hidden])');
const fit = await phone.locator('#exportWarn').evaluate((el) => {
  const rect = el.getBoundingClientRect();
  return { left: rect.left, right: rect.right, top: rect.top, width: rect.width, inner: window.innerWidth };
});
check('at 390px the warning is on screen', fit.left >= 0 && fit.right <= fit.inner + 1 && fit.top >= 0 && fit.width > 40, JSON.stringify(fit));
await narrow.close();

const out = { passed: checks.filter((item) => item.ok).length, failed: checks.filter((item) => !item.ok).length, checks };
writeFileSync('/tmp/export-wt/research/forms-filler/visual-e2e/results/export-overflow.json', JSON.stringify(out, null, 2));
console.log('SUMMARY', out.passed, '/', checks.length);
await browser.close();
if (out.failed) process.exit(1);
