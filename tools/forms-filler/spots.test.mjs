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

const { identityPhotoSlot } = require('./evidence.js');
function linedForm(blocks) {
  const texts = [];
  const lines = [];
  blocks.forEach(function (block) {
    texts.push({ x: 48, y: block.y, w: Math.min(240, Math.max(70, block.heading.length * 6.5)), h: 11, str: block.heading });
    block.fields.forEach(function (field) {
      var labelW = Math.min(210, Math.max(40, field.label.length * 5.6));
      texts.push({ x: 48, y: field.y, w: labelW, h: 9, str: field.label });
      lines.push({ x: 48 + labelW + 16, y: field.y - 1, w: 200 });
    });
  });
  return layout({ page: 0, width: 595, height: 842, texts: texts, lines: lines, squares: [] });
}
function offeredIds(found) {
  return found.filter(function (field) { return identityPhotoSlot(field, found); }).map(function (field) { return field.label + '|' + (field.section || field.group || ''); });
}
const roles = [
  'Guarantor',
  'Nominee',
  'Beneficiary',
  'Next of kin',
  'Emergency contact',
  'Spouse',
  'Witness',
  'Referee',
  'Authorised signatory',
  'Joint applicant'
];
roles.forEach(function (role) {
  const only = linedForm([
    { heading: role, y: 700, fields: [{ label: 'Name', y: 640 }, { label: 'NRIC', y: 580 }] }
  ]);
  const names = only.filter(function (field) { return /^name$/i.test(field.label); });
  const ids = only.filter(function (field) { return /^nric$/i.test(field.label); });
  assert.equal(names.length, 1, role + ' keeps the name line');
  assert.equal(ids.length, 1, role + ' keeps the id line');
  assert.ok(names[0].section === role || names[0].group === role, role + ' owns the name line ' + JSON.stringify(names[0].section));
  assert.equal(offeredIds(only).length, 0, role + ' only section offers nothing ' + offeredIds(only).join(','));
});
const guarantorOnly = linedForm([
  { heading: 'Particulars of Guarantor', y: 700, fields: [{ label: 'Name', y: 640 }, { label: 'NRIC', y: 580 }] }
]);
assert.equal(offeredIds(guarantorOnly).length, 0, 'a guarantor-only form offers nothing');
assert.ok(/guarantor/i.test((guarantorOnly.find(function (field) { return field.label === 'Name'; }) || {}).section || ''), 'guarantor particulars stay on the name line');
roles.forEach(function (role) {
  const mixed = linedForm([
    { heading: "Applicant's particulars", y: 720, fields: [{ label: 'Full name', y: 670 }, { label: 'NRIC/FIN/passport no.', y: 620 }] },
    { heading: role, y: 520, fields: [{ label: 'Name', y: 470 }, { label: 'NRIC', y: 420 }] }
  ]);
  const offered = mixed.filter(function (field) { return identityPhotoSlot(field, mixed); });
  assert.ok(offered.some(function (field) { return field.label === 'Full name'; }), role + ' mixed still offers the applicant name');
  assert.ok(offered.some(function (field) { return /NRIC\/FIN\/passport/i.test(field.label); }), role + ' mixed still offers the applicant id');
  assert.ok(!offered.some(function (field) { return field.section === role || field.group === role; }), role + ' mixed does not offer the other person ' + offered.map(function (field) { return field.label; }).join(','));
});
const plain = linedForm([
  { heading: 'Membership application', y: 720, fields: [
    { label: 'Full name', y: 660 },
    { label: 'NRIC/FIN/passport no.', y: 600 }
  ] }
]);
const plainOffered = plain.filter(function (field) { return identityPhotoSlot(field, plain); }).map(function (field) { return field.label; });
assert.ok(plainOffered.indexOf('Full name') >= 0, 'a form with no other person offers full name ' + plainOffered.join('|'));
assert.ok(plainOffered.some(function (label) { return /NRIC\/FIN\/passport/i.test(label); }), 'a form with no other person offers the id line ' + plainOffered.join('|'));
const ordinary = linedForm([
  { heading: "Applicant's particulars", y: 720, fields: [
    { label: 'Full name', y: 660 },
    { label: 'Name as per NRIC', y: 600 },
    { label: 'NRIC/FIN/passport no.', y: 540 }
  ] }
]);
const ordinaryOffered = ordinary.filter(function (field) { return identityPhotoSlot(field, ordinary); }).map(function (field) { return field.label; });
assert.ok(ordinaryOffered.indexOf('Full name') >= 0, 'ordinary full name is offered ' + ordinaryOffered.join('|'));
assert.ok(ordinaryOffered.some(function (label) { return /Name as per NRIC/i.test(label); }), 'ordinary name as per NRIC is offered ' + ordinaryOffered.join('|'));
assert.ok(ordinaryOffered.some(function (label) { return /NRIC\/FIN\/passport/i.test(label); }), 'ordinary id line is offered ' + ordinaryOffered.join('|'));
assert.equal(ordinary.filter(function (field) { return /guarantor|nominee|spouse/i.test(field.section || ''); }).length, 0);

