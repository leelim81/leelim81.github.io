#!/usr/bin/env node
/** Freeze ocrAutofill from the calibration probe only. Does not read the test split. */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { report } from './join.mjs';
import { binomialUpper, norm } from '../visual-gold/metrics.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const gates = JSON.parse(readFileSync(join(root, 'VISUAL-GATES.json'), 'utf8'));
const out = report('calibration', 'probe');
const kinds = ['name', 'nric', 'dob', 'phone', 'email', 'address', 'postal', 'mailbox'];
const ocrAutofill = {};
const detail = {};
kinds.forEach((kind) => {
  const rows = out.rows.filter((row) => row.kind === kind);
  const automatic = rows.filter((row) => row.decision === 'autofill' && String(row.value || '').trim());
  const wrong = automatic.filter((row) => {
    const same = row.answerable && norm(row.kind, row.value) === norm(row.kind, row.gold);
    return !same || row.wrongPerson || row.wrongDestination;
  });
  const wrongPerson = automatic.filter((row) => row.wrongPerson).length;
  const n = automatic.length;
  const errors = wrong.length;
  const upper = binomialUpper(errors, n);
  const identity = gates.identity_kinds.includes(kind);
  const limit = identity ? gates.identity_wrong_fill_upper_max : gates.other_wrong_fill_upper_max;
  const minimum = gates.minimum_automatic_fills[kind];
  const enough = n >= minimum;
  const clean = errors === 0 && wrongPerson === 0;
  const boundOk = upper != null && upper <= limit;
  const enabled = enough && clean && boundOk;
  ocrAutofill[kind] = enabled;
  detail[kind] = {
    automatic: n,
    wrong: errors,
    wrongPerson,
    upper,
    minimum,
    limit,
    enabled,
    because: enabled
      ? 'calibration probe cleared the budget'
      : [
          !enough ? `n ${n} is below ${minimum}, so reliability is not established` : '',
          !clean ? `${errors} wrong fill(s), ${wrongPerson} wrong-person` : '',
          enough && clean && !boundOk ? 'upper bound is above the budget' : ''
        ].filter(Boolean).join('; ')
  };
});
const frozen = {
  scorecard: 'visual-e2e-1',
  source: 'calibration probe only',
  ocrAutofill,
  detail
};
writeFileSync(join(root, 'FROZEN-e2e.json'), JSON.stringify(frozen, null, 2) + '\n');
console.log(JSON.stringify(detail, null, 2));
