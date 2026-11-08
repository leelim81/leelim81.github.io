/** Try the sample must cancel a reference that is still reading.
 *  The sample's own files then finish, and a reload does not bring the cancelled file back. */
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 400) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 240) : ''));
}
const doc = await PDFDocument.create();
doc.addPage([612, 792]).drawText('Name Ada Example lives on this reference page today', { x: 72, y: 720, size: 14, font: await doc.embedFont(StandardFonts.Helvetica) });
writeFileSync('/tmp/sample-cancel-ref.pdf', await doc.save());
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ui = await (await browser.newContext({ viewport: { width: 390, height: 700 } })).newPage();
ui.setDefaultTimeout(20000);
await ui.goto('http://127.0.0.1:8822/tools/forms-filler/?sample=' + Date.now(), { waitUntil: 'domcontentloaded' });
await ui.evaluate(() => ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-maps', 'tools-forms-editor'].forEach((name) => indexedDB.deleteDatabase(name)));
await ui.reload({ waitUntil: 'domcontentloaded' });
await ui.waitForFunction(() => window.FormDesk && window.FormExtract && FormExtract.trace);
await ui.evaluate(() => {
  window.__ffReadBudgetMs = 30000;
  window.__stall = { destroyed: 0, wraps: 0 };
  window.__ffWrapDocument = function (task) {
    window.__stall.wraps += 1;
    if (window.__stall.wraps > 1) return task;
    let rejectP;
    const promise = new Promise((_, reject) => { rejectP = reject; });
    return {
      promise,
      destroy() {
        window.__stall.destroyed += 1;
        try { task.destroy(); } catch (err) {}
        try { rejectP(new Error('destroyed')); } catch (err) {}
      }
    };
  };
});
await ui.locator('#refInput').setInputFiles('/tmp/sample-cancel-ref.pdf');
await ui.waitForFunction(() => {
  const row = FormDesk.refs()[0];
  return row && row.status === 'reading' && FormExtract.trace().spatialInflight === 1;
});
const before = await ui.evaluate(() => ({ stall: window.__stall, trace: FormExtract.trace(), refs: FormDesk.refs() }));
check('a reference stays on Reading while its PDF load is held', before.refs.length === 1 && before.refs[0].status === 'reading' && before.stall.destroyed === 0 && before.trace.spatialInflight === 1, JSON.stringify(before));
const started = Date.now();
await ui.click('#sampleBtn');
await ui.waitForFunction(() => {
  const refs = FormDesk.refs();
  return window.__stall.destroyed >= 1 && refs.length === 2 && refs.every((item) => item.status && item.status !== 'reading');
});
const after = await ui.evaluate(() => ({
  ms: 0,
  stall: window.__stall,
  trace: FormExtract.trace(),
  refs: FormDesk.refs(),
  people: []
}));
after.ms = Date.now() - started;
const names = after.refs.map((item) => item.name + ':' + item.status).join('|');
check('Try the sample destroys the held load and finishes its own two files', after.stall.destroyed >= 1 && after.trace.spatialInflight === 0 && after.ms < 8000 && /visitor-reference\.pdf:(ready|empty)/.test(names) && /id-card\.png:(ready|empty)/.test(names) && !/sample-cancel-ref/.test(names), JSON.stringify(after));
await ui.screenshot({ path: '/tmp/main-now/research/forms-filler/visual-e2e/results/sample-cancel-after.png' });
await ui.reload({ waitUntil: 'domcontentloaded' });
await ui.waitForFunction(() => FormDesk.refs().length === 2 && FormDesk.refs().every((item) => item.status !== 'reading'));
const reloaded = await ui.evaluate(() => FormDesk.refs().map((item) => item.name + ':' + item.status));
check('reload keeps the sample papers and not the cancelled reference', reloaded.length === 2 && reloaded.every((item) => !/sample-cancel-ref/.test(item)) && reloaded.some((item) => item.indexOf('visitor-reference.pdf') === 0) && reloaded.some((item) => item.indexOf('id-card.png') === 0), reloaded.join('|'));
await ui.evaluate(() => {
  window.__ffReadBudgetMs = 30000;
  window.__stall = { destroyed: 0, wraps: 0 };
  window.__ffWrapDocument = function (task) { window.__stall.wraps += 1; return task; };
});
await ui.click('#sampleBtn');
await ui.click('#sampleBtn');
await ui.waitForFunction(() => FormDesk.refs().length === 2 && FormDesk.refs().every((item) => item.status && item.status !== 'reading') && FormExtract.trace().spatialInflight === 0);
const twice = await ui.evaluate(() => FormDesk.refs().map((item) => item.name));
check('clicking Try the sample twice leaves one pair of sample files', twice.filter((name) => name === 'visitor-reference.pdf').length === 1 && twice.filter((name) => name === 'id-card.png').length === 1 && twice.length === 2, twice.join('|'));

const real = await PDFDocument.create();
const realFont = await real.embedFont(StandardFonts.Helvetica);
real.addPage([612, 792]).drawText('Real form for Ada Lane', { x: 72, y: 720, size: 16, font: realFont });
writeFileSync('/tmp/real-form.pdf', await real.save());

let freshContext = null;
async function freshPage() {
  if (freshContext) await freshContext.close();
  freshContext = await browser.newContext();
  const page = await freshContext.newPage();
  page.setDefaultTimeout(20000);
  await page.goto('http://127.0.0.1:8822/tools/forms-filler/?intent=' + Date.now() + Math.random(), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-maps', 'tools-forms-editor'].forEach((name) => indexedDB.deleteDatabase(name)));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.FormDesk && window.FormFields && window.DeskDB);
  return page;
}
async function holdSampleFetch(page) {
  await page.evaluate(() => {
    const orig = window.fetch.bind(window);
    window.__earlyResolvers = [];
    window.__holdEarly = true;
    window.__sampleFetches = 0;
    window.fetch = function (url, opts) {
      const sample = String(url).indexOf('samples/') !== -1;
      if (!sample) return orig(url, opts);
      window.__sampleFetches += 1;
      if (!window.__holdEarly) return orig(url, opts);
      return new Promise((resolve, reject) => {
        window.__earlyResolvers.push(() => orig(url, opts).then(resolve, reject));
      });
    };
  });
}
async function releaseSampleFetch(page) {
  await page.evaluate(() => {
    window.__holdEarly = false;
    window.__earlyResolvers.splice(0).forEach((run) => run());
  });
}
async function holdSampleRead(page) {
  await page.evaluate(() => {
    const orig = FormFields.read.bind(FormFields);
    let armed = true;
    FormFields.read = function (bytes, progress) {
      if (!armed) return orig(bytes, progress);
      armed = false;
      return new Promise((resolve, reject) => {
        window.__releaseRead = () => orig(bytes, progress).then(resolve, reject);
      });
    };
  });
}
async function storedDesk(page) {
  return page.evaluate(async () => {
    const draft = await DeskDB.get('tools-forms-filler', 'draft');
    return {
      form: draft && draft.formName || '',
      refs: ((draft && draft.refs) || []).map((item) => item.name)
    };
  });
}
function sampleNames(names) {
  return names.some((name) => /visitor-reference|id-card/.test(name));
}

const clearPage = await freshPage();
await holdSampleFetch(clearPage);
await clearPage.click('#sampleBtn');
await clearPage.waitForFunction(() => window.__earlyResolvers && window.__earlyResolvers.length >= 1);
await clearPage.click('#clearBtn');
await clearPage.waitForFunction(() => /Started over/.test((document.getElementById('readStatus') || {}).textContent || ''));
await releaseSampleFetch(clearPage);
await clearPage.waitForFunction(() => window.__sampleFetches >= 3);
await clearPage.waitForTimeout(1200);
const cleared = await clearPage.evaluate(() => ({
  label: document.getElementById('formLabel').textContent,
  refs: FormDesk.refs().map((item) => item.name)
}));
check('Start over during the sample fetch keeps the cleared desk', !/visitor-form/.test(cleared.label) && !sampleNames(cleared.refs), JSON.stringify(cleared));
await clearPage.reload({ waitUntil: 'domcontentloaded' });
await clearPage.waitForTimeout(400);
const clearedStore = await storedDesk(clearPage);
check('the cancelled sample is not stored after Start over', !clearedStore.form && !sampleNames(clearedStore.refs), JSON.stringify(clearedStore));

const formPage = await freshPage();
await holdSampleFetch(formPage);
await formPage.click('#sampleBtn');
await formPage.waitForFunction(() => window.__earlyResolvers && window.__earlyResolvers.length >= 1);
await formPage.locator('#formInput').setInputFiles('/tmp/real-form.pdf');
await formPage.waitForFunction(() => /real-form\.pdf/.test(document.getElementById('formLabel').textContent || ''));
await releaseSampleFetch(formPage);
await formPage.waitForFunction(() => window.__sampleFetches >= 3);
await formPage.waitForTimeout(1200);
const keptForm = await formPage.evaluate(() => ({
  label: document.getElementById('formLabel').textContent,
  refs: FormDesk.refs().map((item) => item.name)
}));
check('a real form chosen while the sample is fetching stays on the desk', /real-form\.pdf/.test(keptForm.label) && !sampleNames(keptForm.refs), JSON.stringify(keptForm));
await formPage.reload({ waitUntil: 'domcontentloaded' });
await formPage.waitForFunction(() => /real-form\.pdf/.test(document.getElementById('formLabel').textContent || ''));
const keptFormStore = await storedDesk(formPage);
check('reload keeps the real form and not the sample papers', /real-form\.pdf/.test(keptFormStore.form) && !sampleNames(keptFormStore.refs), JSON.stringify(keptFormStore));

const refPage = await freshPage();
await holdSampleFetch(refPage);
await refPage.click('#sampleBtn');
await refPage.waitForFunction(() => window.__earlyResolvers && window.__earlyResolvers.length >= 1);
await refPage.locator('#refInput').setInputFiles('/tmp/sample-cancel-ref.pdf');
await refPage.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'sample-cancel-ref.pdf' && item.status !== 'reading'));
await releaseSampleFetch(refPage);
await refPage.waitForFunction(() => window.__sampleFetches >= 3);
await refPage.waitForTimeout(1200);
const keptRef = await refPage.evaluate(() => ({
  label: document.getElementById('formLabel').textContent,
  refs: FormDesk.refs().map((item) => item.name + ':' + item.status)
}));
check('a real reference chosen while the sample is fetching is not replaced', keptRef.refs.length === 1 && /sample-cancel-ref\.pdf:(ready|empty)/.test(keptRef.refs[0]) && !/visitor-form/.test(keptRef.label), JSON.stringify(keptRef));
await refPage.reload({ waitUntil: 'domcontentloaded' });
await refPage.waitForFunction(() => FormDesk.refs().length === 1 && FormDesk.refs()[0].status !== 'reading');
const keptRefStore = await storedDesk(refPage);
check('reload keeps that reference and does not bring the sample back', keptRefStore.refs.length === 1 && keptRefStore.refs[0] === 'sample-cancel-ref.pdf' && !keptRefStore.form.includes('visitor'), JSON.stringify(keptRefStore));

