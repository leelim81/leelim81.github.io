/** Document restore across back, forward, and reload. Visible controls, fresh store.
 *  Waits are on status text, not on the old 300ms timer. */
import { writeFileSync } from 'fs';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const PDF = '/workspace/tools/forms-filler/samples/flat-day-pass.pdf';
const FOOD = '/tmp/ff-natural-work/bounded/wellcome-food-order-bounded.jpg';
const REENCODED = '/tmp/food-reencoded.jpg';
const OTHER = '/tmp/other-sheet.jpg';
const { chromium } = pkg;
const checks = [];
let interactions = 0;

function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 400) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 240) : ''));
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-http-cache'],
  headless: true
});

async function boot() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const prompts = [];
  page.on('dialog', async (dialog) => {
    const next = prompts.shift();
    if (dialog.type() === 'prompt' && next != null) await dialog.accept(String(next));
    else if (dialog.type() === 'confirm') await dialog.accept();
    else await dialog.dismiss();
  });
  async function click(selector) {
    interactions += 1;
    await page.locator(selector).click();
  }
  async function choose(trigger, file) {
    const waiter = page.waitForEvent('filechooser');
    await click(trigger);
    const chooser = await waiter;
    interactions += 1;
    await chooser.setFiles(file);
  }
  async function ready() {
    await page.waitForFunction(() => {
      const text = (document.getElementById('readStatus') || {}).textContent || '';
      const button = document.getElementById('placeMissing');
      return button && !button.disabled && text && !/^(Reading|Finding|Opening|Straighten|Clearing)/.test(text);
    }, null, { timeout: 90000 });
    return page.locator('#readStatus').innerText();
  }
  return { context, page, prompts, click, choose, ready };
}

const life = await boot();
await life.page.goto('http://127.0.0.1:8765/tools/forms-filler/?life=' + Date.now(), { waitUntil: 'domcontentloaded' });
await life.page.waitForSelector('#formDrop');
await life.choose('#formDrop', PDF);
const firstStatus = await life.ready();
check('a pdf becomes ready without a timer', /Form ready|field|line|spot/i.test(firstStatus), firstStatus);
await life.click('#placeMissing');
await life.page.waitForURL(/pdf-editor/);
await life.page.waitForSelector('#fileName', { state: 'visible' });
const editorName = await life.page.locator('#fileName').innerText();
check('the editor opens that pdf', /flat-day-pass/.test(editorName), editorName);

await life.page.goBack();
interactions += 1;
await life.page.waitForSelector('#formDrop');
const backStatus = await life.ready();
const backLabel = await life.page.locator('#formLabel').innerText();
check('browser back restores the pdf and its status', /flat-day-pass/.test(backLabel) && /Form ready|field|line|spot/i.test(backStatus), backLabel + ' || ' + backStatus);

await life.page.goForward();
interactions += 1;
await life.page.waitForURL(/pdf-editor/);
await life.page.waitForSelector('#fileName', { state: 'visible' });
check('forward returns to the same editor document', /flat-day-pass/.test(await life.page.locator('#fileName').innerText()));

await life.page.goBack();
interactions += 1;
await life.ready();
await life.page.goForward();
interactions += 1;
await life.page.waitForSelector('#fileName', { state: 'visible' });
await life.page.goBack();
interactions += 1;
await life.ready();
check('a second return still has the pdf', /flat-day-pass/.test(await life.page.locator('#formLabel').innerText()));

await life.click('a.back');
await life.page.waitForURL(/\/tools\/?$/);
await life.page.goto('http://127.0.0.1:8765/tools/forms-filler/?again=' + Date.now(), { waitUntil: 'domcontentloaded' });
interactions += 1;
const again = await life.ready();
check('opening the form page again restores the stored pdf', /flat-day-pass/.test(await life.page.locator('#formLabel').innerText()), again);

await life.page.reload();
interactions += 1;
const reloaded = await life.ready();
check('reload restores the stored pdf', /flat-day-pass/.test(await life.page.locator('#formLabel').innerText()), reloaded);

await life.click('#profileToggle');
life.prompts.push('Ada Lane');
await life.click('#profileAdd');
await life.page.waitForFunction(() => /Ada Lane/.test(document.getElementById('profilePick').innerText));
life.prompts.push('Bea Shore');
await life.click('#profileAdd');
await life.page.waitForFunction(() => /Bea Shore/.test(document.getElementById('profilePick').innerText));
const labelBefore = await life.page.locator('#formLabel').innerText();
await life.page.locator('#profilePick').selectOption({ label: 'Ada Lane' });
interactions += 1;
await life.page.locator('#profilePick').selectOption({ label: 'Bea Shore' });
interactions += 1;
check('switching person does not change the document', (await life.page.locator('#formLabel').innerText()) === labelBefore, labelBefore);

