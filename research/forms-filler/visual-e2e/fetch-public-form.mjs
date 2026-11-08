#!/usr/bin/env node
/** Download one catalogued blank form and check its hash. Prints no response headers. */
import { createHash } from 'crypto';
import { writeFileSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(root, 'PUBLIC-FORMS.json'), 'utf8'));
const id = process.argv[2];
const dest = process.argv[3];
const item = catalog.items.find((row) => row.id === id);
if (!item || !dest) {
  console.error('Usage: node fetch-public-form.mjs <id> <dest.pdf>');
  process.exit(1);
}
const response = await fetch(item.url);
if (!response.ok) {
  console.error(item.id, 'HTTP', response.status);
  process.exit(1);
}
const bytes = Buffer.from(await response.arrayBuffer());
const sha = createHash('sha256').update(bytes).digest('hex');
if (sha !== item.sha256 || bytes.length !== item.bytes) {
  console.error(item.id, 'hash or size mismatch', bytes.length);
  process.exit(1);
}
writeFileSync(dest, bytes);
console.log(item.id, bytes.length, sha);
