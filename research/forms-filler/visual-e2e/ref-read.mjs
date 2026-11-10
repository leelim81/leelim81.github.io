/** A reference read finishes, abstains, or times out. It does not stay on Reading. */
import { copyFileSync, readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { chromium } = pkg;
const root = '/tmp/inline-wt/research/forms-filler/visual-e2e/fixtures/feature-e2e';
const amb = readFileSync(root + '/cora.ambiguous.pdf');
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 300) });
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 220) : ''));
}
const textDoc = await PDFDocument.create();
const page = textDoc.addPage([400, 200]);
const font = await textDoc.embedFont(StandardFonts.Helvetica);
page.drawText('Applicant full name is Ada Example and the phone is 80000000 today.', { x: 20, y: 120, size: 12, font });
writeFileSync('/tmp/ref-text.pdf', await textDoc.save());
writeFileSync('/tmp/ref-corrupt.pdf', Buffer.from('this is not a pdf'));
copyFileSync(root + '/cora.ambiguous.pdf', '/tmp/cora-hold.pdf');
copyFileSync(root + '/cora.ambiguous.pdf', '/tmp/cora-budget.pdf');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const ui = await browser.newPage({ viewport: { width: 1100, height: 800 } });
ui.setDefaultTimeout(30000);
await ui.goto('http://127.0.0.1:8788/tools/forms-filler/?read=' + Date.now(), { waitUntil: 'domcontentloaded' });
await ui.waitForFunction(() => window.FormExtract);
await ui.evaluate(() => { window.__ffNoWarm = true; });
const paired = await ui.evaluate(async (b64) => {
  const bin = atob(b64);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  const started = performance.now();
  const both = await Promise.all([FormExtract.spatial(data, 'application/pdf'), FormExtract.spatial(data.slice(0), 'application/pdf')]);
  return {
    ms: Math.round(performance.now() - started),
    names: both.map((item) => ({ bea: /bea/i.test(item.text || ''), cora: /cora/i.test(item.text || ''), chars: (item.text || '').replace(/\s/g, '').length }))
  };
}, amb.toString('base64'));
const pairTrace = await ui.evaluate(() => FormExtract.trace());
check('two overlapping reads of the ambiguous scan both finish', paired.ms < 20000 && paired.names.every((item) => item.bea && item.cora), JSON.stringify(paired));
check('those two reads never open two PDF jobs at once', pairTrace.peakSpatial === 1 && pairTrace.spatialInflight === 0, JSON.stringify(pairTrace));

await ui.evaluate(() => {
  ['tools-forms-filler', 'tools-forms-profiles', 'tools-forms-maps', 'tools-forms-editor'].forEach((name) => indexedDB.deleteDatabase(name));
  sessionStorage.clear();
});
await ui.reload({ waitUntil: 'domcontentloaded' });
await ui.click('#profileToggle');
ui.once('dialog', (dialog) => dialog.accept('Cora Example'));
await ui.click('#profileAdd');
await ui.waitForFunction(() => Array.from(document.getElementById('profilePick').options).some((opt) => opt.textContent === 'Cora Example'));
await ui.locator('#factKey').selectOption('email');
await ui.locator('#factValue').fill('cora.fixed@example.com');
await ui.click('#factAdd');
await ui.waitForFunction(() => /Saved/.test((document.getElementById('profileMsg') || {}).textContent || ''));
const aloneAt = Date.now();
await ui.locator('#refInput').setInputFiles(root + '/cora.ambiguous.pdf');
await ui.waitForFunction(() => {
  const refs = window.FormDesk.refs();
  return refs.length && refs.every((item) => item.status && item.status !== 'reading');
});
const read = await ui.evaluate(async () => {
  const refs = FormDesk.refs();
  const vault = (await FormProfiles.load()).vault;
  const cora = vault.profiles.filter((profile) => profile.name === 'Cora Example')[0];
  return { refs, email: cora && cora.facts.filter((fact) => fact.key === 'email')[0] };
});
check('the ambiguous scan leaves Reading without replacing the confirmed email', read.refs[0].status !== 'reading' && read.email && read.email.value === 'cora.fixed@example.com' && read.email.status === 'confirmed', JSON.stringify(Object.assign({ ms: Date.now() - aloneAt }, read)));

await ui.evaluate(() => { window.__ffOcrBudgetMs = 1; });
await ui.locator('#refInput').setInputFiles('/tmp/cora-budget.pdf');
await ui.waitForFunction(() => {
  const refs = window.FormDesk.refs();
  return refs.some((item) => item.name === 'cora-budget.pdf' && item.status && item.status !== 'reading');
});
const timed = await ui.evaluate(async () => {
  const ref = FormDesk.refs().filter((item) => item.name === 'cora-budget.pdf')[0];
  const preview = Array.from(document.querySelectorAll('.ref-preview')).map((node) => node.textContent).join(' | ');
  const vault = (await FormProfiles.load()).vault;
  const cora = vault.profiles.filter((profile) => profile.name === 'Cora Example')[0];
  return { status: ref && ref.status, preview, email: cora && cora.facts.filter((fact) => fact.key === 'email')[0] };
});
check('a read that exceeds its budget says so and keeps the confirmed email', timed.status === 'error' && /too long to read/.test(timed.preview) && timed.email && timed.email.value === 'cora.fixed@example.com', JSON.stringify(timed));

