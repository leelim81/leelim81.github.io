/** Frozen before this run: a click is the writing baseline.
 *  The stored box top stays 0.85×fontSize above that click.
 *  textOrigin is unchanged, so a saved box does not move.
 *  Clicks in this file are on drawn rules, not on gold boxes. */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { chromium } = pkg;
const FOOD = '/tmp/ff-natural-work/bounded/wellcome-food-order-bounded.jpg';
const shots = '/workspace/research/forms-filler/visual-e2e/results/screenshots';
mkdirSync(shots, { recursive: true });

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 500) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 280) : ''));
}

const doc = await PDFDocument.create();
const sheet = doc.addPage([612, 792]);
const font = await doc.embedFont(StandardFonts.Helvetica);
const rules = [
  { name: 'name', pdfY: 500.6 },
  { name: 'descender', pdfY: 420.6 },
  { name: 'long', pdfY: 340.6 }
];
rules.forEach((rule) => {
  sheet.drawRectangle({ x: 72, y: rule.pdfY - 0.6, width: 460, height: 1.2, color: rgb(0.15, 0.4, 0.28) });
});
sheet.drawText('Name', { x: 40, y: 506, size: 12, font, color: rgb(0.2, 0.35, 0.25) });
writeFileSync('/tmp/rule-page.pdf', await doc.save());

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-http-cache'],
  headless: true
});

async function boot(viewport, scale) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale || 1, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const prompts = [];
  page.on('dialog', async (dialog) => {
    const next = prompts.shift();
    if (dialog.type() === 'prompt' && next != null) await dialog.accept(String(next));
    else if (dialog.type() === 'confirm') await dialog.accept();
    else await dialog.dismiss();
  });
  return { context, page, prompts };
}

