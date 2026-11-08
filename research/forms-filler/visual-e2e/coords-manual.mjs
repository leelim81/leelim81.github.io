/** Manual placement on rotated, cropped, and non-unit pages.
 *  Gold corners are checked against pdf.js before any fresh layout is opened.
 *  Scan refusal is checked and not relaxed. */
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
import {
  PDFDocument, degrees, PDFName, PDFNumber, rgb
} from '/tmp/formgen/node_modules/pdf-lib/dist/pdf-lib.esm.js';

const { chromium } = pkg;
const root = dirname(fileURLToPath(import.meta.url));
const shot = join(root, 'results/screenshots');
const art = '/opt/cursor/artifacts';
mkdirSync(shot, { recursive: true });
mkdirSync(art, { recursive: true });

const report = {
  browser: 'Chrome headless',
  hypothesis: 'Explicit CropBox, rotation, and UserUnit handling can place a user-chosen value where it was clicked, without changing scan detection.',
  baseline: {
    commit: '084b4fa',
    rot90: 'refused: rotated in the file',
    rot180: 'refused: rotated in the file',
    rot270: 'refused: rotated in the file',
    crop: 'refused: cropped',
    userUnit2: 'refused: scale other than 1',
    plain: 'armed for a click',
    rot45: 'refused: rotated in the file'
  },
  checks: [],
  limits: [],
  hashes: {},
  raw: []
};
function check(name, ok, detail) {
  report.checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  console.log((ok ? 'ok ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
}
function sha(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function makePdf(mutate) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 400]);
  if (mutate) await mutate(page, doc);
  const bytes = Buffer.from(await doc.save());
  return bytes;
}

const gold = {
  rot0: await makePdf(null),
  rot90: await makePdf((page) => page.setRotation(degrees(90))),
  rot180: await makePdf((page) => page.setRotation(degrees(180))),
  rot270: await makePdf((page) => page.setRotation(degrees(270))),
  crop: await makePdf((page) => page.setCropBox(20, 40, 150, 200)),
  mediaOff: await makePdf((page) => {
    page.setMediaBox(15, 25, 200, 400);
    page.setCropBox(15, 25, 200, 400);
  }),
  unit2: await makePdf((page) => page.node.set(PDFName.of('UserUnit'), PDFNumber.of(2))),
  rot45: await makePdf((page) => page.node.set(PDFName.of('Rotate'), PDFNumber.of(45))),
  unit0: await makePdf((page) => page.node.set(PDFName.of('UserUnit'), PDFNumber.of(0))),
  white90: await makePdf((page) => {
    page.drawRectangle({ x: 0, y: 0, width: 200, height: 400, color: rgb(0, 0, 0) });
    page.setRotation(degrees(90));
  }),
  widget90: await makePdf((page, doc) => {
    page.setRotation(degrees(90));
    const field = doc.getForm().createTextField('office.email');
    field.addToPage(page, { x: 20, y: 30, width: 120, height: 16 });
  }),
  twoPage: await makePdf(async (page, doc) => {
    const second = doc.addPage([220, 360]);
    second.setRotation(degrees(180));
    page.drawText('ONE', { x: 40, y: 40, size: 12 });
  })
};

// Frozen before the fresh look. Not the 200×400 measurement page.
const freshLetter = Buffer.from(await (async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  page.drawText('FRESH', { x: 72, y: 700, size: 12 });
  page.setCropBox(36, 48, 540, 700);
  page.setRotation(degrees(270));
  page.node.set(PDFName.of('UserUnit'), PDFNumber.of(1.5));
  return doc.save();
})());

for (const [name, bytes] of Object.entries(gold)) report.hashes[name] = sha(bytes);
report.hashes.freshLetter = sha(freshLetter);
report.hashes.mossTurned = sha(readFileSync(join(root, 'fixtures/place-holdout/moss-turned.form.pdf')));
report.hashes.mossCrop = sha(readFileSync(join(root, 'fixtures/place-holdout/moss-crop.form.pdf')));

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto('http://127.0.0.1:8765/tools/pdf-editor/');
await page.waitForFunction(() => window.FormCoords && window.FormProfiles && window.FormMaps && window.pdfjsLib);
report.pdfjsVersion = await page.evaluate(() => pdfjsLib.version || '');