const second = await freshPage();
await holdSampleFetch(second);
await second.click('#sampleBtn');
await second.waitForFunction(() => window.__earlyResolvers && window.__earlyResolvers.length >= 1);
await second.evaluate(() => { window.__holdEarly = false; });
await second.click('#sampleBtn');
await second.waitForFunction(() => {
  const refs = FormDesk.refs();
  return refs.length === 2 && refs.every((item) => item.status && item.status !== 'reading');
});
await releaseSampleFetch(second);
await second.waitForTimeout(1200);
const secondRefs = await second.evaluate(() => FormDesk.refs().map((item) => item.name + ':' + item.status));
check('an older sample fetch cannot replace the later sample', secondRefs.length === 2 && secondRefs.every((item) => !/:reading$/.test(item)) && secondRefs.filter((item) => item.startsWith('visitor-reference.pdf')).length === 1 && secondRefs.filter((item) => item.startsWith('id-card.png')).length === 1, secondRefs.join('|'));

const readClear = await freshPage();
await holdSampleRead(readClear);
await readClear.click('#sampleBtn');
await readClear.waitForFunction(() => typeof window.__releaseRead === 'function');
await readClear.click('#clearBtn');
await readClear.waitForFunction(() => /Started over/.test((document.getElementById('readStatus') || {}).textContent || ''));
await readClear.evaluate(() => window.__releaseRead());
await readClear.waitForTimeout(1200);
const readCleared = await readClear.evaluate(() => ({
  label: document.getElementById('formLabel').textContent,
  refs: FormDesk.refs().map((item) => item.name)
}));
check('Start over during the sample form read keeps the cleared desk', !/visitor-form/.test(readCleared.label) && !sampleNames(readCleared.refs), JSON.stringify(readCleared));
await readClear.reload({ waitUntil: 'domcontentloaded' });
await readClear.waitForTimeout(300);
const readClearedStore = await storedDesk(readClear);
check('the sample form read does not store itself after Start over', !readClearedStore.form && !sampleNames(readClearedStore.refs), JSON.stringify(readClearedStore));

