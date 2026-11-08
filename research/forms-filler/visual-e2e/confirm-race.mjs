/** A slow save must not confirm a value under a person or kind chosen later. */
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument } = require('pdf-lib');
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 300) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 220) : ''));
}
const doc = await PDFDocument.create();
doc.addPage([612, 792]);
writeFileSync('/tmp/race-blank.pdf', await doc.save());
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.setDefaultTimeout(30000);

async function freshEditor() {
  await page.goto('http://127.0.0.1:8788/tools/forms-filler/?race=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-maps', 'tools-forms-editor'].forEach((name) => indexedDB.deleteDatabase(name));
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const chooser = page.waitForEvent('filechooser');
  await page.click('#formDrop');
  await (await chooser).setFiles('/tmp/race-blank.pdf');
  await page.waitForFunction(() => {
    const button = document.getElementById('placeMissing');
    return button && !button.disabled;
  });
  await page.click('#placeMissing');
  await page.waitForURL(/pdf-editor/);
  await page.waitForSelector('#recoverPersonName');
}
async function addPerson(name) {
  await page.locator('#recoverPersonName').fill(name);
  await page.click('#recoverAddPerson');
  await page.waitForFunction((wanted) => {
    return Array.from(document.getElementById('recoverPerson').options).some((opt) => opt.textContent === wanted);
  }, name);
}
async function facts() {
  return page.evaluate(async () => {
    const loaded = await FormProfiles.load();
    return (loaded.vault.profiles || []).map((profile) => ({
      name: profile.name,
      facts: (profile.facts || []).map((fact) => fact.key + '=' + fact.value + ':' + fact.status)
    }));
  });
}
async function delayLoad() {
  await page.evaluate(() => {
    if (!FormProfiles.__realLoad) FormProfiles.__realLoad = FormProfiles.load.bind(FormProfiles);
    const real = FormProfiles.__realLoad;
    let armed = true;
    FormProfiles.load = function () {
      if (!armed) return real();
      armed = false;
      return new Promise(function (resolve) { window.__releaseLoad = function () { resolve(real()); }; });
    };
  });
}
async function release() {
  await page.evaluate(() => window.__releaseLoad && window.__releaseLoad());
  await page.waitForFunction(() => !document.getElementById('recoverAddFact').disabled && !document.getElementById('recoverAddPerson').disabled);
}

await freshEditor();
await addPerson('Ada Lane');
await delayLoad();
await page.locator('#recoverFactValue').fill('Secret Name');
await page.click('#recoverAddFact');
check('the save controls lock while the store is loading', await page.locator('#recoverAddFact').isDisabled() && await page.locator('#recoverFactKey').isDisabled());
await page.locator('#recoverFactKey').evaluate((el) => { el.disabled = false; el.value = 'email'; });
await page.locator('#recoverPerson').evaluate((el) => { el.disabled = false; });
await release();
let stored = await facts();
check('changing the kind during the load confirms nothing', stored.length === 1 && stored[0].facts.length === 0, JSON.stringify(stored));
check('the controls come back after the cancelled save', await page.locator('#recoverAddFact').isEnabled());

await page.evaluate(async () => {
  const loaded = await FormProfiles.load();
  loaded.vault.profiles.push({ id: 'bea-race', name: 'Bea Shore', createdAt: '', updatedAt: '', facts: [] });
  await FormProfiles.persist(loaded.vault);
});
await page.reload();
await page.waitForSelector('#assistToggle');
if (await page.locator('#recoverBar').isHidden()) await page.click('#assistToggle');
await page.locator('#recoverPerson').selectOption({ label: 'Ada Lane' });
await page.waitForSelector('#recoverFactCreate:not([hidden])');
await delayLoad();
await page.locator('#recoverFactValue').fill('Secret Name');
await page.click('#recoverAddFact');
await page.locator('#recoverPerson').evaluate((el) => { el.disabled = false; el.value = 'bea-race'; });
await page.locator('#recoverFactKey').evaluate((el) => { el.disabled = false; el.value = 'postal'; });
await release();
stored = await facts();
check('changing the person during the load confirms nothing', stored.every((profile) => profile.facts.length === 0), JSON.stringify(stored));

