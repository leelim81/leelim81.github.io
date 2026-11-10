import assert from 'assert';
import { createRequire } from 'module';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const { decideAll } = require('./select.js');
const { unsafeDestination, markRegions, identityPhotoSlot, fittedSize, fieldKind, keepAgreedName } = require('./evidence.js');
const { extendsName } = require('./facts.js');
const { annotations, layout } = require('./spots.js');

const packet = `Applicant
Full name: NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL
NRIC: S1234567D
Date of birth: 15/01/1990
`;
const open = { autofill: { name: true, nric: true, dob: true, phone: true, email: true, address: true, given: true, surname: true } };

function row(fields, id) {
  return decideAll(fields, packet, open).find((item) => item.fieldId === id);
}

const otherPeople = [
  ["Father's Name", 'sc-father'],
  ['Mother’s Name', 'sc-mother'],
  ['Name of Introducer', 'sc-introducer'],
  ['Mother’s maiden name', 'ocbc-maiden'],
  ['Name of Doctor', 'pru-doctor'],
  ["Employer's name", 'i9-employer'],
  ['Maiden name', 'dbs-maiden'],
  ['Name of Employer', 'dbs-employer'],
  ['Nominee: Name', 'dbs-nominee'],
  ['Guardian of Nominee : Name', 'dbs-guardian'],
  ['Full Name of authorised person', 'f24-agent']
];
otherPeople.forEach(([label, id]) => {
  const decision = row([{ id, label, type: 'text' }], id);
  assert.equal(decision.decision, 'abstain', label);
  assert.equal(decision.value, '', label);
  assert.equal(decision.reason, 'placement_refused', label);
});

