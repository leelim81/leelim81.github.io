/** One food-order placement. Clicks come from rules visible on the rendered sheet. */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const FOOD = '/tmp/ff-natural-work/bounded/wellcome-food-order-bounded.jpg';
const shots = '/workspace/research/forms-filler/visual-e2e/results/screenshots';
mkdirSync(shots, { recursive: true });
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 500) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 280) : ''));
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-http-cache'],
  headless: true
});
const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.on('dialog', async (dialog) => {
  if (dialog.type() === 'prompt') await dialog.accept('Ada Lane');
  else await dialog.accept();
});
await page.goto('http://127.0.0.1:8765/tools/forms-filler/?foodrule=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.click('#profileToggle');
await page.click('#profileAdd');
await page.locator('#factValue').fill('Ada Lane');
await page.click('#factAdd');
await page.waitForFunction(() => {
  const input = document.querySelector('#profileFacts input[aria-label="name"]');
  return input && input.value === 'Ada Lane';
});
await page.locator('#factKey').selectOption('address');
await page.locator('#factValue').fill('14 Harbour Lane');
await page.click('#factAdd');
await page.waitForFunction(() => {
  const input = document.querySelector('#profileFacts input[aria-label="address"]');
  return input && input.value === '14 Harbour Lane';
});
const chooser = page.waitForEvent('filechooser');
await page.click('#formDrop');
await (await chooser).setFiles(FOOD);
await page.waitForFunction(() => /No lines were found/.test((document.getElementById('readStatus') || {}).textContent || ''), null, { timeout: 90000 });
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForFunction(() => {
  const canvas = document.querySelector('#pages canvas');
  if (!canvas || canvas.width < 50) return false;
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, Math.min(120, canvas.height)).data;
  let dark = 0;
  for (let i = 0; i < data.length; i += 16) if (data[i] + data[i + 1] + data[i + 2] < 740) dark++;
  return dark > 40;
}, null, { timeout: 20000 });
const bands = await page.evaluate(() => {
  const canvas = document.querySelector('#pages canvas');
  const w = canvas.width;
  const h = canvas.height;
  const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
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
      if (c + 18 < a && c + 18 < b && c < 680) run += 2;
      else { best = Math.max(best, run); run = 0; }
    }
    if (Math.max(best, run) > w * 0.22) rows.push(y / h);
  }
  const grouped = [];
  rows.forEach((frac) => {
    const last = grouped[grouped.length - 1];
    if (last && frac - last.end < 0.008) last.end = frac;
    else grouped.push({ start: frac, end: frac });
  });
  return grouped.map((band) => Math.round(((band.start + band.end) / 2) * 10000) / 10000);
});
const header = bands.filter((frac) => frac > 0.08 && frac < 0.4);
check('rendered sheet shows header rules', header.length >= 2, JSON.stringify(bands.slice(0, 12)));
let nameInk = null;
let addressInk = null;
let sheetFrame = null;
if (header.length >= 2) {
  if (await page.locator('#recoverBar').isHidden()) await page.click('#assistToggle');
  await page.locator('#recoverFact').selectOption({ label: 'name: Ada Lane' });
  await page.click('#recoverPlace');
  const layer = page.locator('#pages .layer').first();
  const box = await layer.boundingBox();
  await layer.click({ position: { x: box.width * 0.48, y: box.height * header[0] } });
  await page.waitForFunction(() => /baseline sits/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
  await page.click('#recoverPlace');
  await page.locator('#recoverFact').selectOption({ label: 'address: 14 Harbour Lane' });
  await page.click('#recoverPlace');
  const box2 = await layer.boundingBox();
  await layer.click({ position: { x: box2.width * 0.48, y: box2.height * header[1] } });
  await page.waitForFunction(() => /address/.test((document.getElementById('recoverStatus') || {}).textContent || '') && /baseline sits/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
  await page.locator('.ann').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: shots + '/place-on-rule-editor.png' });
  await page.click('#downloadBtn');
  await page.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
  const download = page.waitForEvent('download');
  await page.locator('#sizeOptions button[data-level="100"]').click();
  await (await download).saveAs('/tmp/food-placed.pdf');
  const bytes = Array.from(readFileSync('/tmp/food-placed.pdf'));
  const probe = await context.newPage();
  await probe.goto('http://127.0.0.1:8765/tools/forms-filler/?glyph=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await probe.waitForFunction(() => window.pdfjsLib);
  const foodPdf = await probe.evaluate(async (list) => {
    const opened = await pdfjsLib.getDocument({ data: new Uint8Array(list) }).promise;
    const pdfPage = await opened.getPage(1);
    const content = await pdfPage.getTextContent();
    const view = pdfPage.getViewport({ scale: 1.15 });
    const canvas = document.createElement('canvas');
    canvas.width = view.width;
    canvas.height = Math.min(view.height, 980);
    await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport: view }).promise;
    return {
      png: canvas.toDataURL('image/png'),
      width: (await pdfPage.getViewport({ scale: 1 })).width,
      height: (await pdfPage.getViewport({ scale: 1 })).height,
      items: content.items.filter((item) => item.str && item.str.trim()).map((item) => ({
        str: item.str, x: item.transform[4], y: item.transform[5], w: item.width, h: item.height
      }))
    };
  }, bytes);
  writeFileSync(shots + '/place-on-rule-export.png', Buffer.from(foodPdf.png.split(',')[1], 'base64'));
  await probe.close();
  sheetFrame = await page.evaluate(async () => (await DeskDB.get('tools-forms-editor', 'session')).sheet);
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
  const contains = (ink, target) => ink && ink[0] >= target[0] - 8 && ink[1] >= target[1] - 8 && ink[2] <= target[2] + 8 && ink[3] <= target[3] + 8;
  const nameItem = foodPdf.items.find((item) => /Ada/.test(item.str));
  const addressItem = foodPdf.items.find((item) => /Harbour/.test(item.str));
  nameInk = nameItem ? originalBox(nameItem) : null;
  addressInk = addressItem ? originalBox(addressItem) : null;
  check('new name glyph is inside the frozen name target', contains(nameInk, gold.name), JSON.stringify(nameInk));
  check('new address glyph is inside the frozen address target', contains(addressInk, gold.address), JSON.stringify(addressInk));
}
const out = { checks, bands, header, nameInk, addressInk, sheetFrame };
writeFileSync('/workspace/research/forms-filler/visual-e2e/results/food-rule-click.json', JSON.stringify(out, null, 2));
console.log('FOOD', JSON.stringify({ bands: bands.slice(0, 8), header, nameInk, addressInk }));
await browser.close();