await life.click('#clearBtn');
await life.page.waitForFunction(() => /Started over/.test((document.getElementById('readStatus') || {}).textContent || ''));
check('start over says the stored form is gone', /Nothing is stored/.test(await life.page.locator('#readStatus').innerText()));
await life.page.reload();
interactions += 1;
await life.page.waitForSelector('#formLabel');
const afterClear = await life.page.locator('#formLabel').innerText();
check('reload after start over does not bring the pdf back', !/flat-day-pass/.test(afterClear) && await life.page.locator('#placeMissing').isDisabled(), afterClear);

writeFileSync('/tmp/not-a-pdf.pdf', 'this is not a pdf');
await life.choose('#formDrop', '/tmp/not-a-pdf.pdf');
await life.page.waitForFunction(() => {
  const text = (document.getElementById('readStatus') || {}).textContent || '';
  return text && !/^(Reading|Opening|Clearing)/.test(text);
});
const corrupt = await life.page.locator('#readStatus').innerText();
check('a corrupt file is refused', /could not|too long|nothing was kept|not a pdf|unable|no pdf header|failed to parse/i.test(corrupt), corrupt);
await life.page.reload();
interactions += 1;
await life.page.waitForSelector('#placeMissing');
await life.page.waitForFunction(() => {
  const text = (document.getElementById('readStatus') || {}).textContent || '';
  const label = (document.getElementById('formLabel') || {}).textContent || '';
  return !/not-a-pdf|flat-day-pass/.test(label) || /could not|Started over|No lines|Form ready/.test(text);
}, null, { timeout: 5000 }).catch(() => {});
const afterCorrupt = (await life.page.locator('#formLabel').innerText()) + ' || ' + (await life.page.locator('#readStatus').innerText());
check('reload does not restore the corrupt file or the previous pdf', !/flat-day-pass|not-a-pdf/.test(afterCorrupt), afterCorrupt);

await life.choose('#formDrop', PDF);
await life.ready();
check('a new pdf replaces the empty desk', /flat-day-pass/.test(await life.page.locator('#formLabel').innerText()));

const quota = await boot();
await quota.page.goto('http://127.0.0.1:8765/tools/forms-filler/?quota=' + Date.now(), { waitUntil: 'domcontentloaded' });
await quota.page.waitForFunction(() => window.DeskDB);
await quota.page.evaluate(() => {
  const origSet = DeskDB.set.bind(DeskDB);
  const origChange = DeskDB.change.bind(DeskDB);
  DeskDB.set = function (name, key, value) {
    if (name === 'tools-forms-filler' && key === 'draft') {
      return Promise.reject(new DOMException('quota', 'QuotaExceededError'));
    }
    return origSet(name, key, value);
  };
  DeskDB.change = function (name, keys, mutate) {
    if (name === 'tools-forms-filler' && keys && keys.indexOf('draft') !== -1) {
      return Promise.reject(new DOMException('quota', 'QuotaExceededError'));
    }
    return origChange(name, keys, mutate);
  };
});
await quota.choose('#formDrop', PDF);
await quota.page.waitForFunction(() => /could not store/.test((document.getElementById('readStatus') || {}).textContent || ''), null, { timeout: 30000 });
check('a failed store is told in the status', /could not store/.test(await quota.page.locator('#readStatus').innerText()), await quota.page.locator('#readStatus').innerText());
await quota.context.close();

