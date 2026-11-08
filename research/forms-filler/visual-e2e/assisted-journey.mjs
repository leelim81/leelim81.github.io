/** First-time assisted journey through visible controls only.
 *  A fresh browser context. No seeded profiles, no injected fields, no app helpers for clicks.
 *  File choice uses the page's file dialog. Prompts use the browser prompt. */
import { readFileSync, writeFileSync } from 'fs';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const FOOD = '/tmp/ff-natural-work/bounded/wellcome-food-order-bounded.jpg';
const PDF = '/workspace/tools/forms-filler/samples/flat-day-pass.pdf';
const { chromium } = pkg;
const checks = [];
let interactions = 0;

function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 500) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 300) : ''));
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(25000);
const prompts = [];
page.on('dialog', async (dialog) => {
  const message = dialog.message();
  const next = prompts.shift();
  console.log('DIALOG', dialog.type(), message, '->', next == null ? 'dismiss' : next);
  if (dialog.type() === 'prompt' && next != null) await dialog.accept(String(next));
  else if (dialog.type() === 'confirm') await dialog.accept();
  else await dialog.dismiss();
});

async function click(selector) {
  interactions += 1;
  await page.locator(selector).click();
}
async function chooseFile(trigger, file) {
  const chooserWait = page.waitForEvent('filechooser');
  await click(trigger);
  const chooser = await chooserWait;
  interactions += 1;
  await chooser.setFiles(file);
}

await page.goto('http://127.0.0.1:8765/tools/forms-filler/?fresh=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#profileToggle');

check('place missing starts disabled', await page.locator('#placeMissing').isDisabled());
check('fill starts disabled', await page.locator('#fillBtn').isDisabled());
check('saved values start collapsed', await page.locator('#profileBox').isHidden());

await click('#profileToggle');
const focusOpen = await page.evaluate(() => document.activeElement && document.activeElement.id);
check('opening saved values moves focus into the panel', focusOpen === 'profileBox', focusOpen);
const emptyText = await page.locator('#profileFacts').innerText();
check('empty store says no one is saved', /No one is saved yet/.test(emptyText), emptyText);

await click('#factAdd');
await page.waitForFunction(() => /Choose a person first/.test(document.getElementById('profileMsg').textContent || ''));
check('add value with no person asks for a person', true, await page.locator('#profileMsg').innerText());

prompts.push('');
await click('#profileAdd');
await page.waitForTimeout(200);
check('blank person name adds nobody', /No one is saved yet/.test(await page.locator('#profileFacts').innerText()));

prompts.push('Ada Lane');
await click('#profileAdd');
await page.waitForFunction(() => /Ada Lane/.test(document.getElementById('profilePick').innerText));
check('new person appears in the person control', true);

async function addFact(key, value) {
  await page.locator('#factKey').selectOption(key);
  interactions += 1;
  await page.locator('#factValue').fill(value);
  interactions += 1;
  await click('#factAdd');
  await page.waitForFunction((factKey) => {
    const input = document.querySelector('#profileFacts input[aria-label="' + factKey + '"]');
    return input && input.value.length > 0;
  }, key);
}
await addFact('name', 'Ada Lane');
await addFact('address', '14 Harbour Lane');
const facts = await page.locator('#profileFacts').innerText();
check('name and address show as confirmed user values', /name \(confirmed, user\)/.test(facts) && /address \(confirmed, user\)/.test(facts), facts);

await page.keyboard.press('Escape');
interactions += 1;
check('escape closes saved values and returns focus', await page.locator('#profileBox').isHidden() && await page.evaluate(() => document.activeElement.id === 'profileToggle'));

await chooseFile('#formDrop', FOOD);
await page.waitForFunction(() => {
  const text = (document.getElementById('readStatus') || {}).textContent || '';
  return /No lines were found|scan estimates|could not|took too long|did not decode/.test(text);
}, null, { timeout: 90000 });
const status = await page.locator('#readStatus').innerText();
check('failed scan names Place a missing line', /Place a missing line/.test(status), status);
check('place missing is enabled after the read', !(await page.locator('#placeMissing').isDisabled()));