['Co-borrower', 'Proxy', 'Insured person', 'Employer', 'Landlord', 'Tenant', 'Owner 2', 'Guardian', 'Trustee', 'Partner', 'Director 2', 'Signatory 2'].forEach(function (role) {
  const only = linedForm([
    { heading: role, y: 700, fields: [{ label: 'Name', y: 640 }, { label: 'NRIC', y: 580 }] }
  ]);
  assert.equal(offeredIds(only).length, 0, role + ' only section offers nothing ' + offeredIds(only).join(','));
  assert.ok(only.some(function (field) { return field.label === 'Name' && (field.section === role || field.group === role); }), role + ' owns the name line');
});

['Part A', 'Personal details', 'Membership application', "Applicant's particulars"].forEach(function (heading) {
  const block = linedForm([
    { heading: heading, y: 720, fields: [
      { label: 'Full name', y: 660 },
      { label: 'Name as per NRIC', y: 600 },
      { label: 'NRIC/FIN/passport no.', y: 540 }
    ] }
  ]);
  const labels = block.filter(function (field) { return identityPhotoSlot(field, block); }).map(function (field) { return field.label; });
  assert.ok(labels.indexOf('Full name') >= 0, heading + ' offers full name ' + labels.join('|'));
  assert.ok(labels.some(function (label) { return /Name as per NRIC/i.test(label); }), heading + ' offers name as per NRIC ' + labels.join('|'));
  assert.ok(labels.some(function (label) { return /NRIC\/FIN\/passport/i.test(label); }), heading + ' offers the id ' + labels.join('|'));
});

const farGuarantor = linedForm([
  { heading: 'Guarantor', y: 760, fields: [{ label: 'Name', y: 140 }, { label: 'NRIC', y: 100 }] }
]);
assert.equal(offeredIds(farGuarantor).length, 0, 'a heading more than 420pt above still owns the blank ' + offeredIds(farGuarantor).join(','));
assert.ok(/guarantor/i.test((farGuarantor.find(function (field) { return field.label === 'Name'; }) || {}).section || ''), 'far guarantor heading is kept');

const columns = layout({
  page: 0,
  width: 595,
  height: 842,
  texts: [
    { x: 40, y: 760, w: 150, h: 11, str: "Applicant's particulars" },
    { x: 40, y: 700, w: 70, h: 9, str: 'Full name' },
    { x: 40, y: 640, w: 36, h: 9, str: 'NRIC' },
    { x: 330, y: 760, w: 80, h: 11, str: 'Guarantor' },
    { x: 330, y: 700, w: 36, h: 9, str: 'Name' },
    { x: 330, y: 640, w: 36, h: 9, str: 'NRIC' }
  ],
  lines: [
    { x: 40, y: 682, w: 200 },
    { x: 40, y: 622, w: 200 },
    { x: 330, y: 682, w: 200 },
    { x: 330, y: 622, w: 200 }
  ],
  squares: []
});
assert.equal(columns.filter(function (field) { return field.label === 'NRIC'; }).length, 2, 'side-by-side NRIC lines both stay ' + columns.map(function (field) { return field.label + '@' + Math.round(field.rect.x); }).join(','));
const columnOffer = columns.filter(function (field) { return identityPhotoSlot(field, columns); });
assert.ok(columnOffer.some(function (field) { return field.label === 'Full name'; }) && columnOffer.some(function (field) { return field.label === 'NRIC' && field.rect.x < 200; }), 'only the applicant column is offered');
assert.ok(!columnOffer.some(function (field) { return /guarantor/i.test(field.section || field.group || ''); }), 'the guarantor column is not offered');

const firstPage = {
  page: 0,
  width: 595,
  height: 842,
  texts: [
    { x: 48, y: 720, w: 160, h: 11, str: "Applicant's particulars" },
    { x: 48, y: 660, w: 70, h: 9, str: 'Full name' },
    { x: 48, y: 160, w: 80, h: 11, str: 'Guarantor' }
  ],
  lines: [{ x: 160, y: 659, w: 200 }],
  squares: []
};
const firstFields = layout(firstPage);
assert.equal(firstPage.lastPerson, 'Guarantor', 'the last heading on the page is carried forward');
const secondPage = {
  page: 1,
  width: 595,
  height: 842,
  carriedPerson: firstPage.lastPerson,
  texts: [
    { x: 48, y: 700, w: 36, h: 9, str: 'Name' },
    { x: 48, y: 640, w: 36, h: 9, str: 'NRIC' }
  ],
  lines: [
    { x: 120, y: 699, w: 200 },
    { x: 120, y: 639, w: 200 }
  ],
  squares: []
};
const secondFields = layout(secondPage);
assert.ok(secondFields.every(function (field) { return /guarantor/i.test(field.section || ''); }), 'page 2 keeps the guarantor section ' + secondFields.map(function (field) { return field.section; }).join('|'));
const continued = firstFields.concat(secondFields);
assert.equal(continued.filter(function (field) { return identityPhotoSlot(field, continued) && /guarantor/i.test(field.section || ''); }).length, 0, 'a continued guarantor page is not offered');
assert.ok(continued.some(function (field) { return field.label === 'Full name' && identityPhotoSlot(field, continued); }), 'the applicant name on page 1 is still offered');

