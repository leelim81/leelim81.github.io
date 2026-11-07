/* Run the product facts parser on the frozen references.
   Output is parser-only. It is not a model prediction. */
import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { fromText } = createRequire(import.meta.url)(join(root, '../../tools/forms-filler/facts.js'));
const rows = [];
for (const name of ['train.jsonl', 'dev.jsonl', 'test.jsonl']) {
  for (const line of readFileSync(join(root, 'data', name), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    rows.push({ id: row.id, split: row.split, template_id: row.template_id, facts: fromText(row.reference_text) });
  }
}
const dest = join(root, 'results', 'parser-only');
mkdirSync(dest, { recursive: true });
writeFileSync(join(dest, 'from-text.jsonl'), rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
console.log('parser rows', rows.length);
