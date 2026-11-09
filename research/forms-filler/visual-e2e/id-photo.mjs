/** On-device photo read of a synthetic identity card. Viewport 1100 by 900. Not a phone. */
import { writeFileSync, readFileSync } from 'fs';
import { inflateSync } from 'zlib';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts, pushGraphicsState, popGraphicsState, moveTo, appendBezierCurve, closePath, setFillingRgbColor, setStrokingRgbColor, setLineWidth, fillAndStroke } = require('pdf-lib');
const facts = createRequire(import.meta.url)('../../../tools/forms-filler/facts.js');
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 400) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 280) : ''));
}
function makeNric(prefix, digits) {
  const weights = [2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(digits[i]) * weights[i];
  if (prefix === 'T' || prefix === 'G') sum += 4;
  const table = (prefix === 'S' || prefix === 'T') ? 'JZIHGFEDCBA' : 'XWUTRQPNMLK';
  return prefix + digits + table.charAt(sum % 11);
}
const GOOD = makeNric('S', '8523146');
const BAD = 'S8523146A';
check('the synthetic NRIC passes the app checksum', facts.nricChecksum(GOOD) && !facts.nricChecksum(BAD), GOOD);
const parsed = facts.identityRead('REPUBLIC OF SINGAPORE\nIDENTITY CARD\nName\nTAN WEI MING\n陈伟明\n' + GOOD + '\nDate of birth\n15 JAN 1990\n10 EXAMPLE LANE\n');
check('a card-like text block yields the Latin name and the valid ID', parsed.name === 'TAN WEI MING' && parsed.nric === GOOD && parsed.nricValid && !/陈/.test(parsed.name), JSON.stringify(parsed));
const invalid = facts.identityRead('Name\nTAN WEI MING\n' + BAD + '\n');
check('a bad checksum stays unconfirmed', invalid.nric === BAD && invalid.nricUnconfirmed && !invalid.nricValid, JSON.stringify(invalid));
const dollar = facts.identityRead('Name\nTAN WEI MING\n$' + GOOD.slice(1) + '\n');
check('a dollar sign in the prefix is read as S only when that checksum passes', dollar.nric === GOOD && dollar.nricValid && !dollar.nricUnconfirmed, JSON.stringify(dollar));
const dollarBad = facts.identityRead('Name\nTAN WEI MING\n$' + BAD.slice(1) + '\n');
check('a dollar sign is not rewritten into a different valid ID', dollarBad.nric === BAD && !dollarBad.nricValid && dollarBad.nricUnconfirmed, JSON.stringify(dollarBad));

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
const formDoc = await PDFDocument.create();
const font = await formDoc.embedFont(StandardFonts.Helvetica);
function label(page, text, x, y) { page.drawText(text, { x, y, size: 9, font }); }
const p1 = formDoc.addPage([595.28, 841.89]);
label(p1, "Applicant's Information", 31.7, 270);
roundedBox(p1, 31.7, 231.9, 116.4, 17);
label(p1, 'NRIC/Passport/FIN No.', 31.7, 256);
roundedBox(p1, 180, 231.9, 120, 17);
label(p1, 'Home No.', 180, 256);
roundedBox(p1, 320, 231.9, 120, 17);
label(p1, 'Mobile No.', 320, 256);
label(p1, 'Name as per Example Bank Account (Underline surname)', 31.7, 220);
roundedBox(p1, 31.7, 197.4, 531.8, 17);
label(p1, 'Dr Mr Mrs Ms Mdm', 31.7, 178);
roundedBox(p1, 31.7, 150, 220, 16);
label(p1, 'Account No. to be Credited', 31.7, 170);
label(p1, 'Transfer Instructions', 31.7, 132);
roundedBox(p1, 31.7, 100, 250, 16);
label(p1, 'Name as per Debiting Account', 31.7, 120);
roundedBox(p1, 300, 100, 180, 16);
label(p1, 'Debiting Account No.', 300, 120);
roundedBox(p1, 31.7, 60, 140, 16);
label(p1, 'Amount', 31.7, 80);
const p2 = formDoc.addPage([595.28, 841.89]);
label(p2, 'Terms', 31.7, 760);
roundedBox(p2, 31.7, 700, 200, 16);
label(p2, 'For Bank Use Only', 31.7, 722);
const p3 = formDoc.addPage([595.28, 841.89]);
label(p3, 'Reply envelope', 31.7, 760);
writeFileSync('/tmp/synthetic-bank-form.pdf', await formDoc.save());

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const painter = await browser.newPage();
async function paintCard(file, spec) {
  await painter.setContent('<canvas id="c" width="1200" height="760"></canvas>');
  const url = await painter.evaluate((spec) => {
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = spec.paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    if (spec.rotate) {
      ctx.translate(600, 380);
      ctx.rotate(spec.rotate);
      ctx.translate(-600, -380);
    }
    ctx.fillStyle = spec.ink;
    ctx.font = '28px sans-serif';
    ctx.fillText('REPUBLIC OF SINGAPORE', 80, 90);
    ctx.fillText('IDENTITY CARD', 80, 140);
    ctx.font = '22px sans-serif';
    ctx.fillText('Name', 80, 230);
    ctx.font = 'bold 54px sans-serif';
    ctx.fillText(spec.name, 80, 300);
    ctx.font = '36px sans-serif';
    ctx.fillText(spec.chinese, 80, 360);
    ctx.font = '22px sans-serif';
    ctx.fillText('NRIC', 80, 430);
    ctx.font = 'bold 48px monospace';
    ctx.fillText(spec.nric, 80, 490);
    ctx.font = '22px sans-serif';
    ctx.fillText('Date of birth', 620, 430);
    ctx.font = '32px sans-serif';
    ctx.fillText('15 JAN 1990', 620, 480);
    ctx.font = '22px sans-serif';
    ctx.fillText('BACK', 80, 580);
    ctx.fillText('Address', 80, 630);
    ctx.font = '28px sans-serif';
    ctx.fillText('10 EXAMPLE LANE', 80, 680);
    ctx.fillText('SINGAPORE 018956', 80, 720);
    ctx.restore();
    return canvas.toDataURL('image/png');
  }, spec);
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
}
await paintCard('/tmp/synthetic-id-clear.png', { name: 'TAN WEI MING', chinese: '陈伟明', nric: GOOD, paper: '#ffffff', ink: '#111111', rotate: 0 });
await paintCard('/tmp/synthetic-id-faint.png', { name: 'TAN WEI MING', chinese: '陈伟明', nric: GOOD, paper: '#d5d5d5', ink: '#6e6e6e', rotate: 0.1 });
await paintCard('/tmp/synthetic-id-bad.png', { name: 'TAN WEI MING', chinese: '陈伟明', nric: BAD, paper: '#ffffff', ink: '#111111', rotate: 0 });
await painter.setContent('<canvas id="c" width="80" height="80"></canvas>');
const blankUrl = await painter.evaluate(() => {
  const canvas = document.getElementById('c');
  canvas.getContext('2d').fillStyle = '#ffffff';
  canvas.getContext('2d').fillRect(0, 0, 80, 80);
  return canvas.toDataURL('image/png');
});
writeFileSync('/tmp/synthetic-id-blank.png', Buffer.from(blankUrl.split(',')[1], 'base64'));
await painter.close();

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
function watchNetwork(page) {
  const outside = [];
  const local = [];
  let armed = false;
  page.on('request', (req) => {
    if (!armed) return;
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    let host = '';
    try { host = new URL(url).host; } catch (err) { host = url; }
    if (host !== '127.0.0.1:8865') outside.push(url);
    else if (/tesseract|traineddata/i.test(url)) local.push(url);
  });
  return {
    outside,
    local,
    arm() { armed = true; outside.length = 0; local.length = 0; }
  };
}
async function openDesk() {
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true })).newPage();
  page.setDefaultTimeout(90000);
  page.network = watchNetwork(page);
  await page.addInitScript(() => { window.__ffReadBudgetMs = 70000; });
  await page.goto('http://127.0.0.1:8865/tools/forms-filler/?photo=' + Date.now(), { waitUntil: 'domcontentloaded' });
  return page;
}
async function attach(page, image) {
  await page.locator('#formInput').setInputFiles('/tmp/synthetic-bank-form.pdf');
  await page.waitForFunction(() => /Form ready|No lines were found/.test((document.getElementById('readStatus') || {}).textContent || ''));
  page.network.arm();
  await page.locator('#refInput').setInputFiles(image);
  await page.waitForFunction(() => {
    const row = document.querySelector('.ref-preview');
    return row && row.textContent && row.textContent !== 'Reading…';
  });
}

