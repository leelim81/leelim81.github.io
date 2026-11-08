/** Frozen corner table for manual placement. These numbers are the measured
 *  pdf.js viewport corners, not a fit. Scan gates are not in this file. */
import { createRequire } from 'module';
import assert from 'assert';

const require = createRequire(import.meta.url);
const FormCoords = require('../../../tools/pdf-editor/coords.js');
const FormMaps = require('../../../tools/forms-filler/maps.js');

const crop = { x: 0, y: 0, width: 200, height: 400 };
const corners = {
  0: { '0,0': [0, 400], '1,0': [200, 400], '1,1': [200, 0], '0,1': [0, 0] },
  90: { '0,0': [0, 0], '1,0': [0, 400], '1,1': [200, 400], '0,1': [200, 0] },
  180: { '0,0': [200, 0], '1,0': [0, 0], '1,1': [0, 400], '0,1': [200, 400] },
  270: { '0,0': [200, 400], '1,0': [200, 0], '1,1': [0, 0], '0,1': [0, 400] }
};
for (const rotation of [0, 90, 180, 270]) {
  for (const [key, expected] of Object.entries(corners[rotation])) {
    const [fx, fy] = key.split(',').map(Number);
    const point = FormCoords.fractionToPdf(fx, fy, crop, rotation);
    assert.strictEqual(point.x, expected[0], rotation + ' ' + key + ' x');
    assert.strictEqual(point.y, expected[1], rotation + ' ' + key + ' y');
  }
}

const offset = { x: 20, y: 40, width: 150, height: 200 };
assert.deepStrictEqual(FormCoords.fractionToPdf(0, 0, offset, 0), { x: 20, y: 240 });
assert.deepStrictEqual(FormCoords.fractionToPdf(1, 1, offset, 0), { x: 170, y: 40 });
assert.deepStrictEqual(FormCoords.fractionToPdf(0, 0, offset, 90), { x: 20, y: 40 });
assert.deepStrictEqual(FormCoords.fractionToPdf(1, 0, offset, 90), { x: 20, y: 240 });
assert.deepStrictEqual(FormCoords.fractionToPdf(1, 1, offset, 90), { x: 170, y: 240 });
assert.deepStrictEqual(FormCoords.fractionToPdf(0, 1, offset, 90), { x: 170, y: 40 });

const mediaOff = { x: 10, y: 30, width: 200, height: 400 };
assert.deepStrictEqual(FormCoords.fractionToPdf(0, 0, mediaOff, 0), { x: 10, y: 430 });
assert.deepStrictEqual(FormCoords.fractionToPdf(1, 1, mediaOff, 0), { x: 210, y: 30 });

const ann = { x: 0.15, y: 0.25, w: 0.45, h: 0.08 };
const size = 14;
const origin = FormCoords.textOrigin(ann, crop, 0, size);
assert.ok(Math.abs(origin.x - (ann.x * 200 + 1)) < 1e-9);
assert.ok(Math.abs(origin.y - (400 - ann.y * 400 - size * 0.85)) < 1e-9);
const box = FormCoords.boxOf(ann, crop, 0);
assert.ok(Math.abs(box.x - ann.x * 200) < 1e-9);
assert.ok(Math.abs(box.y - (400 - (ann.y + ann.h) * 400)) < 1e-9);
assert.ok(Math.abs(box.width - ann.w * 200) < 1e-9);
assert.ok(Math.abs(box.height - ann.h * 400) < 1e-9);
assert.strictEqual(box.rotate, 0);
assert.strictEqual(FormCoords.boxOf(ann, crop, 90).rotate, 90);
assert.strictEqual(FormCoords.boxOf(ann, crop, 270).rotate, -90);
assert.strictEqual(FormCoords.normRotation(45), null);
assert.strictEqual(FormCoords.normRotation(360), 0);
assert.strictEqual(FormCoords.normRotation(-90), 270);

const sha = 'ab'.repeat(32);
const old = FormMaps.saveMap(FormMaps.empty(), {
  name: 'old',
  fileSha256: sha,
  pages: [{
    width: 200,
    height: 400,
    slots: [{ key: 'email', role: 'applicant', x: 0.1, y: 0.2, w: 0.4, h: 0.05, fontSize: 14, value: 'SECRET_VALUE', profileId: 'ada' }]
  }]
});
assert.strictEqual(old.ok, true);
assert.ok(!JSON.stringify(old.map).includes('SECRET_VALUE'));
assert.ok(!JSON.stringify(old.map).includes('profileId'));
assert.strictEqual(old.map.pages[0].rotation, undefined);
const upright = {
  ok: true,
  rotation: 0,
  userUnit: 1,
  media: { x: 0, y: 0, width: 200, height: 400 },
  crop: { x: 0, y: 0, width: 200, height: 400 }
};
assert.strictEqual(FormMaps.matchesFrame(old.map.pages[0], upright), true);
assert.strictEqual(FormMaps.matchesFrame(old.map.pages[0], Object.assign({}, upright, { rotation: 90 })), false);
assert.strictEqual(FormMaps.matchesFrame(old.map.pages[0], Object.assign({}, upright, {
  crop: { x: 20, y: 0, width: 180, height: 400 }
})), false);

const turned = FormMaps.saveMap(FormMaps.empty(), {
  name: 'turned',
  fileSha256: sha,
  pages: [{
    width: 200, height: 400, rotation: 90, userUnit: 2,
    cropX: 0, cropY: 0, cropWidth: 200, cropHeight: 400,
    slots: [{ key: 'name', role: 'applicant', x: 0.2, y: 0.3, w: 0.4, h: 0.05 }]
  }]
});
assert.strictEqual(turned.ok, true);
assert.strictEqual(turned.map.pages[0].rotation, 90);
assert.strictEqual(FormMaps.matchesFrame(turned.map.pages[0], Object.assign({}, upright, { rotation: 90, userUnit: 2 })), true);
assert.strictEqual(FormMaps.matchesFrame(turned.map.pages[0], upright), false);

const bad = FormMaps.saveMap(FormMaps.empty(), {
  name: 'bad',
  fileSha256: sha,
  pages: [{ width: 200, height: 400, rotation: 45, userUnit: 1, cropX: 0, cropY: 0, cropWidth: 200, cropHeight: 400, slots: [] }]
});
assert.strictEqual(bad.reason, 'malformed');
const partial = FormMaps.saveMap(FormMaps.empty(), {
  name: 'partial',
  fileSha256: sha,
  pages: [{ width: 200, height: 400, rotation: 90, slots: [] }]
});
assert.strictEqual(partial.reason, 'malformed');

console.log('coords ledger ok');
