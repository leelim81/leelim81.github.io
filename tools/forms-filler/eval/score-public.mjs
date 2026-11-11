/* 28 public forms x 3 synthetic people x 3 modes.
   node tools/forms-filler/eval/score-public.mjs --root <forms-filler dir> --out result.json
   node tools/forms-filler/eval/score-public.mjs --diff a.json b.json
   node tools/forms-filler/eval/score-public.mjs --write-expect <forms-filler dir>
   PDFs are cached under /tmp/forms-filler-public and are not committed. */
import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { people, photoText, typedText } from './public-people.mjs';
import { answersFor, sameAnswer } from './public-expect.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../../..');
const cache = '/tmp/forms-filler-public';
const modes = ['photo', 'typed', 'sheet'];

function catalog() {
  const vendored = JSON.parse(readFileSync(join(repo, 'research/forms-filler/data/public-forms-not-vendored.json'), 'utf8'));
  const urls = JSON.parse(readFileSync(join(repo, 'research/forms-filler/fixtures/public-form-urls.json'), 'utf8'));
  const forms = vendored.forms.map((row) => ({ id: row.id, url: row.url, sha256: row.sha256 || '' }));
  const seen = new Set(forms.map((row) => row.url.split('?')[0]));
  urls.forms.forEach((row) => {
    if (seen.has(row.url.split('?')[0])) return;
    forms.push({ id: row.id, url: row.url, sha256: '' });
  });
  return forms;
}

function loadPdf(form) {
  mkdirSync(cache, { recursive: true });
  const dest = join(cache, form.id + '.pdf');
  if (!existsSync(dest)) {
    const got = spawnSync('curl', ['-fsSL', '-A', 'forms-filler-score/1.0', '-o', dest, form.url], { encoding: 'utf8' });
    if (got.status !== 0) throw new Error(form.id + ' download failed');
  }
  return new Uint8Array(readFileSync(dest));
}

function loadApi(root) {
  const require = createRequire(pathToFileURL(join(root, 'facts.js')));
  global.location = { href: pathToFileURL(join(root, 'index.html')).href };
  global.window = global;
  global.PDFLib = require(join(root, 'vendor/pdf/pdf-lib.min.js'));
  require(join(root, 'vendor/pdf/pdf.min.js'));
  let workerSrc = join(root, 'vendor/pdf/pdf.worker.min.js');
  Object.defineProperty(global.pdfjsLib.GlobalWorkerOptions, 'workerSrc', {
    configurable: true,
    get() { return workerSrc; },
    set(value) {
      const text = String(value || '');
      workerSrc = text.startsWith('file://') ? new URL(text).pathname : (text || workerSrc);
    }
  });
  global.FormPerson = require(join(root, 'person.js'));
  global.FormEvidence = require(join(root, 'evidence.js'));
  global.FormFacts = require(join(root, 'facts.js'));
  global.FormSpots = require(join(root, 'spots.js'));
  global.FormSelect = require(join(root, 'select.js'));
  require(join(root, 'thresholds.js'));
  require(join(root, 'fields.js'));
  return {
    evidence: global.FormEvidence,
    facts: global.FormFacts,
    select: global.FormSelect,
    fields: global.FormFields,
    thresholds: global.FormThresholds
  };
}

function clone(fields) {
  return fields.map((field) => Object.assign({}, field));
}

function slotValue(api, idn, slot, field, list) {
  const blank = api.evidence.addressSlotsBlank && api.evidence.addressSlotsBlank(idn, list);
  if (blank && (slot === 'address' || slot === 'blk' || slot === 'street' || slot === 'unit' || slot === 'postal')) return '';
  if (slot === 'name') return idn.name || '';
  if (slot === 'nric') return idn.nric || '';
  if (slot === 'dob') return idn.dob || '';
  if (slot === 'sex') return idn.sex || '';
  if (slot === 'nationality') return idn.nationality || '';
  if (slot === 'race') return idn.race || '';
  if (slot === 'address' || slot === 'blk') return (api.evidence.identityCardOffer(idn, slot, list) || {}).value || '';
  if (slot === 'postal') return (api.evidence.identityCardOffer(idn, 'postal', list, field) || {}).value || '';
  if (slot === 'street') return idn.street || '';
  if (slot === 'unit') return idn.unit ? '#' + idn.unit : '';
  return '';
}

function fillsOf(api, fields, person, mode) {
  const list = clone(fields);
  const text = mode === 'photo' ? photoText(person) : typedText(person);
  if (mode === 'sheet') {
    const mapped = api.facts.mapFactsToFields(api.facts.fromText(text), list);
    return list.filter((field) => mapped[field.id]).map((field) => ({
      id: field.id, label: field.label || '', value: String(mapped[field.id])
    }));
  }
  if (mode === 'typed') {
    const rows = api.select.decideAll(list, text, api.thresholds, { channel: 'text-layer' });
    return rows.filter((row) => String(row.value || '').trim()).map((row) => ({
      id: row.fieldId, label: (list.find((field) => field.id === row.fieldId) || {}).label || '', value: String(row.value)
    }));
  }
  const rows = api.select.decideAll(list, text, api.thresholds, { channel: 'ocr' });
  const idn = api.facts.identityRead(text);
  const byId = Object.fromEntries(rows.map((row) => [row.fieldId, row]));
  const out = [];
  list.forEach((field) => {
    const row = byId[field.id] || {};
    const slot = api.evidence.identityPhotoSlot(field, list) || '';
    let value = slotValue(api, idn, slot, field, list);
    if ((!slot || !value) && api.evidence.keepAgreedName && api.evidence.keepAgreedName(row, field, idn.name)) value = row.value || '';
    if (slot === 'dob' && value && api.evidence.dateForField) {
      const shaped = api.evidence.dateForField(value, field);
      if (shaped.blocked) value = '';
      else value = shaped.value || value;
    }
    if (String(value || '').trim()) out.push({ id: field.id, label: field.label || '', value: String(value) });
  });
  return out;
}

