import assert from 'assert';
import { createRequire } from 'module';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const { decideAll } = require('./select.js');
const { unsafeDestination, markRegions, identityPhotoSlot, fittedSize, fitInBox, allowsValue, fieldKind, keepAgreedName, chineseScript } = require('./evidence.js');
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
const qcr = [
  { id: 'name', label: 'Name', type: 'text', page: 0, rect: { x: 138, y: 304, width: 395, height: 11 } },
  { id: 'sign', label: 'Signature', type: 'text', page: 0, rect: { x: 252, y: 226, width: 139, height: 40 } }
];
assert.equal(row(qcr, 'name').value, 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL');
assert.notEqual(row(qcr, 'name').refusal, 'signature');
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

const tickFields = [
  { id: 'name', label: 'Name', type: 'text' },
  { id: 'id', label: 'NRIC', type: 'text' },
  { id: 'pref', label: 'Preferred name', type: 'text' },
  { id: 'father', label: "Father's Name", type: 'text' }
];
const tickRows = Object.fromEntries(decideAll(tickFields, packet, open).map((item) => [item.fieldId, item]));
assert.equal(tickRows.name.checked, true);
assert.equal(tickRows.name.value, 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL');
assert.equal(tickRows.id.checked, true);
assert.equal(tickRows.id.value, 'S1234567D');
assert.notEqual(tickRows.pref.checked, true);
assert.equal(tickRows.father.value, '');

const address = '10 EXAMPLE ROAD SINGAPORE 123456 BLOCK 123 UNIT 04-12';
const overflow = fitInBox(address, 90, 12, 10);
assert.equal(overflow.fits, false);
const inside = fitInBox('10 EXAMPLE ROAD', 160, 16, 10);
assert.equal(inside.fits, true);
assert.ok(inside.lines === 1 || inside.size * 1.3 * inside.lines <= 16);
const tightAddress = annotations(
  [{ id: 'addr', label: 'Address', type: 'text', source: 'flat', page: 0, pageWidth: 595, pageHeight: 842, lineH: 12, rect: { x: 40, y: 400, width: 90, height: 12 } }],
  { addr: address }
);
assert.equal(tightAddress.unplaced[0].reason, 'does not fit');
assert.equal(tightAddress[0], undefined);

assert.equal(allowsValue({ label: 'Postal Code', type: 'text', comb: true }, 'B R I E N - S'), false);
assert.equal(allowsValue({ label: 'Postal Code', type: 'text', comb: true }, '123456'), true);
assert.equal(allowsValue({ label: 'Code', type: 'text', comb: true }, 'BRIEN'), false);

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
  ['Name as printed on NRIC', 'name'],
  ['Name of NRIC holder', 'name'],
  ['Name as stated in passport', 'name'],
  ['Nama seperti dalam NRIC', 'name'],
  ['Nama mengikut NRIC', 'name'],
  ["Holder's name", 'name'],
  ["NRIC holder's name", 'name'],
  ["IC holder's name", 'name'],
  ['Surname as in NRIC', 'split'],
  ['Surname as per NRIC', 'split'],
  ['First name as per NRIC', 'split'],
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
  ['Username as in NRIC', 'blank'],
  ['Nickname as in NRIC', 'blank'],
  ['Name', 'name'],
  ['Full name', 'name'],
  ['Applicant name', 'name'],
  ['Name in English (Surname first)', 'name'],
  ['Preferred name', 'blank'],
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
    assert.notEqual(kind, 'name', label);
    assert.equal(decision.value, '', label);
  }
});
function hasName(label) {
  return /name|nama|姓名|surname/i.test(label);
}
[
  'Name as shown on NRIC',
  'Name as printed on NRIC',
  'Name of NRIC holder',
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
  'Organization name',
  'Bank name',
  "Bank's name",
  'Bank’s name',
  'Name of bank',
  'Name of the bank',
  'Branch name',
  "Branch's name",
  'Branch’s name',
  'Name of branch',
  "Agency's name",
  'Agency’s name',
  'agencys name',
  "Employer's name",
  'Employer’s name',
  'Institution name',
  'Name of agency'
].forEach((label) => {
  assert.equal(fieldKind({ label: label, type: 'text' }), 'other', label);
  const decision = row([{ id: 'org', label: label, type: 'text' }], 'org');
  assert.equal(decision.decision, 'abstain', label);
  assert.equal(decision.value, '', label);
  assert.notEqual(decision.value, 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL', label);
  assert.equal(decision.reason, 'placement_refused', label);
  const alone = [{ id: 's', label: label, type: 'text' }];
  assert.equal(identityPhotoSlot(alone[0], alone), '', label);
});
[
  ['Name', 'offered'],
  ['Full name', 'offered'],
  ['Applicant name', 'offered'],
  ["Applicant's name", 'offered'],
  ["Applicant's full name", 'offered'],
  ['Customer name', 'offered'],
  ["Customer's name", 'offered'],
  ['Name of customer', 'offered'],
  ['Member name', 'offered'],
  ['Name of member', 'offered'],
  ['Claimant name', 'offered'],
  ['Policyholder name', 'offered'],
  ['Name of policy holder', 'offered'],
  ['Name of account applicant', 'offered'],
  ['Name:', 'offered'],
  ['NAME:', 'offered'],
  ['Name: _____', 'offered'],
  ['Name.', 'offered'],
  ['Name*', 'offered'],
  ['1. Name', 'offered'],
  ['(a) Name', 'offered'],
  ['Name / 姓名', 'offered'],
  ['Name/姓名', 'offered'],
  ['Nama / Name', 'offered'],
  ['Name / Nama', 'offered'],
  ['Name in full', 'offered'],
  ['Name in BLOCK LETTERS', 'offered'],
  ['Name in capitals', 'offered'],
  ['Name in Capital Letters', 'offered'],
  ['English full name', 'offered'],
  ['Nama seperti di dalam MyKad', 'offered'],
  ['Name as appearing on PAN card', 'offered'],
  ['Name (Mr/Mrs/Ms)', 'offered'],
  ['Your name', 'offered'],
  ['Your full name', 'offered'],
  ['Print name', 'offered'],
  ['Printed Name', 'offered'],
  ['Please print your name', 'offered'],
  ['Legal name', 'offered'],
  ['Full Legal Name', 'offered'],
  ['Official name', 'offered'],
  ['Full Name in English', 'offered'],
  ['English Name', 'offered'],
  ['英文姓名', 'offered'],
  ['Name in Bahasa Malaysia', 'offered'],
  ['Proposer name', 'offered'],
  ['Name of proposer', 'offered'],
  ['Nama Pemohon', 'offered'],
  ['Nama Pencadang', 'offered'],
  ['Nama Pemegang Polisi', 'offered'],
  ['Nama Pekerja', 'offered'],
  ['Nama Pelanggan', 'offered'],
  ['Employee name', 'offered'],
  ['Name of employee', 'offered'],
  ['Cardholder name', 'offered'],
  ['Client name', 'offered'],
  ['Subscriber name', 'offered'],
  ['Taxpayer name', 'offered'],
  ['Principal name', 'offered'],
  ['Name of Main Applicant', 'offered'],
  ['Primary applicant name', 'offered'],
  ['Name as shown on HKID', 'offered'],
  ['Name as appearing in MyKad', 'offered'],
  ['Name as per PAN', 'offered'],
  ['Name as per Aadhaar', 'offered'],
  ['Name as per IC', 'offered'],
  ['Name as per Work Pass', 'offered'],
  ['Name as per driving licence', 'offered'],
  ['Name as per driving license', 'offered'],
  ['Name in English (Surname first)', 'offered'],
  ['Name as per Example Bank Account (Underline surname)', 'offered'],
  ['Preferred name', 'hidden'],
  ['Block name', 'hidden'],
  ['School name', 'hidden'],
  ['Condo name', 'hidden'],
  ['Project name', 'hidden'],
  ['Registered name', 'hidden'],
  ['Display name', 'hidden'],
  ['Nickname', 'hidden']
].forEach((item) => {
  const label = item[0];
  const decision = row([{ id: 'who', label: label, type: 'text' }], 'who');
  const alone = [{ id: 's', label: label, type: 'text' }];
  if (item[1] === 'offered') {
    assert.equal(decision.value, 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL', label);
    assert.equal(identityPhotoSlot(alone[0], alone), 'name', label);
  } else {
    assert.equal(decision.value, '', label);
    assert.notEqual(decision.checked, true, label);
    assert.equal(identityPhotoSlot(alone[0], alone), '', label);
  }
});
const bankAccount = row([{ id: 'bank', label: 'Name as per Example Bank Account (Underline surname)', type: 'text' }], 'bank');
assert.equal(bankAccount.value, 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL');
assert.equal(fieldKind({ label: 'Name as per Example Bank Account (Underline surname)', type: 'text' }), 'name');
[
  ['Name of bank account', 'account-holder'],
  ['Account name', 'account-holder'],
  ['Account holder name', 'account-holder'],
  ['Name of account holder', 'account-holder'],
  ['Building name', 'address-part'],
  ['Estate name', 'address-part'],
  ['Display name', 'not-offered'],
  ['Nickname', 'not-offered'],
  ['Name of insured', 'other-person'],
  ["Insured's name", 'other-person'],
  ['Insured name', 'other-person'],
  ["Assured's name", 'other-person'],
  ['Name of Life Assured', 'other-person'],
  ['Life Assured Name', 'other-person'],
  ['Name of the Life Insured', 'other-person']
].forEach((item) => {
  const label = item[0];
  const decision = row([{ id: 'held', label: label, type: 'text' }], 'held');
  assert.equal(decision.value, '', label);
  assert.notEqual(decision.checked, true, label);
  assert.equal(decision.reason, 'placement_refused', label);
  assert.equal(decision.refusal, item[1], label);
  assert.notEqual(decision.refusal, 'organisation', label);
  const alone = [{ id: 's', label: label, type: 'text' }];
  assert.equal(identityPhotoSlot(alone[0], alone), '', label);
});
['Chinese Name', '中文姓名', 'Name (Chinese)', 'Chinese full name'].forEach((label) => {
  const decision = row([{ id: 'cn', label: label, type: 'text' }], 'cn');
  assert.equal(decision.value, '', label);
  assert.notEqual(decision.value, 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL', label);
  assert.equal(decision.reason, 'script_mismatch', label);
  assert.notEqual(fieldKind({ label: label, type: 'text' }), 'name', label);
  assert.equal(fieldKind({ label: label, type: 'text' }), 'chineseName', label);
  const alone = [{ id: 's', label: label, type: 'text' }];
  assert.equal(identityPhotoSlot(alone[0], alone), 'chineseName', label);
});
assert.equal(chineseScript('李明'), true);
assert.equal(chineseScript('Ada Lane'), false);
assert.equal(chineseScript('LEE MING WEI'), false);
assert.equal(row([{ id: 'titles', label: 'Name (Mr/Mrs/Ms)', type: 'text' }], 'titles').value, 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL');
assert.equal(row([{ id: 'slash', label: 'Name / NRIC', type: 'text' }], 'slash').value, '');

const fitRows = [
  { text: '10 EXAMPLE ROAD SINGAPORE 123456 BLOCK 123 UNIT 04-12', width: 90, height: 12, start: 10, fits: false },
  { text: '10 EXAMPLE ROAD', width: 200, height: 36, start: 10, fits: true },
  { text: '15/01/1990', width: 36.8, height: 14, start: 10.2, fits: true }
];
fitRows.forEach((item) => {
  const boxed = fitInBox(item.text, item.width, item.height, item.start);
  assert.equal(boxed.fits, item.fits, item.text);
  if (item.height > 0 && boxed.fits) assert.ok(boxed.lines * boxed.size * 1.3 <= item.height + 0.5, item.text);
});
const wrapped = '10 EXAMPLE ROAD SINGAPORE 123456 BLOCK 123 UNIT 04-12';
assert.equal(fitInBox(wrapped, 80, 40, 10).fits, true);
assert.equal(fittedSize(wrapped, 80, 10).fits, false);

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

const details = packet + 'Address: 10 Example Road\n';
function placed(fields) {
  return Object.fromEntries(decideAll(fields, details, open).map((item) => [item.fieldId, item]));
}
const indiaTexts = [
  { x: 40, y: 520, w: 150, h: 12, str: "Applicant's particulars" },
  { x: 40, y: 420, w: 70, h: 12, str: 'Nominee' }
];
const india = placed([
  { id: 'app', label: 'Name', type: 'text', page: 2, rect: { x: 87, y: 490, width: 180, height: 14 }, texts: indiaTexts },
  { id: 'nom', label: 'Name', type: 'text', page: 2, rect: { x: 87, y: 357, width: 180, height: 14 }, texts: indiaTexts }
]);
assert.equal(india.nom.value, '');
assert.equal(india.nom.refusal, 'other-person');
assert.notEqual(india.nom.checked, true);
assert.equal(india.app.value, 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL');
assert.equal(india.app.checked, true);
assert.equal(india.app.decision, 'review');

const tenancyTexts = [
  { x: 36, y: 560, w: 120, h: 12, str: 'Applicant' },
  { x: 32, y: 510, w: 80, h: 12, str: 'Occupant' }
];
const tenancy = placed([
  { id: 'who', label: 'Name', type: 'text', page: 0, rect: { x: 59, y: 530, width: 180, height: 14 }, texts: tenancyTexts },
  { id: 'occ', label: 'Name', type: 'text', page: 0, rect: { x: 59, y: 468, width: 180, height: 14 }, texts: tenancyTexts }
]);
assert.equal(tenancy.occ.value, '');
assert.equal(tenancy.occ.refusal, 'other-person');
assert.equal(tenancy.who.checked, true);

const preschoolTexts = [
  { x: 40, y: 400, w: 80, h: 12, str: 'Applicant' },
  { x: 40, y: 280, w: 80, h: 12, str: 'Guardian' }
];
const preschool = placed([
  { id: 'home', label: 'Address', type: 'text', page: 0, rect: { x: 48, y: 330, width: 200, height: 14 }, texts: preschoolTexts },
  { id: 'guard', label: 'Address:', type: 'text', page: 0, rect: { x: 48, y: 240, width: 200, height: 14 }, texts: preschoolTexts }
]);
assert.equal(preschool.guard.value, '');
assert.equal(preschool.guard.refusal, 'other-person');
assert.equal(preschool.home.value, '10 Example Road');
assert.equal(preschool.home.decision, 'autofill');

const w4Texts = [
  { x: 36, y: 700, w: 70, h: 11, str: 'Step 1' },
  { x: 36, y: 180, w: 110, h: 12, str: 'Employers Only' }
];
const w4 = placed([
  { id: 'emp', label: 'Address', type: 'text', page: 0, rect: { x: 36, y: 640, width: 220, height: 14 }, texts: w4Texts },
  { id: 'er', label: 'Address', type: 'text', page: 0, rect: { x: 36, y: 140, width: 220, height: 14 }, texts: w4Texts }
]);
assert.equal(w4.er.value, '');
assert.equal(w4.er.refusal, 'other-person');
assert.equal(w4.emp.value, '10 Example Road');
assert.equal(w4.emp.decision, 'autofill');

const twinsTexts = [{ x: 40, y: 600, w: 140, h: 12, str: "Applicant's particulars" }];
const twins = placed([
  { id: 'low', label: 'Name', type: 'text', page: 0, rect: { x: 40, y: 420, width: 180, height: 14 }, texts: twinsTexts },
  { id: 'high', label: 'Name', type: 'text', page: 0, rect: { x: 40, y: 560, width: 180, height: 14 }, texts: twinsTexts }
]);
assert.equal(twins.high.checked, true);
assert.equal(twins.low.value, 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL');
assert.notEqual(twins.low.checked, true);

[
  ['Name (as shown on your income tax return)', 'irs-w9'],
  ['Your name', 'uk-gp'],
  ['Name of Accountholder in English', 'sc-personal-aof'],
  ['Name to appear on Card', 'ocbc-card'],
  ['Employee name', 'uscis-i9']
].forEach((item) => {
  const decision = row([{ id: item[1], label: item[0], type: 'text' }], item[1]);
  assert.equal(decision.value, 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL', item[0]);
  assert.equal(decision.decision, 'review', item[0]);
  assert.equal(identityPhotoSlot({ id: item[1], label: item[0], type: 'text' }, [{ id: item[1], label: item[0], type: 'text' }]), 'name', item[0]);
});
assert.equal(fieldKind({ label: 'Last Name (Family Name)', type: 'text' }), 'surname');
assert.equal(row([{ id: 'i9-last', label: 'Last Name (Family Name)', type: 'text' }], 'i9-last').value, '');
assert.equal(row([{ id: 'holder', label: 'Name of account holder', type: 'text' }], 'holder').value, '');

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
