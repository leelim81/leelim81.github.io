/** A map click belongs to the person, document, and panel it started with.
 *  Viewport 1280 by 900. This is not a phone. */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 500) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 300) : ''));
}
async function makePdf(path, label) {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]).drawText(label, { x: 72, y: 700, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
  writeFileSync(path, await doc.save());
}
await makePdf('/tmp/map-intent.pdf', 'Line label');
await makePdf('/tmp/map-intent-next.pdf', 'Next label');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

async function editorReady(label) {
  const prompts = ['Ada Lane', 'Bea Shore'];
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })).newPage();
  page.setDefaultTimeout(20000);
  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'prompt') await dialog.accept(prompts.shift() || 'Ada Lane');
    else await dialog.accept();
  });
  async function addFact(key, value) {
    await page.locator('#factKey').selectOption(key);
    await page.locator('#factValue').fill(value);
    await page.click('#factAdd');
    await page.waitForFunction((wanted) => Array.from(document.querySelectorAll('#profileFacts input')).some((input) => input.value === wanted), value);
  }
  await page.goto('http://127.0.0.1:8777/tools/forms-filler/?intent=' + label + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-maps', 'tools-forms-editor', 'tools-edit-sign-pdf'].forEach((name) => indexedDB.deleteDatabase(name)));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.click('#profileToggle');
  await page.click('#profileAdd');
  await page.waitForFunction(() => /Ada Lane/.test((document.getElementById('profilePick') || {}).innerText || ''));
  await addFact('name', 'Ada Lane');
  await addFact('address', '14 Harbour Lane');
  await page.click('#profileAdd');
  await page.waitForFunction(() => /Bea Shore/.test((document.getElementById('profilePick') || {}).innerText || ''));
  await page.locator('#profilePick').selectOption({ label: 'Bea Shore' });
  await addFact('name', 'Bea Shore');
  await addFact('address', '8 Pier Street');
  await page.goto('http://127.0.0.1:8777/tools/pdf-editor/?sheet=' + label + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.locator('#fileInput').setInputFiles('/tmp/map-intent.pdf');
  await page.waitForSelector('#pages canvas', { state: 'visible' });
  if (await page.locator('#recoverBar').isHidden()) await page.click('#assistToggle');
  await page.locator('#recoverPerson').selectOption({ label: 'Ada Lane' });
  await page.waitForFunction(() => /14 Harbour Lane/.test((document.getElementById('recoverFact') || {}).innerText || ''));
  async function place(factLabel, x, y) {
    await page.locator('#recoverFact').selectOption({ label: factLabel });
    await page.click('#recoverPlace');
    await page.waitForFunction(() => /Click the page/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
    const layer = page.locator('#pages .layer').first();
    const box = await layer.boundingBox();
    await layer.click({ position: { x: Math.round(box.width * x), y: Math.round(box.height * y) } });
    await page.waitForFunction(() => /Placed Ada Lane/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
  }
  await place('name: Ada Lane', 0.32, 0.30);
  await place('address: 14 Harbour Lane', 0.36, 0.46);
  if (await page.locator('#mapBox').isHidden()) await page.click('#mapToggle');
  await page.locator('#mapName').fill('Line places');
  await page.click('#mapSave');
  await page.waitForFunction(() => /Saved Line places/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
  await page.locator('#recoverPerson').selectOption({ label: 'Bea Shore' });
  await page.waitForFunction(() => /8 Pier Street/.test((document.getElementById('recoverFact') || {}).innerText || '') && document.querySelectorAll('#pages .ann').length === 0);
  return page;
}
async function hold(page) {
  await page.evaluate(() => {
    const real = window.FormProfiles.load.bind(window.FormProfiles);
    const queue = [];
    window.__heldLoads = () => queue.length;
    window.__releaseLoad = () => {
      const item = queue.shift();
      if (!item) return Promise.resolve();
      item.run();
      return item.finished;
    };
    window.FormProfiles.load = function () {
      const result = real();
      let finish;
      const finished = new Promise((resolve) => { finish = resolve; });
      const caller = new Promise((resolve, reject) => {
        queue.push({
          finished,
          run() {
            result.then((value) => {
              resolve(value);
              Promise.resolve().then(finish);
            }, (err) => {
              reject(err);
              Promise.resolve().then(finish);
            });
          }
        });
      });
      return caller;
    };
  });
}
async function release(page) {
  await page.evaluate(() => window.__releaseLoad());
}
async function marks(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#pages .ann')).map((el) => ((el.querySelector('.ann-body') || {}).innerText || '').replace(/\u00a0/g, ' ')));
}
async function status(page) {
  return page.locator('#recoverStatus').innerText();
}

const person = await editorReady('person');
const adaMarks = ['Ada Lane', '14 Harbour Lane'];
await hold(person);
await person.click('#mapApply');
await person.waitForFunction(() => window.__heldLoads() >= 1);
await person.locator('#recoverPerson').selectOption({ label: 'Ada Lane' });
await person.waitForFunction(() => document.querySelectorAll('#pages .ann').length === 2);
await release(person);
const personMarks = await marks(person);
check('a pending apply does not add marks after the person changes', personMarks.join(' | ') === adaMarks.join(' | ') && !/Applied /.test(await status(person)), personMarks.join(' | ') + ' || ' + await status(person));
await person.close();

const doc = await editorReady('doc');
await hold(doc);
await doc.click('#mapApply');
await doc.waitForFunction(() => window.__heldLoads() >= 1);
await doc.locator('#fileInput').setInputFiles('/tmp/map-intent-next.pdf');
await doc.waitForFunction(() => /map-intent-next/.test((document.getElementById('fileName') || {}).textContent || ''));
await release(doc);
const docMarks = await marks(doc);
check('a pending apply does not write the old map onto the new document', docMarks.length === 0 && /map-intent-next/.test(await doc.locator('#fileName').innerText()) && !/Applied /.test(await status(doc)), docMarks.join(' | ') + ' || ' + await status(doc));
await doc.close();

const panel = await editorReady('panel');
await hold(panel);
await panel.click('#mapApply');
await panel.waitForFunction(() => window.__heldLoads() >= 1);
await panel.click('#assistToggle');
await panel.click('#assistToggle');
await release(panel);
const panelMarks = await marks(panel);
check('a pending apply does not write after the panel is closed and opened', panelMarks.length === 0 && !/Applied /.test(await status(panel)), panelMarks.join(' | ') + ' || ' + await status(panel));
await panel.close();

const over = await editorReady('over');
await hold(over);
await over.click('#mapApply');
await over.waitForFunction(() => window.__heldLoads() >= 1);
await over.click('#startOver');
await release(over);
await over.waitForSelector('#empty:not([hidden])');
check('a pending apply does not leave marks after Start over', (await marks(over)).length === 0 && await over.locator('#empty').isVisible() && !/Applied /.test(await status(over)), await status(over));
await over.reload({ waitUntil: 'domcontentloaded' });
await over.waitForSelector('#empty:not([hidden])');
check('reload after that Start over stays empty', await over.locator('#pages .ann').count() === 0 && await over.locator('#empty').isVisible());
await over.close();

const preview = await editorReady('preview');
await hold(preview);
await preview.click('#mapPreview');
await preview.waitForFunction(() => window.__heldLoads() >= 1);
await preview.locator('#recoverPerson').selectOption({ label: 'Ada Lane' });
await release(preview);
const previewText = await preview.locator('#mapPreviewText').innerText();
check('a pending preview does not replace the status after the person changes', previewText === '' && !/Preview only/.test(await status(preview)) && (await marks(preview)).join(' | ') === adaMarks.join(' | '), previewText + ' || ' + await status(preview));
await preview.close();

const once = await editorReady('once');
const before = await marks(once);
await once.click('#mapApply');
await once.waitForFunction(() => (document.getElementById('recoverStatus') || {}).textContent.indexOf('Applied 2 place(s) for Bea Shore as applicant.') === 0);
const applied = await marks(once);
check('one apply writes exactly Bea’s two values', applied.join(' | ') === 'Bea Shore | 8 Pier Street', applied.join(' | '));
const appliedGen = await once.locator('#saveState').getAttribute('data-gen');
await once.click('#downloadBtn');
await once.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
const appliedDownload = once.waitForEvent('download');
await once.locator('#sizeOptions button[data-level="100"]').click();
await (await appliedDownload).saveAs('/tmp/map-intent-applied.pdf');
await once.locator('#dlClose').click();
await once.waitForFunction(() => document.getElementById('downloadModal').hidden);
const undoGen = await once.locator('#saveState').getAttribute('data-gen');
await once.click('#recoverUndo');
await once.waitForFunction(() => (document.getElementById('recoverStatus') || {}).textContent === 'Undid the last placement change.');
await once.waitForFunction((prev) => {
  const el = document.getElementById('saveState');
  return !!(el && el.textContent === 'Saved' && Number(el.dataset.gen || 0) > Number(prev || 0));
}, undoGen || appliedGen || '0');
const undone = await marks(once);
check('one undo restores the exact pre-apply marks', JSON.stringify(undone) === JSON.stringify(before), undone.join(' | '));
await once.reload({ waitUntil: 'domcontentloaded' });
await once.waitForFunction(() => /map-intent\.pdf/.test((document.getElementById('fileName') || {}).textContent || '') && (document.getElementById('saveState') || {}).textContent === 'Saved');
await once.waitForFunction(() => {
  const pick = document.getElementById('recoverPerson');
  return !!(pick && pick.selectedOptions[0] && pick.selectedOptions[0].textContent === 'Bea Shore');
});
const reloaded = await marks(once);
check('reload keeps the undone page and Bea', JSON.stringify(reloaded) === JSON.stringify(before), reloaded.join(' | '));
await once.click('#downloadBtn');
await once.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
const undoneDownload = once.waitForEvent('download');
await once.locator('#sizeOptions button[data-level="100"]').click();
await (await undoneDownload).saveAs('/tmp/map-intent-undone.pdf');
async function pdfText(file) {
  const bytes = Array.from(readFileSync(file));
  const probe = await browser.newPage();
  await probe.goto('http://127.0.0.1:8777/tools/forms-filler/?pdf=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await probe.waitForFunction(() => window.pdfjsLib);
  const text = await probe.evaluate(async (list) => {
    const opened = await pdfjsLib.getDocument({ data: new Uint8Array(list) }).promise;
    const content = await (await opened.getPage(1)).getTextContent();
    return content.items.map((item) => item.str).join(' ');
  }, bytes);
  await probe.close();
  return text.replace(/\s+/g, ' ').trim();
}
const appliedPdf = await pdfText('/tmp/map-intent-applied.pdf');
const undonePdf = await pdfText('/tmp/map-intent-undone.pdf');
check('the applied PDF has Bea’s values and not Ada’s', /Bea Shore/.test(appliedPdf) && /8 Pier Street/.test(appliedPdf) && !/Ada Lane/.test(appliedPdf) && !/Harbour/.test(appliedPdf), appliedPdf);
check('the undone PDF has neither person’s placed values', !/Bea Shore/.test(undonePdf) && !/Pier/.test(undonePdf) && !/Ada Lane/.test(undonePdf) && !/Harbour/.test(undonePdf) && /Line label/.test(undonePdf), undonePdf);
await once.close();

console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
