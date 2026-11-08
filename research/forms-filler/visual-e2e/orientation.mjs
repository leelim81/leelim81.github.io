/** Photo sheets keep the EXIF orientation. The line score is not painted in.
 *  Frozen before the run: an upright border stays within 0.4 degrees, a file
 *  whose rules were saved at a measured tilt keeps that tilt within 0.5
 *  degrees, and a uniform page is not rotated or cropped away. */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const root = dirname(fileURLToPath(import.meta.url));
const tmp = '/tmp/ff-orient';
mkdirSync(tmp, { recursive: true });
execSync(`python3 - << 'PY'
from PIL import Image, ImageDraw
from pathlib import Path
out = Path('/tmp/ff-orient')
tall = Image.new('RGB', (400, 3000), (248, 244, 232))
d = ImageDraw.Draw(tall)
d.rectangle((0, 0, 399, 11), fill=(220, 0, 0))
d.rectangle((0, 2988, 399, 2999), fill=(0, 0, 220))
d.rectangle((0, 0, 11, 2999), fill=(0, 160, 0))
d.rectangle((388, 0, 399, 2999), fill=(220, 180, 0))
tall.save(out/'tall-edges.jpg', quality=90)
base = Image.new('RGB', (900, 640), (255, 255, 255))
bd = ImageDraw.Draw(base)
for y in (160, 320, 480):
    bd.line((30, y, 870, y), fill=(0, 0, 0), width=5)
base.rotate(3, expand=True, fillcolor=(255, 255, 255), resample=Image.BICUBIC).save(out/'tilt3.jpg', quality=95)
Image.new('RGB', (500, 400), (250, 248, 240)).save(out/'blank.jpg', quality=90)
print('ready')
PY`);

const { chromium } = pkg;
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.setDefaultTimeout(30000);
await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await page.waitForFunction(() => window.FormFields && window.FormDesk);

const report = { checks: [] };
function check(name, ok, detail) {
  report.checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  console.log((ok ? 'ok ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
}

async function inspect(file) {
  const list = Array.from(readFileSync(join(tmp, file)));
  return page.evaluate(async (payload) => {
    const bytes = new Uint8Array(payload);
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    const src = document.createElement('canvas');
    src.width = bmp.width;
    src.height = bmp.height;
    src.getContext('2d').drawImage(bmp, 0, 0);
    if (bmp.close) bmp.close();
    function slopeOf(canvas, pred, x0, x1, y0, y1) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const pts = [];
      for (let x = x0; x < x1; x += 3) {
        for (let y = y0; y < y1; y++) {
          const i = (y * canvas.width + x) * 4;
          if (pred(px[i], px[i + 1], px[i + 2])) { pts.push([x, y]); break; }
        }
      }
      if (pts.length < 8) return { deg: null, n: pts.length };
      let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      pts.forEach((p) => { n++; sx += p[0]; sy += p[1]; sxx += p[0] * p[0]; sxy += p[0] * p[1]; });
      const den = n * sxx - sx * sx;
      const slope = den ? (n * sxy - sx * sy) / den : 0;
      return { deg: Math.atan(slope) * 180 / Math.PI, n };
    }
    function bands(canvas) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const acc = { red: 0, blue: 0, green: 0, gold: 0 };
      const box = {
        red: [1e9, 1e9, 0, 0], blue: [1e9, 1e9, 0, 0], green: [1e9, 1e9, 0, 0], gold: [1e9, 1e9, 0, 0]
      };
      function take(name, x, y) {
        acc[name]++;
        const b = box[name];
        if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
      }
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        const r = px[i], g = px[i + 1], b = px[i + 2];
        if (r > 170 && r > g + 60 && r > b + 60) take('red', x, y);
        else if (b > 150 && b > r + 50 && b > g + 30) take('blue', x, y);
        else if (g > 110 && g > r + 50 && g > b + 30) take('green', x, y);
        else if (r > 160 && g > 120 && b < 80 && r > b + 80) take('gold', x, y);
      }
      return { acc, box, w: canvas.width, h: canvas.height };
    }
    const fileSlope = slopeOf(src, (r, g, b) => r < 80 && g < 80 && b < 80, Math.floor(src.width * 0.25), Math.floor(src.width * 0.75), 0, src.height);
    const result = await FormFields.readImage(bytes, 'image/jpeg');
    const pdf = await pdfjsLib.getDocument({ data: result.bytes.slice(0) }).promise;
    const pg = await pdf.getPage(1);
    const view = pg.getViewport({ scale: 1 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(view.width);
    canvas.height = Math.ceil(view.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvasContext: ctx, viewport: view }).promise;
    const exportSlope = slopeOf(canvas, (r, g, b) => r < 80 && g < 80 && b < 80, Math.floor(canvas.width * 0.25), Math.floor(canvas.width * 0.75), 0, canvas.height);
    const darkRows = [];
    const opx = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = 0; y < canvas.height; y++) {
      let n = 0;
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (opx[i] < 80 && opx[i + 1] < 80 && opx[i + 2] < 80) n++;
      }
      if (n > 20) darkRows.push(y);
    }
    const ruleBands = [];
    darkRows.forEach((y) => {
      const last = ruleBands[ruleBands.length - 1];
      if (last && y - last[1] <= 3) last[1] = y;
      else ruleBands.push([y, y]);
    });
    const edge = slopeOf(canvas, (r, g, b) => r > 170 && r > g + 60 && r > b + 60, 20, canvas.width - 20, 0, Math.min(canvas.height, 40));
    return {
      frame: result.frame,
      fields: (result.fields || []).length,
      fileSlope,
      exportSlope,
      edge,
      ruleBands,
      bands: bands(canvas)
    };
  }, list);
}