await ui.evaluate(() => { window.__ffOcrBudgetMs = 0; window.__ffHoldOcr = new Promise((resolve) => { window.__releaseOcr = resolve; }); });
await ui.locator('#refInput').setInputFiles('/tmp/cora-hold.pdf');
await ui.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'cora-hold.pdf' && item.status === 'reading'));
await ui.locator('.ref-row', { hasText: 'cora-hold.pdf' }).locator('.ref-x').click();
await ui.evaluate(() => window.__releaseOcr && window.__releaseOcr());
await ui.waitForTimeout(500);
const cancelled = await ui.evaluate(async () => {
  const vault = (await FormProfiles.load()).vault;
  return { refs: FormDesk.refs().map((item) => item.name + ':' + item.status), people: vault.profiles.map((profile) => profile.name) };
});
check('removing a reference cancels its read and adds no person', !cancelled.refs.some((item) => item.indexOf('cora-hold.pdf') === 0) && cancelled.people.join(',') === 'Cora Example', JSON.stringify(cancelled));

await ui.locator('#refInput').setInputFiles('/tmp/ref-text.pdf');
await ui.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'ref-text.pdf' && item.status && item.status !== 'reading'));
const textRead = await ui.evaluate(() => FormDesk.refs().filter((item) => item.name === 'ref-text.pdf')[0]);
check('a text pdf finishes without staying on Reading', textRead && textRead.status !== 'reading' && textRead.status !== 'error', JSON.stringify(textRead));

await ui.locator('#refInput').setInputFiles('/tmp/ref-corrupt.pdf');
await ui.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'ref-corrupt.pdf' && item.status && item.status !== 'reading'));
const corrupt = await ui.evaluate(() => FormDesk.refs().filter((item) => item.name === 'ref-corrupt.pdf')[0]);
check('a corrupt file is an error, not a successful empty read', corrupt && corrupt.status === 'error', JSON.stringify(corrupt));

await ui.click('#clearBtn');
await ui.waitForFunction(() => /Started over/.test((document.getElementById('readStatus') || {}).textContent || ''));
const cleared = await ui.evaluate(async () => (await FormProfiles.load()).vault.profiles.map((profile) => profile.name));
check('start over does not delete the confirmed person', cleared.join(',') === 'Cora Example', cleared.join(','));

async function multiPagePdf(pages, tokenAt) {
  const doc = await PDFDocument.create();
  const face = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const sheet = doc.addPage([420, 240]);
    const token = tokenAt(i + 1);
    sheet.drawText(token + ' lives on page ' + (i + 1) + ' of this digital letter today.', { x: 24, y: 140, size: 12, font: face });
  }
  return doc.save();
}
const threePdf = '/tmp/ref-three.pdf';
const thirteenPdf = '/tmp/ref-thirteen.pdf';
writeFileSync(threePdf, await multiPagePdf(3, (n) => 'full name: Page ' + ['One', 'Two', 'Three'][n - 1]));
writeFileSync(thirteenPdf, await multiPagePdf(13, (n) => 'Marker' + n + ' token'));
const threeBytes = readFileSync(threePdf).toString('base64');
const thirteenBytes = readFileSync(thirteenPdf).toString('base64');
const pageTexts = await ui.evaluate(async ({ three, thirteen }) => {
  function decode(b64) {
    const bin = atob(b64);
    const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    return data;
  }
  const a = await FormExtract.spatial(decode(three), 'application/pdf');
  const b = await FormExtract.spatial(decode(thirteen), 'application/pdf');
  return {
    three: { text: a.text || '', unread: a.unread || '', channel: a.channel },
    thirteen: { text: b.text || '', unread: b.unread || '', channel: b.channel }
  };
}, { three: threeBytes, thirteen: thirteenBytes });
check('a 3-page digital PDF keeps every page', pageTexts.three.channel === 'text-layer' && /Page One/.test(pageTexts.three.text) && /Page Two/.test(pageTexts.three.text) && /Page Three/.test(pageTexts.three.text) && !pageTexts.three.unread, JSON.stringify(pageTexts.three).slice(0, 240));
check('a 13-page digital PDF says the unread page was not read', /Marker1/.test(pageTexts.thirteen.text) && /Marker12/.test(pageTexts.thirteen.text) && !/Marker13/.test(pageTexts.thirteen.text) && pageTexts.thirteen.unread === 'Read 12 of 13 pages. The rest was not read.', pageTexts.thirteen.unread);

