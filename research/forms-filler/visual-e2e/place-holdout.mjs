#!/usr/bin/env node
/** Build the placement holdout. Does not read the detector. */
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, StandardFonts, rgb, degrees, PDFName, PDFNumber } = require('pdf-lib');
const root = dirname(fileURLToPath(import.meta.url));
const dir = join(root, 'fixtures/place-holdout');
mkdirSync(dir, { recursive: true });

function nric(prefix, digits) {
  const weights = [2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(digits[i]) * weights[i];
  if (prefix === 'T' || prefix === 'G') sum += 4;
  const letters = prefix === 'S' || prefix === 'T' ? 'JZIHGFEDCBA' : 'XWUTRQPNMLK';
  return prefix + digits + letters[sum % 11];
}

const person = {
  name: 'Eden Moss',
  otherName: 'Lars Moss',
  otherDob: '02/02/1972',
  nric: nric('S', '8804411'),
  dob: '14/02/1991',
  phone: '+65 81144110',
  email: 'eden.moss44@example.com',
  address: '18 MYRTLE ROW 554418'
};
const labels = [
  'Moss applicant name',
  'Moss applicant NRIC',
  'Moss applicant birth date',
  'Moss applicant phone',
  'Moss applicant email'
];
const kinds = ['name', 'nric', 'dob', 'phone', 'email'];
const values = [person.name, person.nric, person.dob, person.phone, person.email];
const reference = [
  'Applicant',
  `Full name: ${person.name}`,
  `NRIC: ${person.nric}`,
  `Date of birth: ${person.dob}`,
  `Phone: ${person.phone}`,
  `Email: ${person.email}`,
  `Address: ${person.address}`,
  'Spouse',
  `Full name: ${person.otherName}`,
  `Date of birth: ${person.otherDob}`
].join('\n');

const forms = [
  { id: 'moss-over', layout: 'caption-over', angle: 0.3 },
  { id: 'moss-under', layout: 'caption-under', angle: -0.4 },
  { id: 'moss-mixed', layout: 'caption-mixed', angle: 0.2 }
];
const spec = [];
forms.forEach((form, index) => {
  spec.push({
    id: form.id, layout: form.layout, png: join(dir, `${form.id}.form.png`),
    labels, title: form.id, angle: form.angle, seed: 20261190 + index, font: 'sans', blur: 0.2, sigma: 4
  });
  spec.push({
    id: form.id + '-ref', layout: 'text', png: join(dir, `${form.id}.reference.png`),
    lines: reference.split('\n'), angle: 0.2, seed: 20261210 + index, font: 'sans'
  });
});
const specPath = '/tmp/place-holdout-spec.json';
const boxPath = '/tmp/place-holdout-boxes.json';
writeFileSync(specPath, JSON.stringify(spec));
const py = spawnSync('python3', [join(root, 'scan_raster.py'), specPath, boxPath], { encoding: 'utf8' });
if (py.status !== 0) {
  console.error(py.stderr || py.stdout);
  process.exit(py.status || 1);
}
const drawn = JSON.parse(readFileSync(boxPath, 'utf8'));

function sha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
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

const records = [];
for (const form of forms) {
  const wrapped = await wrapPng(join(dir, `${form.id}.form.png`));
  const ref = await wrapPng(join(dir, `${form.id}.reference.png`));
  writeFileSync(join(dir, `${form.id}.form.pdf`), wrapped.bytes);
  writeFileSync(join(dir, `${form.id}.reference.pdf`), ref.bytes);
  const fields = labels.map((label, i) => ({
    kind: kinds[i],
    label_drawn: label,
    answerable: true,
    gold: values[i],
    box_px: drawn[form.id].boxes[i],
    rect: toPdf(drawn[form.id].boxes[i], wrapped.pageW, wrapped.pageH, wrapped.imageW, wrapped.imageH)
  }));
  records.push({
    id: form.id,
    split: 'place-holdout',
    template_id: form.layout,
    expect: 'place',
    person_id: person.name,
    channel_expected: 'ocr',
    form_pdf: `fixtures/place-holdout/${form.id}.form.pdf`,
    reference_pdf: `fixtures/place-holdout/${form.id}.reference.pdf`,
    other_values: { name: [person.otherName], dob: [person.otherDob], phone: [] },
    fields
  });
}

const overBytes = readFileSync(join(dir, 'moss-over.form.pdf'));
const turned = await PDFDocument.load(overBytes);
turned.getPages()[0].setRotation(degrees(90));
writeFileSync(join(dir, 'moss-turned.form.pdf'), await turned.save());
const cropped = await PDFDocument.load(overBytes);
cropped.getPages()[0].setCropBox(30, 30, 400, 500);
writeFileSync(join(dir, 'moss-crop.form.pdf'), await cropped.save());
const scaled = await PDFDocument.load(overBytes);
scaled.getPages()[0].node.set(PDFName.of('UserUnit'), PDFNumber.of(2));
writeFileSync(join(dir, 'moss-scale.form.pdf'), await scaled.save());
for (const id of ['moss-turned', 'moss-crop', 'moss-scale']) {
  records.push({
    id,
    split: 'place-holdout',
    template_id: id.slice(5),
    expect: 'blocked',
    person_id: person.name,
    channel_expected: 'ocr',
    form_pdf: `fixtures/place-holdout/${id}.form.pdf`,
    reference_pdf: 'fixtures/place-holdout/moss-over.reference.pdf',
    other_values: { name: [], dob: [], phone: [] },
    fields: []
  });
}

const native = await PDFDocument.create();
const nativePage = native.addPage([595, 842]);
const font = await native.embedFont(StandardFonts.Helvetica);
nativePage.drawText('native widgets', { x: 48, y: 790, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
const form = native.getForm();
labels.forEach((label, i) => {
  const y = 700 - i * 52;
  nativePage.drawText(label, { x: 48, y: y + 24, size: 10, font });
  form.createTextField(label).addToPage(nativePage, { x: 48, y, width: 340, height: 18 });
});
writeFileSync(join(dir, 'moss-widgets.form.pdf'), await native.save());
const nativeTurned = await PDFDocument.load(readFileSync(join(dir, 'moss-widgets.form.pdf')));
nativeTurned.getPages()[0].setRotation(degrees(90));
writeFileSync(join(dir, 'moss-widgets-turned.form.pdf'), await nativeTurned.save());
for (const id of ['moss-widgets', 'moss-widgets-turned']) {
  records.push({
    id,
    split: 'place-holdout',
    template_id: 'native',
    expect: 'widgets',
    person_id: person.name,
    channel_expected: 'text-layer',
    form_pdf: `fixtures/place-holdout/${id}.form.pdf`,
    reference_pdf: 'fixtures/place-holdout/moss-over.reference.pdf',
    other_values: { name: [person.otherName], dob: [], phone: [] },
    fields: []
  });
}

const banned = ['Grove', 'Fenn', 'Bent', 'Quill', 'ALDER', 'COVE', 'SLOE', 'QUAY', 'BIRCH'];
const blob = JSON.stringify(records);
const hits = banned.filter((token) => blob.includes(token));
if (hits.length) {
  console.error('overlap', hits);
  process.exit(1);
}
writeFileSync(join(root, 'gold/place-holdout.jsonl'), records.map((row) => JSON.stringify(row)).join('\n') + '\n');

const codeFiles = [
  'tools/forms-filler/fields.js',
  'tools/forms-filler/app.js',
  'tools/forms-filler/evidence.js',
  'tools/forms-filler/select.js',
  'tools/forms-filler/thresholds.js'
];
const files = {};
readdirSync(dir).filter((name) => name.endsWith('.pdf')).forEach((name) => {
  const rel = `fixtures/place-holdout/${name}`;
  files[rel] = { bytes: statSync(join(root, rel)).size, sha256: sha(join(root, rel)) };
});
files['gold/place-holdout.jsonl'] = { bytes: statSync(join(root, 'gold/place-holdout.jsonl')).size, sha256: sha(join(root, 'gold/place-holdout.jsonl')) };
const codeHashes = {};
codeFiles.forEach((rel) => { codeHashes[rel] = sha(join(root, '../../..', rel)); });
const freeze = {
  stage: 'place-holdout',
  seed: 20261190,
  looked: false,
  note: 'Code and fixtures hashed before the one look. Do not retune the detector after that look. Three placement forms are a small sample, not a reliability claim. OCR autofill stays off.',
  people: ['Eden Moss', 'Lars Moss'],
  street: 'MYRTLE ROW',
  files,
  codeHashes
};
writeFileSync(join(root, 'PLACE-FREEZE.json'), JSON.stringify(freeze, null, 2) + '\n');
console.log('place-holdout forms', records.map((row) => row.id + ':' + row.expect).join(' '));
