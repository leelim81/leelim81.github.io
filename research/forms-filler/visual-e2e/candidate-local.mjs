/** One frozen comparison. Line-local PSM 7 crops from ink-mask lines.
 *  Gold boxes are used only after the words exist, never to choose a crop.
 *  A field counts only if its box is inside the frozen target within 8px.
 *  Quantity, article, price, date, and serial are not relabeled. */
import { readFileSync, writeFileSync } from 'fs';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const gold = JSON.parse(readFileSync('/tmp/ff-natural-work/provisional-gold.json', 'utf8'));
const PAD = 8;
const jobs = [
  ['food-order', '/tmp/ff-natural-work/bounded/wellcome-food-order-bounded.jpg', gold.sources['wellcome-food-order'], 3442, 5601, true],
  ['census-3', '/tmp/ff-natural-scans/ff-natural-scans/files/nara-p5-front.jpg', gold.sources['nara-p5-front'], 924, 1200, false],
  ['census-2', '/tmp/ff-natural-scans/ff-natural-scans/files/nara-p8.jpg', gold.sources['nara-p8'], 1200, 804, false]
];

function contains(ink, target) {
  return ink[0] >= target[0] - PAD && ink[1] >= target[1] - PAD && ink[2] <= target[2] + PAD && ink[3] <= target[3] + PAD;
}
function fieldBox(field, frame, origW, origH) {
  const top = (1 - (field.y + field.h) / field.ph) * frame.outH;
  const bot = (1 - field.y / field.ph) * frame.outH;
  const left = field.x / field.pw * frame.outW;
  const right = (field.x + field.w) / field.pw * frame.outW;
  const sx = frame.sourceW / frame.inW;
  const sy = frame.sourceH / frame.inH;
  const file = [
    (left + frame.crop.x) * sx,
    (top + frame.crop.y) * sy,
    (right + frame.crop.x) * sx,
    (bot + frame.crop.y) * sy
  ];
  const fx = origW / frame.sourceW;
  const fy = origH / frame.sourceH;
  return [file[0] * fx, file[1] * fy, file[2] * fx, file[3] * fy].map((n) => Math.round(n));
}

const { chromium } = pkg;
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8765/tools/forms-filler/?local=' + Date.now());
await page.waitForFunction(() => window.FormFields.candidateReport);

const summary = [];
for (const [id, file, source, origW, origH, isPublic] of jobs) {
  const bytes = Array.from(readFileSync(file));
  const report = await page.evaluate(async (list) => FormFields.candidateReport(new Uint8Array(list), 'image/jpeg'), bytes);
  const judged = report.fields.map((field) => {
    const box = fieldBox(field, report.frame, origW, origH);
    const hits = source.targets.filter((target) => contains(box, target.box)).map((target) => target.kind);
    return { kind: field.kind, hits, box: isPublic ? box : null };
  });
  const correct = judged.filter((item) => item.hits.length === 1 && (item.hits[0] === 'name' || item.hits[0] === 'address') && item.kind === item.hits[0]);
  const wrongBox = judged.filter((item) => item.kind === 'name' || item.kind === 'address').filter((item) => !item.hits.length);
  const falseFields = judged.filter((item) => !item.hits.length);
  summary.push({
    id,
    ms: report.ms,
    ocrMs: report.ocrMs,
    crops: report.crops,
    pixels: report.pixels,
    lines: report.lines,
    wordKinds: report.words.reduce((acc, word) => { acc[word.kind] = (acc[word.kind] || 0) + 1; return acc; }, {}),
    fields: judged.length,
    correct: correct.length,
    wrongBox: wrongBox.length,
    falseFields: falseFields.length,
    fieldKinds: judged.map((item) => item.kind),
    publicFields: isPublic ? judged : undefined,
    heap: report.heap
  });
  console.log(id, JSON.stringify(summary[summary.length - 1]));
}

const upright = await page.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 612; canvas.height = 792;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 612, 792);
  ctx.fillStyle = '#111'; ctx.font = '28px Helvetica, Arial, sans-serif';
  ctx.fillText('Email', 48, 180); ctx.fillRect(180, 186, 320, 3);
  ctx.fillText('Name', 48, 280); ctx.fillRect(180, 286, 320, 3);
  const bin = atob(canvas.toDataURL('image/png').split(',')[1]);
  const png = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) png[i] = bin.charCodeAt(i);
  const doc = await PDFLib.PDFDocument.create();
  const sheet = doc.addPage([612, 792]);
  sheet.drawImage(await doc.embedPng(png), { x: 0, y: 0, width: 612, height: 792 });
  const read = await FormFields.read(new Uint8Array(await doc.save()));
  return (read.fields || []).map((field) => field.label).sort();
});
console.log('UPRIGHT', JSON.stringify(upright));
const food = summary[0];
const adopt = food.correct === 2 && food.falseFields === 0 && upright.join() === 'Email,Name';
const out = { adopt, upright, summary: summary.map((row) => ({ ...row, publicFields: row.publicFields })) };
writeFileSync('/workspace/research/forms-filler/visual-e2e/results/candidate-local.json', JSON.stringify({
  adopt,
  upright,
  summary: summary.map((row) => {
    const copy = { ...row };
    if (!copy.publicFields) delete copy.publicFields;
    return copy;
  })
}, null, 2));
console.log('ADOPT', adopt);
await browser.close();
