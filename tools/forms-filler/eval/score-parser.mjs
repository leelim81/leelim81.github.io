/* Parser-only score for the frozen synthetic persona.
   This does not call a model and must not be reported as model accuracy. */
import { createRequire } from 'module';
import assert from 'assert';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { fromText, mapFactsToFields } = require('../facts.js');
const gold = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'gold-synthetic.json'), 'utf8'));
const facts = fromText(gold.text);
const fields = [
  { id: 'full', label: 'Full Name', type: 'text' },
  { id: 'first', label: 'First Name', type: 'text' },
  { id: 'last', label: 'Last Name', type: 'text' },
  { id: 'nric', label: 'NRIC NO', type: 'text' },
  { id: 'dob', label: 'Date of Birth', type: 'text' },
  { id: 'addr', label: 'Address', type: 'text' },
  { id: 'hp', label: 'H/P NO', type: 'text' },
  { id: 'email', label: 'Email', type: 'text' },
  { id: 'company', label: 'Business name', type: 'text' },
  { id: 'sign', label: 'Signature of Applicant', type: 'text' },
  { id: 'citizen', label: 'Singapore Citizen', type: 'radio' }
];
const mapped = mapFactsToFields(facts, fields);
let correct = 0;
let missed = 0;
const wrong = [];
Object.keys(gold.expect).forEach(function (key) {
  if (facts[key] === gold.expect[key]) correct += 1;
  else missed += 1;
});
if (mapped.sign) wrong.push('signature');
if (mapped.citizen) wrong.push('citizenship');
if (mapped.first !== 'Alex' || mapped.last !== 'Example') wrong.push('name-parts');
const report = {
  task: 'parser-only',
  model: null,
  correct_facts: correct,
  fact_keys: Object.keys(gold.expect).length,
  missed_facts: missed,
  wrong_fills: wrong,
  mapped: mapped
};
console.log(JSON.stringify(report, null, 2));
assert.equal(missed, 0);
assert.equal(wrong.length, 0);
assert.equal(mapped.full, 'Alex Example');
assert.equal(mapped.addr, '10 EXAMPLE ROAD #04-12 123456');
