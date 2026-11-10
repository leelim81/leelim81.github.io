/** Synthetic card. The block ends in a pixel letter that the line read treats as a
    digit. A 4-digit house number on a street line is left alone. */
import { readFileSync, writeFileSync } from 'fs';
import { inflateSync } from 'zlib';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts, pushGraphicsState, popGraphicsState, moveTo, appendBezierCurve, closePath, setFillingRgbColor, setStrokingRgbColor, setLineWidth, fillAndStroke } = require('pdf-lib');
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 500) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 280) : ''));
}
function roundedBox(page, x, y, w, h) {
  const radius = Math.min(3, h / 3);
  page.pushOperators(
    pushGraphicsState(),
    setFillingRgbColor(0.93, 0.93, 0.93),
    setStrokingRgbColor(0.75, 0.75, 0.75),
    setLineWidth(0.6),
    moveTo(x + radius, y),
    appendBezierCurve(x + w / 2, y, x + w / 2, y, x + w - radius, y),
    appendBezierCurve(x + w, y, x + w, y, x + w, y + radius),
    appendBezierCurve(x + w, y + h / 2, x + w, y + h / 2, x + w, y + h - radius),
    appendBezierCurve(x + w, y + h, x + w, y + h, x + w - radius, y + h),
    appendBezierCurve(x + w / 2, y + h, x + w / 2, y + h, x + radius, y + h),
    appendBezierCurve(x, y + h, x, y + h, x, y + h - radius),
    appendBezierCurve(x, y + h / 2, x, y + h / 2, x, y + radius),
    appendBezierCurve(x, y, x, y, x + radius, y),
    closePath(),
    fillAndStroke(),
    popGraphicsState()
  );
}
function pdfVisible(file) {
  const raw = readFileSync(file).toString('latin1');
  const streams = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = re.exec(raw))) {
    const chunk = Buffer.from(match[1], 'latin1');
    try { streams.push(inflateSync(chunk)); } catch (err) { streams.push(chunk); }
  }
  const text = Buffer.concat(streams).toString('latin1');
  return [...text.matchAll(/\((?:\\.|[^\\)])*\)|<([0-9A-Fa-f\s]+)>/g)].map((item) => item[1] ? Buffer.from(item[1].replace(/\s+/g, ''), 'hex').toString('utf8') : item[0].slice(1, -1)).join(' | ');
}
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const page = doc.addPage([595.28, 841.89]);
function label(text, x, y) { page.drawText(text, { x: x, y: y, size: 10, font: font }); }
function box(x, y, w) { roundedBox(page, x, y, w, 16); }
label("Applicant's particulars", 36, 750);
label('Full name', 36, 700);
box(36, 672, 280);
label('NRIC', 36, 640);
box(36, 612, 180);
label('Blk', 36, 580);
box(36, 552, 80);
label('Street', 36, 520);
box(36, 492, 240);
writeFileSync('/tmp/glyph-application.pdf', await doc.save());

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const painter = await browser.newPage();
async function paint(file, mode) {
  await painter.setContent('<canvas id="c" width="1500" height="900"></canvas>');
  const url = await painter.evaluate((kind) => {
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f4efe6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#16120e';
    ctx.font = '28px sans-serif';
    ctx.fillText('IDENTITY CARD', 70, 70);
    ctx.font = '22px sans-serif';
    ctx.fillText('Name', 70, 130);
    ctx.font = 'bold 42px sans-serif';
    ctx.fillText('TAN WEI MING', 70, 180);
    ctx.font = '22px sans-serif';
    ctx.fillText('NRIC', 70, 230);
    ctx.font = 'bold 36px monospace';
    ctx.fillText('S8523146D', 70, 275);
    if (kind === 'house') {
      ctx.font = '22px sans-serif';
      ctx.fillText('Name', 70, 180);
      ctx.font = 'bold 54px sans-serif';
      ctx.fillText('TAN WEI MING', 70, 250);
      ctx.font = '22px sans-serif';
      ctx.fillText('NRIC', 70, 340);
      ctx.font = 'bold 48px monospace';
      ctx.fillText('S8523146D', 70, 410);
      ctx.font = 'bold 64px sans-serif';
      ctx.fillText('1234 KING STREET', 70, 530);
      ctx.fillText('SINGAPORE 123456', 70, 620);
      return canvas.toDataURL('image/png');
    }
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText('BLK 1234 EXAMPLE RD', 80, 540);
    ctx.fillText('SINGAPORE 560123', 80, 630);
    return canvas.toDataURL('image/png');
  }, mode);
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
}
await paint('/tmp/glyph-block.png', 'block');
await paint('/tmp/glyph-house.png', 'house');
await painter.close();

