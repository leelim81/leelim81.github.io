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
writeFileSync('/tmp/main-now/research/forms-filler/visual-e2e/results/sample-cancel.json', JSON.stringify({ passed: checks.filter((item) => item.ok).length, failed: checks.filter((item) => !item.ok).length, checks }, null, 2));
console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
