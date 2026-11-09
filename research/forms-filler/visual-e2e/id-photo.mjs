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
check('a card-like text block yields the Latin name and the valid ID', parsed.name === 'TAN WEI MING' && parsed.nric === GOOD && parsed.nricValid && !parsed.nameAlias && !/陈/.test(parsed.name), JSON.stringify(parsed));
const aliasRead = facts.identityRead('Name\nTAN WEI MING (CHEN WEIMING)\n' + GOOD + '\n');
check('a parenthetical alias stays on the full printed name', aliasRead.name === 'TAN WEI MING (CHEN WEIMING)' && aliasRead.namePlain === 'TAN WEI MING' && aliasRead.nameAlias === 'CHEN WEIMING', JSON.stringify(aliasRead));
const wrappedRead = facts.identityRead('Name\nTAN WEI MING\n(CHEN WEIMING)\n' + GOOD + '\n');
check('an alias wrapped onto the next line stays on the full name', wrappedRead.name === 'TAN WEI MING (CHEN WEIMING)' && wrappedRead.namePlain === 'TAN WEI MING', JSON.stringify(wrappedRead));
const longName = 'SITI NUR ALEESYA BINTI MOHAMED ABDUL RAHMAN';
const longRead = facts.identityRead('Name\n' + longName + '\n' + GOOD + '\n');
check('a long printed name is kept whole', longRead.name === longName && !longRead.nameAlias, JSON.stringify(longRead));
const votedAlias = facts.identityVote([
  { name: 'TAN WEI MING', nric: GOOD, nricValid: true, nameConf: 90 },
  { name: 'TAN WEI MING (CHEN WEIMING)', nric: GOOD, nricValid: true, nameConf: 90 }
]);
check('voting offers the printed alias and does not pre-check that name', votedAlias.name === 'TAN WEI MING (CHEN WEIMING)' && votedAlias.namePlain === 'TAN WEI MING' && votedAlias.nameChecked === false && votedAlias.nricChecked === true && votedAlias.nameUnconfirmed === false, JSON.stringify(votedAlias));
const invalid = facts.identityRead('Name\nTAN WEI MING\n' + BAD + '\n');
check('a bad checksum stays unconfirmed', invalid.nric === BAD && invalid.nricUnconfirmed && !invalid.nricValid, JSON.stringify(invalid));
const dollar = facts.identityRead('Name\nTAN WEI MING\n$' + GOOD.slice(1) + '\n');
check('a dollar sign in the prefix is read as S only when that checksum passes', dollar.nric === GOOD && dollar.nricValid && !dollar.nricUnconfirmed, JSON.stringify(dollar));
const dollarBad = facts.identityRead('Name\nTAN WEI MING\n$' + BAD.slice(1) + '\n');
check('a dollar sign is not rewritten into a different valid ID', dollarBad.nric === BAD && !dollarBad.nricValid && dollarBad.nricUnconfirmed, JSON.stringify(dollarBad));
const FIN = makeNric('F', '3852416');
const FIN_G = makeNric('G', '2941705');
const OTHER = makeNric('S', '1234567');
const voted = facts.identityVote([
  { name: 'TAN WE', nric: GOOD, nricValid: true },
  { name: 'TAN WEI MING', nric: GOOD, nricValid: true }
]);
check('voting keeps one checksum-valid ID and the longer agreeing name', voted.nric === GOOD && voted.nricValid && voted.name === 'TAN WEI MING', JSON.stringify(voted));
const rejected = facts.identityVote([
  { name: 'TAN WEI MING', nric: BAD, nricValid: false },
  { name: 'TAN WEI MING', nric: BAD, nricValid: false }
]);
check('voting does not propose a failed checksum', rejected.nric === '' && rejected.name === 'TAN WEI MING', JSON.stringify(rejected));
const split = facts.identityVote([
  { name: 'TAN WEI MING', nric: GOOD, nricValid: true },
  { name: 'ADA LANE', nric: OTHER, nricValid: true }
]);
check('voting drops two different valid IDs', split.nric === '' && split.name === '', JSON.stringify(split));

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
const refDoc = await PDFDocument.create();
const refFont = await refDoc.embedFont(StandardFonts.Helvetica);
refDoc.addPage([300, 200]).drawText('Reference note only', { x: 24, y: 120, size: 12, font: refFont });
writeFileSync('/tmp/synthetic-id-ref.pdf', await refDoc.save());

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
    if (spec.alias && !spec.aliasWrap) {
      ctx.font = 'bold 42px sans-serif';
      ctx.fillText(spec.name + ' (' + spec.alias + ')', 80, 300);
      ctx.font = '36px sans-serif';
      ctx.fillText(spec.chinese, 80, 360);
    } else if (spec.alias && spec.aliasWrap) {
      ctx.font = 'bold 48px sans-serif';
      ctx.fillText(spec.name, 80, 290);
      ctx.font = 'bold 40px sans-serif';
      ctx.fillText('(' + spec.alias + ')', 80, 350);
    } else {
      ctx.font = spec.name.length > 28 ? 'bold 32px sans-serif' : 'bold 54px sans-serif';
      ctx.fillText(spec.name, 80, 300);
      ctx.font = '36px sans-serif';
      ctx.fillText(spec.chinese, 80, 360);
    }
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
    let output = canvas;
    if (spec.side === 'back') {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = spec.paper;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = spec.ink;
      ctx.font = '28px sans-serif';
      ctx.fillText('IDENTITY CARD', 80, 90);
      ctx.fillText('BACK', 80, 140);
      ctx.font = '22px sans-serif';
      ctx.fillText('Address', 80, 240);
      ctx.font = '36px sans-serif';
      ctx.fillText('10 EXAMPLE LANE', 80, 300);
      ctx.fillText('SINGAPORE 018956', 80, 360);
      ctx.font = '22px sans-serif';
      ctx.fillText('Date of issue', 80, 460);
      ctx.font = '32px sans-serif';
      ctx.fillText('02 FEB 2020', 80, 510);
    }
    if (spec.downscale) {
      const small = document.createElement('canvas');
      small.width = spec.downscale;
      small.height = Math.round(canvas.height * (spec.downscale / canvas.width));
      small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
      output = small;
    }
    if (spec.blur) {
      const soft = document.createElement('canvas');
      soft.width = output.width;
      soft.height = output.height;
      const softCtx = soft.getContext('2d');
      softCtx.filter = 'blur(' + spec.blur + 'px)';
      softCtx.drawImage(output, 0, 0);
      output = soft;
    }
    if (spec.glare) {
      const glare = output.getContext('2d');
      const spot = glare.createRadialGradient(output.width * 0.72, output.height * 0.28, 10, output.width * 0.72, output.height * 0.28, output.width * 0.38);
      spot.addColorStop(0, 'rgba(255,255,255,0.82)');
      spot.addColorStop(1, 'rgba(255,255,255,0)');
      glare.fillStyle = spot;
      glare.fillRect(0, 0, output.width, output.height);
    }
    if (spec.perspective) {
      const warped = document.createElement('canvas');
      warped.width = output.width;
      warped.height = output.height;
      const warp = warped.getContext('2d');
      warp.fillStyle = '#e7e1d6';
      warp.fillRect(0, 0, warped.width, warped.height);
      const strips = 48;
      for (let i = 0; i < strips; i++) {
        const t = i / (strips - 1);
        const sw = output.width / strips + 1;
        const sx = output.width / strips * i;
        const shift = (t - 0.5) * output.width * 0.08;
        const destH = output.height * (0.9 + 0.1 * t);
        warp.drawImage(output, sx, 0, sw, output.height, sx + shift, (output.height - destH) / 2, sw, destH);
      }
      output = warped;
    }
    if (spec.turn) {
      const turned = document.createElement('canvas');
      const quarter = spec.turn % 180 !== 0;
      turned.width = quarter ? output.height : output.width;
      turned.height = quarter ? output.width : output.height;
      const turnCtx = turned.getContext('2d');
      turnCtx.translate(turned.width / 2, turned.height / 2);
      turnCtx.rotate(spec.turn * Math.PI / 180);
      turnCtx.drawImage(output, -output.width / 2, -output.height / 2);
      output = turned;
    }
    return output.toDataURL('image/png');
  }, spec);
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
}
const front = { name: 'TAN WEI MING', chinese: '陈伟明', nric: GOOD, paper: '#ffffff', ink: '#111111', rotate: 0 };
await paintCard('/tmp/synthetic-id-clear.png', front);
await paintCard('/tmp/synthetic-id-alias.png', Object.assign({}, front, { alias: 'CHEN WEIMING' }));
await paintCard('/tmp/synthetic-id-alias-wrap.png', Object.assign({}, front, { alias: 'CHEN WEIMING', aliasWrap: true }));
await paintCard('/tmp/synthetic-id-long.png', Object.assign({}, front, { name: 'SITI NUR ALEESYA BINTI MOHAMED ABDUL RAHMAN', chinese: '' }));
await paintCard('/tmp/synthetic-id-faint.png', { name: 'TAN WEI MING', chinese: '陈伟明', nric: GOOD, paper: '#d5d5d5', ink: '#6e6e6e', rotate: 0.1 });
await paintCard('/tmp/synthetic-id-bad.png', { name: 'TAN WEI MING', chinese: '陈伟明', nric: BAD, paper: '#ffffff', ink: '#111111', rotate: 0 });
await paintCard('/tmp/synthetic-id-turn.png', Object.assign({}, front, { turn: 90 }));
await paintCard('/tmp/synthetic-id-skew.png', Object.assign({}, front, { perspective: true }));
await paintCard('/tmp/synthetic-id-glare.png', Object.assign({}, front, { glare: true }));
await paintCard('/tmp/synthetic-id-low.png', Object.assign({}, front, { downscale: 420 }));
await paintCard('/tmp/synthetic-id-blur.png', Object.assign({}, front, { blur: 1.6 }));
await paintCard('/tmp/synthetic-id-back.png', Object.assign({}, front, { side: 'back' }));
await paintCard('/tmp/synthetic-id-fin.png', Object.assign({}, front, { nric: FIN }));
await paintCard('/tmp/synthetic-id-fing.png', Object.assign({}, front, { nric: FIN_G }));
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
  if (!openDesk.noted) {
    await page.waitForFunction(() => /photo and text reading/i.test((document.getElementById('modelState') || {}).textContent || ''));
    const banner = await page.locator('#modelState').innerText();
    check('the first note says photo reading works and the private model is optional', /photo and text reading/i.test(banner) && /private model/i.test(banner) && !/Private model unavailable\. This browser has no WebGPU, so nothing is downloaded/.test(banner), banner.slice(0, 240));
    openDesk.noted = true;
  }
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
async function draftBytes(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('tools-forms-filler');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const draft = await new Promise((resolve, reject) => {
      const req = db.transaction('kv', 'readonly').objectStore('kv').get('draft');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const refs = (draft && draft.refs) || [];
    function size(ref) { return ref && ref.bytes ? ref.bytes.length : 0; }
    const images = refs.filter((ref) => String(ref.mime || '').indexOf('image/') === 0 || /\.png$/i.test(ref.name || ''));
    const pdfs = refs.filter((ref) => ref.mime === 'application/pdf' || /\.pdf$/i.test(ref.name || ''));
    return {
      imageBytes: images.reduce((total, ref) => total + size(ref), 0),
      pdfBytes: pdfs.reduce((total, ref) => total + size(ref), 0)
    };
  });
}
async function reviewText(page) {
  const typed = await page.locator('#reviewList input[type="text"]').evaluateAll((els) => els.map((el) => el.value)).catch(() => []);
  const visible = await page.locator('#reviewList').innerText();
  return (visible + ' ' + typed.join(' ')).replace(/\s+/g, ' ').trim();
}
const review = await reviewText(clearPage);
const starting = await clearPage.locator('#reviewList label').evaluateAll((labels) => labels.map((label) => ({
  text: label.innerText,
  checked: !!(label.querySelector('input[type="checkbox"]') && label.querySelector('input[type="checkbox"]').checked)
})));
check('a consistent valid ID starts checked', starting.some((row) => /nric/i.test(row.text) && row.checked), JSON.stringify(starting));
check('an agreed name with no alias starts checked', starting.some((row) => /name/i.test(row.text) && !/Unconfirmed/i.test(row.text) && row.checked), JSON.stringify(starting));
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
const keptBytes = await draftBytes(clearPage);
check('the confirmed photo is not kept in the saved draft', keptBytes.imageBytes === 0, JSON.stringify(keptBytes));
await clearPage.close();

