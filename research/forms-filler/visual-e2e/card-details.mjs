/** Synthetic NRIC front and back onto an application form. Desktop 1100 by 900. Not a phone. */
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
function countOf(text, needle) {
  return text.split(needle).length - 1;
}
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const page = doc.addPage([595.28, 841.89]);
function label(text, x, y) { page.drawText(text, { x: x, y: y, size: 10, font: font }); }
function box(x, y, w) { roundedBox(page, x, y, w, 16); }
function field(text, y, w) {
  label(text, 36, y);
  box(36, y - 28, w || 220);
}
label("Applicant's particulars", 36, 750);
field('Full name', 710, 280);
field('NRIC', 660, 180);
field('Date of birth', 610, 180);
field('Sex', 560, 80);
field('Nationality', 510, 220);
field('Blk', 460, 80);
field('Street', 410, 240);
field('Unit', 360, 90);
field('Postal code', 310, 120);
label('Guarantor', 36, 250);
field('Name', 210, 240);
field('NRIC', 160, 180);
field('Address', 110, 280);
writeFileSync('/tmp/card-application.pdf', await doc.save());

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const painter = await browser.newPage();
async function paint(lines, file) {
  await painter.setContent('<canvas id="c" width="1200" height="760"></canvas>');
  const url = await painter.evaluate((rows) => {
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f4efe6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1a1612';
    rows.forEach(function (row) {
      ctx.font = row.font;
      ctx.fillText(row.text, row.x, row.y);
    });
    return canvas.toDataURL('image/png');
  }, lines);
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
}
await paint([
  { text: 'REPUBLIC OF SINGAPORE', x: 80, y: 80, font: '28px sans-serif' },
  { text: 'IDENTITY CARD', x: 80, y: 130, font: '28px sans-serif' },
  { text: 'Name', x: 80, y: 210, font: '22px sans-serif' },
  { text: 'TAN WEI MING', x: 80, y: 270, font: 'bold 54px sans-serif' },
  { text: 'NRIC', x: 80, y: 360, font: '22px sans-serif' },
  { text: 'S8523146D', x: 80, y: 420, font: 'bold 48px monospace' },
  { text: 'Date of birth', x: 80, y: 500, font: '22px sans-serif' },
  { text: '15 JAN 1990', x: 80, y: 555, font: 'bold 40px sans-serif' },
  { text: 'Sex', x: 520, y: 500, font: '22px sans-serif' },
  { text: 'M', x: 520, y: 555, font: 'bold 48px sans-serif' },
  { text: 'Nationality', x: 700, y: 500, font: '22px sans-serif' },
  { text: 'SINGAPORE CITIZEN', x: 700, y: 555, font: 'bold 32px sans-serif' }
], '/tmp/card-front.png');
await paint([
  { text: 'IDENTITY CARD', x: 80, y: 90, font: '28px sans-serif' },
  { text: 'BACK', x: 80, y: 150, font: '28px sans-serif' },
  { text: 'Address', x: 80, y: 240, font: '22px sans-serif' },
  { text: 'BLK 88 EXAMPLE WALK', x: 80, y: 310, font: 'bold 36px sans-serif' },
  { text: '#12-34', x: 80, y: 380, font: 'bold 36px sans-serif' },
  { text: 'SINGAPORE 018956', x: 80, y: 450, font: 'bold 36px sans-serif' }
], '/tmp/card-back.png');
await painter.close();

const desk = await (await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true })).newPage();
desk.setDefaultTimeout(90000);
await desk.addInitScript(() => { window.__ffReadBudgetMs = 70000; });
await desk.goto('http://127.0.0.1:8865/tools/forms-filler/?card=' + Date.now(), { waitUntil: 'domcontentloaded' });
await desk.locator('#formInput').setInputFiles('/tmp/card-application.pdf');
await desk.waitForFunction(() => /Form ready|No lines were found/.test((document.getElementById('readStatus') || {}).textContent || ''));
await desk.locator('#refInput').setInputFiles(['/tmp/card-front.png', '/tmp/card-back.png']);
await desk.waitForFunction(() => {
  const rows = Array.from(document.querySelectorAll('.ref-preview'));
  return rows.length >= 2 && rows.every((row) => row.textContent && row.textContent !== 'Reading…');
});
const previews = await desk.locator('.ref-preview').allInnerTexts();
check('the back of the card is read as an address', previews.some((text) => /EXAMPLE WALK|018956|Address/i.test(text)) && !previews.some((text) => /Could not read a name or ID/i.test(text)), previews.join(' | '));
await desk.click('#fillBtn');
await desk.waitForSelector('#reviewBox:not([hidden])');
check('nothing is written before Use', !/pdf-editor/.test(desk.url()), desk.url());
const typed = await desk.locator('#reviewList input[type="text"]').evaluateAll((els) => els.map((el) => el.value)).catch(() => []);
const review = ((await desk.locator('#reviewList').innerText()) + ' ' + typed.join(' ')).replace(/\s+/g, ' ');
check('the review offers the card date, sex, nationality, and address parts', /15-01-1990/.test(review) && /\bM\b/.test(review) && /Singapore citizen/i.test(review) && /88/.test(review) && /EXAMPLE WALK/.test(review) && /12-34/.test(review) && /018956/.test(review), review.slice(0, 400));
check('the guarantor lines are not offered', (review.match(/TAN WEI MING/g) || []).length === 1 && (review.match(/S8523146D/g) || []).length === 1, review.slice(0, 400));
await desk.locator('#reviewList input[type="checkbox"]').evaluateAll((boxes) => boxes.forEach((box) => { box.checked = true; }));
await desk.click('#reviewUse');
await desk.waitForURL(/pdf-editor/);
await desk.waitForSelector('#pages .ann-body');
await desk.locator('#downloadBtn').click();
await desk.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
const download = desk.waitForEvent('download');
await desk.locator('#sizeOptions button[data-level="100"]').click();
await (await download).saveAs('/tmp/card-application-out.pdf');
const pdf = pdfVisible('/tmp/card-application-out.pdf');
check('the exported application has the card values once', countOf(pdf, 'TAN WEI MING') === 1 && countOf(pdf, 'S8523146D') === 1 && countOf(pdf, '15-01-1990') === 1 && countOf(pdf, 'EXAMPLE WALK') === 1 && countOf(pdf, '018956') === 1 && /Singapore citizen/i.test(pdf), pdf.slice(0, 400));
console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
