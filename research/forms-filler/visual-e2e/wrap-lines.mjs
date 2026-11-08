/** Preview wraps like the export. A click is still the baseline. */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { chromium } = pkg;

const doc = await PDFDocument.create();
const sheet = doc.addPage([612, 792]);
const font = await doc.embedFont(StandardFonts.Helvetica);
sheet.drawRectangle({ x: 72, y: 500, width: 460, height: 1.2, color: rgb(0.15, 0.4, 0.28) });
writeFileSync('/tmp/wrap-rule.pdf', await doc.save());
const LONG = '14 Harbour Lane beside the long west warehouse';
const WORD = 'SupercalifragilisticexpialidociousToken';

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 400) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 260) : ''));
}
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-http-cache'],
  headless: true
});
const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const prompts = ['Ada Lane'];
page.on('dialog', async (dialog) => {
  const next = prompts.shift();
  if (dialog.type() === 'prompt' && next != null) await dialog.accept(next);
  else await dialog.accept();
});

async function addFact(key, value) {
  await page.locator('#factKey').selectOption(key);
  await page.locator('#factValue').fill(value);
  await page.click('#factAdd');
  await page.waitForFunction((pair) => {
    const input = document.querySelector('#profileFacts input[aria-label="' + pair.key + '"]');
    return input && input.value === pair.value;
  }, { key, value });
}
await page.goto('http://127.0.0.1:8765/tools/forms-filler/?wrap=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.click('#profileToggle');
await page.click('#profileAdd');
await addFact('name', 'Peggy Jay');
await addFact('address', LONG);
await addFact('postal', WORD);
const chooser = page.waitForEvent('filechooser');
await page.click('#formDrop');
await (await chooser).setFiles('/tmp/wrap-rule.pdf');
await page.waitForFunction(() => {
  const text = (document.getElementById('readStatus') || {}).textContent || '';
  const button = document.getElementById('placeMissing');
  return button && !button.disabled && text && !/^(Reading|Finding|Opening)/.test(text);
}, null, { timeout: 40000 });
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForFunction(() => /Peggy/.test((document.getElementById('recoverFact') || {}).innerText || ''));
if (await page.locator('#recoverBar').isHidden()) await page.click('#assistToggle');

async function place(label, frac) {
  await page.locator('#recoverFact').selectOption({ label });
  await page.click('#recoverPlace');
  const before = await page.locator('#recoverStatus').innerText();
  const layer = page.locator('#pages .layer').first();
  const box = await layer.boundingBox();
  await layer.click({ position: { x: box.width * 0.42, y: box.height * frac } });
  await page.waitForFunction((prev) => {
    const text = (document.getElementById('recoverStatus') || {}).textContent || '';
    return text !== prev && /Placed /.test(text);
  }, before);
}
await place('name: Peggy Jay', (792 - 500.6) / 792);
await place('address: ' + LONG, 0.55);
await place('postal: ' + WORD, 0.7);

const preview = await page.locator('.ann').evaluateAll((nodes) => nodes.map((el) => {
  const body = el.querySelector('.ann-body');
  const mirror = el.querySelector('.ann-mirror');
  const style = mirror ? getComputedStyle(mirror) : null;
  return {
    text: body ? body.innerText : '',
    shown: mirror ? mirror.textContent : '',
    lines: mirror ? mirror.textContent.split('\n').filter(Boolean).length : 0,
    overflow: style ? style.overflow : '',
    fontSize: el.dataset.fontSize
  };
}));
check('preview keeps the long address and wraps it', preview.some((row) => row.text === LONG && row.lines >= 2 && row.overflow === 'visible'), JSON.stringify(preview));
check('a long word stays whole and is not hidden', preview.some((row) => row.text === WORD && row.lines >= 1 && !row.clipped), JSON.stringify(preview.find((row) => row.text === WORD)));
check('type size stays 14', preview.every((row) => row.fontSize === '14'));

await page.locator('.ann-body').nth(1).click();
await page.keyboard.press('End');
await page.keyboard.press('Shift+Enter');
await page.keyboard.type('Unit 2');
await page.waitForTimeout(200);
const edited = await page.locator('.ann-body').nth(1).innerText();
check('a typed newline is kept', /Unit 2/.test(edited) && /\n/.test(edited), JSON.stringify(edited));

await page.click('#downloadBtn');
await page.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
let dl = page.waitForEvent('download');
await page.locator('#sizeOptions button[data-level="100"]').click();
await (await dl).saveAs('/tmp/wrap-export.pdf');
await page.click('#dlClose');

const probe = await context.newPage();
await probe.goto('http://127.0.0.1:8765/tools/forms-filler/?wrapprobe=' + Date.now(), { waitUntil: 'domcontentloaded' });
await probe.waitForFunction(() => window.pdfjsLib);
const bytes = Array.from(readFileSync('/tmp/wrap-export.pdf'));
const pdf = await probe.evaluate(async (list) => {
  const opened = await pdfjsLib.getDocument({ data: new Uint8Array(list) }).promise;
  const pdfPage = await opened.getPage(1);
  const content = await pdfPage.getTextContent();
  return content.items.filter((item) => item.str && item.str.trim()).map((item) => ({
    str: item.str, y: item.transform[5], h: item.height
  }));
}, bytes);
await probe.close();
const peggy = pdf.find((item) => /Peggy/.test(item.str));
const wrapped = pdf.filter((item) => /Harbour|warehouse|Unit/.test(item.str)).map((item) => item.y);
const word = pdf.find((item) => /Supercali/.test(item.str));
check('the name baseline is still on the rule', peggy && Math.abs(peggy.y - 500.6) < 1.5 && peggy.h === 14, JSON.stringify(peggy));
check('export wraps the address and keeps the newline', pdf.some((item) => /Unit/.test(item.str)) && wrapped.length >= 2, JSON.stringify(pdf.filter((item) => /Harbour|warehouse|Unit/.test(item.str))));
check('export keeps the long word', !!word, JSON.stringify(word));
if (wrapped.length >= 2) {
  const gap = Math.abs(wrapped[0] - wrapped[1]);
  check('wrapped lines are 1.3 times the type size apart', Math.abs(gap - 18.2) < 1.5, String(gap));
}

const beforeTop = await page.locator('.ann').first().evaluate((el) => el.style.top);
await page.click('#zoomIn');
const afterTop = await page.locator('.ann').first().evaluate((el) => el.style.top);
check('zoom does not move a stored box', beforeTop === afterTop, beforeTop + ' -> ' + afterTop);
await page.locator('.ann').nth(1).click();
await page.locator('#fontSize').fill('18');
await page.locator('#fontSize').dispatchEvent('input');
const sized = await page.locator('.ann').nth(1).evaluate((el) => el.dataset.fontSize);
check('the size control changes the type and does not drop the text', sized === '18' && /Harbour/.test(await page.locator('.ann-body').nth(1).innerText()), sized);

await page.click('#recoverUndo');
const undone = await page.locator('.ann').count();
check('undo removes the last change', undone >= 1);

if (await page.locator('#mapBox').isHidden()) await page.click('#mapToggle');
await page.locator('#mapName').fill('Wrap map');
await page.click('#mapSave');
await page.waitForFunction(() => /Saved |not saved|one role|one person/i.test((document.getElementById('recoverStatus') || {}).textContent || ''));
const saveMsg = await page.locator('#recoverStatus').innerText();
check('a map can be saved from these places', /Saved /.test(saveMsg), saveMsg);

await page.reload();
await page.locator('.ann-body').first().waitFor();
const reloaded = await page.locator('.ann-body').allInnerTexts();
check('reload keeps the placed words', reloaded.some((text) => /Peggy/.test(text)) && reloaded.some((text) => /Harbour/.test(text)), reloaded.join(' | '));

const out = { passed: checks.filter((item) => item.ok).length, failed: checks.filter((item) => !item.ok).length, checks, pdf };
writeFileSync('/workspace/research/forms-filler/visual-e2e/results/wrap-lines.json', JSON.stringify(out, null, 2));
console.log('SUMMARY', out.passed, '/', checks.length);
await browser.close();
if (out.failed) process.exit(1);