const readForm = await freshPage();
await holdSampleRead(readForm);
await readForm.click('#sampleBtn');
await readForm.waitForFunction(() => typeof window.__releaseRead === 'function');
await readForm.locator('#formInput').setInputFiles('/tmp/real-form.pdf');
await readForm.waitForFunction(() => /real-form\.pdf/.test(document.getElementById('formLabel').textContent || ''));
await readForm.evaluate(() => window.__releaseRead());
await readForm.waitForTimeout(1200);
const readKept = await readForm.evaluate(() => ({
  label: document.getElementById('formLabel').textContent,
  refs: FormDesk.refs().map((item) => item.name)
}));
check('a real form opened while the sample form is reading stays put', /real-form\.pdf/.test(readKept.label) && !sampleNames(readKept.refs), JSON.stringify(readKept));
await readForm.reload({ waitUntil: 'domcontentloaded' });
await readForm.waitForFunction(() => /real-form\.pdf/.test(document.getElementById('formLabel').textContent || ''));
const readKeptStore = await storedDesk(readForm);
check('reload stores the real form instead of the sample', /real-form\.pdf/.test(readKeptStore.form) && !sampleNames(readKeptStore.refs), JSON.stringify(readKeptStore));

const readRef = await freshPage();
await holdSampleRead(readRef);
await readRef.click('#sampleBtn');
await readRef.waitForFunction(() => typeof window.__releaseRead === 'function');
await readRef.locator('#refInput').setInputFiles('/tmp/sample-cancel-ref.pdf');
await readRef.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'sample-cancel-ref.pdf' && item.status !== 'reading'));
await readRef.evaluate(() => window.__releaseRead());
await readRef.waitForTimeout(1200);
const readRefKept = await readRef.evaluate(() => ({
  label: document.getElementById('formLabel').textContent,
  refs: FormDesk.refs().map((item) => item.name + ':' + item.status)
}));
check('a reference added while the sample form is reading is not cleared', readRefKept.refs.length === 1 && /sample-cancel-ref\.pdf:(ready|empty)/.test(readRefKept.refs[0]) && !/visitor-form/.test(readRefKept.label), JSON.stringify(readRefKept));
await readRef.reload({ waitUntil: 'domcontentloaded' });
await readRef.waitForFunction(() => FormDesk.refs().length === 1);
const readRefStore = await storedDesk(readRef);
check('reload keeps that reference after the late sample read', readRefStore.refs.length === 1 && readRefStore.refs[0] === 'sample-cancel-ref.pdf' && !String(readRefStore.form).includes('visitor'), JSON.stringify(readRefStore));

