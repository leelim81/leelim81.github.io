import assert from 'assert';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { extract } = require('./evidence.js');
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

console.log('evidence tests ok');
