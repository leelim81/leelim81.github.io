import { createRequire } from 'module';
import { readFileSync } from 'fs';
import assert from 'assert';

const require = createRequire(import.meta.url);
const { fromText, mapFactsToFields, accept, modelFields, preview, allowModelValue, prepareModelValue, modelScalar, coerceModelObject, nricChecksum, identityRead, identityVote } = require('./facts.js');

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
assert.equal(nricChecksum('S1234567D'), true);
assert.equal(nricChecksum('S1234567E'), false);
assert.equal(nricChecksum('T1680536F'), true);
assert.equal(nricChecksum('F5221211K'), true);
assert.equal(nricChecksum('G8169811U'), true);
assert.equal(nricChecksum('M9612050P'), true);
assert.equal(nricChecksum('M2200054X'), true);
assert.equal(nricChecksum('M1234567K'), true);
assert.equal(nricChecksum('M9612050Q'), false);
assert.equal(nricChecksum('M1234567B'), false);
const partialName = identityVote([
  { name: 'WEI MING', nric: 'S1234567D', nricValid: true, nameConf: 90 },
  { name: 'TAN WEI MING', nric: 'S1234567D', nricValid: true, nameConf: 80 },
  { name: 'WEI MING', nric: 'S1234567D', nricValid: true, nameConf: 90 }
]);
assert.equal(partialName.name, 'WEI MING');
assert.equal(partialName.nameUnconfirmed, true);
assert.equal(partialName.nric, 'S1234567D');

