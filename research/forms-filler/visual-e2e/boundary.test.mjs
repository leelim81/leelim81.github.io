import assert from 'assert';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'run-split.mjs'), 'utf8');
assert.equal(source.includes('printed_reference'), false);
assert.equal(source.includes('geometry_trusted'), false);
assert.match(source, /form: Array\.from\(form\)/);
assert.match(source, /ref: Array\.from\(ref\)/);
assert.doesNotMatch(source, /record\.fields/);
console.log('boundary test ok');