const photo = await boot();
await photo.page.goto('http://127.0.0.1:8765/tools/forms-filler/?photo=' + Date.now(), { waitUntil: 'domcontentloaded' });
await photo.click('#profileToggle');
photo.prompts.push('Ada Lane');
await photo.click('#profileAdd');
await photo.page.locator('#factKey').selectOption('name');
interactions += 1;
await photo.page.locator('#factValue').fill('Ada Lane');
interactions += 1;
await photo.click('#factAdd');
await photo.page.waitForFunction(() => document.querySelector('#profileFacts input[aria-label="name"]'));
await photo.choose('#formDrop', FOOD);
const foodStatus = await photo.ready();
check('the food photo is ready for placement', /Place a missing line/.test(foodStatus), foodStatus);
await photo.click('#placeMissing');
await photo.page.waitForURL(/pdf-editor/);
await photo.page.waitForFunction(() => /Ada Lane/.test((document.getElementById('recoverPerson') || {}).innerText || ''));
if (await photo.page.locator('#recoverBar').isHidden()) await photo.click('#assistToggle');
await photo.page.locator('#recoverFact').selectOption({ label: 'name: Ada Lane' });
interactions += 1;
await photo.click('#recoverPlace');
const layer = photo.page.locator('#pages .layer').first();
const box = await layer.boundingBox();
interactions += 1;
await layer.click({ position: { x: Math.round(box.width * 0.4), y: Math.round(box.height * 0.3) } });
await photo.page.waitForFunction(() => /Placed Ada Lane/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
if (await photo.page.locator('#mapBox').isHidden()) await photo.click('#mapToggle');
await photo.page.locator('#mapName').fill('Food lines');
interactions += 1;
await photo.click('#mapSave');
await photo.page.waitForFunction(() => /Saved /.test((document.getElementById('recoverStatus') || {}).textContent || ''));
const vault = await photo.page.evaluate(() => DeskDB.get('tools-forms-maps', 'vault'));
const dumped = JSON.stringify(vault);
check('the stored map has a sheet and no person or filename', /"sheet"/.test(dumped) && !/Ada|wellcome|Harbour|profileId/.test(dumped), dumped.slice(0, 240));

await photo.page.goBack();
interactions += 1;
const foodBack = await photo.ready();
const foodLabel = await photo.page.locator('#formLabel').innerText();
check('back restores the food photo', /wellcome|food|bounded/i.test(foodLabel) && /Place a missing line|No lines/.test(foodBack), foodLabel + ' || ' + foodBack);
await photo.choose('#formDrop', FOOD);
await photo.ready();
await photo.click('#placeMissing');
await photo.page.waitForURL(/pdf-editor/);
await photo.page.waitForSelector('#mapToggle', { state: 'visible' });
if (await photo.page.locator('#mapBox').isHidden()) await photo.click('#mapToggle');
await photo.page.waitForFunction(() => (document.getElementById('mapPick') || {}).innerText);
const sameMaps = await photo.page.locator('#mapPick option').allInnerTexts();
check('the same photo finds the map after a new sheet pdf', sameMaps.some((text) => /Food lines/.test(text)), sameMaps.join(' | '));

await photo.page.goBack();
interactions += 1;
await photo.ready();
await photo.click('#profileToggle');
photo.prompts.push('Bea Shore');
await photo.click('#profileAdd');
await photo.page.locator('#profilePick').selectOption({ label: 'Bea Shore' });
interactions += 1;
await photo.page.locator('#factKey').selectOption('name');
interactions += 1;
await photo.page.locator('#factValue').fill('Bea Shore');
interactions += 1;
await photo.click('#factAdd');
await photo.page.waitForFunction(() => {
  const input = document.querySelector('#profileFacts input[aria-label="name"]');
  return input && input.value === 'Bea Shore';
});
await photo.click('#placeMissing');
await photo.page.waitForURL(/pdf-editor/);
await photo.page.waitForFunction(() => /Bea Shore/.test((document.getElementById('recoverPerson') || {}).innerText || ''));
if (await photo.page.locator('#recoverBar').isHidden()) await photo.click('#assistToggle');
await photo.page.locator('#recoverPerson').selectOption({ label: 'Bea Shore' });
interactions += 1;
await photo.page.locator('#recoverRole').selectOption('patient');
interactions += 1;
if (await photo.page.locator('#mapBox').isHidden()) await photo.click('#mapToggle');
await photo.click('#mapPreview');
await photo.page.waitForFunction(() => /Preview only|different sheet|not the same file/.test((document.getElementById('mapPreviewText') || {}).textContent || ''));
const preview = await photo.page.locator('#mapPreviewText').innerText();
check('a role change does not skip the sheet check', /Preview only/.test(preview) && /applicant/.test(preview) && !/Ada/.test(preview), preview);
await photo.click('#mapApply');
await photo.page.waitForFunction(() => document.querySelectorAll('#pages .ann-body').length >= 1);
const applied = await photo.page.locator('.ann-body').allInnerTexts();
check('the second person is written and Ada is not', applied.some((text) => /Bea Shore/.test(text)) && !applied.some((text) => /Ada/.test(text)), applied.join(' | '));

await photo.page.goBack();
interactions += 1;
await photo.ready();
await photo.choose('#formDrop', REENCODED);
await photo.ready();
await photo.click('#placeMissing');
await photo.page.waitForURL(/pdf-editor/);
if (await photo.page.locator('#mapBox').isHidden()) await photo.click('#mapToggle');
await photo.page.waitForFunction(() => (document.getElementById('mapPick') || {}).innerText);
const recoded = await photo.page.locator('#mapPick option').allInnerTexts();
check('a re-encoded photo is not the saved file', !recoded.some((text) => /Food lines/.test(text)), recoded.join(' | '));

await photo.page.goBack();
interactions += 1;
await photo.page.waitForSelector('#formDrop');
await photo.choose('#formDrop', OTHER);
await photo.ready();
await photo.click('#placeMissing');
await photo.page.waitForURL(/pdf-editor/);
if (await photo.page.locator('#mapBox').isHidden()) await photo.click('#mapToggle');
await photo.page.waitForFunction(() => (document.getElementById('mapPick') || {}).innerText);
const other = await photo.page.locator('#mapPick option').allInnerTexts();
check('a different photo is refused', !other.some((text) => /Food lines/.test(text)), other.join(' | '));

const out = {
  interactions,
  passed: checks.filter((item) => item.ok).length,
  failed: checks.filter((item) => !item.ok).length,
  checks
};
writeFileSync('/workspace/research/forms-filler/visual-e2e/results/draft-lifecycle.json', JSON.stringify(out, null, 2));
console.log('SUMMARY', out.passed, '/', checks.length, 'interactions', interactions);
await browser.close();
if (out.failed) process.exit(1);
