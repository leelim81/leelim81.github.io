/** Place a missing line keeps keyboard focus in the open placement panel.
 *  Viewport 1280 by 900. This is not a phone. */
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 400) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 260) : ''));
}
const doc = await PDFDocument.create();
doc.addPage([612, 792]).drawText('Full name', { x: 72, y: 700, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
writeFileSync('/tmp/assist-focus.pdf', await doc.save());
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.setDefaultTimeout(20000);
page.on('dialog', async (d) => { if (d.type() === 'prompt') await d.accept('Ada Lane'); else await d.accept(); });
await page.goto('http://127.0.0.1:8777/tools/forms-filler/?focus=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.evaluate(() => ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-editor'].forEach((name) => indexedDB.deleteDatabase(name)));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.click('#profileToggle');
await page.click('#profileAdd');
await page.locator('#factKey').selectOption('name');
await page.locator('#factValue').fill('Ada Lane');
await page.click('#factAdd');
await page.waitForFunction(() => { const input = document.querySelector('#profileFacts input'); return input && input.value === 'Ada Lane'; });
await page.keyboard.press('Escape');
const chooser = page.waitForEvent('filechooser');
await page.click('#formDrop');
await (await chooser).setFiles('/tmp/assist-focus.pdf');
await page.waitForFunction(() => document.getElementById('placeMissing') && !document.getElementById('placeMissing').disabled);
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForFunction(() => /Ada Lane/.test((document.getElementById('recoverPerson') || {}).innerText || ''));
const focus = await page.evaluate(() => {
  const bar = document.getElementById('recoverBar');
  const el = document.activeElement;
  return { open: !!(bar && !bar.hidden), id: el && el.id, inside: !!(bar && bar.contains(el)) };
});
check('the placement panel is open and focus is inside it', focus.open && focus.inside && focus.id === 'recoverPerson', JSON.stringify(focus));
await page.keyboard.press('Tab');
const next = await page.evaluate(() => {
  const bar = document.getElementById('recoverBar');
  return { id: document.activeElement && document.activeElement.id, inside: !!(bar && bar.contains(document.activeElement)) };
});
check('the next tab stays inside the placement panel', next.inside, JSON.stringify(next));
console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
