/** Large-photo ingestion. One image is opened at a time.
 *  Surrey is a resource case, not a new field audit. No gold boxes are added. */
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const require = createRequire(import.meta.url);
const Frame = require('../../../tools/forms-filler/frame.js');
const root = dirname(fileURLToPath(import.meta.url));
const shot = join(root, 'results/screenshots');
const art = '/opt/cursor/artifacts';
const tmp = '/tmp/ff-large';
mkdirSync(shot, { recursive: true });
mkdirSync(tmp, { recursive: true });

const report = { checks: [], limits: [] };
function check(name, ok, detail) {
  report.checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  console.log((ok ? 'ok ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
  return !!ok;
}

execSync(`python3 - << 'PY'
from PIL import Image, ImageDraw
from pathlib import Path
import struct, zlib
out = Path('/tmp/ff-large')
plain = Image.new('RGB', (480, 240), 'white')
d = ImageDraw.Draw(plain)
d.text((24, 78), 'Name', fill='black')
d.line((100, 108, 420, 108), fill='black', width=2)
plain.save(out/'small-sheet.jpg', quality=90)
plain.save(out/'small-sheet.png')
stored = plain.transpose(Image.Transpose.ROTATE_90)
exif = Image.Exif()
exif[274] = 6
stored.save(out/'exif6.jpg', exif=exif, quality=90)
tall = Image.new('RGB', (400, 3000), (248, 244, 232))
ImageDraw.Draw(tall).rectangle((0, 0, 399, 2999), outline=(20, 20, 20), width=4)
tall.save(out/'tall.jpg', quality=70)
mark = Image.new('RGB', (2400, 1800), (255, 255, 255))
md = ImageDraw.Draw(mark)
md.rectangle((0, 0, 2399, 1799), outline=(0, 0, 0), width=6)
md.rectangle((800, 600, 839, 639), fill=(220, 0, 0))
mark.save(out/'mark.jpg', quality=95)
(out/'corrupt.jpg').write_bytes(b'\\xff\\xd8\\xff\\xd9')
def sof(w, h):
    data = bytes([8]) + h.to_bytes(2, 'big') + w.to_bytes(2, 'big') + bytes([1, 0x11, 0, 0])
    return b'\\xff\\xd8\\xff\\xc0' + (len(data) + 2).to_bytes(2, 'big') + data + b'\\xff\\xd9'
(out/'oversize.jpg').write_bytes(sof(40000, 40000))
def chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
ihdr = struct.pack('>IIBBBBB', 40000, 40000, 8, 2, 0, 0, 0)
(out/'oversize.png').write_bytes(b'\\x89PNG\\r\\n\\x1a\\n' + chunk(b'IHDR', ihdr))
print('fixtures ready')
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

async function seed() {
  await page.evaluate(async () => {
    await FormProfiles.clearAll();
    const loaded = await FormProfiles.load();
    loaded.vault.profiles.push({
      id: 'ada', name: 'Ada Page', createdAt: '', updatedAt: '',
      facts: [{ id: 'n', key: 'name', label: 'name', value: 'Ada Page', status: 'confirmed', origin: 'user', quote: '', updatedAt: '' }]
    });
    await FormProfiles.persist(loaded.vault);
  });
}

function statusText() {
  return page.locator('#readStatus').innerText();
}
function labelText() {
  return page.locator('#formLabel').innerText();
}

const markBytes = Array.from(readFileSync(join(tmp, 'mark.jpg')));
const markRead = await page.evaluate(async (list) => {
  const before = performance.memory ? performance.memory.usedJSHeapSize : null;
  const t0 = performance.now();
  const result = await FormFields.readImage(new Uint8Array(list), 'image/jpeg');
  const pdfBytes = result.bytes;
  const pdf = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
  const pg = await pdf.getPage(1);
  const view = pg.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(view.width);
  canvas.height = Math.ceil(view.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  await pg.render({ canvasContext: ctx, viewport: view }).promise;
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let n = 0, sx = 0, sy = 0;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      if (pixels[i] > 160 && pixels[i] > pixels[i + 1] + 40 && pixels[i] > pixels[i + 2] + 40) {
        n++; sx += x; sy += y;
      }
    }
  }
  const after = performance.memory ? performance.memory.usedJSHeapSize : null;
  return {
    ms: Math.round(performance.now() - t0),
    frame: result.frame,
    n,
    cx: n ? sx / n : null,
    cy: n ? sy / n : null,
    viewW: view.width,
    viewH: view.height,
    heapBefore: before,
    heapAfter: after
  };
}, markBytes);
const markFrame = markRead.frame;
let sourceCenter = null;
if (markRead.n && markFrame) {
  const sheetX = markRead.cx / markRead.viewW * markFrame.outW;
  const sheetY = markRead.cy / markRead.viewH * markFrame.outH;
  sourceCenter = Frame.sheetBoxToSource([sheetX, sheetY, sheetX, sheetY], markFrame);
}
const markErr = sourceCenter ? Math.hypot(sourceCenter[0] - 819.5, sourceCenter[1] - 619.5) : 99;
check('a scaled mark maps back to its source pixel within 4px', markErr <= 4 && markFrame.sourceW === 2400 && markFrame.sourceH === 1800 && markFrame.inW === 1500, JSON.stringify({ markErr, sourceCenter, frame: markFrame, ms: markRead.ms, red: markRead.n }));

const tallBytes = Array.from(readFileSync(join(tmp, 'tall.jpg')));
const tall = await page.evaluate(async (list) => {
  const result = await FormFields.readImage(new Uint8Array(list), 'image/jpeg');
  return result.frame;
}, tallBytes);
const tallAspect = tall && Math.abs((tall.sourceW / tall.sourceH) - (tall.inW / tall.inH)) < 0.01;
check('a tall photo keeps its aspect and its height stays within the measured sheet', !!tall && tall.sourceW === 400 && tall.sourceH === 3000 && tall.inH <= 1850 && tall.inH > 1500 && tallAspect, JSON.stringify(tall));

await seed();
await page.setInputFiles('#formInput', join(tmp, 'small-sheet.jpg'));
await page.waitForFunction(() => {
  const text = document.getElementById('readStatus').textContent || '';
  return /No lines were found|Form ready|scan estimates/i.test(text);
});
const keptName = await labelText();
await page.setInputFiles('#formInput', join(tmp, 'corrupt.jpg'));
await page.waitForFunction(() => /could not be opened/i.test(document.getElementById('readStatus').textContent || ''));
const afterCorrupt = {
  status: await statusText(),
  label: await labelText(),
  place: await page.locator('#placeMissing').isDisabled()
};
check('a corrupt image clears the previous form instead of leaving it placeable', /could not be opened/i.test(afterCorrupt.status) && afterCorrupt.place && /fillable PDF/i.test(afterCorrupt.label), JSON.stringify({ keptName, afterCorrupt }));

const overStarted = Date.now();
await page.setInputFiles('#formInput', join(tmp, 'oversize.jpg'));
await page.waitForFunction(() => /did not decode/i.test(document.getElementById('readStatus').textContent || ''));
const overMs = Date.now() - overStarted;
const overStatus = await statusText();
check('an oversized header is refused before a giant decode', overMs < 3000 && /40000×40000/.test(overStatus) && /did not decode/.test(overStatus), JSON.stringify({ overMs, overStatus }));

await page.setInputFiles('#formInput', join(tmp, 'oversize.png'));
await page.waitForFunction(() => /did not decode/i.test(document.getElementById('readStatus').textContent || ''));
check('an oversized PNG header is refused the same way', /40000×40000/.test(await statusText()));

await page.setInputFiles('#formInput', join(tmp, 'small-sheet.png'));
await page.waitForFunction(() => /No lines were found|Form ready|scan estimates/i.test(document.getElementById('readStatus').textContent || ''));
const pngFrame = await page.evaluate(() => FormDesk.imageFrame());
check('a PNG records its own pixel size on the sheet frame', pngFrame && pngFrame.sourceW === 480 && pngFrame.sourceH === 240, JSON.stringify(pngFrame));

await page.setInputFiles('#formInput', join(tmp, 'exif6.jpg'));
await page.waitForFunction(() => /No lines were found|Form ready|scan estimates/i.test(document.getElementById('readStatus').textContent || ''));
const exifFrame = await page.evaluate(() => FormDesk.imageFrame());
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.locator('.layer').waitFor();
const exifAspect = await page.evaluate(() => {
  const rect = document.querySelector('.layer').getBoundingClientRect();
  return rect.width / Math.max(1, rect.height);
});
check('EXIF orientation 6 is the wide sheet and the frame stores oriented pixels', exifAspect > 1.2 && exifFrame && exifFrame.sourceW === 480 && exifFrame.sourceH === 240, JSON.stringify({ exifAspect, exifFrame }));
await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await page.waitForFunction(() => window.FormProfiles);

const native = await page.evaluate(async () => {
  const doc = await PDFLib.PDFDocument.create();
  const sheet = doc.addPage([360, 240]);
  sheet.drawText('KEEP-ORIGINAL', { x: 48, y: 160, size: 16 });
  const form = doc.getForm();
  const field = form.createTextField('native.keep');
  field.addToPage(sheet, { x: 48, y: 80, width: 180, height: 22 });
  return Array.from(await doc.save());
});
writeFileSync(join(tmp, 'native.pdf'), Buffer.from(native));
await page.setInputFiles('#formInput', join(tmp, 'native.pdf'));
await page.waitForFunction(() => /Form ready|field/i.test((document.getElementById('formLabel').textContent || '') + (document.getElementById('readStatus').textContent || '')));
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
const nativeDl = page.waitForEvent('download');
await page.click('#downloadBtn');
await page.locator('#sizeOptions button[data-level="100"]:not([disabled])').waitFor({ timeout: 20000 });
await page.click('#sizeOptions button[data-level="100"]');
const nativeFile = await nativeDl;
const nativePath = join(tmp, 'native-export.pdf');
await nativeFile.saveAs(nativePath);
const kept = await page.evaluate(async (list) => {
  const data = new Uint8Array(list);
  const pdf = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
  const text = (await (await pdf.getPage(1)).getTextContent()).items.map((item) => item.str).join(' ');
  const doc = await PDFLib.PDFDocument.load(data.slice(0));
  return { text, widgets: doc.getForm().getFields().length };
}, Array.from(readFileSync(nativePath)));
check('a native PDF keeps its original text and widget', kept.text.includes('KEEP-ORIGINAL') && kept.widgets === 1, JSON.stringify(kept));

await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await page.waitForFunction(() => window.FormDesk);
for (let pass = 0; pass < 2; pass++) {
  await page.setInputFiles('#formInput', join(tmp, 'small-sheet.jpg'));
  await page.waitForFunction(() => /No lines were found|Form ready|scan estimates/i.test(document.getElementById('readStatus').textContent || ''));
  await page.click('#clearBtn');
  await page.waitForFunction(() => /fillable PDF/i.test(document.getElementById('formLabel').textContent || ''));
}
const cleared = {
  label: await labelText(),
  place: await page.locator('#placeMissing').isDisabled()
};
check('opening and clearing twice leaves no form to place', cleared.place && /fillable PDF/i.test(cleared.label), JSON.stringify(cleared));

const surrey = '/tmp/ff-natural-scans/ff-natural-scans/files/wellcome-surrey-letter.jpg';
await page.setInputFiles('#formInput', surrey);
await page.waitForFunction(() => /Reading the photo|Straightening|Finding the blank/i.test(document.getElementById('readStatus').textContent || ''));
const busyPlace = await page.locator('#placeMissing').isDisabled();
await page.setInputFiles('#formInput', join(tmp, 'small-sheet.jpg'));
await page.waitForFunction(() => /small-sheet\.pdf/.test(document.getElementById('formLabel').textContent || ''), null, { timeout: 20000 });
await page.waitForTimeout(5000);
const replaced = await labelText();
check('a later small photo replaces a large read still in progress', busyPlace && /small-sheet\.pdf/.test(replaced), JSON.stringify({ busyPlace, replaced }));

await page.setInputFiles('#formInput', surrey);
await page.waitForFunction(() => /Reading the photo|Straightening|Finding the blank/i.test(document.getElementById('readStatus').textContent || ''));
await page.click('#clearBtn');
await page.waitForTimeout(6000);
const cancelled = {
  label: await labelText(),
  status: await page.locator('#readStatus').innerText().catch(() => ''),
  place: await page.locator('#placeMissing').isDisabled()
};
check('clearing during the large read does not leave that sheet behind', cancelled.place && /fillable PDF/i.test(cancelled.label) && !/4842/.test(cancelled.status), JSON.stringify(cancelled));

await page.setInputFiles('#formInput', surrey);
const surreyT0 = Date.now();
await page.waitForFunction(() => /4842×5964/.test(document.getElementById('readStatus').textContent || ''), null, { timeout: 30000 });
const surreyMs = Date.now() - surreyT0;
const surreyStatus = await statusText();
const surreyFrame = await page.evaluate(() => FormDesk.imageFrame());
const heap = await page.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : null);
check('Surrey opens as a reduced sheet and reports the original size', /No lines were found/i.test(surreyStatus) && /reduced to 1500×1848/.test(surreyStatus) && surreyFrame && surreyFrame.sourceW === 4842 && surreyFrame.sourceH === 5964 && surreyFrame.inW === 1500 && surreyFrame.inH === 1848, JSON.stringify({ surreyMs, surreyStatus, surreyFrame, heap }));
report.surrey = { ms: surreyMs, status: surreyStatus, frame: surreyFrame, jsHeap: heap };

await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.locator('.layer').waitFor();
if (await page.locator('#recoverBar').isHidden()) await page.click('#assistToggle');
await page.waitForFunction(() => document.querySelector('#recoverFact option'));
await page.click('#recoverPlace');
await page.waitForFunction(() => /Click the page/i.test(document.getElementById('recoverStatus').textContent || ''));
const layer = page.locator('.layer');
const box = await layer.boundingBox();
await layer.click({ position: { x: box.width * 0.40, y: box.height * 0.30 } });
await page.locator('.ann-body').waitFor();
const placed = await page.evaluate(() => {
  const ann = document.querySelector('.ann');
  return {
    text: document.querySelector('.ann-body').textContent,
    x: parseFloat(ann.style.left) / 100,
    y: parseFloat(ann.style.top) / 100
  };
});
await page.screenshot({ path: join(shot, 'surrey-placed.png') });
copyFileSync(join(shot, 'surrey-placed.png'), join(art, 'surrey-placed.png'));
const dl = page.waitForEvent('download');
await page.click('#downloadBtn');
await page.locator('#sizeOptions button[data-level="100"]:not([disabled])').waitFor({ timeout: 20000 });
await page.click('#sizeOptions button[data-level="100"]');
const file = await dl;
const pdfPath = join(tmp, 'surrey-export.pdf');
await file.saveAs(pdfPath);
const exported = await page.evaluate(async (list) => {
  const data = new Uint8Array(list);
  const pdf = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
  const pg = await pdf.getPage(1);
  const view = pg.getViewport({ scale: 1 });
  const item = (await pg.getTextContent()).items.find((entry) => /Ada Page/.test(entry.str));
  return item ? { x: item.transform[4], y: item.transform[5], w: view.width, h: view.height } : { w: view.width, h: view.height };
}, Array.from(readFileSync(pdfPath)));
const expected = exported.h ? {
  x: placed.x * exported.w + 1,
  y: (1 - placed.y) * exported.h - 14 * 0.85
} : null;
const exportErr = expected && exported.x != null ? Math.hypot(exported.x - expected.x, exported.y - expected.y) : 99;
check('the fictional Surrey placement exports on the click, within 1.5pt', placed.text.includes('Ada Page') && exportErr <= 1.5, JSON.stringify({ placed, exported, expected, exportErr }));

const back = Frame.sheetBoxToSource([
  placed.x * surreyFrame.outW, placed.y * surreyFrame.outH,
  placed.x * surreyFrame.outW, placed.y * surreyFrame.outH
], surreyFrame);
function sheetFromSource(sx, sy, frame) {
  const ix = sx / (frame.sourceW / frame.inW);
  const iy = sy / (frame.sourceH / frame.inH);
  const rad = (frame.angle || 0) * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const lx = ix - frame.inW / 2;
  const ly = iy - frame.inH / 2;
  return [
    frame.turnW / 2 + cos * lx - sin * ly - frame.crop.x,
    frame.turnH / 2 + sin * lx + cos * ly - frame.crop.y
  ];
}
const again = sheetFromSource(back[0], back[1], surreyFrame);
const sheetX = placed.x * surreyFrame.outW;
const sheetY = placed.y * surreyFrame.outH;
const roundErr = Math.hypot(again[0] - sheetX, again[1] - sheetY);
check('the click maps through the recorded frame and back within 2 sheet pixels', roundErr < 2 && back[0] >= 0 && back[0] <= surreyFrame.sourceW && back[1] >= 0 && back[1] <= surreyFrame.sourceH, JSON.stringify({ back, again, roundErr }));

report.failed = report.checks.filter((item) => !item.ok).length;
writeFileSync(join(root, 'results/large-image.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log('failed', report.failed);
if (report.failed) process.exit(1);
