/* Layouts copied from the public PDFs. The files themselves are not committed. */
import assert from 'assert';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { decideAll } = require('./select.js');

const packet = `Applicant
Full name: Ada Lane
NRIC: S1234567D
Address: 10 Example Road
`;
const open = { autofill: { name: true, nric: true, address: true, given: true, surname: true } };
const NAME = 'Ada Lane';

function placed(fields) {
  return Object.fromEntries(decideAll(fields, packet, open).map((row) => [row.fieldId, row]));
}
function text(x, y, w, str) {
  return { x: x, y: y, w: w, h: 9, str: str };
}
function field(id, label, x, y, w, h, texts) {
  return { id: id, label: label, type: 'text', page: 0, rect: { x: x, y: y, width: w, height: h }, pageTexts: texts, texts: texts };
}

const tenancyTexts = [
  text(63, 632, 117, 'Full Name of Applicant (IN'),
  text(218, 394, 160, 'Particulars of Intended Occupiers'),
  text(63, 380, 27, 'Name'),
  text(140, 380, 49, 'Citizenship'),
  text(257, 380, 17, 'Sex')
];
const tenancy = placed([
  field('occ', 'Name', 58, 362, 153, 12, tenancyTexts)
]);
assert.equal(tenancy.occ.value, '', 'tenancy occupant name');
assert.equal(tenancy.occ.refusal, 'other-person');

[
  'PARTICULARS OF APPLICANT (PLEASE COMPLETE IN BLOCK LETTERS)',
  'APPLICANT DETAILS (PLEASE USE BLOCK LETTERS)'
].forEach(function (title) {
  const texts = [
    text(40, 520, 140, 'Particulars of Occupiers'),
    text(40, 430, 280, title),
    text(40, 380, 27, 'Name')
  ];
  const rows = placed([
    field('occ', 'Name', 40, 470, 160, 12, texts),
    field('app', 'Name', 40, 360, 180, 14, texts)
  ]);
  assert.equal(rows.occ.value, '', title + ' occupier');
  assert.equal(rows.occ.refusal, 'other-person', title);
  assert.equal(rows.app.value, NAME, title);
  assert.equal(rows.app.decision, 'review', title);
});

const dbsTexts = [
  text(105, 529, 55, '1st Applicant'),
  text(373, 529, 59, '2nd Applicant'),
  text(86, 465, 201, '(Name on debit card not to exceed 20 characters including blank spaces)'),
  text(407, 364, 38, 'Nominee'),
  text(85, 353, 48, 'Distinguishing'),
  text(261, 353, 20, 'Name'),
  text(331, 353, 27, 'Address'),
  text(411, 353, 59, 'Relationship with')
];
const dbs = placed([
  field('card', 'Name', 86, 474, 201, 12, dbsTexts),
  field('nom', 'Name', 285, 354, 43, 12, dbsTexts)
]);
assert.equal(dbs.card.value, '', 'DBS debit-card name');
assert.equal(dbs.card.reason, 'card_imprint');
assert.equal(dbs.nom.value, '', 'DBS nominee name');
assert.equal(dbs.nom.refusal, 'other-person');

const f24 = placed([
  field('name', 'Name', 181, 115, 386, 25, [text(73, 155, 159, 'personal particulars and signature.')]),
  { id: 'sign', label: "Taxpayers' Signature", type: 'text', page: 0, rect: { x: 334, y: 64, width: 233, height: 39 } }
]);
assert.equal(f24.name.value, '', 'F24 name above the signature');
assert.equal(f24.name.refusal, 'signature');

const qcrTexts = [
  text(117, 489, 23, 'Child'),
  text(153, 489, 63, 'Name of Child'),
  text(241, 489, 87, 'Child NRIC Number'),
  text(355, 489, 23, 'State'),
  text(126, 425, 17, 'child'),
  text(161, 435, 48, 'Ashley Chua')
];
const qcr = placed([
  field('name', 'Name', 138, 304, 395, 11, qcrTexts)
]);
assert.equal(qcr.name.value, NAME, 'QCR applicant name');
assert.equal(qcr.name.decision, 'review');

