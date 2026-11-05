import { createRequire } from 'module';
import assert from 'assert';

const require = createRequire(import.meta.url);
const { sanitize } = require('./sanitize.js');

const nric = { id: 'nric', label: 'NRIC / FIN', type: 'text' };
const name = { id: 'full_name', label: 'Full name', type: 'text' };
const phone = { id: 'phone', label: 'Phone', type: 'text' };
const email = { id: 'email', label: 'Email', type: 'text' };
const address = { id: 'address', label: 'Address', type: 'text' };
const dob = { id: 'dob', label: 'Date of birth', type: 'text' };
const nation = { id: 'nationality', label: 'Nationality', type: 'dropdown', options: ['Singaporean', 'Malaysian', 'Other'] };
const member = { id: 'member_type', label: 'Registering as', type: 'radio', options: ['Visitor', 'Member'] };
const consent = { id: 'consent', label: 'Consent', type: 'checkbox' };

const cases = [
  ['This is the NRIC: S1234567A', nric, 'S1234567A'],
  ['The name is Tan Wei Ming', name, 'Tan Wei Ming'],
  ['The name is Tan Wei Ming.', name, 'Tan Wei Ming'],
  ['"Tan Wei Ming"', name, 'Tan Wei Ming'],
  ['`Tan Wei Ming`', name, 'Tan Wei Ming'],
  ['**S1234567A**', nric, 'S1234567A'],
  ['Answer: +65 8123 4567', phone, '+65 8123 4567'],
  ['NRIC: S1234567D', nric, 'S1234567D'],
  ['The email address is wei.ming.tan@example.com.', email, 'wei.ming.tan@example.com'],
  ['I think the date of birth is 14 Mar 1992', dob, '14 Mar 1992'],
  ['The postal address provided is: 18 Lorong Chuan, #04-12, Singapore 556789', address, '18 Lorong Chuan, #04-12, Singapore 556789'],
  ['It looks like you have entered a note with no fact', name, ''],
  ['The nationality is Singaporean, I believe', nation, 'Singaporean'],
  ['They are registering as a Visitor', member, 'Visitor'],
  ['Martian', nation, ''],
  ['Yes, they agree to the rules', consent, 'yes'],
  ['no', consent, 'no']
];

var failed = 0;
cases.forEach(function (row) {
  var got = sanitize(row[0], row[1]);
  if (got !== row[2]) {
    failed++;
    console.error('FAIL', JSON.stringify(row[0]), '=>', JSON.stringify(got), 'expected', JSON.stringify(row[2]));
  }
});
assert.strictEqual(failed, 0);
console.log('sanitize tests passed', cases.length);
