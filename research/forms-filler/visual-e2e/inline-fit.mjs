/** Fit advice is on the page while placing, and it uses the export glyph bounds. */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { inflateSync } from 'zlib';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts, rgb, degrees, PDFName, PDFNumber } = require('pdf-lib');
const { chromium } = pkg;
const WORD = 'SupercalifragilisticexpialidociousSupercalifragilisticexpialidocious';
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 280) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 200) : ''));
}
function streams(buf) {
  const raw = Buffer.from(buf).toString('latin1');
  const out = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = re.exec(raw))) {
    try { out.push(inflateSync(Buffer.from(m[1], 'latin1'))); } catch (err) { out.push(Buffer.from(m[1], 'latin1')); }
  }
  return Buffer.concat(out).toString('latin1');
}
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
const ui = await context.newPage();
ui.setDefaultTimeout(30000);
let pendingName = 'Ada Lane';
ui.on('dialog', (dialog) => dialog.accept(pendingName));

async function sheet(name, build) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 72, y: 500.6, width: 360, height: 1, color: rgb(0, 0, 0) });
  if (build) build(page, doc);
  const path = '/tmp/inline-' + name + '.pdf';
  writeFileSync(path, await doc.save());
  return path;
}
async function openDesk(file, withBea) {
  await ui.goto('http://127.0.0.1:8788/tools/forms-filler/?fit=' + Date.now(), { waitUntil: 'domcontentloaded' });
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
  const chooser = ui.waitForEvent('filechooser');
  await ui.click('#formDrop');
  await (await chooser).setFiles(file);
  await ui.waitForFunction(() => {
    const button = document.getElementById('placeMissing');
    return button && !button.disabled;
  }, null, { timeout: 40000 });
  await ui.click('#placeMissing');
  await ui.waitForURL(/pdf-editor/);
  await ui.waitForSelector('#pages .layer');
}
async function arm(value) {
  if (await ui.locator('#recoverBar').isHidden()) await ui.click('#assistToggle');
  await ui.waitForSelector('#recoverBar:not([hidden])');
  await ui.waitForFunction(() => document.getElementById('recoverFact').options.length > 0);
  const picked = await ui.evaluate((wanted) => {
    const fact = document.getElementById('recoverFact');
    const opt = Array.from(fact.options).find((item) => item.dataset.value === wanted);
    if (!opt) return false;
    fact.value = opt.value;
    return true;
  }, value);
  if (!picked) throw new Error('missing ' + value);
  await ui.click('#recoverPlace');
}
async function clickLayer(which, fx, fy) {
  const before = await ui.locator('#recoverStatus').innerText();
  const layer = ui.locator('#pages .layer').nth(which);
  await layer.scrollIntoViewIfNeeded();
  const box = await layer.boundingBox();
  await layer.click({ position: { x: Math.max(4, box.width * fx), y: Math.max(4, box.height * fy) } });
  await ui.waitForFunction((prev) => {
    const text = (document.getElementById('recoverStatus') || {}).textContent || '';
    return text !== prev && /Placed /.test(text);
  }, before);
  await ui.waitForTimeout(500);
}
async function note() {
  return ui.locator('#fitNote').evaluate((el) => ({
    hidden: el.hidden,
    live: el.getAttribute('aria-live'),
    role: el.getAttribute('role'),
    text: el.textContent || '',
    buttons: el.querySelectorAll('button').length
  }));
}

const letter = await sheet('letter');
await openDesk(letter, true);
await arm('Ada Lane');
await clickLayer(0, 0.2, (792 - 500.6) / 792);
const nameAt = await ui.locator('.ann').first().evaluate((el) => el.style.left + '|' + el.style.top);
const quiet = await note();
check('a name on the rule does not raise the fit note', quiet.hidden, quiet.text);
await arm(WORD);
await clickLayer(0, 0.96, 0.4);
const live = await note();
check('the fit note appears while placing and names a leftward distance', !live.hidden && live.role === 'status' && live.live === 'polite' && /Move it left about \d+ mm/.test(live.text), live.text);
await ui.reload();
await ui.waitForSelector('.ann-body');
await ui.waitForTimeout(700);
const afterReload = await note();
check('reload keeps the off-page word and the fit note', !afterReload.hidden && /Move it left about \d+ mm/.test(afterReload.text) && (await ui.locator('.ann-body').allInnerTexts()).some((text) => text === WORD), afterReload.text.slice(0, 120));
check('the off-page text is marked invalid', await ui.locator('.ann.ann-offpage').count() === 1 && await ui.locator('.ann.ann-offpage').getAttribute('aria-invalid') === 'true');
const boxBefore = await ui.locator('.ann').nth(1).evaluate((el) => el.style.left + el.style.top);
await ui.locator('#fitShow').click();
const selected = await ui.locator('.ann.selected .ann-body').innerText();
check('show this text selects the overflowing word', selected === WORD, selected);
check('showing the text does not move it', (await ui.locator('.ann.selected').evaluate((el) => el.style.left + el.style.top)) === boxBefore);
await ui.click('#downloadBtn');
await ui.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
const dl = ui.waitForEvent('download');
await ui.locator('#sizeOptions button[data-level="100"]').click();
const path = '/tmp/inline-out.pdf';
await (await dl).saveAs(path);
await ui.click('#dlClose');
const body = streams(readFileSync(path));
check('the export still contains the whole word', body.toLowerCase().includes(Buffer.from(WORD).toString('hex')));
const raster = await ui.evaluate(async (list) => {
  const opened = await pdfjsLib.getDocument({ data: new Uint8Array(list) }).promise;
  const pdfPage = await opened.getPage(1);
  const content = await pdfPage.getTextContent();
  const ada = content.items.find((item) => /Ada/.test(item.str || ''));
  const view = pdfPage.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = view.width; canvas.height = view.height;
  await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport: view }).promise;
  const right = canvas.getContext('2d').getImageData(canvas.width - 4, 0, 2, canvas.height).data;
  let dark = 0;
  for (let i = 0; i < right.length; i += 4) if (right[i] < 40) dark++;
  return { y: ada && ada.transform[5], h: ada && ada.height, dark };
}, Array.from(readFileSync(path)));
check('the name baseline is still on the rule and the render cuts the edge', raster.h === 14 && Math.abs(raster.y - 500.6) < 1.5 && raster.dark > 0, JSON.stringify(raster));

