/** A long typed line keeps its characters when the preview wraps. Viewport 390 by 700. This is not a phone. */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { inflateSync } from 'zlib';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { chromium } = pkg;
const LINE = 'one two three four five six seven eight nine ten eleven twelve';
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 500) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 320) : ''));
}
function flat(value) { return String(value || '').replace(/\u00a0/g, ' ').replace(/\n$/, ''); }
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
  return [...body.matchAll(/<([0-9A-Fa-f\s]+)>/g)].map((item) => Buffer.from(item[1].replace(/\s+/g, ''), 'hex').toString('utf8')).join(' ');
}
const doc = await PDFDocument.create();
doc.addPage([612, 792]).drawText('Full name', { x: 72, y: 700, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
writeFileSync('/tmp/long-blank.pdf', await doc.save());
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 390, height: 700 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
page.setDefaultTimeout(20000);
await page.goto('http://127.0.0.1:8777/tools/pdf-editor/?long=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.evaluate(() => indexedDB.deleteDatabase('tools-forms-editor'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('#fileInput').setInputFiles('/tmp/long-blank.pdf');
await page.waitForFunction(() => document.querySelector('#pages .layer'));
await page.locator('#addText').click();
await page.locator('.ann-body').click();
const boxBefore = await page.locator('.ann').evaluate((el) => ({ left: el.style.left, top: el.style.top, width: el.style.width }));
await page.keyboard.type(LINE);
const typed = flat(await page.locator('.ann-body').innerText());
const wrapped = await page.locator('.ann').evaluate((el) => ({
  body: el.querySelector('.ann-body').innerText.replace(/\u00a0/g, ' ').replace(/\n$/, ''),
  mirror: el.querySelector('.ann-mirror').textContent,
  left: el.style.left,
  top: el.style.top,
  width: el.style.width
}));
check('a long line keeps every character in order', typed === LINE && wrapped.body === LINE, JSON.stringify(typed));
check('the preview wraps without copying those breaks into the typed text', wrapped.mirror.indexOf('\n') >= 0 && wrapped.body.indexOf('\n') < 0, JSON.stringify(wrapped.mirror));
check('typing does not move the box', wrapped.left === boxBefore.left && wrapped.top === boxBefore.top && wrapped.width === boxBefore.width, JSON.stringify({ boxBefore, wrapped }));
await page.keyboard.press('Control+Home');
for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
await page.keyboard.type('X');
check('a character inserted after the first word stays there', flat(await page.locator('.ann-body').innerText()) === 'one Xtwo three four five six seven eight nine ten eleven twelve', flat(await page.locator('.ann-body').innerText()));
await page.keyboard.press('Control+z');
check('Ctrl+Z removes that inserted character', flat(await page.locator('.ann-body').innerText()) === LINE, flat(await page.locator('.ann-body').innerText()));
await page.keyboard.press('Control+Shift+z');
check('Ctrl+Shift+Z restores the inserted character', flat(await page.locator('.ann-body').innerText()) === 'one Xtwo three four five six seven eight nine ten eleven twelve', flat(await page.locator('.ann-body').innerText()));
await page.keyboard.press('Control+z');
await page.keyboard.press('Control+Home');
await page.keyboard.press('Control+Shift+ArrowRight');
await page.keyboard.type('ONLY');
check('typing over the selected first word replaces only that word', flat(await page.locator('.ann-body').innerText()) === 'ONLY two three four five six seven eight nine ten eleven twelve', flat(await page.locator('.ann-body').innerText()));
await page.keyboard.press('Control+z');
const oneUndo = flat(await page.locator('.ann-body').innerText());
check('Ctrl+Z removes the last character of the replacement', oneUndo === 'ONL two three four five six seven eight nine ten eleven twelve', oneUndo);
for (let i = 0; i < 3; i++) await page.keyboard.press('Control+z');
check('further Ctrl+Z restores the replaced word', flat(await page.locator('.ann-body').innerText()) === LINE, flat(await page.locator('.ann-body').innerText()));
await page.keyboard.press('Control+End');
await page.keyboard.press('Shift+Enter');
await page.keyboard.type('Next');
check('a real newline stays at the end of the long line', flat(await page.locator('.ann-body').innerText()) === LINE + '\nNext', JSON.stringify(flat(await page.locator('.ann-body').innerText())));
await page.keyboard.press('ArrowLeft');
await page.evaluate(async () => { await navigator.clipboard.writeText('Paste'); });
await page.keyboard.press('Control+v');
check('a paste in the second line keeps both lines', flat(await page.locator('.ann-body').innerText()) === LINE + '\nNexPastet', JSON.stringify(flat(await page.locator('.ann-body').innerText())));
await page.keyboard.press('Control+z');
check('Ctrl+Z removes the paste and leaves the newline', flat(await page.locator('.ann-body').innerText()) === LINE + '\nNext', JSON.stringify(flat(await page.locator('.ann-body').innerText())));
await page.keyboard.press('Control+End');
await page.evaluate(() => document.activeElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
const during = await page.evaluate(() => ({
  editing: document.activeElement.classList.contains('ann-body'),
  stored: document.querySelector('.ann-body').innerText
}));
await page.keyboard.type('Q');
await page.evaluate(() => document.activeElement.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'Q' })));
const composed = flat(await page.locator('.ann-body').innerText());
check('composition commits at the caret and stays in the mark', during.editing && composed === LINE + '\nNextQ', JSON.stringify({ during: flat(during.stored), composed }));
await page.keyboard.press('Control+z');
check('Ctrl+Z removes the composed character', flat(await page.locator('.ann-body').innerText()) === LINE + '\nNext', JSON.stringify(flat(await page.locator('.ann-body').innerText())));
const beforeNarrow = await page.locator('.ann').evaluate((el) => ({ left: el.style.left, text: el.querySelector('.ann-body').innerText.replace(/\u00a0/g, ' ').replace(/\n$/, ''), lines: el.querySelector('.ann-mirror').textContent.split('\n').length }));
const handle = page.locator('.ann .handle.se');
const from = await handle.boundingBox();
await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
await page.mouse.down();
await page.mouse.move(from.x - 80, from.y);
await page.mouse.up();
await page.waitForTimeout(200);
const narrowed = await page.locator('.ann').evaluate((el) => ({
  left: el.style.left,
  width: el.style.width,
  text: el.querySelector('.ann-body').innerText.replace(/\u00a0/g, ' ').replace(/\n$/, ''),
  lines: el.querySelector('.ann-mirror').textContent.split('\n').length
}));
check('narrowing the box keeps the text and can add a preview line', narrowed.text === beforeNarrow.text && narrowed.left === beforeNarrow.left && parseFloat(narrowed.width) < parseFloat(boxBefore.width) && narrowed.lines >= beforeNarrow.lines, JSON.stringify({ beforeNarrow, narrowed }));
await page.locator('.ann-body').click();
await page.keyboard.press('Escape');
const rested = await page.locator('.ann').evaluate((el) => ({
  focus: document.activeElement && document.activeElement.id,
  body: el.querySelector('.ann-body').innerText.replace(/\u00a0/g, ' ').replace(/\n$/, ''),
  mirror: el.querySelector('.ann-mirror').textContent
}));
check('Escape leaves the exact text and a wrapped resting preview', rested.focus === 'addText' && rested.body === LINE + '\nNext' && rested.mirror.indexOf('\n') >= 0 && rested.mirror.indexOf('Next') >= 0, JSON.stringify(rested));
await page.locator('#downloadBtn').focus();
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelector('#sizeOptions button[data-level="100"]:not([disabled])'));
await page.locator('#sizeOptions button[data-level="100"]').focus();
const download = page.waitForEvent('download');
await page.keyboard.press('Enter');
await (await download).saveAs('/tmp/long-wrap-out.pdf');
const pdf = decode(readFileSync('/tmp/long-wrap-out.pdf'));
check('the PDF contains the long line and the second line in order', pdf.includes('one two three') && pdf.includes('eleven twelve') && pdf.includes('Next') && !pdf.includes('Xtwo') && !pdf.includes('ONLY'), pdf.slice(0, 240));
await page.keyboard.press('Escape');
await page.waitForFunction(() => document.getElementById('saveState').textContent === 'Saved');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('.ann-body'));
const reloaded = flat(await page.locator('.ann-body').innerText());
check('reload keeps the exact two lines', reloaded === LINE + '\nNext', JSON.stringify(reloaded));
console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
