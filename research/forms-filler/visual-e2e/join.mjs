/** Join browser output to the answer key. The browser never sees the key. */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { summarize, sensitive, norm } from '../visual-gold/metrics.mjs';

const require = createRequire(import.meta.url);
const evidence = require('../../../tools/forms-filler/evidence.js');
const root = dirname(fileURLToPath(import.meta.url));

export function loadGold(split) {
  return readFileSync(join(root, 'gold', `${split}.jsonl`), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function otherHit(record, kind, value) {
  const list = (record.other_values && record.other_values[kind]) || [];
  const got = norm(kind, value);
  if (!got) return false;
  const field = record.fields.find((item) => item.kind === kind);
  if (field && got === norm(kind, field.gold)) return false;
  return list.some((item) => norm(kind, item) === got);
}

function inside(item, rect) {
  if (!rect) return false;
  const x = item.x;
  const y = item.y;
  return x >= rect.x - 4 && x <= rect.x + rect.width + 4 && y >= rect.y - 4 && y <= rect.y + rect.height + 8;
}

export function rowsFrom(record, run, system) {
  const detected = run.fields || [];
  const decisions = system === 'baseline' ? run.baseline : run.candidate;
  const byId = Object.fromEntries((decisions || []).map((row) => [row.fieldId, row]));
  const parseFail = !String(run.text || '').trim();
  return record.fields.map((field) => {
    const matches = detected.filter((item) => evidence.fieldKind(item) === field.kind);
    const one = matches.length === 1 ? matches[0] : null;
    const decision = one ? byId[one.id] : null;
    const value = decision ? decision.value || '' : '';
    const placed = (run.placed || []).filter((item) => norm(field.kind, item.text) === norm(field.kind, value) && value);
    const placedInside = one && placed.some((item) => inside(item, one.rect));
    return {
      system,
      caseId: record.id,
      kind: field.kind,
      answerable: !!field.answerable,
      gold: field.gold || '',
      decision: decision ? decision.decision : 'abstain',
      value,
      reason: decision ? decision.reason : (matches.length > 1 ? 'ambiguous_detection' : 'not_detected'),
      wrongPerson: !!(decision && decision.decision === 'autofill' && otherHit(record, field.kind, value)),
      wrongDestination: field.kind === 'mailbox' && !!(decision && decision.decision === 'autofill'),
      hardViolation: !!(decision && decision.decision === 'autofill' && otherHit(record, field.kind, value)),
      parseFail,
      detected: matches.length,
      untrusted: one ? !!one.untrusted : null,
      placedInside: placed.length ? !!placedInside : null,
      channel: run.channel
    };
  });
}

export function report(split, mode) {
  const gold = loadGold(split);
  const run = JSON.parse(readFileSync(join(root, 'results', `${split}-${mode}.json`), 'utf8'));
  const byId = Object.fromEntries(run.rows.map((row) => [row.id, row]));
  const candidate = [];
  const baseline = [];
  gold.forEach((record) => {
    const seen = byId[record.id];
    if (!seen) return;
    rowsFrom(record, seen, 'candidate').forEach((row) => candidate.push(row));
    rowsFrom(record, seen, 'baseline').forEach((row) => baseline.push(row));
  });
  return {
    candidate: summarize(candidate),
    baseline: summarize(baseline),
    candidateSensitive: sensitive(candidate),
    rows: candidate
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const split = process.argv[2];
  const mode = process.argv[3] || 'probe';
  const out = report(split, mode);
  const kinds = {};
  out.rows.forEach((row) => {
    if (!kinds[row.kind]) kinds[row.kind] = { auto: 0, wrong: 0, correct: 0 };
  });
  console.log(JSON.stringify({
    candidate: out.candidate,
    baseline: out.baseline,
    identity: out.candidateSensitive.identity,
    sample: out.rows.filter((row) => row.decision === 'autofill').map((row) => ({
      id: row.caseId, kind: row.kind, value: row.value, gold: row.gold, wrongPerson: row.wrongPerson, placed: row.placedInside, reason: row.reason
    }))
  }, null, 2));
}