await ui.locator('.ann').nth(1).click();
await ui.locator('#fontSize').fill('22');
await ui.locator('#fontSize').dispatchEvent('input');
await ui.waitForTimeout(500);
const wide = await note();
check('a size wider than the page does not invent a move', !wide.hidden && /smaller size/.test(wide.text) && !/Move it /.test(wide.text), wide.text);
await ui.locator('#fontSize').fill('14');
await ui.locator('#fontSize').dispatchEvent('input');
for (let i = 0; i < 25; i++) await ui.click('#nudgeLeft');
await ui.waitForTimeout(500);
const cleared = await note();
check('nudging it on and restoring the size clears the note', cleared.hidden && (await ui.locator('.ann').nth(1).locator('.ann-body').innerText()) === WORD, cleared.text);

if (await ui.locator('#mapBox').isHidden()) await ui.click('#mapToggle');
await ui.locator('#mapName').fill('Fit map');
await ui.click('#mapSave');
await ui.waitForFunction(() => /Saved /.test((document.getElementById('recoverStatus') || {}).textContent || ''));
check('saving the map does not move the name', (await ui.locator('.ann').first().evaluate((el) => el.style.left + '|' + el.style.top)) === nameAt);
if (await ui.locator('#recoverBar').isHidden()) await ui.click('#assistToggle');
await ui.waitForSelector('#recoverBar:not([hidden])');
await ui.locator('#recoverPerson').selectOption({ label: 'Bea Shore' });
await ui.click('#mapApply');
await ui.waitForTimeout(600);
const again = await note();
const spots = await ui.locator('.ann').evaluateAll((els) => els.map((el) => el.style.left + '|' + el.style.top));
check('a longer mapped value stays in the saved box', spots.indexOf(nameAt) >= 0 && (await ui.locator('.ann-body').allInnerTexts()).some((text) => /ZZ$/.test(text)), JSON.stringify(spots));
await ui.click('#recoverUndo');
await ui.waitForTimeout(500);
check('undo restores the previous lines', /Ada Lane/.test((await ui.locator('.ann-body').allInnerTexts()).join('|')));

await sheet('rot90', (page) => page.setRotation(degrees(90)));
await openDesk('/tmp/inline-rot90.pdf');
await arm(WORD);
await clickLayer(0, 0.96, 0.45);
const rot = await note();
check('a quarter turn still gives a leftward distance', !rot.hidden && /Move it left about \d+ mm/.test(rot.text), rot.text.slice(0, 160));
await sheet('crop', (page) => page.setCropBox(36, 48, 520, 700));
await openDesk('/tmp/inline-crop.pdf');
await arm(WORD);
await clickLayer(0, 0.96, 0.4);
const crop = await note();
check('an offset crop still gives a distance', !crop.hidden && /Move it left about \d+ mm/.test(crop.text), crop.text.slice(0, 120));
await sheet('unit', (page) => page.node.set(PDFName.of('UserUnit'), PDFNumber.of(2)));
await openDesk('/tmp/inline-unit.pdf');
await arm(WORD);
await clickLayer(0, 0.96, 0.4);
const unit = await note();
check('UserUnit 2 scales the distance', !unit.hidden && /Move it left about 10[0-9] mm/.test(unit.text), unit.text.slice(0, 140));

const two = await PDFDocument.create();
two.addPage([612, 792]);
two.addPage([612, 792]);
writeFileSync('/tmp/inline-two.pdf', await two.save());
await openDesk('/tmp/inline-two.pdf');
await arm(WORD);
await clickLayer(0, 0.96, 0.3);
await arm(WORD);
await clickLayer(1, 0.96, 0.5);
const many = await note();
check('both pages and both pieces are listed', !many.hidden && many.buttons === 2 && /page 1/.test(many.text) && /page 2/.test(many.text), many.text.slice(0, 180));
await ui.locator('#fitShow').click();
check('the first show button selects a marked piece', await ui.locator('.ann.selected').count() === 1);

const nativePage = await context.newPage();
await nativePage.goto('http://127.0.0.1:8788/tools/forms-filler/?native=1', { waitUntil: 'domcontentloaded' });
await nativePage.waitForFunction(() => window.FormFields && window.FormThresholds);
const native = await nativePage.evaluate(async () => {
  const res = await fetch('/research/forms-filler/visual-e2e/fixtures/cc0/cc0-form.pdf');
  const buf = new Uint8Array(await res.arrayBuffer());
  const read = await FormFields.read(buf);
  return { route: read.route || read.kind, n: (read.fields || []).length, auto: FormThresholds.ocrAutofill.address };
});
await nativePage.close();
check('a native form still reads and scan autofill stays off', native.route === 'acro' && native.n === 5 && native.auto === false, JSON.stringify(native));

const out = { passed: checks.filter((item) => item.ok).length, failed: checks.filter((item) => !item.ok).length, checks };
writeFileSync('/tmp/inline-wt/research/forms-filler/visual-e2e/results/inline-fit.json', JSON.stringify(out, null, 2));
console.log('SUMMARY', out.passed, '/', checks.length);
await browser.close();
if (out.failed) process.exit(1);
