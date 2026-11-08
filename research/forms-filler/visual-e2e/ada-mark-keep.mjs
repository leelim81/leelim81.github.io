/** Ada's placed name stays stored when Bea is shown, and comes back when Ada is current.
 *  The unchanged export-overflow.mjs file is not edited. */
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { chromium } = pkg;
const WORD = 'SupercalifragilisticexpialidociousSupercalifragilisticexpialidocious';
const ADDR = '14 Harbour Lane beside the long west warehouse and the south gate';
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 400) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 240) : ''));
}
const doc = await PDFDocument.create();
const sheet = doc.addPage([612, 792]);
const font = await doc.embedFont(StandardFonts.Helvetica);
sheet.drawRectangle({ x: 72, y: 500.6, width: 360, height: 1, color: rgb(0, 0, 0) });
sheet.drawText('Rule', { x: 72, y: 506, size: 12, font });
const file = '/tmp/ada-mark-keep.pdf';
writeFileSync(file, await doc.save());
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const ui = await context.newPage();
ui.setDefaultTimeout(30000);
let pendingName = 'Ada Lane';
ui.on('dialog', (dialog) => dialog.accept(pendingName));
async function snap(label) {
  return ui.evaluate(async (name) => {
    const texts = Array.from(document.querySelectorAll('.ann-body')).map((node) => node.innerText);
    const person = (document.getElementById('recoverPerson') || {}).selectedOptions;
    const who = person && person[0] ? person[0].textContent : '';
    const session = window.DeskDB ? await DeskDB.get('tools-forms-editor', 'session') : null;
    function brief(list) {
      return (list || []).map((ann) => (ann.personName || ann.profileId || 'unowned') + ':' + String(ann.text || '').slice(0, 40));
    }
    const pages = ((session && session.pages) || []).map((page) => brief(page.annotations));
    const held = ((session && session.withheld) || []).map((page) => brief(page.annotations));
    return { label: name, who, rendered: texts, pages, held };
  }, label);
}
await ui.goto('http://127.0.0.1:8777/tools/forms-filler/?ada=' + Date.now(), { waitUntil: 'domcontentloaded' });
await ui.evaluate(() => indexedDB.deleteDatabase('forms-filler'));
await ui.reload({ waitUntil: 'domcontentloaded' });
await ui.click('#profileToggle');
await ui.click('#profileAdd');
await ui.waitForFunction(() => document.getElementById('profilePick').options.length > 0);
async function addFact(key, value) {
  await ui.locator('#factKey').selectOption(key);
  await ui.locator('#factValue').fill(value);
  await ui.click('#factAdd');
  await ui.waitForFunction((wanted) => Array.from(document.querySelectorAll('#profileFacts input')).some((input) => input.value === wanted), value);
}
await addFact('name', 'Ada Lane');
await addFact('address', ADDR);
await addFact('postal', WORD);
pendingName = 'Bea Shore';
await ui.click('#profileAdd');
await ui.waitForFunction(() => document.getElementById('profilePick').options.length > 1);
await ui.locator('#profilePick').selectOption({ index: 1 });
await addFact('name', 'Bea Shore');
await addFact('postal', WORD + 'ZZ');
await ui.locator('#profilePick').selectOption({ index: 0 });
const chooser = ui.waitForEvent('filechooser');
await ui.click('#formDrop');
await (await chooser).setFiles(file);
await ui.waitForFunction(() => document.getElementById('placeMissing') && !document.getElementById('placeMissing').disabled);
await ui.click('#placeMissing');
await ui.waitForURL(/pdf-editor/);
await ui.waitForFunction(() => document.querySelector('#pages .layer'));
async function arm(value) {
  if (await ui.locator('#recoverBar').isHidden()) await ui.click('#assistToggle');
  await ui.waitForFunction(() => document.getElementById('recoverFact').options.length > 0);
  const picked = await ui.evaluate((wanted) => {
    const fact = document.getElementById('recoverFact');
    const opt = Array.from(fact.options).find((item) => item.dataset.value === wanted);
    if (!opt) return false;
    fact.value = opt.value;
    return true;
  }, value);
  if (!picked) throw new Error('missing ' + value);
  await ui.click('#recoverPlace');
}
async function clickPage(fx, fy) {
  const before = await ui.locator('#recoverStatus').innerText();
  const layer = ui.locator('#pages .layer').first();
  const box = await layer.boundingBox();
  await layer.click({ position: { x: Math.max(4, box.width * fx), y: Math.max(4, box.height * fy) } });
  await ui.waitForFunction((prev) => /Placed /.test((document.getElementById('recoverStatus') || {}).textContent || '') && (document.getElementById('recoverStatus') || {}).textContent !== prev, before);
}
await arm('Ada Lane');
await clickPage(0.2, (792 - 500.6) / 792);
await arm(WORD);
await clickPage(0.58, 0.4);
const placed = await snap('ada-placed');
if (await ui.locator('#mapBox').isHidden()) await ui.click('#mapToggle');
await ui.locator('#mapName').fill('Ada keep map');
await ui.click('#mapSave');
await ui.waitForFunction(() => /Saved /.test((document.getElementById('recoverStatus') || {}).textContent || ''));
await ui.locator('#recoverPerson').selectOption({ label: 'Bea Shore' });
await ui.click('#mapApply');
await ui.waitForFunction(() => /Applied /.test((document.getElementById('recoverStatus') || {}).textContent || ''));
await ui.waitForTimeout(250);
const beaShown = await snap('bea-applied');
await ui.locator('#recoverPerson').selectOption({ label: 'Ada Lane' });
await ui.waitForTimeout(250);
const adaBack = await snap('ada-current');
await ui.reload({ waitUntil: 'domcontentloaded' });
await ui.waitForSelector('.ann-body');
await ui.waitForTimeout(300);
const reloaded = await snap('reloaded');
const rendered = reloaded.rendered.join(' | ');
const held = JSON.stringify(reloaded.held);
check('Ada placed name is on the page before the other person is applied', placed.rendered.some((text) => /Ada Lane/.test(text)), JSON.stringify(placed));
check('while Bea is current, Ada is withheld rather than deleted', /Ada Lane/.test(JSON.stringify(beaShown.held)) && beaShown.rendered.some((text) => /Bea Shore/.test(text)) && !beaShown.rendered.some((text) => /Ada Lane/.test(text)), JSON.stringify(beaShown));
check('switching back to Ada renders Ada and withholds Bea', adaBack.who === 'Ada Lane' && adaBack.rendered.some((text) => /Ada Lane/.test(text)) && !adaBack.rendered.some((text) => /Bea Shore/.test(text)), JSON.stringify(adaBack));
check('reload keeps Ada on the page and Bea in the stored withheld list', reloaded.who === 'Ada Lane' && /Ada Lane/.test(rendered) && !/Bea Shore/.test(rendered) && /Bea Shore/.test(held), JSON.stringify(reloaded));
console.log('STAGES', JSON.stringify({ placed, beaShown, adaBack, reloaded }, null, 2));
writeFileSync('/tmp/ada-mark-keep.json', JSON.stringify({ passed: checks.filter((item) => item.ok).length, failed: checks.filter((item) => !item.ok).length, checks, placed, beaShown, adaBack, reloaded }, null, 2));
console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
