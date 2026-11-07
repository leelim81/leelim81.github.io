import { createRequire } from 'module';
import { readFileSync } from 'fs';
import assert from 'assert';

const require = createRequire(import.meta.url);
const { fromText, mapFactsToFields, accept, modelFields, preview, allowModelValue, prepareModelValue, modelScalar, coerceModelObject } = require('./facts.js');

const ocr = `REPUBLIC OF SINGAPORE
IDENTITY CARD NO. S1234567D
ALEX EXAMPLE
(SYNTHETIC)
Race
CHINESE
Date of Birth Sex
14-03-1992 F
APT BLK 10 EXAMPLE ROAD #04-12
123456
NRIC No: ~$12345670 Date: 02/08/2015`;

const facts = fromText(ocr);
assert.equal(facts.name, 'ALEX EXAMPLE');
assert.equal(facts.nric, 'S1234567D');
assert.equal(facts.dob, '14/03/1992');
assert.equal(facts.sex, 'Female');
assert.equal(facts.race, 'Chinese');
assert.equal(facts.blk, '10');
assert.equal(facts.street, 'EXAMPLE ROAD');
assert.equal(facts.unit, '04-12');
assert.equal(facts.postal, '123456');
assert.equal(facts.residential, undefined);

const fields = [
  { id: 'full_name', label: 'Full Name', type: 'text' },
  { id: 'street', label: 'Street Name', type: 'text' },
  { id: 'nric', label: 'NRIC/FIN Number', type: 'text' },
  { id: 'dob', label: 'Date of Birth', type: 'text' },
  { id: 'blk', label: 'Blk/House No.', type: 'text' },
  { id: 'unit', label: 'Unit No. #', type: 'text' },
  { id: 'postal', label: 'Postal Code', type: 'text' },
  { id: 'male', label: 'Male', type: 'radio', group: 'Gender', options: ['Male', 'Female'] },
  { id: 'female', label: 'Female', type: 'radio', group: 'Gender', options: ['Male', 'Female'] },
  { id: 'chinese', label: 'Chinese', type: 'radio', group: 'Race', options: ['Chinese', 'Malay'] },
  { id: 'malay', label: 'Malay', type: 'radio', group: 'Race', options: ['Chinese', 'Malay'] },
  { id: 'citizen', label: 'Singapore Citizen', type: 'radio', group: 'Residential Status', options: ['Singapore Citizen'] },
  { id: 'phone', label: '(HP)', type: 'text' },
  { id: 'email', label: 'Email Address', type: 'text' },
  { id: 'company', label: 'Company Name in Full', type: 'text' }
];
const mapped = mapFactsToFields(facts, fields);
assert.equal(mapped.full_name, 'ALEX EXAMPLE');
assert.equal(mapped.street, 'EXAMPLE ROAD');
assert.notEqual(mapped.street, facts.name);
assert.equal(mapped.nric, 'S1234567D');
assert.equal(mapped.dob, '14/03/1992');
assert.equal(mapped.blk, '10');
assert.equal(mapped.unit, '04-12');
assert.equal(mapped.postal, '123456');
assert.equal(mapped.female, 'Female');
assert.equal(mapped.male, undefined);
assert.equal(mapped.chinese, 'Chinese');
assert.equal(mapped.malay, undefined);
assert.equal(mapped.citizen, undefined);

const stated = fromText(ocr + '\nResidential status Singapore Citizen\n');
assert.equal(stated.residential, 'Singapore Citizen');
assert.equal(mapFactsToFields(stated, fields).citizen, 'Singapore Citizen');
const resident = fromText('NRIC S1234567D\nPermanent Resident\n');
assert.equal(resident.residential, 'Permanent Resident');
assert.equal(resident.nric.charAt(0), 'S');
assert.equal(mapped.phone, undefined);
assert.equal(mapped.email, undefined);
assert.equal(mapped.company, undefined);

