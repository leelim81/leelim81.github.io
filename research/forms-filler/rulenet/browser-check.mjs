/** Browser timing and the unchanged reader. Development images stay outside the repo. */
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import pkg from '/tmp/e2e/node_modules/playwright-core/index.js';
const { chromium } = pkg;

const require = createRequire(import.meta.url);
const Frame = require('/tmp/rulenet-wt/tools/forms-filler/frame.js');
const gold = JSON.parse(readFileSync('/tmp/ff-natural-work/provisional-gold.json', 'utf8'));
const lines = JSON.parse(readFileSync('/tmp/rulenet-wt/research/forms-filler/rulenet/equivalence.json', 'utf8'));
const foodLines = null;

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info']
});
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const binHits = [];
page.on('request', (req) => {
  if (req.url().includes('rulenet')) binHits.push(req.url().split('/').pop());
});
await page.goto('http://127.0.0.1:8772/research/forms-filler/rulenet/harness.html');
await page.waitForFunction(() => window.RuleHarness);
const before = binHits.slice();
const rgb = readFileSync('/tmp/rn-wellcome-food-order.rgb');
const b64 = Buffer.from(rgb).toString('base64');
const caps = await page.evaluate(() => ({
  tooBig: window.RuleHarness.capped(2000, 2000),
  food: window.RuleHarness.capped(983, 1600),
  fetches: window.RuleHarness.fetches()
}));
const cancelled = await page.evaluate(async (payload) => {
  const raw = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  const rgba = new Uint8Array(983 * 1600 * 4);
  for (let i = 0; i < 983 * 1600; i++) {
    rgba[i * 4] = raw[i * 3];
    rgba[i * 4 + 1] = raw[i * 3 + 1];
    rgba[i * 4 + 2] = raw[i * 3 + 2];
    rgba[i * 4 + 3] = 255;
  }
  const pending = window.RuleHarness.run(rgba, 983, 1600);
  window.RuleHarness.cancel();
  const stopped = await pending;
  const again = await window.RuleHarness.run(rgba, 983, 1600);
  const warm = [];
  for (let i = 0; i < 3; i++) warm.push(await window.RuleHarness.run(rgba, 983, 1600));
  const cleared = window.RuleHarness.clear();
  const refused = await window.RuleHarness.run(rgba, 2000, 2000);
  return { stopped, again, warm, cleared, refused, fetches: window.RuleHarness.fetches() };
}, b64);
const after = binHits.slice();
await page.close();

function scoreItem(read, spec, targets) {
  const frame = read.frame;
  const scaleX = spec.sourceW / frame.inW;
  const scaleY = spec.sourceH / frame.inH;
  const suggestions = read.fields.map((field) => {
    const sheet = Frame.outputRectToSheet(field, frame);
    const source = Frame.sheetBoxToSource(sheet, frame, scaleX, scaleY);
    return { kind: field.kind, box: source };
  });
  const used = new Set();
  let geometry = 0;
  targets.forEach((target) => {
    let best = null;
    suggestions.forEach((sug, index) => {
      if (used.has(index)) return;
      if (!Frame.contained(sug.box, target.box, Frame.PAD)) return;
      best = index;
    });
    if (best != null) { used.add(best); geometry += 1; }
  });
  return { geometry, suggestions: suggestions.length, angle: frame.angle };
}

const reader = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await reader.goto('http://127.0.0.1:8772/tools/forms-filler/');
await reader.waitForFunction(() => window.FormFields && window.FormEvidence && window.FormThresholds);
const jobs = {
  'wellcome-food-order': { path: '/tmp/ff-natural-work/bounded/wellcome-food-order-bounded.jpg', sourceW: 3442, sourceH: 5601 },
  'nara-p5-front': { path: '/tmp/ff-natural-scans/ff-natural-scans/files/nara-p5-front.jpg', sourceW: 924, sourceH: 1200 },
  'nara-p8': { path: '/tmp/ff-natural-scans/ff-natural-scans/files/nara-p8.jpg', sourceW: 1200, sourceH: 804 }
};
const natural = [];
for (const id of Object.keys(jobs)) {
  const spec = jobs[id];
  const bytes = Array.from(readFileSync(spec.path));
  const read = await reader.evaluate(async (list) => {
    const result = await FormFields.readImage(new Uint8Array(list), 'image/jpeg');
    return {
      frame: result.frame,
      fields: (result.fields || []).map((field) => ({
        kind: FormEvidence.fieldKind(field),
        x: field.rect.x, y: field.rect.y, w: field.rect.width, h: field.rect.height,
        pw: field.pageWidth, ph: field.pageHeight
      }))
    };
  }, bytes);
  const row = scoreItem(read, spec, gold.sources[id].targets);
  natural.push({
    id: gold.sources[id].publication === 'HOLD' ? 'census-held' : id,
    denominator: gold.sources[id].targets.length,
    geometry: row.geometry,
    suggestions: row.suggestions,
    angle: row.angle
  });
  console.log('baseline', natural[natural.length - 1].id, natural[natural.length - 1].geometry + '/' + natural[natural.length - 1].denominator);
}

