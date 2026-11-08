/** Undo and an empty person switch keep each person's marks on their own page. */
import { readFileSync, writeFileSync } from 'fs';
import { inflateSync } from 'zlib';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument } = require('pdf-lib');
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 400) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 240) : ''));
}
const doc = await PDFDocument.create();
doc.addPage([612, 792]);
writeFileSync('/tmp/person-undo.pdf', await doc.save());
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
const ui = await context.newPage();
ui.setDefaultTimeout(30000);
let pendingName = 'Ada Lane';
ui.on('dialog', (dialog) => dialog.accept(pendingName));
async function snap() {
  return ui.evaluate(async () => {
    const session = window.DeskDB ? await DeskDB.get('tools-forms-editor', 'session') : null;
    function brief(list) {
      return (list || []).map((ann) => String(ann.text || '').slice(0, 40));
    }
    return {
      who: ((document.getElementById('recoverPerson') || {}).selectedOptions || [])[0] ? document.getElementById('recoverPerson').selectedOptions[0].textContent : '',
      rendered: Array.from(document.querySelectorAll('.ann-body')).map((node) => node.innerText),
      pages: ((session && session.pages) || []).map((page) => brief(page.annotations)),
      held: ((session && session.withheld) || []).map((page) => brief(page.annotations))
    };
  });
}
async function openPeople() {
  await ui.goto('http://127.0.0.1:8777/tools/forms-filler/?undo=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await ui.evaluate(() => {
    ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-maps', 'tools-forms-editor'].forEach((name) => indexedDB.deleteDatabase(name));
  });
  await ui.reload({ waitUntil: 'domcontentloaded' });
  await ui.click('#profileToggle');
  pendingName = 'Ada Lane';
  await ui.click('#profileAdd');
  await ui.waitForFunction(() => document.getElementById('profilePick').options.length > 0);
  pendingName = 'Bea Shore';
  await ui.click('#profileAdd');
  await ui.waitForFunction(() => document.getElementById('profilePick').options.length > 1);
  await ui.locator('#profilePick').selectOption({ index: 0 });
  const chooser = ui.waitForEvent('filechooser');
  await ui.click('#formDrop');
  await (await chooser).setFiles('/tmp/person-undo.pdf');
  await ui.waitForFunction(() => document.getElementById('placeMissing') && !document.getElementById('placeMissing').disabled);
  await ui.click('#placeMissing');
  await ui.waitForURL(/pdf-editor/);
  await ui.waitForFunction(() => document.querySelector('#pages .layer'));
}
async function choosePerson(label) {
  if (await ui.locator('#recoverBar').isHidden()) await ui.click('#assistToggle');
  await ui.locator('#recoverPerson').selectOption({ label });
}
async function typeMark(text) {
  await ui.click('#addText');
  const body = ui.locator('.ann.selected .ann-body');
  await body.click();
  await ui.keyboard.type(text);
  await ui.keyboard.press('Escape');
  await ui.waitForFunction((wanted) => Array.from(document.querySelectorAll('.ann-body')).some((node) => node.innerText.indexOf(wanted) >= 0), text);
}
function pdfText(path) {
  const raw = readFileSync(path).toString('latin1');
  const parts = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = re.exec(raw))) {
    const chunk = Buffer.from(match[1], 'latin1');
    try { parts.push(inflateSync(chunk).toString('latin1')); } catch (err) { parts.push(chunk.toString('latin1')); }
  }
  return parts.join('\n') + raw;
}
async function downloadText() {
  await ui.click('#downloadBtn');
  await ui.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
  const dl = ui.waitForEvent('download');
  await ui.locator('#sizeOptions button[data-level="100"]').click();
  const path = '/tmp/person-undo-out-' + Date.now() + '.pdf';
  await (await dl).saveAs(path);
  await ui.click('#dlClose');
  return pdfText(path);
}
await openPeople();
await typeMark('Ada Only');
await choosePerson('Bea Shore');
await ui.waitForFunction(() => !Array.from(document.querySelectorAll('.ann-body')).some((node) => /Ada Only/.test(node.innerText)));
await choosePerson('Ada Lane');
await ui.waitForFunction(() => Array.from(document.querySelectorAll('.ann-body')).some((node) => /Ada Only/.test(node.innerText)));
const restoredNow = await snap();
await ui.waitForFunction(() => /Saved/.test((document.getElementById('saveState') || {}).textContent || ''));
await ui.reload({ waitUntil: 'domcontentloaded' });
await ui.waitForSelector('.ann-body');
const restoredReload = await snap();
check('switching back from an empty person redraws and reloads the withheld marks', /Ada Only/.test(restoredNow.rendered.join(' ')) && restoredNow.who === 'Ada Lane' && /Ada Only/.test(restoredReload.rendered.join(' ')) && /Ada Only/.test(JSON.stringify(restoredReload.pages)), JSON.stringify({ restoredNow, restoredReload }));