async function glyphs(context, file) {
  const bytes = Array.from(readFileSync(file));
  const probe = await context.newPage();
  await probe.goto('http://127.0.0.1:8765/tools/forms-filler/?probe=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await probe.waitForFunction(() => window.pdfjsLib);
  const found = await probe.evaluate(async (list) => {
    const opened = await pdfjsLib.getDocument({ data: new Uint8Array(list) }).promise;
    const page = await opened.getPage(1);
    const content = await page.getTextContent();
    const view = page.getViewport({ scale: 1 });
    return {
      width: view.width,
      height: view.height,
      items: content.items.filter((item) => item.str && item.str.trim()).map((item) => ({
        str: item.str, x: item.transform[4], y: item.transform[5], w: item.width, h: item.height
      }))
    };
  }, bytes);
  await probe.close();
  return found;
}

async function openForm(session, file) {
  await session.page.goto('http://127.0.0.1:8765/tools/forms-filler/?place=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await session.page.waitForSelector('#profileToggle');
  const chooser = session.page.waitForEvent('filechooser');
  await session.page.click('#formDrop');
  await (await chooser).setFiles(file);
  await session.page.waitForFunction(() => {
    const text = (document.getElementById('readStatus') || {}).textContent || '';
    const button = document.getElementById('placeMissing');
    return button && !button.disabled && text && !/^(Reading|Finding|Opening|Clearing)/.test(text);
  }, null, { timeout: 90000 });
}

async function arm(page, label) {
  await page.waitForURL(/pdf-editor/);
  await page.waitForFunction(() => (document.getElementById('recoverPerson') || {}).innerText);
  if (await page.locator('#recoverBar').isHidden()) await page.click('#assistToggle');
  if (label) await page.locator('#recoverFact').selectOption({ label });
  await page.click('#recoverPlace');
  await page.waitForFunction(() => /Click the page/i.test((document.getElementById('recoverStatus') || {}).textContent || ''));
}

const main = await boot({ width: 1100, height: 900 }, 1);
main.prompts.push('Ada Lane');
await main.page.goto('http://127.0.0.1:8765/tools/forms-filler/?people=' + Date.now(), { waitUntil: 'domcontentloaded' });
await main.page.click('#profileToggle');
await main.page.click('#profileAdd');
await main.page.locator('#factKey').selectOption('name');
await main.page.locator('#factValue').fill('Peggy Jay');
await main.page.click('#factAdd');
await main.page.waitForFunction(() => {
  const input = document.querySelector('#profileFacts input[aria-label="name"]');
  return input && input.value === 'Peggy Jay';
});
await main.page.locator('#factKey').selectOption('address');
await main.page.locator('#factValue').fill('14 Harbour Lane beside the long west warehouse');
await main.page.click('#factAdd');
await main.page.waitForFunction(() => {
  const input = document.querySelector('#profileFacts input[aria-label="address"]');
  return input && /warehouse/.test(input.value);
});
await openForm(main, '/tmp/rule-page.pdf');
await main.page.click('#placeMissing');
await arm(main.page, 'name: Peggy Jay');
const layer = main.page.locator('#pages .layer').first();
async function clickRule(pdfY) {
  const before = await main.page.locator('#recoverStatus').innerText();
  const live = await layer.boundingBox();
  const frac = (792 - pdfY) / 792;
  await layer.click({ position: { x: live.width * 0.45, y: live.height * frac } });
  await main.page.waitForFunction((prev) => {
    const text = (document.getElementById('recoverStatus') || {}).textContent || '';
    return text !== prev && /Placed /.test(text);
  }, before);
}
await clickRule(500.6);
const nameStatus = await main.page.locator('#recoverStatus').innerText();
check('clicking a rule says the baseline sits on the click', /baseline sits on the click/.test(nameStatus), nameStatus);
const topBeforeZoom = await main.page.locator('.ann').first().evaluate((el) => el.style.top);
await main.page.click('#zoomIn');
const topAfterZoom = await main.page.locator('.ann').first().evaluate((el) => el.style.top);
check('zoom does not move the stored place', topBeforeZoom === topAfterZoom, topBeforeZoom + ' -> ' + topAfterZoom);
await main.page.click('#recoverPlace');
await main.page.locator('#recoverFact').selectOption({ label: 'address: 14 Harbour Lane beside the long west warehouse' });
await main.page.click('#recoverPlace');
await clickRule(340.6);
const longText = await main.page.locator('.ann-body').nth(1).innerText();
const longSize = await main.page.locator('.ann').nth(1).evaluate((el) => el.dataset.fontSize);
check('a long address is kept in full at the same size', longText === '14 Harbour Lane beside the long west warehouse' && longSize === '14', longText + ' / ' + longSize);

await main.page.click('#downloadBtn');
await main.page.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
let download = main.page.waitForEvent('download');
await main.page.locator('#sizeOptions button[data-level="100"]').click();
await (await download).saveAs('/tmp/rule-placed.pdf');
await main.page.click('#dlClose');
const placed = await glyphs(main.context, '/tmp/rule-placed.pdf');
const peggy = placed.items.find((item) => /Peggy/.test(item.str));
const address = placed.items.filter((item) => /Harbour|warehouse|beside|west|Lane/.test(item.str));
check('the name baseline is on the rule', peggy && Math.abs(peggy.y - 500.6) < 1.5, JSON.stringify(peggy));
check('descenders do not shrink the type', peggy && peggy.h === 14, JSON.stringify(peggy));
check('the long address baseline is on its rule', address.length > 0 && address.every((item) => Math.abs(item.y - 340.6) < 1.5 || Math.abs(item.y - (340.6 - 14 * 1.3)) < 2), JSON.stringify(address));

const edgeBox = await layer.boundingBox();
const edge = 2 / edgeBox.height;
await main.page.click('#recoverPlace');
await main.page.locator('#recoverFact').selectOption({ label: 'name: Peggy Jay' });
await main.page.click('#recoverPlace');
await layer.click({ position: { x: edgeBox.width * 0.4, y: Math.max(2, edge) } });
await main.page.waitForFunction(() => /could not sit|baseline sits/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
const edgeStatus = await main.page.locator('#recoverStatus').innerText();
check('a click at the top edge says the baseline could not sit there', /could not sit/.test(edgeStatus), edgeStatus);

if (await main.page.locator('#mapBox').isHidden()) await main.page.click('#mapToggle');
await main.page.locator('#mapName').fill('Rule map');
await main.page.click('#mapSave');
await main.page.waitForFunction(() => /Saved /.test((document.getElementById('recoverStatus') || {}).textContent || ''));
const storedY = await main.page.evaluate(async () => {
  const vault = await DeskDB.get('tools-forms-maps', 'vault');
  const map = vault.maps[vault.maps.length - 1];
  return map.pages[0].slots.map((slot) => slot.y);
});
await main.page.goBack();
await main.page.waitForSelector('#profileToggle');
main.prompts.push('Bea Shore');
await main.page.click('#profileToggle');
await main.page.click('#profileAdd');
await main.page.locator('#profilePick').selectOption({ label: 'Bea Shore' });
await main.page.locator('#factKey').selectOption('name');
await main.page.locator('#factValue').fill('Bea Shore');
await main.page.click('#factAdd');
await main.page.waitForFunction(() => {
  const input = document.querySelector('#profileFacts input[aria-label="name"]');
  return input && input.value === 'Bea Shore';
});
await main.page.locator('#factKey').selectOption('address');
await main.page.locator('#factValue').fill('8 Pier Street');
await main.page.click('#factAdd');
await main.page.waitForFunction(() => {
  const input = document.querySelector('#profileFacts input[aria-label="address"]');
  return input && input.value === '8 Pier Street';
});
await main.page.click('#clearBtn');
await main.page.waitForFunction(() => /Started over/.test((document.getElementById('readStatus') || {}).textContent || ''));
await openForm(main, '/tmp/rule-page.pdf');
await main.page.click('#placeMissing');
await main.page.waitForURL(/pdf-editor/);
await main.page.waitForFunction(() => /Bea Shore/.test((document.getElementById('recoverPerson') || {}).innerText || ''));
if (!(await main.page.locator('#recoverPerson').isVisible())) await main.page.click('#assistToggle');
if (!(await main.page.locator('#recoverPerson').isVisible())) await main.page.click('#assistToggle');
await main.page.locator('#recoverPerson').waitFor({ state: 'visible' });
await main.page.locator('#recoverPerson').selectOption({ label: 'Bea Shore' });
await main.page.locator('#recoverRole').selectOption('spouse');
if (await main.page.locator('#mapBox').isHidden()) await main.page.click('#mapToggle');
await main.page.click('#mapApply');
await main.page.waitForFunction(() => document.querySelector('.ann-body'));
const appliedTops = await main.page.locator('.ann').evaluateAll((nodes) => nodes.map((node) => node.style.top));
const appliedText = await main.page.locator('.ann-body').allInnerTexts();
check('a saved map uses its stored tops for the second person', appliedText.some((text) => /Bea Shore/.test(text)) && !appliedText.some((text) => /Peggy|Ada/.test(text)), appliedText.join(' | '));
check('applied tops match the saved slots', storedY.every((y) => appliedTops.some((top) => Math.abs(parseFloat(top) - y * 100) < 0.2)), JSON.stringify({ storedY, appliedTops }));

const narrow = await boot({ width: 390, height: 800 }, 1);
narrow.prompts.push('Ada Lane');
await narrow.page.goto('http://127.0.0.1:8765/tools/forms-filler/?narrow=' + Date.now(), { waitUntil: 'domcontentloaded' });
await narrow.page.click('#profileToggle');
await narrow.page.click('#profileAdd');
await narrow.page.locator('#factValue').fill('Ada Lane');
await narrow.page.click('#factAdd');
await narrow.page.waitForFunction(() => {
  const input = document.querySelector('#profileFacts input[aria-label="name"]');
  return input && input.value === 'Ada Lane';
});
await openForm(narrow, '/tmp/rule-page.pdf');
await narrow.page.click('#placeMissing');
await arm(narrow.page, 'name: Ada Lane');
const narrowLayer = narrow.page.locator('#pages .layer').first();
const narrowBox = await narrowLayer.boundingBox();
await narrowLayer.click({ position: { x: narrowBox.width * 0.5, y: narrowBox.height * ((792 - 500.6) / 792) } });
await narrow.page.waitForFunction(() => /baseline sits/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
const narrowSize = await narrow.page.locator('.ann').first().evaluate((el) => el.dataset.fontSize);
check('a narrow viewport keeps the type size', narrowSize === '14' && narrowBox.width < 420, narrowSize + ' / ' + narrowBox.width);
await narrow.context.close();

const sharp = await boot({ width: 1000, height: 900 }, 2);
sharp.prompts.push('Ada Lane');
await sharp.page.goto('http://127.0.0.1:8765/tools/forms-filler/?dpr=' + Date.now(), { waitUntil: 'domcontentloaded' });
await sharp.page.click('#profileToggle');
await sharp.page.click('#profileAdd');
await sharp.page.locator('#factValue').fill('Ada Lane');
await sharp.page.click('#factAdd');
await sharp.page.waitForFunction(() => {
  const input = document.querySelector('#profileFacts input[aria-label="name"]');
  return input && input.value === 'Ada Lane';
});
await openForm(sharp, '/tmp/rule-page.pdf');
await sharp.page.click('#placeMissing');
await arm(sharp.page, 'name: Ada Lane');
const sharpLayer = sharp.page.locator('#pages .layer').first();
const sharpBox = await sharpLayer.boundingBox();
await sharpLayer.click({ position: { x: sharpBox.width * 0.45, y: sharpBox.height * ((792 - 500.6) / 792) } });
await sharp.page.waitForFunction(() => /baseline sits/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
await sharp.page.click('#downloadBtn');
await sharp.page.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
download = sharp.page.waitForEvent('download');
await sharp.page.locator('#sizeOptions button[data-level="100"]').click();
await (await download).saveAs('/tmp/rule-dpr.pdf');
const dprGlyph = (await glyphs(sharp.context, '/tmp/rule-dpr.pdf')).items.find((item) => /Ada/.test(item.str));
check('a 2x pixel ratio still puts the baseline on the rule', dprGlyph && Math.abs(dprGlyph.y - 500.6) < 1.5, JSON.stringify(dprGlyph));
await sharp.context.close();

const food = await boot({ width: 1100, height: 900 }, 1);
food.prompts.push('Ada Lane');
await food.page.goto('http://127.0.0.1:8765/tools/forms-filler/?food=' + Date.now(), { waitUntil: 'domcontentloaded' });
await food.page.click('#profileToggle');
await food.page.click('#profileAdd');
await food.page.locator('#factValue').fill('Ada Lane');
await food.page.click('#factAdd');
await food.page.waitForFunction(() => {
  const input = document.querySelector('#profileFacts input[aria-label="name"]');
  return input && input.value === 'Ada Lane';
});
await food.page.locator('#factKey').selectOption('address');
await food.page.locator('#factValue').fill('14 Harbour Lane');
await food.page.click('#factAdd');
await food.page.waitForFunction(() => {
  const input = document.querySelector('#profileFacts input[aria-label="address"]');
  return input && input.value === '14 Harbour Lane';
});
await openForm(food, FOOD);
const foodStatus = await food.page.locator('#readStatus').innerText();
check('the food photo still reports no detected lines', /No lines were found/.test(foodStatus), foodStatus);
await food.page.click('#placeMissing');
await food.page.waitForURL(/pdf-editor/);
await food.page.locator('#pages canvas').first().waitFor();
await food.page.waitForFunction(() => {
  const canvas = document.querySelector('#pages canvas');
  if (!canvas || canvas.width < 50) return false;
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, Math.min(80, canvas.height)).data;
  let dark = 0;
  for (let i = 0; i < data.length; i += 16) if (data[i] + data[i + 1] + data[i + 2] < 720) dark++;
  return dark > 30;
}, null, { timeout: 20000 }).catch(() => {});
const rulesOnPhoto = await food.page.evaluate(() => {
  const canvas = document.querySelector('#pages canvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;
  const rows = [];
  for (let y = 2; y < h - 2; y++) {
    let run = 0;
    let best = 0;
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const up = ((y - 2) * w + x) * 4;
      const down = ((y + 2) * w + x) * 4;
      const c = data[i] + data[i + 1] + data[i + 2];
      const a = data[up] + data[up + 1] + data[up + 2];
      const b = data[down] + data[down + 1] + data[down + 2];
      if (c + 36 < a && c + 36 < b && c < 640) run += 2;
      else { best = Math.max(best, run); run = 0; }
    }
    best = Math.max(best, run);
    if (best > w * 0.28) rows.push(y / h);
  }
  const bands = [];
  rows.forEach((frac) => {
    const last = bands[bands.length - 1];
    if (last && frac - last.end < 0.006) last.end = frac;
    else bands.push({ start: frac, end: frac });
  });
  return bands.map((band) => (band.start + band.end) / 2).filter((frac) => frac > 0.12 && frac < 0.45).slice(0, 2);
});
check('two header rules are visible to click', rulesOnPhoto.length >= 2, JSON.stringify(rulesOnPhoto));
let nameInk = null;
let addressInk = null;
let sheetFrame = null;
if (rulesOnPhoto.length >= 2) {
await arm(food.page, 'name: Ada Lane');
const foodLayer = food.page.locator('#pages .layer').first();
const foodBox = await foodLayer.boundingBox();
await foodLayer.click({ position: { x: foodBox.width * 0.45, y: foodBox.height * rulesOnPhoto[0] } });
await food.page.waitForFunction(() => /baseline sits/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
await food.page.click('#recoverPlace');
await food.page.locator('#recoverFact').selectOption({ label: 'address: 14 Harbour Lane' });
await food.page.click('#recoverPlace');
await foodLayer.click({ position: { x: foodBox.width * 0.45, y: foodBox.height * rulesOnPhoto[1] } });
await food.page.waitForFunction(() => /baseline sits/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
await food.page.locator('.ann').first().scrollIntoViewIfNeeded();
await food.page.screenshot({ path: shots + '/place-on-rule-editor.png' });
await food.page.click('#downloadBtn');
await food.page.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
download = food.page.waitForEvent('download');
await food.page.locator('#sizeOptions button[data-level="100"]').click();
await (await download).saveAs('/tmp/food-placed.pdf');
const foodPdf = await glyphs(food.context, '/tmp/food-placed.pdf');
sheetFrame = await food.page.evaluate(async () => {
  const session = await DeskDB.get('tools-forms-editor', 'session');
  return session && session.sheet;
});
function originalBox(item) {
  const sx = item.x / foodPdf.width * sheetFrame.outW;
  const top = (foodPdf.height - (item.y + item.h)) / foodPdf.height * sheetFrame.outH;
  const bot = (foodPdf.height - item.y) / foodPdf.height * sheetFrame.outH;
  const scaleX = sheetFrame.sourceW / sheetFrame.inW;
  const scaleY = sheetFrame.sourceH / sheetFrame.inH;
  const right = sx + item.w / foodPdf.width * sheetFrame.outW;
  return [
    Math.round((sx + sheetFrame.cropX) * scaleX),
    Math.round((top + sheetFrame.cropY) * scaleY),
    Math.round((right + sheetFrame.cropX) * scaleX),
    Math.round((bot + sheetFrame.cropY) * scaleY)
  ];
}
const gold = { name: [820, 1295, 3040, 1362], address: [870, 1510, 3040, 1578] };
function contains(ink, target) {
  return ink && ink[0] >= target[0] - 8 && ink[1] >= target[1] - 8 && ink[2] <= target[2] + 8 && ink[3] <= target[3] + 8;
}
nameInk = originalBox(foodPdf.items.find((item) => /Ada/.test(item.str)) || { x: 0, y: 0, w: 0, h: 0 });
const addressItem = foodPdf.items.find((item) => /Harbour/.test(item.str));
addressInk = addressItem ? originalBox(addressItem) : null;
check('new name glyph is inside the frozen name target', contains(nameInk, gold.name), JSON.stringify(nameInk));
check('new address glyph is inside the frozen address target', contains(addressInk, gold.address), JSON.stringify(addressInk));
} else {
  check('new name glyph is inside the frozen name target', false, 'untested: header rules were not found on the rendered sheet');
  check('new address glyph is inside the frozen address target', false, 'untested: header rules were not found on the rendered sheet');
}

if (rulesOnPhoto.length >= 2) {
const render = await food.context.newPage();
await render.setViewportSize({ width: 1000, height: 1400 });
await render.setContent('<canvas id="c"></canvas>');
await render.addScriptTag({ url: 'http://127.0.0.1:8765/tools/forms-filler/vendor/pdf/pdf.min.js' });
const png = await render.evaluate(async (list) => {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'http://127.0.0.1:8765/tools/forms-filler/vendor/pdf/pdf.worker.min.js';
  const opened = await pdfjsLib.getDocument({ data: new Uint8Array(list) }).promise;
  const page = await opened.getPage(1);
  const view = page.getViewport({ scale: 1.2 });
  const canvas = document.getElementById('c');
  canvas.width = view.width;
  canvas.height = Math.min(view.height, 900);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport: view }).promise;
  return canvas.toDataURL('image/png');
}, Array.from(readFileSync('/tmp/food-placed.pdf')));
writeFileSync(shots + '/place-on-rule-export.png', Buffer.from(png.split(',')[1], 'base64'));
await render.close();
}

const out = {
  passed: checks.filter((item) => item.ok).length,
  failed: checks.filter((item) => !item.ok).length,
  historicalMisses: { manual1px: true, click29px: true, click114px: true },
  food: { name: nameInk, address: addressInk, rules: rulesOnPhoto, sheet: sheetFrame },
  checks
};
writeFileSync('/workspace/research/forms-filler/visual-e2e/results/place-on-rule.json', JSON.stringify(out, null, 2));
console.log('SUMMARY', out.passed, '/', checks.length);
await browser.close();