await click('#placeMissing');
await page.waitForURL(/pdf-editor/, { timeout: 30000 });
await page.waitForSelector('#assistToggle', { state: 'visible' });
await page.locator('#pages canvas').first().waitFor({ state: 'visible' });
await page.waitForFunction(() => /Ada Lane/.test((document.getElementById('recoverPerson') || {}).innerText || ''));
const arrivedOpen = !(await page.locator('#recoverBar').isHidden());
const arrivedFocus = await page.evaluate(() => document.activeElement && document.activeElement.id);
check('a missed scan opens the placement panel on its own', arrivedOpen);
check('focus is inside that panel once the saved person is listed', await page.evaluate(() => {
  const bar = document.getElementById('recoverBar');
  return !!(bar && !bar.hidden && bar.contains(document.activeElement));
}), arrivedFocus);
if (!arrivedOpen) await click('#assistToggle');

const offered = await page.locator('#recoverFact option').allInnerTexts();
check('placement offers the confirmed name and address', offered.some((text) => /name: Ada Lane/.test(text)) && offered.some((text) => /address: 14 Harbour Lane/.test(text)), offered.join(' | '));

async function placeFact(label, xFrac, yFrac) {
  await page.locator('#recoverFact').selectOption({ label });
  interactions += 1;
  await click('#recoverPlace');
  const armed = await page.locator('#recoverStatus').innerText();
  const layer = page.locator('#pages .layer').first();
  const box = await layer.boundingBox();
  interactions += 1;
  await layer.click({ position: { x: Math.round(box.width * xFrac), y: Math.round(box.height * yFrac) } });
  await page.waitForTimeout(200);
  return { armed, after: await page.locator('#recoverStatus').innerText() };
}
const namePlace = await placeFact('name: Ada Lane', 0.40, 0.225);
check('name placement is the user click, not an automatic fill', /Placed Ada Lane/.test(namePlace.after), namePlace.armed + ' || ' + namePlace.after);
const addressPlace = await placeFact('address: 14 Harbour Lane', 0.42, 0.262);
check('address placement is the user click', /Placed Ada Lane/.test(addressPlace.after) && /address/.test(addressPlace.after), addressPlace.after);

const notes = await page.locator('.ann-note').allInnerTexts();
check('both marks name the person, the key, and that the user placed them', notes.length === 2 && notes.every((text) => /Ada Lane/.test(text) && /placed by you/.test(text)), notes.join(' || '));

if (await page.locator('#selectionBar').isHidden()) {
  await page.locator('.ann').first().click();
  interactions += 1;
}
check('nudge controls are visible for the selected mark', await page.locator('#nudgeDown').isVisible());
await click('#nudgeDown');
check('a nudge is available without leaving the page', await page.locator('.ann').count() === 2);

const body = page.locator('.ann-body').first();
await body.click();
interactions += 1;
await body.fill('Ada L. Lane');
interactions += 1;
await page.waitForTimeout(400);
check('the mark can be corrected in place', /Ada L\. Lane/.test(await body.innerText()));

await click('#downloadBtn');
await page.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])', { timeout: 30000 });
const downloadPromise = page.waitForEvent('download');
await page.locator('#sizeOptions button[data-level="100"]').click();
interactions += 1;
const download = await downloadPromise;
const exportPath = '/tmp/assisted-ada.pdf';
await download.saveAs(exportPath);
await page.locator('#dlClose').click();
interactions += 1;

await click('#mapToggle');
await page.locator('#mapName').fill('Food lines');
interactions += 1;
await click('#mapSave');
await page.waitForTimeout(400);
const mapStatus = await page.locator('#recoverStatus').innerText();
const mapOptions = await page.locator('#mapPick option').allInnerTexts();
check('blank map saves for this open file', /Saved /.test(mapStatus) && mapOptions.some((text) => /Food lines/.test(text)), mapStatus + ' || ' + mapOptions.join(' | '));

