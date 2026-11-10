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
  var OTHER = /\b(guarantors?|co\s*borrowers?|prox(?:y|ies)|insured\s+persons?|employers?|landlords?|tenants?|trustees?|partners?|nominees?|referees?|beneficiaries|beneficiary|mothers?|fathers?|parents?|spouses?|guardians?|emergency|payees?|joints?|second\s+applicants?|holders?\s*2|owners?\s*2|directors?\s*2|2nd\s+applicants?|applicants?\s*2|witness(?:es)?|next\s+of\s+kin|kin|children|child|dependants?|dependents?|officers?|agents?|authoris(?:e|ed)\s+persons?|authoriz(?:e|ed)\s+persons?|introducers?|patients?|nurses?|doctors?|siblings?|signatories|signatory)\b/i;
  var CONTACT_PARTY = /\bcontacts?\b/i;
  var CONTACT_BLOCK = /\bcontacts?\s+(?:details|number|no|info|information)\b/i;
  var APPLICANT = /\b(applicants?|members?|claimants?|workers?)\b/i;
  /* Part A, Personal details, and Membership application are the applicant
     block on a single-person form. A heading that also names someone else
     is caught above and stays other. */

  function normalize(text) {
    return String(text || '')
      .replace(/[_./]+/g, ' ')
      .replace(/['’:]/g, ' ')
      .replace(/[^A-Za-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* A later form part, even one that mentions the applicant. It ends the
     person section above it and is not itself an identity section. */
  function isPartReset(text) {
    var s = normalize(text);
    if (!s) return false;
    if (/\bdeclarat(?:ion|ions)\b/i.test(s)) return true;
    if (/\b(?:for\s+)?bank\s+use\b/i.test(s)) return true;
    if (/\b(?:for\s+)?official\s+use\b/i.test(s)) return true;
    if (/\boffice\s+use\b/i.test(s)) return true;
    if (/\bpart\s+[bcd]\b/i.test(s)) return true;
    if (/\backnowledg(?:e|ement|ment)\b/i.test(s)) return true;
    if (/\bauthoris(?:e|ation)\b/i.test(s) || /\bauthoriz(?:e|ation)\b/i.test(s)) return true;
    if (/\bterms(?:\s+and)?\s+conditions\b/i.test(s)) return true;
    return false;
  }

  function sectionKind(text) {
    var s = normalize(text);
    if (!s) return '';
    if (isPartReset(s)) return 'reset';
    if (OTHER.test(s)) return 'other';
    if (CONTACT_PARTY.test(s) && !CONTACT_BLOCK.test(s)) return 'other';
    if (APPLICANT.test(s)) return 'applicant';
    if (/^part a\b/i.test(s) || /\bpersonal details\b/i.test(s) || /\bmembership application\b/i.test(s)) return 'applicant';
    if (/\bowners?\b/i.test(s)) return 'other';
    return '';
  }

  function personOf(text) {
    var kind = sectionKind(text);
    return kind === 'applicant' || kind === 'other' ? kind : '';
  }

  return { personOf: personOf, sectionKind: sectionKind, normalize: normalize };
});