const foodBytes = Array.from(readFileSync(jobs['wellcome-food-order'].path));
const foodGain = await reader.evaluate(async (list) => {
  const base = await FormFields.readImage(new Uint8Array(list), 'image/jpeg');
  return { frame: base.frame, fields: (base.fields || []).length };
}, foodBytes);

const eq = JSON.parse(readFileSync('/tmp/rulenet-wt/research/forms-filler/rulenet/equivalence.json', 'utf8'));
const foodSegs = JSON.parse(readFileSync('/tmp/rn-food-segs.json', 'utf8'));
const injected = await reader.evaluate(async (payload) => {
  const list = payload.bytes;
  const frameProbe = await FormFields.readImage(new Uint8Array(list), 'image/jpeg');
  const crop = frameProbe.frame.crop;
  const h = frameProbe.frame.outH;
  const lines = payload.segs.map((s) => ({
    x: s[0] - crop.x,
    y: h - (s[2] - crop.y),
    w: s[1] - s[0]
  }));
  window.FormRuleCandidates = { enabled: true, lines: lines };
  const result = await FormFields.readImage(new Uint8Array(list), 'image/jpeg');
  window.FormRuleCandidates = { enabled: false };
  return {
    frame: result.frame,
    fields: (result.fields || []).map((field) => ({
      kind: FormEvidence.fieldKind(field),
      x: field.rect.x, y: field.rect.y, w: field.rect.width, h: field.rect.height,
      pw: field.pageWidth, ph: field.pageHeight
    }))
  };
}, { bytes: foodBytes, segs: foodSegs });
const foodTargets = gold.sources['wellcome-food-order'].targets.filter((target) => target.kind === 'name' || target.kind === 'address');
const gain = scoreItem(injected, jobs['wellcome-food-order'], foodTargets);

const censusBytes = Array.from(readFileSync('/tmp/ff-natural-scans/ff-natural-scans/files/nara-p4-front.jpg'));
const censusRules = await reader.evaluate(async (list) => {
  const sample = await FormFields.ruleSample(new Uint8Array(list), 'image/jpeg');
  const off = window.FormThresholds.ocrAutofill;
  return { frame: sample.frame, h: sample.h, under: sample.under, stroke: sample.stroke, ocrAutofill: off };
}, censusBytes);

const nativeBytes = Array.from(readFileSync('/tmp/rulenet-wt/research/forms-filler/visual-e2e/fixtures/cc0/cc0-form.pdf'));
const native = await reader.evaluate(async (list) => {
  const read = await FormFields.read(new Uint8Array(list));
  return { route: read.route || read.kind, n: (read.fields || []).length };
}, nativeBytes);
await browser.close();

const report = {
  harness: { before, caps, cancelled: { stopped: cancelled.stopped, again: cancelled.again, warm: cancelled.warm, cleared: cancelled.cleared, refused: cancelled.refused, fetches: cancelled.fetches }, after },
  natural,
  foodFieldsBefore: foodGain.fields,
  foodNameAddress: gain,
  censusRules: { nUnder: censusRules.under.length, nStroke: censusRules.stroke.length, frame: censusRules.frame, ocrAutofill: censusRules.ocrAutofill },
  native
};
writeFileSync('/tmp/rulenet-wt/research/forms-filler/rulenet/browser.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  caps,
  stopped: cancelled.stopped,
  cold: cancelled.again,
  warm: cancelled.warm.map((row) => Math.round(row.totalMs)),
  fetches: cancelled.fetches,
  binHits: after,
  natural,
  nameAddressGeometry: gain.geometry,
  nameAddressSuggestions: gain.suggestions,
  native
}, null, 2));