await choosePerson('Ada Lane');
await typeMark('Ada Two');
await choosePerson('Bea Shore');
await ui.click('#recoverUndo');
await ui.waitForFunction(() => /Undid/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
const undoUnderBea = await snap();
const exportUnderBea = await downloadText();
await ui.reload({ waitUntil: 'domcontentloaded' });
await ui.waitForSelector('#pages .layer');
const reloadUnderBea = await snap();
check('undo while Bea is current does not render or export Ada', !/Ada/.test(undoUnderBea.rendered.join(' ')) && !/Ada/.test(exportUnderBea) && !/Ada/.test(reloadUnderBea.rendered.join(' ')) && reloadUnderBea.who === 'Bea Shore', JSON.stringify({ undoUnderBea, reloadUnderBea }));
await choosePerson('Ada Lane');
await ui.waitForFunction(() => Array.from(document.querySelectorAll('.ann-body')).some((node) => /Ada Only/.test(node.innerText)));
const adaAfterUndo = await snap();
check('switching back after that undo returns only the remaining Ada mark', /Ada Only/.test(adaAfterUndo.rendered.join(' ')) && !/Ada Two/.test(adaAfterUndo.rendered.join(' ')) && !/Bea/.test(adaAfterUndo.rendered.join(' ')), JSON.stringify(adaAfterUndo));

await choosePerson('Bea Shore');
await typeMark('Bea One');
await typeMark('Bea Two');
await choosePerson('Ada Lane');
await ui.click('#recoverUndo');
await ui.waitForFunction(() => /Undid/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
const undoUnderAda = await snap();
check('undo while Ada is current does not render Bea', /Ada Only/.test(undoUnderAda.rendered.join(' ')) && !/Bea/.test(undoUnderAda.rendered.join(' ')), JSON.stringify(undoUnderAda));
await choosePerson('Bea Shore');
await ui.waitForFunction(() => Array.from(document.querySelectorAll('.ann-body')).some((node) => /Bea One/.test(node.innerText)));
const beaAfterUndo = await snap();
const exportUnderAdaSide = await downloadText();
function marksText(buf, text) {
  const raw = Buffer.isBuffer(buf) ? buf.toString('latin1') : String(buf);
  return raw.includes(text) || raw.toLowerCase().includes(Buffer.from(text).toString('hex'));
}
check('switching back after that undo returns only the remaining Bea mark', /Bea One/.test(beaAfterUndo.rendered.join(' ')) && !/Bea Two/.test(beaAfterUndo.rendered.join(' ')) && !/Ada/.test(beaAfterUndo.rendered.join(' ')) && marksText(exportUnderAdaSide, 'Bea One') && !marksText(exportUnderAdaSide, 'Ada Only') && !marksText(exportUnderAdaSide, 'Bea Two'), JSON.stringify(beaAfterUndo) + ' export Bea=' + marksText(exportUnderAdaSide, 'Bea One') + ' Ada=' + marksText(exportUnderAdaSide, 'Ada Only'));
console.log('UNDO', JSON.stringify({ restoredNow, undoUnderBea, adaAfterUndo, beaAfterUndo }));
writeFileSync('/tmp/person-undo.json', JSON.stringify({ passed: checks.filter((item) => item.ok).length, failed: checks.filter((item) => !item.ok).length, checks }, null, 2));
console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
