/* Production postfilter for raw model rows. Commit 9c2d5b8.
   facts.js and sanitize.js load through their existing Node exports.
   llm.js is not executed: it binds WebLLM to window. Its null handling
   calls FormFacts.coerceModelObject, which this runner calls instead.
   rowsFrom, proposalFrom, bestSupported, and supported are taken from
   app.js and run with those exports in scope. */
import { createRequire } from 'module';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const facts = require(join(root, 'facts.js'));
const sanitize = require(join(root, 'sanitize.js'));
const appSrc = readFileSync(join(root, 'app.js'), 'utf8');
const llmSrc = readFileSync(join(root, 'llm.js'), 'utf8');

const EXPECT = {
  'facts.js': '02fc56528418a16eba5096b6086d8f784a7bea722ebfdcda2ec7bd936eb6f9f7',
  'llm.js': 'd8622f1d7b8821383d6715fd51e0b7dec37e99e446b0aff1df67590e8bc6e031',
  'sanitize.js': '48af4e45223764f24d94cd73a60026729f48f22ec986e2742a6b0fef0f602d22',
  'app.js': '8bc27de76077aca133788a99e75955a4fac9059709314f66cd654e26d4dfe19f',
  'facts.test.mjs': '5af8e8e2cd3a017ad9f30825932ddd69b919b0302f6afc4dc733abeaf60ab2b3'
};

function extractFunction(source, name) {
  const token = 'function ' + name + '(';
  const start = source.indexOf(token);
  if (start < 0 || source.indexOf(token, start + token.length) !== -1) {
    throw new Error('Could not isolate ' + name + ' in app.js');
  }
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('Unclosed ' + name);
}

const placeSrc = `state.proposals.forEach(function (row) {
        var field = null;
        for (var i = 0; i < state.fields.length; i++) {
          if (state.fields[i].id === row.id) { field = state.fields[i]; break; }
        }
        values[row.id] = FormSanitize.sanitize(row.value, field || row);
        if (row.source !== 'facts' && window.FormFacts && !FormFacts.accept(field || row, values[row.id])) values[row.id] = '';
      });`;
if (!appSrc.includes(placeSrc)) throw new Error('openEditor value pass is not the 9c2d5b8 text');
if (!llmSrc.includes('FormFacts.coerceModelObject')) throw new Error('llm.js no longer coerces through facts.js');

const make = new Function('FormFacts', 'window', 'FormSanitize', 'state', `
${extractFunction(appSrc, 'supported')}
${extractFunction(appSrc, 'bestSupported')}
${extractFunction(appSrc, 'proposalFrom')}
${extractFunction(appSrc, 'rowsFrom')}
function placed(proposals) {
  var values = {};
  var proposalsHolder = proposals;
  ${placeSrc.replace('state.proposals', 'proposalsHolder')}
  return values;
}
return function (seeded, guessed, notes) {
  var proposals = rowsFrom(seeded, guessed, notes);
  return { proposals: proposals, values: placed(proposals) };
};
`);

const state = { fields: [] };
const filterWith = make(facts, { FormFacts: facts }, sanitize, state);

function parseResponse(response) {
  if (response == null) return {};
  if (typeof response === 'string') {
    try { return facts.coerceModelObject(JSON.parse(response)); }
    catch (err) { return {}; }
  }
  return facts.coerceModelObject(response);
}

function fieldsOf(row, guessed) {
  if (Array.isArray(row.fields) && row.fields.length) return row.fields;
  if (Array.isArray(row.model_fields) && row.model_fields.length) return row.model_fields;
  return Object.keys(guessed).map(function (id) {
    return { id: id, label: id, type: 'text' };
  });
}

export function postfilterRow(row) {
  const guessed = parseResponse(row.response != null ? row.response : (row.raw != null ? row.raw : row.generation));
  const seeded = row.seeded || row.parser_filled || {};
  const notes = row.context || row.excerpt || row.notes || '';
  state.fields = fieldsOf(row, guessed);
  const result = filterWith(seeded, guessed, notes);
  const sources = {};
  result.proposals.forEach(function (proposal) { sources[proposal.id] = proposal.source || ''; });
  return {
    id: row.id || '',
    values: result.values,
    sources: sources
  };
}

function hashFile(name) {
  return createHash('sha256').update(readFileSync(join(root, name))).digest('hex');
}