const badPage = await openDesk();
await attach(badPage, '/tmp/synthetic-id-bad.png');
await badPage.click('#fillBtn');
const badReview = await badPage.waitForSelector('#reviewBox:not([hidden])').then(() => reviewText(badPage)).catch(() => '');
const badFail = await badPage.locator('#failText').innerText().catch(() => '');
const badShown = badReview || badFail;
check('a failed checksum is not proposed', !badShown.includes(BAD) && !/pdf-editor/.test(badPage.url()) && !/Wrote [1-9]/.test(await badPage.locator('#readStatus').innerText().catch(() => '')), badShown.slice(0, 300));
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
await blankPage.reload({ waitUntil: 'domcontentloaded' });
const failedBytes = await draftBytes(blankPage);
check('a failed read leaves no photo bytes after reload', failedBytes.imageBytes === 0, JSON.stringify(failedBytes));
await blankPage.close();

async function staged(page, photo) {
  await page.locator('#formInput').setInputFiles('/tmp/synthetic-bank-form.pdf');
  await page.waitForFunction(() => /Form ready|No lines were found/.test((document.getElementById('readStatus') || {}).textContent || ''));
  await page.locator('#refInput').setInputFiles(['/tmp/synthetic-id-ref.pdf', photo]);
  await page.waitForFunction(() => {
    const rows = Array.from(document.querySelectorAll('.ref-preview'));
    return rows.length >= 2 && rows.every((row) => row.textContent && row.textContent !== 'Reading…');
  });
}
const leavePage = await openDesk();
await staged(leavePage, '/tmp/synthetic-id-clear.png');
await leavePage.click('#fillBtn');
await leavePage.waitForSelector('#reviewBox:not([hidden])');
await leavePage.reload({ waitUntil: 'domcontentloaded' });
const leftBytes = await draftBytes(leavePage);
check('leaving mid-review leaves no photo bytes and keeps the PDF reference', leftBytes.imageBytes === 0 && leftBytes.pdfBytes > 0, JSON.stringify(leftBytes));
await leavePage.close();

