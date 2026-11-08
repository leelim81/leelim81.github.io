/** The current person's overflow is warned, selected, corrected, exported, and reloaded.
 *  The other person's marks stay withheld and return only when that person is current.
 *  This replaces the two export-overflow checks that expected both people's type on one page. */
import { readFileSync, writeFileSync } from 'fs';
import { inflateSync } from 'zlib';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { chromium } = pkg;
const ADA = 'AdaEdge' + 'X'.repeat(60);
const BEA = 'BeaEdge' + 'Y'.repeat(60);
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 400) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 240) : ''));
}
const doc = await PDFDocument.create();
const sheet = doc.addPage([612, 792]);
const font = await doc.embedFont(StandardFonts.Helvetica);
sheet.drawRectangle({ x: 72, y: 500.6, width: 360, height: 1, color: rgb(0, 0, 0) });
writeFileSync('/tmp/overflow-person.pdf', await doc.save());
writeFileSync('/tmp/overflow-person.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
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
      return (list || []).map((ann) => (ann.personName || ann.type || '') + ':' + String(ann.text || ann.type || '').slice(0, 24));
    }
    return {
      who: document.getElementById('recoverPerson') && document.getElementById('recoverPerson').selectedOptions[0] ? document.getElementById('recoverPerson').selectedOptions[0].textContent : '',
      rendered: Array.from(document.querySelectorAll('.ann-body')).map((node) => node.innerText),
      images: document.querySelectorAll('.ann img').length,
      fit: (document.getElementById('fitNote') || {}).textContent || '',
      pages: ((session && session.pages) || []).map((page) => brief(page.annotations)),
      held: ((session && session.withheld) || []).map((page) => brief(page.annotations))
    };
  });
}
async function addFact(key, value) {
  await ui.locator('#factKey').selectOption(key);
  await ui.locator('#factValue').fill(value);
  await ui.click('#factAdd');
  await ui.waitForFunction((wanted) => Array.from(document.querySelectorAll('#profileFacts input')).some((input) => input.value === wanted), value);
}
async function arm(value) {
  if (await ui.locator('#recoverBar').isHidden()) await ui.click('#assistToggle');
  await ui.waitForFunction(() => document.getElementById('recoverFact').options.length > 0);
  const ok = await ui.evaluate((wanted) => {
    const fact = document.getElementById('recoverFact');
    const opt = Array.from(fact.options).find((item) => item.dataset.value === wanted);
    if (!opt) return false;
    fact.value = opt.value;
    return true;
  }, value);
  if (!ok) throw new Error('missing fact');
  await ui.click('#recoverPlace');
}
async function clickPage(fx, fy) {
  const before = await ui.locator('#recoverStatus').innerText();
  const layer = ui.locator('#pages .layer').first();
  const box = await layer.boundingBox();
  await layer.click({ position: { x: Math.max(4, box.width * fx), y: Math.max(4, box.height * fy) } });
  await ui.waitForFunction((prev) => {
    const text = (document.getElementById('recoverStatus') || {}).textContent || '';
    return text !== prev && /Placed /.test(text);
  }, before);
}
await ui.goto('http://127.0.0.1:8777/tools/forms-filler/?overflow-person=' + Date.now(), { waitUntil: 'domcontentloaded' });
await ui.evaluate(() => ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-maps', 'tools-forms-editor'].forEach((name) => indexedDB.deleteDatabase(name)));
await ui.reload({ waitUntil: 'domcontentloaded' });
await ui.click('#profileToggle');
pendingName = 'Ada Lane';
await ui.click('#profileAdd');
await ui.waitForFunction(() => document.getElementById('profilePick').options.length > 0);
await addFact('name', 'Ada Lane');
await addFact('address', ADA);
pendingName = 'Bea Shore';
await ui.click('#profileAdd');
await ui.waitForFunction(() => document.getElementById('profilePick').options.length > 1);
await ui.locator('#profilePick').selectOption({ index: 1 });
await addFact('name', 'Bea Shore');
await addFact('address', BEA);
await ui.locator('#profilePick').selectOption({ index: 0 });
const chooser = ui.waitForEvent('filechooser');
await ui.click('#formDrop');
await (await chooser).setFiles('/tmp/overflow-person.pdf');
await ui.waitForFunction(() => document.getElementById('placeMissing') && !document.getElementById('placeMissing').disabled);
await ui.click('#placeMissing');
await ui.waitForURL(/pdf-editor/);
await ui.waitForFunction(() => document.querySelector('#pages .layer'));
await arm('Ada Lane');
await clickPage(0.2, (792 - 500.6) / 792);
await arm(ADA);
await clickPage(0.96, 0.4);
await ui.click('#addText');
await ui.locator('.ann.selected .ann-body').click();
await ui.keyboard.type('Ada private note');
await ui.keyboard.press('Escape');
await ui.locator('#imageInput').setInputFiles('/tmp/overflow-person.png');
await ui.waitForFunction(() => document.querySelectorAll('.ann img').length >= 1);
await ui.click('#addSignature');
await ui.click('#tab-type');
await ui.locator('#typeName').fill('Ada Sign');
await ui.click('#sigApply');
await ui.waitForFunction(() => document.querySelectorAll('.ann img').length >= 2);
if (await ui.locator('#mapBox').isHidden()) await ui.click('#mapToggle');
await ui.locator('#mapName').fill('Overflow person map');
await ui.click('#mapSave');
await ui.waitForFunction(() => /Saved /.test((document.getElementById('recoverStatus') || {}).textContent || ''));
const adaPlaced = await snap();
if (await ui.locator('#recoverBar').isHidden()) await ui.click('#assistToggle');
await ui.locator('#recoverPerson').selectOption({ label: 'Bea Shore' });
await ui.click('#mapApply');
await ui.waitForFunction(() => /Applied /.test((document.getElementById('recoverStatus') || {}).textContent || ''));
await ui.waitForTimeout(700);
const beaNow = await snap();
await ui.screenshot({ path: '/tmp/main-0f82d5b/research/forms-filler/visual-e2e/results/overflow-person-bea.png' });
check('while Bea is current the warning and page are Bea only', /BeaEdge/.test(beaNow.rendered.join(' ')) && !/AdaEdge/.test(beaNow.rendered.join(' ')) && !/Ada private note/.test(beaNow.rendered.join(' ')) && beaNow.images === 0 && /BeaEdge/.test(beaNow.fit) && /wider than the page|Move it left/.test(beaNow.fit) && !/AdaEdge/.test(beaNow.fit) && /AdaEdge/.test(JSON.stringify(beaNow.held)), JSON.stringify(beaNow));
if (await ui.locator('#recoverBar').isHidden()) await ui.click('#assistToggle');
await ui.locator('#recoverPerson').selectOption({ label: 'Ada Lane' });
await ui.waitForTimeout(700);
const adaNow = await snap();
await ui.screenshot({ path: '/tmp/main-0f82d5b/research/forms-filler/visual-e2e/results/overflow-person-ada.png' });
check('while Ada is current the warning names Ada and withholds Bea', adaNow.who === 'Ada Lane' && /AdaEdge/.test(adaNow.rendered.join(' ')) && /Ada private note/.test(adaNow.rendered.join(' ')) && adaNow.images === 2 && !/BeaEdge/.test(adaNow.rendered.join(' ')) && /AdaEdge/.test(adaNow.fit) && /wider than the page|Move it left/.test(adaNow.fit) && !/BeaEdge/.test(adaNow.fit), JSON.stringify(adaNow));
await ui.locator('#fitNote button', { hasText: 'Show this text' }).click();
const selected = await ui.locator('.ann.selected .ann-body').innerText();
check('show this text selects Ada overflowing type', selected.indexOf('AdaEdge') === 0, selected.slice(0, 80));
await ui.locator('.ann.selected .ann-body').evaluate((el) => {
  el.focus();
  el.innerText = 'Ada Fixed';
  el.dispatchEvent(new InputEvent('input', { bubbles: true }));
});
await ui.keyboard.press('Escape');
await ui.waitForFunction(() => !/AdaEdge/.test((document.getElementById('fitNote') || {}).textContent || ''));
const corrected = await snap();
check('a manual correction clears Ada warning and does not reveal Bea', /Ada Fixed/.test(corrected.rendered.join(' ')) && !/AdaEdge/.test(corrected.rendered.join(' ')) && !/BeaEdge/.test(corrected.rendered.join(' ')) && !/BeaEdge/.test(corrected.fit), JSON.stringify(corrected));
await ui.click('#downloadBtn');
await ui.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
const warned = await ui.locator('#exportWarn').innerText();
const dl = ui.waitForEvent('download');
await ui.locator('#sizeOptions button[data-level="100"]').click();
await (await dl).saveAs('/tmp/overflow-person-out.pdf');
await ui.click('#dlClose');
function pdfText(path) {
  const raw = readFileSync(path).toString('latin1');
  const parts = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = re.exec(raw))) {
    const chunk = Buffer.from(match[1], 'latin1');
    try { parts.push(inflateSync(chunk).toString('latin1')); } catch (err) { parts.push(chunk.toString('latin1')); }
  }
  return parts.join('\n');
}
const exported = pdfText('/tmp/overflow-person-out.pdf');
function hasText(body, text) {
  return body.includes(text) || body.toLowerCase().includes(Buffer.from(text).toString('hex'));
}
check('the export contains the corrected Ada text and not Bea', hasText(exported, 'Ada Fixed') && hasText(exported, 'Ada private note') && !hasText(exported, 'BeaEdge') && !/BeaEdge/.test(warned), warned.slice(0, 180));
await ui.reload({ waitUntil: 'domcontentloaded' });
await ui.waitForSelector('.ann-body');
await ui.waitForTimeout(300);
const reloaded = await snap();
check('reload keeps Ada correction, note, and pictures and still withholds Bea', /Ada Fixed/.test(reloaded.rendered.join(' ')) && /Ada private note/.test(reloaded.rendered.join(' ')) && reloaded.images === 2 && !/BeaEdge/.test(reloaded.rendered.join(' ')) && /BeaEdge/.test(JSON.stringify(reloaded.held)), JSON.stringify(reloaded));
if (await ui.locator('#recoverBar').isHidden()) await ui.click('#assistToggle');
await ui.locator('#recoverPerson').selectOption({ label: 'Bea Shore' });
await ui.waitForFunction(() => Array.from(document.querySelectorAll('.ann-body')).some((node) => /BeaEdge/.test(node.innerText)));
const beaBack = await snap();
check('switching back to Bea returns Bea and hides Ada', /BeaEdge/.test(beaBack.rendered.join(' ')) && !/Ada Fixed/.test(beaBack.rendered.join(' ')) && beaBack.images === 0, JSON.stringify(beaBack));
if (await ui.locator('#recoverBar').isHidden()) await ui.click('#assistToggle');
await ui.locator('#recoverPerson').selectOption({ label: 'Ada Lane' });
await ui.waitForFunction(() => Array.from(document.querySelectorAll('.ann-body')).some((node) => /Ada Fixed/.test(node.innerText)));
const adaAgain = await snap();
check('switching back to Ada returns the correction, note, and pictures', /Ada Fixed/.test(adaAgain.rendered.join(' ')) && /Ada private note/.test(adaAgain.rendered.join(' ')) && adaAgain.images === 2 && !/BeaEdge/.test(adaAgain.rendered.join(' ')), JSON.stringify(adaAgain));
await ui.goBack();
await ui.waitForURL(/forms-filler/);
await ui.click('#clearBtn');
await ui.waitForFunction(() => /Started over/.test((document.getElementById('readStatus') || {}).textContent || ''));
const cleared = await ui.evaluate(async () => {
  const session = window.DeskDB ? await DeskDB.get('tools-forms-editor', 'session') : null;
  const vault = await FormProfiles.load();
  return { session: session || null, people: vault.vault.profiles.map((profile) => profile.name) };
});
check('start over drops the stored marks and keeps the people', !cleared.session && cleared.people.join(',') === 'Ada Lane,Bea Shore', JSON.stringify(cleared));
writeFileSync('/tmp/main-0f82d5b/research/forms-filler/visual-e2e/results/overflow-person.json', JSON.stringify({ passed: checks.filter((item) => item.ok).length, failed: checks.filter((item) => !item.ok).length, checks }, null, 2));
console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
