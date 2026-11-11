import assert from 'assert';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { extract, identityPhotoSlot, identityCardOffer, addressSlotsBlank, fieldKind } = require('./evidence.js');
const { identityRead, identityVote } = require('./facts.js');
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
assert.equal(byId.name.decision, 'review');
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
assert.equal(claimant[0].decision, 'review');
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
assert.equal(identityPhotoSlot({ id: 'dob', label: 'Date of birth' }), 'dob');
assert.equal(identityPhotoSlot({ id: 'sex', label: 'Sex' }), 'sex');
assert.equal(identityPhotoSlot({ id: 'gender', label: 'Gender' }), 'sex');
assert.equal(identityPhotoSlot({ id: 'nation', label: 'Nationality' }), 'nationality');
assert.equal(identityPhotoSlot({ id: 'home', label: 'Residential address' }), 'address');
assert.equal(identityPhotoSlot({ id: 'postal', label: 'Postal code' }), 'postal');
['Post Code', 'Post code', 'Postcode', 'Post Code 1', 'Zip', 'ZIP', 'Zip 2', 'Zip Code', 'Zip Code 3'].forEach(function (label) {
  assert.equal(identityPhotoSlot({ id: 'pc', label: label }), '', label + ' alone');
  assert.equal(fieldKind({ label: label }), 'postal', label);
  const home = [
    { id: 'home', label: 'Residential Address' },
    { id: 'pc', label: label }
  ];
  assert.equal(identityPhotoSlot(home[1], home), 'postal', label + ' beside residential address');
});
['Unzip', 'Zippy', 'Zipper', 'Please unzip the file'].forEach(function (label) {
  assert.equal(identityPhotoSlot({ id: 'z', label: label }), '', label);
  assert.notEqual(fieldKind({ label: label }), 'postal', label);
});
['Guarantor', 'Spouse', 'Nominee'].forEach(function (section) {
  assert.equal(identityPhotoSlot({ id: 'g', label: 'Post Code', section: section }), '', section);
  assert.equal(identityPhotoSlot({ id: 'g', label: 'Zip Code', group: section }), '', section);
});
assert.equal(identityPhotoSlot({ id: 'bank', label: 'Post Code', section: 'For Bank Use Only' }), '');
['Solicitor', 'Hospital', 'Bank', 'Insurer', 'Accountant', 'Pharmacy', 'GP surgery', 'GP', 'Surgery', 'School', 'Previous address'].forEach(function (section) {
  assert.equal(sectionKind(section), 'other', section);
  const lines = [
    { id: 'a', label: 'Address', section: section },
    { id: 'pc', label: 'Post Code', section: section }
  ];
  assert.equal(identityPhotoSlot(lines[0], lines), '', section + ' address');
  assert.equal(identityPhotoSlot(lines[1], lines), '', section + ' post code');
});
const applicantAddress = [
  { id: 'a', label: 'Address', section: "Applicant's particulars" },
  { id: 'pc', label: 'Post Code', section: "Applicant's particulars" }
];
assert.equal(identityPhotoSlot(applicantAddress[0], applicantAddress), 'address', 'applicant address');
assert.equal(identityPhotoSlot(applicantAddress[1], applicantAddress), 'postal', 'applicant post code');
assert.equal(sectionKind('Standard Chartered Bank'), '', 'bank letterhead');
assert.equal(sectionKind('OCBC Bank'), '', 'bank letterhead');
assert.equal(sectionKind('Your Bank'), 'other');
assert.equal(sectionKind('The Bank'), 'other');
assert.equal(sectionKind('Bank Details'), 'other');
assert.equal(sectionKind('Name of Bank'), 'other');
assert.equal(sectionKind('Details of Bank'), 'other');
assert.equal(sectionKind('Bank otherwise'), '', 'a sentence fragment is not a bank section');
const presentPost = [
  { id: 'home', label: 'Permanent Address', page: 1 },
  { id: 'pc', label: 'Post Code:', page: 1 }
];
assert.equal(identityPhotoSlot(presentPost[1], presentPost), 'postal', 'post code beside permanent address');
const i9 = [
  { id: 'addr', label: 'Address (Street Number and Name)', page: 0 },
  { id: 'city', label: 'City or Town', page: 0 },
  { id: 'state', label: 'State', page: 0 },
  { id: 'zip', label: 'ZIP Code', page: 0, maxLen: 6, tooltip: 'Section 1., Enter ZIP Code.' }
];
const sgCard = {
  blk: '88', street: 'EXAMPLE WALK', unit: '12-34', postal: '018956',
  blkChecked: false, streetChecked: false, postalChecked: false, blkUnconfirmed: false
};
assert.equal(addressSlotsBlank(sgCard, i9), false, 'a US ZIP does not blank the Singapore address');
assert.equal(identityCardOffer(sgCard, 'address', i9).value, '88 EXAMPLE WALK #12-34 SINGAPORE 018956');
assert.equal(identityCardOffer(sgCard, 'postal', i9, i9[3]).value, '');
assert.equal(identityPhotoSlot(i9[3], i9), 'postal', 'I-9 ZIP is still a postal slot');
assert.equal(identityPhotoSlot({ id: 'bank', label: 'Name as per bank account' }, [{ id: 'bank', label: 'Name as per bank account' }]), 'name');
assert.equal(identityPhotoSlot({ id: 'bank', label: 'Zip', section: 'For official use' }), '');
assert.equal(fieldKind({ label: 'Post Code', section: 'For Bank Use Only' }), 'other');
['Pharmacy', 'GP surgery', 'School'].forEach(function (section) {
  const block = [
    { id: 'where', label: section + ' address', section: section },
    { id: 'pc', label: 'Postcode', section: section }
  ];
  assert.equal(identityPhotoSlot(block[1], block), '', section);
  assert.equal(identityPhotoSlot({ id: 'z', label: 'Zip', section: section }, [{ id: 'z', label: 'Zip', section: section }]), '', section + ' zip');
});
assert.equal(identityPhotoSlot({ id: 'pc', label: 'Post Code', section: 'Further details' }, [{ id: 'pc', label: 'Post Code', section: 'Further details' }]), '', 'unnamed heading');
const scPost = [
  { id: 'home', label: 'Residential Address', section: "Applicant's Personal Information" },
  { id: 'pc', label: 'Post Code', section: "Applicant's Personal Information" }
];
assert.equal(identityPhotoSlot(scPost[1], scPost), 'postal', 'SC post code');
assert.equal(identityPhotoSlot({ id: 'blk', label: 'Blk/House No.' }), 'blk');
assert.equal(identityPhotoSlot({ id: 'street', label: 'Street' }), 'street');
assert.equal(identityPhotoSlot({ id: 'unit', label: 'Unit' }), 'unit');
assert.equal(identityPhotoSlot({ id: 'unit_no', label: 'Unit No. #' }), 'unit');
assert.equal(identityPhotoSlot({ id: 'blk_house', label: 'Blk / House No.' }), 'blk');
assert.equal(identityPhotoSlot({ id: 'race', label: 'Race' }), 'race');
assert.equal(identityPhotoSlot({ id: 'born', label: 'Country of birth' }), 'birthCountry');
assert.equal(identityPhotoSlot({ id: 'gdob', label: 'Date of birth', section: 'Guarantor' }), '');
assert.equal(identityPhotoSlot({ id: 'gsex', label: 'Sex', section: 'Nominee' }), '');
assert.equal(identityPhotoSlot({ id: 'gaddr', label: 'Address', section: 'Guarantor' }), '');
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
['Declaration', 'Declaration by applicant', 'Declaration by the applicant', 'Declaration of the applicant', "Applicant's declaration", 'Part B continued', 'For bank use', 'For official use', 'Office use', 'Part B', 'Part C', 'Part D', 'Acknowledgement', 'Acknowledge', 'Authorisation', 'Terms and conditions'].forEach(function (heading) {
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
const onlyAddress = [{ id: 'a', label: 'Address' }];
const unconfirmedHome = identityVote([
  identityRead('APT BLK 9999 STREET #99-999\nSINGAPORE 999999\n'),
  identityRead('APT BLK 9999 STREET #99-999\nSINGAPORE 999999\n')
]);
assert.equal(identityPhotoSlot(onlyAddress[0], onlyAddress), 'address');
assert.equal(identityCardOffer(unconfirmedHome, 'address').value, '9999 STREET #99-999 SINGAPORE 999999');
const bothSlots = [{ id: 'b', label: 'Blk' }, { id: 'a', label: 'Address' }];
const bothAddress = identityCardOffer(unconfirmedHome, 'address', bothSlots);
const bothBlk = identityCardOffer(unconfirmedHome, 'blk', bothSlots);
assert.equal(bothAddress.value, 'STREET #99-999 SINGAPORE 999999');
assert.equal(bothAddress.checked, false);
assert.equal(bothAddress.editable, true);
assert.equal(bothBlk.value, '9999');
assert.equal(bothBlk.checked, false);
assert.equal(bothBlk.editable, true);
const mixedParts = bothSlots.concat([
  { id: 's', label: 'Street' },
  { id: 'u', label: 'Unit' },
  { id: 'p', label: 'Postal code' }
]);
const agreedParts = Object.assign({}, unconfirmedHome, { streetChecked: true, unitChecked: true, postalChecked: true });
['street', 'unit', 'postal'].forEach(function (slot) {
  const offered = identityCardOffer(agreedParts, slot, mixedParts);
  assert.equal(offered.checked, false, slot);
  assert.ok(offered.value, slot);
});
const splitOnly = [
  { id: 'b', label: 'Blk' },
  { id: 's', label: 'Street' },
  { id: 'u', label: 'Unit' },
  { id: 'p', label: 'Postal code' }
];
const addressStreet = [
  { id: 'a', label: 'Address' },
  { id: 's', label: 'Street' },
  { id: 'u', label: 'Unit' },
  { id: 'p', label: 'Postal code' }
];
[splitOnly, addressStreet, onlyAddress].forEach(function (shape) {
  ['street', 'unit', 'postal'].forEach(function (slot) {
    assert.equal(identityCardOffer(agreedParts, slot, shape).checked, false, slot + ' ' + shape.map(function (field) { return field.label; }).join('+'));
  });
});
const confirmedParts = identityVote([
  identityRead('BLK 88 EXAMPLE WALK\n#12-34\nSINGAPORE 018956\n'),
  identityRead('BLK 88 EXAMPLE WALK\n#12-34\nSINGAPORE 018956\n')
]);
assert.equal(identityCardOffer(confirmedParts, 'street', splitOnly).checked, true);
assert.equal(identityCardOffer(confirmedParts, 'unit', addressStreet).checked, true);
assert.equal(identityCardOffer(confirmedParts, 'postal', onlyAddress).checked, true);
const addressAndStreet = [
  { id: 'a', label: 'Address' },
  { id: 's', label: 'Street' },
  { id: 'p', label: 'Postal code' }
];
const addressAndBlk = [
  { id: 'a', label: 'Address' },
  { id: 'b', label: 'Blk' },
  { id: 's', label: 'Street' },
  { id: 'p', label: 'Postal code' }
];
assert.equal(addressSlotsBlank(confirmedParts, addressAndStreet), false);
assert.equal(addressSlotsBlank(confirmedParts, addressAndBlk), false);
assert.equal(identityCardOffer(confirmedParts, 'street', addressAndStreet).checked, true);
assert.equal(identityCardOffer(confirmedParts, 'postal', addressAndStreet).checked, true);
assert.equal(identityCardOffer(confirmedParts, 'address', addressAndStreet).value, '88 #12-34');
assert.equal(identityCardOffer(confirmedParts, 'address', addressAndStreet).checked, true);
assert.equal(identityCardOffer(confirmedParts, 'blk', addressAndBlk).checked, true);
assert.equal(identityCardOffer(confirmedParts, 'street', addressAndBlk).checked, true);
assert.equal(identityCardOffer(confirmedParts, 'address', addressAndBlk).value, '#12-34');
assert.equal(identityCardOffer(confirmedParts, 'address', addressAndBlk).checked, true);
const addressLine = identityCardOffer(confirmedParts, 'address', onlyAddress);
assert.equal(addressLine.value, '88 EXAMPLE WALK #12-34 SINGAPORE 018956');
assert.equal(addressLine.checked, true);
const addressBlk = [{ id: 'a', label: 'Address' }, { id: 'b', label: 'Blk' }];
const addressPostal = [{ id: 'a', label: 'Address' }, { id: 'p', label: 'Postal code' }];
const addressUnit = [{ id: 'a', label: 'Address' }, { id: 'u', label: 'Unit' }];
assert.equal(identityCardOffer(confirmedParts, 'blk', addressBlk).value, '88');
assert.equal(identityCardOffer(confirmedParts, 'blk', addressBlk).checked, true);
assert.equal(identityCardOffer(confirmedParts, 'address', addressBlk).value, 'EXAMPLE WALK #12-34 SINGAPORE 018956');
assert.equal(identityCardOffer(confirmedParts, 'address', addressBlk).checked, true);
assert.equal(identityCardOffer(confirmedParts, 'postal', addressPostal).value, '018956');
assert.equal(identityCardOffer(confirmedParts, 'postal', addressPostal).checked, true);
assert.equal(identityCardOffer(confirmedParts, 'address', addressPostal).value, '88 EXAMPLE WALK #12-34');
const i9Address = [
  { id: 'addr', label: 'Address (Street Number and Name)', section: 'Section 1. Employee Information and Attestation' },
  { id: 'city', label: 'City or Town', section: 'Section 1. Employee Information and Attestation' },
  { id: 'state', label: 'State', section: 'Section 1. Employee Information and Attestation' },
  { id: 'zip', label: 'ZIP Code', maxLen: 5, section: 'Section 1. Employee Information and Attestation' }
];
assert.equal(identityCardOffer(confirmedParts, 'postal', i9Address).value, '', 'a Singapore code stays out of a 5-digit ZIP');
assert.ok(identityCardOffer(confirmedParts, 'address', i9Address).value.indexOf('SINGAPORE 018956') >= 0, 'I-9 address keeps SINGAPORE and the postal code');
const zipPlus4 = [
  { id: 'addr', label: 'Address (Street Number and Name)', section: 'Section 1. Employee Information and Attestation' },
  { id: 'zip', label: 'ZIP Code', maxLen: 10, tooltip: 'ZIP+4', section: 'Section 1. Employee Information and Attestation' }
];
assert.equal(identityCardOffer(confirmedParts, 'postal', zipPlus4).value, '', 'a Singapore code stays out of ZIP+4');
assert.ok(identityCardOffer(confirmedParts, 'address', zipPlus4).value.indexOf('SINGAPORE 018956') >= 0, 'ZIP+4 leaves the code on the address row');
const i9Refused = [
  { id: 'addr', label: 'Address (Street Number and Name)', section: 'Section 1. Employee Information and Attestation' },
  { id: 'zip', label: 'ZIP Code', section: 'Pharmacy' }
];
assert.equal(identityPhotoSlot(i9Refused[1], i9Refused), '', 'a ZIP outside the address block is not filled');
assert.ok(identityCardOffer(confirmedParts, 'address', i9Refused).value.indexOf('SINGAPORE 018956') >= 0, 'address keeps the postal code when the ZIP box is not filled');
const scFilled = [
  { id: 'home', label: 'Residential Address', section: "Applicant's Personal Information" },
  { id: 'pc', label: 'Post Code', section: "Applicant's Personal Information" }
];
assert.equal(identityCardOffer(confirmedParts, 'postal', scFilled).value, '018956', 'SC post code is filled');
assert.equal(identityCardOffer(confirmedParts, 'unit', addressUnit).value, '12-34');
assert.equal(identityCardOffer(confirmedParts, 'address', addressUnit).value, '88 EXAMPLE WALK SINGAPORE 018956');
const singleStreet = {
  blk: '88', blkChecked: true, blkUnconfirmed: false,
  street: 'EXAMPLE WALK', streetChecked: false,
  unit: '12-34', unitChecked: true,
  postal: '018956', postalChecked: true,
  address: '88 EXAMPLE WALK #12-34 SINGAPORE 018956',
  addressChecked: false
};
assert.equal(addressSlotsBlank(singleStreet, addressAndStreet), false);
const looseStreet = identityCardOffer(singleStreet, 'street', addressAndStreet);
assert.equal(looseStreet.value, 'EXAMPLE WALK');
assert.equal(looseStreet.checked, false);
assert.equal(looseStreet.editable, true);
assert.equal(identityCardOffer(singleStreet, 'postal', addressAndStreet).checked, true);
assert.equal(identityCardOffer(singleStreet, 'address', addressPostal).value, '88 EXAMPLE WALK #12-34');
assert.equal(identityCardOffer(singleStreet, 'address', addressPostal).checked, false);
assert.equal(identityCardOffer(singleStreet, 'address', addressPostal).editable, true);
function usedValues(identity, fields) {
  if (addressSlotsBlank(identity, fields)) return [];
  return fields.map(function (field) {
    const slot = identityPhotoSlot(field, fields);
    const offer = identityCardOffer(identity, slot, fields);
    if (!slot || !offer || !offer.checked || !offer.value) return '';
    return offer.value;
  }).filter(Boolean);
}
function overlaps(values) {
  return values.some(function (value, index) {
    return values.some(function (other, otherIndex) {
      return otherIndex !== index && String(other).indexOf(value) >= 0;
    });
  });
}
assert.equal(overlaps(usedValues(confirmedParts, addressAndStreet)), false);
assert.equal(overlaps(usedValues(confirmedParts, addressAndBlk)), false);
assert.equal(usedValues(confirmedParts, addressAndStreet).indexOf('88 EXAMPLE WALK #12-34 SINGAPORE 018956'), -1);
assert.ok(usedValues(confirmedParts, addressAndStreet).indexOf('EXAMPLE WALK') >= 0);
assert.equal(usedValues(confirmedParts, onlyAddress)[0], '88 EXAMPLE WALK #12-34 SINGAPORE 018956');
assert.equal(addressSlotsBlank(agreedParts, addressAndStreet), false);
assert.equal(addressSlotsBlank(agreedParts, addressAndBlk), false);
assert.equal(identityCardOffer(agreedParts, 'street', addressAndStreet).checked, false);
assert.equal(identityCardOffer(agreedParts, 'postal', addressAndBlk).checked, false);
assert.equal(identityCardOffer(agreedParts, 'address', addressAndBlk).checked, false);
const oneConfirmed = identityVote([identityRead('BLK 88 EXAMPLE WALK\n#12-34\nSINGAPORE 018956\n')]);
assert.equal(addressSlotsBlank(oneConfirmed, addressAndStreet), true);
const noBlock = { blk: '', blkUnconfirmed: false, street: 'EXAMPLE RD', streetChecked: true, unit: '12-34', unitChecked: true, postal: '018956', postalChecked: true };
assert.equal(identityCardOffer(noBlock, 'street', splitOnly).checked, true);
const noBlockReads = identityVote([
  identityRead('EXAMPLE RD #12-34 SINGAPORE 018956\n'),
  identityRead('EXAMPLE RD #12-34 SINGAPORE 018956\n')
]);
const addressStreetOnly = [{ id: 'a', label: 'Address' }, { id: 's', label: 'Street' }];
assert.equal(noBlockReads.blk, '');
assert.equal(noBlockReads.streetChecked, true);
assert.equal(noBlockReads.postalChecked, true);
assert.equal(addressSlotsBlank(noBlockReads, addressStreetOnly), false);
assert.equal(identityCardOffer(noBlockReads, 'street', addressStreetOnly).value, 'EXAMPLE RD');
assert.equal(identityCardOffer(noBlockReads, 'street', addressStreetOnly).checked, true);
assert.equal(identityCardOffer(noBlockReads, 'address', addressStreetOnly).value, '#12-34 SINGAPORE 018956');
assert.equal(identityCardOffer(noBlockReads, 'address', addressStreetOnly).checked, true);
const looseParts = {
  blk: '88', blkChecked: true, blkUnconfirmed: false,
  street: 'EXAMPLE WALK', streetChecked: true,
  unit: '12-34', unitChecked: false,
  postal: '018956', postalChecked: false
};
const partFields = [{ id: 's', label: 'Street' }, { id: 'u', label: 'Unit' }, { id: 'p', label: 'Postal code' }];
assert.equal(identityCardOffer(looseParts, 'unit', partFields).checked, false);
assert.equal(identityCardOffer(looseParts, 'unit', partFields).editable, true);
assert.equal(identityCardOffer(looseParts, 'postal', partFields).checked, false);
assert.equal(identityCardOffer(looseParts, 'postal', partFields).editable, true);
const heldBlock = Object.assign({}, looseParts, { blk: '1234', blkUnconfirmed: true, blkChecked: false });
assert.equal(identityCardOffer(heldBlock, 'unit', partFields).checked, false);
assert.equal(identityCardOffer(heldBlock, 'unit', partFields).editable, false);
assert.equal(identityCardOffer(heldBlock, 'postal', partFields).editable, false);
const suggestedBlk = identityVote([
  identityRead('BLK 1234 EXAMPLE RD\n#12-34\nSINGAPORE 560123\n', [{
    text: '1234',
    glyphs: [
      { text: '1', confidence: 96 },
      { text: '2', confidence: 96 },
      { text: '3', confidence: 96 },
      { text: '4', confidence: 40, choices: [{ text: '4', confidence: 40 }, { text: 'A', confidence: 36 }] }
    ]
  }]),
  identityRead('BLK 123A EXAMPLE RD\n#12-34\nSINGAPORE 560123\n')
]);
const suggestedFields = [{ id: 'b', label: 'Blk' }, { id: 's', label: 'Street' }, { id: 'u', label: 'Unit' }, { id: 'p', label: 'Postal code' }];
assert.equal(suggestedBlk.blk, '123A');
assert.equal(suggestedBlk.blkHint, '1234');
assert.equal(identityCardOffer(suggestedBlk, 'blk', suggestedFields).value, '123A');
assert.equal(identityCardOffer(suggestedBlk, 'blk', suggestedFields).checked, false);
assert.equal(identityCardOffer(suggestedBlk, 'blk', suggestedFields).editable, true);
assert.equal(identityCardOffer(suggestedBlk, 'street', suggestedFields).checked, false);
assert.equal(identityCardOffer(suggestedBlk, 'postal', suggestedFields).checked, false);
const houseConflict = identityVote([
  identityRead('10 EXAMPLE RD\nBLK 88\n#12-34\nSINGAPORE 018956\n'),
  identityRead('10 EXAMPLE RD\nBLK 88\n#12-34\nSINGAPORE 018956\n')
]);
const houseFields = [{ id: 'b', label: 'Blk' }, { id: 's', label: 'Street' }, { id: 'u', label: 'Unit' }, { id: 'p', label: 'Postal code' }];
assert.equal(houseConflict.blk, '10');
assert.equal(houseConflict.blkUnconfirmed, true);
['street', 'unit', 'postal', 'blk'].forEach(function (slot) {
  assert.equal(identityCardOffer(houseConflict, slot, houseFields).checked, false, 'conflict ' + slot);
});
const crossedRead = identityRead('EXAMPLE RD #12-34\nSINGAPORE 018956\nBLK 88\nOTHER RD\n');
const crossedParts = identityVote([crossedRead, crossedRead]);
const crossedFields = [{ id: 'b', label: 'Blk' }, { id: 's', label: 'Street' }, { id: 'u', label: 'Unit' }, { id: 'p', label: 'Postal code' }];
assert.equal(crossedParts.blkUnconfirmed, true);
['street', 'unit', 'postal', 'blk'].forEach(function (slot) {
  assert.equal(identityCardOffer(crossedParts, slot, crossedFields).checked, false, slot);
});
const addressOnly = identityCardOffer(unconfirmedHome, 'address', onlyAddress);
assert.equal(addressOnly.value, '9999 STREET #99-999 SINGAPORE 999999');
assert.equal(addressOnly.checked, false);
assert.equal(addressOnly.editable, true);
const incomplete = Object.assign({}, unconfirmedHome, { postal: '' });
assert.equal(identityCardOffer(incomplete, 'address', onlyAddress).value, '9999 STREET #99-999');
assert.equal(identityCardOffer(incomplete, 'address', onlyAddress).checked, false);
assert.equal(identityCardOffer(unconfirmedHome, 'blk').value, '9999');
assert.equal(identityCardOffer(unconfirmedHome, 'blk').checked, false);
assert.equal(identityCardOffer(unconfirmedHome, 'blk').editable, true);
const confirmedHome = identityVote([identityRead('BLK 88 EXAMPLE WALK\n#12-34\nSINGAPORE 018956\n')]);
assert.equal(identityCardOffer(confirmedHome, 'address').value, '88 EXAMPLE WALK #12-34 SINGAPORE 018956');
assert.equal(identityCardOffer(confirmedHome, 'address').checked, false);
const partialOffer = { blk: '88', street: '', postal: '018956', address: '88 SINGAPORE 018956', blkUnconfirmed: false };
assert.equal(identityCardOffer(partialOffer, 'address').value, '88 SINGAPORE 018956');
assert.equal(identityCardOffer(partialOffer, 'address').checked, false);
assert.equal(sectionKind('See Part B'), '');
assert.equal(personOf('The insured'), 'other');
assert.equal(personOf('Insured'), 'other');
assert.equal(identityPhotoSlot({ id: 'n', label: 'Name', section: 'The insured' }, [{ id: 'n', label: 'Name', section: 'The insured' }]), '');
assert.equal(identityPhotoSlot({ id: 'n', label: 'Name', section: 'Insured' }, [{ id: 'n', label: 'Name', section: 'Insured' }]), '');
assert.equal(personOf('Sum insured'), '');
assert.equal(identityPhotoSlot({ id: 'n', label: 'Name', section: 'Sum insured' }, [{ id: 'n', label: 'Name', section: 'Sum insured' }]), 'name');

console.log('evidence tests ok');
