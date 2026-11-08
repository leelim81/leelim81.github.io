/** A new person is selected before the next saved value. Viewport 1100 by 900. This is not a phone. */
import { writeFileSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { inflateSync } from 'zlib';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { chromium } = pkg;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 500) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 300) : ''));
}
function decode(buf) {
  const raw = Buffer.from(buf).toString('latin1');
  const out = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = re.exec(raw))) {
    const chunk = Buffer.from(match[1], 'latin1');
    try { out.push(inflateSync(chunk)); } catch (err) { out.push(chunk); }
  }
  const body = Buffer.concat(out).toString('latin1');
  return [...body.matchAll(/<([0-9A-Fa-f\s]+)>/g)].map((item) => Buffer.from(item[1].replace(/\s+/g, ''), 'hex').toString('utf8')).join(' ');
}
const prompts = [];
const doc = await PDFDocument.create();
doc.addPage([612, 792]).drawText('Full name', { x: 72, y: 700, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
writeFileSync('/tmp/person-file.pdf', await doc.save());
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true })).newPage();
page.setDefaultTimeout(20000);
page.on('dialog', async (dialog) => {
  const next = prompts.shift();
  if (dialog.type() !== 'prompt') { await dialog.accept(); return; }
  if (next === 'cancel') await dialog.dismiss();
  else await dialog.accept(next == null ? '' : next);
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
    return {
      id: pick.value,
      label: pick.selectedOptions[0] ? pick.selectedOptions[0].textContent : '',
      ids: Array.from(pick.options).map((opt) => opt.value),
      labels: Array.from(pick.options).map((opt) => opt.textContent),
      facts: Array.from(document.querySelectorAll('#profileFacts input')).map((input) => input.getAttribute('aria-label') + '=' + input.value)
    };
  });
}
await page.goto('http://127.0.0.1:8777/tools/forms-filler/?file=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.evaluate(() => ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-editor'].forEach((name) => indexedDB.deleteDatabase(name)));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.click('#profileToggle');
prompts.push('cancel');
await page.click('#profileAdd');
prompts.push('');
await page.click('#profileAdd');
prompts.push('   ');
await page.click('#profileAdd');
const nobody = await people();
check('cancel, an empty name, and a blank name add nobody', nobody.length === 0, JSON.stringify(nobody));
prompts.push('Ada Lane');
await page.click('#profileAdd');
await page.waitForFunction(() => document.getElementById('profilePick').selectedOptions[0] && document.getElementById('profilePick').selectedOptions[0].textContent === 'Ada Lane');
const adaId = (await picked()).id;
await page.locator('#factKey').selectOption('name');
await page.locator('#factValue').fill('Ada Sample');
await page.click('#factAdd');
await page.waitForFunction(() => { const input = document.querySelector('#profileFacts input'); return input && input.value === 'Ada Sample'; });
await page.locator('#profileFacts input').fill('Ada Corrected');
await page.getByRole('button', { name: 'Save correction' }).click();
await page.waitForFunction(() => { const input = document.querySelector('#profileFacts input'); return input && input.value === 'Ada Corrected'; });
prompts.push('Bea Shore');
await page.click('#profileAdd');
await page.waitForFunction((prior) => {
  const pick = document.getElementById('profilePick');
  const facts = Array.from(document.querySelectorAll('#profileFacts input')).map((input) => input.value);
  return pick.selectedOptions[0] && pick.selectedOptions[0].textContent === 'Bea Shore' && pick.value !== prior && facts.length === 0 && /Person added/.test((document.getElementById('profileMsg') || {}).textContent || '');
}, adaId);
const beaPick = await picked();
check('the new person is selected and Ada’s value is not on screen', beaPick.id && beaPick.id !== adaId && beaPick.label === 'Bea Shore' && beaPick.facts.length === 0, JSON.stringify(beaPick));
await page.locator('#factKey').selectOption('name');
await page.locator('#factValue').fill('Bea Other');
await page.click('#factAdd');
await page.waitForFunction(() => { const input = document.querySelector('#profileFacts input'); return input && input.value === 'Bea Other'; });
const beaId = (await picked()).id;
const filed = await people();
const ada = filed.filter((profile) => profile.id === adaId)[0];
const bea = filed.filter((profile) => profile.id === beaId)[0];
check('Bea’s value stays on Bea and Ada’s correction stays on Ada', ada && ada.facts.join('|') === 'name=Ada Corrected' && bea && bea.facts.join('|') === 'name=Bea Other', JSON.stringify(filed));
prompts.push('Ada Lane');
await page.click('#profileAdd');
await page.waitForFunction((ids) => {
  const pick = document.getElementById('profilePick');
  return pick.selectedOptions[0] && pick.value !== ids.adaId && pick.value !== ids.beaId && pick.selectedOptions[0].textContent === 'Ada Lane';
}, { adaId: adaId, beaId: beaId });
const twinId = (await picked()).id;
await page.locator('#factKey').selectOption('name');
await page.locator('#factValue').fill('Second Ada');
await page.click('#factAdd');
await page.waitForFunction(() => { const input = document.querySelector('#profileFacts input'); return input && input.value === 'Second Ada'; });
await page.locator('#profilePick').selectOption({ value: adaId });
await page.waitForFunction(() => { const input = document.querySelector('#profileFacts input'); return input && input.value === 'Ada Corrected'; });
await page.locator('#profilePick').selectOption({ value: beaId });
await page.waitForFunction(() => { const input = document.querySelector('#profileFacts input'); return input && input.value === 'Bea Other'; });
const owned = await people();
check('two people with the same display name keep separate values', owned.filter((profile) => profile.id === adaId)[0].facts.join('|') === 'name=Ada Corrected' && owned.filter((profile) => profile.id === twinId)[0].facts.join('|') === 'name=Second Ada' && owned.filter((profile) => profile.id === beaId)[0].facts.join('|') === 'name=Bea Other', JSON.stringify(owned));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.click('#profileToggle');
await page.locator('#profilePick').selectOption({ value: adaId });
await page.waitForFunction(() => { const input = document.querySelector('#profileFacts input'); return input && input.value === 'Ada Corrected'; });
await page.locator('#profilePick').selectOption({ value: beaId });
await page.waitForFunction(() => { const input = document.querySelector('#profileFacts input'); return input && input.value === 'Bea Other'; });
check('reload keeps each value on its person id', true, '');
const download = page.waitForEvent('download');
await page.click('#profileExport');
const saved = await download;
await saved.saveAs('/tmp/person-file.json');
const bundle = JSON.parse(readFileSync('/tmp/person-file.json', 'utf8'));
const exported = (bundle.profiles || []).map((profile) => profile.id + ':' + profile.facts.map((fact) => fact.value).join(','));
check('the export keeps the same person ids and values', exported.indexOf(adaId + ':Ada Corrected') >= 0 && exported.indexOf(beaId + ':Bea Other') >= 0 && exported.indexOf(twinId + ':Second Ada') >= 0, exported.join(' | '));
await page.evaluate(() => {
  const original = FormProfiles.load.bind(FormProfiles);
  let release;
  window.__releaseLoad = () => { if (release) release(); };
  FormProfiles.load = function () {
    const pending = new Promise((resolve) => { release = () => resolve(original()); });
    FormProfiles.load = original;
    return pending;
  };
});
await page.evaluate(() => { window.FormProfileUI.paint(); });
prompts.push('Cora Dale');
await page.click('#profileAdd');
await page.waitForTimeout(150);
await page.evaluate(() => window.__releaseLoad());
await page.waitForFunction(() => {
  const pick = document.getElementById('profilePick');
  return pick.selectedOptions[0] && pick.selectedOptions[0].textContent === 'Cora Dale';
});
const late = await people();
check('a slow older repaint does not drop the new person or reselect the previous one', late.some((profile) => profile.name === 'Cora Dale') && (await picked()).id !== beaId && (await picked()).label === 'Cora Dale', JSON.stringify({ selected: await picked(), names: late.map((profile) => profile.name) }));
await page.locator('#profilePick').selectOption({ value: beaId });
const chooser = page.waitForEvent('filechooser');
await page.click('#formDrop');
await (await chooser).setFiles('/tmp/person-file.pdf');
await page.waitForFunction(() => document.getElementById('placeMissing') && !document.getElementById('placeMissing').disabled);
await page.click('#placeMissing');
await page.waitForURL(/pdf-editor/);
await page.waitForFunction(() => document.querySelector('#pages .layer') && document.getElementById('recoverPerson').options.length >= 3);
const editor = await page.evaluate((ids) => {
  const person = document.getElementById('recoverPerson');
  const fact = document.getElementById('recoverFact');
  return {
    person: person.value,
    label: person.selectedOptions[0] ? person.selectedOptions[0].textContent : '',
    facts: Array.from(fact.options).map((opt) => opt.textContent)
  };
}, { adaId, beaId });
check('the editor opens on Bea and lists only Bea’s value', editor.person === beaId && editor.label === 'Bea Shore' && editor.facts.join('|') === 'name: Bea Other', JSON.stringify(editor));
await page.locator('#recoverFact').selectOption({ label: 'name: Bea Other' });
await page.click('#recoverPlace');
const layer = page.locator('#pages .layer').first();
const box = await layer.boundingBox();
await layer.click({ position: { x: box.width * 0.4, y: box.height * 0.4 } });
await page.waitForFunction(() => Array.from(document.querySelectorAll('.ann-body')).some((node) => /Bea Other/.test(node.innerText)));
const placed = await page.evaluate(() => Array.from(document.querySelectorAll('.ann-body')).map((node) => node.innerText.replace(/\s+/g, ' ').trim()));
check('the placed mark is Bea’s value and not Ada’s', placed.join('|') === 'Bea Other', placed.join('|'));
await page.waitForFunction(() => document.getElementById('saveState').textContent === 'Saved');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Array.from(document.querySelectorAll('.ann-body')).some((node) => /Bea Other/.test(node.innerText)));
const resumed = await page.evaluate((id) => ({
  person: document.getElementById('recoverPerson').value,
  text: Array.from(document.querySelectorAll('.ann-body')).map((node) => node.innerText.replace(/\s+/g, ' ').trim()).join('|')
}), beaId);
check('reload returns Bea’s placed value on Bea', resumed.person === beaId && resumed.text === 'Bea Other', JSON.stringify(resumed));
await page.locator('#downloadBtn').click();
await page.waitForSelector('#sizeOptions button[data-level="100"]:not([disabled])');
const pdfDownload = page.waitForEvent('download');
await page.locator('#sizeOptions button[data-level="100"]').click();
await (await pdfDownload).saveAs('/tmp/person-file-out.pdf');
const pdf = decode(readFileSync('/tmp/person-file-out.pdf'));
check('the rendered PDF has Bea’s value and not Ada’s', pdf.includes('Bea Other') && !pdf.includes('Ada Corrected') && !pdf.includes('Second Ada'), pdf.slice(0, 180));
console.log('SUMMARY', checks.filter((item) => item.ok).length, '/', checks.length);
await browser.close();
if (checks.some((item) => !item.ok)) process.exit(1);