const clearStarted = Date.now();
const clearPage = await openDesk();
await attach(clearPage, '/tmp/synthetic-id-clear.png');
const clearReadMs = Date.now() - clearStarted;
await clearPage.click('#fillBtn');
await clearPage.waitForSelector('#reviewBox:not([hidden])');
console.log('CLEAR_PHOTO_MS', Date.now() - clearStarted, 'READ_MS', clearReadMs);
async function reviewText(page) {
  const typed = await page.locator('#reviewList input[type="text"]').evaluateAll((els) => els.map((el) => el.value)).catch(() => []);
  const visible = await page.locator('#reviewList').innerText();
  return (visible + ' ' + typed.join(' ')).replace(/\s+/g, ' ').trim();
}
const review = await reviewText(clearPage);
check('the photo review shows the card name and the valid ID', review.includes('TAN WEI MING') && review.includes(GOOD), review.slice(0, 300));
check('recognition does not leave this origin', clearPage.network.outside.length === 0, clearPage.network.outside.slice(0, 4).join(' | ') || 'none');
console.log('LOCAL_OCR_REQUESTS', [...new Set(clearPage.network.local)].join(' | ') || 'none');
check('the photo review does not offer accounts, amount, or bank-use lines', !/Debit|Credited|Amount|Bank Use|Signature|陈/.test(review), review.slice(0, 300));
check('the private model stays off while the photo is read', /not downloaded|Model not needed/i.test(await clearPage.locator('#modelState').innerText()) && await clearPage.locator('#modelBox').isHidden(), await clearPage.locator('#modelState').innerText());
await clearPage.locator('#reviewList input[type="checkbox"]').evaluateAll((boxes) => boxes.forEach((box) => { box.checked = true; }));
await clearPage.click('#reviewUse');
await clearPage.waitForURL(/pdf-editor/);
await clearPage.waitForSelector('#pages .ann-body');
const marks = await clearPage.locator('#pages .ann-body').allInnerTexts();
check('confirm places only the card name and ID', marks.length === 2 && marks.includes('TAN WEI MING') && marks.includes(GOOD), marks.join(' | '));
await clearPage.locator('#downloadBtn').click();
await clearPage.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
const download = clearPage.waitForEvent('download');
await clearPage.locator('#sizeOptions button[data-level="100"]').click();
await (await download).saveAs('/tmp/synthetic-id-filled.pdf');
const visible = pdfVisible('/tmp/synthetic-id-filled.pdf');
check('the downloaded PDF contains exactly the confirmed name and ID', visible.includes('TAN WEI MING') && visible.includes(GOOD) && !visible.includes(BAD) && !visible.includes('陈伟明'), 'name ' + visible.includes('TAN WEI MING') + ' id ' + visible.includes(GOOD));
await clearPage.reload({ waitUntil: 'domcontentloaded' });
await clearPage.waitForSelector('#pages .ann-body');
const again = await clearPage.locator('#pages .ann-body').allInnerTexts();
check('reload keeps the confirmed name and ID', again.includes('TAN WEI MING') && again.includes(GOOD) && again.length === 2, again.join(' | '));
await clearPage.close();

