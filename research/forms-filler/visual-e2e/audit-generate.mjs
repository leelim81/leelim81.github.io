#!/usr/bin/env node
/** Write the audit family and its hash freeze. Does not read the pages back. */
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const root = dirname(fileURLToPath(import.meta.url));
const dest = join(root, 'fixtures/audit-quill');
mkdirSync(dest, { recursive: true });

function nric(prefix, digits) {
  const weights = [2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(digits[i]) * weights[i];
  if (prefix === 'T' || prefix === 'G') sum += 4;
  const letters = prefix === 'S' || prefix === 'T' ? 'JZIHGFEDCBA' : 'XWUTRQPNMLK';
  return prefix + digits + letters[sum % 11];
}

const people = {
  lior: {
    name: 'Lior Quill', nric: nric('S', '4455018'), dob: '11/02/1994',
    phone: '+65 81004401', email: 'lior.quill4@example.com', address: '18 BIRCH COURT 441180',
    otherName: 'Ned Brook', otherDob: '04/04/1974'
  },
  nils: {
    name: 'Nils Quill', nric: nric('T', '4455021'), dob: '12/03/1995',
    phone: '+65 81004402', email: 'nils.quill5@example.com', address: '19 BIRCH COURT 441181',
    otherName: 'Ned Brook', otherDob: '04/04/1974'
  },
  oda: {
    name: 'Oda Quill', nric: nric('S', '4455034'), dob: '13/04/1996',
    phone: '+65 81004403', email: 'oda.quill6@example.com', address: '20 BIRCH COURT 441182',
    otherName: 'Ned Brook', otherDob: '04/04/1974'
  }
};

const labels = [
  ['name', 'Primary applicant name'],
  ['nric', 'Primary applicant NRIC'],
  ['dob', 'Primary applicant birth date'],
  ['phone', 'Primary applicant phone'],
  ['email', 'Primary applicant email'],
  ['address', 'Primary applicant premises'],
  ['other', 'Badge colour']
];

function reference(mode, p) {
  const applicant = [
    'Applicant',
    `Full name: ${p.name}`,
    `NRIC: ${p.nric}`,
    `Date of birth: ${p.dob}`,
    `Phone: ${p.phone}`,
    `Email: ${p.email}`,
    `Address: ${p.address}`
  ];
  if (mode === 'single') return applicant.join('\n');
  if (mode === 'patient_first') {
    return ['Patient', `Full name: ${p.otherName}`, `Date of birth: ${p.otherDob}`, ...applicant].join('\n');
  }
  if (mode === 'spouse') {
    return ['Spouse', `Full name: ${p.otherName}`, `Phone: +65 81009999`, ...applicant].join('\n');
  }
  return ['Applicant', `Full name: ${p.name}`, 'Applicant', `Full name: ${p.otherName}`, `NRIC: ${p.nric}`, `Date of birth: ${p.dob}`, `Phone: ${p.phone}`, `Email: ${p.email}`, `Address: ${p.address}`].join('\n');
}

function gold(mode, p) {
  const present = {
    name: mode === 'conflict' ? '' : p.name,
    nric: p.nric,
    dob: p.dob,
    phone: p.phone,
    email: p.email,
    address: p.address,
    other: ''
  };
  return labels.map(([kind, label]) => ({
    kind,
    label_drawn: label,
    answerable: kind !== 'other' && !!present[kind],
    gold: present[kind] || ''
  }));
}

async function nativeForm() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('quill widget (synthetic)', { x: 48, y: 790, size: 16, font, color: rgb(0.1, 0.1, 0.1) });
  const form = doc.getForm();
  const rects = [];
  labels.forEach(([, label], index) => {
    const y = 700 - index * 48;
    page.drawText(label, { x: 48, y: y + 22, size: 10, font });
    const box = form.createTextField(label);
    box.addToPage(page, { x: 48, y, width: 360, height: 18 });
    rects.push([48, y, 360, 18]);
  });
  return { bytes: await doc.save(), rects };
}

async function vectorReference(text) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let y = 780;
  text.split('\n').forEach((line) => {
    page.drawText(line, { x: 48, y, size: 12, font });
    y -= 22;
  });
  return doc.save();
}

async function wrapPng(pngPath) {
  const png = readFileSync(pngPath);
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(png);
  const pageW = 595;
  const pageH = 595 * (image.height / image.width);
  const page = doc.addPage([pageW, pageH]);
  page.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });
  return { bytes: await doc.save(), pageW, pageH, imageW: image.width, imageH: image.height };
}

function toPdf(box, pageW, pageH, imageW, imageH) {
  const [x, y, w, h] = box;
  return [
    (x / imageW) * pageW,
    pageH - ((y + h) / imageH) * pageH,
    (w / imageW) * pageW,
    (h / imageH) * pageH
  ].map((value) => Math.round(value * 100) / 100);
}

const cases = [
  { id: 'quill-native-00', layout: 'native', template: 'quill_widget', mode: 'single', person: people.lior },
  { id: 'quill-native-01', layout: 'native', template: 'quill_widget', mode: 'patient_first', person: people.nils },
  { id: 'quill-native-02', layout: 'native', template: 'quill_widget', mode: 'conflict', person: people.oda },
  { id: 'quill-band-00', layout: 'band', template: 'quill_band', mode: 'spouse', person: people.oda, angle: 1.1, seed: 20261150 },
  { id: 'quill-card-00', layout: 'card', template: 'quill_card', mode: 'conflict', person: people.lior, angle: -0.7, seed: 20261151 }
];

