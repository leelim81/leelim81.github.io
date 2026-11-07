#!/usr/bin/env node
/** Deterministic synthetic forms. Seed 20261111. Not the v3 text set. */
import { mkdir, writeFile, rm } from 'fs/promises';
import { createHash } from 'crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const root = dirname(fileURLToPath(import.meta.url));
const fixtures = join(root, 'fixtures');
const goldDir = join(root, 'gold');

function nric(prefix, digits) {
  const weights = [2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(digits[i]) * weights[i];
  if (prefix === 'T' || prefix === 'G') sum += 4;
  const letters = prefix === 'S' || prefix === 'T' ? 'JZIHGFEDCBA' : 'XWUTRQPNMLK';
  return prefix + digits + letters[sum % 11];
}

const SPLITS = {
  development: {
    family: 'D',
    template: 'desk_widget',
    street: 'CEDAR WALK',
    labels: {
      name: 'Full name', nric: 'NRIC', dob: 'Date of birth', phone: 'Phone',
      email: 'Email', address: 'Address', mailbox: 'Mailbox'
    },
    given: ['Dana', 'Evan', 'Fern', 'Glen', 'Hana', 'Ivan', 'Joan', 'Kurt']
  },
  calibration: {
    family: 'C',
    template: 'gate_widget',
    street: 'NORTH QUAY',
    labels: {
      name: 'Applicant name', nric: 'Identity number', dob: 'Birth date', phone: 'Day phone',
      email: 'Inbox', address: 'Premises', mailbox: 'Post mailbox'
    },
    given: ['Mina', 'Omar', 'Pia', 'Quin', 'Ruth', 'Seth', 'Tara', 'Uma', 'Vera', 'Wes', 'Yale', 'Zia']
  },
  test: {
    family: 'T',
    template: 'claim_widget',
    street: 'PALM ROAD',
    labels: {
      name: 'Claimant name', nric: 'FIN or NRIC', dob: 'Date of birth (dd/mm/yyyy)', phone: 'Callback number',
      email: 'Reply email', address: 'Dwelling', mailbox: 'PO mailbox'
    },
    given: ['Asha', 'Bram', 'Cleo', 'Dax', 'Enid', 'Faye', 'Gil', 'Hope']
  }
};

const MODES = ['single', 'patient_other', 'single', 'conflict', 'missing_email', 'same_person'];

function person(split, index) {
  const spec = SPLITS[split];
  const given = spec.given[index % spec.given.length];
  const surname = split === 'test' ? 'Fixture' : 'Example';
  const digits = String(1000000 + index * 17 + spec.family.charCodeAt(0)).slice(0, 7);
  const prefix = index % 2 === 0 ? 'S' : 'T';
  const num = 10 + index;
  const postal = String(200000 + spec.family.charCodeAt(0) * 100 + index).padStart(6, '0').slice(0, 6);
  return {
    id: `${split}-${index}`,
    name: `${given} ${surname}`,
    nric: nric(prefix, digits),
    dob: `${String((index % 27) + 1).padStart(2, '0')}/${String((index % 12) + 1).padStart(2, '0')}/199${index % 10}`,
    phone: `+65 8${String(1000000 + index).slice(0, 7)}`,
    email: `${given.toLowerCase()}.${surname.toLowerCase()}${index}@example.com`,
    address: `${num} ${spec.street} ${postal}`,
    otherName: `Pat ${surname}`,
    otherDob: '01/01/1980'
  };
}

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
  if (mode === 'missing_email') return applicant.filter((line) => !line.startsWith('Email:')).join('\n');
  const patient = ['Patient', `Full name: ${p.otherName}`, `Date of birth: ${p.otherDob}`];
  if (mode === 'patient_other') return [...patient, ...applicant].join('\n');
  if (mode === 'same_person') {
    return [
      'The patient is the applicant.',
      'Patient',
      `Full name: ${p.name}`,
      `Date of birth: ${p.dob}`,
      ...applicant
    ].join('\n');
  }
  return [
    'Applicant',
    `Full name: ${p.name}`,
    `Full name: ${p.otherName}`,
    `NRIC: ${p.nric}`,
    `Date of birth: ${p.dob}`,
    `Phone: ${p.phone}`,
    `Email: ${p.email}`,
    `Address: ${p.address}`
  ].join('\n');
}