await page.goBack();
interactions += 1;
await page.waitForSelector('#profileToggle');
await click('#profileToggle');
prompts.push('Bea Shore');
await click('#profileAdd');
await page.waitForFunction(() => /Bea Shore/.test(document.getElementById('profilePick').innerText));
await page.locator('#profilePick').selectOption({ label: 'Bea Shore' });
interactions += 1;
await addFact('name', 'Bea Shore');
await addFact('address', '8 Pier Street');
const beaValue = await page.locator('#profileFacts input[aria-label="name"]').inputValue();
const beaAddress = await page.locator('#profileFacts input[aria-label="address"]').inputValue();
check('second person keeps only that person\'s confirmed values', beaValue === 'Bea Shore' && beaAddress === '8 Pier Street', beaValue + ' / ' + beaAddress);

const backStatus = await page.evaluate(() => {
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const status = document.getElementById('readStatus');
      const button = document.getElementById('placeMissing');
      const text = status ? status.textContent : '';
      if ((button && !button.disabled) || Date.now() - started > 20000) {
        clearInterval(timer);
        resolve({ text, enabled: !!(button && !button.disabled), hidden: !!(status && status.hidden) });
      }
    }, 200);
  });
});
check('back to the form keeps Place a missing line available', backStatus.enabled, JSON.stringify(backStatus));
let beaPath = '';
if (backStatus.enabled) {
await click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForSelector('#assistToggle', { state: 'visible' });
await page.waitForFunction(() => /Bea Shore/.test((document.getElementById('recoverPerson') || {}).innerText || ''));
if (await page.locator('#recoverBar').isHidden()) await click('#assistToggle');
await page.locator('#recoverPerson').selectOption({ label: 'Bea Shore' });
interactions += 1;
await page.waitForFunction(() => /Bea Shore/.test(document.getElementById('recoverFact').innerText || ''));
if (await page.locator('#mapBox').isHidden()) await click('#mapToggle');
const sameFileMaps = await page.locator('#mapPick option').allInnerTexts();
check('map is still offered on the same opened sheet', sameFileMaps.some((text) => /Food lines/.test(text)), sameFileMaps.join(' | '));
await click('#mapPreview');
const preview = await page.locator('#mapPreviewText').innerText();
check('preview names Bea and writes nothing yet', /Preview only/.test(preview) && /Bea Shore|2 place/.test(preview) && !/Ada/.test(preview), preview);
await click('#mapApply');
const applied = await page.locator('#recoverStatus').innerText();
const appliedNotes = await page.locator('.ann-note').allInnerTexts();
const appliedText = await page.locator('.ann-body').allInnerTexts();
check('apply writes Bea and does not keep Ada', /Bea Shore/.test(applied) && appliedText.some((text) => /Bea Shore/.test(text)) && !appliedText.some((text) => /Ada/.test(text)) && !appliedNotes.some((text) => /Ada/.test(text)), applied + ' || ' + appliedText.join(' | ') + ' || ' + appliedNotes.join(' | '));
await click('#mapApply');
const reapplied = await page.locator('.ann-body').allInnerTexts();
check('apply again replaces the map places', reapplied.filter((text) => /Bea Shore/.test(text)).length === 1 && reapplied.filter((text) => /Pier Street/.test(text)).length === 1, reapplied.join(' | '));
await click('#recoverUndo');
const undone = await page.locator('.ann').count();
check('undo removes the applied places', undone === 0 && /Undid/.test(await page.locator('#recoverStatus').innerText()), String(undone));
await click('#mapApply');
await page.reload();
interactions += 1;
await page.waitForSelector('#pages .ann-body', { timeout: 30000 });
const reloaded = await page.locator('.ann-body').allInnerTexts();
check('reload keeps Bea and does not restore Ada', reloaded.some((text) => /Bea Shore/.test(text)) && !reloaded.some((text) => /Ada/.test(text)), reloaded.join(' | '));

await click('#downloadBtn');
await page.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
const secondDownloadPromise = page.waitForEvent('download');
await page.locator('#sizeOptions button[data-level="100"]').click();
interactions += 1;
const secondDownload = await secondDownloadPromise;
beaPath = '/tmp/assisted-bea.pdf';
await secondDownload.saveAs(beaPath);
await page.locator('#dlClose').click();
interactions += 1;

await page.goBack();
interactions += 1;
}
if (!page.url().includes('/tools/forms-filler/')) {
  await page.goto('http://127.0.0.1:8765/tools/forms-filler/?return=' + Date.now(), { waitUntil: 'domcontentloaded' });
  interactions += 1;
}
await page.waitForSelector('#formDrop');
await chooseFile('#formDrop', FOOD);
await page.waitForFunction(() => /No lines were found|scan estimates|could not|took too long/.test((document.getElementById('readStatus') || {}).textContent || ''), null, { timeout: 90000 });
await click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForSelector('#mapToggle', { state: 'visible' });
if (await page.locator('#mapBox').isHidden()) await click('#mapToggle');
await page.waitForTimeout(500);
const reopenedMaps = await page.locator('#mapPick option').allInnerTexts();
check('choosing the same photo again still finds the blank map', reopenedMaps.some((text) => /Food lines/.test(text)), reopenedMaps.join(' | '));
if (reopenedMaps.some((text) => /Food lines/.test(text))) {
  if (await page.locator('#recoverBar').isHidden()) await click('#assistToggle');
  await page.locator('#recoverPerson').selectOption({ label: 'Bea Shore' });
  interactions += 1;
  await page.waitForFunction(() => /Bea Shore/.test(document.getElementById('recoverFact').innerText || ''));
  await click('#mapPreview');
  await page.waitForFunction(() => /Preview only/.test(document.getElementById('mapPreviewText').textContent || ''));
  const preview = await page.locator('#mapPreviewText').innerText();
  check('preview for the reopened photo names places and not Ada', /Preview only/.test(preview) && !/Ada/.test(preview), preview);
  await click('#mapApply');
  await page.waitForFunction(() => document.querySelectorAll('#pages .ann-body').length >= 2);
  const appliedText = await page.locator('.ann-body').allInnerTexts();
  check('apply on the reopened photo writes Bea only', appliedText.some((text) => /Bea Shore/.test(text)) && appliedText.some((text) => /Pier Street/.test(text)) && !appliedText.some((text) => /Ada/.test(text)), appliedText.join(' | '));
  await click('#recoverUndo');
  await page.waitForFunction(() => document.querySelectorAll('#pages .ann').length === 0);
  check('undo removes that apply', (await page.locator('.ann').count()) === 0);
  await click('#mapApply');
  await page.waitForFunction(() => document.querySelectorAll('#pages .ann-body').length >= 2);
  await click('#mapApply');
  const reapplied = await page.locator('.ann-body').allInnerTexts();
  check('apply again keeps one name and one address', reapplied.filter((text) => /Bea Shore/.test(text)).length === 1 && reapplied.filter((text) => /Pier Street/.test(text)).length === 1, reapplied.join(' | '));
  await page.reload();
  interactions += 1;
  await page.waitForSelector('#pages .ann-body');
  const reloaded = await page.locator('.ann-body').allInnerTexts();
  check('reload keeps Bea and does not restore Ada', reloaded.some((text) => /Bea Shore/.test(text)) && !reloaded.some((text) => /Ada/.test(text)), reloaded.join(' | '));
  await click('#downloadBtn');
  await page.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
  const reopenDownloadPromise = page.waitForEvent('download');
  await page.locator('#sizeOptions button[data-level="100"]').click();
  interactions += 1;
  const reopenDownload = await reopenDownloadPromise;
  beaPath = '/tmp/assisted-bea.pdf';
  await reopenDownload.saveAs(beaPath);
  await page.locator('#dlClose').click();
  interactions += 1;
}

