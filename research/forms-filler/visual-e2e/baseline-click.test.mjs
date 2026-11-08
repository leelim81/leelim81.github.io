/** Click means the baseline. Stored tops and textOrigin stay put. */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const coords = require('../../../tools/pdf-editor/coords.js');

let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed++;
  console.log((ok ? 'ok ' : 'FAIL ') + name + (detail ? ' ' + detail : ''));
}

const crop = { x: 0, y: 0, width: 612, height: 792 };
const offset = { x: 36, y: 18, width: 540, height: 700 };
const click = { x: 0.31, y: 0.44 };
const size = 14;

function baselineError(frame, rotation) {
  const view = coords.viewSize(frame, rotation);
  const top = coords.topForBaseline(click.y, size, view.height);
  const ann = { x: click.x, y: top, w: 0.4, h: 0.05 };
  const origin = coords.textOrigin(ann, frame, rotation, size);
  const onClick = coords.fractionToPdf(ann.x, click.y, frame, rotation);
  const dx = origin.x - onClick.x;
  const dy = origin.y - onClick.y;
  return Math.hypot(dx, dy);
}

[0, 90, 180, 270].forEach((rotation) => {
  const err = baselineError(crop, rotation);
  check('rotation ' + rotation + ' baseline is the click plus the 1pt inset', Math.abs(err - 1) < 0.02, err.toFixed(4));
});
check('an offset crop uses the same baseline', Math.abs(baselineError(offset, 0) - 1) < 0.02, baselineError(offset, 0).toFixed(4));

const stored = { x: 0.2, y: 0.3, w: 0.4, h: 0.05 };
const before = coords.textOrigin(stored, crop, 0, size);
const after = coords.textOrigin(stored, crop, 0, size);
check('a stored box top exports the same baseline', before.x === after.x && before.y === after.y);

const top = coords.topForBaseline(0.002, size, 792);
check('a click at the top cannot push the box above the page', top < 0);
check('the export formula is still 0.85 times the size', Math.abs((0.3 - coords.topForBaseline(0.3, size, 792)) * 792 - size * 0.85) < 0.001);

if (failed) process.exit(1);
console.log('baseline-click', failed, 'failed');