function selfCheck() {
  Object.keys(EXPECT).forEach(function (name) {
    if (hashFile(name) !== EXPECT[name]) throw new Error('hash mismatch ' + name);
  });
  const samples = [
    {
      id: 'cit-sg',
      context: 'Citizenship: Singapore',
      fields: [{ id: 'cit', label: 'Citizenship', type: 'text' }],
      response: { cit: 'Singapore' },
      expect: { cit: 'Singapore Citizen' }
    },
    {
      id: 'cit-letterhead',
      context: 'REPUBLIC OF SINGAPORE\nFull name: Alex',
      fields: [{ id: 'cit', label: 'Citizenship', type: 'text' }],
      response: { cit: 'Singapore' },
      expect: { cit: '' }
    },
    {
      id: 'nulls',
      context: 'Full name: Alex Example',
      fields: [{ id: 'name', label: 'Full name', type: 'text' }],
      response: { name: null },
      expect: { name: '' }
    },
    {
      id: 'null-string',
      context: 'Full name: Alex Example',
      fields: [{ id: 'name', label: 'Full name', type: 'text' }],
      response: '{"name":"null"}',
      expect: { name: '' }
    },
    {
      id: 'patient-dob',
      context: 'Patient\nDate of birth: 01/01/1980\nApplicant\nDate of birth: 14/03/1992\n',
      fields: [{ id: 'dob', label: 'Applicant date of birth', type: 'text' }],
      response: { dob: '01/01/1980' },
      expect: { dob: '' }
    },
    {
      id: 'applicant-dob',
      context: 'Patient\nDate of birth: 01/01/1980\nApplicant\nThe applicant was born on 14 March 1992.\n',
      fields: [{ id: 'dob', label: 'Date of birth', type: 'text' }],
      response: { dob: '14 March 1992' },
      expect: { dob: '14/03/1992' }
    },
    {
      id: 'bank-scope',
      context: 'NRIC S1234567D\nPhone +65 8123 4567\nBank account number: 5566778899\n',
      fields: [{ id: 'bank', label: 'Bank account', type: 'text' }],
      response: { bank: '1234567' },
      expect: { bank: '' }
    },
    {
      id: 'bank-keep',
      context: 'Bank account number: 0012345678',
      fields: [{ id: 'bank', label: 'Bank account', type: 'text' }],
      response: { bank: '12345678' },
      expect: { bank: '0012345678' }
    },
    {
      id: 'seeded-wins',
      context: 'Date of birth: 01/01/1980',
      fields: [{ id: 'dob', label: 'Date of birth', type: 'text' }],
      seeded: { dob: '14/03/1992' },
      response: { dob: '01/01/1980' },
      expect: { dob: '14/03/1992' }
    }
  ];
  samples.forEach(function (sample) {
    const got = postfilterRow(sample).values;
    Object.keys(sample.expect).forEach(function (key) {
      if (got[key] !== sample.expect[key]) {
        throw new Error(sample.id + ' ' + key + ' got ' + JSON.stringify(got[key]));
      }
    });
  });
  const tests = spawnSync(process.execPath, [join(root, 'facts.test.mjs')], { encoding: 'utf8' });
  if (tests.status !== 0) {
    throw new Error(tests.stdout + tests.stderr);
  }
  console.log('postfilter self-check ok');
  console.log(tests.stdout.trim());
}

function readRows(path) {
  const text = path ? readFileSync(path, 'utf8') : readFileSync(0, 'utf8');
  return text.split(/\n/).filter(function (line) { return line.trim(); }).map(function (line) {
    return JSON.parse(line);
  });
}

const args = process.argv.slice(2);
if (args.includes('--self-check')) {
  selfCheck();
} else {
  let input = '';
  let output = '';
  args.forEach(function (arg, index) {
    if (arg === '-o' || arg === '--out') output = args[index + 1] || '';
    else if (!arg.startsWith('-') && args[index - 1] !== '-o' && args[index - 1] !== '--out') input = arg;
  });
  const lines = readRows(input).map(function (row) { return JSON.stringify(postfilterRow(row)); });
  const body = lines.join('\n') + (lines.length ? '\n' : '');
  if (output) writeFileSync(output, body);
  else process.stdout.write(body);
}