['name', 'phone', 'email', 'street', 'blk', 'company'].forEach(function (kind) {
  var field = { id: kind, label: kind === 'name' ? 'Full Name' : kind === 'phone' ? '(HP)' : kind === 'email' ? 'Email Address' : kind === 'street' ? 'Street Name' : kind === 'blk' ? 'Blk/House No.' : 'Company Name in Full', type: 'text' };
  assert.equal(accept(field, 'SINGAPORE'), false, kind);
  assert.equal(accept(field, 'REPUBLIC OF SINGAPORE'), false, kind);
});
assert.equal(accept({ id: 'nric', label: 'NRIC/FIN Number', type: 'text' }, 'S§1088520'), false);
assert.equal(accept({ id: 'phone', label: '(HP)', type: 'text' }, '123'), false);

const leftovers = [
  { id: 'hp', label: '(HP)', type: 'text' },
  { id: 'email', label: 'Email Address', type: 'text' },
  { id: 'company', label: 'Company Name in Full', type: 'text' },
  { id: 'title', label: 'Title / Designation', type: 'text' }
];
assert.deepEqual(modelFields(leftovers, ocr).map(function (field) { return field.id; }), []);
assert.ok(preview(facts).indexOf('Name ALEX EXAMPLE') !== -1);
assert.ok(preview(facts).indexOf('DOB 14/03/1992') !== -1);
assert.ok(preview(facts).indexOf('Address 10 EXAMPLE ROAD #04-12 123456') !== -1);
assert.equal(facts.phone, undefined);
assert.equal(facts.email, undefined);

const letter = `Full name: Tan Wei Ming
Phone: +65 8123 4567
Email: wei.ming.tan@example.com
Date of birth: 14 Mar 1992
Company: Harbour Books
Nationality: Singaporean`;
const noted = fromText(letter);
assert.equal(noted.name, 'Tan Wei Ming');
assert.equal(noted.phone, '+65 8123 4567');
assert.equal(noted.email, 'wei.ming.tan@example.com');
assert.equal(noted.dob, '14/03/1992');
assert.equal(noted.company, 'Harbour Books');
assert.equal(noted.citizenship, 'Singapore Citizen');
assert.equal(mapFactsToFields(noted, [{ id: 'nationality', label: 'Nationality', type: 'text' }]).nationality, 'Singapore Citizen');
const asked = modelFields([
  { id: 'company', label: 'Company Name in Full', type: 'text' },
  { id: 'hp', label: '(HP)', type: 'text' },
  { id: 'title', label: 'Title / Designation', type: 'text' },
  { id: 'nationality', label: 'Nationality', type: 'text' }
], letter).map(function (field) { return field.id; });
assert.ok(asked.indexOf('company') !== -1);
assert.ok(asked.indexOf('hp') !== -1);
assert.ok(asked.indexOf('nationality') !== -1);
assert.ok(asked.indexOf('title') === -1);
assert.ok(preview(noted).indexOf('Name Tan Wei Ming') !== -1);
assert.ok(preview(noted).indexOf('Phone +65 8123 4567') !== -1);

const pubeu = [
  { id: 'nric', label: 'NRIC NO:', type: 'text' },
  { id: 'address', label: 'ADDRESS:', type: 'text' },
  { id: 'hp', label: 'H/P NO:', type: 'text' },
  { id: 'sign', label: 'Signature of Applicant', type: 'text' },
  { id: 'first', label: 'First Name Given Name', type: 'text' },
  { id: 'last', label: 'Last Name Family Name', type: 'text' }
];
const placed = mapFactsToFields(facts, pubeu);
assert.equal(placed.nric, 'S1234567D');
assert.equal(placed.address, '10 EXAMPLE ROAD #04-12 123456');
assert.equal(placed.sign, undefined);
assert.equal(placed.first, undefined);
assert.equal(placed.last, undefined);
const phonePlaced = mapFactsToFields(noted, pubeu);
assert.equal(phonePlaced.hp, '+65 8123 4567');

