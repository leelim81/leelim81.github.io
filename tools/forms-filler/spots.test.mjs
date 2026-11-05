import { createRequire } from 'module';
import assert from 'assert';
const require = createRequire(import.meta.url);
const { layout, annotations, chosen } = require('./spots.js');

const page = {
  page: 0,
  width: 600,
  height: 800,
  texts: [
    { x: 40, y: 700, w: 70, h: 9, str: 'Full Name' },
    { x: 40, y: 640, w: 90, h: 9, str: 'NRIC/FIN Number' },
    { x: 40, y: 568, w: 36, h: 9, str: 'Gender' },
    { x: 120, y: 568, w: 28, h: 8, str: 'Male' },
    { x: 200, y: 568, w: 40, h: 8, str: 'Female' },
    { x: 320, y: 618, w: 70, h: 8, str: 'Blk/House No.' },
    { x: 470, y: 618, w: 50, h: 8, str: 'Unit No. #' }
  ],
  lines: [
    { x: 40, y: 680, w: 220 },
    { x: 40, y: 662, w: 220 },
    { x: 40, y: 620, w: 140 },
    { x: 400, y: 618, w: 60 },
    { x: 530, y: 618, w: 50 }
  ],
  squares: [
    { x: 108, y: 566, w: 9, h: 9 },
    { x: 188, y: 566, w: 9, h: 9 }
  ]
};

const fields = layout(page);
const by = (re) => fields.filter((field) => re.test(field.label));
assert.equal(by(/^Full Name$/).length, 1, 'one full-name box');
assert.ok(by(/^Full Name$/)[0].rect.height > 20, 'full name covers both lines');
assert.equal(by(/NRIC/).length, 1);
assert.equal(by(/Blk/).length, 1);
assert.equal(by(/Unit/).length, 1);
const male = fields.find((field) => field.label === 'Male');
const female = fields.find((field) => field.label === 'Female');
assert.equal(male.group, 'Gender');
assert.equal(female.group, 'Gender');
assert.ok(chosen(male, 'Male'));
assert.equal(chosen(female, 'Male'), false);

const boxes = annotations(fields, { [by(/^Full Name$/)[0].id]: 'Tan Wei Ming', [male.id]: 'Male' });
const pageBoxes = boxes[0];
assert.ok(pageBoxes.some((box) => box.text === 'Tan Wei Ming' && box.type === 'text'));
assert.ok(pageBoxes.some((box) => box.text === 'X'));
assert.equal(pageBoxes.filter((box) => box.text === 'X').length, 1);
const name = pageBoxes.find((box) => box.text === 'Tan Wei Ming');
assert.ok(name.y > 0 && name.y < 1 && name.w > 0.1);
console.log('spots tests ok', fields.length, 'fields');
