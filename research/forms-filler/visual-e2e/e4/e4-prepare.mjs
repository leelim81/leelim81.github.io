#!/usr/bin/env node
/** Draw the E4 family and freeze the gate. Does not run the detector. */
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire('/tmp/formgen/node_modules/pdf-lib/package.json');
const { PDFDocument, degrees } = require('pdf-lib');
const root = dirname(fileURLToPath(import.meta.url));
const dir = join(root, 'fixtures');
mkdirSync(dir, { recursive: true });

const forms = [
  { id: 'pell-ticket', layout: 'ticket', title: 'pell ticket', labels: ['Pell ticket name', 'Pell ticket phone', 'Pell ticket email', 'Pell ticket city'] },
  { id: 'pell-rail', layout: 'rail', title: 'pell rail', labels: ['Pell rail name', 'Pell rail phone', 'Pell rail email', 'Pell rail city'] },
  { id: 'pell-pair', layout: 'pair', title: 'pell pair', labels: ['Pell pair name', 'Pell pair phone', 'Pell pair email', 'Pell pair city'] },
  { id: 'pell-marks', layout: 'marks', title: 'pell marks', labels: ['Pell marks note', 'Pell marks yes', 'Pell marks no', 'Pell marks other', 'Pell marks sign'] }
];
const spec = forms.map((form) => ({ ...form, png: join(dir, form.id + '.png') }));
const specPath = '/tmp/e4-spec.json';
const boxPath = '/tmp/e4-boxes.json';
writeFileSync(specPath, JSON.stringify(spec));
const py = spawnSync('python3', [join(root, 'e4_draw.py'), specPath, boxPath], { encoding: 'utf8' });
if (py.status !== 0) {
  console.error(py.stderr || py.stdout);
  process.exit(py.status || 1);
}
const drawn = JSON.parse(readFileSync(boxPath, 'utf8'));

function sha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function toPdf(box, pageW, pageH, imageW, imageH) {
  const [x, y, w, h] = box;
  return [
    (x / imageW) * pageW,
    pageH - ((y + h) / imageH) * pageH,
    (w / imageW) * pageW,
    (h / imageH) * pageH
  ].map((v) => Math.round(v * 100) / 100);
}
const records = [];
for (const form of forms) {
  const png = readFileSync(join(dir, form.id + '.png'));
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(png);
  const pageW = 595;
  const pageH = 595 * (image.height / image.width);
  const page = doc.addPage([pageW, pageH]);
  page.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });
  const bytes = await doc.save();
  writeFileSync(join(dir, form.id + '.pdf'), bytes);
  const info = drawn[form.id];
  records.push({
    id: form.id,
    layout: form.layout,
    expect: 'detect',
    pdf: 'fixtures/' + form.id + '.pdf',
    fields: info.boxes.map((box) => ({
      cls: box.cls,
      rect: toPdf(box.px, pageW, pageH, info.image[0], info.image[1])
    }))
  });
}
const turned = await PDFDocument.load(readFileSync(join(dir, 'pell-ticket.pdf')));
turned.getPages()[0].setRotation(degrees(90));
writeFileSync(join(dir, 'pell-turned.pdf'), await turned.save());
records.push({ id: 'pell-turned', layout: 'ticket', expect: 'guard', pdf: 'fixtures/pell-turned.pdf', fields: [] });

const banned = ['Grove', 'Fenn', 'Bent', 'Moss', 'Quill', 'Ada', 'Bea', 'ALDER', 'COVE', 'SLOE', 'MYRTLE'];
const blob = JSON.stringify(records);
const hits = banned.filter((token) => blob.includes(token));
if (hits.length) {
  console.error('overlap', hits);
  process.exit(1);
}
writeFileSync(join(root, 'gold.jsonl'), records.map((row) => JSON.stringify(row)).join('\n') + '\n');

const files = {};
readdirSync(dir).filter((name) => name.endsWith('.pdf')).forEach((name) => {
  files['fixtures/' + name] = { bytes: statSync(join(dir, name)).size, sha256: sha(join(dir, name)) };
});
files['gold.jsonl'] = { bytes: statSync(join(root, 'gold.jsonl')).size, sha256: sha(join(root, 'gold.jsonl')) };
const code = ['tools/forms-filler/fields.js', 'research/forms-filler/visual-e2e/e4/harness.html'];
const codeHashes = {};
code.forEach((rel) => { codeHashes[rel] = sha(join(root, '../../../..', rel)); });
const freeze = {
  stage: 'e4-nano',
  looked: false,
  family: 'pell',
  street: 'none; labels only',
  people: 'Pell labels only, no filled values',
  gate: {
    score: 0.3,
    nms: 0.6,
    iou: 0.5,
    source: 'Model card conf 0.3 and NMS 0.6. Not fit on this family.',
    match: 'One-to-one greedy IoU. A true positive also needs the same class. Signature is manual and checked state is not scored.',
    go: 'On the detect rows only, candidate recall must be at least baseline recall plus 0.10 and candidate precision at least 0.95. Otherwise reject. This cycle cannot adopt the model: placement, export, and a phone were not in the gate.',
    resource: 'Record cold request bytes and whole-browser RSS. RSS is not model RAM. No phone, so no phone adoption.'
  },
  files,
  codeHashes
};
writeFileSync(join(root, 'E4-FREEZE.json'), JSON.stringify(freeze, null, 2) + '\n');
console.log(records.map((row) => row.id + ':' + row.fields.length).join(' '));
