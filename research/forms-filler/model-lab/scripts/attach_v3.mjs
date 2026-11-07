import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const { fromText, mapFactsToFields, modelFields } = createRequire(import.meta.url)(
  join(dirname(fileURLToPath(import.meta.url)), '../../../../tools/forms-filler/facts.js')
);

function plainLabel(field) {
  return String(field.label || field.id).replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48);
}

function promptFor(facts, fields, excerpt) {
  return [
    'Fill only these form fields from the identity facts and the excerpt.',
    'Reply with a JSON object whose keys are the field ids. Use an empty string when the excerpt does not contain the value.',
    'Never answer with SINGAPORE or REPUBLIC OF SINGAPORE unless that is the whole street or country the field asks for, and never invent a phone or email.',
    'Facts: ' + JSON.stringify(facts || {}),
    'Fields: ' + fields.map((field) => field.id + ' = ' + plainLabel(field)).join('; '),
    'Excerpt: ' + String(excerpt || '').slice(0, 900)
  ].join('\n');
}

function schemaFor(fields) {
  const properties = {};
  const required = [];
  fields.forEach((field) => {
    properties[field.id] = { type: 'string', description: plainLabel(field) || field.id };
    required.push(field.id);
  });
  return { type: 'object', properties, additionalProperties: false, required };
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const staging = JSON.parse(chunks.join(''));
const out = staging.map((row) => {
  const facts = fromText(row.excerpt);
  const fields = row.fields.map((field) => ({ id: field.id, label: field.label, type: 'text', canonical: field.canonical }));
  const seeded = mapFactsToFields(facts, fields);
  const rest = fields.filter((field) => !seeded[field.id]);
  const ask = modelFields(rest, row.excerpt).slice(0, 8);
  const gold = {};
  ask.forEach((field) => {
    const canonical = row.fields.find((item) => item.id === field.id).canonical;
    gold[field.id] = row.semantic[canonical] || '';
  });
  const modelFieldsOut = ask.map((field) => ({ id: field.id, label: plainLabel(field), type: 'text', canonical: field.canonical }));
  return {
    id: row.id,
    split: row.split,
    template_id: row.template_id,
    label_family: row.label_family,
    persona_id: row.persona_id,
    source: row.source,
    pair: row.pair || '',
    excerpt: row.excerpt,
    fields: row.fields,
    parser_facts: facts,
    parser_filled: seeded,
    model_fields: modelFieldsOut,
    gold: gold,
    production_prompt: promptFor(facts, ask, row.excerpt),
    production_schema: schemaFor(ask),
    target_json: JSON.stringify(gold)
  };
});
process.stdout.write(JSON.stringify(out));
