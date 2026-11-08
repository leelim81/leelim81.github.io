/** A composing Escape belongs to the input method. A later composition end must not move focus.
 *  Viewport 390 by 700. This is not a phone. */
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 500) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 300) : ''));
}
function snap() {
  const el = document.activeElement;
  return {
    focus: el && (el.id || el.className || el.tagName),
    editing: !!(el && el.classList && el.classList.contains('ann-body')),
    rendered: Array.from(document.querySelectorAll('.ann-body')).map((node) => node.innerText),
    person: (document.getElementById('recoverPerson').selectedOptions[0] || {}).textContent || '',
    download: document.getElementById('downloadModal').hidden,
    sig: document.getElementById('sigModal').hidden,
    empty: !document.getElementById('empty').hidden
  };
}
const doc = await PDFDocument.create();
doc.addPage([612, 792]).drawText('Full name', { x: 72, y: 700, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
writeFileSync('/tmp/ime-blank.pdf', await doc.save());
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 700 } })).newPage();
page.setDefaultTimeout(20000);
page.on('dialog', (dialog) => dialog.accept());
await page.goto('http://127.0.0.1:8777/tools/pdf-editor/?ime=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.evaluate(() => ['tools-forms-editor', 'tools-forms-profiles'].forEach((name) => indexedDB.deleteDatabase(name)));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  const loaded = await FormProfiles.load();
  const now = new Date().toISOString();
  const vault = loaded.vault;
  vault.profiles.push({ id: 'ada', name: 'Ada Lane', createdAt: now, updatedAt: now, facts: [] });
  vault.profiles.push({ id: 'bea', name: 'Bea Shore', createdAt: now, updatedAt: now, facts: [] });
  await FormProfiles.persist(vault);
});
await page.locator('#fileInput').setInputFiles('/tmp/ime-blank.pdf');
await page.waitForFunction(() => document.querySelector('#pages .layer'));
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
await page.locator('#addText').focus();
await page.keyboard.press('Enter');
await page.keyboard.type('Bea Two');
const host = await page.evaluate(() => {
  const body = document.activeElement;
  const before = body.innerText;
  const inserted = document.execCommand('insertText', false, 'Q');
  const afterInsert = body.innerText;
  const undone = document.execCommand('undo');
  return {
    before,
    inserted,
    afterInsert,
    undone,
    afterUndo: body.innerText,
    count: document.querySelectorAll('.ann').length,
    undoDisabled: document.getElementById('recoverUndo').disabled,
    focus: document.activeElement.className
  };
});
check('editing-host undo does not consume annotation undo', host.inserted && host.afterInsert === 'Bea TwoQ' && host.afterUndo === 'Bea TwoQ' && host.count === 2 && host.undoDisabled === false && host.focus === 'ann-body', JSON.stringify(host));
const beforeKey = await page.locator('.ann-body').last().innerText();
await page.keyboard.press('Control+z');
const afterKey = await page.evaluate(() => ({
  text: document.activeElement.innerText,
  editing: document.activeElement.classList.contains('ann-body'),
  count: document.querySelectorAll('.ann').length,
  undoDisabled: document.getElementById('recoverUndo').disabled
}));
check('the browser Ctrl+Z chord does not consume annotation undo', afterKey.editing && afterKey.count === 2 && afterKey.undoDisabled === false && afterKey.text === beforeKey, JSON.stringify({ beforeKey, afterKey }));
const split = await page.evaluate(() => {
  const marks = Array.from(document.querySelectorAll('.ann-body'));
  const second = marks[marks.length - 1];
  const first = marks[0];
  second.focus();
  second.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 229, which: 229, isComposing: false, bubbles: true, cancelable: true }));
  const after229 = {
    focus: document.activeElement === second,
    text: second.innerText
  };
  first.focus();
  second.dispatchEvent(new CompositionEvent('compositionend', { data: '', bubbles: true }));
  const afterEnd = {
    focus: document.activeElement === first,
    id: document.activeElement && document.activeElement.id,
    texts: marks.map((node) => node.innerText)
  };
  second.focus();
  second.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, isComposing: true, bubbles: true, cancelable: true }));
  const afterComposing = document.activeElement === second && /Bea Two/.test(second.innerText);
  first.focus();
  document.dispatchEvent(new CompositionEvent('compositionend', { data: '测', bubbles: true }));
  return {
    after229,
    afterEnd,
    afterComposing,
    afterUnrelated: {
      focus: document.activeElement === first,
      id: document.activeElement && document.activeElement.id,
      texts: Array.from(document.querySelectorAll('.ann-body')).map((node) => node.innerText)
    }
  };
});
check('keyCode 229 alone stays in the mark', split.after229.focus && /Bea Two/.test(split.after229.text), JSON.stringify(split.after229));
check('a later composition end does not follow the caret to Text', split.afterEnd.focus && split.afterEnd.id !== 'addText' && split.afterEnd.texts.some((text) => /Bea Two/.test(text)), JSON.stringify(split.afterEnd));
check('isComposing Escape alone stays in the mark', split.afterComposing, '');
check('an unrelated composition end leaves the other mark focused', split.afterUnrelated.focus && split.afterUnrelated.id !== 'addText' && split.afterUnrelated.texts.some((text) => /Bea Note/.test(text)) && split.afterUnrelated.texts.some((text) => /Bea Two/.test(text)) && !split.afterUnrelated.texts.some((text) => /Ada Secret/.test(text)), JSON.stringify(split.afterUnrelated));
const person = await page.evaluate(() => {
  const body = document.querySelectorAll('.ann-body')[1];
  body.focus();
  body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 229, which: 229, isComposing: false, bubbles: true, cancelable: true }));
  return body.innerText;
});
await page.locator('#recoverPerson').selectOption({ label: 'Ada Lane' });
await page.waitForFunction(() => Array.from(document.querySelectorAll('.ann-body')).some((node) => /Ada Secret/.test(node.innerText)));
const afterPerson = await page.evaluate(() => {
  document.dispatchEvent(new CompositionEvent('compositionend', { data: '', bubbles: true }));
  const el = document.activeElement;
  return {
    focus: el && (el.id || el.className || el.tagName),
    rendered: Array.from(document.querySelectorAll('.ann-body')).map((node) => node.innerText),
    person: document.getElementById('recoverPerson').selectedOptions[0].textContent
  };
});
check('a late composition end does not steal focus or reveal Bea', afterPerson.person === 'Ada Lane' && afterPerson.focus !== 'addText' && afterPerson.rendered.some((text) => /Ada Secret/.test(text)) && !afterPerson.rendered.some((text) => /Bea/.test(text)), JSON.stringify({ armed: person, afterPerson }));
await page.locator('#recoverPerson').selectOption({ label: 'Bea Shore' });
await page.waitForFunction(() => Array.from(document.querySelectorAll('.ann-body')).some((node) => /Bea Two/.test(node.innerText)));
await page.locator('#downloadBtn').focus();
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.getElementById('downloadModal').contains(document.activeElement));
const download = await page.evaluate(() => {
  const before = document.activeElement.id;
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 229, which: 229, isComposing: false, bubbles: true, cancelable: true }));
  const after229 = { open: !document.getElementById('downloadModal').hidden, focus: document.activeElement.id };
  document.querySelector('.ann-body').dispatchEvent(new CompositionEvent('compositionend', { data: '', bubbles: true }));
  return { before, after229, afterEnd: { open: !document.getElementById('downloadModal').hidden, focus: document.activeElement.id } };
});
check('keyCode 229 and a composition end leave Download open', download.after229.open && download.after229.focus === download.before && download.afterEnd.open && download.afterEnd.focus === download.before, JSON.stringify(download));
await page.keyboard.press('Escape');
const closedDownload = await page.evaluate(() => ({ hidden: document.getElementById('downloadModal').hidden, id: document.activeElement && document.activeElement.id }));
check('a later non-composing Escape still closes Download', closedDownload.hidden && closedDownload.id === 'downloadBtn', JSON.stringify(closedDownload));
await page.locator('#addSignature').click();
await page.waitForFunction(() => !document.getElementById('sigModal').hidden);
const sig = await page.evaluate(() => {
  document.getElementById('sigClose').focus();
  const before = document.activeElement.id;
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, isComposing: true, bubbles: true, cancelable: true }));
  const afterComposing = { open: !document.getElementById('sigModal').hidden, focus: document.activeElement.id };
  document.dispatchEvent(new CompositionEvent('compositionend', { data: '', bubbles: true }));
  return { before, afterComposing, afterEnd: { open: !document.getElementById('sigModal').hidden, focus: document.activeElement.id } };
});
check('isComposing Escape and a composition end leave Signature open', sig.afterComposing.open && sig.afterComposing.focus === 'sigClose' && sig.afterEnd.open && sig.afterEnd.focus === 'sigClose', JSON.stringify(sig));
await page.keyboard.press('Escape');
const closedSig = await page.evaluate(() => document.getElementById('sigModal').hidden);
check('a later non-composing Escape closes Signature', closedSig, '');
const gone = await page.evaluate(() => {
  const body = document.querySelector('.ann-body');
  body.focus();
  body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 229, which: 229, isComposing: true, bubbles: true, cancelable: true }));
  const text = body.innerText;
  body.remove();
  document.dispatchEvent(new CompositionEvent('compositionend', { data: '', bubbles: true }));
  const el = document.activeElement;
  return { text, focus: el && (el.id || el.className || el.tagName), rendered: Array.from(document.querySelectorAll('.ann-body')).map((node) => node.innerText) };
});
check('a composition end after the mark is gone does not focus Text', gone.text === 'Bea Note' && gone.focus !== 'addText' && gone.rendered.some((text) => /Bea Two/.test(text)) && !gone.rendered.some((text) => /Ada Secret/.test(text)), JSON.stringify(gone));
await page.locator('#startOver').click();
await page.waitForFunction(() => !document.getElementById('empty').hidden);
await page.locator('#fileInput').setInputFiles('/tmp/ime-blank.pdf');
await page.waitForFunction(() => document.querySelector('#pages .layer'));
const fresh = await page.evaluate(() => {
  document.dispatchEvent(new CompositionEvent('compositionend', { data: '测', bubbles: true }));
  const el = document.activeElement;
  return {
    focus: el && (el.id || el.className || el.tagName),
    rendered: Array.from(document.querySelectorAll('.ann-body')).map((node) => node.innerText),
    empty: !document.getElementById('empty').hidden
  };
});
check('a new document ignores the earlier composition', !fresh.empty && fresh.focus !== 'addText' && fresh.rendered.length === 0, JSON.stringify(fresh));
await page.locator('#addText').focus();
await page.keyboard.press('Enter');
await page.keyboard.type('Kept');
await page.keyboard.press('Escape');
const left = await page.evaluate(snap);
check('a non-composing Escape still leaves the current text focused on Text', left.focus === 'addText' && !left.editing && left.rendered.includes('Kept'), JSON.stringify(left));
console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
