#!/usr/bin/env node
/** Download the pinned checkpoint and the one ORT wasm runtime. */
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const dir = join(root, 'vendor');
mkdirSync(dir, { recursive: true });
const pin = JSON.parse(readFileSync(join(root, 'PIN.json'), 'utf8'));
for (const file of pin.files) {
  const dest = join(dir, file.name);
  if (existsSync(dest)) {
    const got = createHash('sha256').update(readFileSync(dest)).digest('hex');
    if (got === file.sha256 && readFileSync(dest).length === file.bytes) {
      console.log('have', file.name);
      continue;
    }
  }
  const res = await fetch(file.url);
  if (!res.ok) throw new Error(file.url + ' ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== file.sha256 || buf.length !== file.bytes) throw new Error('hash mismatch ' + file.name);
  writeFileSync(dest, buf);
  console.log('got', file.name, buf.length);
}
