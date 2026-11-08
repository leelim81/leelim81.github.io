/** At a 390 by 700 window, fill, correction, export, and Saved values come before the extension instructions.
 *  This is a desktop browser viewport, not a phone. */
import { readFileSync } from 'fs';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 400) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 240) : ''));
}
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 700 }, acceptDownloads: true })).newPage();
page.on('dialog', (dialog) => dialog.accept('Ada Lane'));
page.setDefaultTimeout(20000);
await page.goto('http://127.0.0.1:8777/tools/forms-filler/?narrow=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.evaluate(() => ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-maps', 'tools-forms-editor'].forEach((name) => indexedDB.deleteDatabase(name)));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.FormProfiles && document.getElementById('profileToggle'));
const order = await page.evaluate(() => {
  function top(id) {
    const el = document.getElementById(id);
    const r = el.getBoundingClientRect();
    return Math.round(r.top + window.scrollY);
  }
  const saved = document.getElementById('profileToggle');
  const ext = document.getElementById('extensionTitle');
  return {
    fill: top('fillBtn'),
    saved: top('profileToggle'),
    ext: top('extensionTitle'),
    zip: top('extensionZip'),
    savedFirst: !!(saved.compareDocumentPosition(ext) & Node.DOCUMENT_POSITION_FOLLOWING),
    extHidden: document.getElementById('extensionHelp').hidden,
    privacy: document.querySelector('.privacy').textContent
  };
});
check('Saved values is before the extension instructions', order.savedFirst && order.saved < order.ext && order.fill < order.ext, JSON.stringify(order));
check('the extension download and the privacy line stay available', !order.extHidden && order.zip > order.ext && /Nothing is uploaded/.test(order.privacy), order.privacy.slice(0, 80));
const tabs = [];
await page.evaluate(() => document.body.focus());
for (let i = 0; i < 20; i++) {
  await page.keyboard.press('Tab');
  const id = await page.evaluate(() => document.activeElement ? document.activeElement.id : '');
  if (id) tabs.push(id);
  if (id === 'extensionZip') break;
}
check('keyboard order reaches Saved values before the extension download', tabs.indexOf('profileToggle') >= 0 && tabs.indexOf('profileToggle') < tabs.indexOf('extensionZip'), tabs.join(' > '));
await page.click('#profileToggle');
await page.waitForFunction(() => document.getElementById('profilePick').options.length >= 0);
await page.click('#profileAdd');
await page.waitForFunction(() => document.getElementById('profilePick').options.length > 0);
await page.locator('#factKey').selectOption('name');
await page.fill('#factValue', 'Ada Old');
await page.click('#factAdd');
await page.waitForFunction(async () => {
  const loaded = await FormProfiles.load();
  const fact = loaded.ok && loaded.vault.profiles[0] && loaded.vault.profiles[0].facts[0];
  return !!(fact && fact.value === 'Ada Old');
});
await page.locator('#profileFacts input').fill('Ada Lane');
await page.locator('#profileFacts button', { hasText: 'Save correction' }).click();
await page.waitForFunction(async () => {
  const loaded = await FormProfiles.load();
  const fact = loaded.ok && loaded.vault.profiles[0] && loaded.vault.profiles[0].facts[0];
  return !!(fact && fact.value === 'Ada Lane');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.click('#profileToggle');
await page.waitForFunction(() => document.querySelector('#profileFacts input') && document.querySelector('#profileFacts input').value === 'Ada Lane');
const download = page.waitForEvent('download');
await page.click('#profileExport');
await (await download).saveAs('/tmp/narrow-export.json');
const exported = JSON.parse(readFileSync('/tmp/narrow-export.json', 'utf8')).profiles[0].facts.map((fact) => fact.value).join('|');
check('a correction survives reload and the export', exported === 'Ada Lane', exported);
const openTabs = [];
await page.evaluate(() => document.getElementById('profileExport').focus());
await page.keyboard.press('Tab');
for (let i = 0; i < 15; i++) {
  const id = await page.evaluate(() => document.activeElement ? document.activeElement.id : '');
  if (id) openTabs.push(id);
  if (id === 'extensionZip') break;
  await page.keyboard.press('Tab');
}
check('from Export, the next reachable help is still the extension', openTabs.includes('extensionZip'), openTabs.join(' > '));
console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
