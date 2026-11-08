#!/usr/bin/env node
/** Build three disjoint scan families and hash them. Does not OCR anything. */
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const root = dirname(fileURLToPath(import.meta.url));

function nric(prefix, digits) {
  const weights = [2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(digits[i]) * weights[i];
  if (prefix === 'T' || prefix === 'G') sum += 4;
  const letters = prefix === 'S' || prefix === 'T' ? 'JZIHGFEDCBA' : 'XWUTRQPNMLK';
  return prefix + digits + letters[sum % 11];
}

const families = {
  'scan-dev': {
    street: 'ALDER BEND',
    people: {
      a: { name: 'Willa Grove', other: 'Hugo Grove' },
      b: { name: 'Hugo Grove', other: 'Willa Grove' }
    },
    postal: 551100
  },
  'scan-cal': {
    street: 'COVE REACH',
    people: {
      a: { name: 'Ida Fenn', other: 'Jules Fenn' },
      b: { name: 'Jules Fenn', other: 'Ida Fenn' }
    },
    postal: 552200
  },
  'scan-audit': {
    street: 'SLOE WALK',
    people: {
      a: { name: 'Yara Bent', other: 'Amos Bent' },
      b: { name: 'Amos Bent', other: 'Yara Bent' }
    },
    postal: 553300
  }
};

function person(split, key, index) {
  const spec = families[split];
  const who = spec.people[key];
  const prefix = index % 2 === 0 ? 'S' : 'T';
  const digits = String(8800000 + index * 13).slice(0, 7);
  return {
    name: who.name,
    otherName: who.other,
    otherDob: '05/05/1975',
    nric: nric(prefix, digits),
    dob: `${String(3 + index).padStart(2, '0')}/0${1 + (index % 8)}/199${index % 9}`,
    phone: `+65 81${String(100000 + index * 17).slice(0, 6)}`,
    email: `${who.name.split(' ')[0].toLowerCase()}.grove${index}@example.com`.replace('grove', split === 'scan-dev' ? 'grove' : split === 'scan-cal' ? 'fenn' : 'bent'),
    address: `${20 + index} ${spec.street} ${spec.postal + index}`
  };
}

function reference(mode, p) {
  const block = [
    'Applicant',
    `Full name: ${p.name}`,
    `NRIC: ${p.nric}`,
    `Date of birth: ${p.dob}`,
    `Phone: ${p.phone}`,
    `Email: ${p.email}`,
    `Address: ${p.address}`
  ];
  if (mode === 'single') return block.join('\n');
  if (mode === 'patient_first') {
    return ['Patient', `Full name: ${p.otherName}`, `Date of birth: ${p.otherDob}`, ...block].join('\n');
  }
  if (mode === 'spouse') {
    return ['Spouse', `Full name: ${p.otherName}`, `Phone: +65 81999900`, ...block].join('\n');
  }
  return ['Applicant', `Full name: ${p.name}`, 'Applicant', `Full name: ${p.otherName}`, ...block.slice(2)].join('\n');
}

const devForms = [
  { id: 'grove-narrow', layout: 'under', line_w: 200, angle: 0.8, mode: 'single', who: 'a', index: 1, font: 'sans', title: 'grove narrow' },
  { id: 'grove-columns', layout: 'columns', angle: -0.6, mode: 'spouse', who: 'a', index: 2, font: 'sans', title: 'grove columns' },
  { id: 'grove-table', layout: 'table', angle: 0.4, mode: 'single', who: 'b', index: 3, font: 'sans', title: 'grove table' },
  { id: 'grove-beside', layout: 'beside', angle: 0.9, mode: 'single', who: 'b', index: 4, font: 'sans', title: 'grove beside' },
  { id: 'grove-boxes', layout: 'boxes', angle: 0.5, mode: 'patient_first', who: 'a', index: 5, font: 'sans', title: 'grove boxes' },
  { id: 'grove-serif', layout: 'under', line_w: 180, pitch: 110, angle: 2.2, mode: 'conflict', who: 'b', index: 6, font: 'serif', title: 'grove serif', blur: 0.45, sigma: 8 }
];

const calForms = [
  { id: 'fenn-row', layout: 'row', angle: -1.3, mode: 'single', who: 'a', index: 11, font: 'serif', title: 'fenn row' },
  { id: 'fenn-ladder', layout: 'ladder', angle: 1.6, mode: 'patient_first', who: 'b', index: 12, font: 'sans', title: 'fenn ladder' }
];

const auditForms = [
  { id: 'bent-margin', layout: 'margin', angle: -1.8, mode: 'conflict', who: 'a', index: 21, font: 'serif', title: 'bent margin', blur: 0.5, sigma: 7 },
  { id: 'bent-above', layout: 'above', angle: 0.7, mode: 'spouse', who: 'b', index: 22, font: 'sans', title: 'bent above' }
];

function labelsFor(item, p) {
  const stem = p.name.split(' ')[1];
  if (item.layout === 'columns') {
    return [
      `${stem} applicant name`, `${stem} patient name`,
      `${stem} applicant phone`, `${stem} patient phone`,
      `${stem} applicant email`, 'Badge tint'
    ];
  }
  if (item.layout === 'table' || item.layout === 'row') {
    return [`${stem} name`, `${stem} phone`, `${stem} email`];
  }
  return [
    `${stem} applicant name`,
    `${stem} applicant NRIC`,
    `${stem} applicant birth date`,
    `${stem} applicant phone`,
    `${stem} applicant email`,
    'Badge tint'
  ];
}

function kindsFor(labels) {
  return labels.map((label) => {
    const s = label.toLowerCase();
    if (/badge|tint/.test(s)) return 'other';
    if (/nric|fin/.test(s)) return 'nric';
    if (/birth|dob/.test(s)) return 'dob';
    if (/phone/.test(s)) return 'phone';
    if (/email/.test(s)) return 'email';
    if (/premises|address/.test(s)) return 'address';
    if (/name/.test(s)) return 'name';
    return 'other';
  });
}

function goldRows(labels, kinds, mode, p) {
  return labels.map((label, i) => {
    const kind = kinds[i];
    const patient = /patient/.test(label.toLowerCase());
    let value = '';
    let answerable = false;
    if (kind === 'name' && !patient && mode !== 'conflict') { value = p.name; answerable = true; }
    if (kind === 'name' && patient) { value = p.otherName; answerable = false; }
    if (kind === 'nric' && mode !== 'conflict') { value = p.nric; answerable = true; }
    if (kind === 'nric' && mode === 'conflict') { value = p.nric; answerable = true; }
    if (kind === 'dob' && mode !== 'conflict') { value = p.dob; answerable = true; }
    if (kind === 'phone' && !patient) { value = p.phone; answerable = true; }
    if (kind === 'phone' && patient) { value = '+65 81999900'; answerable = false; }
    if (kind === 'email') { value = p.email; answerable = true; }
    if (kind === 'other') { value = ''; answerable = false; }
    return { kind, label_drawn: label, answerable, gold: answerable ? value : '' };
  });
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
  ].map((v) => Math.round(v * 100) / 100);
}

