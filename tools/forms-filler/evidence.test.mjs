import assert from 'assert';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { extract, identityPhotoSlot } = require('./evidence.js');
const { decideAll } = require('./select.js');

const packet = `Patient
Full name: Pat Example
Date of birth: 01/01/1980
Applicant
Full name: Mina Fixture
NRIC: S1234567D
Date of birth: 02/03/1991
Phone: +65 81234567
Email: mina.fixture@example.com
Address: 10 NORTH QUAY 200001`;

const fields = [
  { id: 'name', label: 'Applicant name', type: 'text' },
  { id: 'dob', label: 'Birth date', type: 'text' },
  { id: 'applicantDob', label: 'Applicant birth date', type: 'text' },
  { id: 'mail', label: 'Post mailbox', type: 'text' },
  { id: 'email', label: 'Inbox', type: 'text' }
];
const open = { autofill: { name: true, dob: true, email: true, phone: true, address: true, nric: true } };
const decisions = decideAll(fields, packet, open);
const byId = Object.fromEntries(decisions.map((row) => [row.fieldId, row]));
assert.equal(byId.name.decision, 'autofill');
assert.equal(byId.name.value, 'Mina Fixture');
assert.equal(byId.dob.decision, 'abstain');
assert.equal(byId.dob.reason, 'no_source');
assert.equal(byId.applicantDob.value, '02/03/1991');
assert.equal(byId.mail.decision, 'abstain');
assert.equal(byId.email.decision, 'abstain');
const one = decideAll(
  [{ id: 'email', label: 'Inbox', type: 'text' }],
  'Applicant\nEmail: mina.fixture@example.com\n',
  open
);
assert.equal(one[0].decision, 'autofill');
const ocrHeld = decideAll(
  [{ id: 'name', label: 'Applicant name', type: 'text' }],
  packet,
  { autofill: { name: true }, ocrAutofill: { name: false } },
  { channel: 'ocr' }
);
assert.equal(ocrHeld[0].decision, 'review');
assert.equal(ocrHeld[0].reason, 'type_not_cleared');
assert.equal(ocrHeld[0].value, 'Mina Fixture');
assert.ok(!extract(packet).facts.some((fact) => fact.role === 'applicant' && fact.value === 'Pat Example'));

const conflict = decideAll(
  [{ id: 'name', label: 'Applicant name', type: 'text' }],
  'Applicant\nFull name: Mina Fixture\nFull name: Pat Example\n',
  open
);
assert.equal(conflict[0].decision, 'abstain');
assert.equal(conflict[0].reason, 'conflict');

const noisy = decideAll(
  [{ id: 'name', label: 'Applicant name', type: 'text', untrusted: true }],
  'Applicant\nFull name: Mina Fixture\n',
  open
);
assert.equal(noisy[0].decision, 'review');
assert.notEqual(noisy[0].decision, 'autofill');

const closed = decideAll(fields, packet, { autofill: {} });
assert.ok(closed.every((row) => row.decision !== 'autofill'));

const ulfKim = `Applicant
Full name: Ulf Sample
Email: ulf.sample22@example.com
Applicant
Full name: Kim Voss
Date of birth: 03/03/1977`;
const ulfGraph = extract(ulfKim);
const ulfNames = ulfGraph.facts.filter((fact) => fact.kind === 'name');
assert.equal(ulfNames.length, 2);
assert.ok(ulfNames.every((fact) => fact.role === 'applicant' && fact.quote && fact.start < fact.end));
assert.equal(ulfKim.slice(ulfNames[0].start, ulfNames[0].end), 'Ulf Sample');
assert.equal(decideAll([{ id: 'name', label: 'Applicant name', type: 'text' }], ulfKim, open)[0].reason, 'conflict');

const claimant = decideAll(
  [{ id: 'name', label: 'Claimant name', type: 'text' }],
  'Claimant\nFull name: Ulf Sample\nWitness\nFull name: Kim Voss\n',
  open
);
assert.equal(claimant[0].decision, 'autofill');
assert.equal(claimant[0].value, 'Ulf Sample');

