import assert from 'assert';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { extract, identityPhotoSlot } = require('./evidence.js');
const { personOf, sectionKind } = require('./person.js');
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
assert.equal(identityPhotoSlot({ id: 'as_nric', label: 'Name as per NRIC' }), 'name');
assert.equal(identityPhotoSlot({ id: 'fin', label: 'FIN' }), 'nric');

const roles = [
  ['Nominee', 'Nominee'],
  ['Referee', 'Referee'],
  ['Beneficiary', 'Beneficiary'],
  ["Mother's", 'Mother'],
  ["Father's", 'Father'],
  ["Parent's", 'Parent'],
  ['Spouse', 'Spouse'],
  ['Guardian', 'Guardian'],
  ['Contact', 'Contact'],
  ['Emergency', 'Emergency contact'],
  ['Payee', 'Payee'],
  ['Joint account holder', 'Joint account holder'],
  ['Second applicant', 'Second applicant'],
  ['Holder 2', 'Holder 2'],
  ['Witness', 'Witness'],
  ['Next of kin', 'Next of kin'],
  ['Child', 'Child'],
  ['Dependant', 'Dependant'],
  ['Officer', 'Officer'],
  ['Agent', 'Agent'],
  ['Authorised person', 'Authorised person'],
  ['Introducer', 'Introducer']
];
roles.forEach(function (pair) {
  const prefix = pair[0];
  const heading = pair[1];
  assert.equal(identityPhotoSlot({ id: 'p', label: prefix + ' full name' }), '', prefix + ' label');
  assert.equal(identityPhotoSlot({ id: 'p', label: prefix + ' NRIC' }), '', prefix + ' id label');
  assert.equal(identityPhotoSlot({ id: 'h', label: 'Full name', group: heading }), '', heading + ' heading');
  assert.equal(identityPhotoSlot({ id: 'h', label: 'NRIC', group: heading }), '', heading + ' id heading');
  assert.equal(identityPhotoSlot({ id: 's', label: 'Name', section: heading }), '', heading + ' section');
});

const people = [
  { id: 'a_name', label: 'Full name', group: "Applicant's particulars" },
  { id: 'a_nric', label: 'NRIC/Passport/FIN No.', group: "Applicant's particulars" },
  { id: 'n_name', label: 'Full name', group: 'Nominee' },
  { id: 'n_nric', label: 'NRIC', group: 'Nominee' },
  { id: 'r_name', label: 'Referee full name' },
  { id: 'r_nric', label: 'Referee NRIC' }
];
const offered = people.filter(function (field) { return identityPhotoSlot(field, people); }).map(function (field) { return field.id; });
assert.deepEqual(offered, ['a_name', 'a_nric']);

const repeatedNames = [
  { id: 'n1', label: 'Full name' },
  { id: 'n2', label: 'Name' },
  { id: 'i1', label: 'NRIC' },
  { id: 'i2', label: 'FIN' }
];
repeatedNames.forEach(function (field) {
  assert.equal(identityPhotoSlot(field, repeatedNames), '', field.id);
});

const otherSections = [
  'Guarantor',
  'Nominee',
  'Beneficiary',
  'Next of kin',
  'Emergency contact',
  'Spouse',
  'Witness',
  'Referee',
  'Authorised signatory',
  'Joint applicant',
  'Particulars of Guarantor',
  "Guarantor's particulars",
  'Section B: Joint applicant',
  'Co-borrower',
  'Proxy',
  'Insured person',
  'Employer',
  'Landlord',
  'Tenant',
  'Owner 2',
  'Guardian',
  'Trustee',
  'Partner',
  'Director 2',
  'Signatory 2'
];
otherSections.forEach(function (heading) {
  const only = [
    { id: 'n', label: 'Name', section: heading },
    { id: 'i', label: 'NRIC', section: heading }
  ];
  only.forEach(function (field) {
    assert.equal(identityPhotoSlot(field, only), '', heading + ' only ' + field.label);
  });
  const mixed = [
    { id: 'a_name', label: 'Full name', group: "Applicant's particulars" },
    { id: 'a_as', label: 'Name as per NRIC', group: "Applicant's particulars" },
    { id: 'a_nric', label: 'NRIC/FIN/passport no.', group: "Applicant's particulars" },
    { id: 'o_name', label: 'Name', section: heading },
    { id: 'o_nric', label: 'NRIC', section: heading }
  ];
  const offeredIds = mixed.filter(function (field) { return identityPhotoSlot(field, mixed); }).map(function (field) { return field.id; });
  assert.deepEqual(offeredIds, ['a_name', 'a_as', 'a_nric'], heading + ' mixed');
});

const ordinary = [
  { id: 'full', label: 'Full name' },
  { id: 'idline', label: 'NRIC/FIN/passport no.' }
];
assert.deepEqual(
  ordinary.filter(function (field) { return identityPhotoSlot(field, ordinary); }).map(function (field) { return field.id; }),
  ['full', 'idline']
);
['Applicant\'s particulars', 'Part A', 'Personal details', 'Membership application'].forEach(function (heading) {
  const lines = [
    { id: 'full', label: 'Full name', section: heading },
    { id: 'as', label: 'Name as per NRIC', section: heading },
    { id: 'idline', label: 'NRIC/FIN/passport no.', section: heading }
  ];
  assert.deepEqual(
    lines.filter(function (field) { return identityPhotoSlot(field, lines); }).map(function (field) { return field.id; }),
    ['full', 'as', 'idline'],
    heading
  );
});
const stillRepeated = [
  { id: 'n1', label: 'Full name' },
  { id: 'n2', label: 'Name as per NRIC' }
];
stillRepeated.forEach(function (field) {
  assert.equal(identityPhotoSlot(field, stillRepeated), '', 'unnamed repeated names still abstain');
});
['Declaration', 'Declaration by applicant', 'Declaration by the applicant', 'For bank use', 'For official use', 'Office use', 'Part B', 'Part C', 'Part D', 'Acknowledgement', 'Authorisation', 'Terms and conditions'].forEach(function (heading) {
  assert.equal(sectionKind(heading), 'reset', heading);
  assert.notEqual(personOf(heading), 'applicant', heading);
  const only = [{ id: 'n', label: 'Name', section: heading }, { id: 'i', label: 'NRIC', section: heading }];
  only.forEach(function (field) {
    assert.equal(identityPhotoSlot(field, only), '', heading + ' ' + field.label);
  });
});
['Owner', "Owner's particulars"].forEach(function (heading) {
  const only = [{ id: 'n', label: 'Name', section: heading }];
  assert.equal(identityPhotoSlot(only[0], only), '', heading);
});
assert.equal(personOf('Sum insured'), '');
assert.equal(identityPhotoSlot({ id: 'n', label: 'Name', section: 'Sum insured' }, [{ id: 'n', label: 'Name', section: 'Sum insured' }]), 'name');

console.log('evidence tests ok');
