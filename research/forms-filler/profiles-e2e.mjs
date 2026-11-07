#!/usr/bin/env node
/** Browser checks for saved profiles and the unpacked extension. Synthetic values only. */
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const { chromium } = pkg;
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const ext = join(root, '../../tools/forms-filler/extension');
const report = { chrome: 'Google Chrome', checks: [], limits: [] };
function check(name, ok, detail) {
  report.checks.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'ok ' : 'FAIL ') + name + (detail ? ' ' + detail : ''));
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const site = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const page = await site.newPage();
await page.goto('http://127.0.0.1:8765/tools/forms-filler/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.FormProfiles && window.FormProfileUI);

async function vault() {
  return page.evaluate(async () => (await FormProfiles.load()).vault);
}

await page.evaluate(async () => { await FormProfiles.clearAll(); });
const first = await page.evaluate(async () => {
  const ingested = FormProfiles.ingest(FormProfiles.empty(), {
    facts: [
      { kind: 'name', role: 'applicant', value: 'Ada Example', quote: 'Full name: Ada Example' },
      { kind: 'email', role: 'applicant', value: 'ada@example.com', quote: 'Email: ada@example.com' },
      { kind: 'dob', role: 'patient', value: '01/01/1980', quote: 'patient' }
    ]
  });
  await FormProfiles.persist(ingested.vault);
  return ingested.profileId;
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.FormProfiles);
let stored = await vault();
check('reload keeps extracted profile', stored.profiles.length === 1 && stored.profiles[0].facts.some((f) => f.key === 'email' && f.status === 'unconfirmed'));
check('other person is not stored on the applicant', !JSON.stringify(stored).includes('01/01/1980') || stored.pending.some((row) => row.value === '01/01/1980'));
const profileId = stored.profiles[0].id;
const emailId = stored.profiles[0].facts.filter((f) => f.key === 'email')[0].id;
await page.selectOption('#profilePick', profileId);
const emailRow = page.locator('#profileFacts li', { hasText: 'email' });
await emailRow.locator('input').fill('ada.fixed@example.com');
await emailRow.locator('button', { hasText: 'Save correction' }).click();
await page.waitForFunction(() => document.getElementById('profileMsg').textContent.includes('Saved'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.FormProfiles);
stored = await vault();
const fixed = stored.profiles[0].facts.filter((f) => f.key === 'email')[0];
check('edit survives reload', fixed && fixed.value === 'ada.fixed@example.com' && fixed.status === 'confirmed', fixed && fixed.value);

await page.evaluate(async (pid) => {
  const loaded = await FormProfiles.load();
  const again = FormProfiles.ingest(loaded.vault, {
    facts: [
      { kind: 'name', role: 'applicant', value: 'Ada Example', quote: 'Full name: Ada Example' },
      { kind: 'email', role: 'applicant', value: 'ada.ocr@example.com', quote: 'Email: ada.ocr@example.com' }
    ]
  });
  await FormProfiles.persist(again.vault);
}, profileId);
stored = await vault();
check('re-extract keeps the correction', stored.profiles[0].facts.filter((f) => f.key === 'email')[0].value === 'ada.fixed@example.com');

const editor = await site.newPage();
await editor.goto('http://127.0.0.1:8765/tools/pdf-editor/?desk=forms', { waitUntil: 'domcontentloaded' });
await editor.waitForFunction(() => window.PDFLib && window.FormProfiles);
await editor.evaluate(async (pid) => {
  const doc = await PDFLib.PDFDocument.create();
  doc.addPage([400, 200]);
  const bytes = new Uint8Array(await doc.save());
  const db = await new Promise((resolve, reject) => {
    const open = indexedDB.open('tools-forms-editor', 1);
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains('kv')) open.result.createObjectStore('kv'); };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(bytes, 'pdf');
    tx.objectStore('kv').put({
      fileName: 'synthetic.pdf', zoom: 1, current: 0, epoch: Date.now(), source: 'forms',
      pages: [{ id: 'p1', srcIndex: 0, rotation: 0, annotations: [{
        id: 'a1', type: 'text', x: 0.1, y: 0.2, w: 0.5, h: 0.2,
        text: 'ada.fixed@example.com', fontSize: 14, color: '#1a1612',
        factKey: 'email', profileId: pid, seedText: 'ada.fixed@example.com'
      }] }]
    }, 'session');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}, profileId);
await editor.reload({ waitUntil: 'domcontentloaded' });
await editor.waitForSelector('.ann-body', { timeout: 15000 });
await editor.locator('.ann-body').fill('ada.typed@example.com');
await editor.waitForTimeout(500);
await page.evaluate(async () => FormProfiles.load());
stored = await page.evaluate(async () => (await FormProfiles.load()).vault);
const pdfFact = stored.profiles[0].facts.filter((f) => f.key === 'email')[0];
check('pdf field edit updates the saved value', pdfFact && pdfFact.value === 'ada.typed@example.com' && pdfFact.origin === 'pdf-field', pdfFact && pdfFact.origin + ' ' + pdfFact.value);
await editor.screenshot({ path: join(root, 'visual-e2e/results/screenshots/profile-pdf-edit.png') });

await page.bringToFront();
await page.evaluate(async () => {
  const loaded = await FormProfiles.load();
  const nia = FormProfiles.ingest(FormProfiles.empty(), { facts: [{ kind: 'name', role: 'applicant', value: 'Nia Example', quote: 'n' }, { kind: 'email', role: 'applicant', value: 'nia@example.com', quote: 'e' }] });
  loaded.vault.profiles.push(nia.vault.profiles[0]);
  const confirmed = FormProfiles.confirmFact(loaded.vault, nia.vault.profiles[0].id, 'email', 'nia@example.com');
  await FormProfiles.persist(confirmed.vault);
});
stored = await vault();
check('profiles stay separate', stored.profiles.length === 2 && stored.profiles.filter((p) => p.name === 'Ada Example')[0].facts.every((f) => f.value !== 'nia@example.com'));

await page.selectOption('#profilePick', profileId);
await page.selectOption('#factKey', 'custom');
await page.fill('#factLabel', 'Desk code');
await page.fill('#factValue', '42');
await page.click('#factAdd');
await page.waitForFunction(() => document.getElementById('profileMsg').textContent.includes('Saved'));
stored = await vault();
check('custom label is stored', stored.profiles[0].facts.some((f) => f.label === 'Desk code' && f.value === '42'));

const conflict = await page.evaluate(async () => {
  const loaded = await FormProfiles.load();
  const next = FormProfiles.ingest(loaded.vault, { facts: [
    { kind: 'name', role: 'applicant', value: 'Ada Example', quote: 'a' },
    { kind: 'name', role: 'applicant', value: 'Bea Example', quote: 'b' }
  ] });
  await FormProfiles.persist(next.vault);
  return next.vault.pending.some((row) => row.reason === 'conflict');
});
check('two names stay unfiled', conflict);

const deskId = stored.profiles[0].facts.filter((f) => f.label === 'Desk code')[0].id;
await page.evaluate(async (fid) => {
  const loaded = await FormProfiles.load();
  const pid = loaded.vault.profiles[0].id;
  await FormProfiles.persist(FormProfiles.deleteFact(loaded.vault, pid, fid).vault);
}, deskId);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.FormProfiles);
stored = await vault();
check('deleted value stays deleted', !stored.profiles[0].facts.some((f) => f.label === 'Desk code'));

await page.evaluate(async () => {
  await DeskDB.set('tools-forms-profiles', 'vault', { schema: 0, entries: [{ person: 'Bea Example', key: 'phone', value: '80000000', corrected: true }] });
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.FormProfiles);
stored = await vault();
check('old schema migrates', stored.schema === 1 && stored.profiles.some((p) => p.name === 'Bea Example' && p.facts[0].status === 'confirmed'));

const quota = await page.evaluate(async () => {
  const real = DeskDB.set;
  DeskDB.set = function () { return Promise.reject(new DOMException('full', 'QuotaExceededError')); };
  const result = await FormProfiles.persist(FormProfiles.empty());
  DeskDB.set = real;
  return result.reason;
});
check('quota failure is reported', quota === 'quota', quota);
const blocked = await page.evaluate(async () => {
  const real = DeskDB.get;
  DeskDB.get = function () { return Promise.reject(new DOMException('no', 'SecurityError')); };
  const result = await FormProfiles.load();
  DeskDB.get = real;
  return result.reason;
});
check('blocked storage is reported', blocked === 'blocked', blocked);

await page.evaluate(async () => { await FormProfiles.clearAll(); await FormProfiles.persist(FormProfiles.empty()); });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.FormProfiles);
stored = await vault();
check('clear removes profiles and pending', stored.profiles.length === 0 && stored.pending.length === 0);

const hostile = await page.evaluate(async () => FormProfiles.importBundle({ kind: 'forms-filler-profiles', schema: 1, profiles: [{ name: 'A', facts: [{ key: '__proto__', label: 'x', value: 'y', status: 'confirmed' }] }] }));
check('hostile import is rejected', hostile.reason === 'hostile');

await page.screenshot({ path: join(root, 'visual-e2e/results/screenshots/profile-manager.png'), fullPage: true });
await editor.close();
await site.close();
await browser.close();

async function exercise(form, facts, requests) {
  await form.addScriptTag({ path: join(ext, 'match.js') });
  await form.addScriptTag({ path: join(ext, 'scan.js') });
  const scan = await form.evaluate(() => globalThis.__ffScan);
  check('shipped scan sees label and autocomplete', scan.fields.some((f) => f.label.includes('Full name') && f.autocomplete === 'name'));
  check('shipped scan marks password and otp secret', scan.fields.filter((f) => f.secret).length >= 2);
  check('shipped scan marks hidden, readonly, disabled', scan.fields.some((f) => f.hidden) && scan.fields.some((f) => f.readOnly) && scan.fields.some((f) => f.disabled));
  check('shipped scan counts a frame and a shadow tree', scan.unsupported.frames === 1 && scan.unsupported.shadow === 1, JSON.stringify(scan.unsupported));
  const rows = await form.evaluate((list) => FormMatch.plan(globalThis.__ffScan, list), facts);
  check('ambiguous note is not filled', rows.some((row) => row.field.tag === 'textarea' && row.skip === 'ambiguous'));
  check('nonempty email is protected', rows.some((row) => row.field.autocomplete === 'email' && row.skip === 'nonempty'));
  const jobs = rows.filter((row) => row.fact && !row.skip).map((row) => ({ token: row.field.token, value: row.fact.value, replace: false }));
  const city = scan.fields.filter((field) => field.tag === 'select')[0];
  if (city) jobs.push({ token: city.token, value: 'North', replace: false });
  await form.evaluate((list) => { globalThis.__ffJobs = list; }, jobs);
  await form.addScriptTag({ path: join(ext, 'apply.js') });
  const dom = await form.evaluate(() => ({
    name: document.getElementById('n').value,
    email: document.getElementById('e').value,
    phone: document.getElementById('p').value,
    city: document.getElementById('city').value,
    note: document.getElementById('note').value,
    password: document.getElementById('pw').value,
    otp: document.getElementById('otp').value,
    hidden: document.getElementById('hid').value,
    readonly: document.getElementById('ro').value,
    disabled: document.getElementById('dis').value,
    filled: document.getElementById('filled').value,
    shadow: document.getElementById('host').shadowRoot.querySelector('input').value,
    submitted: document.getElementById('submitted').textContent
  }));
  check('static name email phone filled from the chosen profile', dom.name === 'Ada Example' && dom.email === 'ada@example.com' && dom.phone === '80000000', JSON.stringify(dom));
  check('secret hidden readonly disabled nonempty shadow and note stay put', dom.password === '' && dom.otp === '' && dom.hidden === '' && dom.readonly === 'keep-me' && dom.filled === 'already@example.com' && dom.shadow === '' && dom.note === '', JSON.stringify(dom));
  check('no autosubmit', dom.submitted === 'no');
  check('no profile value in a network request', !requests.some((url) => url.includes('ada@example.com') || url.includes('nia@example.com')));
  check('select receives an approved option', dom.city === 'North');
  await form.screenshot({ path: join(root, 'visual-e2e/results/screenshots/extension-static-fill.png'), fullPage: true });
}

async function exerciseControlled(controlled) {
  await controlled.goto('http://127.0.0.1:8765/tools/forms-filler/extension/fixtures/controlled-form.html');
  await controlled.addScriptTag({ path: join(ext, 'scan.js') });
  const token = await controlled.evaluate(() => globalThis.__ffScan.fields.filter((field) => field.autocomplete === 'email')[0].token);
  await controlled.evaluate((value) => { globalThis.__ffJobs = [{ token: value.token, value: 'ada@example.com', replace: false }]; }, { token });
  await controlled.addScriptTag({ path: join(ext, 'apply.js') });
  const seen = await controlled.evaluate(() => ({
    value: document.getElementById('mail').value,
    mirror: document.getElementById('mirror').textContent,
    input: window.__seen.input,
    change: window.__seen.change
  }));
  check('controlled input receives value and input/change events', seen.value === 'ada@example.com' && seen.mirror === 'ada@example.com' && seen.input >= 1 && seen.change >= 1, JSON.stringify(seen));
}

const userDir = '/tmp/ff-ext-profile';
const chromiumBin = '/home/ubuntu/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';
const context = await chromium.launchPersistentContext(userDir, {
  executablePath: chromiumBin,
  headless: true,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: ['--no-sandbox', '--disable-dev-shm-usage', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
});
let sw;
try {
  sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
} catch (err) {
  sw = null;
  report.limits.push(String(err && err.message || err));
}
check('unpacked extension loaded', !!sw, sw && sw.url());
if (sw) {
  const id = sw.url().split('/')[2];
  const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
  check('permissions are storage, activeTab, scripting', JSON.stringify(manifest.permissions) === JSON.stringify(['storage', 'activeTab', 'scripting']) && !manifest.host_permissions);
  const bundle = {
    kind: 'forms-filler-profiles',
    schema: 1,
    profiles: [
      { id: 'ada', name: 'Ada Example', facts: [
        { key: 'name', label: 'name', value: 'Ada Example', status: 'confirmed' },
        { key: 'email', label: 'email', value: 'ada@example.com', status: 'confirmed' },
        { key: 'phone', label: 'phone', value: '80000000', status: 'confirmed' },
        { key: 'custom', label: 'Note', value: 'Hello note', status: 'confirmed' },
        { key: 'custom', label: 'Note', value: 'Other note', status: 'confirmed' }
      ] },
      { id: 'nia', name: 'Nia Example', facts: [{ key: 'email', label: 'email', value: 'nia@example.com', status: 'confirmed' }] }
    ]
  };
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.setInputFiles('#file', { name: 'profiles.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle)) });
  await popup.waitForFunction(() => document.getElementById('status').textContent.includes('Imported'));
  check('extension import stores the bundle', await popup.evaluate(async () => (await chrome.storage.local.get('bundle')).bundle.profiles.length === 2));
  const badFile = await popup.evaluate(async () => {
    const raw = { kind: 'forms-filler-profiles', schema: 1, profiles: [{ name: 'A', facts: [{ key: 'email', label: 'e', value: 'a@example.com', status: 'unconfirmed' }] }] };
    const status = document.getElementById('status');
    const input = document.getElementById('file');
    const dt = new DataTransfer();
    dt.items.add(new File([JSON.stringify(raw)], 'bad.json', { type: 'application/json' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 200));
    return status.textContent;
  });
  check('extension rejects unconfirmed import', /reject|malformed|not a profile/i.test(badFile), badFile);

  const form = await context.newPage();
  const requests = [];
  form.on('request', (req) => requests.push(req.url()));
  await form.goto('http://127.0.0.1:8765/tools/forms-filler/extension/fixtures/static-form.html');
  await popup.bringToFront();
  await popup.selectOption('#profile', 'ada');
  await form.bringToFront();
  const ran = await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab) return { error: 'no-tab' };
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['scan.js'] });
      const packed = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.__ffScan });
      return { scan: packed[0].result, url: tab.url || '' };
    } catch (err) {
      return { error: String(err), url: tab.url || '', id: tab.id };
    }
  });
  const gestureDenied = ran.error && /permission|activeTab|host/i.test(ran.error);
  if (gestureDenied) {
    check('extension does not script a page without the toolbar grant', true, ran.error);
    report.limits.push('Headless Chromium loaded the unpacked extension but did not grant activeTab without a toolbar click, so scan.js and apply.js were executed from the extension folder in the page. ' + ran.error);
    await exercise(form, bundle.profiles[0].facts, requests);
  } else if (ran.error) {
    check('extension can scan the local form', false, ran.error);
  } else {
    const scan = ran.scan;
    check('scan sees label, autocomplete, and name fields', scan.fields.some((f) => f.label.includes('Full name') && f.autocomplete === 'name'));
    check('scan marks password and otp secret', scan.fields.filter((f) => f.secret).length >= 2);
    check('scan marks hidden, readonly, disabled', scan.fields.some((f) => f.hidden) && scan.fields.some((f) => f.readOnly) && scan.fields.some((f) => f.disabled));
    check('scan counts a frame and a shadow tree', scan.unsupported.frames === 1 && scan.unsupported.shadow === 1, JSON.stringify(scan.unsupported));
    const jobs = scan.fields.filter((f) => f.autocomplete === 'email' && f.empty).map((f) => ({ token: f.token, value: 'ada@example.com', replace: false }));
    const nameJob = scan.fields.filter((f) => f.autocomplete === 'name').map((f) => ({ token: f.token, value: 'Ada Example', replace: false }));
    const phoneJob = scan.fields.filter((f) => f.autocomplete === 'tel').map((f) => ({ token: f.token, value: '80000000', replace: false }));
    const city = scan.fields.filter((f) => f.tag === 'select');
    const note = scan.fields.filter((f) => f.tag === 'textarea');
    const filled = scan.fields.filter((f) => f.autocomplete === 'email' && !f.empty);
    const secret = scan.fields.filter((f) => f.secret).map((f) => ({ token: f.token, value: 'should-not', replace: true }));
    const all = nameJob.concat(jobs, phoneJob, city.map((f) => ({ token: f.token, value: 'North', replace: false })), note.map((f) => ({ token: f.token, value: 'Hello note', replace: false })), secret);
    const applied = await sw.evaluate(async (list) => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (jobs) => { globalThis.__ffJobs = jobs; }, args: [list] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['apply.js'] });
      const packed = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.__ffApply });
      return packed[0].result;
    }, all);
    const dom = await form.evaluate(() => ({
      name: document.getElementById('n').value,
      email: document.getElementById('e').value,
      phone: document.getElementById('p').value,
      city: document.getElementById('city').value,
      note: document.getElementById('note').value,
      password: document.getElementById('pw').value,
      otp: document.getElementById('otp').value,
      hidden: document.getElementById('hid').value,
      readonly: document.getElementById('ro').value,
      disabled: document.getElementById('dis').value,
      filled: document.getElementById('filled').value,
      shadow: document.getElementById('host').shadowRoot.querySelector('input').value,
      submitted: document.getElementById('submitted').textContent
    }));
    check('static name email phone select textarea filled', dom.name === 'Ada Example' && dom.email === 'ada@example.com' && dom.phone === '80000000' && dom.city === 'North' && dom.note === 'Hello note', JSON.stringify(dom));
    check('secret hidden readonly disabled nonempty and shadow stay put', dom.password === '' && dom.otp === '' && dom.hidden === '' && dom.readonly === 'keep-me' && dom.filled === 'already@example.com' && dom.shadow === '', JSON.stringify(dom));
    check('no autosubmit', dom.submitted === 'no');
    check('no profile value in a new network request', !requests.some((url) => url.includes('ada@example.com') || url.includes('nia@example.com')));
    check('apply touched only allowed fields', applied && applied.touched && !secret.some((job) => applied.touched.includes(job.token)));
    await form.screenshot({ path: join(root, 'visual-e2e/results/screenshots/extension-static-fill.png'), fullPage: true });
  }

  const controlled = await context.newPage();
  if (gestureDenied) await exerciseControlled(controlled);
  else {
  await controlled.goto('http://127.0.0.1:8765/tools/forms-filler/extension/fixtures/controlled-form.html');
  await controlled.bringToFront();
  const controlledResult = await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab) return { error: 'no-tab' };
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['scan.js'] });
      const packed = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.__ffScan });
      const email = packed[0].result.fields.filter((field) => field.autocomplete === 'email')[0];
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (jobs) => { globalThis.__ffJobs = jobs; }, args: [[{ token: email.token, value: 'ada@example.com', replace: false }]] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['apply.js'] });
      return { ok: true };
    } catch (err) {
      return { error: String(err) };
    }
  });
  if (!controlledResult.error) {
    const seen = await controlled.evaluate(() => ({
      value: document.getElementById('mail').value,
      mirror: document.getElementById('mirror').textContent,
      input: window.__seen.input,
      change: window.__seen.change
    }));
    check('controlled input receives value and input/change events', seen.value === 'ada@example.com' && seen.mirror === 'ada@example.com' && seen.input >= 1 && seen.change >= 1, JSON.stringify(seen));
  } else {
    check('controlled input', false, controlledResult.error);
  }
  }
  const niaLeak = await form.evaluate(() => document.body.innerText.includes('nia@example.com')).catch(() => false);
  check('other profile was not written into the page', niaLeak === false);
  await popup.screenshot({ path: join(root, 'visual-e2e/results/screenshots/extension-popup.png') });
}
await context.close();

const outDir = join(root, 'visual-e2e/results');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'profiles-e2e.json'), JSON.stringify(report, null, 2));
const failed = report.checks.filter((item) => !item.ok);
if (failed.length) {
  console.log(JSON.stringify({ failed, limits: report.limits }, null, 2));
  process.exit(1);
}
console.log('profiles e2e ok', report.checks.length);
