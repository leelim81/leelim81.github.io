#!/usr/bin/env node
/** Field-candidate check for the development geometry sheets. Not a held-out score. */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const { chromium } = pkg;
const root = dirname(fileURLToPath(import.meta.url));
const key = JSON.parse(readFileSync(join(root, 'fixtures/development-geometry/key.json'), 'utf8'));

function pdfBox(box, pageW, pageH, imageW, imageH) {
  const [x, y, w, h] = box;
  return {
    x: (x / imageW) * pageW,
    y: pageH - ((y + h) / imageH) * pageH,
    w: (w / imageW) * pageW,
    h: (h / imageH) * pageH
  };
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8765/tools/forms-filler/bench.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.FormFields);

const rows = [];
for (const record of key) {
  const bytes = Array.from(readFileSync(join(root, 'fixtures/development-geometry', record.id + '.form.pdf')));
  const detected = await page.evaluate(async (list) => {
    const read = await FormFields.read(new Uint8Array(list));
    return read.fields.map((field) => ({
      label: field.label,
      kind: window.FormEvidence ? FormEvidence.fieldKind(field) : '',
      rect: field.rect,
      pageWidth: field.pageWidth,
      pageHeight: field.pageHeight
    }));
  }, bytes);
  const imageW = record.image_px[0];
  const imageH = record.image_px[1];
  const pageW = detected[0] ? detected[0].pageWidth : 595;
  const pageH = detected[0] ? detected[0].pageHeight : 595;
  let correct = 0;
  let wrong = 0;
  const matched = new Set();
  const guesses = record.id === 'close-labels';
  detected.forEach((field) => {
    if (guesses) {
      wrong += 1;
      return;
    }
    const cx = field.rect.x + field.rect.width / 2;
    const cy = field.rect.y + field.rect.height / 2;
    let best = null;
    let bestDy = 1e9;
    record.fields.forEach((gold) => {
      const box = pdfBox(gold.box_px, pageW, pageH, imageW, imageH);
      if (cx < box.x - 40 || cx > box.x + box.w + 40) return;
      const dy = Math.abs(cy - (box.y + box.h / 2));
      if (dy < bestDy) {
        bestDy = dy;
        best = gold;
      }
    });
    if (!best || bestDy > 90 || best.label_drawn !== field.label) wrong += 1;
    else {
      correct += 1;
      matched.add(best.label_drawn + best.role);
    }
  });
  const missed = record.fields.filter((gold) => !matched.has(gold.label_drawn + gold.role)).map((gold) => gold.label_drawn);
  rows.push({
    id: record.id,
    note: record.note,
    candidates: detected.length,
    labels: detected.map((field) => field.label),
    kinds: detected.map((field) => field.kind),
    correctAssociation: correct,
    wrongAssociation: wrong,
    missed: missed
  });
  console.log(record.id, JSON.stringify(rows[rows.length - 1]));
}
writeFileSync(join(root, 'results/development-geometry.json'), JSON.stringify({ rows }, null, 2) + '\n');
await browser.close();
