/** A value typed before the new person is stored stays unsaved and visible.
 *  Viewport 1100 by 900, plus one 390 by 844 window. These are not phones. */
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 500) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 300) : ''));
}
const prompts = [];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
page.setDefaultTimeout(20000);
page.on('dialog', async (dialog) => {
  const next = prompts.shift();
  if (dialog.type() !== 'prompt') { await dialog.accept(); return; }
  await dialog.accept(next == null ? '' : next);
});
async function people() {
  return page.evaluate(async () => {
    const loaded = await FormProfiles.load();
    return loaded.vault.profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      facts: profile.facts.map((fact) => fact.key + '=' + fact.value)
    }));
  });
}
async function picked() {
  return page.evaluate(() => {
    const pick = document.getElementById('profilePick');
    const option = pick.selectedOptions[0];
    return { id: pick.value, label: option ? option.textContent : '' };
  });
}
function holdNextPersist() {
  return page.evaluate(() => {
    const persist = FormProfiles.persist.bind(FormProfiles);
    let release;
    let held = false;
    window.__releasePersist = () => { if (release) release(); };
    FormProfiles.persist = function (vault, decide) {
      if (held) return persist(vault, decide);
      held = true;
      return new Promise((resolve) => {
        release = () => { FormProfiles.persist = persist; resolve(persist(vault, decide)); };
      });
    };
  });
}