await ui.locator('#refInput').setInputFiles(thirteenPdf);
await ui.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'ref-thirteen.pdf' && item.status && item.status !== 'reading'));
const thirteenRow = await ui.evaluate(() => FormDesk.refs().filter((item) => item.name === 'ref-thirteen.pdf')[0]);
check('the desk shows that the 13th page was not read', thirteenRow && thirteenRow.status !== 'error' && /12 of 13/.test(thirteenRow.preview || ''), JSON.stringify(thirteenRow));

await ui.click('#clearBtn');
await ui.waitForFunction(() => /Started over/.test((document.getElementById('readStatus') || {}).textContent || ''));
await ui.evaluate(async () => {
  const byte = new Uint8Array([1]);
  const row = (id, name, text) => ({ id, name, bytes: byte, mime: 'text/plain', text });
  await DeskDB.set('tools-forms-filler', 'draft', {
    refs: [
      row('r1', 'ada-keep', 'full name: Ada Keep'),
      row('r1', 'bea-keep', 'full name: Bea Keep'),
      row('', 'blank-id', 'full name: Blank Id'),
      row('nope', 'malformed', 'full name: Mal Form'),
      row('r0', 'zero-id', 'full name: Zero Id'),
      row('r08', 'padded-id', 'full name: Pad Id'),
      row('r4', 'four-keep', 'full name: Four Keep'),
      row('r4', 'four-dup', 'full name: Four Dup'),
      row('r' + '9'.repeat(30), 'huge-digits', 'full name: Huge Digits'),
      row('r' + '9'.repeat(30), 'huge-dup', 'full name: Huge Dup'),
      row('r9007199254740993', 'unsafe-int', 'full name: Unsafe Int'),
      row('rInfinity', 'inf-id', 'full name: Inf Id')
    ]
  });
});
await ui.reload({ waitUntil: 'domcontentloaded' });
await ui.waitForFunction(() => FormDesk.refs().length === 12 && FormDesk.refs().every((item) => item.status && item.status !== 'reading'), null, { timeout: 8000 });
const restored = await ui.evaluate(() => FormDesk.refs());
const restoredIds = restored.map((item) => item.id);
const idOk = /^[A-Za-z]+[1-9][0-9]*$/;
const byName = Object.fromEntries(restored.map((item) => [item.name, item]));
check('restored duplicate and malformed ids become unique well-formed ids', restoredIds.length === 12 && new Set(restoredIds).size === 12 && restoredIds.every((id) => idOk.test(id) && id.length < 16) && byName['ada-keep'].id !== byName['bea-keep'].id && byName['four-keep'].id !== byName['four-dup'].id && byName['huge-digits'].id !== byName['huge-dup'].id && /Ada Keep/.test(byName['ada-keep'].preview) && /Bea Keep/.test(byName['bea-keep'].preview) && /Huge Digits/.test(byName['huge-digits'].preview) && /Unsafe Int/.test(byName['unsafe-int'].preview) && /Inf Id/.test(byName['inf-id'].preview) && /Mal Form/.test(byName.malformed.preview) && /Zero Id/.test(byName['zero-id'].preview) && /Pad Id/.test(byName['padded-id'].preview), JSON.stringify(restored));
await ui.waitForFunction(async () => {
  const draft = await DeskDB.get('tools-forms-filler', 'draft');
  const ids = (draft && draft.refs || []).map((item) => item.id);
  return ids.length === 12 && new Set(ids).size === 12 && ids.every((id) => /^[A-Za-z]+[1-9][0-9]*$/.test(id) && id.length < 16);
});
await ui.reload({ waitUntil: 'domcontentloaded' });
await ui.waitForFunction(() => FormDesk.refs().length === 12);
const stable = await ui.evaluate(() => FormDesk.refs().map((item) => item.id + ':' + item.name).sort());
check('a second reload keeps the normalized ids', stable.join('|') === restored.map((item) => item.id + ':' + item.name).sort().join('|'), stable.join('|'));
const beforeAdd = new Set(restoredIds);
await ui.locator('#refInput').setInputFiles('/tmp/ref-text.pdf');
await ui.waitForFunction(() => FormDesk.refs().every((item) => item.status && item.status !== 'reading') && FormDesk.refs().some((item) => item.name === 'ref-text.pdf'));
const afterAdd = await ui.evaluate(async () => {
  const refs = FormDesk.refs();
  const vault = (await FormProfiles.load()).vault;
  return { refs, people: vault.profiles.map((profile) => profile.name) };
});
const added = afterAdd.refs.filter((item) => item.name === 'ref-text.pdf')[0];
const ada = afterAdd.refs.filter((item) => item.name === 'ada-keep')[0];
const bea = afterAdd.refs.filter((item) => item.name === 'bea-keep')[0];
check('a new file after restore gets a fresh id and does not rewrite the kept rows', added && added.status !== 'reading' && added.status !== 'error' && !beforeAdd.has(added.id) && ada.preview === byName['ada-keep'].preview && bea.preview === byName['bea-keep'].preview && afterAdd.people.join(',') === 'Cora Example', JSON.stringify({ added, ada: ada && ada.preview, bea: bea && bea.preview, people: afterAdd.people }));