const parts = fromText('First name: Alex\nLast name: Example\nFull name: Alex Example\n');
assert.equal(parts.firstName, 'Alex');
assert.equal(parts.lastName, 'Example');
assert.equal(parts.name, 'Alex Example');
const splitFields = [
  { id: 'first', label: 'First Name Given Name', type: 'text' },
  { id: 'last', label: 'Last Name Family Name', type: 'text' },
  { id: 'full', label: 'Full Name', type: 'text' }
];
const splitMapped = mapFactsToFields(parts, splitFields);
assert.equal(splitMapped.first, 'Alex');
assert.equal(splitMapped.last, 'Example');
assert.equal(splitMapped.full, 'Alex Example');
const third = mapFactsToFields(noted, [
  { id: 'depNric', label: 'NRIC No', group: 'Name of Dependant', type: 'text' },
  { id: 'depSex', label: 'Male', group: 'Name of Dependant Gender', type: 'radio' },
  { id: 'contact', label: 'Contact No', type: 'text' }
]);
assert.equal(third.depNric, undefined);
assert.equal(third.depSex, undefined);
assert.equal(third.contact, '+65 8123 4567');
const sexed = mapFactsToFields(fromText('Sex: M\n'), [
  { id: 'memberSex', label: 'Male', group: 'Gender', type: 'radio' },
  { id: 'depSex', label: 'Male', group: 'Name of Dependant Gender', type: 'radio' }
]);
assert.equal(sexed.memberSex, 'Male');
assert.equal(sexed.depSex, undefined);
const unsafe = mapFactsToFields(fromText('Full name: Alex Example\nNRIC/FIN: S1234567D\n'), [
  { id: 'messy', label: 'Nome os in NRIC/Possport', type: 'text' },
  { id: 'printed', label: 'Name to be printed', type: 'text' },
  { id: 'card', label: 'Name to be printed on cord', type: 'text' },
  { id: 'sex', label: 'Sex', type: 'text' },
  { id: 'dob', label: 'Date of Birth', type: 'text' },
  { id: 'member', label: 'Name of Member (Claimant)', type: 'text' },
  { id: 'nric', label: 'NRIC/FIN NO', type: 'text' }
]);
assert.equal(unsafe.messy, undefined);
assert.equal(unsafe.printed, undefined);
assert.equal(unsafe.card, undefined);
assert.equal(unsafe.sex, undefined);
assert.equal(unsafe.dob, undefined);
assert.equal(unsafe.member, 'Alex Example');
const columnDob = mapFactsToFields(fromText('Date of birth: 14 Mar 1992\n'), [
  { id: 'memberDob', label: 'Date of Birth (dd/mm/yyyy)', type: 'text' },
  { id: 'depDob', label: 'Date of Birth (dd/mm/yyyy)', group: 'Name of Dependant', type: 'text' }
]);
assert.equal(columnDob.memberDob, '14/03/1992');
assert.equal(columnDob.depDob, undefined);
assert.equal(unsafe.nric, 'S1234567D');
assert.equal(accept({ id: 'dob', label: 'Date of Birth', type: 'text' }, 'Alex Example'), false);
assert.equal(accept({ id: 'sex', label: 'Sex', type: 'text' }, 'Alex Example'), false);
const noSplit = mapFactsToFields(fromText('Full name: Alex Example\n'), splitFields);
assert.equal(noSplit.first, undefined);
assert.equal(noSplit.last, undefined);
assert.equal(noSplit.full, 'Alex Example');