async function ledgerOf(bytes, extra) {
  return page.evaluate(async ({ list, extraRotation }) => {
    const data = new Uint8Array(list);
    const pdf = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
    const pg = await pdf.getPage(1);
    const shown = ((pg.rotate || 0) + (extraRotation || 0)) % 360;
    const view = pg.getViewport({ scale: 1, rotation: shown });
    const doc = await PDFLib.PDFDocument.load(data.slice(0));
    const lib = doc.getPages()[0];
    const crop = lib.getCropBox();
    const rotation = FormCoords.normRotation((lib.getRotation().angle || 0) + (extraRotation || 0));
    const misses = [];
    if (rotation == null) return { skipped: true, shown, userUnit: pg.userUnit };
    for (const fx of [0, 0.15, 1]) {
      for (const fy of [0, 0.25, 1]) {
        const got = FormCoords.fractionToPdf(fx, fy, crop, rotation);
        const back = view.convertToPdfPoint(fx * view.width, fy * view.height);
        const dx = Math.abs(got.x - back[0]);
        const dy = Math.abs(got.y - back[1]);
        if (dx > 0.05 || dy > 0.05) misses.push({ fx, fy, got, back, dx, dy });
      }
    }
    return { misses, shown, userUnit: pg.userUnit, rotation };
  }, { list: Array.from(bytes), extraRotation: extra || 0 });
}

const goldLedgerNames = ['rot0', 'rot90', 'rot180', 'rot270', 'crop', 'mediaOff', 'unit2'];
let goldLedgerOk = true;
for (const name of goldLedgerNames) {
  const row = await ledgerOf(gold[name], 0);
  report.raw.push({ kind: 'ledger', name, row });
  const ok = row.misses && row.misses.length === 0;
  if (!ok) goldLedgerOk = false;
  check('gold ledger matches pdf.js for ' + name, ok, JSON.stringify(row.misses || row));
}
const editorSpin = await ledgerOf(gold.rot0, 90);
report.raw.push({ kind: 'ledger', name: 'editor+90', row: editorSpin });
const editorSpinOk = editorSpin.misses && editorSpin.misses.length === 0;
if (!editorSpinOk) goldLedgerOk = false;
check('gold ledger matches an editor quarter-turn on an upright page', editorSpinOk, JSON.stringify(editorSpin.misses || editorSpin));