async function installReaderHooks() {
  await ui.evaluate(() => {
    window.__ffReadBudgetMs = 800;
    window.__ffOcrBudgetMs = 0;
    window.__ffHoldOcr = null;
    window.__stallMode = '';
    window.__stall = { loads: 0, renders: 0, terminated: 0, recognizes: 0, usedLoad: false };
    window.__ffWrapDocument = function (task) {
      if (window.__stallMode === 'load' && !window.__stall.usedLoad) {
        window.__stall.usedLoad = true;
        let rejectP;
        const promise = new Promise((_, reject) => { rejectP = reject; });
        return {
          promise,
          destroy() {
            window.__stall.loads += 1;
            try { task.destroy(); } catch (err) {}
            try { rejectP(new Error('destroyed')); } catch (err) {}
          }
        };
      }
      return task;
    };
    window.__ffWrapRender = function (task) {
      if (window.__stallMode !== 'render') return task;
      let rejectP;
      const hung = new Promise((_, reject) => { rejectP = reject; });
      return {
        promise: hung,
        cancel() {
          window.__stall.renders += 1;
          try { task.cancel(); } catch (err) {}
          try { rejectP(new Error('render-cancel')); } catch (err) {}
        }
      };
    };
    window.__ffCreateWorker = function (real) {
      if (window.__stallMode === 'init') {
        return new Promise((resolve) => {
          setTimeout(() => {
            const created = {
              terminated: false,
              setParameters() { return Promise.resolve(); },
              recognize() {
                window.__stall.recognizes += 1;
                return Promise.resolve({ data: { text: 'full name: Zoe Late', words: [] } });
              },
              terminate() { this.terminated = true; window.__stall.terminated += 1; return Promise.resolve(); }
            };
            window.__stall.worker = created;
            resolve(created);
          }, 2000);
        });
      }
      if (window.__stallMode === 'params' || window.__stallMode === 'late') {
        const created = {
          terminated: false,
          setParameters() {
            if (window.__stallMode === 'params') return new Promise(() => {});
            return Promise.resolve();
          },
          recognize() {
            window.__stall.recognizes += 1;
            if (window.__stallMode === 'late') {
              return new Promise((resolve) => {
                window.__releaseLate = () => resolve({ data: { text: 'full name: Zoe Late', words: [] } });
              });
            }
            return new Promise(() => {});
          },
          terminate() { this.terminated = true; window.__stall.terminated += 1; return Promise.resolve(); }
        };
        window.__stall.worker = created;
        return Promise.resolve(created);
      }
      return real();
    };
  });
}

async function idleTrace() {
  return ui.evaluate(() => FormExtract.trace());
}
async function waitRow(name) {
  await ui.waitForFunction((fileName) => {
    const row = FormDesk.refs().find((item) => item.name === fileName);
    return row && row.status && row.status !== 'reading';
  }, name);
}
async function peopleAndRows() {
  return ui.evaluate(async () => {
    const vault = (await FormProfiles.load()).vault;
    return {
      refs: FormDesk.refs().map((item) => ({ id: item.id, name: item.name, status: item.status, preview: item.preview })),
      email: ((vault.profiles.find((profile) => profile.name === 'Cora Example') || {}).facts || []).find((fact) => fact.key === 'email'),
      people: vault.profiles.map((profile) => profile.name)
    };
  });
}

await ui.click('#clearBtn');
await ui.waitForFunction(() => /Started over/.test((document.getElementById('readStatus') || {}).textContent || '') && FormDesk.refs().length === 0);
await installReaderHooks();
await ui.evaluate(() => FormExtract.resetTrace());
copyFileSync('/tmp/ref-text.pdf', '/tmp/ref-after-load.pdf');
copyFileSync(root + '/cora.ambiguous.pdf', '/tmp/ref-render-stall.pdf');
writeFileSync('/tmp/ref-tiny.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
copyFileSync('/tmp/ref-tiny.png', '/tmp/ref-init-stall.png');
copyFileSync('/tmp/ref-tiny.png', '/tmp/ref-params-stall.png');
copyFileSync('/tmp/ref-tiny.png', '/tmp/ref-late-stall.png');
copyFileSync('/tmp/ref-text.pdf', '/tmp/ref-queued.pdf');
copyFileSync('/tmp/ref-text.pdf', '/tmp/ref-removed.pdf');

await ui.evaluate(() => { window.__stallMode = 'load'; window.__stall.usedLoad = false; window.__ffReadBudgetMs = 700; FormExtract.resetTrace(); });
const loadStarted = Date.now();
await ui.locator('#refInput').setInputFiles('/tmp/ref-text.pdf');
await ui.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'ref-text.pdf' && item.status === 'reading'));
await ui.locator('#refInput').setInputFiles('/tmp/ref-after-load.pdf');
await waitRow('ref-text.pdf');
await waitRow('ref-after-load.pdf');
const loaded = await peopleAndRows();
const loadTrace = await idleTrace();
const loadStall = await ui.evaluate(() => window.__stall);
const loadMs = Date.now() - loadStarted;
const hung = loaded.refs.find((item) => item.name === 'ref-text.pdf');
const next = loaded.refs.find((item) => item.name === 'ref-after-load.pdf');
check('a hung PDF load is destroyed and the queued read still finishes', hung && hung.status === 'error' && /too long to read/.test(hung.preview) && next && next.status !== 'error' && next.status !== 'reading' && loadStall.loads >= 1 && loadTrace.peakSpatial === 1 && loadTrace.spatialInflight === 0 && loadMs < 8000 && loaded.email && loaded.email.value === 'cora.fixed@example.com', JSON.stringify({ loadMs, loadStall, loadTrace, hung, next }));

