#!/usr/bin/env node
/** Set autofill types from the calibration split only. Does not read test. */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadGold, candidateRows } from './apply.mjs';
import { summarize, binomialUpper } from './metrics.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const gates = JSON.parse(readFileSync(join(root, 'GATES.json'), 'utf8'));
const records = loadGold(join(root, 'gold', 'calibration.jsonl'));
if (records.some((row) => row.split !== 'calibration')) throw new Error('calibration file leaked');
const kinds = ['name', 'nric', 'dob', 'phone', 'email', 'address', 'postal', 'mailbox'];
const probe = { autofill: Object.fromEntries(kinds.map((kind) => [kind, true])) };
const rows = records.flatMap((record) => candidateRows(record, probe));
const autofill = {};
const report = {};
kinds.forEach((kind) => {
  const summary = summarize(rows.filter((row) => row.kind === kind));
  const identity = gates.identity_kinds.includes(kind);
  const limit = identity ? gates.identity_wrong_fill_upper_max : gates.other_wrong_fill_upper_max;
  const upper = summary.wrongFillUpper;
  const clean = summary.wrong === 0 && summary.wrongPerson === 0 && summary.hardViolations === 0;
  const enough = upper != null && upper <= limit;
  const enabled = clean && enough;
  autofill[kind] = enabled;
  report[kind] = {
    automatic: summary.automatic,
    correct: summary.correct,
    wrong: summary.wrong,
    wrongPerson: summary.wrongPerson,
    upper,
    limit,
    enabled,
    because: enabled ? 'calibration gate passed' : (!clean ? 'errors on calibration' : 'upper bound above the gate or no automatic fills')
  };
});
const frozen = {
  scorecard: gates.scorecard,
  source: 'calibration only',
  autofill,
  report
};
writeFileSync(join(root, 'FROZEN.json'), JSON.stringify(frozen, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (binomialUpper(0, 0) !== null) throw new Error('empty bound');