const spouse = extract('Applicant\nFull name: Ulf Sample\nSpouse\nFull name: Kim Voss\nPhone: +65 80000099\n');
assert.equal(spouse.facts.find((fact) => fact.value === 'Kim Voss').role, 'other');
assert.equal(decideAll([{ id: 'phone', label: 'Applicant phone', type: 'text' }], 'Applicant\nFull name: Ulf Sample\nSpouse\nPhone: +65 80000099\n', open)[0].reason, 'no_source');

const unknownKey = extract('Applicant\nFull name: Ulf Sample\nFavorite color: blue\n');
assert.equal(unknownKey.facts.some((fact) => fact.value === 'blue'), false);

const repeated = decideAll(
  [{ id: 'phone', label: 'Applicant phone', type: 'text' }],
  'Applicant\nPhone: +65 80000022\nPhone: +65 80000023\n',
  open
);
assert.equal(repeated[0].reason, 'conflict');
assert.equal(repeated[0].candidates.length, 2);

const bankName = { id: 'holder', label: 'Name as per Example Bank Account (Underline surname)', type: 'text' };
const bare = { id: 'bare', label: 'Name as per', type: 'text' };
const debit = { id: 'debit', label: 'Name as per Debiting Account', type: 'text' };
const idLine = { id: 'idline', label: 'NRIC/Passport/FIN No.', type: 'text' };
const identity = 'Applicant:\nName: Ada Lane\nNRIC: S1234567D\n';
const bankRows = Object.fromEntries(decideAll([bankName, bare, debit, idLine], identity, open).map((row) => [row.fieldId, row]));
assert.equal(bankRows.holder.decision, 'review');
assert.equal(bankRows.holder.reason, 'identity_needs_review');
assert.equal(bankRows.holder.value, 'Ada Lane');
assert.equal(bankRows.idline.decision, 'review');
assert.equal(bankRows.idline.reason, 'identity_needs_review');
assert.equal(bankRows.idline.value, 'S1234567D');
assert.equal(bankRows.bare.decision, 'abstain');
assert.notEqual(bankRows.bare.value, 'Ada Lane');
assert.equal(bankRows.debit.decision, 'abstain');
assert.notEqual(bankRows.debit.value, 'Ada Lane');

assert.equal(identityPhotoSlot({ id: 'full_name', label: 'Full name' }), 'name');
assert.equal(identityPhotoSlot({ id: 'nric', label: 'NRIC' }), 'nric');
assert.equal(identityPhotoSlot({ id: 'applicant', label: "Applicant's full name" }), 'name');
assert.equal(identityPhotoSlot({ id: 'holder', label: 'Name as per Example Bank Account (Underline surname)' }), 'name');
assert.equal(identityPhotoSlot({ id: 'idline', label: 'NRIC/Passport/FIN No.' }), 'nric');
assert.equal(identityPhotoSlot({ id: 'bare', label: 'Name as per' }), '');
assert.equal(identityPhotoSlot({ id: 'debit', label: 'Name as per Debiting Account' }), '');
assert.equal(identityPhotoSlot({ id: 'credited', label: 'Account No. to be Credited' }), '');
assert.equal(identityPhotoSlot({ id: 'amount', label: 'Amount' }), '');
assert.equal(identityPhotoSlot({ id: 'bank', label: 'For Bank Use Only' }), '');
assert.equal(identityPhotoSlot({ id: 'dob', label: 'Date of birth' }), '');
assert.equal(identityPhotoSlot({ id: 'sex', label: 'Sex' }), '');
assert.equal(identityPhotoSlot({ id: 'nation', label: 'Nationality' }), '');
assert.equal(identityPhotoSlot({ id: 'home', label: 'Residential address' }), '');
assert.equal(identityPhotoSlot({ id: 'phone', label: 'Home No.' }), '');
assert.equal(identityPhotoSlot({ id: 'emergency', label: 'Emergency contact name' }), '');
assert.equal(identityPhotoSlot({ id: 'patient', label: 'Patient name' }), '');
assert.equal(identityPhotoSlot({ id: 'spouse', label: 'Spouse name' }), '');
assert.equal(identityPhotoSlot({ id: 'kin', label: 'Next of kin' }), '');

console.log('evidence tests ok');
