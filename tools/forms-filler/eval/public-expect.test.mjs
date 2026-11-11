import assert from 'assert';
import { expectValue, mustBeEmpty, isUsZip } from './public-expect.mjs';
import { people } from './public-people.mjs';

const alex = people.find((person) => person.id === 'alex');
const tan = people.find((person) => person.id === 'tan');
const nurul = people.find((person) => person.id === 'nurul');
const post = { id: 'post_code', label: 'Post Code:', page: 1 };
const home = { id: 'home', label: 'Permanent Address', page: 1 };
assert.equal(expectValue(post, alex, [post, home]).value, '123456');
assert.equal(expectValue(post, tan, [post, home]).value, '018956');
assert.equal(expectValue(post, nurul, [post, home]).value, '');
assert.equal(expectValue({ id: 'nom', label: 'Present Address:', section: 'Nominee Details' }, alex, []).value, '');
assert.equal(mustBeEmpty({ label: 'Signature of Employer or AR' }), 'signature');
assert.equal(mustBeEmpty({ label: 'Phone Banking Account No' }), 'account');
assert.equal(mustBeEmpty({ label: "Employer's name and address", section: 'Employers' }), 'employer');
const i9 = [
  { id: 'addr', label: 'Address (Street Number and Name)', page: 0 },
  { id: 'city', label: 'City or Town', page: 0 },
  { id: 'state', label: 'State', page: 0 },
  { id: 'zip', label: 'ZIP Code', page: 0, maxLen: 6, tooltip: 'Enter ZIP Code' }
];
assert.equal(isUsZip(i9[3], i9), true);
assert.equal(expectValue(i9[3], tan, i9).value, '');
assert.equal(expectValue(i9[0], tan, i9).value, '88 EXAMPLE WALK #12-34 SINGAPORE 018956');
assert.equal(expectValue({ id: 'prep', label: 'Preparer or Translator Last Name (Family Name) 0' }, alex, []).value, '');
assert.equal(expectValue({ id: 'bangla', label: 'Name of Accountholder in Bangla:' }, alex, []).value, '');
assert.equal(expectValue({ id: 'en', label: 'Name of Accountholder in English:' }, alex, []).value, 'Alex Example');
assert.equal(expectValue({ id: 'mail', label: 'Mailing address (if different from above)' }, alex, []).value, '');
assert.equal(expectValue({ id: 'perm', label: 'Permanent residence address (street, apt. or suite no.)', section: 'Identification of Beneficial Owner' }, alex, []).value, '10 EXAMPLE ROAD #04-12');
console.log('public expect ok');