function goldFields(spec, mode, p) {
  const sharedDob = p.dob;
  const nameAnswerable = mode !== 'conflict';
  const emailAnswerable = mode !== 'missing_email';
  const rows = [
    ['name', spec.labels.name, 'name', nameAnswerable, nameAnswerable ? p.name : ''],
    ['nric', spec.labels.nric, 'nric', true, p.nric],
    ['dob', spec.labels.dob, 'dob', true, sharedDob],
    ['phone', spec.labels.phone, 'phone', true, p.phone],
    ['email', spec.labels.email, 'email', emailAnswerable, emailAnswerable ? p.email : ''],
    ['address', spec.labels.address, 'address', true, p.address],
    ['mailbox', spec.labels.mailbox, 'mailbox', false, '']
  ];
  return rows.map(([id, label, kind, answerable, gold], index) => ({
    id, label, kind, answerable, gold,
    role: 'applicant',
    rect: [180, 760 - index * 36, 250, 18],
    page: 0
  }));
}

async function drawForm(spec, fields, widgets) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(`${spec.template} (synthetic)`, { x: 40, y: 800, size: 14, font, color: rgb(0.1, 0.1, 0.1) });
  const form = widgets ? doc.getForm() : null;
  fields.forEach((field) => {
    const [x, y, w, h] = field.rect;
    page.drawText(field.label, { x: 40, y: y + 4, size: 11, font });
    if (form) {
      const box = form.createTextField(field.label);
      box.addToPage(page, { x, y, width: w, height: h });
    } else {
      page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: 0.6, color: rgb(0.2, 0.2, 0.2) });
    }
  });
  return doc.save();
}

async function drawReference(text) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let y = 780;
  text.split('\n').forEach((line) => {
    page.drawText(line, { x: 48, y, size: 12, font });
    y -= 18;
  });
  return doc.save();
}

function counts(split) {
  if (split === 'development') return 8;
  if (split === 'calibration') return 36;
  return 16;
}

async function main() {
  await rm(fixtures, { recursive: true, force: true });
  await mkdir(goldDir, { recursive: true });
  const manifest = { seed: 20261111, splits: {} };
  for (const split of Object.keys(SPLITS)) {
    const spec = SPLITS[split];
    const lines = [];
    const n = counts(split);
    for (let i = 0; i < n; i++) {
      const mode = MODES[i % MODES.length];
      const p = person(split, i);
      const fields = goldFields(spec, mode, p);
      const text = reference(mode, p);
      const id = `${split}-${spec.template}-${String(i).padStart(2, '0')}`;
      const layouts = split === 'test' && i < 8 ? ['native_widget', 'clean_scan', 'noisy_photo'] : ['native_widget'];
      for (const layout of layouts) {
        const caseId = layout === 'native_widget' ? id : `${id}-${layout}`;
        const dir = join(fixtures, split, layout);
        await mkdir(dir, { recursive: true });
        const form = await drawForm(spec, fields, layout === 'native_widget');
        const ref = await drawReference(text);
        await writeFile(join(dir, `${caseId}.pdf`), form);
        await writeFile(join(dir, `${caseId}.reference.pdf`), ref);
        lines.push({
          id: caseId,
          split,
          template_id: spec.template,
          label_family: spec.family,
          layout_family: layout,
          person_id: p.id,
          ambiguity: mode,
          cluster: `${spec.template}:${p.id}`,
          geometry_trusted: layout !== 'noisy_photo',
          reference_text: text,
          other_values: { name: [p.otherName.toLowerCase()], dob: [p.otherDob] },
          fields
        });
      }
    }
    const body = lines.map((row) => JSON.stringify(row)).join('\n') + '\n';
    await writeFile(join(goldDir, `${split}.jsonl`), body);
    manifest.splits[split] = {
      records: lines.length,
      sha256: createHash('sha256').update(body).digest('hex'),
      templates: [spec.template],
      label_family: spec.family,
      people: [...new Set(lines.map((row) => row.person_id))].length
    };
  }
  await writeFile(join(root, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify(manifest, null, 2));
}

main();
