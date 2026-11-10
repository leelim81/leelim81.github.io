/** Synthetic section binding. Desktop 1100 by 900. Not a phone. */
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

const fontDoc = await PDFDocument.create();
const font = await fontDoc.embedFont(StandardFonts.Helvetica);
function blank() {
  return PDFDocument.create();
}
async function drawForm(pages) {
  const doc = await PDFDocument.create();
  const face = await doc.embedFont(StandardFonts.Helvetica);
  for (const spec of pages) {
    const page = doc.addPage([595.28, 841.89]);
    spec.forEach(function (item) {
      if (item.box) roundedBox(page, item.x, item.y, item.w, 16);
      else page.drawText(item.text, { x: item.x, y: item.y, size: item.size || 10, font: face });
    });
  }
  return doc.save();
}
const columns = await drawForm([[
  { text: "Applicant's particulars", x: 36, y: 760 },
  { text: 'Full name', x: 36, y: 720 },
  { box: true, x: 36, y: 690, w: 220 },
  { text: 'NRIC', x: 36, y: 650 },
  { box: true, x: 36, y: 620, w: 220 },
  { text: 'Guarantor', x: 320, y: 760 },
  { text: 'Name', x: 320, y: 720 },
  { box: true, x: 320, y: 690, w: 220 },
  { text: 'NRIC', x: 320, y: 650 },
  { box: true, x: 320, y: 620, w: 220 }
]]);
const continued = await drawForm([
  [
    { text: "Applicant's particulars", x: 36, y: 760 },
    { text: 'Full name', x: 36, y: 720 },
    { box: true, x: 36, y: 690, w: 240 },
    { text: 'NRIC', x: 36, y: 650 },
    { box: true, x: 36, y: 620, w: 240 },
    { text: 'Guarantor', x: 36, y: 180 }
  ],
  [
    { text: 'Name', x: 36, y: 760 },
    { box: true, x: 36, y: 730, w: 240 },
    { text: 'NRIC', x: 36, y: 690 },
    { box: true, x: 36, y: 660, w: 240 }
  ]
]);
const declared = await drawForm([
  [
    { text: "Applicant's particulars", x: 36, y: 760 },
    { text: 'Full name', x: 36, y: 720 },
    { box: true, x: 36, y: 690, w: 240 },
    { text: 'NRIC', x: 36, y: 650 },
    { box: true, x: 36, y: 620, w: 240 }
  ],
  [
    { text: 'Declaration', x: 36, y: 760 },
    { text: 'Name', x: 36, y: 720 },
    { box: true, x: 36, y: 690, w: 240 },
    { text: 'NRIC', x: 36, y: 650 },
    { box: true, x: 36, y: 620, w: 240 }
  ]
]);
const partA = await drawForm([[
  { text: 'Part A', x: 36, y: 760 },
  { text: 'Full name', x: 36, y: 720 },
  { box: true, x: 36, y: 690, w: 320 },
  { text: 'Name as per NRIC', x: 36, y: 650 },
  { box: true, x: 36, y: 620, w: 320 },
  { text: 'NRIC/FIN/passport no.', x: 36, y: 580 },
  { box: true, x: 36, y: 550, w: 220 }
]]);
writeFileSync('/tmp/section-columns.pdf', columns);
writeFileSync('/tmp/section-continued.pdf', continued);
writeFileSync('/tmp/section-part-a.pdf', partA);
writeFileSync('/tmp/section-declaration.pdf', declared);
void font;

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const painter = await browser.newPage();
await painter.setContent('<canvas id="c" width="1200" height="760"></canvas>');
const cardUrl = await painter.evaluate(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f4efe6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1a1612';
  ctx.font = '28px sans-serif';
  ctx.fillText('REPUBLIC OF SINGAPORE', 80, 90);
  ctx.fillText('IDENTITY CARD', 80, 140);
  ctx.font = '22px sans-serif';
  ctx.fillText('Name', 80, 230);
  ctx.font = 'bold 54px sans-serif';
  ctx.fillText('TAN WEI MING', 80, 300);
  ctx.font = '22px sans-serif';
  ctx.fillText('NRIC', 80, 430);
  ctx.font = 'bold 48px monospace';
  ctx.fillText('S8523146D', 80, 490);
  return canvas.toDataURL('image/png');
});
writeFileSync('/tmp/section-id.png', Buffer.from(cardUrl.split(',')[1], 'base64'));
await painter.close();

