/* Layouts copied from the public PDFs. The files themselves are not committed. */
import assert from 'assert';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { decideAll } = require('./select.js');

const packet = `Applicant
Full name: Ada Lane
NRIC: S1234567D
Address: 10 Example Road
`;
const open = { autofill: { name: true, nric: true, address: true, given: true, surname: true } };
const NAME = 'Ada Lane';

function placed(fields) {
  return Object.fromEntries(decideAll(fields, packet, open).map((row) => [row.fieldId, row]));
}
function text(x, y, w, str) {
  return { x: x, y: y, w: w, h: 9, str: str };
}
function field(id, label, x, y, w, h, texts) {
  return { id: id, label: label, type: 'text', page: 0, rect: { x: x, y: y, width: w, height: h }, pageTexts: texts, texts: texts };
}

const tenancyTexts = [
  text(63, 632, 117, 'Full Name of Applicant (IN'),
  text(218, 394, 160, 'Particulars of Intended Occupiers'),
  text(63, 380, 27, 'Name'),
  text(140, 380, 49, 'Citizenship'),
  text(257, 380, 17, 'Sex')
];
const tenancy = placed([
  field('occ', 'Name', 58, 362, 153, 12, tenancyTexts)
]);
assert.equal(tenancy.occ.value, '', 'tenancy occupant name');
assert.equal(tenancy.occ.refusal, 'other-person');

[
  'PARTICULARS OF APPLICANT (PLEASE COMPLETE IN BLOCK LETTERS)',
  'APPLICANT DETAILS (PLEASE USE BLOCK LETTERS)'
].forEach(function (title) {
  const texts = [
    text(40, 520, 140, 'Particulars of Occupiers'),
    text(40, 430, 280, title),
    text(40, 380, 27, 'Name')
  ];
  const rows = placed([
    field('occ', 'Name', 40, 470, 160, 12, texts),
    field('app', 'Name', 40, 360, 180, 14, texts)
  ]);
  assert.equal(rows.occ.value, '', title + ' occupier');
  assert.equal(rows.occ.refusal, 'other-person', title);
  assert.equal(rows.app.value, NAME, title);
  assert.equal(rows.app.decision, 'review', title);
});

const dbsTexts = [
  text(105, 529, 55, '1st Applicant'),
  text(373, 529, 59, '2nd Applicant'),
  text(86, 465, 201, '(Name on debit card not to exceed 20 characters including blank spaces)'),
  text(407, 364, 38, 'Nominee'),
  text(85, 353, 48, 'Distinguishing'),
  text(261, 353, 20, 'Name'),
  text(331, 353, 27, 'Address'),
  text(411, 353, 59, 'Relationship with')
];
const dbs = placed([
  field('card', 'Name', 86, 474, 201, 12, dbsTexts),
  field('nom', 'Name', 285, 354, 43, 12, dbsTexts)
]);
assert.equal(dbs.card.value, '', 'DBS debit-card name');
assert.equal(dbs.card.reason, 'card_imprint');
assert.equal(dbs.nom.value, '', 'DBS nominee name');
assert.equal(dbs.nom.refusal, 'other-person');

const f24 = placed([
  field('name', 'Name', 181, 115, 386, 25, [text(73, 155, 159, 'personal particulars and signature.')]),
  { id: 'sign', label: "Taxpayers' Signature", type: 'text', page: 0, rect: { x: 334, y: 64, width: 233, height: 39 } }
]);
assert.equal(f24.name.value, '', 'F24 name above the signature');
assert.equal(f24.name.refusal, 'signature');

const qcrTexts = [
  text(117, 489, 23, 'Child'),
  text(153, 489, 63, 'Name of Child'),
  text(241, 489, 87, 'Child NRIC Number'),
  text(355, 489, 23, 'State'),
  text(126, 425, 17, 'child'),
  text(161, 435, 48, 'Ashley Chua')
];
const qcr = placed([
  field('name', 'Name', 138, 304, 395, 11, qcrTexts)
]);
assert.equal(qcr.name.value, NAME, 'QCR applicant name');
assert.equal(qcr.name.decision, 'review');

const w4Texts = [
  text(122, 734, 369, 'Complete Form W-4 so that your employer can withhold the correct federal income tax from your pay.'),
  text(243, 723, 126, 'Give Form W-4 to your employer.'),
  text(36, 66, 48, 'Employers'),
  text(98, 68, 140, "Employer's name and address")
];
const w4 = placed([
  field('first', 'First name and middle initial', 95, 684, 178, 14, w4Texts),
  field('addr', 'Address', 95, 660, 380, 14, w4Texts),
  field('er', "Employer's name and address", 95, 36, 293, 30, w4Texts)
]);
assert.notEqual(w4.first.refusal, 'other-person', 'W-4 first name');
assert.equal(w4.addr.value, '10 Example Road', 'W-4 address');
assert.equal(w4.er.value, '', 'W-4 employer address');

const w9 = placed([
  field('line1', 'Name of entity/individual', 59, 660, 517, 14, [])
]);
assert.equal(w9.line1.value, NAME, 'W-9 line 1');
assert.equal(w9.line1.decision, 'review');

const form8822 = placed([
  field('you', 'Your name', 36, 528, 403, 24, [text(65, 518, 51, "Spouse's name")]),
  field('spouse', "Spouse's name", 36, 492, 403, 24, [text(65, 518, 51, "Spouse's name")])
]);
assert.equal(form8822.you.value, NAME, '8822 your name');
assert.equal(form8822.spouse.value, '', '8822 spouse');
assert.equal(form8822.spouse.refusal, 'other-person');

assert.equal(require('./evidence.js').isSectionHeading('Please complete every field before you sign.'), '');
assert.equal(require('./evidence.js').isSectionHeading('The applicant must sign the declaration.'), '');

console.log('public form layouts ok');