const nextPage = await openDesk();
await staged(nextPage, '/tmp/synthetic-id-clear.png');
await nextPage.locator('#formInput').setInputFiles('/tmp/synthetic-bank-form.pdf');
await nextPage.waitForFunction(() => /Form ready|No lines were found/.test((document.getElementById('readStatus') || {}).textContent || ''));
await nextPage.reload({ waitUntil: 'domcontentloaded' });
const nextBytes = await draftBytes(nextPage);
check('a new document leaves no photo bytes and keeps the PDF reference', nextBytes.imageBytes === 0 && nextBytes.pdfBytes > 0, JSON.stringify(nextBytes));
await nextPage.close();

const clearOut = await openDesk();
await staged(clearOut, '/tmp/synthetic-id-clear.png');
await clearOut.click('#clearBtn');
await clearOut.waitForFunction(() => /Started over/.test((document.getElementById('readStatus') || {}).textContent || ''));
await clearOut.reload({ waitUntil: 'domcontentloaded' });
const clearedBytes = await draftBytes(clearOut);
check('start over leaves no photo bytes after reload', clearedBytes.imageBytes === 0, JSON.stringify(clearedBytes));
await clearOut.close();

async function reviewRows(page) {
  return page.locator('#reviewList li').evaluateAll((rows) => rows.map((row) => ({
    text: row.innerText + ' ' + Array.from(row.querySelectorAll('input[type="text"]')).map((el) => el.value).join(' '),
    checked: !!(row.querySelector('input[type="checkbox"]') && row.querySelector('input[type="checkbox"]').checked),
    button: !!(row.querySelector('button') && /Without bracketed name/.test(row.querySelector('button').textContent || ''))
  })));
}
const aliasPage = await openDesk();
await aliasPage.locator('#formInput').setInputFiles('/tmp/synthetic-bank-form.pdf');
await aliasPage.waitForFunction(() => /Form ready|No lines were found/.test((document.getElementById('readStatus') || {}).textContent || ''));
await aliasPage.locator('#refInput').setInputFiles('/tmp/synthetic-id-alias.png');
await aliasPage.waitForFunction(() => {
  const row = document.querySelector('.ref-preview');
  return row && row.textContent && row.textContent !== 'Reading…';
});
await aliasPage.click('#fillBtn');
await aliasPage.waitForSelector('#reviewBox:not([hidden])');
const aliasRows = await reviewRows(aliasPage);
const aliasText = aliasRows.map((row) => row.text).join(' | ');
check('the alias card offers the full printed name', aliasText.includes('TAN WEI MING (CHEN WEIMING)') && aliasRows.some((row) => row.button), aliasText.slice(0, 240));
check('the alias name starts unchecked and the valid ID starts checked', aliasRows.some((row) => /TAN WEI MING \(CHEN WEIMING\)/.test(row.text) && !row.checked) && aliasRows.some((row) => /nric/i.test(row.text) && row.checked), JSON.stringify(aliasRows));
await aliasPage.locator('#reviewList input[type="checkbox"]').evaluateAll((boxes) => boxes.forEach((box) => { box.checked = true; }));
await aliasPage.click('#reviewUse');
await aliasPage.waitForURL(/pdf-editor/);
await aliasPage.waitForSelector('#pages .ann-body');
const aliasMarks = await aliasPage.locator('#pages .ann-body').allInnerTexts();
check('the confirmed full name lands on the applicant line and the debiting line stays blank', aliasMarks.length === 2 && aliasMarks.includes('TAN WEI MING (CHEN WEIMING)') && aliasMarks.includes(GOOD) && !aliasMarks.some((mark) => /Debit/.test(mark)), aliasMarks.join(' | '));
await aliasPage.close();