async function openDesk() {
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true })).newPage();
  page.setDefaultTimeout(90000);
  await page.addInitScript(() => { window.__ffReadBudgetMs = 70000; });
  await page.goto('http://127.0.0.1:8865/tools/forms-filler/?section=' + Date.now(), { waitUntil: 'domcontentloaded' });
  return page;
}
async function reviewText(page) {
  const typed = await page.locator('#reviewList input[type="text"]').evaluateAll((els) => els.map((el) => el.value)).catch(() => []);
  const visible = await page.locator('#reviewList').innerText();
  return (visible + ' ' + typed.join(' ')).replace(/\s+/g, ' ').trim();
}
async function place(page, formPath) {
  await page.locator('#formInput').setInputFiles(formPath);
  await page.waitForFunction(() => /Form ready|No lines were found/.test((document.getElementById('readStatus') || {}).textContent || ''));
  const labels = await page.evaluate(() => (window.FormDesk ? FormDesk.fields().map((field) => field.label) : []));
  await page.locator('#refInput').setInputFiles('/tmp/section-id.png');
  await page.waitForFunction(() => {
    const row = document.querySelector('.ref-preview');
    return row && row.textContent && row.textContent !== 'Reading…';
  });
  await page.click('#fillBtn');
  await page.waitForSelector('#reviewBox:not([hidden])');
  check('nothing is written before Use', !/pdf-editor/.test(page.url()), page.url());
  return { labels, review: await reviewText(page) };
}
async function exportPdf(page, file) {
  await page.locator('#reviewList input[type="checkbox"]').evaluateAll((boxes) => boxes.forEach((box) => { box.checked = true; }));
  await page.click('#reviewUse');
  await page.waitForURL(/pdf-editor/);
  await page.waitForSelector('#pages .ann-body');
  const marks = await page.locator('#pages .ann-body').allInnerTexts();
  await page.locator('#downloadBtn').click();
  await page.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
  const download = page.waitForEvent('download');
  await page.locator('#sizeOptions button[data-level="100"]').click();
  await (await download).saveAs(file);
  return { marks, pdf: pdfVisible(file) };
}

const columnPage = await openDesk();
const columnRead = await place(columnPage, '/tmp/section-columns.pdf');
check('both columns keep an NRIC line', columnRead.labels.filter((label) => label === 'NRIC').length === 2, columnRead.labels.join(' | '));
check('the review offers the applicant and not the guarantor', /TAN WEI MING/.test(columnRead.review) && /S8523146D/.test(columnRead.review) && (columnRead.review.match(/TAN WEI MING/g) || []).length === 1, columnRead.review.slice(0, 300));
const columnOut = await exportPdf(columnPage, '/tmp/section-columns-out.pdf');
check('the exported two-column PDF has the applicant values once', countOf(columnOut.pdf, 'TAN WEI MING') === 1 && countOf(columnOut.pdf, 'S8523146D') === 1, columnOut.marks.join(' | '));
await columnPage.close();

const nextPage = await openDesk();
const nextRead = await place(nextPage, '/tmp/section-continued.pdf');
check('the continued guarantor lines are not offered', /TAN WEI MING/.test(nextRead.review) && /S8523146D/.test(nextRead.review) && (nextRead.review.match(/TAN WEI MING/g) || []).length === 1 && (nextRead.review.match(/S8523146D/g) || []).length === 1, nextRead.review.slice(0, 320));
const nextOut = await exportPdf(nextPage, '/tmp/section-continued-out.pdf');
check('the exported two-page PDF writes the applicant only once', countOf(nextOut.pdf, 'TAN WEI MING') === 1 && countOf(nextOut.pdf, 'S8523146D') === 1, nextOut.marks.join(' | '));
await nextPage.close();

const declarePage = await openDesk();
const declareRead = await place(declarePage, '/tmp/section-declaration.pdf');
check('a later Declaration is not offered as the applicant', /TAN WEI MING/.test(declareRead.review) && /S8523146D/.test(declareRead.review) && (declareRead.review.match(/TAN WEI MING/g) || []).length === 1 && (declareRead.review.match(/S8523146D/g) || []).length === 1, declareRead.review.slice(0, 320));
const declareOut = await exportPdf(declarePage, '/tmp/section-declaration-out.pdf');
check('the exported declaration form writes the applicant only once', countOf(declareOut.pdf, 'TAN WEI MING') === 1 && countOf(declareOut.pdf, 'S8523146D') === 1, declareOut.marks.join(' | '));
await declarePage.close();

const partPage = await openDesk();
const partRead = await place(partPage, '/tmp/section-part-a.pdf');
check('Part A offers both name lines and the NRIC', (partRead.review.match(/TAN WEI MING/g) || []).length === 2 && /S8523146D/.test(partRead.review), partRead.review.slice(0, 360));
const partOut = await exportPdf(partPage, '/tmp/section-part-a-out.pdf');
check('the exported Part A PDF writes the same name on both lines', countOf(partOut.pdf, 'TAN WEI MING') === 2 && countOf(partOut.pdf, 'S8523146D') === 1, partOut.marks.join(' | '));
await partPage.close();

console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