const applicant = row([{ id: 'who', label: 'Name', type: 'text' }], 'who');
assert.equal(applicant.decision, 'review');
assert.equal(applicant.value, 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL');
assert.notEqual(applicant.decision, 'autofill');
const asPer = row([{ id: 'bank', label: 'Name as per bank account', type: 'text' }], 'bank');
assert.equal(asPer.decision, 'review');
assert.equal(asPer.value, 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL');
assert.equal(identityPhotoSlot({ id: 'bank', label: 'Name as per bank account', type: 'text' }, [{ id: 'bank', label: 'Name as per bank account', type: 'text' }]), 'name');

const regions = [
  { id: 'signatory', label: 'Name of Signatory' },
  { id: 'verified', label: 'Signature Verified By' },
  { id: 'approved', label: 'Approved By' },
  { id: 'both', label: 'Signature & Name' },
  { id: 'block', label: 'Name', section: 'For bank use only' },
  { id: 'official', label: 'Name', section: 'For official use' },
  { id: 'percent', label: 'Percentage', group: 'Nominee' }
];
regions.forEach((field) => {
  const decision = row([Object.assign({ type: 'text' }, field)], field.id);
  assert.equal(decision.value, '', field.label + ' ' + (field.section || field.group || ''));
  assert.equal(decision.reason, 'placement_refused', field.id);
});

const f24 = [
  { id: 'taxpayer', label: 'Name', type: 'text', page: 0, rect: { x: 181, y: 114, width: 380, height: 25 } },
  { id: 'signed', label: "Taxpayers' Signature", type: 'text', page: 0, rect: { x: 333, y: 64, width: 230, height: 39 } }
];
assert.equal(row(f24, 'taxpayer').value, '');
assert.equal(row(f24, 'taxpayer').refusal, 'signature');
assert.equal(identityPhotoSlot(f24[0], f24), '');
const kept = row([{ id: 'top', label: 'Name (as in NRIC/Passport*)', type: 'text' }], 'top');
assert.equal(kept.decision, 'review');
assert.equal(kept.value, 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL');

const splits = [
  { id: 'first', label: 'First name' },
  { id: 'given', label: 'First/Given Name' },
  { id: 'last', label: 'Last name' },
  { id: 'sur', label: 'Last Name/Surname' },
  { id: 'middle', label: 'Middle name' },
  { id: 'previous', label: 'Previous last name' },
  { id: 'initial', label: 'First name and middle initial' }
];
decideAll(splits.map((field) => Object.assign({ type: 'text' }, field)), packet, open).forEach((decision) => {
  assert.equal(decision.value, '', decision.fieldId);
});
const explicit = `Applicant
First name: Alex
Last name: Example
Full name: Alex Example
`;
const splitFields = [
  { id: 'first', label: 'First name', type: 'text' },
  { id: 'last', label: 'Last name', type: 'text' },
  { id: 'full', label: 'Full name', type: 'text' },
  { id: 'previous', label: 'Previous last name', type: 'text' }
];
const splitRows = Object.fromEntries(decideAll(splitFields, explicit, open).map((item) => [item.fieldId, item]));
assert.equal(splitRows.first.value, 'Alex');
assert.equal(splitRows.first.decision, 'review');
assert.equal(splitRows.last.value, 'Example');
assert.equal(splitRows.full.value, 'Alex Example');
assert.equal(splitRows.previous.value, '');
assert.equal(fieldKind({ label: 'Name in English (Surname first)' }), 'name');
assert.equal(identityPhotoSlot({ id: 'english', label: 'Name in English (Surname first)', type: 'text' }, [{ id: 'english', label: 'Name in English (Surname first)', type: 'text' }]), 'name');

[
  'Name as in NRIC',
  'Name (as in NRIC)',
  'Name as per NRIC/Passport',
  'Name (as per NRIC/Passport)',
  'Full name as in NRIC/FIN/Passport',
  'Full name (as in NRIC/FIN/Passport)'
].forEach((label) => {
  assert.equal(fieldKind({ label: label, type: 'text' }), 'name', label);
  const decision = row([{ id: 'doc-name', label: label, type: 'text' }], 'doc-name');
  assert.equal(decision.value, 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL', label);
  assert.notEqual(decision.value, 'S1234567D', label);
});
assert.equal(fieldKind({ label: 'Existing NRIC/Passport No', type: 'text' }), 'nric');
assert.equal(fieldKind({ label: 'Name as per Debiting Account', type: 'text' }), 'other');
[
  'Applicant Name as in NRIC',
  "Customer's full name as per NRIC/Passport",
  'Customer name as per FIN'
].forEach((label) => {
  assert.equal(fieldKind({ label: label, type: 'text' }), 'name', label);
  const decision = row([{ id: 'who', label: label, type: 'text' }], 'who');
  assert.equal(decision.value, 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL', label);
  assert.equal(identityPhotoSlot({ id: 'who', label: label, type: 'text' }, [{ id: 'who', label: label, type: 'text' }]), 'name', label);
});
['Name as in NRIC', 'Name as per NRIC', 'Name as per NRIC/Passport'].forEach((label) => {
  assert.equal(identityPhotoSlot({ id: 'slot', label: label, type: 'text' }, [{ id: 'slot', label: label, type: 'text' }]), 'name', label);
});

['Name / NRIC', 'Name & NRIC No.', 'Name/NRIC'].forEach((label) => {
  assert.notEqual(fieldKind({ label: label, type: 'text' }), 'nric', label);
  const decision = row([{ id: 'both', label: label, type: 'text' }], 'both');
  assert.equal(decision.value, '', label);
});
const splitId = [
  { id: 'both', label: 'Name / NRIC', type: 'text' },
  { id: 'who', label: 'Name', type: 'text' },
  { id: 'id', label: 'NRIC', type: 'text' }
];
const splitIdRows = Object.fromEntries(decideAll(splitId, packet, open).map((item) => [item.fieldId, item]));
assert.equal(splitIdRows.both.value, '');
assert.equal(splitIdRows.who.value, 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL');
assert.equal(splitIdRows.id.value, 'S1234567D');

[
  'Trading name',
  'Firm name',
  'Corporate name',
  'Brand name',
  'Merchant name',
  'Name of Firm',
  'Name of the Merchant'
].forEach((label) => {
  assert.equal(fieldKind({ label: label, type: 'text' }), 'other', label);
  const decision = row([{ id: 'trade', label: label, type: 'text' }], 'trade');
  assert.equal(decision.value, '', label);
  assert.equal(decision.reason, 'placement_refused', label);
});

const agreed = { decision: 'review', kind: 'name', value: 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL' };
assert.equal(keepAgreedName(agreed, { label: 'Preferred name', type: 'text' }, 'NURUL AISHAH BINTE'), true);
assert.equal(keepAgreedName(agreed, { label: 'Preferred name', type: 'text' }, 'LEE MING WEI'), false);
assert.equal(keepAgreedName({ decision: 'review', kind: 'nric', value: 'S1234567D' }, { label: 'NRIC', type: 'text' }, 'NURUL AISHAH BINTE'), false);
assert.equal(keepAgreedName(agreed, { label: "Father's Name", type: 'text' }, agreed.value), false);
assert.equal(keepAgreedName(agreed, { label: 'Name / NRIC', type: 'text' }, agreed.value), false);

const nameOrId = [
  ['Name as in NRIC', 'name'],
  ['Name (as in NRIC)', 'name'],
  ['Name as per NRIC', 'name'],
  ['Name as per NRIC/Passport', 'name'],
  ['Name (as per NRIC/Passport)', 'name'],
  ['Full name as in NRIC/FIN/Passport', 'name'],
  ['Full name (as in NRIC/FIN/Passport)', 'name'],
  ['Applicant Name as in NRIC', 'name'],
  ["Customer's full name as per NRIC/Passport", 'name'],
  ['Customer name as per FIN', 'name'],
  ['Name as appearing in NRIC', 'name'],
  ['Name as shown in NRIC', 'name'],
  ['Name as in identification card', 'name'],
  ['Name as shown in passport', 'name'],
  ['Name as appearing in identification card', 'name'],
  ['Name in NRIC', 'name'],
  ['Name in FIN', 'name'],
  ['Name in passport', 'name'],
  ['Nama as in NRIC', 'name'],
  ['姓名 as per FIN', 'name'],
  ['Name as shown on NRIC', 'name'],
  ['Name as stated in passport', 'name'],
  ['Nama seperti dalam NRIC', 'name'],
  ['Nama mengikut NRIC', 'name'],
  ["Holder's name", 'name'],
  ["NRIC holder's name", 'name'],
  ["IC holder's name", 'name'],
  ['Surname as in NRIC', 'split'],
  ['First name as in NRIC', 'split'],
  ['Last name as in NRIC', 'split'],
  ['First/Last name as in NRIC', 'split'],
  ['Given name as in NRIC', 'split'],
  ['Family name as in passport', 'split'],
  ['Middle name as in NRIC', 'split'],
  ['Maiden name as in NRIC', 'split'],
  ['Previous name as in NRIC', 'split'],
  ['Alias name as in NRIC', 'split'],
  ['Surname', 'split'],
  ['NRIC Name', 'name'],
  ['IC name', 'name'],
  ['NRIC Nama', 'name'],
  ['IC Nama', 'name'],
  ['Name and NRIC', 'blank'],
  ['Name / NRIC', 'blank'],
  ['Name & NRIC No.', 'blank'],
  ['Name/NRIC', 'blank'],
  ['Name & NRIC', 'blank'],
  ['Nama and NRIC', 'blank'],
  ['Name and IC No.', 'blank'],
  ['Name / Passport No.', 'blank'],
  ['Full name & ID number', 'blank'],
  ['Name and FIN', 'blank'],
  ['姓名 and NRIC No.', 'blank'],
  ['Name', 'name'],
  ['Full name', 'name'],
  ['Applicant name', 'name'],
  ['Name in English (Surname first)', 'name'],
  ['Preferred name', 'name'],
  ['Customer name', 'name'],
  ['NRIC No.', 'nric'],
  ['NRIC/FIN', 'nric'],
  ['NRIC/Passport No.', 'nric'],
  ['Identity card number', 'nric'],
  ['Existing NRIC/Passport No', 'nric'],
  ['FIN', 'nric'],
  ['NRIC', 'nric']
];
assert.ok(nameOrId.length >= 40, 'label table has ' + nameOrId.length);
const tableFields = nameOrId.map((item, index) => ({ id: 'lab-' + index, label: item[0], type: 'text' }));
const tableRows = Object.fromEntries(decideAll(tableFields, packet, open).map((item) => [item.fieldId, item]));
nameOrId.forEach((item, index) => {
  const label = item[0];
  const expect = item[1];
  const kind = fieldKind({ label: label, type: 'text' });
  const decision = tableRows['lab-' + index];
  if (hasName(label)) assert.notEqual(kind, 'nric', label);
  if (expect === 'name') {
    assert.equal(kind, 'name', label);
    assert.equal(decision.value, 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL', label);
    assert.notEqual(decision.value, 'S1234567D', label);
  } else if (expect === 'split') {
    assert.notEqual(kind, 'nric', label);
    assert.notEqual(kind, 'name', label);
    assert.equal(decision.value, '', label);
    const alone = [{ id: 's', label: label, type: 'text' }];
    assert.equal(identityPhotoSlot(alone[0], alone), '', label);
  } else if (expect === 'nric') {
    assert.equal(kind, 'nric', label);
    assert.equal(decision.value, 'S1234567D', label);
  } else {
    assert.notEqual(kind, 'nric', label);
    assert.equal(decision.value, '', label);
  }
});
function hasName(label) {
  return /name|nama|姓名|surname/i.test(label);
}
[
  'Name as shown on NRIC',
  'Name as stated in passport',
  'Nama seperti dalam NRIC',
  'Nama mengikut NRIC',
  "Holder's name",
  "NRIC holder's name"
].forEach((label) => {
  const alone = [{ id: 's', label: label, type: 'text' }];
  assert.equal(identityPhotoSlot(alone[0], alone), 'name', label);
});

[
  'Name of Company',
  'Company name',
  'Employer name',
  'Business name',
  'Organisation name',
  'Organization name'
].forEach((label) => {
  assert.equal(fieldKind({ label: label, type: 'text' }), 'other', label);
  const decision = row([{ id: 'org', label: label, type: 'text' }], 'org');
  assert.equal(decision.decision, 'abstain', label);
  assert.equal(decision.value, '', label);
  assert.equal(decision.reason, 'placement_refused', label);
});

const nricBox = row([{ id: 'nric-box', label: 'NRIC', type: 'checkbox' }], 'nric-box');
assert.equal(nricBox.value, '');
assert.equal(nricBox.reason, 'placement_refused');
const nricLine = row([{ id: 'nric', label: 'Existing NRIC/Passport No', type: 'text' }], 'nric');
assert.equal(nricLine.decision, 'review');
assert.equal(nricLine.value, 'S1234567D');

assert.equal(extendsName('NURUL AISHAH BINTE', 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL'), true);
assert.equal(extendsName('NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL', 'NURUL AISHAH BINTE'), false);
assert.equal(extendsName('NURUL AISHAH', 'LEE MING WEI'), false);
assert.equal(extendsName('NURUL AISHAH', 'NURUL AISHAH FATHER'), false);

const dob = row([{ id: 'dob', label: 'Date of birth', type: 'text', lineH: 12, rect: { x: 40, y: 700, width: 36.8, height: 14 } }], 'dob');
assert.equal(dob.value, '15/01/1990');
assert.ok(dob.fontSize < 10.2, 'dob font ' + dob.fontSize);
assert.equal(dob.reason, 'explicit_single_source');
const fitted = fittedSize('15/01/1990', 36.8, 10.2);
assert.equal(fitted.fits, true);
assert.ok(fitted.size < 10.2);
const tooLong = decideAll(
  [{ id: 'long', label: 'Full name', type: 'text', lineH: 12, rect: { x: 40, y: 700, width: 36.8, height: 14 } }],
  packet,
  open
)[0];
assert.equal(tooLong.decision, 'review');
assert.equal(tooLong.checked, false);
assert.equal(tooLong.reason, 'does_not_fit');
assert.match(tooLong.note, /Left unticked/);

const tight = annotations(
  [{ id: 'dob', label: 'Date of birth', type: 'text', source: 'flat', page: 0, pageWidth: 595, pageHeight: 842, lineH: 12, rect: { x: 40, y: 700, width: 36.8, height: 14 } }],
  { dob: '15/01/1990' }
);
assert.equal(tight.unplaced.length, 0);
assert.ok(tight[0][0].fontSize < 10.2);
const refusedDraw = annotations(
  [{ id: 'father', label: "Father's Name", type: 'text', source: 'flat', page: 0, pageWidth: 595, pageHeight: 842, rect: { x: 40, y: 600, width: 180, height: 14 } }],
  { father: 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL' }
);
assert.equal(refusedDraw[0], undefined);
assert.equal(refusedDraw.unplaced[0].reason, 'other-person');
const noBox = annotations(
  [{ id: 'nric', label: 'NRIC', type: 'text', source: 'flat', page: 0 }],
  { nric: 'S1234567D' }
);
assert.equal(noBox.unplaced[0].reason, 'no box');

const huge = annotations(
  [{ id: 'dob', label: 'Date of birth', type: 'text', source: 'flat', page: 0, pageWidth: 595, pageHeight: 842, lineH: 12, rect: { x: 40, y: 700, width: 36.8, height: 14 } }],
  { dob: 'FIFTEENTH OF JANUARY NINETEEN NINETY' }
);
assert.equal(huge[0], undefined);
assert.equal(huge.unplaced[0].reason, 'does not fit');

const bankUseScan = layout({
  page: 0,
  width: 595,
  height: 842,
  texts: [
    { x: 200, y: 180, w: 90, h: 10, str: 'Approved By' },
    { x: 200, y: 140, w: 36, h: 10, str: 'Name' }
  ],
  lines: [{ x: 250, y: 138, w: 120 }],
  squares: []
});
assert.equal(bankUseScan[0].section, 'Approved By');
assert.equal(decideAll(bankUseScan, packet, open)[0].value, '');
assert.equal(decideAll(bankUseScan, packet, open)[0].refusal, 'signature');

markRegions(f24);
assert.equal(unsafeDestination(f24[0]), 'signature');
assert.equal(unsafeDestination({ label: 'Name', section: 'For official use' }), 'bank-use');
assert.equal(unsafeDestination({ label: "Father's Name" }), 'other-person');

const { PDFDocument } = require('./vendor/pdf/pdf-lib.min.js');
require('./vendor/pdf/pdf.min.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf/pdf.worker.min.js', import.meta.url).pathname;
const made = await PDFDocument.create();
const page = made.addPage([595, 842]);
const form = made.getForm();
const widget = form.createTextField('Existing NRICPassport No');
widget.addToPage(page, { x: 134, y: 634, width: 191.4, height: 12.6 });
widget.setMaxLength(15);
widget.enableCombing();
const blank = await made.save();
global.PDFLib = { PDFDocument, StandardFonts: require('./vendor/pdf/pdf-lib.min.js').StandardFonts };
const { fill } = require('./fields.js');
const filled = await fill(blank, [{
  id: 'Existing NRICPassport No',
  label: 'Existing NRIC/Passport No',
  type: 'text',
  source: 'acro',
  rect: { x: 134, y: 634, width: 191.4, height: 12.6 }
}], { 'Existing NRICPassport No': 'S1234567D' }, { flatten: true });
const read = await pdfjsLib.getDocument({ data: filled }).promise;
const text = await (await read.getPage(1)).getTextContent();
const written = text.items.map((item) => item.str).join(' ');
assert.match(written, /S\s*1\s*2\s*3\s*4\s*5\s*6\s*7\s*D/);
const missed = await fill(blank, [{
  id: 'missing',
  label: 'NRIC',
  type: 'text',
  source: 'acro'
}], { missing: 'S1234567D' }, { flatten: true });
assert.equal(missed.unplaced[0].reason, 'no matching field');
assert.equal(readFileSync(new URL('./../../research/forms-filler/fixtures/public-form-urls.json', import.meta.url), 'utf8').includes('https://www.sc.com/'), true);