async function holdFirstDraftWrite(page) {
  await page.evaluate(() => {
    window.__moved = false;
    window.__staleWrites = 0;
    window.__expectGone = false;
    window.__expectRef = false;
    const origPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (key === 'draft') {
        const note = value && value.formName ? value.formName + '/' + (value.refs || []).map((item) => item.name).join('+') : String(value);
        const notes = JSON.parse(sessionStorage.getItem('ff-puts') || '[]');
        notes.push(note);
        sessionStorage.setItem('ff-puts', JSON.stringify(notes));
        if (window.__moved && value && value.formName === 'visitor-form.pdf') {
          const names = (value.refs || []).map((item) => item.name);
          const missingRef = window.__expectRef && names.indexOf('sample-cancel-ref.pdf') < 0;
          if (window.__expectGone || missingRef) window.__staleWrites += 1;
        }
      }
      return origPut.call(this, value, key);
    };
    const origChange = DeskDB.change.bind(DeskDB);
    const origSet = DeskDB.set.bind(DeskDB);
    let armed = true;
    function arm(name, run) {
      if (armed && name === 'tools-forms-filler') {
        armed = false;
        return new Promise((resolve, reject) => {
          window.__releaseDb = () => run().then(resolve, reject);
        });
      }
      return run();
    }
    DeskDB.change = function (name, keys, mutate) {
      return arm(name, () => origChange(name, keys, mutate));
    };
    DeskDB.set = function (name, key, value) {
      return arm(name, () => origSet(name, key, value));
    };
  });
}