async function vectorForm(labels) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('vector lines, no widgets', { x: 48, y: 790, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
  const rects = [];
  labels.forEach((label, i) => {
    const y = 720 - i * 48;
    page.drawText(label, { x: 48, y: y + 16, size: 11, font });
    page.drawLine({ start: { x: 48, y }, end: { x: 360, y }, thickness: 0.8, color: rgb(0, 0, 0) });
    rects.push([48, y - 2, 312, 14]);
  });
  return { bytes: await doc.save(), rects };
}

async function nativeForm(labels) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('native widgets', { x: 48, y: 790, size: 12, font });
  const form = doc.getForm();
  const rects = [];
  labels.forEach((label, i) => {
    const y = 700 - i * 52;
    page.drawText(label, { x: 48, y: y + 24, size: 10, font });
    form.createTextField(label).addToPage(page, { x: 48, y, width: 340, height: 18 });
    rects.push([48, y, 340, 18]);
  });
  return { bytes: await doc.save(), rects };
}

async function vectorRef(text) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let y = 780;
  text.split('\n').forEach((line) => {
    page.drawText(line.slice(0, 90), { x: 48, y, size: 12, font });
    y -= 20;
  });
  return doc.save();
}

function pushCase(bucket, item) {
  const split = item.split;
  const p = person(split, item.who, item.index);
  const labels = item.labels || labelsFor(item, p);
  const kinds = kindsFor(labels);
  bucket.forms.push({ ...item, split, person: p, labels, kinds, text: reference(item.mode, p) });
}

