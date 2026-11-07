#!/usr/bin/env node
/** Score development, calibration, and the untouched test split with the frozen gate. */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadGold, rowsFor } from './apply.mjs';
import { summarize, breakout, sensitive } from './metrics.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const frozen = JSON.parse(readFileSync(join(root, 'FROZEN.json'), 'utf8'));
const outDir = join(root, 'results');
mkdirSync(outDir, { recursive: true });

const splits = ['development', 'calibration', 'test'];
const all = [];
splits.forEach((split) => {
  const records = loadGold(join(root, 'gold', `${split}.jsonl`));
  rowsFor(records, frozen).forEach((row) => all.push(row));
});
const lines = all.map((row) => JSON.stringify(row)).join('\n') + '\n';
writeFileSync(join(outDir, 'decisions.jsonl'), lines);

const header = ['system', 'split', 'layout', 'kind', 'ambiguity', 'caseId', 'fieldId', 'decision', 'value', 'gold', 'answerable', 'wrongPerson', 'reason', 'factId'];
const csv = [header.join(',')].concat(all.map((row) => header.map((key) => JSON.stringify(row[key] ?? '')).join(','))).join('\n') + '\n';
writeFileSync(join(outDir, 'decisions.csv'), csv);

function pack(rows) {
  return {
    all: summarize(rows),
    sensitive: sensitive(rows),
    layout: breakout(rows, 'layout'),
    kind: breakout(rows, 'kind'),
    ambiguity: breakout(rows, 'ambiguity')
  };
}

const report = { frozen: frozen.autofill, splits: {} };
const bySplit = {};
all.forEach((row) => {
  const split = row.caseId.startsWith('development') ? 'development' : row.caseId.startsWith('calibration') ? 'calibration' : 'test';
  row.split = split;
  if (!bySplit[split]) bySplit[split] = [];
  bySplit[split].push(row);
});
Object.keys(bySplit).forEach((split) => {
  const rows = bySplit[split];
  report.splits[split] = {
    candidate: pack(rows.filter((row) => row.system === 'candidate')),
    baseline: pack(rows.filter((row) => row.system === 'baseline'))
  };
});
writeFileSync(join(outDir, 'scorecard.json'), JSON.stringify(report, null, 2) + '\n');
const test = report.splits.test;
console.log(JSON.stringify({
  test_candidate_coverage: test.candidate.all.correctCoverage,
  test_candidate_wrong: test.candidate.all.wrongFillRate,
  test_candidate_wrong_person: test.candidate.all.wrongPerson,
  test_candidate_automatic: test.candidate.all.automatic,
  test_baseline_coverage: test.baseline.all.correctCoverage,
  test_baseline_wrong: test.baseline.all.wrongFillRate,
  test_baseline_wrong_person: test.baseline.all.wrongPerson,
  test_baseline_automatic: test.baseline.all.automatic
}, null, 2));