const words = await page.evaluate(async (paths) => {
  async function read(url) {
    const bytes = await (await fetch(url)).arrayBuffer();
    return bytes;
  }
  return { ada: paths.ada, bea: paths.bea };
}, { ada: exportPath, bea: beaPath });
void words;

async function pdfWords(file) {
  const bytes = Array.from(readFileSync(file));
  const probe = await browser.newPage();
  await probe.goto('http://127.0.0.1:8765/tools/forms-filler/?probe=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await probe.waitForFunction(() => window.pdfjsLib);
  const found = await probe.evaluate(async (list) => {
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(list) }).promise;
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const view = page.getViewport({ scale: 1 });
    return {
      width: view.width,
      height: view.height,
      items: content.items.filter((item) => item.str && item.str.trim()).map((item) => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        w: item.width,
        h: item.height
      }))
    };
  }, bytes);
  await probe.close();
  return found;
}

const adaPdf = await pdfWords(exportPath);
const beaPdf = beaPath ? await pdfWords(beaPath) : { items: [] };
check('Ada export contains the corrected name', adaPdf.items.some((item) => /Ada L\. Lane/.test(item.str)), adaPdf.items.map((item) => item.str).join(' | '));
if (beaPath) check('Bea export contains Bea and not Ada', beaPdf.items.some((item) => /Bea Shore/.test(item.str)) && !beaPdf.items.some((item) => /Ada/.test(item.str)), beaPdf.items.map((item) => item.str).join(' | '));