async function reviewOf(image, stamp) {
  const desk = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
  desk.setDefaultTimeout(90000);
  await desk.addInitScript(() => { window.__ffReadBudgetMs = 70000; });
  await desk.goto('http://127.0.0.1:8865/tools/forms-filler/?glyph=' + stamp, { waitUntil: 'domcontentloaded' });
  await desk.locator('#formInput').setInputFiles('/tmp/glyph-application.pdf');
  await desk.waitForFunction(() => /Form ready|No lines were found/.test((document.getElementById('readStatus') || {}).textContent || ''));
  await desk.locator('#refInput').setInputFiles(image);
  await desk.waitForFunction(() => {
    const rows = Array.from(document.querySelectorAll('.ref-preview'));
    return rows.length >= 1 && rows.every((row) => row.textContent && row.textContent !== 'Reading…');
  });
  await desk.click('#fillBtn');
  await desk.waitForSelector('#reviewBox:not([hidden])');
  const before = desk.url();
  const typed = await desk.locator('#reviewList input[type="text"]').evaluateAll((els) => els.map((el) => el.value)).catch(() => []);
  const boxes = await desk.locator('#reviewList input[type="checkbox"]').evaluateAll((els) => els.map((el) => el.checked)).catch(() => []);
  const review = ((await desk.locator('#reviewList').innerText()) + ' ' + typed.join(' ')).replace(/\s+/g, ' ');
  const rows = await desk.locator('#reviewList li').evaluateAll((items) => items.map((row) => ({
    text: (row.innerText || '').replace(/\s+/g, ' '),
    value: (row.querySelector('input[type="text"]') || {}).value || '',
    checked: !!((row.querySelector('input[type="checkbox"]') || {}).checked)
  })));
  const blk = rows.find((row) => /blk/i.test(row.text)) || null;
  await desk.close();
  return { review, typed, boxes, before, blk };
}

const letterPage = await browser.newPage();
letterPage.setDefaultTimeout(90000);
await letterPage.goto('http://127.0.0.1:8865/tools/forms-filler/?glyph=letter', { waitUntil: 'domcontentloaded' });
await letterPage.waitForFunction(() => window.Tesseract && window.FormFacts);
const letter = await letterPage.evaluate(async () => {
  const bits = ['..##..', '.#..#.', '#....#', '######', '#....#', '#....#', '#....#'];
  const canvas = document.createElement('canvas');
  canvas.width = 1500;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f4efe6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#16120e';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('BLK 123', 80, 540);
  const width = ctx.measureText('BLK 123').width;
  const size = 8;
  const x = 80 + width - 2;
  const y = 540 - size * 7;
  bits.forEach((row, r) => row.split('').forEach((cell, c) => {
    if (cell === '#') ctx.fillRect(x + c * size, y + r * size, size, size);
  }));
  const prepared = FormExtract.cardVariant(canvas, { rotate: 0, tilt: 0, threshold: false, shear: 0 });
  const base = new URL('vendor/tesseract/', location.href).href;
  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath: base + 'worker.min.js',
    corePath: base + 'tesseract-core-simd-lstm.wasm.js',
    langPath: base.replace(/\/$/, ''),
    gzip: true,
    cacheMethod: 'none'
  });
  await worker.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: '' });
  const full = await worker.recognize(prepared);
  const block = (full.data.words || []).find((word) => /^\d{4}$/.test(String(word.text || '').replace(/[^0-9A-Z]/gi, '')));
  if (!block) {
    await worker.terminate();
    return { text: String(full.data.text || '').replace(/\s+/g, ' ').trim() };
  }
  const symbols = block.symbols || [];
  const last = symbols[symbols.length - 1];
  const choices = (last.choices || []).map((choice) => String(choice.text || '').toUpperCase());
  const box = last.bbox;
  const found = [];
  for (const spec of [{ pad: 10, scale: 4 }, { pad: 10, scale: 6 }]) {
    const sw = box.x1 - box.x0 + spec.pad * 2;
    const sh = box.y1 - box.y0 + spec.pad * 2;
    const out = document.createElement('canvas');
    out.width = Math.round(sw * spec.scale);
    out.height = Math.round(sh * spec.scale);
    const cctx = out.getContext('2d');
    cctx.fillStyle = '#fff';
    cctx.fillRect(0, 0, out.width, out.height);
    cctx.imageSmoothingEnabled = false;
    cctx.drawImage(prepared, box.x0 - spec.pad, box.y0 - spec.pad, sw, sh, 0, 0, out.width, out.height);
    await worker.setParameters({ tessedit_pageseg_mode: '10', tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' });
    const again = await worker.recognize(out);
    const marks = [];
    (again.data.words || []).forEach((word) => (word.symbols || []).forEach((symbol) => {
      if (/^[A-Z]$/i.test(symbol.text || '')) marks.push({ letter: String(symbol.text).toUpperCase(), confidence: Number(symbol.confidence || 0) });
    }));
    marks.sort((a, b) => b.confidence - a.confidence);
    found.push(marks[0] || { letter: '', confidence: 0 });
  }
  await worker.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: '' });
  await worker.terminate();
  const line = String(block.text || '').toUpperCase();
  const letter = found[0] && found[1] && found[0].letter === found[1].letter && found[0].confidence >= 40 && found[1].confidence >= 40 ? found[0].letter : '';
  const home = 'BLK ' + line + ' EXAMPLE RD\n#12-34\nSINGAPORE 560' + line.slice(0, 3) + '\n';
  const read = FormFacts.identityRead(home);
  read.blkSuggest = letter ? line.slice(0, 3) + letter : '';
  read.blkSuggestKind = letter ? 'reread' : '';
  const vote = FormFacts.identityVote([read, read]);
  return {
    line,
    choices,
    marks: found.map((item) => (item.letter || '?') + Math.round(item.confidence || 0)),
    letter,
    confidence: found.map((item) => item && Math.round(item.confidence)),
    blk: vote.blk,
    checked: vote.blkChecked,
    hint: vote.blkHint
  };
});
await letterPage.close();
check('the line reads the pixel letter as a digit with no letter alternative', /^\d{4}$/.test(letter.line || '') && (letter.choices || []).every((choice) => !/^[A-Z]$/.test(choice)), JSON.stringify(letter));
check('the cropped re-read agrees on one letter and the block stays unticked', /^\d{3}[A-Z]$/.test(letter.blk || '') && letter.checked === false && letter.hint === letter.line, JSON.stringify(letter));

