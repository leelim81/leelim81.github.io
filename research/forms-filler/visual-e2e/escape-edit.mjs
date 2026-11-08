/** Escape leaves a focused mark without discarding its text. Ctrl+Z while editing stays native.
 *  After Escape, Ctrl+Z undoes the annotation. Viewport 390 by 700. This is not a phone. */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { inflateSync } from 'zlib';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 500) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 260) : ''));
}
function decode(buf) {
  const raw = Buffer.from(buf).toString('latin1');
  const out = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = re.exec(raw))) {
    const chunk = Buffer.from(match[1], 'latin1');
    try { out.push(inflateSync(chunk)); } catch (err) { out.push(chunk); }
  }
  const body = Buffer.concat(out).toString('latin1');
  return [...body.matchAll(/<([0-9A-Fa-f\s]+)>/g)].map((item) => Buffer.from(item[1].replace(/\s+/g, ''), 'hex').toString('utf8')).join(' | ');
}
const doc = await PDFDocument.create();
doc.addPage([612, 792]).drawText('Full name', { x: 72, y: 700, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
writeFileSync('/tmp/escape-blank.pdf', await doc.save());
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 700 }, acceptDownloads: true })).newPage();
page.setDefaultTimeout(20000);
await page.goto('http://127.0.0.1:8777/tools/pdf-editor/?esc=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.evaluate(() => ['tools-forms-editor', 'tools-forms-profiles'].forEach((name) => indexedDB.deleteDatabase(name)));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  const loaded = await FormProfiles.load();
  const now = new Date().toISOString();
  const vault = loaded.vault;
  ['Ada Lane', 'Bea Shore'].forEach((name) => {
    vault.profiles.push({ id: name === 'Ada Lane' ? 'ada' : 'bea', name: name, createdAt: now, updatedAt: now, facts: [] });
  });
  await FormProfiles.persist(vault);
});
await page.locator('#fileInput').setInputFiles('/tmp/escape-blank.pdf');
await page.waitForFunction(() => document.querySelector('#pages .layer'));
await page.evaluate(() => { document.documentElement.style.zoom = '1.5'; });
await page.locator('#assistToggle').click();
await page.waitForFunction(() => document.getElementById('recoverPerson').options.length >= 2);
await page.locator('#recoverPerson').selectOption({ label: 'Ada Lane' });
await page.locator('#addText').focus();
await page.keyboard.press('Enter');
await page.keyboard.type('Ada Secret');
await page.keyboard.press('Escape');
await page.locator('#recoverPerson').selectOption({ label: 'Bea Shore' });
await page.waitForFunction(() => !Array.from(document.querySelectorAll('.ann-body')).some((node) => /Ada Secret/.test(node.innerText)));
await page.locator('#addText').focus();
await page.keyboard.press('Enter');
await page.keyboard.type('Bea Note');
const native = await page.evaluate(() => {
  const undo = document.getElementById('recoverUndo').disabled;
  const count = document.querySelectorAll('.ann').length;
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
  return {
    editing: document.activeElement.classList.contains('ann-body'),
    count,
    countAfter: document.querySelectorAll('.ann').length,
    undo,
    undoAfter: document.getElementById('recoverUndo').disabled,
    text: document.activeElement.innerText
  };
});
check('a synthetic Ctrl+Z only checks routing and does not undo the annotation', native.editing && native.countAfter === native.count && native.undo === native.undoAfter && /Bea Note/.test(native.text), JSON.stringify(native));
const ime = await page.evaluate(() => {
  const body = document.activeElement;
  body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 229, which: 229, isComposing: true, bubbles: true, cancelable: true }));
  const during = document.activeElement.classList.contains('ann-body') && /Bea Note/.test(document.activeElement.innerText);
  body.dispatchEvent(new CompositionEvent('compositionend', { data: '测', bubbles: true }));
  return { during, id: document.activeElement && document.activeElement.id, editing: document.activeElement.classList.contains('ann-body'), text: document.querySelector('.ann-body') && document.querySelector('.ann-body').innerText };
});
check('a composing Escape and its composition end stay in the mark', ime.during && ime.editing && /Bea Note/.test(ime.text || ''), JSON.stringify(ime));
await page.locator('.ann-body').last().focus();
await page.keyboard.type(' OK');
await page.keyboard.press('Escape');
const left = await page.evaluate(() => ({
  id: document.activeElement && document.activeElement.id,
  editing: !!(document.activeElement && document.activeElement.isContentEditable),
  text: Array.from(document.querySelectorAll('.ann-body')).map((node) => node.innerText).join('|')
}));
check('Escape leaves editing with the current text and focus on Text', left.id === 'addText' && !left.editing && /Bea Note/.test(left.text) && /OK/.test(left.text) && !/Ada Secret/.test(left.text), JSON.stringify(left));
await page.screenshot({ path: '/tmp/escape-after-focus.png' });
await page.locator('#downloadBtn').focus();
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.getElementById('downloadModal').contains(document.activeElement));
await page.keyboard.press('Escape');
const dialog = await page.evaluate(() => ({ hidden: document.getElementById('downloadModal').hidden, id: document.activeElement && document.activeElement.id }));
check('Escape still closes Download and returns to Download', dialog.hidden && dialog.id === 'downloadBtn', JSON.stringify(dialog));
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelector('#sizeOptions button[data-level="100"]:not([disabled])'));
await page.locator('#sizeOptions button[data-level="100"]').focus();
const download = page.waitForEvent('download');
await page.keyboard.press('Enter');
await (await download).saveAs('/tmp/escape-out.pdf');
const pdf = decode(readFileSync('/tmp/escape-out.pdf'));
check('the rendered PDF has Bea and not Ada', pdf.includes('Bea Note') && !pdf.includes('Ada Secret'), pdf.slice(0, 160));
await page.keyboard.press('Escape');
await page.keyboard.press('Control+z');
await page.waitForTimeout(250);
const undone = await page.evaluate(() => Array.from(document.querySelectorAll('.ann-body')).map((node) => node.innerText));
check('Ctrl+Z after Escape undoes Bea and does not reveal Ada', undone.length === 0, undone.join('|'));
await page.locator('#recoverPerson').selectOption({ label: 'Ada Lane' });
await page.waitForFunction(() => Array.from(document.querySelectorAll('.ann-body')).some((node) => /Ada Secret/.test(node.innerText)));
await page.waitForFunction(() => document.getElementById('saveState').textContent === 'Saved');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Array.from(document.querySelectorAll('.ann-body')).some((node) => /Ada Secret/.test(node.innerText)));
const back = await page.evaluate(() => Array.from(document.querySelectorAll('.ann-body')).map((node) => node.innerText));
check('reload returns only Ada', back.some((text) => /Ada Secret/.test(text)) && !back.some((text) => /Bea Note/.test(text)), back.join('|'));
console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