const w4Texts = [
  text(122, 734, 369, 'Complete Form W-4 so that your employer can withhold the correct federal income tax from your pay.'),
  text(243, 723, 126, 'Give Form W-4 to your employer.'),
  text(36, 66, 48, 'Employers'),
  text(98, 68, 140, "Employer's name and address")
];
const w4 = placed([
  field('first', 'First name and middle initial', 95, 684, 178, 14, w4Texts),
  field('addr', 'Address', 95, 660, 380, 14, w4Texts),
  field('er', "Employer's name and address", 95, 36, 293, 30, w4Texts)
]);
assert.notEqual(w4.first.refusal, 'other-person', 'W-4 first name');
assert.equal(w4.addr.value, '10 Example Road', 'W-4 address');
assert.equal(w4.er.value, '', 'W-4 employer address');

const w9 = placed([
  field('line1', 'Name of entity/individual', 59, 660, 517, 14, [])
]);
assert.equal(w9.line1.value, NAME, 'W-9 line 1');
assert.equal(w9.line1.decision, 'review');

const form8822 = placed([
  field('you', 'Your name', 36, 528, 403, 24, [text(65, 518, 51, "Spouse's name")]),
  field('spouse', "Spouse's name", 36, 492, 403, 24, [text(65, 518, 51, "Spouse's name")])
]);
assert.equal(form8822.you.value, NAME, '8822 your name');
assert.equal(form8822.spouse.value, '', '8822 spouse');
assert.equal(form8822.spouse.refusal, 'other-person');

const evidence = require('./evidence.js');
const { layout } = require('./spots.js');
assert.equal(evidence.isSectionHeading('Please complete every field before you sign.'), '');
assert.equal(evidence.isSectionHeading('The applicant must sign the declaration.'), '');
assert.equal(evidence.isSectionHeading("Mother's Maiden Name"), '');
assert.equal(evidence.isSectionHeading('Name of Employer'), '');
assert.equal(evidence.isSectionHeading("Father's Name:"), '');
assert.equal(evidence.isSectionHeading('providing personal details to the Bank'), '');
assert.equal(require('./person.js').sectionKind('About Myself/Parent/Legal Guardian/Administrator'), 'applicant');
assert.equal(require('./person.js').sectionKind('About My Joint Applicant/Child/Beneficiary'), 'other');

function offeredSlots(fields) {
  evidence.applySectionContext(fields);
  return Object.fromEntries(fields.map((field) => [field.id, evidence.identityPhotoSlot(field, fields)]));
}

/* DBS Hong Kong personal account opening, page 1. "Mother's Maiden Name"
   and "Name of Employer" are blanks, not sections. */
const dbsHkTexts = [
  text(40, 425, 220, 'Personal Data of Sole/Principal Applicant'),
  text(40, 406, 240, 'providing personal details to the Bank'),
  text(42, 374, 40, 'Gender'),
  text(42, 351, 160, 'Name in English (Surname first)'),
  text(473, 351, 110, "Mother's Maiden Name"),
  text(203, 257, 70, 'Date of Birth'),
  text(42, 233, 110, 'Residential Address'),
  text(42, 117, 90, 'Name of Employer')
];
const dbsHk = offeredSlots([
  field('name', 'Name in English (Surname first)', 210, 348, 150, 12, dbsHkTexts),
  field('maiden', "Mother's Maiden Name", 473, 336, 90, 12, dbsHkTexts),
  field('dob', 'Date of Birth', 280, 250, 120, 12, dbsHkTexts),
  field('home', 'Residential Address', 160, 226, 300, 12, dbsHkTexts),
  field('employer', 'Name of Employer', 140, 110, 200, 12, dbsHkTexts)
]);
assert.equal(dbsHk.name, 'name', 'DBS HK applicant name');
assert.equal(dbsHk.maiden, '', 'DBS HK maiden name');
assert.equal(dbsHk.dob, 'dob', 'DBS HK date of birth');
assert.equal(dbsHk.home, 'address', 'DBS HK residential address');
assert.equal(dbsHk.employer, '', 'DBS HK employer');
const dbsHkName = layout({
  page: 0,
  width: 600,
  height: 800,
  texts: [text(42, 351, 160, 'Name in English (Surname first)')],
  lines: [{ x: 210, y: 351, w: 180 }],
  squares: []
});
assert.ok(dbsHkName.some((row) => /Name in English/i.test(row.label)), 'DBS HK name label is kept');

/* Standard Chartered personal account opening, page 2. Father's Name and
   Mother's Name sit above the applicant Gender line. */
