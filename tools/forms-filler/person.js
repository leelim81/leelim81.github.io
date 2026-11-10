/* Which person a form line belongs to. A heading or label names the applicant,
   names someone else, or names nobody. The same reading is used when a
   section is attached to a blank and when a card value is offered. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FormPerson = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /* Someone other than the applicant. Longer phrases are covered by the
     same words: "joint applicant", "authorised signatory", "next of kin",
     "particulars of guarantor". "contact details" is a block of the
     applicant's own numbers, not a person called Contact. */
  var OTHER = /\b(guarantors?|nominees?|referees?|beneficiaries|beneficiary|mothers?|fathers?|parents?|spouses?|guardians?|emergency|payees?|joints?|second\s+applicants?|holders?\s*2|2nd\s+applicants?|applicants?\s*2|witness(?:es)?|next\s+of\s+kin|kin|children|child|dependants?|dependents?|officers?|agents?|authoris(?:e|ed)\s+persons?|authoriz(?:e|ed)\s+persons?|introducers?|patients?|nurses?|doctors?|siblings?|signatories|signatory)\b/i;
  var CONTACT_PARTY = /\bcontacts?\b/i;
  var CONTACT_BLOCK = /\bcontacts?\s+(?:details|number|no|info|information)\b/i;
  var APPLICANT = /\b(applicants?|members?|claimants?|workers?)\b/i;

  function normalize(text) {
    return String(text || '')
      .replace(/[_./]+/g, ' ')
      .replace(/['’:]/g, ' ')
      .replace(/[^A-Za-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function personOf(text) {
    var s = normalize(text);
    if (!s) return '';
    if (OTHER.test(s)) return 'other';
    if (CONTACT_PARTY.test(s) && !CONTACT_BLOCK.test(s)) return 'other';
    if (APPLICANT.test(s)) return 'applicant';
    return '';
  }

  return { personOf: personOf, normalize: normalize };
});