const rasterSpec = [];
cases.filter((item) => item.layout !== 'native').forEach((item) => {
  rasterSpec.push({
    id: item.id,
    layout: item.layout,
    png: join(dest, `${item.id}.form.png`),
    lines: ['Synthetic audit page.', 'Not a copy of an intake sheet.'],
    labels: labels.map(([, label]) => label),
    angle: item.angle,
    seed: item.seed
  });
  rasterSpec.push({
    id: item.id + '-ref',
    layout: 'text',
    png: join(dest, `${item.id}.reference.png`),
    lines: reference(item.mode, item.person).split('\n'),
    angle: item.angle * 0.4,
    seed: item.seed + 7
  });
});
const specPath = '/tmp/audit-raster-spec.json';
const boxPath = '/tmp/audit-raster-boxes.json';
writeFileSync(specPath, JSON.stringify(rasterSpec));
const py = spawnSync('python3', [join(root, 'audit_raster.py'), specPath, boxPath], { encoding: 'utf8' });
if (py.status !== 0) {
  console.error(py.stderr);
  process.exit(py.status || 1);
}
const boxes = JSON.parse(readFileSync(boxPath, 'utf8'));

const records = [];
for (const item of cases) {
  const text = reference(item.mode, item.person);
  const fields = gold(item.mode, item.person);
  const refBytes = item.layout === 'native'
    ? await vectorReference(text)
    : (await wrapPng(join(dest, `${item.id}.reference.png`))).bytes;
  let formBytes;
  if (item.layout === 'native') {
    const drawn = await nativeForm();
    formBytes = drawn.bytes;
    fields.forEach((field, index) => {
      field.rect = drawn.rects[index];
    });
  } else {
    const wrapped = await wrapPng(join(dest, `${item.id}.form.png`));
    formBytes = wrapped.bytes;
    const mapped = boxes[item.id].boxes;
    fields.forEach((field, index) => {
      field.rect = toPdf(mapped[index], wrapped.pageW, wrapped.pageH, wrapped.imageW, wrapped.imageH);
      field.box_px = mapped[index];
    });
  }
  writeFileSync(join(dest, `${item.id}.form.pdf`), formBytes);
  writeFileSync(join(dest, `${item.id}.reference.pdf`), refBytes);
  records.push({
    id: item.id,
    split: 'audit',
    template_id: item.template,
    layout: item.layout,
    ambiguity: item.mode,
    person_id: item.person.name,
    form_pdf: `fixtures/audit-quill/${item.id}.form.pdf`,
    reference_pdf: `fixtures/audit-quill/${item.id}.reference.pdf`,
    other_values: {
      name: [item.person.otherName || ''].filter(Boolean),
      dob: [item.person.otherDob || ''].filter(Boolean),
      phone: item.mode === 'spouse' ? ['+65 81009999'] : []
    },
    fields
  });
}

const forbiddenTemplates = ['intake_sheet', 'roster_sheet', 'holder_sheet', 'member_stack', 'desk_widget', 'gate_widget', 'claim_widget'];
const forbiddenStreets = ['QUAY LANE', 'RIDGE ROW', 'MILL PATH', 'CEDAR WALK', 'NORTH QUAY', 'PALM ROAD'];
const overlap = { templates: [], streets: [], names: [] };
records.forEach((record) => {
  if (forbiddenTemplates.includes(record.template_id)) overlap.templates.push(record.template_id);
  const blob = JSON.stringify(record);
  forbiddenStreets.forEach((street) => { if (blob.includes(street)) overlap.streets.push(street); });
});
const oldGold = readdirSync(join(root, 'gold')).filter((name) => name.endsWith('.jsonl') && name !== 'audit.jsonl');
const oldText = oldGold.map((name) => readFileSync(join(root, 'gold', name), 'utf8')).join('\n');
['Lior Quill', 'Nils Quill', 'Oda Quill', 'Ned Brook', 'BIRCH COURT'].forEach((token) => {
  if (oldText.includes(token)) overlap.names.push(token);
});
if (overlap.templates.length || overlap.streets.length || overlap.names.length) {
  console.error(overlap);
  process.exit(1);
}

mkdirSync(join(root, 'gold'), { recursive: true });
writeFileSync(join(root, 'gold/audit.jsonl'), records.map((record) => JSON.stringify(record)).join('\n') + '\n');

function sha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
const files = {};
function walk(dir) {
  readdirSync(dir).forEach((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (!name.endsWith('.png')) files[path.slice(root.length + 1)] = { bytes: statSync(path).size, sha256: sha(path) };
  });
}
walk(dest);
files['gold/audit.jsonl'] = { bytes: statSync(join(root, 'gold/audit.jsonl')).size, sha256: sha(join(root, 'gold/audit.jsonl')) };
const code = ['../../../tools/forms-filler/facts.js', '../../../tools/forms-filler/evidence.js', '../../../tools/forms-filler/select.js', '../../../tools/forms-filler/thresholds.js', '../../../tools/forms-filler/fields.js'];
const codeHashes = {};
code.forEach((rel) => {
  const path = join(root, rel);
  codeHashes[rel.replace('../../../', '')] = sha(path);
});
const freeze = {
  family: 'audit-quill',
  seed: 20261150,
  looked: false,
  purpose: 'One audit look after this file. Not a population sample. Not a copy of intake, member stack, or holder sheets.',
  gates: 'tools/forms-filler/thresholds.js ocrAutofill all false. Do not edit from this look.',
  templates: ['quill_widget', 'quill_band', 'quill_card'],
  people: ['Lior Quill', 'Nils Quill', 'Oda Quill', 'Ned Brook'],
  street: 'BIRCH COURT',
  overlap,
  files,
  codeHashes
};
writeFileSync(join(root, 'AUDIT-FREEZE.json'), JSON.stringify(freeze, null, 2) + '\n');
console.log('audit family', records.length, 'files', Object.keys(files).length);