const scTexts = [
  text(49, 390, 180, "Applicant's Personal Information"),
  text(28, 356, 200, 'Name of Accountholder in English:'),
  text(28, 187, 80, "Father's Name:"),
  text(28, 172, 80, "Mother's Name:"),
  text(28, 158, 120, "Husband/Wife's Name:"),
  text(28, 107, 40, 'Gender:')
];
const sc = offeredSlots([
  field('holder', 'Name of Accountholder in English:', 240, 348, 200, 12, scTexts),
  field('father', "Father's Name:", 120, 180, 140, 12, scTexts),
  field('gender', 'Gender:', 80, 100, 80, 12, scTexts)
]);
assert.equal(sc.holder, 'name', 'SC accountholder');
assert.equal(sc.father, '', 'SC father');
assert.equal(sc.gender, 'sex', 'SC gender');

/* CIMB deposit application. The first block is the applicant even though
   a parent or guardian may also sign it. The joint block stays blank. */
const cimbTexts = [
  text(38, 595, 300, 'About Myself/Parent/Legal Guardian/Administrator'),
  text(32, 575, 180, 'Full Name as per NRIC/Passport:'),
  text(32, 508, 80, 'Date of Birth:'),
  text(32, 474, 40, 'Gender:'),
  text(38, 150, 260, 'About My Joint Applicant/Child/Beneficiary'),
  text(32, 130, 180, 'Full Name as per NRIC/Passport:')
];
const cimb = offeredSlots([
  field('about_myself_parent_legal_guardian_adminis', 'Full Name as per NRIC/Passport:', 220, 568, 220, 12, cimbTexts),
  field('about_myself_parent_legal_guardian_adminis_3', 'Date of Birth:', 120, 500, 100, 12, cimbTexts),
  field('sex', 'Gender:', 80, 466, 60, 12, cimbTexts),
  field('about_my_joint_applicant_child_beneficiary', 'Full Name as per NRIC/Passport:', 220, 122, 220, 12, cimbTexts)
]);
assert.equal(cimb.about_myself_parent_legal_guardian_adminis, 'name', 'CIMB applicant name');
assert.equal(cimb.about_myself_parent_legal_guardian_adminis_3, 'dob', 'CIMB date of birth');
assert.equal(cimb.sex, 'sex', 'CIMB gender');
assert.equal(cimb.about_my_joint_applicant_child_beneficiary, '', 'CIMB joint name');

/* USCIS I-9, page 1. The format notes stay off the label. Section 2 is
   the employer, not the employee. */
const i9Texts = [
  text(38, 644, 220, 'Section 1. Employee Information and Attestation:'),
  text(42, 622, 120, 'Last Name (Family Name)'),
  text(204, 622, 120, 'First Name (Given Name)'),
  text(42, 596, 180, 'Address (Street Number and Name)'),
  text(42, 570, 140, 'Date of Birth (mm/dd/yyyy)'),
  text(38, 398, 250, 'Section 2. Employer Review and Verification:'),
  text(38, 69, 180, "Employer's Business or Organization Name")
];
const i9 = offeredSlots([
  field('last', 'Last Name (Family Name)', 42, 608, 140, 12, i9Texts),
  field('first', 'First Name (Given Name)', 204, 608, 140, 12, i9Texts),
  field('addr', 'Address (Street Number and Name)', 42, 582, 240, 12, i9Texts),
  field('dob', 'Date of Birth (mm/dd/yyyy)', 42, 556, 140, 12, i9Texts),
  field('org', "Employer's Business or Organization Name", 38, 54, 180, 12, i9Texts)
]);
assert.equal(i9.last, '', 'I-9 last name is not the full name');
assert.equal(i9.first, '', 'I-9 first name is not the full name');
assert.equal(i9.addr, 'address', 'I-9 employee address');
assert.equal(i9.dob, 'dob', 'I-9 date of birth');
assert.equal(i9.org, '', 'I-9 employer');
const i9Sheet = placed([
  field('last', 'Last Name (Family Name)', 42, 608, 140, 12, i9Texts),
  field('addr', 'Address (Street Number and Name)', 42, 582, 240, 12, i9Texts),
  field('org', "Employer's Business or Organization Name", 38, 54, 180, 12, i9Texts)
]);
assert.equal(i9Sheet.last.value, '', 'I-9 sheet last name');
assert.equal(i9Sheet.addr.value, '10 Example Road', 'I-9 sheet address');
assert.equal(i9Sheet.org.value, '', 'I-9 sheet employer');

