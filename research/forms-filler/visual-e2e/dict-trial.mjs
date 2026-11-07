#!/usr/bin/env node
/** Dictionary flags at Tesseract worker creation. Not a held-out score.
 *  The fourth createWorker argument is the Init config. setParameters cannot set these. */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const { chromium } = pkg;
const root = dirname(fileURLToPath(import.meta.url));
const off = {
  load_system_dawg: '0',
  load_freq_dawg: '0',
  load_unambig_dawg: '0',
  load_punc_dawg: '0',
  load_number_dawg: '0',
  load_bigram_dawg: '0'
};

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const page = await browser.newPage();
page.setDefaultTimeout(180000);
await page.goto('http://127.0.0.1:8765/tools/forms-filler/bench.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.Tesseract && window.pdfjsLib);

const pdf = Array.from(readFileSync(join(root, 'fixtures/development-stack/development-stack-00.reference.pdf')));
const result = await page.evaluate(async (payload) => {
  const base = new URL('vendor/tesseract/', location.href).href;
  async function readWith(config) {
    const worker = await Tesseract.createWorker('eng', 1, {
      workerPath: base + 'worker.min.js',
      corePath: base + 'tesseract-core-simd-lstm.wasm.js',
      langPath: base.replace(/\/$/, ''),
      gzip: true,
      cacheMethod: 'none'
    }, config);
    async function textOf(canvas, psm) {
      await worker.setParameters({ tessedit_pageseg_mode: String(psm) });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const out = await worker.recognize(blob);
      return out && out.data && out.data.text ? out.data.text.trim() : '';
    }
    const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(payload.pdf) }).promise;
    const docPage = await pdfDoc.getPage(1);
    const view = docPage.getViewport({ scale: 2 });
    const scan = document.createElement('canvas');
    scan.width = Math.ceil(view.width);
    scan.height = Math.ceil(view.height);
    await docPage.render({ canvasContext: scan.getContext('2d'), viewport: view }).promise;
    const crop = document.createElement('canvas');
    crop.width = scan.width;
    crop.height = Math.round(scan.height * 0.16);
    crop.getContext('2d').drawImage(scan, 0, Math.round(scan.height * 0.10), scan.width, crop.height, 0, 0, crop.width, crop.height);
    const drawn = document.createElement('canvas');
    drawn.width = 900;
    drawn.height = 220;
    const pen = drawn.getContext('2d');
    pen.fillStyle = '#fff';
    pen.fillRect(0, 0, drawn.width, drawn.height);
    pen.fillStyle = '#000';
    pen.font = '28px sans-serif';
    payload.lines.forEach((line, index) => pen.fillText(line, 24, 40 + index * 36));
    const started = performance.now();
    const pageText = await textOf(scan, 6);
    const cropText = await textOf(crop, 6);
    const drawnText = await textOf(drawn, 6);
    const ms = performance.now() - started;
    await worker.terminate();
    return { ms: Math.round(ms), pageText, cropText, drawnText };
  }
  const on = await readWith({});
  const off = await readWith(payload.off);
  return { on, off };
}, { pdf, off, lines: ["Email: sample1@example.com", "NRIC: S2000346D", "Phone: +65 80000020", "Born: 21/09/1990", "Name: O'Neil, Jr."] });

writeFileSync(join(root, 'results/dict-init.json'), JSON.stringify({
  note: 'Init config, not setParameters. One worker at a time. Development images only.',
  off,
  result
}, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
await browser.close();