const wrapPage = await openDesk();
await wrapPage.locator('#formInput').setInputFiles('/tmp/synthetic-bank-form.pdf');
await wrapPage.waitForFunction(() => /Form ready|No lines were found/.test((document.getElementById('readStatus') || {}).textContent || ''));
await wrapPage.locator('#refInput').setInputFiles('/tmp/synthetic-id-alias-wrap.png');
await wrapPage.waitForFunction(() => {
  const row = document.querySelector('.ref-preview');
  return row && row.textContent && row.textContent !== 'Reading…';
});
await wrapPage.click('#fillBtn');
await wrapPage.waitForSelector('#reviewBox:not([hidden])');
check('a wrapped alias is offered in full with a one-tap shorter name', (await reviewRows(wrapPage)).some((row) => row.button && /TAN WEI MING \(CHEN WEIMING\)/.test(row.text)), JSON.stringify(await reviewRows(wrapPage)));
await wrapPage.getByRole('button', { name: 'Without bracketed name' }).click();
const afterTap = await reviewRows(wrapPage);
check('one tap selects the name without the bracketed alias', afterTap.some((row) => /name/i.test(row.text) && row.checked && !/CHEN WEIMING/.test(row.text)), JSON.stringify(afterTap));
await wrapPage.click('#reviewUse');
await wrapPage.waitForURL(/pdf-editor/);
await wrapPage.waitForSelector('#pages .ann-body');
const wrapMarks = await wrapPage.locator('#pages .ann-body').allInnerTexts();
check('the shorter name is what gets written', wrapMarks.some((mark) => mark.replace(/\s+/g, ' ').trim() === 'TAN WEI MING') && !wrapMarks.some((mark) => /CHEN WEIMING/.test(mark)), wrapMarks.join(' | '));
await wrapPage.close();