const declared = linedForm([
  { heading: "Applicant's particulars", y: 760, fields: [{ label: 'Full name', y: 710 }, { label: 'NRIC', y: 660 }] },
  { heading: 'Declaration', y: 250, fields: [{ label: 'Name', y: 200 }, { label: 'NRIC', y: 150 }] }
]);
const declaredOffer = declared.filter(function (field) { return identityPhotoSlot(field, declared); }).map(function (field) { return field.label; });
assert.ok(declaredOffer.indexOf('Full name') >= 0 && declaredOffer.some(function (label) { return label === 'NRIC'; }), 'the applicant block is still offered ' + declaredOffer.join('|'));
assert.equal(declared.filter(function (field) { return identityPhotoSlot(field, declared) && /declaration/i.test(field.section || ''); }).length, 0, 'declaration lines are not offered ' + declared.map(function (field) { return field.label + '=' + (field.section || ''); }).join('|'));

const byApplicant = linedForm([
  { heading: 'Declaration by applicant', y: 700, fields: [{ label: 'Name', y: 640 }, { label: 'NRIC', y: 580 }] }
]);
assert.equal(offeredIds(byApplicant).length, 0, 'declaration by applicant is not an identity section ' + offeredIds(byApplicant).join(','));

const ownerOnly = linedForm([
  { heading: "Owner's particulars", y: 700, fields: [{ label: 'Name', y: 640 }] }
]);
assert.equal(offeredIds(ownerOnly).length, 0, 'owner particulars are not the applicant');
const bareOwner = linedForm([
  { heading: 'Owner', y: 700, fields: [{ label: 'Name', y: 640 }] }
]);
assert.equal(offeredIds(bareOwner).length, 0, 'a bare owner heading is not the applicant');

const contactLines = layout({
  page: 0,
  width: 595,
  height: 842,
  texts: [
    { x: 48, y: 700, w: 60, h: 11, str: 'Contact' },
    { x: 48, y: 640, w: 40, h: 9, str: 'Name' }
  ],
  lines: [
    { x: 140, y: 699, w: 180 },
    { x: 120, y: 639, w: 200 }
  ],
  squares: []
});
assert.equal(contactLines.filter(function (field) { return /^contact$/i.test(field.label); }).length, 0, 'a Contact heading is not a field ' + contactLines.map(function (field) { return field.label; }).join('|'));
assert.equal(contactLines.filter(function (field) { return identityPhotoSlot(field, contactLines); }).length, 0, 'a name under Contact is not offered');

const declarePage = {
  page: 1,
  width: 595,
  height: 842,
  carriedPerson: "Applicant's particulars",
  texts: [
    { x: 48, y: 760, w: 90, h: 11, str: 'Declaration' },
    { x: 48, y: 700, w: 40, h: 9, str: 'Name' },
    { x: 48, y: 640, w: 36, h: 9, str: 'NRIC' }
  ],
  lines: [
    { x: 120, y: 699, w: 200 },
    { x: 120, y: 639, w: 200 }
  ],
  squares: []
};
const declareFields = layout(declarePage);
assert.equal(declarePage.lastPerson, '', 'a declaration clears the carried applicant');
assert.equal(declareFields.filter(function (field) { return identityPhotoSlot(field, declareFields); }).length, 0, 'page 2 declaration lines are not offered ' + declareFields.map(function (field) { return field.section; }).join('|'));
const withNote = layout({
  page: 0,
  width: 595,
  height: 842,
  texts: [
    { x: 48, y: 720, w: 160, h: 11, str: "Applicant's particulars" },
    { x: 48, y: 680, w: 70, h: 9, str: 'See Part B' },
    { x: 48, y: 640, w: 70, h: 9, str: 'Full name' }
  ],
  lines: [{ x: 160, y: 639, w: 200 }],
  squares: []
});
assert.ok(withNote.some(function (field) { return field.label === 'Full name' && identityPhotoSlot(field, withNote); }), 'See Part B does not reset the applicant name ' + withNote.map(function (field) { return field.label + '=' + (field.section || ''); }).join('|'));
["Declaration of the applicant", "Applicant's declaration", 'Part B continued'].forEach(function (heading) {
  const only = linedForm([{ heading: heading, y: 700, fields: [{ label: 'Name', y: 640 }, { label: 'NRIC', y: 580 }] }]);
  assert.equal(offeredIds(only).length, 0, heading + ' is a reset ' + offeredIds(only).join(','));
});
console.log('spots tests ok', fields.length, 'fields');
