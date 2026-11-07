#!/usr/bin/env node
/** Wrap the raster PNGs in image-only PDFs and write the answer-key JSONL. */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument } from 'pdf-lib';

const root = dirname(fileURLToPath(import.meta.url));
const key = JSON.parse(readFileSync(join(root, 'answer-key.json'), 'utf8'));

async function wrap(pngPath, pdfPath) {
  const png = readFileSync(pngPath);
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(png);
  const pageW = 595;
  const pageH = 595 * (image.height / image.width);
  const page = doc.addPage([pageW, pageH]);
  page.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });
  writeFileSync(pdfPath, await doc.save());
  return { pageW, pageH, imageW: image.width, imageH: image.height };
}

function toPdf(box, pageW, pageH, imageW, imageH) {
  const [x, y, w, h] = box;
  return [
    (x / imageW) * pageW,
    pageH - ((y + h) / imageH) * pageH,
    (w / imageW) * pageW,
    (h / imageH) * pageH
  ].map((value) => Math.round(value * 100) / 100);
}

for (const split of Object.keys(key)) {
  const dir = join(root, 'gold');
  mkdirSync(dir, { recursive: true });
  const lines = [];
  for (const record of key[split]) {
    const stem = record.id;
    const formPng = join(root, 'fixtures', split, `${stem}.form.png`);
    const refPng = join(root, 'fixtures', split, `${stem}.reference.png`);
    const formPdf = join(root, 'fixtures', split, `${stem}.form.pdf`);
    const refPdf = join(root, 'fixtures', split, `${stem}.reference.pdf`);
    const size = await wrap(formPng, formPdf);
    await wrap(refPng, refPdf);
    record.fields.forEach((field) => {
      field.rect = toPdf(field.box_px, size.pageW, size.pageH, size.imageW, size.imageH);
    });
    record.form_pdf = `fixtures/${split}/${stem}.form.pdf`;
    record.reference_pdf = `fixtures/${split}/${stem}.reference.pdf`;
    lines.push(JSON.stringify(record));
  }
  writeFileSync(join(dir, `${split}.jsonl`), lines.join('\n') + '\n');
  console.log(split, lines.length);
}
