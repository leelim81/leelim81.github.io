import { createRequire } from 'module';
import assert from 'assert';

const require = createRequire(import.meta.url);
const { fromText, mapFactsToFields, accept } = require('./facts.js');

const ocr = `REPUBLIC OF SINGAPORE
IDENTITY CARD NO. S1234567D
CHAN HUI HONG
(ZENG HUIFENG)
Race
CHINESE
Date of Birth Sex
26-03-1981 F
APT BLK 279B SENGKANG EAST AVE #15-549
542279
NRIC No: ~$12345670 Date: 02/08/2015`;

const facts = fromText(ocr);
assert.equal(facts.name, 'CHAN HUI HONG');
assert.equal(facts.nric, 'S1234567D');
assert.equal(facts.dob, '26/03/1981');
assert.equal(facts.sex, 'Female');
assert.equal(facts.race, 'Chinese');
assert.equal(facts.blk, '279B');
assert.equal(facts.street, 'SENGKANG EAST AVE');
assert.equal(facts.unit, '15-549');
assert.equal(facts.postal, '542279');
assert.equal(facts.residential, 'Singapore Citizen');

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
assert.equal(mapped.full_name, 'CHAN HUI HONG');
assert.equal(mapped.street, 'SENGKANG EAST AVE');
assert.notEqual(mapped.street, facts.name);
assert.equal(mapped.nric, 'S1234567D');
assert.equal(mapped.dob, '26/03/1981');
assert.equal(mapped.blk, '279B');
assert.equal(mapped.unit, '15-549');
assert.equal(mapped.postal, '542279');
assert.equal(mapped.female, 'Female');
assert.equal(mapped.male, undefined);
assert.equal(mapped.chinese, 'Chinese');
assert.equal(mapped.malay, undefined);
assert.equal(mapped.citizen, 'Singapore Citizen');
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

console.log('facts tests ok');
