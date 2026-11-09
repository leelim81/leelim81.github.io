/** A 390 by 700 desktop window shows the manual actions without a second WebGPU banner.
 *  The private model stays unavailable. This is not a phone. */
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
await page.goto('http://127.0.0.1:8777/tools/forms-filler/?screen=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.evaluate(() => ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-maps', 'tools-forms-editor'].forEach((name) => indexedDB.deleteDatabase(name)));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.FormProfiles && /unavailable|Checking/.test(document.getElementById('modelState').textContent || ''));
const screen = await page.evaluate(() => {
  function box(id) {
    const el = document.getElementById(id);
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY), hidden: !!el.hidden };
  }
  return {
    vh: window.innerHeight,
    gpu: box('gpuWarn'),
    model: (document.getElementById('modelState').textContent || ''),
    fill: box('fillBtn'),
    saved: box('profileToggle'),
    ext: box('extensionTitle'),
    privacy: document.querySelector('.privacy').textContent
  };
});
check('the duplicate WebGPU box is not on the first screen', screen.gpu.hidden && screen.gpu.bottom === 0, JSON.stringify(screen.gpu));
check('the model status still says photo reading works and the private model is off', /Photo and text reading still work/.test(screen.model) && /optional private model is off/.test(screen.model) && /nothing is downloaded/.test(screen.model) && !/autofill/i.test(screen.model), screen.model);
check('Fill from the papers fits in the 390 by 700 window', screen.fill.bottom <= screen.vh && screen.fill.top >= 0, JSON.stringify({ fill: screen.fill, vh: screen.vh }));
check('Saved values stays before the extension, and the privacy line stays', screen.saved.top < screen.ext.top && /Nothing is uploaded/.test(screen.privacy), JSON.stringify({ saved: screen.saved.top, ext: screen.ext.top }));
await page.click('#profileToggle');
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
await (await download).saveAs('/tmp/first-screen-export.json');
const exported = JSON.parse(readFileSync('/tmp/first-screen-export.json', 'utf8')).profiles[0].facts.map((fact) => fact.value).join('|');
check('a manual correction reloads and exports', exported === 'Ada Lane', exported);
console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