await delayLoad();
await page.locator('#recoverFactValue').fill('Secret Name');
await page.click('#recoverAddFact');
await page.keyboard.press('Escape');
await release();
stored = await facts();
check('closing the bar during the load confirms nothing', stored.every((profile) => profile.facts.length === 0), JSON.stringify(stored));
if (await page.locator('#recoverBar').isHidden()) await page.click('#assistToggle');
await page.locator('#recoverPerson').selectOption({ label: 'Ada Lane' });

await delayLoad();
await page.locator('#recoverFactValue').fill('Secret Name');
await page.click('#recoverAddFact');
await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
await release();
stored = await facts();
check('leaving the page during the load confirms nothing', stored.every((profile) => profile.facts.length === 0), JSON.stringify(stored));

if (await page.locator('#recoverBar').isHidden()) await page.click('#assistToggle');
await page.locator('#recoverPerson').selectOption({ label: 'Bea Shore' });
await page.locator('#recoverFactKey').selectOption('name');
await page.waitForSelector('#recoverFactCreate:not([hidden])');
await page.evaluate(() => {
  if (!FormProfiles.__realLoad) FormProfiles.__realLoad = FormProfiles.load.bind(FormProfiles);
});
await delayLoad();
await page.locator('#recoverFactValue').fill('Replacement');
await page.click('#recoverAddFact');
await page.evaluate(async () => {
  const cur = await FormProfiles.__realLoad();
  const bea = cur.vault.profiles.filter((profile) => profile.id === 'bea-race')[0];
  bea.facts.push({ id: 'kept', key: 'name', label: 'name', value: 'Bea Original', status: 'confirmed', origin: 'user', quote: '', updatedAt: '' });
  await FormProfiles.persist(cur.vault);
});
await release();
stored = await facts();
const bea = stored.filter((profile) => profile.name === 'Bea Shore')[0];
check('a confirmed name is not replaced by a late save', bea && bea.facts.some((fact) => fact.indexOf('name=Bea Original') === 0) && !bea.facts.some((fact) => fact.indexOf('Replacement') >= 0), JSON.stringify(bea));

await page.goto('http://127.0.0.1:8788/tools/forms-filler/?raceperson=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  ['tools-forms-profiles', 'tools-forms-editor', 'tools-forms-filler'].forEach((name) => indexedDB.deleteDatabase(name));
  sessionStorage.clear();
});
await page.reload({ waitUntil: 'domcontentloaded' });
const chooser = page.waitForEvent('filechooser');
await page.click('#formDrop');
await (await chooser).setFiles('/tmp/race-blank.pdf');
await page.waitForFunction(() => document.getElementById('placeMissing') && !document.getElementById('placeMissing').disabled);
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForSelector('#recoverPersonName');
await page.evaluate(() => {
  const real = FormProfiles.load.bind(FormProfiles);
  let pending = null;
  FormProfiles.load = function () {
    if (pending) return pending;
    pending = new Promise(function (resolve) { window.__releaseLoad = function () { resolve(real()); }; });
    return pending;
  };
});
await page.locator('#recoverPersonName').fill('Ada Lane');
await page.click('#recoverAddPerson');
await page.locator('#recoverAddPerson').click({ force: true }).catch(() => {});
await page.locator('#recoverPersonName').evaluate((el) => { el.value = 'Bea Shore'; });
await page.keyboard.press('Escape');
await release();
stored = await facts();
check('a cancelled or renamed first person is not stored', stored.length === 0, JSON.stringify(stored));
check('the person controls are usable again', await page.locator('#recoverAddPerson').isEnabled());

if (await page.locator('#recoverBar').isHidden()) await page.click('#assistToggle');
await page.evaluate(() => {
  const real = FormProfiles.__realLoad || FormProfiles.load.bind(FormProfiles);
  FormProfiles.__realLoad = real;
  FormProfiles.load = function () { return Promise.reject(new Error('store down')); };
});
await page.locator('#recoverPersonName').fill('Cora');
await page.click('#recoverAddPerson');
await page.waitForFunction(() => !document.getElementById('recoverAddPerson').disabled);
await page.evaluate(() => { FormProfiles.load = FormProfiles.__realLoad; });
stored = await facts();
check('a failed load restores the controls and stores nothing', stored.length === 0 && await page.locator('#recoverAddPerson').isEnabled() && await page.locator('#recoverPersonName').isEnabled(), JSON.stringify(stored));