if (!goldLedgerOk) {
  report.stopped = 'Gold ledger did not match pdf.js. Fresh layouts were not opened.';
  writeFileSync(join(root, 'results/coords-manual.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.stopped));
  await browser.close();
  process.exit(1);
}

async function seedPeople(target) {
  await target.evaluate(async () => {
    await FormProfiles.clearAll();
    await FormMaps.clearAll();
    const loaded = await FormProfiles.load();
    loaded.vault.profiles.push({ id: 'ada', name: 'Ada Recover', createdAt: '', updatedAt: '', facts: [
      { id: 'ada-mail', key: 'email', label: 'email', value: 'Ada90', status: 'confirmed', origin: 'user', quote: '', updatedAt: '' }
    ] });
    loaded.vault.profiles.push({ id: 'bea', name: 'Bea Recover', createdAt: '', updatedAt: '', facts: [
      { id: 'bea-mail', key: 'email', label: 'email', value: 'Bea90', status: 'confirmed', origin: 'user', quote: '', updatedAt: '' }
    ] });
    await FormProfiles.persist(loaded.vault);
  });
}
await seedPeople(page);

async function openFile(target, bytes, name) {
  await target.setInputFiles('#fileInput', { name: name, mimeType: 'application/pdf', buffer: bytes });
  await target.waitForFunction((file) => document.getElementById('fileName').textContent === file, name);
  await target.waitForFunction(() => document.querySelector('.layer'));
}

async function arm(target) {
  if (await target.locator('#recoverBar').isHidden()) await target.click('#assistToggle');
  await target.waitForFunction(() => document.querySelector('#recoverFact option'));
  await target.click('#recoverPlace');
  await target.waitForFunction(() => /Click the page|not placed|could not read/i.test(document.getElementById('recoverStatus').textContent));
  return target.locator('#recoverStatus').innerText();
}

async function readAnn(target) {
  return target.evaluate(() => {
    const el = document.querySelector('.ann');
    if (!el) return null;
    return {
      x: parseFloat(el.style.left) / 100,
      y: parseFloat(el.style.top) / 100,
      w: parseFloat(el.style.width) / 100,
      h: parseFloat(el.style.height) / 100,
      fontSize: Number(el.dataset.fontSize),
      text: el.querySelector('.ann-body').innerText
    };
  });
}

async function saveDownload(target, dest) {
  const pending = target.waitForEvent('download');
  await target.click('#downloadBtn');
  await target.locator('#sizeOptions button[data-level="100"]:not([disabled])').waitFor({ timeout: 40000 });
  await target.click('#sizeOptions button[data-level="100"]');
  const file = await pending;
  await file.saveAs(dest);
  if (await target.locator('#downloadModal').isVisible().catch(() => false)) await target.click('#dlClose');
  return readFileSync(dest);
}

async function exportedHit(target, bytes, needle) {
  return target.evaluate(async ({ list, needle }) => {
    const data = new Uint8Array(list);
    const pdf = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
    const found = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const items = (await pg.getTextContent()).items.filter((item) => String(item.str).includes(needle));
      items.forEach((item) => found.push({
        page: i,
        str: item.str,
        x: item.transform[4],
        y: item.transform[5]
      }));
    }
    const doc = await PDFLib.PDFDocument.load(data.slice(0));
    return { pages: pdf.numPages, found, widgets: doc.getForm().getFields().length };
  }, { list: Array.from(bytes), needle });
}

function nearest(found, origin) {
  return found.reduce((best, item) => {
    const dist = Math.hypot(item.x - origin.x, item.y - origin.y);
    if (!best || dist < best.dist) return { item, dist };
    return best;
  }, null);
}

async function placeAndExport(name, bytes, options) {
  options = options || {};
  await openFile(page, bytes, name + '.pdf');
  if (options.zoomIn) await page.click('#zoomIn');
  if (options.rotateEditor) {
    await page.click('#moreTools');
    await page.click('#rotatePage');
    await page.waitForFunction(() => document.getElementById('toolDrawer').hidden);
  }
  const panels = await page.evaluate(() => ({
    recover: document.getElementById('recoverBar').hidden,
    map: document.getElementById('mapBox').hidden,
    text: !document.getElementById('addText').hidden
  }));
  if (options.expectClosed) {
    check(name + ' opens with placement and maps closed and Text visible', panels.recover && panels.map && panels.text, JSON.stringify(panels));
  }
  const status = await arm(page);
  if (!/Click the page/i.test(status)) {
    check(name + ' arms placement', false, status);
    return false;
  }
  const layer = page.locator('.layer').first();
  const box = await layer.boundingBox();
  const click = options.click || { x: Math.min(90, box.width * 0.35), y: Math.min(70, box.height * 0.3) };
  await layer.click({ position: click });
  await page.locator('.ann-body').waitFor();
  if (options.nudge) {
    const before = await readAnn(page);
    await page.click('#nudgeRight');
    await page.keyboard.press('ArrowLeft');
    await page.click('#recoverUndo');
    await page.click('#recoverUndo');
    const after = await readAnn(page);
    const restored = after && before && Math.abs(after.x - before.x) < 0.001 && Math.abs(after.y - before.y) < 0.001;
    check(name + ' nudge and arrow undo back to the click', restored, JSON.stringify({ before, after }));
  }
  const ann = await readAnn(page);
  if (name === 'rot90') await page.screenshot({ path: join(shot, 'coords-rot90-placed.png') });
  const expected = await page.evaluate(async ({ list, ann, extra }) => {
    const data = new Uint8Array(list);
    const doc = await PDFLib.PDFDocument.load(data.slice(0));
    const lib = doc.getPages()[0];
    const pdf = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
    const js = await pdf.getPage(1);
    const frame = FormCoords.frameOf(lib, js, extra || 0);
    return { frameOk: frame.ok, rotation: frame.rotation, origin: FormCoords.textOrigin(ann, frame.crop, frame.rotation, ann.fontSize) };
  }, { list: Array.from(bytes), ann, extra: options.rotateEditor ? 90 : 0 });
  const out = await saveDownload(page, join(root, 'results/coords-' + name + '.pdf'));
  const hit = await exportedHit(page, out, 'Ada90');
  const close = nearest(hit.found, expected.origin);
  const landed = !!(close && close.dist <= 0.8 && close.item.page === 1);
  report.raw.push({ kind: 'export', name, ann, expected, hit, dist: close && close.dist });
  check(name + ' export redraws Ada90 on the clicked page', landed, JSON.stringify({ dist: close && close.dist, expected: expected.origin, hit: hit.found }));
  return landed;
}

let goldUi = await placeAndExport('rot0', gold.rot0, { nudge: true, expectClosed: true });
goldUi = await placeAndExport('rot90', gold.rot90) && goldUi;
goldUi = await placeAndExport('rot180', gold.rot180, { zoomIn: true }) && goldUi;
goldUi = await placeAndExport('rot270', gold.rot270) && goldUi;
goldUi = await placeAndExport('crop', gold.crop) && goldUi;
goldUi = await placeAndExport('mediaOff', gold.mediaOff) && goldUi;
goldUi = await placeAndExport('unit2', gold.unit2) && goldUi;
goldUi = await placeAndExport('editor90', gold.rot0, { rotateEditor: true }) && goldUi;

await openFile(page, gold.rot45, 'rot45.pdf');
const refused45 = await arm(page);
check('a 45 degree page stays refused', /quarter turn/i.test(refused45), refused45);
await page.locator('.layer').click({ position: { x: 40, y: 40 } }).catch(() => {});
check('the refused 45 degree page gained no line', await page.locator('.ann').count() === 0);

await openFile(page, gold.unit0, 'unit0.pdf');
const refused0 = await arm(page);
check('a zero page scale stays refused', /scale/i.test(refused0), refused0);
await page.locator('.layer').click({ position: { x: 40, y: 40 } }).catch(() => {});
check('the refused scale page gained no line', await page.locator('.ann').count() === 0);

await openFile(page, gold.white90, 'white90.pdf');
await page.click('#moreTools');
await page.click('#addWhiteout');
await page.locator('.ann').waitFor();
const whiteAnn = await page.evaluate(() => {
  const el = document.querySelector('.ann');
  return {
    x: parseFloat(el.style.left) / 100,
    y: parseFloat(el.style.top) / 100,
    w: parseFloat(el.style.width) / 100,
    h: parseFloat(el.style.height) / 100
  };
});
const whiteOut = await saveDownload(page, join(root, 'results/coords-white90.pdf'));
const white = await page.evaluate(async ({ list, ann }) => {
  const data = new Uint8Array(list);
  const pdf = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
  const pg = await pdf.getPage(1);
  const view = pg.getViewport({ scale: 1 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(view.width);
  canvas.height = Math.ceil(view.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  await pg.render({ canvasContext: ctx, viewport: view }).promise;
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const x0 = Math.max(0, Math.floor(ann.x * view.width) + 2);
  const y0 = Math.max(0, Math.floor(ann.y * view.height) + 2);
  const x1 = Math.min(canvas.width, Math.ceil((ann.x + ann.w) * view.width) - 2);
  const y1 = Math.min(canvas.height, Math.ceil((ann.y + ann.h) * view.height) - 2);
  let dark = 0;
  let seen = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      seen++;
      if (pixels[(y * canvas.width + x) * 4] < 40) dark++;
    }
  }
  return { dark, seen, view: [view.width, view.height] };
}, { list: Array.from(whiteOut), ann: whiteAnn });
report.raw.push({ kind: 'whiteout', white });
check('a whiteout on a 90 degree page covers its box', white.seen > 20 && white.dark / white.seen < 0.05, JSON.stringify(white));

await openFile(page, gold.widget90, 'widget90.pdf');
const widgetStatus = await arm(page);
check('a rotated page with a widget can take a placed value', /Click the page/i.test(widgetStatus), widgetStatus);
await page.locator('.layer').click({ position: { x: 80, y: 50 } });
await page.locator('.ann-body').waitFor();
const widgetFile = await saveDownload(page, join(root, 'results/coords-widget90.pdf'));
const widgetHit = await exportedHit(page, widgetFile, 'Ada90');
check('the rotated widget page still has its widget and the placed value', widgetHit.widgets === 1 && widgetHit.found.length === 1, JSON.stringify({ widgets: widgetHit.widgets, n: widgetHit.found.length }));

await openFile(page, gold.twoPage, 'two.pdf');
let cancelStatus = await arm(page);
await page.click('#nextPage');
cancelStatus = await page.locator('#recoverStatus').innerText();
check('changing page cancels an armed placement', /page changed/i.test(cancelStatus), cancelStatus);
await page.locator('.page').nth(1).locator('.layer').click({ position: { x: 30, y: 30 } });
check('the other page gained nothing from the cancelled click', await page.locator('.ann').count() === 0);
cancelStatus = await arm(page);
await page.selectOption('#recoverPerson', 'bea');
const personStatus = await page.locator('#recoverStatus').innerText();
check('changing person cancels an armed placement', /person changed/i.test(personStatus), personStatus);
await page.locator('.layer').first().click({ position: { x: 40, y: 40 } });
check('the cancelled person click added nothing', await page.locator('.ann').count() === 0);
await page.selectOption('#recoverPerson', 'ada');
await arm(page);
await page.locator('.page').nth(1).locator('.layer').click({ position: { x: 40, y: 40 } });
await page.locator('.ann-body').waitFor();
const page2 = await saveDownload(page, join(root, 'results/coords-page2.pdf'));
const page2Ann = await readAnn(page);
const page2Hit = await exportedHit(page, page2, 'Ada90');
const page2Expected = await page.evaluate(async ({ list, ann }) => {
  const data = new Uint8Array(list);
  const doc = await PDFLib.PDFDocument.load(data.slice(0));
  const lib = doc.getPages()[1];
  const pdf = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
  const frame = FormCoords.frameOf(lib, await pdf.getPage(2), 0);
  return FormCoords.textOrigin(ann, frame.crop, frame.rotation, ann.fontSize);
}, { list: Array.from(gold.twoPage), ann: page2Ann });
const page2Near = nearest(page2Hit.found, page2Expected);
check('the value exports on page 2 only, at the clicked point', page2Hit.found.length === 1 && page2Hit.found[0].page === 2 && page2Near && page2Near.dist <= 0.8, JSON.stringify({ dist: page2Near && page2Near.dist, found: page2Hit.found, expected: page2Expected }));

await openFile(page, gold.rot90, 'map90.pdf');
await arm(page);
await page.locator('.layer').click({ position: { x: 70, y: 40 } });
await page.locator('.ann-body').waitFor();
if (await page.locator('#mapBox').isHidden()) await page.click('#mapToggle');
await page.fill('#mapName', 'Quarter map');
await page.click('#mapSave');
await page.locator('#recoverStatus', { hasText: 'Saved' }).waitFor();
const storedMap = await page.evaluate(async () => JSON.stringify(await FormMaps.load()));
check('the map keeps geometry and not the typed value or person', storedMap.includes('"rotation":90') && storedMap.includes('"userUnit":1') && !storedMap.includes('Ada90') && !storedMap.includes('"ada"'), storedMap.slice(0, 500));
await page.click('#moreTools');
await page.click('#rotatePage');
await page.waitForFunction(() => document.getElementById('toolDrawer').hidden);
await page.click('#mapApply');
await page.waitForFunction(() => /rotated or reordered/i.test(document.getElementById('recoverStatus').textContent));
const spun = await page.locator('#recoverStatus').innerText();
check('an editor turn still blocks a map', /rotated or reordered/i.test(spun), spun);
await openFile(page, gold.rot90, 'map90-again.pdf');
await page.waitForFunction(() => document.querySelector('#recoverFact option'));
if (await page.locator('#mapBox').isHidden()) await page.click('#mapToggle');
await page.locator('#mapPick option', { hasText: 'Quarter map' }).waitFor({ state: 'attached' });
await page.click('#mapApply');
await page.locator('#recoverStatus', { hasText: 'Applied' }).waitFor();
check('the same rotated file applies the map once', await page.locator('.ann').count() === 1 && (await page.locator('.ann-body').innerText()).includes('Ada90'));
const mismatch = await page.evaluate(() => {
  const loaded = FormMaps.migrate({ schema: 1, maps: [] });
  return FormMaps.matchesFrame(
    { width: 200, height: 400, rotation: 90, userUnit: 1, cropX: 0, cropY: 0, cropWidth: 200, cropHeight: 400 },
    { ok: true, rotation: 0, userUnit: 1, media: { width: 200, height: 400 }, crop: { x: 0, y: 0, width: 200, height: 400 } }
  );
});
check('a quarter-turn map does not match an upright frame of the same size', mismatch === false);

if (goldUi) {
  const freshLedger = await ledgerOf(freshLetter, 0);
  report.raw.push({ kind: 'fresh-ledger', row: freshLedger });
  const freshMath = freshLedger.misses && freshLedger.misses.length === 0;
  check('fresh letter geometry matches the frozen transform', freshMath, JSON.stringify(freshLedger.misses || freshLedger));
  if (freshMath) {
    await placeAndExport('freshLetter', freshLetter, { click: { x: 110, y: 80 } });
  } else {
    report.limits.push('Fresh letter placement was not attempted because the frozen transform did not match pdf.js.');
  }
  const mossTurned = readFileSync(join(root, 'fixtures/place-holdout/moss-turned.form.pdf'));
  const mossCrop = readFileSync(join(root, 'fixtures/place-holdout/moss-crop.form.pdf'));
  const mossLedgerT = await ledgerOf(mossTurned, 0);
  const mossLedgerC = await ledgerOf(mossCrop, 0);
  report.raw.push({ kind: 'moss-ledger', turned: mossLedgerT, crop: mossLedgerC });
  check('Moss turned page matches the frozen transform', mossLedgerT.misses && mossLedgerT.misses.length === 0, JSON.stringify(mossLedgerT.misses || mossLedgerT));
  check('Moss crop page matches the frozen transform', mossLedgerC.misses && mossLedgerC.misses.length === 0, JSON.stringify(mossLedgerC.misses || mossLedgerC));
  if (mossLedgerT.misses && mossLedgerT.misses.length === 0) await placeAndExport('mossTurned', mossTurned, { click: { x: 120, y: 80 } });
  if (mossLedgerC.misses && mossLedgerC.misses.length === 0) await placeAndExport('mossCrop', mossCrop, { click: { x: 100, y: 80 } });
} else {
  report.stopped = 'Gold placement failed. Fresh layouts were not opened.';
  check('fresh layouts stayed unopened after a gold failure', true, report.stopped);
}

const dpr = await browser.newContext({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 2 });
const dprPage = await dpr.newPage();
await dprPage.goto('http://127.0.0.1:8765/tools/pdf-editor/');
await dprPage.waitForFunction(() => window.FormCoords && window.FormProfiles);
await seedPeople(dprPage);
await openFile(dprPage, gold.rot90, 'dpr90.pdf');
const dprStatus = await arm(dprPage);
await dprPage.locator('.layer').click({ position: { x: 100, y: 60 } });
await dprPage.locator('.ann-body').waitFor();
const dprAnn = await readAnn(dprPage);
const dprExpected = await dprPage.evaluate(async ({ list, ann }) => {
  const data = new Uint8Array(list);
  const doc = await PDFLib.PDFDocument.load(data.slice(0));
  const lib = doc.getPages()[0];
  const frame = FormCoords.frameOf(lib, await (await pdfjsLib.getDocument({ data: data.slice(0) }).promise).getPage(1), 0);
  return FormCoords.textOrigin(ann, frame.crop, frame.rotation, ann.fontSize);
}, { list: Array.from(gold.rot90), ann: dprAnn });
const dprFile = await saveDownload(dprPage, join(root, 'results/coords-dpr90.pdf'));
const dprHit = await exportedHit(dprPage, dprFile, 'Ada90');
const dprNear = nearest(dprHit.found, dprExpected);
report.raw.push({ kind: 'dpr', ratio: await dprPage.evaluate(() => window.devicePixelRatio), ann: dprAnn, dist: dprNear && dprNear.dist, status: dprStatus });
check('device pixel ratio 2 still exports the clicked fraction', dprNear && dprNear.dist <= 0.8, JSON.stringify({ dist: dprNear && dprNear.dist, ratio: report.raw.at(-1).ratio }));
await dprPage.screenshot({ path: join(shot, 'coords-rot90-placed.png') });
await dpr.close();

await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await page.waitForFunction(() => window.FormFields);
const scan = await page.evaluate(async () => {
  function png() {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ddd';
    ctx.fillRect(0, 0, 40, 40);
    ctx.fillStyle = '#222';
    ctx.fillRect(4, 30, 30, 2);
    const bin = atob(canvas.toDataURL('image/png').split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  async function sheet(mutate) {
    const doc = await PDFLib.PDFDocument.create();
    const page = doc.addPage([200, 400]);
    const image = await doc.embedPng(png());
    page.drawImage(image, { x: 0, y: 0, width: 200, height: 400 });
    if (mutate) mutate(page);
    return new Uint8Array(await doc.save());
  }
  const turned = await sheet((page) => page.setRotation(PDFLib.degrees(90)));
  const cropped = await sheet((page) => page.setCropBox(20, 40, 150, 200));
  const scaled = await sheet((page) => page.node.set(PDFLib.PDFName.of('UserUnit'), PDFLib.PDFNumber.of(2)));
  const doc = await PDFLib.PDFDocument.create();
  const upright = doc.addPage([200, 400]);
  upright.drawText('This upright page has enough letters to stay a text page.', { x: 12, y: 200, size: 12 });
  const plain = new Uint8Array(await doc.save());
  async function summarize(bytes) {
    const read = await FormFields.read(bytes);
    return { n: (read.fields || []).length, block: read.placementBlock || '', route: read.route || '' };
  }
  return {
    turned: await summarize(turned),
    cropped: await summarize(cropped),
    scaled: await summarize(scaled),
    plain: await summarize(plain)
  };
});
report.raw.push({ kind: 'scan', scan });
check('scan still gives a rotated raster no line positions', scan.turned.n === 0 && /not offered|not turned|place the values yourself/i.test(scan.turned.block), JSON.stringify(scan.turned));
check('scan still gives an offset crop no line positions', scan.cropped.n === 0 && /not offered|not turned|place the values yourself/i.test(scan.cropped.block), JSON.stringify(scan.cropped));
check('scan still gives a non-unit scale no line positions', scan.scaled.n === 0 && /scale|not offered|not turned|place the values yourself/i.test(scan.scaled.block), JSON.stringify(scan.scaled));
check('an upright unit page is not scan-blocked', scan.plain.block === '' && scan.plain.n === 0 && scan.plain.route !== 'raster-blocked', JSON.stringify(scan.plain));

await page.screenshot({ path: join(shot, 'coords-scan-unchanged.png') });
copyFileSync(join(shot, 'coords-rot90-placed.png'), join(art, 'coords-rot90-placed.png'));
copyFileSync(join(shot, 'coords-scan-unchanged.png'), join(art, 'coords-scan-unchanged.png'));

report.limits.push('Gold pages are 200 by 400 synthetic sheets. The fresh sheet is letter size with a crop, a 270 degree turn, and UserUnit 1.5. Moss pages are the existing synthetic rasters.');
report.limits.push('Position is the text origin versus the frozen transform, within 0.8 user units, on these pages only.');
report.limits.push('No phone was used. Current Chrome stable load-unpacked was not this script.');
report.failed = report.checks.filter((item) => !item.ok).length;
writeFileSync(join(root, 'results/coords-manual.json'), JSON.stringify(report, null, 2) + '\n');
await browser.close();
console.log('failed', report.failed, 'of', report.checks.length);
if (report.failed) process.exit(1);