const premises = fromText('Premises: 44 CEDAR WALK 161616\n');
assert.equal(premises.address, '44 CEDAR WALK 161616');
assert.equal(premises.postal, '161616');
assert.equal(fromText('Premises: 44 CEDAR WALK 161616. Handset was not given.').address, '44 CEDAR WALK 161616');
assert.equal(fromText('Premises: 44 CEDAR WALK 161616; Handset was not given.').address, '44 CEDAR WALK 161616');
const premisesCard = fromText('Full name: Alex Example\nPremises: 44 CEDAR WALK 161616. Next of kin is Pat Example.\n');
assert.equal(premisesCard.name, 'Alex Example');
assert.equal(premisesCard.address, '44 CEDAR WALK 161616');
assert.equal(premisesCard.postal, '161616');
assert.equal(fromText('The file number 123456 is not an address.').address, undefined);
assert.equal(fromText('44 HARBOUR LANE 161616').name, undefined);
const otherDob = 'CLINIC COPY about another person\nPatient listed: Pat Example born 01/01/1980.\nAccompanied by applicant.\nFull name: Alex Example\n';
assert.equal(fromText('Patient\nDate of birth: 01/01/1980\nApplicant\nThe applicant was born on 14 March 1992.\n').dob, '14/03/1992');
assert.equal(fromText('Patient\nDate of birth: 01/01/1980\nApplicant\nFull name: Alex Example\n').dob, undefined);
assert.equal(fromText('The patient is the applicant.\nPatient born 14/03/1992.\n').dob, '14/03/1992');
assert.equal(fromText('Citizenship: Singapore\n').citizenship, 'Singapore Citizen');
assert.equal(fromText('Citizenship: Singaporean\n').citizenship, 'Singapore Citizen');
assert.equal(fromText('NRIC S1234567D\nAddress: 10 EXAMPLE ROAD SINGAPORE 123456\n').citizenship, undefined);
assert.equal(allowModelValue({ id: 'dob', label: 'Applicant date of birth', type: 'text' }, '01/01/1980', otherDob), false);
assert.equal(allowModelValue({ id: 'dob', label: 'Date of birth', type: 'text' }, '02/02/1990', 'The patient is the applicant. Patient born 02/02/1990.'), true);
assert.equal(allowModelValue({ id: 'dob', label: 'Date of birth', type: 'text' }, '14/03/1992', 'The applicant was born on 14 March 1992.'), true);
assert.equal(allowModelValue({ id: 'dob', label: 'Date of birth', type: 'text' }, '14/03/1992', 'The applicant was born on 14.03.1992.'), true);
assert.equal(allowModelValue({ id: 'cit', label: 'Citizenship', type: 'text' }, 'Not specified', 'Full name: Alex Example'), false);
assert.equal(allowModelValue({ id: 'cit', label: 'Citizenship', type: 'text' }, 'Singapore', 'REPUBLIC OF SINGAPORE\nFull name: Alex'), false);
assert.equal(allowModelValue({ id: 'cit', label: 'Citizenship', type: 'text' }, 'Permanent Resident', 'Citizenship: Permanent Resident'), true);
assert.equal(prepareModelValue({ id: 'cit', label: 'Citizenship', type: 'text' }, 'Singapore', 'Citizenship: Singapore'), 'Singapore Citizen');
assert.equal(prepareModelValue({ id: 'cit', label: 'Citizenship', type: 'text' }, 'Singaporean', 'Citizenship: Singaporean'), 'Singapore Citizen');
assert.equal(prepareModelValue({ id: 'cit', label: 'Citizenship', type: 'text' }, 'Singapore Citizen', 'The applicant is a Singaporean.'), 'Singapore Citizen');
assert.equal(prepareModelValue({ id: 'nat', label: 'Nationality', type: 'dropdown', options: ['Singaporean', 'Malaysian'] }, 'Singapore', 'Citizenship: Singapore'), 'Singaporean');
assert.equal(allowModelValue({ id: 'cit', label: 'Citizenship', type: 'text' }, 'Singapore Citizen', 'NRIC S1234567D\nAddress: 10 EXAMPLE ROAD SINGAPORE 123456'), false);
assert.equal(allowModelValue({ id: 'cit', label: 'Citizenship', type: 'text' }, 'Singapore', 'Citizenship: Not specified'), false);
assert.equal(allowModelValue({ id: 'cit', label: 'Citizenship', type: 'text' }, 'Singapore', 'Patient\nCitizenship: Singapore\nApplicant\nName: Alex Example\n'), false);
assert.equal(prepareModelValue({ id: 'cit', label: 'Citizenship', type: 'text' }, 'Singapore', 'Patient\nCitizenship: Foreigner\nApplicant\nCitizenship: Singapore\n'), 'Singapore Citizen');
assert.equal(accept({ id: 'cit', label: 'Citizenship', type: 'text' }, 'Singapore Citizen'), true);
assert.equal(accept({ id: 'addr', label: 'Address', type: 'text' }, 'Singapore'), false);
const bothPeople = 'Patient\nDate of birth: 01/01/1980\nApplicant\nDate of birth: 14/03/1992\n';
assert.equal(allowModelValue({ id: 'dob', label: 'Applicant date of birth', type: 'text' }, '01/01/1980', bothPeople), false);
assert.equal(prepareModelValue({ id: 'dob', label: 'Applicant date of birth', type: 'text' }, '14 March 1992', bothPeople), '14/03/1992');
const samePerson = 'Patient\nThe patient is the applicant.\nDate of birth: 14/03/1992\nNurse\nDate of birth: 01/01/1980\n';
assert.equal(allowModelValue({ id: 'dob', label: 'Date of birth', type: 'text' }, '14/03/1992', samePerson), true);
assert.equal(allowModelValue({ id: 'dob', label: 'Date of birth', type: 'text' }, '01/01/1980', samePerson), false);
const accounts = 'NRIC S1234567D\nPhone +65 8123 4567\nBank account number: 5566778899\n';
assert.equal(prepareModelValue({ id: 'bank', label: 'Bank account', type: 'text' }, '5566778899', accounts), '5566778899');
assert.equal(allowModelValue({ id: 'bank', label: 'Bank account', type: 'text' }, '1234567', accounts), false);
assert.equal(allowModelValue({ id: 'bank', label: 'Bank account', type: 'text' }, '81234567', accounts), false);
assert.equal(allowModelValue({ id: 'bank', label: 'Bank account', type: 'text' }, '667788', accounts), false);
assert.equal(prepareModelValue({ id: 'bank', label: 'Bank account', type: 'text' }, '12345678', 'Bank account number: 0012345678'), '0012345678');
assert.equal(allowModelValue({ id: 'bank', label: 'Bank account', type: 'text' }, 'Harbour Press', 'Employer: Harbour Press'), false);
assert.equal(allowModelValue({ id: 'bank', label: 'Bank account', type: 'text' }, '0012345678', 'Bank account number: 0012345678'), true);
assert.equal(allowModelValue({ id: 'bank', label: 'GIRO ledger', type: 'text' }, 'Harbour Press', 'Employer: Harbour Press'), false);
assert.equal(allowModelValue({ id: 'bank', label: 'Credit ledger', type: 'text' }, '0012345678', 'Ledger account 0012345678'), true);
const patientFirst = 'Patient\nFull name: Kim Voss\nDate of birth: 03/03/1977\nApplicant\nFull name: Ulf Sample\nEmail: ulf.sample22@example.com\nPhone: +65 80000022\n';
const patientFirstFacts = fromText(patientFirst);
assert.equal(patientFirstFacts.name, 'Ulf Sample');
assert.equal(patientFirstFacts.email, 'ulf.sample22@example.com');
assert.equal(patientFirstFacts.dob, undefined);
const twoApplicants = fromText('Applicant\nFull name: Ulf Sample\nApplicant\nFull name: Kim Voss\n');
assert.equal(twoApplicants.name, undefined);
assert.equal(twoApplicants.conflict, true);
const repeatedPhone = fromText('Applicant\nPhone: +65 80000022\nPhone: +65 80000023\n');
assert.equal(repeatedPhone.phone, undefined);
assert.equal(repeatedPhone.conflict, true);