await ui.evaluate(() => { window.__stallMode = 'render'; window.__stall.usedRender = false; window.__ffReadBudgetMs = 2500; FormExtract.resetTrace(); });
const renderStarted = Date.now();
await ui.locator('#refInput').setInputFiles('/tmp/ref-render-stall.pdf');
await ui.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'ref-render-stall.pdf' && item.status === 'reading'));
copyFileSync('/tmp/ref-text.pdf', '/tmp/ref-after-render.pdf');
await ui.locator('#refInput').setInputFiles('/tmp/ref-after-render.pdf');
await waitRow('ref-render-stall.pdf');
await waitRow('ref-after-render.pdf');
const rendered = await peopleAndRows();
const renderTrace = await idleTrace();
const renderStall = await ui.evaluate(() => ({ renders: window.__stall.renders, terminated: window.__stall.terminated }));
const renderMs = Date.now() - renderStarted;
const renderRow = rendered.refs.find((item) => item.name === 'ref-render-stall.pdf');
const afterRender = rendered.refs.find((item) => item.name === 'ref-after-render.pdf');
check('a hung page render is cancelled and the next reference finishes', renderRow && renderRow.status === 'error' && /too long/.test(renderRow.preview) && afterRender && afterRender.status !== 'reading' && afterRender.status !== 'error' && renderStall.renders >= 1 && renderTrace.peakSpatial === 1 && renderTrace.spatialInflight === 0 && renderMs < 12000, JSON.stringify({ renderMs, renderStall, renderTrace, renderRow, afterRender }));

await ui.evaluate(() => { window.__stallMode = 'init'; window.__ffReadBudgetMs = 1200; FormExtract.resetTrace(); });
const initStarted = Date.now();
await ui.locator('#refInput').setInputFiles('/tmp/ref-init-stall.png');
await ui.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'ref-init-stall.png' && item.status === 'reading'));
copyFileSync('/tmp/ref-text.pdf', '/tmp/ref-after-init.pdf');
await ui.locator('#refInput').setInputFiles('/tmp/ref-after-init.pdf');
await waitRow('ref-init-stall.png');
await waitRow('ref-after-init.pdf');
const initMs = Date.now() - initStarted;
const initStall = await ui.evaluate(() => ({ terminated: window.__stall.terminated, recognizes: window.__stall.recognizes }));
const initTrace = await idleTrace();
const inited = await peopleAndRows();
const initRow = inited.refs.find((item) => item.name === 'ref-init-stall.png');
const afterInit = inited.refs.find((item) => item.name === 'ref-after-init.pdf');
check('a slow worker start is outside the read budget and the photo read finishes', initRow && initRow.status !== 'error' && initRow.status !== 'reading' && afterInit && afterInit.status !== 'reading' && afterInit.status !== 'error' && initStall.recognizes >= 1 && initTrace.spatialInflight === 0 && initMs >= 1200 && initMs < 15000, JSON.stringify({ initMs, initStall, initTrace, initRow, afterInit }));

await ui.evaluate(() => { window.__stallMode = 'params'; window.__ffReadBudgetMs = 1200; FormExtract.resetTrace(); FormExtract.resetWorker(); });
const paramsStarted = Date.now();
await ui.locator('#refInput').setInputFiles('/tmp/ref-params-stall.png');
await ui.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'ref-params-stall.png' && item.status === 'reading'));
copyFileSync('/tmp/ref-text.pdf', '/tmp/ref-after-params.pdf');
await ui.locator('#refInput').setInputFiles('/tmp/ref-after-params.pdf');
await waitRow('ref-params-stall.png');
await waitRow('ref-after-params.pdf');
const paramsMs = Date.now() - paramsStarted;
const paramsStall = await ui.evaluate(() => ({ terminated: window.__stall.terminated, recognizes: window.__stall.recognizes }));
const paramsTrace = await idleTrace();
const paramRows = await peopleAndRows();
const paramsRow = paramRows.refs.find((item) => item.name === 'ref-params-stall.png');
const afterParams = paramRows.refs.find((item) => item.name === 'ref-after-params.pdf');
check('a hung setParameters terminates the worker and the next reference finishes', paramsRow && paramsRow.status === 'error' && paramsStall.terminated >= 1 && paramsStall.recognizes === 0 && afterParams && afterParams.status !== 'reading' && afterParams.status !== 'error' && paramsTrace.peakOcr <= 1 && paramsTrace.peakSpatial === 1 && paramsTrace.ocrInflight === 0 && paramsMs < 12000 && paramRows.email.value === 'cora.fixed@example.com', JSON.stringify({ paramsMs, paramsStall, paramsTrace, paramsRow, afterParams }));

