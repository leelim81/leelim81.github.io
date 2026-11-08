/** Stage counts for the 13 frozen development targets. Gold is not edited.
 *  Census wording and pixel boxes stay out of the written result. */
import { readFileSync, writeFileSync } from 'fs';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';

const gold = JSON.parse(readFileSync('/tmp/ff-natural-work/provisional-gold.json', 'utf8'));
const jobs = [
  {
    id: 'food-order',
    public: true,
    file: '/tmp/ff-natural-work/bounded/wellcome-food-order-bounded.jpg',
    source: gold.sources['wellcome-food-order'],
    fileW: 983,
    fileH: 1600
  },
  {
    id: 'census-3',
    public: false,
    file: '/tmp/ff-natural-scans/ff-natural-scans/files/nara-p5-front.jpg',
    source: gold.sources['nara-p5-front'],
    fileW: 924,
    fileH: 1200
  },
  {
    id: 'census-2',
    public: false,
    file: '/tmp/ff-natural-scans/ff-natural-scans/files/nara-p8.jpg',
    source: gold.sources['nara-p8'],
    fileW: 1200,
    fileH: 804
  }
];

function toFile(box, source, fileW, fileH) {
  const sx = fileW / source.width;
  const sy = fileH / source.height;
  return [box[0] * sx, box[1] * sy, box[2] * sx, box[3] * sy];
}

const { chromium } = pkg;
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  headless: true
});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8765/tools/forms-filler/bench.html?stage=' + Date.now());
await page.waitForFunction(() => window.FormFields && window.FormFields.stageReport);

function overlaps(line, box) {
  const y = line.y;
  if (y < box[1] - 4 || y > box[3] + 4) return false;
  return line.x < box[2] && line.x + line.w > box[0];
}
function knownKind(kind) {
  return kind === 'name' || kind === 'address';
}

const privateRows = [];
const publicRows = [];
for (const job of jobs) {
  const targets = job.source.targets.map((target) => ({
    id: target.id,
    kind: target.kind,
    box: toFile(target.box, job.source, job.fileW, job.fileH)
  }));
  const bytes = Array.from(readFileSync(job.file));
  const heapBefore = await page.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : null);
  const report = await page.evaluate(async ({ list, bands }) => {
    return await FormFields.stageReport(new Uint8Array(list), 'image/jpeg', bands);
  }, { list: bytes, bands: targets.map((target) => target.box) });
  const heapAfter = await page.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : null);
  const crop = report.frame.crop;
  const stages = targets.map((target, index) => {
    const band = report.bands[index];
    const sheet = [
      target.box[0] / (report.frame.sourceW / report.frame.inW) - crop.x,
      target.box[1] / (report.frame.sourceH / report.frame.inH) - crop.y,
      target.box[2] / (report.frame.sourceW / report.frame.inW) - crop.x,
      target.box[3] / (report.frame.sourceH / report.frame.inH) - crop.y
    ];
    const ruleTop = sheet[3] - 6;
    const lineHit = ['plain', 'contrast', 'under', 'stroke'].filter((name) => {
      return (report.lines[name] || []).some((line) => {
        if (line.y < ruleTop - 4 || line.y > sheet[3] + 8) return false;
        const overlap = Math.min(line.x + line.w, sheet[2]) - Math.max(line.x, sheet[0]);
        return overlap > (sheet[2] - sheet[0]) * 0.3;
      });
    });
    function nearWords(list) {
      return (list || []).filter((word) => word.x < sheet[2] + 40 && word.x + word.w > sheet[0] - 120
        && word.y < sheet[3] + 40 && word.y + word.h > sheet[1] - 50);
    }
    const wordHit = nearWords(report.words);
    const contrastHit = nearWords(report.contrastWordBoxes);
    const rowSamples = Math.max(1, Math.ceil((sheet[2] - sheet[0]) / 2));
    let stage = 'geometry';
    if (!band.onSheet) stage = 'crop';
    else if ((sheet[3] - sheet[1]) < 2) stage = 'resize';
    else if (!band.bestRow || band.bestRow.mask < rowSamples * 0.15 || band.bestRow.delta < 8) stage = 'contrast';
    else if (!lineHit.length) stage = 'rule';
    else if (!knownKind(target.kind)) stage = 'schema';
    else if (!wordHit.some((word) => word.kind === target.kind)) stage = 'ocr';
    else stage = 'link';
    return {
      id: job.public ? target.id : 'target',
      kind: target.kind,
      stage,
      onSheet: band.onSheet,
      deltaP90: band.deltaP90,
      deltaMedian: band.deltaMedian,
      strong30: band.strong30,
      mask: band.mask,
      greenMedian: band.greenMedian,
      lines: lineHit,
      bestRow: band.bestRow,
      wordKinds: wordHit.map((word) => word.kind),
      contrastWordKinds: contrastHit.map((word) => word.kind)
    };
  });
  const row = {
    id: job.id,
    ms: report.ms,
    heap: { before: heapBefore, after: heapAfter },
    frame: {
      in: [report.frame.inW, report.frame.inH],
      out: [report.frame.outW, report.frame.outH],
      crop: report.frame.crop,
      source: [report.frame.sourceW, report.frame.sourceH]
    },
    counts: report.counts,
    stages,
    fieldKinds: report.fields.map((field) => field.kind),
    falseFields: report.fields.length
  };
  privateRows.push(row);
  publicRows.push(job.public ? row : {
    id: job.id,
    ms: row.ms,
    counts: row.counts,
    stages: stages.map((item) => ({ kind: item.kind, stage: item.stage, lines: item.lines, bestDelta: item.bestRow && item.bestRow.delta, contrastWordKinds: item.contrastWordKinds })),
    fieldKinds: row.fieldKinds
  });
  console.log(job.id, JSON.stringify({ ms: report.ms, counts: report.counts, stages: stages.map((item) => item.kind + ':' + item.stage) }));
}
writeFileSync('/tmp/ff-natural-work/stage-private.json', JSON.stringify(privateRows, null, 2));
writeFileSync('/workspace/research/forms-filler/visual-e2e/results/stage-diagnostic.json', JSON.stringify(publicRows, null, 2));
await browser.close();
console.log('wrote stage diagnostic');
