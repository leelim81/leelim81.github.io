#!/usr/bin/env node
/** Editor disclosure: collapsed until asked, Escape cancels, narrow page stays usable. */
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument } = require('pdf-lib');
const { chromium } = pkg;
const root = dirname(fileURLToPath(import.meta.url));
const shot = join(root, 'results/screenshots');
const doc = await PDFDocument.create();
doc.addPage([420, 540]);
doc.addPage([420, 540]);
writeFileSync('/tmp/release-two-page.pdf', await doc.save());
const report = { checks: [] };
function check(name, ok, detail) {
  report.checks.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'ok ' : 'FAIL ') + name);
}
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await page.waitForFunction(() => window.FormProfiles);
await page.evaluate(async () => {
  await FormProfiles.clearAll();
  const loaded = await FormProfiles.load();
  loaded.vault.profiles.push({ id: 'ada', name: 'Ada', createdAt: '', updatedAt: '', facts: [{ id: 'e', key: 'email', label: 'email', value: 'ada@example.com', status: 'confirmed', origin: 'user', quote: '', updatedAt: '' }] });
  await FormProfiles.persist(loaded.vault);
});
await page.goto('http://127.0.0.1:8765/tools/pdf-editor/');
await page.setInputFiles('#fileInput', '/tmp/release-two-page.pdf');
await page.locator('#assistToggle').waitFor();
const closed = await page.evaluate(() => ({
  place: document.getElementById('recoverBar').hidden,
  map: document.getElementById('mapBox').hidden,
  expanded: document.getElementById('assistToggle').getAttribute('aria-expanded'),
  text: !document.getElementById('addText').hidden && !document.getElementById('toolbar').hidden,
  download: !document.getElementById('downloadBtn').hidden,
  pageBox: document.querySelector('.page').getBoundingClientRect().height
}));
check('ordinary open keeps place and map closed and leaves Text and Download', closed.place && closed.map && closed.expanded === 'false' && closed.text && closed.download && closed.pageBox > 200, JSON.stringify(closed));
await page.screenshot({ path: join(shot, 'editor-collapsed-desktop.png') });
await page.setViewportSize({ width: 390, height: 844 });
const narrow = await page.evaluate(() => ({
  scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  assist: document.getElementById('assistBar').getBoundingClientRect().width
}));
check('a narrow editor does not clip the assist buttons', !narrow.scroll && narrow.assist <= 390, JSON.stringify(narrow));
await page.screenshot({ path: join(shot, 'editor-collapsed-narrow.png'), fullPage: true });
await page.setViewportSize({ width: 1100, height: 800 });
await page.click('#assistToggle');
await page.locator('#recoverBar').waitFor({ state: 'visible' });
await page.locator('#recoverPerson').waitFor();
check('Place a saved value opens the controls and focuses one', await page.evaluate(() => document.activeElement && document.getElementById('recoverBar').contains(document.activeElement)));
await page.click('#recoverPlace');
const armed = await page.locator('#recoverStatus').innerText();
check('arming a placement is explicit', /click the page/i.test(armed), armed);
await page.keyboard.press('Escape');
const afterEsc = await page.evaluate(() => ({
  hidden: document.getElementById('recoverBar').hidden,
  focus: document.activeElement && document.activeElement.id
}));
check('Escape closes placement and returns to the button', afterEsc.hidden && afterEsc.focus === 'assistToggle', armed + ' / ' + JSON.stringify(afterEsc));
await page.locator('.layer').first().click({ position: { x: 40, y: 40 } });
check('a click after Escape does not place a value', await page.locator('.ann').count() === 0);
await page.click('#mapToggle');
await page.locator('#mapBox').waitFor({ state: 'visible' });
check('Blank map opens without hiding Text', await page.locator('#addText').isVisible() && await page.locator('#addSignature').isVisible());
await page.screenshot({ path: join(shot, 'editor-map-open.png') });
await page.keyboard.press('Escape');
await page.reload();
await page.locator('#assistToggle').waitFor();
check('reload starts with the panels closed', await page.locator('#recoverBar').isHidden() && await page.locator('#mapBox').isHidden());
writeFileSync(join(root, 'results/release-ux.json'), JSON.stringify(report, null, 2) + '\n');
await browser.close();
if (report.checks.some((item) => !item.ok)) process.exit(1);