const unlabeledCard = `REPUBLIC OF SINGAPORE
IDENTITY CARD NO. S1234567D
ab
TANG WEI MING
(ALEX KENNETH)
| Ab
Race`;
const unlabeledRead = identityRead(unlabeledCard);
assert.equal(unlabeledRead.name, 'TANG WEI MING (ALEX KENNETH)');
assert.equal(unlabeledRead.namePlain, 'TANG WEI MING');
assert.equal(unlabeledRead.nameAlias, 'ALEX KENNETH');
assert.equal(unlabeledRead.unlabeled, true);
assert.equal(unlabeledRead.nameChecked, false);
assert.equal(fromText(unlabeledCard).name, 'TANG WEI MING (ALEX KENNETH)');
const unlabeledVote = identityVote([unlabeledRead, unlabeledRead]);
assert.equal(unlabeledVote.name, 'TANG WEI MING (ALEX KENNETH)');
assert.equal(unlabeledVote.nameChecked, false);
assert.equal(unlabeledVote.nric, 'S1234567D');
assert.equal(unlabeledVote.nricChecked, true);
function assertNoAlias(text) {
  const read = identityRead(text);
  assert.equal(read.name, 'TANG WEI MING');
  assert.equal(read.nameAlias, '');
  assert.equal(read.nameRepaired, '');
}
assertNoAlias('TANG WEI MING\n(RACE)\n');
assertNoAlias('TANG WEI MING\n(ALEX 9KENNETH)\n');
assertNoAlias('TANG WEI MING\n(99/99/9999\n');
assertNoAlias('TANG WEI MING\nRace\n(ALEX KENNETH)\n');
assertNoAlias('TANG WEI MING\n(ALEX KENNETH\n');
const plainFallback = identityVote([
  identityRead('TANG WEI MING\nS1234567D\n'),
  identityRead('TANG WEI MING\nS1234567D\n')
]);
assert.equal(plainFallback.name, 'TANG WEI MING');
assert.equal(plainFallback.nameChecked, false);
const labeledVote = identityVote([
  identityRead('Name\nTAN WEI MING\nS1234567D\n'),
  identityRead('Name\nTAN WEI MING\nS1234567D\n')
]);
assert.equal(labeledVote.name, 'TAN WEI MING');
assert.equal(labeledVote.nameChecked, true);
assert.equal(labeledVote.nricChecked, true);
[
  ['15 JAN 1990', '15-01-1990'],
  ['15 January 1990', '15-01-1990'],
  ['15/01/1990', '15-01-1990'],
  ['15-01-1990', '15-01-1990'],
  ['15.01.1990', '15-01-1990'],
  ['15 01 1990', '15-01-1990']
].forEach(function (pair) {
  assert.equal(identityRead('Date of birth\n' + pair[0] + '\n').dob, pair[1], pair[0]);
});
assert.equal(identityRead('Date of birth\n31 FEB 1990\n').dob, '');
assert.equal(identityRead('Date of birth\n01 JAN 2099\n').dob, '');
assert.equal(identityRead('Date of issue\n02 FEB 2020\n').dob, '');
assert.equal(identityRead('Sex\nM\n').sex, 'M');
assert.equal(identityRead('Sex\nFemale\n').sex, 'F');
assert.equal(identityRead('Nationality\nSINGAPORE CITIZEN\n').nationality, 'Singapore citizen');
assert.equal(identityRead('REPUBLIC OF SINGAPORE\nName\nTAN WEI MING\n').nationality, '');
assert.equal(identityRead('Race\nCHINESE\n').race, 'Chinese');
assert.equal(identityRead('Country of birth\nMALAYSIA\n').birthCountry, 'MALAYSIA');
const backCard = identityRead('IDENTITY CARD\nBACK\nAddress\nBLK 88 EXAMPLE WALK\n#12-34\nSINGAPORE 018956\n');
assert.equal(backCard.blk, '88');
assert.equal(backCard.street, 'EXAMPLE WALK');
assert.equal(backCard.unit, '12-34');
assert.equal(backCard.postal, '018956');
assert.equal(backCard.nric, '');
assert.equal(backCard.name, '');
const onePass = identityRead('Date of birth\n15 JAN 1990\nSex\nM\n');
assert.equal(identityVote([onePass]).dobChecked, false);
assert.equal(identityVote([onePass, onePass]).dob, '15-01-1990');
assert.equal(identityVote([onePass, onePass]).dobChecked, true);
assert.equal(identityVote([onePass, onePass]).sexChecked, true);
assert.equal(identityRead('Date of issue 02 AUG 2015 Date of birth 15 JAN 1990').dob, '15-01-1990');
assert.equal(identityRead('Date of birth Sex Nationality\n15 JAN 1990 M SINGAPORE CITIZEN\n').dob, '15-01-1990');
assert.equal(identityRead('Date of birth Sex Nationality\n15 JAN 1990 M SINGAPORE CITIZEN\n').sex, 'M');
assert.equal(identityRead('x Date of Buth Sex\n12-03-1990 M\n').dob, '12-03-1990');
assert.equal(identityRead('Date of Sex\n12-03-1990 M\n').dob, '12-03-1990');
assert.equal(identityRead('9 Blood Group Date of issue\n01-02-2010\n').dob, '');
assert.equal(identityRead('Date of expiry\n02 AUG 2015\n').dob, '');
assert.equal(identityRead('Sex\nMale\n').sex, 'M');
assert.equal(identityRead('Sex\nName M TAN\n').sex, '');
assert.equal(identityRead('Sex Male / Female').sex, '');
assert.equal(identityRead('Nationality\nTAN WEI MING\n').nationality, '');
assert.equal(identityRead('Nationality\nCountry of birth\n').nationality, '');
assert.equal(identityRead('Country of Brrth\n&\nXX MADEUPLAND\n').birthCountry, 'MADEUPLAND');
assert.equal(identityRead('Country of\nMADEUPLAND\n').birthCountry, 'MADEUPLAND');
assert.equal(identityRead('Country of Birth\n|\nx\n').birthCountry, '');
const leadBlock = identityRead('APT BLK 1234 TESTVILLE NORTH AVE #12-345\nSINGAPORE 123456\n');
assert.equal(leadBlock.street, 'TESTVILLE NORTH AVE');
assert.equal(leadBlock.blk, '1234');
assert.equal(leadBlock.blkUnconfirmed, true);
assert.equal(leadBlock.unit, '12-345');
assert.equal(leadBlock.postal, '123456');
assert.equal(leadBlock.address, '');
const lostHash = identityRead('APT BLK 123 TESTVILLE NORTH AVE 112-34\n');
assert.equal(lostHash.street, 'TESTVILLE NORTH AVE');
assert.equal(lostHash.blk, '123');
assert.equal(lostHash.unit, '');
const partialHome = identityRead('#12-345 SINGAPORE 123456\n');
assert.equal(partialHome.address, '');
assert.equal(partialHome.postal, '123456');
const serialFirst = identityRead('SERIAL 482913\nBLK 88 EXAMPLE WALK\n#12-34\nSINGAPORE 018956\n');
assert.equal(serialFirst.postal, '018956');
assert.equal(serialFirst.address, '88 EXAMPLE WALK #12-34 SINGAPORE 018956');
assert.equal(identityRead('IDENTITY CARD\n482913\nCAN 100001\n').postal, '');
assert.equal(identityRead('Name\nTAN AH KOW (JOHN LANE)\nS1234567D\n').street, '');
assert.equal(identityRead('MARY CLOSE\n').street, '');
const fourDigit = identityRead('APT BLK 1234 TESTVILLE NORTH AVE #12-345\nSINGAPORE 123456\n');
const fourVote = identityVote([fourDigit, fourDigit]);
assert.equal(fourVote.blk, '1234');
assert.equal(fourVote.blkChecked, false);
assert.equal(fourVote.blkUnconfirmed, true);
assert.equal(fourVote.address, '');
assert.equal(fourVote.addressChecked, false);
const otherFour = identityRead('APT BLK 4321 TESTVILLE NORTH AVE #12-345\nSINGAPORE 123456\n');
const tiedBlock = identityVote([fourDigit, otherFour]);
assert.equal(tiedBlock.blk, '1234');
assert.equal(tiedBlock.blkChecked, false);
assert.equal(tiedBlock.blkUnconfirmed, true);
assert.equal(tiedBlock.address, '');
const oneHome = identityVote([identityRead('BLK 88 EXAMPLE WALK\n#12-34\nSINGAPORE 018956\n')]);
assert.equal(oneHome.address, '88 EXAMPLE WALK #12-34 SINGAPORE 018956');
assert.equal(oneHome.blkUnconfirmed, false);
assert.equal(oneHome.addressChecked, false);
assert.equal(identityVote([fourDigit]).address, '');
const inlineHome = identityRead('BLK 10 ORCHARD ROAD #04-12 SINGAPORE 238801\n');
assert.equal(inlineHome.blk, '10');
assert.equal(inlineHome.street, 'ORCHARD ROAD');
assert.equal(inlineHome.unit, '04-12');
assert.equal(inlineHome.postal, '238801');
assert.equal(identityRead('S8523146D\n018956\n').postal, '');
assert.equal(identityRead('S 018956\n').postal, '018956');
assert.equal(identityRead('SINGAPORE 018956\n482913\n').postal, '018956');
assert.equal(identityRead('Country of residence\nSINGAPORE\n').birthCountry, '');
assert.equal(identityRead('Country of residence').birthCountry, '');
assert.equal(identityRead('Country of origin').birthCountry, '');
assert.equal(identityRead('Country of origin\norigin').birthCountry, '');
assert.equal(identityRead('Country of nationality\n').birthCountry, '');
assert.equal(identityRead('Place of issue\n02 JAN 2010\n').birthCountry, '');
const houseCres = identityRead('12 EXAMPLE CRES #04-12\nSINGAPORE 123456\n');
assert.equal(houseCres.blk, '12');
assert.equal(houseCres.street, 'EXAMPLE CRES');
assert.equal(houseCres.unit, '04-12');
assert.equal(houseCres.postal, '123456');
assert.equal(houseCres.address, '12 EXAMPLE CRES #04-12 SINGAPORE 123456');
assert.equal(identityRead('8 EXAMPLE CL SINGAPORE 222222').street, 'EXAMPLE CL');
assert.equal(identityRead('8 EXAMPLE CL SINGAPORE 222222').blk, '8');
assert.equal(identityRead('9 EXAMPLE TER #01-09 SINGAPORE 333333').street, 'EXAMPLE TER');
assert.equal(identityRead('15 EXAMPLE AV SINGAPORE 444444').street, 'EXAMPLE AV');
assert.equal(identityRead('12A EXAMPLE CRES #02-01 SINGAPORE 555555').blk, '12A');
const unsureHouse = identityRead('1234 EXAMPLE RD #01-02\nSINGAPORE 111111\n');
assert.equal(unsureHouse.blk, '');
assert.equal(unsureHouse.street, '');
assert.equal(unsureHouse.address, '');
const fiveHouse = identityRead('12345 EXAMPLE AV #01-02 SINGAPORE 111111');
assert.equal(fiveHouse.blk, '');
assert.equal(fiveHouse.street, '');
['JOHN LANE', 'MARY CLOSE'].forEach(function (alias) {
  const front = identityRead('Name\nTAN AH KOW (' + alias + ')\nS8523146D\n');
  const back = identityRead(alias + ' #12-34\nSINGAPORE 018956\n');
  assert.equal(back.street, '', alias);
  const voted = identityVote([front, back]);
  assert.equal(voted.nameAlias, alias, alias);
  assert.equal(voted.street, '', alias);
  assert.equal(voted.address, '', alias);
  const keptRoad = identityVote([front, identityRead('BLK 88 EXAMPLE RD\n#12-34\nSINGAPORE 018956\n')]);
  assert.equal(keptRoad.street, 'EXAMPLE RD', alias);
  assert.equal(keptRoad.address, '88 EXAMPLE RD #12-34 SINGAPORE 018956', alias);
});
const fiveDigit = identityRead('BLK 12345 EXAMPLE RD\n#12-34\nSINGAPORE 018956\n');
assert.equal(fiveDigit.blk, '');
assert.equal(fiveDigit.street, '');
assert.equal(fiveDigit.address, '');
const bareBlock = identityRead('BLK 88\nEXAMPLE RD\n#12-34\nSINGAPORE 018956\n');
assert.equal(bareBlock.blk, '88');
assert.equal(bareBlock.street, 'EXAMPLE RD');
assert.equal(bareBlock.unit, '12-34');
assert.equal(bareBlock.postal, '018956');
assert.equal(bareBlock.address, '88 EXAMPLE RD #12-34 SINGAPORE 018956');
assert.equal(identityRead('BLOCK 12A\nEXAMPLE WALK\n#01-02\nSINGAPORE 123456\n').blk, '12A');
assert.equal(identityRead('BLK 88\nDate of issue 02 AUG 2015\n').blk, '');
assert.equal(identityRead('BLK 88\nJOHN LANE\n#12-34\nSINGAPORE 018956\n').blk, '');
assert.equal(identityRead('BLK 88\nMARY CLOSE\n').street, '');
assert.equal(identityRead('BLK 12345\nEXAMPLE RD\nSINGAPORE 018956\n').blk, '');
const bareFour = identityRead('BLK 1234\nEXAMPLE RD\n#12-34\nSINGAPORE 018956\n');
assert.equal(bareFour.blk, '1234');
assert.equal(bareFour.blkUnconfirmed, true);
assert.equal(bareFour.street, 'EXAMPLE RD');
const bareVote = identityVote([bareBlock, bareBlock]);
assert.equal(bareVote.blk, '88');
assert.equal(bareVote.blkChecked, true);
assert.equal(identityVote([bareBlock]).blkChecked, false);
assert.equal(identityRead('EXAMPLE RD #12-34').street, 'EXAMPLE RD');
assert.equal(identityRead('EXAMPLE RD #12-34').postal, '');
assert.equal(identityRead('JOHN LANE #12-34').street, '');
assert.equal(identityRead('MARY CLOSE #12-34').street, '');
const nextPostal = identityRead('EXAMPLE RD #12-34\nSINGAPORE 018956\n');
assert.equal(nextPostal.street, 'EXAMPLE RD');
assert.equal(nextPostal.postal, '018956');
assert.equal(nextPostal.unit, '12-34');
assert.equal(identityRead('JOHN LANE #12-34\nSINGAPORE 018956\n').street, '');
assert.equal(identityRead('MARY CLOSE #12-34\nSINGAPORE 018956\n').street, '');
assert.equal(identityRead('JOHN LANE SINGAPORE 018956').street, '');
assert.equal(identityRead('EXAMPLE RD SINGAPORE 018956').street, '');
assert.equal(identityRead('EXAMPLE RD #12-34 SINGAPORE 018956').street, 'EXAMPLE RD');
assert.equal(identityRead('12 EXAMPLE RD SINGAPORE 018956').street, 'EXAMPLE RD');
assert.equal(identityRead('12 EXAMPLE RD SINGAPORE 018956').blk, '12');
assert.equal(identityRead('EXAMPLE RD\nSINGAPORE 018956\n').street, '');
assert.equal(identityRead('TAN WEI MING #12-34\nSINGAPORE 018956\n').street, '');
assert.equal(identityRead('Name\nTAN AH KOW (JOHN LANE)\nBLK 88 JOHN LANE\n#12-34\nSINGAPORE 018956\n').street, 'JOHN LANE');
assert.equal(identityRead('12 EXAMPLE PL').blk, '12');
assert.equal(identityRead('12 EXAMPLE PL').street, 'EXAMPLE PL');
assert.equal(identityRead('EXAMPLE GDNS SINGAPORE 121212').street, '');
assert.equal(identityRead('EXAMPLE GDNS #01-02 SINGAPORE 121212').street, 'EXAMPLE GDNS');
assert.equal(identityRead('EXAMPLE HTS #02-03 SINGAPORE 131313').street, 'EXAMPLE HTS');
assert.equal(identityRead('EXAMPLE CTRL #03-04 SINGAPORE 141414').street, 'EXAMPLE CTRL');
assert.equal(identityRead('Date of birth\n15 JAN 1990\nDate of issue 02 AUG 2015\n').dob, '15-01-1990');
const aliasBlk = identityVote([
  identityRead('Name\nTAN AH KOW (JOHN LANE)\nS8523146D\n'),
  identityRead('BLK 88 JOHN LANE\n#12-34\nSINGAPORE 018956\n')
]);
assert.equal(aliasBlk.street, 'JOHN LANE');
assert.equal(aliasBlk.address, '88 JOHN LANE #12-34 SINGAPORE 018956');
const aliasPostal = identityVote([
  identityRead('Name\nTAN AH KOW (MARY CLOSE)\nS8523146D\n'),
  identityRead('MARY CLOSE SINGAPORE 018956\n')
]);
assert.equal(aliasPostal.street, '');
assert.equal(identityRead('Date of birth\nDate of issue 02 AUG 2015\n').dob, '');
assert.equal(identityRead('Date of birth\n02 AUG 2015 Date of expiry\n').dob, '');
assert.equal(identityRead('Date of birth\n15 JAN 1990\nDate of issue\n02 AUG 2015\n').dob, '15-01-1990');
['EXAMPLE RD', 'EXAMPLE ST', 'EXAMPLE DR', 'JLN EXAMPLE', 'LOR EXAMPLE', 'TESTVILLE NORTH GREEN'].forEach(function (street) {
  const back = identityRead('IDENTITY CARD\nBACK\nAddress\nBLK 88 ' + street + '\n#12-34\nSINGAPORE 018956\n');
  assert.equal(back.street, street, street);
  assert.equal(back.name, '', street);
  assert.equal(back.address, '88 ' + street + ' #12-34 SINGAPORE 018956', street);
  const front = identityRead('Name\nTAN WEI MING\nS8523146D\n');
  const both = identityVote([front, back]);
  assert.equal(both.name, 'TAN WEI MING', street);
  assert.equal(both.street, street, 'vote ' + street);
  assert.equal(both.address, '88 ' + street + ' #12-34 SINGAPORE 018956', 'vote ' + street);
});

