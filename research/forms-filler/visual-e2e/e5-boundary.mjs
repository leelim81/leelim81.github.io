#!/usr/bin/env node
/** Headed check of extension 0.1.2 role and stale-field boundaries. */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const { chromium } = pkg;
const root = dirname(fileURLToPath(import.meta.url));
const zipPath = join(root, '../../../tools/forms-filler/extension/forms-filler-profiles-0.1.2.zip');
const ext = '/tmp/ff-e5-ext';
const userDir = '/tmp/ff-e5-profile';
spawnSync('rm', ['-rf', ext, userDir]);
spawnSync('mkdir', ['-p', ext]);
if (spawnSync('unzip', ['-q', '-o', zipPath, '-d', ext]).status !== 0) throw new Error('unzip failed');
const report = {
  browser: 'Playwright Chromium 131.0.6778.33',
  extension: '0.1.2',
  checks: [],
  limits: [
    'This is Chromium 131, not current Chrome stable. Chrome stable was not loaded.',
    'No phone was used. A 390px viewport is not a phone.',
    'Closed shadow cannot be seen by the page scan. It is not filled. Open shadow and frames are counted and not filled.',
    'The shortcut is Ctrl+Shift+Y from _execute_action. It is the toolbar action, not a host-permission grant.'
  ]
};
function check(name, ok, detail) {
  report.checks.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'ok ' : 'FAIL ') + name);
}
function pressShortcut() {
  const ids = spawnSync('xdotool', ['search', '--class', 'chromium'], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean);
  const target = ids[ids.length - 1] || '';
  if (target) spawnSync('xdotool', ['windowactivate', '--sync', target]);
  spawnSync('xdotool', ['key', '--clearmodifiers', 'ctrl+shift+y']);
}
spawnSync('pkill', ['-f', 'chrome-linux/chrome']);
const context = await chromium.launchPersistentContext(userDir, {
  executablePath: '/home/ubuntu/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
  headless: false,
  viewport: null,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [
    '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=9226',
    '--window-size=1100,720', '--window-position=0,0',
    `--disable-extensions-except=${ext}`, `--load-extension=${ext}`
  ]
});
const page = context.pages()[0] || await context.newPage();
const modelRequests = [];
page.on('request', (req) => { if (/onnx|ort-wasm|form-field-v1/.test(req.url())) modelRequests.push(req.url()); });
await page.goto('http://127.0.0.1:8765/tools/forms-filler/');
await page.waitForFunction(() => window.FormProfiles && document.getElementById('placeMissing'));
check('saved values start collapsed and recovery is offered', await page.locator('#profileBox').isHidden() && await page.locator('#placeMissing').count() === 1);
const href = await page.locator('#extensionZip').getAttribute('href');
const zipUrl = new URL(href, page.url());
const fetched = Buffer.from(await (await fetch(zipUrl)).arrayBuffer());
const disk = readFileSync(zipPath);
check('the page link is the 0.1.2 zip', href.endsWith('forms-filler-profiles-0.1.2.zip') && fetched.equals(disk), createHash('sha256').update(disk).digest('hex'));
check('the forms page did not request the detector', modelRequests.length === 0);
const editorHtml = await (await fetch('http://127.0.0.1:8765/tools/pdf-editor/')).text();
check('the editor still has recovery and blank maps', editorHtml.includes('id="recoverPlace"') && editorHtml.includes('id="mapSave"'));
await page.screenshot({ path: join(root, 'results/screenshots/e5-collapsed.png') });

