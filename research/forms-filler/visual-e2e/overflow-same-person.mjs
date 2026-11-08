/** Two overflowing pieces of the same person each get a Show button and a direction.
 *  The other person's mark stays withheld and is not named in the warning or the export.
 *  The original export-overflow.mjs assertions are unchanged. */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { inflateSync } from 'zlib';
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
function streams(buf) {
  const raw = Buffer.from(buf).toString('latin1');
  const out = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = re.exec(raw))) {
    const chunk = Buffer.from(match[1], 'latin1');
    try { out.push(inflateSync(chunk)); } catch (err) { out.push(chunk); }
  }
  return Buffer.concat(out).toString('latin1');
}
function hasText(body, text) {
  return body.includes(text) || body.toLowerCase().includes(Buffer.from(text).toString('hex'));
}
const doc = await PDFDocument.create();
const sheet = doc.addPage([612, 792]);
const font = await doc.embedFont(StandardFonts.Helvetica);
sheet.drawRectangle({ x: 72, y: 500.6, width: 360, height: 1, color: rgb(0, 0, 0) });
writeFileSync('/tmp/same-person-overflow.pdf', await doc.save());
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
const ui = await context.newPage();
ui.setDefaultTimeout(30000);
let pendingName = 'Ada Lane';
ui.on('dialog', (dialog) => dialog.accept(pendingName));
async function addFact(key, value) {
  await ui.locator('#factKey').selectOption(key);
  await ui.locator('#factValue').fill(value);
  await ui.click('#factAdd');
  await ui.waitForFunction((wanted) => Array.from(document.querySelectorAll('#profileFacts input')).some((input) => input.value === wanted), value);
}
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
  await ui.waitForFunction((prev) => {
    const text = (document.getElementById('recoverStatus') || {}).textContent || '';
    return text !== prev && /Placed /.test(text);
  }, before);
}
await ui.goto('http://127.0.0.1:8777/tools/forms-filler/?same=' + Date.now(), { waitUntil: 'domcontentloaded' });
await ui.evaluate(() => ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-maps', 'tools-forms-editor'].forEach((name) => indexedDB.deleteDatabase(name)));
await ui.reload({ waitUntil: 'domcontentloaded' });
await ui.click('#profileToggle');
pendingName = 'Ada Lane';
await ui.click('#profileAdd');
await ui.waitForFunction(() => document.getElementById('profilePick').options.length > 0);
await addFact('name', 'Ada Lane');
await addFact('address', ADDR);
await addFact('postal', WORD);
pendingName = 'Bea Shore';
await ui.click('#profileAdd');
await ui.waitForFunction(() => document.getElementById('profilePick').options.length > 1);
await ui.locator('#profilePick').selectOption({ index: 0 });
const chooser = ui.waitForEvent('filechooser');
await ui.click('#formDrop');
await (await chooser).setFiles('/tmp/same-person-overflow.pdf');
await ui.waitForFunction(() => document.getElementById('placeMissing') && !document.getElementById('placeMissing').disabled);
await ui.click('#placeMissing');
await ui.waitForURL(/pdf-editor/);
await ui.waitForFunction(() => document.querySelector('#pages .layer'));
await arm('Ada Lane');
await clickPage(0.2, (792 - 500.6) / 792);
await arm(WORD);
await clickPage(0.96, 0.4);
await arm(ADDR);
await clickPage(0.3, 0.9);
await ui.locator('.ann').last().locator('.ann-body').click();
await ui.keyboard.press('End');
for (let i = 0; i < 6; i++) {
  await ui.keyboard.press('Shift+Enter');
  await ui.keyboard.type('Line ' + i);
}
await ui.keyboard.press('Escape');
await ui.waitForFunction(() => {
  const note = document.getElementById('fitNote');
  const buttons = note ? note.querySelectorAll('button').length : 0;
  const text = note ? note.textContent || '' : '';
  return !note.hidden && buttons >= 2 && /pieces of text/.test(text) && /Move it left about \d+ mm/.test(text) && /taller than the page/.test(text);
});
const fit = await ui.locator('#fitNote').innerText();
const fitButtons = await ui.locator('#fitNote button').count();
check('Ada has two overflowing pieces, a leftward distance, and a bottom direction', fitButtons >= 2 && /pieces of text/.test(fit) && /Move it left about \d+ mm/.test(fit) && /taller than the page/.test(fit) && /Supercalifragilistic/.test(fit) && /Harbour Lane/.test(fit), fit.slice(0, 240));
const selected = [];
for (let i = 0; i < fitButtons; i++) {
  await ui.locator('#fitNote button').nth(i).click();
  selected.push(await ui.locator('.ann.selected .ann-body').innerText());
}
check('each Show button selects a different Ada piece', selected.some((text) => text.indexOf('Supercalifragilistic') === 0) && selected.some((text) => /Harbour Lane/.test(text)) && new Set(selected).size >= 2, selected.map((text) => text.slice(0, 40)).join(' || '));
await ui.click('#downloadBtn');
await ui.waitForSelector('#exportWarn:not([hidden])');
const warn = await ui.locator('#exportWarn').innerText();
const warnButtons = await ui.locator('#exportWarn button').count();
const dl = ui.waitForEvent('download');
await ui.locator('#sizeOptions button[data-level="100"]').click();
await (await dl).saveAs('/tmp/same-person-overflow-out.pdf');
await ui.click('#dlClose');
const body = streams(readFileSync('/tmp/same-person-overflow-out.pdf'));
check('the download warning repeats both directions and the export keeps both pieces', warnButtons >= 2 && /pieces of text/.test(warn) && /Move it left about \d+ mm/.test(warn) && /taller than the page/.test(warn) && hasText(body, 'Supercalifragilistic') && hasText(body, 'Harbour Lane') && hasText(body, 'Line 5'), warn.slice(0, 220));
if (await ui.locator('#recoverBar').isHidden()) await ui.click('#assistToggle');
await ui.locator('#recoverPerson').selectOption({ label: 'Bea Shore' });
await ui.click('#addText');
await ui.locator('.ann.selected .ann-body').click();
await ui.keyboard.type('Bea Hidden');
await ui.keyboard.press('Escape');
await ui.waitForFunction(() => Array.from(document.querySelectorAll('.ann-body')).some((node) => /Bea Hidden/.test(node.innerText)));
if (await ui.locator('#recoverBar').isHidden()) await ui.click('#assistToggle');
await ui.locator('#recoverPerson').selectOption({ label: 'Ada Lane' });
await ui.waitForFunction(() => {
  const note = document.getElementById('fitNote');
  const text = note ? note.textContent || '' : '';
  return note && !note.hidden && note.querySelectorAll('button').length >= 2 && /taller than the page/.test(text) && !/Bea Hidden/.test(text);
});
const back = await ui.evaluate(async () => {
  const session = await DeskDB.get('tools-forms-editor', 'session');
  function texts(pages) {
    return (pages || []).flatMap((page) => (page.annotations || []).map((ann) => String(ann.text || '').slice(0, 24)));
  }
  return {
    rendered: Array.from(document.querySelectorAll('.ann-body')).map((node) => node.innerText.slice(0, 40)),
    fit: (document.getElementById('fitNote') || {}).textContent || '',
    pages: texts(session && session.pages),
    held: texts(session && session.withheld)
  };
});
check('Bea is withheld from Ada two-piece warning, page, and saved active marks', !back.rendered.some((text) => /Bea Hidden/.test(text)) && !/Bea Hidden/.test(back.fit) && /Move it left about \d+ mm/.test(back.fit) && /taller than the page/.test(back.fit) && back.pages.some((text) => /Supercalifragilistic/.test(text)) && back.pages.some((text) => /Harbour Lane/.test(text)) && back.held.some((text) => /Bea Hidden/.test(text)), JSON.stringify(back));
await ui.screenshot({ path: '/tmp/main-0f82d5b/research/forms-filler/visual-e2e/results/overflow-same-person-ada.png' });
if (await ui.locator('#recoverBar').isHidden()) await ui.click('#assistToggle');
await ui.locator('#recoverPerson').selectOption({ label: 'Bea Shore' });
await ui.waitForFunction(() => Array.from(document.querySelectorAll('.ann-body')).some((node) => /Bea Hidden/.test(node.innerText)) && !Array.from(document.querySelectorAll('.ann-body')).some((node) => /Supercalifragilistic/.test(node.innerText)));
const bea = await ui.locator('.ann-body').allInnerTexts();
check('switching to Bea returns only Bea and not Ada overflowing pieces', bea.some((text) => /Bea Hidden/.test(text)) && !bea.some((text) => /Supercalifragilistic|Harbour Lane/.test(text)), bea.join(' | ').slice(0, 160));
writeFileSync('/tmp/main-0f82d5b/research/forms-filler/visual-e2e/results/overflow-same-person.json', JSON.stringify({ passed: checks.filter((item) => item.ok).length, failed: checks.filter((item) => !item.ok).length, checks }, null, 2));
console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