const tall = await inspect('tall-edges.jpg');
const edgeDeg = tall.edge && tall.edge.deg;
const bands = tall.bands;
const near = (box, x0, y0, x1, y1, slop) => box && box[0] <= x0 + slop && box[1] <= y0 + slop && box[2] >= x1 - slop && box[3] >= y1 - slop;
const w = bands.w;
const h = bands.h;
check(
  'an upright tall sheet stays level and keeps all four edges',
  tall.frame.angle === 0 && tall.fields === 0 && edgeDeg != null && Math.abs(edgeDeg) < 0.4
    && bands.acc.red > 40 && bands.acc.blue > 40 && bands.acc.green > 40 && bands.acc.gold > 40
    && bands.box.red[1] < h * 0.08 && bands.box.blue[3] > h * 0.92
    && bands.box.green[0] < w * 0.08 && bands.box.gold[2] > w * 0.9,
  JSON.stringify({ angle: tall.frame.angle, edgeDeg, acc: bands.acc, box: bands.box, frame: tall.frame })
);
void near;

const tilt = await inspect('tilt3.jpg');
const tiltDelta = tilt.fileSlope.deg == null || tilt.exportSlope.deg == null ? 99 : Math.abs(tilt.exportSlope.deg - tilt.fileSlope.deg);
check(
  'a saved tilt is kept instead of being straightened',
  tilt.frame.angle === 0 && tilt.fileSlope.n > 20 && tilt.exportSlope.n > 20 && tiltDelta < 0.5 && tilt.ruleBands.length === 3,
  JSON.stringify({ file: tilt.fileSlope, exported: tilt.exportSlope, delta: tiltDelta, bands: tilt.ruleBands, frame: tilt.frame, fields: tilt.fields })
);

const blank = await inspect('blank.jpg');
check(
  'a page with no lines is not rotated or cropped away',
  blank.frame.angle === 0 && blank.frame.outW === blank.frame.inW && blank.frame.outH === blank.frame.inH && blank.fields === 0,
  JSON.stringify(blank.frame)
);

