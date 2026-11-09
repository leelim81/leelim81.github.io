import assert from 'assert';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { acceptDrawnBox } = require('./fields.js');

function corners(box) {
  return [
    [box.x, box.y],
    [box.x + box.w, box.y],
    [box.x + box.w, box.y + box.h],
    [box.x, box.y + box.h],
    [box.x + 4, box.y],
    [box.x + box.w - 4, box.y + box.h]
  ];
}
const name = { x: 31.7, y: 197.4, w: 531.8, h: 17 };
const pale = { r: 0.93, g: 0.93, b: 0.93, set: true };
const label = [{ str: 'Name as per Example Bank Account', x: 31.7, y: 220, w: 230, h: 9 }];
assert.equal(acceptDrawnBox({ box: name, points: corners(name), fill: pale, strokedOnly: false, texts: label, lines: [], pageWidth: 595.28 }), true);
assert.equal(acceptDrawnBox({ box: name, points: corners(name), fill: { r: 0.12, g: 0.12, b: 0.12, set: true }, strokedOnly: false, texts: label, lines: [], pageWidth: 595.28 }), false);
assert.equal(acceptDrawnBox({ box: name, points: corners(name), fill: { r: 0.1, g: 0.35, b: 0.85, set: true }, strokedOnly: false, texts: label, lines: [], pageWidth: 595.28 }), false);
assert.equal(acceptDrawnBox({ box: name, points: corners(name), fill: { r: 0.7, g: 0.7, b: 0.7, set: true }, strokedOnly: false, texts: label, lines: [], pageWidth: 595.28 }), false);
assert.equal(acceptDrawnBox({ box: name, points: corners(name), fill: pale, strokedOnly: false, texts: [], lines: [], pageWidth: 595.28 }), false);
assert.equal(acceptDrawnBox({ box: { x: 480, y: 760, w: 48, h: 28 }, points: corners({ x: 480, y: 760, w: 48, h: 28 }), fill: pale, strokedOnly: false, texts: [{ str: 'Logo', x: 420, y: 770, w: 30, h: 9 }], lines: [], pageWidth: 595.28 }), false);
assert.equal(acceptDrawnBox({ box: name, points: corners(name), fill: pale, strokedOnly: false, texts: label, lines: [{ x: 31.7, y: 197.4, w: 531.8 }], pageWidth: 595.28 }), false);
assert.equal(acceptDrawnBox({ box: name, points: [[name.x, name.y], [name.x + name.w, name.y + name.h]], fill: pale, strokedOnly: true, texts: label, lines: [], pageWidth: 595.28 }), false);
console.log('box tests ok');
