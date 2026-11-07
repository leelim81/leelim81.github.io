import assert from 'assert';
import { summarize, binomialUpper, norm } from './metrics.mjs';

const rows = [
  { caseId: 'ex-1', kind: 'name', answerable: true, gold: 'Mina Fixture', decision: 'autofill', value: 'Mina Fixture', wrongPerson: false, wrongDestination: false, parseFail: false },
  { caseId: 'ex-1', kind: 'dob', answerable: true, gold: '02/02/1992', decision: 'autofill', value: '01/01/1980', wrongPerson: true, wrongDestination: false, parseFail: false },
  { caseId: 'ex-1', kind: 'mailbox', answerable: false, gold: '', decision: 'autofill', value: '10 NORTH QUAY', wrongPerson: false, wrongDestination: true, parseFail: false },
  { caseId: 'ex-1', kind: 'email', answerable: true, gold: 'mina.fixture@example.com', decision: 'review', value: 'mina.fixture@example.com', wrongPerson: false, wrongDestination: false, parseFail: false },
  { caseId: 'ex-1', kind: 'phone', answerable: true, gold: '81234567', decision: 'abstain', value: '', wrongPerson: false, wrongDestination: false, parseFail: false }
];

const summary = summarize(rows);
assert.equal(summary.answerable, 4);
assert.equal(summary.automatic, 3);
assert.equal(summary.correct, 1);
assert.equal(summary.wrong, 2);
assert.equal(summary.wrongPerson, 1);
assert.equal(summary.unsupported, 1);
assert.equal(summary.wrongDestination, 1);
assert.equal(summary.review, 1);
assert.equal(summary.reviewCorrect, 1);
assert.equal(summary.abstain, 1);
assert.equal(summary.correctCoverage, 0.25);
assert.equal(summary.wrongFillRate, 2 / 3);
assert.equal(summary.formsAllCorrect, 0);
assert.ok(summary.wrongFillUpper > summary.wrongFillRate);
assert.equal(binomialUpper(0, 30), 1 - Math.pow(0.05, 1 / 30));
assert.equal(norm('phone', '+65 8123 4567'), '81234567');
assert.equal(summarize([]).wrongFillRate, null);
console.log('score tests ok');