const dbClear = await freshPage();
await holdFirstDraftWrite(dbClear);
await dbClear.evaluate(() => { window.__expectGone = true; });
await dbClear.click('#sampleBtn');
await dbClear.waitForFunction(() => typeof window.__releaseDb === 'function');
await dbClear.click('#clearBtn');
await dbClear.waitForFunction(() => /Clearing the stored form/.test((document.getElementById('readStatus') || {}).textContent || ''));
await dbClear.evaluate(() => { window.__moved = true; return window.__releaseDb(); });
await dbClear.waitForFunction(() => /Started over/.test((document.getElementById('readStatus') || {}).textContent || ''));
const dbClearWrites = await dbClear.evaluate(() => window.__staleWrites);
check('a delayed database write does not store the sample after Start over', dbClearWrites === 0, String(dbClearWrites));
await dbClear.reload({ waitUntil: 'domcontentloaded' });
await dbClear.waitForTimeout(300);
const dbClearStore = await storedDesk(dbClear);
check('reload after that delayed write is still an empty desk', !dbClearStore.form && !sampleNames(dbClearStore.refs), JSON.stringify(dbClearStore));

const dbForm = await freshPage();
await holdFirstDraftWrite(dbForm);
await dbForm.evaluate(() => { window.__expectGone = true; });
await dbForm.click('#sampleBtn');
await dbForm.waitForFunction(() => typeof window.__releaseDb === 'function');
await dbForm.locator('#formInput').setInputFiles('/tmp/real-form.pdf');
await dbForm.waitForFunction(() => /Reading real-form\.pdf/.test((document.getElementById('readStatus') || {}).textContent || ''));
await dbForm.evaluate(() => { window.__moved = true; return window.__releaseDb(); });
await dbForm.waitForFunction(() => /real-form\.pdf/.test(document.getElementById('formLabel').textContent || ''));
for (let i = 0; i < 25; i++) {
  const ready = await dbForm.evaluate(async () => {
    const draft = await DeskDB.get('tools-forms-filler', 'draft');
    return !!(draft && draft.formName === 'real-form.pdf');
  });
  if (ready) break;
  await dbForm.waitForTimeout(200);
}
const dbFormWrites = await dbForm.evaluate(() => window.__staleWrites);
check('a delayed database write does not store the sample over a new form', dbFormWrites === 0, String(dbFormWrites));
await dbForm.reload({ waitUntil: 'domcontentloaded' });
await dbForm.waitForFunction(() => /real-form\.pdf/.test(document.getElementById('formLabel').textContent || ''));
const dbFormStore = await storedDesk(dbForm);
check('reload keeps the new form after the delayed sample write', /real-form\.pdf/.test(dbFormStore.form) && !sampleNames(dbFormStore.refs), JSON.stringify(dbFormStore));