const buckets = { 'scan-dev': { forms: [] }, 'scan-cal': { forms: [] }, 'scan-audit': { forms: [] } };
devForms.forEach((item) => pushCase(buckets['scan-dev'], { ...item, split: 'scan-dev' }));
calForms.forEach((item) => pushCase(buckets['scan-cal'], { ...item, split: 'scan-cal' }));
auditForms.forEach((item) => pushCase(buckets['scan-audit'], { ...item, split: 'scan-audit' }));

{
  const p = person('scan-dev', 'a', 7);
  const labels = ['Grove applicant name', 'Grove applicant phone', 'Grove applicant email', 'Badge tint'];
  buckets['scan-dev'].forms.push({
    id: 'grove-native', split: 'scan-dev', layout: 'native', mode: 'patient_first', who: 'a',
    person: p, labels, kinds: kindsFor(labels), text: reference('patient_first', p)
  });
  const q = person('scan-dev', 'b', 8);
  const vlabels = ['Grove applicant name', 'Grove applicant NRIC', 'Grove applicant email'];
  buckets['scan-dev'].forms.push({
    id: 'grove-vector', split: 'scan-dev', layout: 'vector', mode: 'single', who: 'b',
    person: q, labels: vlabels, kinds: kindsFor(vlabels), text: reference('single', q)
  });
}

const rasterSpec = [];
for (const bucket of Object.values(buckets)) {
  for (const form of bucket.forms) {
    if (form.layout === 'native' || form.layout === 'vector') continue;
    const dir = join(root, 'fixtures', form.split);
    mkdirSync(dir, { recursive: true });
    rasterSpec.push({
      id: form.id,
      layout: form.layout,
      png: join(dir, `${form.id}.form.png`),
      labels: form.labels,
      title: form.title,
      angle: form.angle,
      seed: 20261160 + form.index,
      font: form.font,
      line_w: form.line_w,
      pitch: form.pitch,
      blur: form.blur,
      sigma: form.sigma
    });
    rasterSpec.push({
      id: form.id + '-ref',
      layout: 'text',
      png: join(dir, `${form.id}.reference.png`),
      lines: form.text.split('\n'),
      angle: (form.angle || 0.4) * 0.5,
      seed: 20261180 + form.index,
      font: form.font
    });
  }
}
const specPath = '/tmp/scan-raster-spec.json';
const boxPath = '/tmp/scan-raster-boxes.json';
writeFileSync(specPath, JSON.stringify(rasterSpec));
const py = spawnSync('python3', [join(root, 'scan_raster.py'), specPath, boxPath], { encoding: 'utf8' });
if (py.status !== 0) {
  console.error(py.stderr || py.stdout);
  process.exit(py.status || 1);
}
const drawn = JSON.parse(readFileSync(boxPath, 'utf8'));