/* The fillable I-9 names its boxes without parentheses. */
const i9Acro = offeredSlots([
  field('addr2', 'Address Street Number and Name', 42, 582, 240, 12, i9Texts),
  field('dob2', 'Date of Birth mmddyyyy', 42, 556, 140, 12, i9Texts),
  field('org2', 'Employers Business or Org Address', 38, 54, 180, 12, i9Texts)
]);
assert.equal(i9Acro.addr2, 'address', 'I-9 acro address');
assert.equal(i9Acro.dob2, 'dob', 'I-9 acro date of birth');
assert.equal(i9Acro.org2, '', 'I-9 acro employer address');

/* CIMB deposit form, page 1. Referred By is the referrer, and the box
   asks only for the last 4 characters. */
const referredTexts = [
  text(38, 399, 150, 'Promotion/Referral Details'),
  text(215, 382, 52, 'Referred By:'),
  text(397, 382, 159, 'NRIC/Passport No. (Last 4 characters):')
];
const referred = offeredSlots([
  field('last4', 'NRIC/Passport No. (Last 4 characters)', 400, 368, 140, 12, referredTexts),
  field('refNric', 'NRIC', 400, 340, 140, 12, referredTexts)
]);
assert.equal(referred.last4, '', 'referrer last-4 box');
assert.equal(referred.refNric, '', 'NRIC under Referred By');
const referredSheet = placed([
  field('last4', 'NRIC/Passport No. (Last 4 characters)', 400, 368, 140, 12, referredTexts),
  field('refNric', 'NRIC', 120, 340, 140, 12, referredTexts),
  field('intro', 'NRIC', 120, 300, 140, 12, [text(40, 330, 80, 'Introducer')]),
  field('who', 'NRIC', 120, 260, 140, 12, [text(40, 290, 70, 'Referrer')])
]);
assert.equal(referredSheet.last4.value, '', 'last 4 characters are not the full NRIC');
assert.equal(referredSheet.last4.refusal, 'partial-id');
assert.notEqual(referredSheet.last4.checked, true);
assert.equal(referredSheet.refNric.value, '', 'Referred By NRIC');
assert.equal(referredSheet.refNric.refusal, 'other-person');
assert.equal(referredSheet.intro.value, '', 'introducer NRIC');
assert.equal(referredSheet.intro.refusal, 'other-person');
assert.equal(referredSheet.who.value, '', 'referrer NRIC');
assert.equal(referredSheet.who.refusal, 'other-person');
assert.equal(evidence.identityPhotoSlot(
  { id: 'part', label: 'Passport No. (first 4 characters)', type: 'text' },
  [{ id: 'part', label: 'Passport No. (first 4 characters)', type: 'text' }]
), '', 'first 4 characters');
assert.equal(evidence.unsafeDestination({ label: 'NRIC (last 4 digits)' }), 'partial-id');
assert.notEqual(evidence.unsafeDestination({ label: 'Valid for first 6 months' }), 'partial-id');
assert.notEqual(evidence.unsafeDestination({ label: 'Please complete the first 2 pages' }), 'partial-id');
assert.notEqual(evidence.unsafeDestination({ label: 'NRIC last 4' }), 'partial-id');
assert.notEqual(evidence.unsafeDestination({ label: 'Last 4 characters' }), 'partial-id');
const person = require('./person.js');
assert.equal(person.sectionKind('Referred By'), 'other');
assert.equal(person.sectionKind('Referred by:'), 'other');
assert.equal(person.sectionKind('Referrer'), 'other');
assert.equal(person.sectionKind('Introducer'), 'other');
assert.equal(person.sectionKind('Referral'), 'other');
[
  'Particulars of the Applicant as referred',
  'Documents referred herein',
  'as referred to in'
].forEach(function (title) {
  assert.notEqual(person.sectionKind(title), 'other', title);
  const texts = [text(40, 420, 240, title), text(40, 360, 30, 'Name')];
  const rows = placed([field('name', 'Name', 40, 340, 180, 14, texts)]);
  assert.equal(rows.name.value, NAME, title);
  const only = [{ id: 'name', label: 'Name', type: 'text', section: title }];
  assert.equal(evidence.identityPhotoSlot(only[0], only), 'name', title);
});

