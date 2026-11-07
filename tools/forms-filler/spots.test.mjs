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
const wide = layout({
  page: 0,
  width: 612,
  height: 792,
  texts: [{ x: 57, y: 641, w: 32, h: 9, str: 'NAME:' }],
  lines: [{ x: 101, y: 640, w: 454 }],
  squares: []
});
assert.ok(wide.some((field) => field.label === 'NAME:'), 'a wide name rule is kept');
const member = layout({
  page: 0,
  width: 595,
  height: 842,
  texts: [
    { x: 47, y: 554, w: 81, h: 9, str: 'Name of Member (Claimant)' },
    { x: 387, y: 554, w: 26, h: 9, str: 'NRIC No.' }
  ],
  lines: [
    { x: 43, y: 564, w: 510 },
    { x: 43, y: 524, w: 256 },
    { x: 383, y: 524, w: 170 }
  ],
  squares: []
});
const memberNames = member.filter((field) => /Name of Member/.test(field.label));
assert.equal(memberNames.length, 1, 'member name is one box');
assert.ok(Math.abs(memberNames[0].rect.y - 555) < 8, 'member name sits on its label row');
assert.equal(member.filter((field) => /NRIC/.test(field.label)).length, 1);
const dated = layout({
  page: 0,
  width: 595,
  height: 842,
  texts: [
    { x: 47, y: 554, w: 81, h: 9, str: 'Name of Member (Claimant)' },
    { x: 302, y: 514, w: 76, h: 9, str: 'Date of Birth (dd/mm/yyyy)' },
    { x: 47, y: 474, w: 57, h: 9, str: 'Name of Dependant' },
    { x: 302, y: 435, w: 76, h: 9, str: 'Date of Birth (dd/mm/yyyy)' }
  ],
  lines: [
    { x: 298, y: 524, w: 85 },
    { x: 298, y: 485, w: 85 },
    { x: 298, y: 445, w: 85 },
    { x: 298, y: 405, w: 85 }
  ],
  squares: []
});
const births = dated.filter((field) => /Date of Birth/.test(field.label));
assert.equal(births.length, 2, 'each date caption keeps its own cell');
const memberDob = births.find((field) => field.rect.y > 470);
const dependantDob = births.find((field) => field.rect.y < 470);
assert.ok(memberDob && !memberDob.group, 'member date stays with the member');
assert.ok(dependantDob && /dependant/i.test(dependantDob.group || ''), 'dependant date stays with the dependant');
console.log('spots tests ok', fields.length, 'fields');