function assertAlias(text, alias) {
  const read = identityRead(text);
  assert.equal(read.nameAlias, alias);
  assert.equal(read.name, 'TAN WEI MING (' + alias + ')');
}
assertAlias('Name\nTAN WEI MING (MALAN)\nS1234567D\n', 'MALAN');
assertAlias('Name\nTAN WEI MING (NOOR)\nS1234567D\n', 'NOOR');
assertAlias('Name\nTAN WEI MING (STACEY)\nS1234567D\n', 'STACEY');
assertAlias('Name\nTAN WEI MING (AUGUST)\nS1234567D\n', 'AUGUST');
assertAlias('Name\nTAN WEI MING (ST JOHN)\nS1234567D\n', 'ST JOHN');
assertAlias('Name\nTAN WEI MING\n(ST JOHN)\nS1234567D\n', 'ST JOHN');
const placeAliases = [
  'ORCHARD ROAD', 'ORCHARD RD', 'BLK 123', 'SINGAPORE', 'EXAMPLE STREET',
  'EXAMPLE ST', 'EXAMPLE AVENUE', 'EXAMPLE AVE', 'EXAMPLE DRIVE', 'EXAMPLE DR',
  'EXAMPLE LANE', 'EXAMPLE CRESCENT', 'EXAMPLE CLOSE', 'EXAMPLE PLACE',
  'EXAMPLE WALK', 'EXAMPLE TERRACE', 'BLOCK', 'BEDOK LANE', 'TANJONG WALK'
];
placeAliases.forEach(function (label) {
  const same = identityRead('Name\nTAN WEI MING (' + label + ')\nS1234567D\n');
  assert.equal(same.name, 'TAN WEI MING', label);
  assert.equal(same.nameAlias, '', label);
  assert.equal(same.nameRepaired, '', label);
  const next = identityRead('Name\nTAN WEI MING\n(' + label + ')\nS1234567D\n');
  assert.equal(next.name, 'TAN WEI MING', 'next ' + label);
  assert.equal(next.nameAlias, '', 'next ' + label);
  const bare = identityRead('TANG WEI MING\n(' + label + ')\n');
  assert.equal(bare.nameAlias, '', 'unlabeled ' + label);
  assert.equal(bare.nameRepaired, '', 'unlabeled ' + label);
});
function assertKeptAlias(text, plain, alias) {
  const read = identityRead(text);
  assert.equal(read.namePlain, plain, text);
  assert.equal(read.nameAlias, alias, text);
  assert.equal(read.name, plain + ' (' + alias + ')', text);
}
assertKeptAlias('Name\nTAN AH KOW (JOHN LANE)\nS1234567D\n', 'TAN AH KOW', 'JOHN LANE');
assertKeptAlias('Name\nTAN AH KOW\n(JOHN LANE)\nS1234567D\n', 'TAN AH KOW', 'JOHN LANE');
assertKeptAlias('Name\nTAN AH KOW (MARY CLOSE)\nS1234567D\n', 'TAN AH KOW', 'MARY CLOSE');
assertKeptAlias('Name\nTAN AH KOW\n(MARY CLOSE)\nS1234567D\n', 'TAN AH KOW', 'MARY CLOSE');
assertKeptAlias('TANG WEI MING\n(JOHN LANE)\n', 'TANG WEI MING', 'JOHN LANE');
assert.equal(identityRead('Name\nTAN AH KOW (ANN DRIVE)\nS1234567D\n').nameAlias, 'ANN DRIVE');
assert.equal(identityRead('Name\nTAN AH KOW (LEE WALK)\nS1234567D\n').nameAlias, 'LEE WALK');
assert.equal(fromText('44 HARBOUR LANE 161616').name, undefined);
assert.equal(fromText('12 HARBOUR LANE #04-12 111111').name, undefined);
assert.equal(fromText('3 RIVER CLOSE #08-03 555555').name, undefined);
assert.equal(fromText('5 RECORD LANE #08-05 191919').name, undefined);
assert.equal(identityRead('10 EXAMPLE LANE\nSINGAPORE 123456\n').name, '');
assert.equal(identityRead('Name\nTAN WEI MING (44 HARBOUR LANE)\nS1234567D\n').nameAlias, '');
assert.equal(identityRead('Name\nTAN WEI MING (HARBOUR LANE)\nS1234567D\n').nameAlias, '');
assert.equal(identityRead('Name\nTAN WEI MING (CEDAR WALK)\nS1234567D\n').nameAlias, '');
assert.equal(identityRead('Name\nTAN WEI MING (RIVER CLOSE)\nS1234567D\n').nameAlias, '');
assert.equal(identityRead('Name\nTAN WEI MING (DOCK LANE)\nS1234567D\n').nameAlias, '');
assert.equal(identityRead('Name\nTAN WEI MING (CLINIC DRIVE)\nS1234567D\n').nameAlias, '');
assert.equal(identityRead('Name\nTAN WEI MING (10 EXAMPLE LANE)\nS1234567D\n').name, 'TAN WEI MING');
assert.equal(fromText('Premises: 10 EXAMPLE LANE 018956\n').name, undefined);
assert.equal(fromText('Premises: 10 EXAMPLE LANE 018956\n').address, '10 EXAMPLE LANE 018956');