const block = await reviewOf('/tmp/glyph-block.png', 'block');
check('nothing is written before Use', !/pdf-editor/.test(block.before), block.before);
check('a clear 4-digit block is not rewritten', !!(block.blk && block.blk.value === '1234' && block.blk.checked === false && !/Read as/.test(block.blk.text)), JSON.stringify(block.blk));

const house = await reviewOf('/tmp/glyph-house.png', 'house');
const houseLetter = (house.typed || []).find((value) => /^\d{3}[A-Z]$/.test(value));
check('a 4-digit house number on a street line is not rewritten', !houseLetter && !/Read as 1234/.test(house.review), house.review.slice(0, 400) + ' typed ' + (house.typed || []).join(','));
const exported = pdfVisible('/tmp/glyph-application.pdf');
check('the blank form is unchanged', !/123H|123A|1235/.test(exported), exported.slice(0, 200));

const choicePage = await browser.newPage();
await choicePage.goto('http://127.0.0.1:8865/tools/forms-filler/?glyph=choices', { waitUntil: 'domcontentloaded' });
await choicePage.waitForFunction(() => window.FormBlockChoices);
await choicePage.evaluate(() => {
  const box = document.getElementById('reviewBox');
  if (box) box.hidden = false;
  const list = document.getElementById('reviewList');
  list.textContent = '';
  const li = document.createElement('li');
  const tick = document.createElement('input');
  tick.type = 'checkbox';
  const edit = document.createElement('input');
  edit.type = 'text';
  edit.value = '1294';
  li.appendChild(tick);
  li.appendChild(edit);
  list.appendChild(li);
  window.FormBlockChoices.add(li, { value: '1294', blockCandidates: ['123H', '123A'], checked: false });
});
const choiceButtons = choicePage.locator('#reviewList button');
check('the conflict offers two labeled block buttons', await choiceButtons.count() === 2, String(await choiceButtons.count()));
await choiceButtons.nth(0).focus();
await choicePage.keyboard.press('Enter');
const afterKey = await choicePage.evaluate(() => ({
  value: document.querySelector('#reviewList input[type="text"]').value,
  checked: document.querySelector('#reviewList input[type="checkbox"]').checked
}));
check('a keyboard choice fills the block field and leaves it unticked', afterKey.value === '123H' && afterKey.checked === false, JSON.stringify(afterKey));
await choiceButtons.nth(1).click();
const afterClick = await choicePage.evaluate(() => ({
  value: document.querySelector('#reviewList input[type="text"]').value,
  checked: document.querySelector('#reviewList input[type="checkbox"]').checked
}));
check('a tap fills the other block suggestion and leaves it unticked', afterClick.value === '123A' && afterClick.checked === false, JSON.stringify(afterClick));
await choicePage.close();

console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