await ui.evaluate(() => { window.__stallMode = 'late'; window.__ffReadBudgetMs = 15000; window.__ffOcrBudgetMs = 500; FormExtract.resetTrace(); FormExtract.resetWorker(); });
await ui.locator('#refInput').setInputFiles('/tmp/ref-late-stall.png');
await waitRow('ref-late-stall.png');
copyFileSync('/tmp/ref-text.pdf', '/tmp/ref-after-late.pdf');
await ui.locator('#refInput').setInputFiles('/tmp/ref-after-late.pdf');
await waitRow('ref-after-late.pdf');
const beforeLate = await peopleAndRows();
await ui.evaluate(() => window.__releaseLate && window.__releaseLate());
await ui.waitForTimeout(400);
const afterLate = await peopleAndRows();
const lateRow = afterLate.refs.find((item) => item.name === 'ref-late-stall.png');
const lateNext = afterLate.refs.find((item) => item.name === 'ref-after-late.pdf');
const lateBefore = beforeLate.refs.find((item) => item.name === 'ref-after-late.pdf');
check('a late OCR result cannot change the timed-out row, the next row, or the confirmed email', lateRow && /too long/.test(lateRow.preview) && !/Zoe/.test(JSON.stringify(afterLate.refs)) && lateNext && lateNext.preview === lateBefore.preview && afterLate.people.join(',') === 'Cora Example' && afterLate.email.value === 'cora.fixed@example.com', JSON.stringify({ lateRow, lateNext, people: afterLate.people }));

await ui.evaluate(() => { window.__stallMode = 'load'; window.__stall.usedLoad = false; window.__ffOcrBudgetMs = 0; window.__ffReadBudgetMs = 4000; window.__stall.realGets = 0; FormExtract.resetTrace(); });
copyFileSync('/tmp/ref-text.pdf', '/tmp/ref-block-load.pdf');
await ui.locator('#refInput').setInputFiles('/tmp/ref-block-load.pdf');
await ui.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'ref-block-load.pdf' && item.status === 'reading'));
await ui.locator('#refInput').setInputFiles('/tmp/ref-removed.pdf');
await ui.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'ref-removed.pdf' && item.status === 'reading'));
await ui.locator('.ref-row', { hasText: 'ref-removed.pdf' }).locator('.ref-x').click();
await waitRow('ref-block-load.pdf');
const removedTrace = await ui.evaluate(() => ({ realGets: window.__stall.realGets, loads: window.__stall.loads, trace: FormExtract.trace(), refs: FormDesk.refs().map((item) => item.name) }));
check('removing a queued reference does not let it open a PDF or stay in the list', removedTrace.loads >= 1 && removedTrace.realGets === 0 && !removedTrace.refs.includes('ref-removed.pdf') && removedTrace.trace.spatialInflight === 0, JSON.stringify(removedTrace));

await ui.evaluate(() => { window.__stallMode = 'load'; window.__stall.usedLoad = false; window.__ffReadBudgetMs = 5000; FormExtract.resetTrace(); });
copyFileSync('/tmp/ref-text.pdf', '/tmp/ref-startover-stall.pdf');
await ui.locator('#refInput').setInputFiles('/tmp/ref-startover-stall.pdf');
await ui.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'ref-startover-stall.pdf' && item.status === 'reading'));
await ui.click('#clearBtn');
await ui.waitForFunction(() => /Started over/.test((document.getElementById('readStatus') || {}).textContent || ''));
await ui.waitForTimeout(300);
const clearedMid = await peopleAndRows();
const clearStall = await ui.evaluate(() => ({ loads: window.__stall.loads, trace: FormExtract.trace() }));
check('start over releases the active PDF load and writes no person', clearedMid.refs.length === 0 && clearStall.loads >= 1 && clearStall.trace.spatialInflight === 0 && clearedMid.people.join(',') === 'Cora Example' && clearedMid.email.value === 'cora.fixed@example.com', JSON.stringify({ clearedMid, clearStall }));
await ui.evaluate(() => { window.__stallMode = ''; window.__ffReadBudgetMs = 0; window.__ffOcrBudgetMs = 0; });
copyFileSync('/tmp/ref-text.pdf', '/tmp/ref-after-clear.pdf');
const retryAt = Date.now();
await ui.locator('#refInput').setInputFiles('/tmp/ref-after-clear.pdf');
await waitRow('ref-after-clear.pdf');
const retried = await peopleAndRows();
check('a reference added after start over finishes on its own', retried.refs.some((item) => item.name === 'ref-after-clear.pdf' && item.status !== 'reading' && item.status !== 'error') && Date.now() - retryAt < 8000, JSON.stringify({ ms: Date.now() - retryAt, retried }));