await freshEditor();
await page.locator('#recoverPersonName').fill('Ada Lane');
await page.click('#recoverAddPerson');
await page.waitForFunction(() => /no confirmed value yet/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
await page.evaluate(() => {
  const real = FormProfiles.persist.bind(FormProfiles);
  window.__realPersist = real;
  FormProfiles.persist = function (vault, decide) {
    return new Promise(function (resolve) {
      window.__releasePersist = function () { resolve(real(vault, decide)); };
    });
  };
});
await page.evaluate(() => { window.__releasePersist = null; });
await page.locator('#recoverFactValue').fill('During commit');
await page.click('#recoverAddFact');
await page.waitForFunction(() => typeof window.__releasePersist === 'function');
await page.locator('#recoverFactKey').evaluate((el) => { el.value = 'email'; el.dispatchEvent(new Event('change')); });
await page.evaluate(() => window.__releasePersist());
await page.waitForFunction(() => !document.getElementById('recoverAddFact').disabled);
stored = await facts();
const during = stored.filter((profile) => profile.name === 'Ada Lane')[0];
check('a kind change during the commit confirms nothing', during && during.facts.length === 0, JSON.stringify(during));
check('a refused commit does not say the value was saved', !/was saved/.test(await page.locator('#recoverStatus').innerText()), await page.locator('#recoverStatus').innerText());

await page.evaluate(() => {
  const real = window.__realPersist;
  FormProfiles.persist = function (vault, decide) {
    return real(vault, decide).then(function (result) {
      return new Promise(function (resolve) { window.__releasePersist = function () { resolve(result); }; });
    });
  };
});
await page.locator('#recoverFactKey').selectOption('name');
await page.evaluate(() => { window.__releasePersist = null; });
await page.locator('#recoverFactValue').fill('Ada Lane');
await page.click('#recoverAddFact');
await page.waitForFunction(() => typeof window.__releasePersist === 'function');
await page.keyboard.press('Escape');
await page.evaluate(() => window.__releasePersist());
await page.waitForFunction(() => /was saved|already confirmed|Choose the person/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
stored = await facts();
const written = stored.filter((profile) => profile.name === 'Ada Lane')[0];
const afterWrite = await page.locator('#recoverStatus').innerText();
check('a commit that finished is not described as storing nothing', written && written.facts.some((fact) => fact.indexOf('name=Ada Lane') === 0) && !/Nothing was confirmed/.test(afterWrite), afterWrite + ' ' + JSON.stringify(written));

await freshEditor();
await page.locator('#recoverPersonName').fill('Ada Lane');
await page.click('#recoverAddPerson');
await page.waitForFunction(() => /no confirmed value yet/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
await page.evaluate(() => {
  const real = FormProfiles.persist.bind(FormProfiles);
  window.__realPersist = real;
  FormProfiles.persist = function (vault, decide) {
    return new Promise(function (resolve) { window.__releasePersist = function () { resolve(real(vault, decide)); }; });
  };
});
await page.evaluate(() => { window.__releasePersist = null; });
await page.locator('#recoverFactValue').fill('Replacement');
await page.click('#recoverAddFact');
await page.waitForFunction(() => typeof window.__releasePersist === 'function');
await page.evaluate(async () => {
  const cur = await FormProfiles.load();
  const ada = cur.vault.profiles.filter((profile) => profile.name === 'Ada Lane')[0];
  ada.facts.push({ id: 'kept', key: 'name', label: 'name', value: 'Ada Original', status: 'confirmed', origin: 'user', quote: '', updatedAt: '' });
  await window.__realPersist(cur.vault);
});
await page.evaluate(() => window.__releasePersist());
await page.waitForFunction(() => /already saved|Nothing was replaced/.test((document.getElementById('recoverStatus') || {}).textContent || ''));
stored = await facts();
const conflicted = stored.filter((profile) => profile.name === 'Ada Lane')[0];
check('a confirmed value written during the commit is not replaced', conflicted && conflicted.facts.some((fact) => fact.indexOf('name=Ada Original') === 0) && !conflicted.facts.some((fact) => fact.indexOf('Replacement') >= 0), JSON.stringify(conflicted));

const out = { passed: checks.filter((item) => item.ok).length, failed: checks.filter((item) => !item.ok).length, checks };
writeFileSync('/tmp/place-gate/research/forms-filler/visual-e2e/results/confirm-race.json', JSON.stringify(out, null, 2));
console.log('SUMMARY', out.passed, '/', checks.length);
await browser.close();
if (out.failed) process.exit(1);
