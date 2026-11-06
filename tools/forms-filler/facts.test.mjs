import { createRequire } from 'module';
import assert from 'assert';

const require = createRequire(import.meta.url);
const { fromText, mapFactsToFields, accept, modelFields, preview } = require('./facts.js');

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
assert.equal(noted.residential, undefined);
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

console.log('facts tests ok');