await page.evaluate(async () => {
  await FormProfiles.clearAll();
  const loaded = await FormProfiles.load();
  loaded.vault.profiles.push({ id: 'ada', name: 'Ada Page', createdAt: '', updatedAt: '', facts: [
    { id: 'n', key: 'name', label: 'name', value: 'Ada Page', status: 'confirmed', origin: 'user', quote: '', updatedAt: '' }
  ] });
  loaded.vault.profiles.push({ id: 'bea', name: 'Bea Page', createdAt: '', updatedAt: '', facts: [
    { id: 'bn', key: 'name', label: 'name', value: 'Bea Page', status: 'confirmed', origin: 'user', quote: '', updatedAt: '' }
  ] });
  await FormProfiles.persist(loaded.vault);
});
await page.setInputFiles('#formInput', join(tmp, 'blank.jpg'));
await page.waitForFunction(() => /No lines were found/i.test(document.getElementById('readStatus').textContent || ''));
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.locator('.layer').waitFor();
if (await page.locator('#recoverBar').isHidden()) await page.click('#assistToggle');
await page.waitForFunction(() => document.querySelector('#recoverFact option'));
await page.selectOption('#recoverPerson', 'ada');
await page.click('#recoverPlace');
await page.waitForFunction(() => /Click the page/i.test(document.getElementById('recoverStatus').textContent || ''));
const layer = page.locator('.layer');
const box = await layer.boundingBox();
await layer.click({ position: { x: box.width * 0.3, y: box.height * 0.4 } });
await page.locator('.ann-body').waitFor();
const placed = await page.evaluate(() => {
  const ann = document.querySelector('.ann');
  return { text: document.querySelector('.ann-body').textContent, x: parseFloat(ann.style.left) / 100, y: parseFloat(ann.style.top) / 100 };
});
const dl = page.waitForEvent('download');
await page.click('#downloadBtn');
await page.locator('#sizeOptions button[data-level="100"]:not([disabled])').waitFor({ timeout: 20000 });
await page.click('#sizeOptions button[data-level="100"]');
const saved = await dl;
const pdfPath = join(tmp, 'blank-export.pdf');
await saved.saveAs(pdfPath);
const exported = await page.evaluate(async (list) => {
  const data = new Uint8Array(list);
  const pdf = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
  const pg = await pdf.getPage(1);
  const view = pg.getViewport({ scale: 1 });
  const item = (await pg.getTextContent()).items.find((entry) => /Ada Page/.test(entry.str));
  return item ? { x: item.transform[4], y: item.transform[5], w: view.width, h: view.height } : { w: view.width, h: view.height };
}, Array.from(readFileSync(pdfPath)));
const expected = { x: placed.x * exported.w + 1, y: (1 - placed.y) * exported.h - 14 * 0.85 };
const exportErr = exported.x == null ? 99 : Math.hypot(exported.x - expected.x, exported.y - expected.y);
check('a placement on the unrotated sheet exports within 1.5pt of the click', placed.text.includes('Ada Page') && exportErr <= 1.5, JSON.stringify({ placed, exported, expected, exportErr }));
await page.click('#dlClose');
await page.click('#recoverPlace');
await page.waitForFunction(() => /Click the page/i.test(document.getElementById('recoverStatus').textContent || ''));
await page.selectOption('#recoverPerson', 'bea');
const cancelled = await page.locator('#recoverStatus').innerText();
check('switching person cancels an armed placement', /cancelled/i.test(cancelled), cancelled);

await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await page.waitForFunction(() => window.FormDesk);
await page.setInputFiles('#formInput', join(tmp, 'tilt3.jpg'));
await page.waitForFunction(() => /No lines were found|Form ready/i.test(document.getElementById('readStatus').textContent || ''));
const first = await page.evaluate(() => FormDesk.imageFrame());
await page.setInputFiles('#formInput', join(tmp, 'blank.jpg'));
await page.waitForFunction(() => /blank\.pdf/.test(document.getElementById('formLabel').textContent || ''));
const second = await page.evaluate(() => FormDesk.imageFrame());
check(
  'replacing the photo replaces its frame',
  first && second && first.sourceW !== second.sourceW && second.sourceW === 500 && second.angle === 0,
  JSON.stringify({ first, second })
);

report.failed = report.checks.filter((item) => !item.ok).length;
writeFileSync(join(root, 'results/orientation.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log('failed', report.failed);
if (report.failed) process.exit(1);