const truncated = identityRead('Name\nTAN WEI\nMING\nS1234567D\n');
assert.equal(truncated.name, 'TAN WEI');
assert.equal(truncated.nameBelow, true);
assert.equal(truncated.labeled, true);
const truncatedVote = identityVote([truncated, truncated]);
assert.equal(truncatedVote.name, 'TAN WEI');
assert.equal(truncatedVote.nameChecked, false);
const extraLine = identityRead('Name\nTAN WEI MING\nCHEN WEIMING\nS1234567D\n');
assert.equal(extraLine.name, 'TAN WEI MING');
assert.equal(extraLine.nameBelow, true);
const extraVote = identityVote([extraLine, extraLine]);
assert.equal(extraVote.nameChecked, false);
const mixedCount = identityVote([
  identityRead('Name\nTAN WEI MING\nS1234567D\n'),
  identityRead('Name\nTAN WEI\nS1234567D\n')
]);
assert.equal(mixedCount.nameChecked, false);
const oneToken = identityVote([
  { name: 'MING', labeled: true, nric: 'S1234567D', nricValid: true, nameTokens: 1 },
  { name: 'MING', labeled: true, nric: 'S1234567D', nricValid: true, nameTokens: 1 }
]);
assert.equal(oneToken.name, 'MING');
assert.equal(oneToken.nameChecked, false);
const complete = identityVote([
  identityRead('Name\nTAN WEI MING\nS1234567D\n'),
  identityRead('Name\nTAN WEI MING\nS1234567D\n')
]);
assert.equal(complete.name, 'TAN WEI MING');
assert.equal(complete.nameBelow, undefined);
assert.equal(complete.nameChecked, true);
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