const dbRef = await freshPage();
await holdFirstDraftWrite(dbRef);
await dbRef.evaluate(() => { window.__expectRef = true; });
await dbRef.click('#sampleBtn');
await dbRef.waitForFunction(() => typeof window.__releaseDb === 'function');
await dbRef.locator('#refInput').setInputFiles('/tmp/sample-cancel-ref.pdf');
await dbRef.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'sample-cancel-ref.pdf' && item.status !== 'reading'));
await dbRef.evaluate(() => { window.__moved = true; return window.__releaseDb(); });
await dbRef.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'sample-cancel-ref.pdf'), null, { timeout: 20000 });
for (let i = 0; i < 25; i++) {
  const ready = await dbRef.evaluate(async () => {
    const draft = await DeskDB.get('tools-forms-filler', 'draft');
    return !!(draft && (draft.refs || []).some((item) => item.name === 'sample-cancel-ref.pdf'));
  });
  if (ready) break;
  await dbRef.waitForTimeout(200);
}
const dbRefWrites = await dbRef.evaluate(() => window.__staleWrites);
const dbRefLive = await dbRef.evaluate(() => FormDesk.refs().map((item) => item.name));
check('a delayed database write does not drop a reference added while it was opening', dbRefWrites === 0 && dbRefLive.indexOf('sample-cancel-ref.pdf') >= 0 && !sampleNames(dbRefLive), dbRefWrites + ' ' + dbRefLive.join('|'));
await dbRef.reload({ waitUntil: 'domcontentloaded' });
await dbRef.waitForTimeout(1500);
const dbRefStore = await storedDesk(dbRef);
const dbRefUi = await dbRef.evaluate(() => window.FormDesk ? FormDesk.refs().map((item) => item.name) : ['no-desk']);
const dbRefNotes = await dbRef.evaluate(() => sessionStorage.getItem('ff-puts'));
check('reload keeps that reference after the delayed sample write', dbRefUi.indexOf('sample-cancel-ref.pdf') >= 0 && dbRefStore.refs.indexOf('sample-cancel-ref.pdf') >= 0 && !sampleNames(dbRefStore.refs), JSON.stringify({ store: dbRefStore, ui: dbRefUi, puts: dbRefNotes }));

const dbSecond = await freshPage();
await holdFirstDraftWrite(dbSecond);
await dbSecond.click('#sampleBtn');
await dbSecond.waitForFunction(() => typeof window.__releaseDb === 'function');
await dbSecond.evaluate(() => { window.__moved = true; });
await dbSecond.click('#sampleBtn');
await dbSecond.evaluate(() => window.__releaseDb());
await dbSecond.waitForFunction(() => {
  const refs = FormDesk.refs();
  return refs.length === 2 && refs.every((item) => item.status && item.status !== 'reading');
});
for (let i = 0; i < 25; i++) {
  const ready = await dbSecond.evaluate(async () => {
    const draft = await DeskDB.get('tools-forms-filler', 'draft');
    const names = draft && draft.refs ? draft.refs.map((item) => item.name) : [];
    return names.indexOf('visitor-reference.pdf') >= 0 && names.indexOf('id-card.png') >= 0;
  });
  if (ready) break;
  await dbSecond.waitForTimeout(200);
}
const dbSecondWrites = await dbSecond.evaluate(() => window.__staleWrites);
const dbSecondLive = await dbSecond.evaluate(() => FormDesk.refs().map((item) => item.name));
check('a second sample finishes after the first sample’s delayed database write', dbSecondWrites === 0 && dbSecondLive.filter((name) => name === 'visitor-reference.pdf').length === 1 && dbSecondLive.filter((name) => name === 'id-card.png').length === 1, dbSecondLive.join('|'));
await dbSecond.reload({ waitUntil: 'domcontentloaded' });
await dbSecond.waitForFunction(() => FormDesk.refs().length === 2 && FormDesk.refs().every((item) => item.status !== 'reading'));
const dbSecondStore = await storedDesk(dbSecond);
check('reload keeps the later sample after the delayed first write', dbSecondStore.refs.filter((name) => name === 'visitor-reference.pdf').length === 1 && dbSecondStore.refs.filter((name) => name === 'id-card.png').length === 1 && dbSecondStore.refs.length === 2, JSON.stringify(dbSecondStore));

writeFileSync('/tmp/main-now/research/forms-filler/visual-e2e/results/sample-cancel.json', JSON.stringify({ passed: checks.filter((item) => item.ok).length, failed: checks.filter((item) => !item.ok).length, checks }, null, 2));
console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