/* DBS Hong Kong name row. The box is one row tall enough that a wrap would
   land on the next row, so a long name shrinks onto that one line. */
const born = `Applicant
Date of birth: 14-03-1984
`;
const november = `Applicant
Date of birth: 02-11-1990
`;
function dated(label, packet, extra) {
  const field = Object.assign({ id: 'dob', label: label, type: 'text' }, extra || {});
  return decideAll([field], packet, { autofill: { dob: true } })[0];
}
assert.equal(dated('Date of Birth mmddyyyy', born).value, '03141984', 'I-9 mmddyyyy');
assert.equal(dated('Date of Birth (mm/dd/yyyy)', born).value, '03/14/1984', 'US mm/dd/yyyy');
assert.equal(dated('Date of Birth (dd/mm/yyyy)', born).value, '14/03/1984', 'SG dd/mm/yyyy');
assert.equal(dated('Date of birth', born).value, '14/03/1984', 'default dd/mm/yyyy');
assert.equal(dated('Date of birth (yyyy-mm-dd)', born).value, '1984-03-14', 'ISO yyyy-mm-dd');
assert.equal(dated('Date of Birth (mm/dd/yyyy)', november).value, '11/02/1990', '2 Nov is not swapped');
assert.notEqual(dated('Date of Birth (mm/dd/yyyy)', november).value, '02/11/1990');
const odd = dated('Date of Birth (yy/mm/dd)', born);
assert.equal(odd.value, '', 'unparseable date hint');
assert.notEqual(odd.checked, true);
assert.equal(odd.reason, 'date_format');
assert.match(odd.note, /Left unticked/);
assert.equal(dated('Date of birth', born, { tooltip: 'mm/dd/yyyy', id: 'dob' }).value, '03/14/1984', 'tooltip hint');
assert.equal(dated('Date of birth', born, { comb: true, id: 'dob_mm_dd_yyyy' }).value, '03141984', 'comb drops separators');
assert.equal(dated('Date of birth (yyyy)', born).value, '14/03/1984', 'bare yyyy is not a full hint');
assert.notEqual(dated('Date of birth (yyyy)', born).reason, 'date_format');
assert.equal(evidence.dateForField('14/03/1984', { label: 'yyyy' }).value, '14/03/1984', 'lone yyyy');
assert.equal(evidence.dateForField('14/03/1984', { label: 'yyyy' }).blocked, false);
assert.equal(evidence.dateForField('14/03/1984', { label: 'mm' }).value, '14/03/1984', 'lone mm');
assert.equal(evidence.dateForField('14/03/1984', { label: 'dd' }).value, '14/03/1984', 'lone dd');
assert.equal(evidence.dateForField('14/03/1984', { label: 'mmmm' }).value, '14/03/1984', 'lone mmmm');
assert.equal(evidence.dateForField('14/03/1984', { label: 'mm' }).blocked, false);
assert.equal(dated('Year of birth (yyyy)', born).value, '1984', 'year of birth');
assert.equal(dated('Year of birth', born).value, '1984', 'year of birth without yyyy');
assert.equal(dated('Born in yyyy', born).value, '1984', 'born in yyyy');
assert.equal(dated('Date of Birth (Day/Month/Year)', born).value, '14/03/1984', 'Day/Month/Year');
assert.equal(dated('Date of Birth (Day Month Year)', born).value, '14/03/1984', 'Day Month Year');
assert.equal(dated('Date of Birth (Month/Day/Year)', born).value, '03/14/1984', 'Month/Day/Year');
assert.equal(dated('Date of Birth, Month, Year', born).value, '14/03/1984', 'month and year without day');
assert.equal(dated('Date of Birth Year', born).value, '14/03/1984', 'date of birth year');
assert.notEqual(dated('Date of Birth (Day/Month/Year)', born).value, '1984');
assert.notEqual(dated('Date of Birth Year', born).value, '1984');
assert.equal(evidence.dateForField('14/03/1984', { label: 'Date of Birth:', id: 'about_myself_parent_legal_guardian_adminis_3' }).value, '14/03/1984', 'CIMB id is not a date hint');
assert.equal(evidence.dateForField('14/03/1984', { label: 'Date of Birth:', id: 'about_myself_parent_legal_guardian_adminis_3' }).blocked, false);
assert.equal(evidence.fieldKind({ label: 'Others Identity Document (Please Specify)' }), 'other');
assert.equal(evidence.fieldKind({ label: 'Please specify:' }), 'other');
assert.equal(dated('Date of Birth (mm/dd/yyyy)', born, { comb: true }).value, '03141984', 'comb mm/dd/yyyy');