const sheetW = 913;
const sheetH = 1516;
const crop = { x: 16, y: 40 };
const scaleX = 3442 / 983;
const scaleY = 5601 / 1600;
const gold = {
  name: [820, 1295, 3040, 1362],
  address: [870, 1510, 3040, 1578]
};
function glyphBox(item, pdf) {
  const sx = item.x / pdf.width * sheetW;
  const syTop = (pdf.height - (item.y + item.h)) / pdf.height * sheetH;
  const syBot = (pdf.height - item.y) / pdf.height * sheetH;
  return [
    Math.round((sx + crop.x) * scaleX),
    Math.round((syTop + crop.y) * scaleY),
    Math.round((sx + item.w / pdf.width * sheetW + crop.x) * scaleX),
    Math.round((syBot + crop.y) * scaleY)
  ];
}
function contains(ink, target) {
  const pad = 8;
  return ink[0] >= target[0] - pad && ink[1] >= target[1] - pad && ink[2] <= target[2] + pad && ink[3] <= target[3] + pad;
}
const adaName = adaPdf.items.filter((item) => /Ada/.test(item.str)).map((item) => glyphBox(item, adaPdf));
const adaAddress = adaPdf.items.filter((item) => /Harbour/.test(item.str)).map((item) => glyphBox(item, adaPdf));
const geometry = {
  name: adaName,
  address: adaAddress,
  nameInsidePad8: adaName.some((box) => contains(box, gold.name)),
  addressInsidePad8: adaAddress.some((box) => contains(box, gold.address)),
  gold,
  note: 'A new click plus one nudge. Not the earlier manual example, and not a detector result.'
};
console.log('GEOMETRY', JSON.stringify(geometry));

await page.goto('http://127.0.0.1:8765/tools/forms-filler/?pdf=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#formDrop');
await chooseFile('#formDrop', PDF);
await page.waitForFunction(() => {
  const text = (document.getElementById('readStatus') || {}).textContent || '';
  const button = document.getElementById('placeMissing');
  return button && !button.disabled && text && !/^(Reading|Finding|Opening|Straighten)/.test(text);
}, null, { timeout: 60000 });
const pdfStatus = await page.locator('#readStatus').innerText();
await click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForSelector('#downloadBtn', { state: 'visible' });
await click('#downloadBtn');
await page.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
const nativePromise = page.waitForEvent('download');
await page.locator('#sizeOptions button[data-level="100"]').click();
interactions += 1;
const nativeDownload = await nativePromise;
const nativePath = '/tmp/assisted-native.pdf';
await nativeDownload.saveAs(nativePath);
const before = await pdfWords(PDF);
const after = await pdfWords(nativePath);
const beforeText = before.items.map((item) => item.str).join('\n');
const afterText = after.items.map((item) => item.str).join('\n');
check('native PDF text is still in the export', before.items.length > 0 && before.items.every((item) => afterText.includes(item.str)), 'before ' + before.items.length + ' after ' + after.items.length);
check('native PDF read finished with a visible status', pdfStatus.length > 0, pdfStatus);

const out = {
  interactions,
  checks,
  passed: checks.filter((item) => item.ok).length,
  failed: checks.filter((item) => !item.ok).length,
  adaGlyphs: geometry,
  pdf: { width: adaPdf.width, height: adaPdf.height }
};
writeFileSync('/workspace/research/forms-filler/visual-e2e/results/assisted-journey.json', JSON.stringify(out, null, 2));
console.log('SUMMARY', out.passed, '/', checks.length, 'interactions', interactions);
await browser.close();