await ui.evaluate(() => { window.__stallMode = 'load'; window.__stall.usedLoad = false; window.__ffReadBudgetMs = 8000; });
copyFileSync('/tmp/ref-text.pdf', '/tmp/ref-reload.pdf');
await ui.locator('#refInput').setInputFiles('/tmp/ref-reload.pdf');
await ui.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'ref-reload.pdf' && item.status === 'reading'));
await ui.waitForTimeout(800);
await ui.reload({ waitUntil: 'domcontentloaded' });
await ui.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'ref-reload.pdf' && item.status && item.status !== 'reading'), null, { timeout: 15000 });
const reloaded = await peopleAndRows();
const reloadRow = reloaded.refs.find((item) => item.name === 'ref-reload.pdf');
check('reload while a read is active finishes that file instead of leaving it on Reading', reloadRow && reloadRow.status !== 'reading' && reloadRow.status !== 'error' && reloaded.email && reloaded.email.value === 'cora.fixed@example.com', JSON.stringify(reloadRow));

const lease = await ui.evaluate(async () => {
  window.__ffReadBudgetMs = 8000;
  window.__ffOcrBudgetMs = 0;
  window.__stall = { terminated: 0, params: 0, renders: 0 };
  let releaseParams = null;
  let releaseRender = null;
  let renders = 0;
  const worker = {
    terminated: false,
    setParameters() {
      window.__stall.params += 1;
      if (window.__stall.params < 3) return Promise.resolve();
      return new Promise((resolve) => { releaseParams = resolve; });
    },
    recognize() { return Promise.resolve({ data: { text: 'Ada Example line', words: [{ text: 'Ada', confidence: 90, bbox: { x0: 1, y0: 1, x1: 8, y1: 8 } }] } }); },
    terminate() { this.terminated = true; window.__stall.terminated += 1; return Promise.resolve(); }
  };
  window.__ffCreateWorker = function () { return Promise.resolve(worker); };
  window.__ffWrapRender = function (task) {
    renders += 1;
    if (renders < 2) return task;
    let rejectP;
    const hung = new Promise((_, reject) => { rejectP = reject; });
    releaseRender = () => { try { task.cancel(); } catch (err) {} rejectP(new Error('render-cancel')); };
    return { promise: hung, cancel() { window.__stall.renders += 1; releaseRender(); } };
  };
  const doc = await PDFLib.PDFDocument.create();
  doc.addPage([200, 200]);
  doc.addPage([200, 200]);
  const bytes = new Uint8Array(await doc.save());
  const session = FormExtract.openRead();
  let spatialState = 'pending';
  const spatial = FormExtract.spatial(bytes, 'application/pdf', session).then(() => { spatialState = 'done'; }, (err) => { spatialState = err.message; });
  const started = performance.now();
  while (window.__stall.renders === 0 && performance.now() - started < 4000) await new Promise((r) => setTimeout(r, 20));
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  let boxesState = 'pending';
  const boxes = FormExtract.wordBoxes(canvas, '6').then((words) => { boxesState = 'ok:' + words.length; }, (err) => { boxesState = err.message; });
  const paramsAt = performance.now();
  while (window.__stall.params < 3 && performance.now() - paramsAt < 3000) await new Promise((r) => setTimeout(r, 20));
  const before = { terminated: window.__stall.terminated, params: window.__stall.params, boxesState, spatialState };
  FormExtract.cancelRead(session);
  await new Promise((r) => setTimeout(r, 50));
  const afterCancelA = { terminated: window.__stall.terminated, boxesState, spatialState };
  if (releaseParams) releaseParams();
  await Promise.race([boxes, new Promise((r) => setTimeout(r, 1500))]);
  const afterRelease = { terminated: window.__stall.terminated, boxesState, spatialState };
  if (releaseRender) releaseRender();
  await Promise.race([spatial, new Promise((r) => setTimeout(r, 1500))]);
  window.__ffCreateWorker = null;
  window.__ffWrapRender = null;
  window.__ffReadBudgetMs = 0;
  return { before, afterCancelA, afterRelease, finalSpatial: spatialState, finalBoxes: boxesState };
});
check('removing a spatial read between pages does not terminate the standalone OCR worker', lease.afterCancelA.terminated === 0 && lease.before.params >= 3 && lease.afterCancelA.boxesState === 'pending' && lease.finalBoxes.indexOf('ok:') === 0 && lease.finalSpatial !== 'pending', JSON.stringify(lease));