const longPage = await openDesk();
await longPage.locator('#formInput').setInputFiles('/tmp/synthetic-bank-form.pdf');
await longPage.waitForFunction(() => /Form ready|No lines were found/.test((document.getElementById('readStatus') || {}).textContent || ''));
await longPage.locator('#refInput').setInputFiles('/tmp/synthetic-id-long.png');
await longPage.waitForFunction(() => {
  const row = document.querySelector('.ref-preview');
  return row && row.textContent && row.textContent !== 'Reading…';
});
await longPage.click('#fillBtn');
await longPage.waitForSelector('#reviewBox:not([hidden])');
const longReview = await reviewText(longPage);
check('a long name is offered whole and without an invented alias', longReview.includes('SITI NUR ALEESYA BINTI MOHAMED ABDUL RAHMAN') && !/Without bracketed name/.test(longReview) && !/\(/.test(longReview), longReview.slice(0, 240));
await longPage.close();

async function probe(label, files, want) {
  const page = await openDesk();
  const started = Date.now();
  const list = Array.isArray(files) ? files : [files];
  await page.locator('#formInput').setInputFiles('/tmp/synthetic-bank-form.pdf');
  await page.waitForFunction(() => /Form ready|No lines were found/.test((document.getElementById('readStatus') || {}).textContent || ''));
  page.network.arm();
  await page.locator('#refInput').setInputFiles(list);
  await page.waitForFunction((count) => {
    const rows = Array.from(document.querySelectorAll('.ref-preview'));
    return rows.length >= count && rows.every((row) => row.textContent && row.textContent !== 'Reading…');
  }, list.length);
  await page.click('#fillBtn');
  await page.waitForFunction(() => {
    const review = document.getElementById('reviewBox');
    const fail = document.getElementById('failText');
    return (review && !review.hidden) || (fail && /Could not read/i.test(fail.textContent || ''));
  });
  const ms = Date.now() - started;
  const review = await page.locator('#reviewBox').isVisible() ? await reviewText(page) : '';
  const fail = await page.locator('#failText').innerText().catch(() => '');
  const shown = (review + ' ' + fail).replace(/\s+/g, ' ').trim();
  const ids = shown.match(/[STFGM]\d{7}[A-Z]/g) || [];
  const invalid = ids.filter((id) => !facts.nricChecksum(id));
  const goal = want.id ? want : (want.report || {});
  const hit = !!(goal.id && shown.includes(goal.name) && shown.includes(goal.id));
  console.log('VARIANT', label, 'MS', ms, 'HIT', goal.id ? hit : (want.none ? ids.length === 0 : 'reported'), shown.slice(0, 160));
  check(label + ' proposes no failed checksum', invalid.length === 0 && !/pdf-editor/.test(page.url()), shown.slice(0, 180));
  if (want.id) check(label + ' reads the name and checksum-valid ID', hit, shown.slice(0, 180));
  if (want.none) check(label + ' does not invent an ID', ids.length === 0, shown.slice(0, 180));
  if (want.partial) {
    check(label + ' shows the partial name unconfirmed and unwritten', /Unconfirmed/i.test(shown) && shown.includes(want.partial) && !/pdf-editor/.test(page.url()), shown.slice(0, 200));
    await page.locator('#reviewList input[type="checkbox"]').evaluateAll((boxes) => boxes.forEach((box) => { box.checked = true; }));
    await page.click('#reviewUse');
    await page.waitForURL(/pdf-editor/);
    await page.waitForSelector('#pages .ann-body');
    const marks = await page.locator('#pages .ann-body').allInnerTexts();
    check(label + ' writes the partial name only after it is confirmed', marks.some((mark) => mark.includes(want.partial)), marks.join(' | '));
  }
  await page.close();
}
await probe('faint rotated', '/tmp/synthetic-id-faint.png', { name: 'TAN WEI MING', id: GOOD });
await probe('quarter turn', '/tmp/synthetic-id-turn.png', { name: 'TAN WEI MING', id: GOOD });
await probe('phone skew', '/tmp/synthetic-id-skew.png', { partial: 'WEI MING', report: { name: 'TAN WEI MING', id: GOOD } });
await probe('glare', '/tmp/synthetic-id-glare.png', { report: { name: 'TAN WEI MING', id: GOOD } });
await probe('low resolution', '/tmp/synthetic-id-low.png', { report: { name: 'TAN WEI MING', id: GOOD } });
await probe('blur', '/tmp/synthetic-id-blur.png', { report: { name: 'TAN WEI MING', id: GOOD } });
await probe('FIN F', '/tmp/synthetic-id-fin.png', { name: 'TAN WEI MING', id: FIN });
await probe('FIN G', '/tmp/synthetic-id-fing.png', { name: 'TAN WEI MING', id: FIN_G });
await probe('card back', '/tmp/synthetic-id-back.png', { none: true });
await probe('both sides', ['/tmp/synthetic-id-clear.png', '/tmp/synthetic-id-back.png'], { name: 'TAN WEI MING', id: GOOD });
await browser.close();
console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
if (checks.some((item) => !item.ok)) process.exit(1);