await page.goto('http://127.0.0.1:8777/tools/forms-filler/?ready=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.evaluate(() => indexedDB.deleteDatabase('tools-forms-profiles'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.click('#profileToggle');
prompts.push('Ada Lane');
await page.click('#profileAdd');
await page.waitForFunction(() => (document.getElementById('profileMsg') || {}).textContent === 'Person added on this browser.');
await page.locator('#factKey').selectOption('name');
await page.locator('#factValue').fill('Ada Kept');
await page.click('#factAdd');
await page.waitForFunction(() => { const input = document.querySelector('#profileFacts input'); return input && input.value === 'Ada Kept'; });
const adaId = (await picked()).id;

await holdNextPersist();
prompts.push('Bea Early');
await page.click('#profileAdd');
await page.locator('#factKey').selectOption('name');
await page.locator('#factValue').fill('Early Text');
await page.click('#factAdd');
const refused = await page.locator('#profileMsg').innerText();
const refusedBox = await page.locator('#factValue').inputValue();
const refusedStore = await people();
check('an immediate Add is refused and the typed value stays in the box', /not saved yet/.test(refused) && /Nothing was written/.test(refused) && refusedBox === 'Early Text' && !JSON.stringify(refusedStore).includes('Early Text') && refusedStore.filter((profile) => profile.id === adaId)[0].facts.join('|') === 'name=Ada Kept', refused + ' ' + refusedBox);
await page.evaluate(() => window.__releasePersist());
await page.waitForFunction(() => /Person added/.test((document.getElementById('profileMsg') || {}).textContent || ''));
const finished = await page.locator('#profileMsg').innerText();
const finishedBox = await page.locator('#factValue').inputValue();
const finishedFacts = await page.locator('#profileFacts').innerText();
const finishedStore = await people();
check('the later success does not hide that the value was not saved', /Person added/.test(finished) && /not saved yet/.test(finished) && /Press Add value to save it/.test(finished) && finishedBox === 'Early Text' && !/Early Text/.test(finishedFacts) && !JSON.stringify(finishedStore).includes('Early Text'), finished);
await page.click('#factAdd');
await page.waitForFunction(() => { const input = document.querySelector('#profileFacts input'); return input && input.value === 'Early Text'; });
const saved = await people();
check('pressing Add value again saves the same text without retyping', saved.filter((profile) => profile.name === 'Bea Early')[0].facts.join('|') === 'name=Early Text' && saved.filter((profile) => profile.id === adaId)[0].facts.join('|') === 'name=Ada Kept', JSON.stringify(saved));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.click('#profileToggle');
await page.waitForFunction(() => {
  const pick = document.getElementById('profilePick');
  const input = document.querySelector('#profileFacts input');
  return !!(pick.selectedOptions[0] && pick.selectedOptions[0].textContent === 'Ada Lane' && input && input.value === 'Ada Kept');
});
await page.locator('#profilePick').selectOption({ label: 'Bea Early' });
await page.waitForFunction(() => { const input = document.querySelector('#profileFacts input'); return input && input.value === 'Early Text'; });
check('reload keeps Early Text on Bea and Ada Kept on Ada', true);

await holdNextPersist();
prompts.push('Cora Switch');
await page.click('#profileAdd');
await page.locator('#factValue').fill('Switch Text');
await page.locator('#profilePick').selectOption({ label: 'Ada Lane' });
await page.evaluate(() => window.__releasePersist());
await page.waitForFunction(() => /Person added/.test((document.getElementById('profileMsg') || {}).textContent || ''));
const switchDone = await page.locator('#profileMsg').innerText();
const switchBox = await page.locator('#factValue').inputValue();
const switchStore = await people();
const cora = switchStore.filter((profile) => profile.name === 'Cora Switch')[0];
const adaAfter = switchStore.filter((profile) => profile.id === adaId)[0];
check('finishing the create does not retarget the typed value', /not saved/.test(switchDone) && !/Press Add value/.test(switchDone) && switchBox === 'Switch Text' && cora.facts.length === 0 && adaAfter.facts.join('|') === 'name=Ada Kept' && !JSON.stringify(switchStore).includes('Switch Text'), switchDone + ' ' + JSON.stringify(switchStore));

await page.evaluate(() => {
  const persist = FormProfiles.persist.bind(FormProfiles);
  let release;
  let held = false;
  window.__releaseFail = () => { if (release) release(); };
  FormProfiles.persist = function (vault, decide) {
    if (held) return persist(vault, decide);
    held = true;
    return new Promise((resolve) => { release = () => { FormProfiles.persist = persist; resolve({ ok: false, reason: 'unavailable' }); }; });
  };
});
prompts.push('Fail Person');
await page.click('#profileAdd');
await page.locator('#factValue').fill('Fail Text');
await page.click('#factAdd');
await page.evaluate(() => window.__releaseFail());
await page.waitForFunction(() => /Nothing was saved/.test((document.getElementById('profileMsg') || {}).textContent || ''));
const failedMsg = await page.locator('#profileMsg').innerText();
const failedBox = await page.locator('#factValue').inputValue();
const failedStore = await people();
check('a failed create does not save the typed value or say the person was added', /Nothing was saved/.test(failedMsg) && !/Person added/.test(failedMsg) && failedBox === 'Fail Text' && !failedStore.some((profile) => profile.name === 'Fail Person') && !JSON.stringify(failedStore).includes('Fail Text'), failedMsg + ' ' + failedBox);

const narrow = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
narrow.setDefaultTimeout(20000);
const narrowPrompts = ['Ada Keys'];
narrow.on('dialog', async (dialog) => {
  if (dialog.type() !== 'prompt') { await dialog.accept(); return; }
  await dialog.accept(narrowPrompts.shift() || '');
});
await narrow.goto('http://127.0.0.1:8777/tools/forms-filler/?keys=' + Date.now(), { waitUntil: 'domcontentloaded' });
await narrow.evaluate(() => indexedDB.deleteDatabase('tools-forms-profiles'));
await narrow.reload({ waitUntil: 'domcontentloaded' });
await narrow.locator('#profileToggle').focus();
await narrow.keyboard.press('Enter');
for (let i = 0; i < 8 && await narrow.evaluate(() => document.activeElement.id) !== 'profileAdd'; i++) await narrow.keyboard.press('Tab');
await narrow.keyboard.press('Enter');
await narrow.waitForFunction(() => (document.getElementById('profileMsg') || {}).textContent === 'Person added on this browser.');
for (let i = 0; i < 8 && await narrow.evaluate(() => document.activeElement.id) !== 'factValue'; i++) await narrow.keyboard.press('Tab');
await narrow.keyboard.type('Keyboard Kept');
for (let i = 0; i < 4 && await narrow.evaluate(() => document.activeElement.id) !== 'factAdd'; i++) await narrow.keyboard.press('Tab');
await narrow.keyboard.press('Enter');
await narrow.waitForFunction(() => { const input = document.querySelector('#profileFacts input'); return input && input.value === 'Keyboard Kept'; });
await narrow.reload({ waitUntil: 'domcontentloaded' });
await narrow.locator('#profileToggle').click();
await narrow.waitForFunction(() => {
  const pick = document.getElementById('profilePick');
  const input = document.querySelector('#profileFacts input');
  return !!(pick.selectedOptions[0] && pick.selectedOptions[0].textContent === 'Ada Keys' && input && input.value === 'Keyboard Kept');
});
check('keyboard Add value survives reload with that person selected', true);
await narrow.close();

console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
