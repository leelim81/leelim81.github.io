/** Synthetic flat bank form: gray rounded boxes, no AcroForm. Review name and ID only. Viewport 1100 by 900. Not a phone. */
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts, pushGraphicsState, popGraphicsState, moveTo, appendBezierCurve, closePath, setFillingRgbColor, setStrokingRgbColor, setLineWidth, fillAndStroke } = require('pdf-lib');
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 400) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 240) : ''));
}
function roundedBox(page, x, y, w, h) {
  const r = 3;
  page.pushOperators(
    pushGraphicsState(),
    setFillingRgbColor(0.93, 0.93, 0.93),
    setStrokingRgbColor(0.75, 0.75, 0.75),
    setLineWidth(0.6),
    moveTo(x + r, y),
    appendBezierCurve(x + w / 2, y, x + w / 2, y, x + w - r, y),
    appendBezierCurve(x + w, y, x + w, y, x + w, y + r),
    appendBezierCurve(x + w, y + h / 2, x + w, y + h / 2, x + w, y + h - r),
    appendBezierCurve(x + w, y + h, x + w, y + h, x + w - r, y + h),
    appendBezierCurve(x + w / 2, y + h, x + w / 2, y + h, x + r, y + h),
    appendBezierCurve(x, y + h, x, y + h, x, y + h - r),
    appendBezierCurve(x, y + h / 2, x, y + h / 2, x, y + r),
    appendBezierCurve(x, y, x, y, x + r, y),
    closePath(),
    fillAndStroke(),
    popGraphicsState()
  );
}
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
function box(page, x, y, w, h) {
  roundedBox(page, x, y, w, h);
}
function label(page, text, x, y) {
  page.drawText(text, { x: x, y: y, size: 9, font: font });
}
const page1 = doc.addPage([595.28, 841.89]);
label(page1, "Applicant's Information", 31.7, 270);
box(page1, 31.7, 231.9, 148.1 - 31.7, 248.9 - 231.9);
label(page1, 'NRIC/Passport/FIN No.', 31.7, 256);
box(page1, 180, 231.9, 120, 17);
label(page1, 'Home No.', 180, 256);
box(page1, 320, 231.9, 120, 17);
label(page1, 'Mobile No.', 320, 256);
label(page1, 'Name as per Example Bank Account (Underline surname)', 31.7, 220);
box(page1, 31.7, 197.4, 563.5 - 31.7, 214.4 - 197.4);
label(page1, 'Dr Mr Mrs Ms Mdm', 31.7, 178);
box(page1, 31.7, 150, 220, 16);
label(page1, 'Account No. to be Credited', 31.7, 170);
label(page1, 'Transfer Instructions', 31.7, 132);
box(page1, 31.7, 100, 250, 16);
label(page1, 'Name as per Debiting Account', 31.7, 120);
box(page1, 300, 100, 180, 16);
label(page1, 'Debiting Account No.', 300, 120);
box(page1, 31.7, 60, 140, 16);
label(page1, 'Amount', 31.7, 80);
const page2 = doc.addPage([595.28, 841.89]);
label(page2, 'Terms', 31.7, 760);
box(page2, 31.7, 700, 200, 16);
label(page2, 'For Bank Use Only', 31.7, 722);
const page3 = doc.addPage([595.28, 841.89]);
label(page3, 'Reply envelope', 31.7, 760);
writeFileSync('/tmp/synthetic-bank-form.pdf', await doc.save());
const ref = await PDFDocument.create();
const refPage = ref.addPage([595.28, 841.89]);
refPage.drawText('Applicant:', { x: 72, y: 720, size: 12, font: await ref.embedFont(StandardFonts.Helvetica) });
refPage.drawText('Name: Ada Lane', { x: 72, y: 700, size: 12, font: await ref.embedFont(StandardFonts.Helvetica) });
refPage.drawText('NRIC: S1234567D', { x: 72, y: 680, size: 12, font: await ref.embedFont(StandardFonts.Helvetica) });
refPage.drawText('Synthetic identity text for a review check. No account number is included.', { x: 72, y: 650, size: 11, font: await ref.embedFont(StandardFonts.Helvetica) });
writeFileSync('/tmp/synthetic-identity.pdf', await ref.save());

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true })).newPage();
page.setDefaultTimeout(25000);
await page.goto('http://127.0.0.1:8865/tools/forms-filler/?bank=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.locator('#formInput').setInputFiles('/tmp/synthetic-bank-form.pdf');
await page.waitForFunction(() => /Form ready|No lines were found|scan estimates/.test((document.getElementById('readStatus') || {}).textContent || ''));
const ready = await page.locator('#readStatus').innerText();
check('the flat form is read as lines rather than an empty page', /Form ready/.test(ready), ready);
await page.locator('#refInput').setInputFiles('/tmp/synthetic-identity.pdf');
await page.waitForFunction(() => !document.getElementById('fillBtn').disabled);
await page.click('#fillBtn');
await page.waitForSelector('#reviewBox:not([hidden])');
const review = await page.locator('#reviewList').innerText();
check('review offers the applicant name and ID', /Ada Lane/.test(review) && /S1234567D/.test(review), review.slice(0, 240));
check('review does not offer the debiting name, account, amount, or bank-use line', !/Debit/.test(review) && !/Credited/.test(review) && !/Amount/.test(review) && !/Bank Use/.test(review) && !/Signature/.test(review), review.slice(0, 240));
await page.locator('#reviewList input').evaluateAll((boxes) => boxes.forEach((box) => { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }));
const checked = await page.locator('#reviewList input:checked').count();
check('the identity values can be checked before anything is written', checked >= 2, String(checked));
await page.click('#reviewUse');
await page.waitForURL(/pdf-editor/);
await page.waitForSelector('#pages .ann-body');
const marks = await page.locator('#pages .ann-body').allInnerTexts();
const joined = marks.join(' | ');
check('the editor places only the checked name and ID', marks.length === 2 && marks.includes('Ada Lane') && marks.includes('S1234567D'), joined);
const places = await page.locator('.ann').evaluateAll((nodes) => nodes.map((el) => ({
  text: (el.querySelector('.ann-body') || {}).innerText || '',
  top: parseFloat(el.style.top),
  left: parseFloat(el.style.left),
  width: parseFloat(el.style.width)
})));
const nameBox = places.find((item) => item.text === 'Ada Lane');
const idBox = places.find((item) => item.text === 'S1234567D');
check('the name sits on the wide applicant line and the ID on the narrow one', !!nameBox && !!idBox && nameBox.width > 70 && idBox.width < 30 && nameBox.left + idBox.width < 32 && Math.abs(nameBox.left - idBox.left) < 3 && nameBox.top > idBox.top, JSON.stringify(places));
const pages = await page.locator('#pages .page, #pages canvas').count();
check('bank-use and envelope pages are present and were not given those values', pages >= 2 && !/Debit|Credited|Amount|Bank Use/.test(joined), 'canvases ' + pages + ' ' + joined);
await page.locator('#downloadBtn').click();
await page.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
const download = page.waitForEvent('download');
await page.locator('#sizeOptions button[data-level="100"]').click();
const saved = await download;
await saved.saveAs('/tmp/synthetic-bank-filled.pdf');
const { readFileSync } = await import('fs');
const { inflateSync } = await import('zlib');
const raw = readFileSync('/tmp/synthetic-bank-filled.pdf').toString('latin1');
const streams = [];
const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
let match;
while ((match = re.exec(raw))) {
  const chunk = Buffer.from(match[1], 'latin1');
  try { streams.push(inflateSync(chunk)); } catch (err) { streams.push(chunk); }
}
const pdfText = Buffer.concat(streams).toString('latin1');
const visible = [...pdfText.matchAll(/\((?:\\.|[^\\)])*\)|<([0-9A-Fa-f\s]+)>/g)].map((item) => item[1] ? Buffer.from(item[1].replace(/\s+/g, ''), 'hex').toString('utf8') : item[0].slice(1, -1)).join(' | ');
check('the downloaded PDF contains the reviewed name and ID', visible.includes('Ada Lane') && visible.includes('S1234567D'), visible.slice(0, 180));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#pages .ann-body');
const reloaded = await page.locator('#pages .ann-body').allInnerTexts();
check('reload keeps the reviewed name and ID', reloaded.includes('Ada Lane') && reloaded.includes('S1234567D') && reloaded.length === 2, reloaded.join(' | '));
console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