assert.equal(modelScalar(null), '');
assert.equal(modelScalar('null'), '');
assert.equal(modelScalar('Not specified'), 'Not specified');
assert.deepEqual(coerceModelObject({ dob: null, citizenship: 'null', name: 'Alex Example' }), { dob: '', citizenship: '', name: 'Alex Example' });
console.log('facts tests ok');

// Supported false negatives, not model scores:
// - Singapore inferred from an address, a letterhead, or an NRIC prefix
// - an unlabeled citizenship line when the page also has a separate patient and applicant
// - two different explicit citizenship statements for the applicant
// - a premises line containing "No." is cut at that period
// - a date that is not in the applicant's own sentence or section when both a patient and an applicant are present
// - a bank number that drops, adds, or borrows digits, other than leading zeros
// - the printed answers Not specified, null, and n/a are left blank
// A mocked completeJson result is an integration check, not model accuracy.
const llm = readFileSync(new URL('./llm.js', import.meta.url), 'utf8');
assert.match(llm, /@mlc-ai\/web-llm@0\.2\.79/);
assert.match(llm, /type: 'string'/);
assert.match(llm, /required: required/);
assert.match(llm, /coerceModelObject/);
assert.doesNotMatch(llm, /\[\s*'string'\s*,\s*'null'\s*\]/);
console.log('schema stays WebLLM 0.2.79 string properties');