await page.goto('http://127.0.0.1:8765/tools/forms-filler/extension/fixtures/boundary-form.html');
await page.bringToFront();
await page.locator('#plain').click();
await new Promise((r) => setTimeout(r, 400));
pressShortcut();
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9226');
let popup = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('popup.html'));
check('the shortcut opens the popup', !!popup);
const bundle = {
  kind: 'forms-filler-profiles', schema: 1,
  profiles: [{
    id: 'ada', name: 'Ada Boundary',
    facts: [
      { key: 'email', label: 'email', value: 'SENTINEL_E5_EMAIL', status: 'confirmed' },
      { key: 'phone', label: 'phone', value: 'SENTINEL_E5_PHONE', status: 'confirmed' },
      { key: 'name', label: 'name', value: 'SENTINEL_E5_NAME', status: 'confirmed' }
    ]
  }, {
    id: 'bea', name: 'Bea Boundary',
    facts: [{ key: 'email', label: 'email', value: 'SENTINEL_E5_BEA', status: 'confirmed' }]
  }]
};
writeFileSync('/tmp/e5-profiles.json', JSON.stringify(bundle));
await popup.setInputFiles('#file', '/tmp/e5-profiles.json');
await popup.locator('#status', { hasText: 'Imported' }).waitFor();
await popup.selectOption('#profile', 'ada');
await popup.click('#look');
await popup.locator('#preview').waitFor();
const preview = await popup.locator('#preview').innerText();
check('no-role email is offered and other roles are explained', preview.includes('Email ← SENTINEL_E5_EMAIL') && /applicant section/.test(preview) && /section id/.test(preview) && /conflicting role/.test(preview), preview.slice(0, 500));
check('payment, file, and secret fields are left alone', /left alone \(secret\)/.test(preview) && /file field/.test(preview));
check('shadow and frames are named as not filled', /shadow tree/.test(preview) && /frame/.test(preview));
check('the other person is not in the preview', !preview.includes('SENTINEL_E5_BEA'));
const boxes = popup.locator('#preview input[type="checkbox"]');
const count = await boxes.count();
for (let i = 0; i < count; i++) {
  const text = await boxes.nth(i).locator('xpath=..').innerText();
  const keep = text.startsWith('Email ←') && !/applicant|patient|spouse|contact|section id|conflicting|repeats/i.test(text);
  if (!keep && await boxes.nth(i).isChecked()) await boxes.nth(i).uncheck();
}
await popup.click('#fill');
await page.waitForFunction(() => document.getElementById('plain').value === 'SENTINEL_E5_EMAIL');
const dom = await page.evaluate(() => ({
  plain: document.getElementById('plain').value,
  live: document.getElementById('live').value,
  autosave: document.getElementById('autosave').textContent,
  react: document.getElementById('react-mail').value,
  app1: document.getElementById('app1').value,
  app2: document.getElementById('app2').value,
  pat: document.getElementById('pat').value,
  spouse: document.getElementById('spouse').value,
  contact: document.getElementById('contact').value,
  conflict: document.getElementById('conflict').value,
  opaque: document.getElementById('opaque').value,
  cc: ['ccname', 'ccnum', 'ccexp', 'cccsc'].map((id) => document.getElementById(id).value).join('|'),
  pw: document.getElementById('pw').value,
  otp: document.getElementById('otp').value,
  ro: document.getElementById('ro').value,
  dis: document.getElementById('dis').value,
  openShadow: window.__openEmail.value,
  closedShadow: window.__closedEmail.value,
  frame: document.getElementById('same').contentDocument.getElementById('inner-email').value,
  submitted: document.getElementById('submitted').textContent,
  phone: document.body.innerText.includes('SENTINEL_E5_PHONE'),
  bea: document.body.innerText.includes('SENTINEL_E5_BEA')
}));
check('checked emails were written and the site read one before submit', dom.plain === 'SENTINEL_E5_EMAIL' && dom.live === 'SENTINEL_E5_EMAIL' && dom.autosave === 'SENTINEL_E5_EMAIL' && dom.react === 'SENTINEL_E5_EMAIL' && dom.submitted === 'no', JSON.stringify(dom));
check('other roles, payments, secrets, shadow, and frames stayed empty', !dom.app1 && !dom.app2 && !dom.pat && !dom.spouse && !dom.contact && !dom.conflict && !dom.opaque && dom.cc === '|||' && !dom.pw && !dom.otp && dom.ro === 'keep-me' && !dom.dis && !dom.openShadow && !dom.closedShadow && !dom.frame && !dom.phone && !dom.bea, JSON.stringify(dom));

await popup.selectOption('#role', 'applicant');
await popup.locator('#preview', { hasText: 'repeats' }).waitFor();
const repeat = await popup.locator('#preview').innerText();
check('two applicant emails are left as repeats', /repeats/.test(repeat));
const applicantChecked = await popup.locator('#preview li', { hasText: 'repeats' }).locator('input').first().isChecked();
check('repeated applicant fields are not checked', applicantChecked === false);

await page.evaluate(() => {
  ['fresh', 'typed', 'renamed', 'removed'].forEach((id) => {
    const label = document.createElement('label');
    label.id = id + '-label';
    label.htmlFor = id;
    label.textContent = 'Email';
    const input = document.createElement('input');
    input.id = id;
    input.setAttribute('autocomplete', 'email');
    document.body.appendChild(label);
    document.body.appendChild(input);
  });
});
await popup.selectOption('#role', '');
await popup.click('#look');
await popup.locator('#status', { hasText: 'Check the list' }).waitFor();
await page.evaluate(() => {
  document.getElementById('typed').value = 'typed@example.com';
  document.getElementById('renamed-label').textContent = 'Patient email';
  document.getElementById('removed').remove();
});
await popup.click('#fill');
await popup.locator('#status', { hasText: 'left because the page changed' }).waitFor({ timeout: 8000 });
const after = await page.evaluate(() => ({
  fresh: document.getElementById('fresh').value,
  typed: document.getElementById('typed').value,
  renamed: document.getElementById('renamed').value,
  removed: !!document.getElementById('removed')
}));
check('a fresh field is written and a typed, relabeled, or removed field is not', after.fresh === 'SENTINEL_E5_EMAIL' && after.typed === 'typed@example.com' && after.renamed === '' && after.removed === false, JSON.stringify(after));

const beforeDrop = await page.evaluate(() => document.getElementById('plain').value);
await popup.click('#drop');
await popup.locator('#status', { hasText: 'untouched' }).waitFor();
const stored = await popup.evaluate(async () => chrome.storage.local.get('bundle'));
check('removing the imported copy leaves the page value', beforeDrop === 'SENTINEL_E5_EMAIL' && !stored.bundle);

await page.screenshot({ path: join(root, 'results/screenshots/e5-boundary.png') });
writeFileSync(join(root, 'results/e5-boundary.json'), JSON.stringify(report, null, 2) + '\n');
const failed = report.checks.filter((item) => !item.ok);
await browser.close();
await context.close();
console.log('failed', failed.length);
if (failed.length) {
  console.log(JSON.stringify(failed, null, 2));
  process.exit(1);
}
