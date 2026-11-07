import { createRequire } from 'module';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const facts = require('../../../tools/forms-filler/facts.js');
const { decideAll } = require('../../../tools/forms-filler/select.js');

export function loadGold(path) {
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function isOther(row, kind, value) {
  const list = (row.other_values && row.other_values[kind]) || [];
  const got = String(value || '').trim().toLowerCase();
  if (!got) return false;
  const gold = (row.fields.find((field) => field.kind === kind) || {}).gold || '';
  if (got === String(gold).trim().toLowerCase()) return false;
  return list.some((item) => String(item).trim().toLowerCase() === got);
}

export function candidateRows(record, frozen) {
  const fields = record.fields.map((field) => ({
    id: field.id,
    label: field.label,
    type: 'text',
    untrusted: !record.geometry_trusted
  }));
  const decisions = decideAll(fields, record.reference_text, frozen);
  const parseFail = decisions.every((row) => row.reason === 'no_source' || row.kind === 'other');
  return decisions.map((decision) => {
    const field = record.fields.find((item) => item.id === decision.fieldId);
    const other = isOther(record, decision.kind, decision.value);
    return {
      system: 'candidate',
      caseId: record.id,
      templateId: record.template_id,
      layout: record.layout_family,
      personId: record.person_id,
      cluster: record.cluster,
      ambiguity: record.ambiguity,
      fieldId: decision.fieldId,
      kind: decision.kind,
      answerable: !!field.answerable,
      gold: field.gold,
      decision: decision.decision,
      value: decision.value || '',
      reason: decision.reason,
      factId: decision.factId || '',
      quote: decision.quote || '',
      rect: field.rect,
      wrongPerson: other && decision.decision === 'autofill',
      wrongDestination: decision.kind === 'mailbox' && decision.decision === 'autofill',
      hardViolation: decision.decision === 'autofill' && (!!decision.hard || other),
      parseFail
    };
  });
}

export function baselineRows(record) {
  const parsed = facts.fromText(record.reference_text);
  const fields = record.fields.map((field) => ({ id: field.id, label: field.label, type: 'text' }));
  const mapped = facts.mapFactsToFields(parsed, fields);
  const parseFail = !parsed || !Object.keys(parsed).length;
  return record.fields.map((field) => {
    const value = mapped[field.id] ? String(mapped[field.id]) : '';
    const decision = value ? 'autofill' : 'abstain';
    const other = isOther(record, field.kind, value);
    return {
      system: 'baseline',
      caseId: record.id,
      templateId: record.template_id,
      layout: record.layout_family,
      personId: record.person_id,
      cluster: record.cluster,
      ambiguity: record.ambiguity,
      fieldId: field.id,
      kind: field.kind,
      answerable: !!field.answerable,
      gold: field.gold,
      decision,
      value,
      reason: value ? 'legacy_map' : 'legacy_blank',
      factId: '',
      quote: '',
      rect: field.rect,
      wrongPerson: other && !!value,
      wrongDestination: field.kind === 'mailbox' && !!value,
      hardViolation: !!value && other,
      parseFail
    };
  });
}

export function rowsFor(records, frozen) {
  const out = [];
  records.forEach((record) => {
    candidateRows(record, frozen).forEach((row) => out.push(row));
    baselineRows(record).forEach((row) => out.push(row));
  });
  return out;
}