const longName = 'NURUL AISHAH BINTE MOHAMED ABDUL RAHMAN-ISMAIL';
const nameRow = evidence.fitInBox(longName, 260, 28, 11);
assert.equal(nameRow.fits, true, 'DBS name row fits');
assert.equal(nameRow.lines, 1, 'DBS name stays on one line');
const { PDFDocument, StandardFonts } = require('./vendor/pdf/pdf-lib.min.js');
const measure = await PDFDocument.create();
const helvetica = await measure.embedFont(StandardFonts.Helvetica);
assert.ok(helvetica.widthOfTextAtSize(longName, nameRow.size) <= 260, 'Helvetica name stays inside the row');
const home = 'Blk 123 Example Road #04-12 Singapore 123456';
const homeWidth = helvetica.widthOfTextAtSize(home, 9);
const homeFit = evidence.fitInBox(home, homeWidth + 1, 14, 11);
assert.equal(homeFit.fits, true, 'mixed-case address that fits the font is offered');
assert.ok(helvetica.widthOfTextAtSize(home, homeFit.size) <= homeWidth + 1);

/* DBS HK residential address is 172.6pt wide and 12pt tall. The line below
   meets the 6pt floor a fraction over the three-point gap and used to be
   dropped. The drawn glyphs start one point in and still end inside the row.
   A name that can leave three points still does. */
const bedok = '123A BEDOK NORTH AVENUE 4 #05-67 SINGAPORE 460123';
const bedokBox = { x: 116.2, y: 222.4, width: 172.6, height: 12 };
const bedokFit = evidence.fitInBox(bedok, bedokBox.width, bedokBox.height, 10.2);
assert.equal(bedokFit.fits, true, 'DBS HK residential address fits');
assert.equal(bedokFit.lines, 1, 'DBS HK residential address stays on one line');
assert.ok(bedokFit.size >= 6, 'DBS HK residential address stays legible');
const bedokInk = helvetica.widthOfTextAtSize(bedok, bedokFit.size);
assert.ok(bedokBox.x + 1 + bedokInk <= bedokBox.x + bedokBox.width, 'residential address ends inside the row');
[
  '45B TAMPINES STREET 91 #12-345 SINGAPORE 521045',
  '7C TOA PAYOH LORONG 8 #03-1011 SINGAPORE 311007'
].forEach(function (longer) {
  const row = evidence.fitInBox(longer, bedokBox.width, bedokBox.height, 10.2);
  assert.equal(row.fits, true, longer);
  assert.ok(helvetica.widthOfTextAtSize(longer, row.size) <= bedokBox.width - 3, longer);
});
const { annotations } = require('./spots.js');
const bedokDrawn = annotations([
  { id: 'home', label: 'Residential Address', type: 'text', source: 'flat', page: 0, pageWidth: 595.44, pageHeight: 841.68, lineH: 12, rect: bedokBox }
], { home: bedok });
assert.equal(bedokDrawn.unplaced.length, 0, 'residential address is written');
assert.equal(bedokDrawn[0][0].text, bedok);
assert.equal(bedokDrawn[0][0].fontSize, bedokFit.size);
const nameBox = 175.4;
const nameGap = evidence.fitInBox(longName, nameBox, 12, 11);
assert.equal(nameGap.fits, true, 'a name that can shrink still fits');
assert.equal(nameGap.size, 6, 'the name uses the size that leaves three points');
assert.ok(helvetica.widthOfTextAtSize(longName, nameGap.size) <= nameBox - 3, 'three points stay clear');
assert.ok(helvetica.widthOfTextAtSize(longName, 6.2) > nameBox - 3, 'the next size would cross the gap');
assert.equal(evidence.fitInBox(bedok + ' BLOCK', bedokBox.width, bedokBox.height, 10.2).fits, false, 'a line past the row is not written');

console.log('public form layouts ok');