const badPage = await openDesk();
await attach(badPage, '/tmp/synthetic-id-bad.png');
await badPage.click('#fillBtn');
const badReview = await badPage.waitForSelector('#reviewBox:not([hidden])').then(() => reviewText(badPage)).catch(() => '');
const badFail = await badPage.locator('#failText').innerText().catch(() => '');
const badShown = badReview || badFail;
check('a bad checksum is unconfirmed or unread, and not described as already written', /Unconfirmed|Checksum|Could not read/i.test(badShown) && !/Wrote [1-9]/.test(await badPage.locator('#readStatus').innerText().catch(() => '')), badShown.slice(0, 300));
if (badReview) {
  await badPage.click('#reviewSkip');
  await badPage.waitForURL(/pdf-editor/);
  const badMarks = await badPage.locator('#pages .ann-body').allInnerTexts();
  check('skipping an unconfirmed ID writes nothing from the photo', !badMarks.includes(BAD) && !badMarks.includes('TAN WEI MING'), badMarks.join(' | ') || 'none');
}
await badPage.close();

const blankPage = await openDesk();
await attach(blankPage, '/tmp/synthetic-id-blank.png');
await blankPage.click('#fillBtn');
await blankPage.waitForFunction(() => /Could not read/i.test((document.getElementById('failText') || {}).textContent || '') || /Could not read/i.test((document.querySelector('.ref-preview') || {}).textContent || ''));
const blankMsg = ((await blankPage.locator('#failText').innerText().catch(() => '')) + ' ' + (await blankPage.locator('.ref-preview').innerText().catch(() => ''))).trim();
check('a photo with no text says it could not be read', /Could not read/i.test(await blankPage.locator('#failText').innerText()), blankMsg.slice(0, 240));
check('a failed photo does not open the editor', !/pdf-editor/.test(blankPage.url()), blankPage.url());
await blankPage.close();

const faintPage = await openDesk();
const faintStarted = Date.now();
await attach(faintPage, '/tmp/synthetic-id-faint.png');
await faintPage.click('#fillBtn');
await faintPage.waitForFunction(() => {
  const review = document.getElementById('reviewBox');
  const fail = document.getElementById('failText');
  return (review && !review.hidden) || (fail && /Could not read/i.test(fail.textContent || ''));
});
const faintMs = Date.now() - faintStarted;
const faintReview = await faintPage.locator('#reviewBox').isVisible() ? await reviewText(faintPage) : '';
const faintFail = await faintPage.locator('#failText').innerText().catch(() => '');
const faintHit = faintReview.includes('TAN WEI MING') && faintReview.includes(GOOD);
console.log('FAINT_PHOTO_MS', faintMs, 'HIT', faintHit);
console.log('FAINT_REVIEW', faintReview.slice(0, 240), 'FAIL', faintFail.slice(0, 180));
const faintReported = faintHit || /Could not read/i.test(faintFail + faintReview) || !!faintReview;
check('a rotated faint photo is shown for confirmation or reported as unread', faintReported && !/pdf-editor/.test(faintPage.url()), (faintHit ? 'full read' : (faintReview ? 'partial ' + faintReview.slice(0, 120) : faintFail.slice(0, 120))));
if (faintReview) check('a faint read is not written until it is confirmed', await faintPage.locator('#reviewList input[type="checkbox"]:checked').count() === 0 && !/pdf-editor/.test(faintPage.url()), faintReview.slice(0, 180));
await faintPage.close();
await browser.close();
console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
if (checks.some((item) => !item.ok)) process.exit(1);