await ui.goto('http://127.0.0.1:8788/tools/forms-filler/?ocrdeadline=' + Date.now(), { waitUntil: 'domcontentloaded' });
await ui.waitForFunction(() => window.FormExtract && window.PDFLib);
const hungInit = await ui.evaluate(async () => {
  window.__ffReadBudgetMs = 400;
  let resolveCreate = null;
  const created = {
    terminated: false,
    setParameters() { return new Promise(() => {}); },
    recognize() { return new Promise(() => {}); },
    terminate() { this.terminated = true; return Promise.resolve(); }
  };
  window.__ffCreateWorker = function (real) {
    if (!resolveCreate) return new Promise((resolve) => { resolveCreate = () => resolve(created); });
    return real();
  };
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
  let imageState = 'pending';
  const image = FormExtract.imageText(png, 'image/png').then(() => { imageState = 'ok'; }, (err) => { imageState = err.message; });
  const textDoc = await PDFLib.PDFDocument.create();
  const page = textDoc.addPage([300, 120]);
  const font = await textDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  page.drawText('Applicant full name is Ada Example and the phone is 80000000 today.', { x: 12, y: 60, size: 12, font });
  const textBytes = new Uint8Array(await textDoc.save());
  const started = performance.now();
  let textState = 'pending';
  const text = FormExtract.spatial(textBytes, 'application/pdf').then((value) => { textState = value.text || ''; }, (err) => { textState = err.message; });
  await Promise.race([text, new Promise((r) => setTimeout(r, 4000))]);
  const textMs = Math.round(performance.now() - started);
  await Promise.race([image, new Promise((r) => setTimeout(r, 2000))]);
  if (resolveCreate) resolveCreate();
  await new Promise((r) => setTimeout(r, 30));
  window.__ffCreateWorker = null;
  window.__ffReadBudgetMs = 0;
  return { imageState, textState, textMs, terminated: created.terminated };
});
check('a hung image read releases the OCR queue for the next PDF', /budget|cancelled/.test(hungInit.imageState) && /Ada Example/.test(hungInit.textState) && hungInit.textMs < 3500 && hungInit.terminated, JSON.stringify(hungInit));

await ui.evaluate(async () => {
  const bytes = new TextEncoder().encode('full name: Max Keep');
  await DeskDB.set('tools-forms-filler', 'draft', {
    refs: [{ id: 'r9007199254740991', name: 'max-keep', bytes, mime: 'text/plain', text: 'full name: Max Keep' }]
  });
});
await ui.reload({ waitUntil: 'domcontentloaded' });
await ui.waitForFunction(() => {
  const row = FormDesk.refs().find((item) => item.name === 'max-keep');
  return row && row.id === 'r9007199254740991' && row.status !== 'reading';
});
copyFileSync('/tmp/ref-text.pdf', '/tmp/ref-after-max-a.pdf');
copyFileSync('/tmp/ref-text.pdf', '/tmp/ref-after-max-b.pdf');
await ui.locator('#refInput').setInputFiles('/tmp/ref-after-max-a.pdf');
await ui.waitForFunction(() => FormDesk.refs().some((item) => item.name === 'ref-after-max-a.pdf' && item.status && item.status !== 'reading'));
await ui.locator('#refInput').setInputFiles('/tmp/ref-after-max-b.pdf');
await ui.waitForFunction(() => FormDesk.refs().every((item) => item.status && item.status !== 'reading') && FormDesk.refs().some((item) => item.name === 'ref-after-max-b.pdf'));
const maxRows = await ui.evaluate(() => FormDesk.refs());
const byMax = Object.fromEntries(maxRows.map((item) => [item.name, item]));
const freshIds = [byMax['ref-after-max-a.pdf'] && byMax['ref-after-max-a.pdf'].id, byMax['ref-after-max-b.pdf'] && byMax['ref-after-max-b.pdf'].id];
check('a restored maximum safe id and two later uploads stay unique and finished', byMax['max-keep'] && byMax['max-keep'].id === 'r9007199254740991' && byMax['max-keep'].status !== 'reading' && freshIds[0] && freshIds[1] && new Set(freshIds.concat([byMax['max-keep'].id])).size === 3 && freshIds.every((id) => /^r[1-9][0-9]*$/.test(id) && id.length < 16) && maxRows.every((item) => item.status !== 'reading'), JSON.stringify(maxRows.map((item) => item.id + ':' + item.name + ':' + item.status)));

const out = { passed: checks.filter((item) => item.ok).length, failed: checks.filter((item) => !item.ok).length, checks, paired, lease, hungInit };
writeFileSync('/tmp/inline-wt/research/forms-filler/visual-e2e/results/ref-read.json', JSON.stringify(out, null, 2));
console.log('SUMMARY', out.passed, '/', checks.length, 'paired-ms', paired.ms);
await browser.close();
if (out.failed) process.exit(1);