function judge(answers, personById, formId, personId, fill, fields) {
  const person = personById[personId];
  const key = formId + '|' + fill.id + '|' + personId;
  const expected = answers[key];
  const field = fields.find((item) => item.id === fill.id) || { id: fill.id, label: fill.label };
  if (!expected || !expected.value) {
    return { verdict: 'wrong', expected: '', kind: '', label: fill.label, value: fill.value, id: fill.id };
  }
  const ok = sameAnswer(expected.kind, expected.value, fill.value, person);
  return { verdict: ok ? 'correct' : 'wrong', expected: expected.value, kind: expected.kind, label: fill.label, value: fill.value, id: fill.id };
}

async function scoreRoot(root) {
  const api = loadApi(root);
  const answers = JSON.parse(readFileSync(join(here, 'public-expected.json'), 'utf8')).answers;
  const personById = Object.fromEntries(people.map((person) => [person.id, person]));
  const runs = [];
  const readErrors = [];
  for (const form of catalog()) {
    let read;
    try {
      read = await api.fields.read(loadPdf(form));
    } catch (err) {
      readErrors.push({ form: form.id, error: String(err && err.message || err) });
      continue;
    }
    const fields = read.fields || [];
    for (const person of people) {
      for (const mode of modes) {
        const fills = fillsOf(api, fields, person, mode).map((fill) => judge(answers, personById, form.id, person.id, fill, fields));
        const expectedIds = Object.keys(answers).filter((key) => key.startsWith(form.id + '|') && key.endsWith('|' + person.id));
        const filled = new Set(fills.map((fill) => fill.id));
        expectedIds.forEach((key) => {
          const id = key.split('|')[1];
          if (filled.has(id)) return;
          fills.push({ verdict: 'empty-but-expected', expected: answers[key].value, kind: answers[key].kind, label: answers[key].label, value: '', id: id });
        });
        runs.push({ form: form.id, person: person.id, mode: mode, fills: fills });
      }
    }
    process.stderr.write(form.id + ' ' + fields.length + '\n');
  }
  const tally = { correct: 0, wrong: 0, emptyButExpected: 0 };
  runs.forEach((run) => {
    run.fills.forEach((fill) => {
      if (fill.verdict === 'correct') tally.correct += 1;
      else if (fill.verdict === 'wrong') tally.wrong += 1;
      else if (fill.verdict === 'empty-but-expected') tally.emptyButExpected += 1;
    });
  });
  tally.precision = tally.correct + tally.wrong ? tally.correct / (tally.correct + tally.wrong) : null;
  tally.runs = runs.length;
  return { root: root, readErrors: readErrors, tally: tally, runs: runs };
}

function diffReports(left, right) {
  function index(report) {
    const out = {};
    report.runs.forEach((run) => {
      run.fills.forEach((fill) => {
        if (!fill.value) return;
        out[run.mode + '|' + run.form + '|' + run.person + '|' + fill.id] = fill;
      });
    });
    return out;
  }
  const a = index(left);
  const b = index(right);
  const changes = [];
  Object.keys(a).concat(Object.keys(b)).filter((key, i, all) => all.indexOf(key) === i).sort().forEach((key) => {
    const av = a[key] ? a[key].value : '';
    const bv = b[key] ? b[key].value : '';
    if (av === bv) return;
    const row = b[key] || a[key];
    changes.push({
      key: key,
      label: row.label,
      from: av,
      to: bv,
      fromVerdict: a[key] ? a[key].verdict : '',
      toVerdict: b[key] ? b[key].verdict : ''
    });
  });
  return changes;
}

const argv = process.argv.slice(2);
if (argv[0] === '--write-expect') {
  const api = loadApi(argv[1] || join(repo, 'tools/forms-filler'));
  const answers = {};
  for (const form of catalog()) {
    const read = await api.fields.read(loadPdf(form));
    Object.assign(answers, answersFor(form.id, read.fields || []));
    process.stderr.write('expect ' + form.id + '\n');
  }
  const body = {
    note: 'Each kept answer was read from the PDF line around that box and the synthetic person. section and why say which line. A missing key is empty. The same answer is used for photo, typed, and sheet. Values are not copied from filler output.',
    modes: modes,
    people: people.map((person) => person.id),
    answers: answers
  };
  writeFileSync(join(here, 'public-expected.json'), JSON.stringify(body, null, 2) + '\n');
  console.log('answers', Object.keys(answers).length);
} else if (argv[0] === '--diff') {
  const left = JSON.parse(readFileSync(argv[1], 'utf8'));
  const right = JSON.parse(readFileSync(argv[2], 'utf8'));
  const changes = diffReports(left, right);
  console.log(JSON.stringify({
    left: left.tally,
    right: right.tally,
    changes: changes
  }, null, 2));
} else if (argv[0] === '--root') {
  const report = await scoreRoot(argv[1]);
  if (argv[2] === '--out') writeFileSync(argv[3], JSON.stringify(report));
  console.log(JSON.stringify(report.tally, null, 2));
  if (report.readErrors.length) console.log('readErrors', report.readErrors);
} else {
  console.error('usage: --root <dir> --out <file> | --diff a.json b.json | --write-expect <dir>');
  process.exit(2);
}