const records = { 'scan-dev': [], 'scan-cal': [], 'scan-audit': [] };
for (const split of Object.keys(buckets)) {
  const dir = join(root, 'fixtures', split);
  mkdirSync(dir, { recursive: true });
  for (const form of buckets[split].forms) {
    const fields = goldRows(form.labels, form.kinds, form.mode, form.person);
    let formBytes;
    let refBytes;
    if (form.layout === 'native') {
      const made = await nativeForm(form.labels);
      formBytes = made.bytes;
      fields.forEach((field, i) => { field.rect = made.rects[i]; });
      refBytes = await vectorRef(form.text);
    } else if (form.layout === 'vector') {
      const made = await vectorForm(form.labels);
      formBytes = made.bytes;
      fields.forEach((field, i) => { field.rect = made.rects[i]; });
      refBytes = await vectorRef(form.text);
    } else {
      const wrapped = await wrapPng(join(dir, `${form.id}.form.png`));
      formBytes = wrapped.bytes;
      const mapped = drawn[form.id].boxes;
      fields.forEach((field, i) => {
        field.box_px = mapped[i];
        field.rect = toPdf(mapped[i], wrapped.pageW, wrapped.pageH, wrapped.imageW, wrapped.imageH);
      });
      refBytes = (await wrapPng(join(dir, `${form.id}.reference.png`))).bytes;
    }
    writeFileSync(join(dir, `${form.id}.form.pdf`), formBytes);
    writeFileSync(join(dir, `${form.id}.reference.pdf`), refBytes);
    records[split].push({
      id: form.id,
      split,
      template_id: form.layout,
      ambiguity: form.mode,
      person_id: form.person.name,
      channel_expected: form.layout === 'native' || form.layout === 'vector' ? 'text-layer' : 'ocr',
      form_pdf: `fixtures/${split}/${form.id}.form.pdf`,
      reference_pdf: `fixtures/${split}/${form.id}.reference.pdf`,
      other_values: {
        name: [form.person.otherName],
        dob: [form.person.otherDob],
        phone: form.mode === 'spouse' || form.layout === 'columns' ? ['+65 81999900'] : []
      },
      fields
    });
  }
  writeFileSync(join(root, 'gold', `${split}.jsonl`), records[split].map((row) => JSON.stringify(row)).join('\n') + '\n');
}

const banned = ['intake_sheet', 'member_stack', 'holder_sheet', 'quill_widget', 'QUAY LANE', 'BIRCH COURT', 'Lior Quill', 'Nils Quill', 'Suki Sample', 'Cora Example'];
const blob = JSON.stringify(records);
const hits = banned.filter((token) => blob.includes(token));
if (hits.length) {
  console.error('overlap', hits);
  process.exit(1);
}
const owner = {};
for (const split of Object.keys(records)) {
  for (const row of records[split]) {
    if (owner[row.template_id] && owner[row.template_id] !== split) {
      console.error('layout family copied across splits', row.template_id);
      process.exit(1);
    }
    owner[row.template_id] = split;
  }
}

function sha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
const files = {};
for (const split of Object.keys(records)) {
  const dir = join(root, 'fixtures', split);
  readdirSync(dir).filter((name) => name.endsWith('.pdf')).forEach((name) => {
    const rel = `fixtures/${split}/${name}`;
    files[rel] = { bytes: statSync(join(root, rel)).size, sha256: sha(join(root, rel)) };
  });
  const goldRel = `gold/${split}.jsonl`;
  files[goldRel] = { bytes: statSync(join(root, goldRel)).size, sha256: sha(join(root, goldRel)) };
}
const codeFiles = [
  'tools/forms-filler/fields.js',
  'tools/forms-filler/evidence.js',
  'tools/forms-filler/select.js',
  'tools/forms-filler/thresholds.js'
];
const codeHashes = {};
codeFiles.forEach((rel) => { codeHashes[rel] = sha(join(root, '../../..', rel)); });
const freeze = {
  stage: 'scan-families',
  seed: 20261160,
  looked: { 'scan-dev': false, 'scan-cal': false, 'scan-audit': false },
  note: 'Development may be read while improving detection. Calibration and audit stay unread until the detector and gates are frozen.',
  gates: 'ocrAutofill remains false. Do not edit thresholds.js from these pages.',
  families,
  files,
  codeHashes
};
writeFileSync(join(root, 'SCAN-FREEZE.json'), JSON.stringify(freeze, null, 2) + '\n');
console.log(Object.keys(records).map((split) => split + ' ' + records[split].length).join(', '));
