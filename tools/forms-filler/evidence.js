/* Evidence records from a reference. Role comes from an explicit heading or
   from the words on that line, not from which block appears first. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FormEvidence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var ROLE = {
    applicant: 'applicant', member: 'applicant', claimant: 'applicant', worker: 'applicant',
    patient: 'patient', dependant: 'dependant', dependent: 'dependant',
    spouse: 'other', child: 'other', nurse: 'other', visitor: 'other', resident: 'other',
    witness: 'other', guardian: 'other', parent: 'other', sibling: 'other', doctor: 'other'
  };
  var HEAD = new RegExp('^(' + Object.keys(ROLE).join('|') + ')\\s*:?\\s*$', 'i');
  var SAME = /patient is the applicant|applicant is the patient|the applicant is the patient/i;

  function kindOfLabel(label) {
    var s = String(label || '').trim().toLowerCase();
    if (/^(post mailbox|po mailbox|p\.?o\.? mailbox|mailbox)$/.test(s)) return 'mailbox';
    if (/^(e-?mail|inbox|reply email)$/.test(s)) return 'email';
    if (/^(phone|tel|mobile|day phone|callback number|contact number)$/.test(s)) return 'phone';
    if (/^(date of birth|dob|birth date)$/.test(s)) return 'dob';
    if (/^(nric|fin|nric\/fin|identity number|identification number)$/.test(s)) return 'nric';
    if (/^(address|premises|dwelling|home address|street)$/.test(s)) return 'address';
    if (/^(postal|postal code)$/.test(s)) return 'postal';
    if (/^(?:first|given)(?:\s*\/\s*(?:first|given))?\s+name$/.test(s)) return 'given';
    if (/^(?:last(?:\s+name)?|family name|surname)(?:\s*\/\s*(?:surname|family name|last name))?$/.test(s)) return 'surname';
    if (/^last name\/surname$/.test(s)) return 'surname';
    if (/^(full name|name)$/.test(s)) return 'name';
    return '';
  }

  function textWidth(text, size) {
    var width = 0;
    var s = String(text || '');
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      var factor = 0.52;
      if (c <= 32) factor = 0.28;
      else if (c >= 48 && c <= 57) factor = 0.56;
      else if (c === 45 || c === 47) factor = 0.33;
      width += size * factor;
    }
    return width;
  }

  /* Shrink to the box. Below the minimum, the value does not fit. */
  function fittedSize(text, boxWidth, start) {
    var size = start > 0 ? start : 10;
    var min = 6;
    if (!(boxWidth > 0)) return { size: size, fits: false };
    while (size > min && textWidth(text, size) > boxWidth - 1) size = Math.round((size - 0.2) * 10) / 10;
    return { size: size, fits: textWidth(text, size) <= boxWidth - 1 };
  }

  function lineBoxHeight(size) {
    return size * 1.3;
  }

  function wrappedLines(text, size, width) {
    var words = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var next = line ? line + ' ' + words[i] : words[i];
      if (line && textWidth(next, size) > width - 1) {
        lines.push(line);
        line = words[i];
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  /* Wrapped lines must stay inside the field rectangle. */
  function fitInBox(text, boxWidth, boxHeight, start) {
    var size = start > 0 ? start : 10;
    var min = 6;
    if (!(boxWidth > 0) || !(boxHeight > 0)) return { size: size, fits: false, lines: 0 };
    while (size >= min) {
      var lines = wrappedLines(text, size, boxWidth);
      var allowed = Math.max(1, Math.floor((boxHeight + 0.2) / lineBoxHeight(size)));
      var wordFits = lines.every(function (line) { return textWidth(line, size) <= boxWidth - 1; });
      if (wordFits && lines.length && lines.length <= allowed) return { size: size, fits: true, lines: lines.length };
      if (size <= min) break;
      size = Math.round((size - 0.2) * 10) / 10;
    }
    return { size: min, fits: false, lines: wrappedLines(text, min, boxWidth).length };
  }

  function allowsValue(field, value) {
    var text = String(value || '').replace(/\s+/g, '');
    var kind = fieldKind(field);
    var label = String((field && field.label) || '');
    if (kind === 'postal' || /postal|post\s*code|postcode|\bzip\b/i.test(label)) return /^\d{6}$/.test(text);
    var numericComb = field && field.comb && /(?:^|\s)(?:no\.?|number|code)$/i.test(label) && !/nric|fin|passport|name|phone|tel/i.test(label);
    if (numericComb) return /^\d+$/.test(text);
    return true;
  }

  function headPhrase(text) {
    var raw = String(text || '').replace(/\([^)]*\)/g, ' ');
    raw = raw.replace(/^\s*\d+\s*[.)]\s*/, '');
    raw = raw.replace(/^\s*\(\s*[a-z]\s*\)\s*/i, '');
    return labelWords(raw).replace(/[\s:.*_]+$/g, '').replace(/\s+/g, ' ').trim();
  }

  /* Split words are the head noun. A parenthetical such as "(Underline
     surname)" is not the head, and "as per" does not skip this check. */
  function splitKind(label) {
    var s = headPhrase(label);
    if (!s) return '';
    var role = '';
    function add(next) {
      if (!next) return;
      if (!role) role = next;
      else if (role !== next) role = 'mixed';
    }
    if (/\b(?:previous|maiden)\b/.test(s) && /\b(?:name|nama)\b/.test(s)) add('previous');
    if (/\balias\b/.test(s) && /\b(?:name|nama)\b/.test(s)) add('alias');
    if (/\b(?:first|given)\b/.test(s) && /\b(?:name|nama)\b/.test(s)) add('given');
    if (/\bsurname\b/.test(s) || (/\b(?:last|family)\b/.test(s) && /\b(?:name|nama)\b/.test(s))) add('surname');
    if (/\bmiddle\b/.test(s) && /\b(?:name|nama)\b/.test(s)) add('middle');
    return role;
  }

  /* A label that contains a name word is never an ID field. A document
     reference makes it the person's name. A name and an ID number in the
     same box stays blank. "NRIC Name" and "IC name" are the name. */
  function labelWords(text) {
    return String(text || '').toLowerCase().replace(/['’]/g, '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function hasNameWord(text) {
    var s = labelWords(text);
    if (s.indexOf('姓名') >= 0) return true;
    if (/\b(?:name|nama)\b/.test(s)) return true;
    return /\bsurname\b/.test(s) || splitKind(text) !== '';
  }

  var DOC_WORD = '(?:identification\\s+card|identity\\s+card|driving\\s+licen[cs]e|work\\s+pass|hkid|my\\s*kad|aadhaar|aadhar|nric|passport|fin|ic|pan|\\bid\\b)';
  var DOC_QUAL = '(?:as\\s+appearing\\s+in|as\\s+printed\\s+on|as\\s+shown\\s+on|as\\s+shown\\s+in|as\\s+stated\\s+in|as\\s+in|as\\s+per|seperti\\s+dalam|mengikut|\\bin\\b)';

  function plainNameWord(text) {
    var s = headPhrase(text);
    if (s.indexOf('姓名') >= 0) return true;
    return /\b(?:name|nama)\b/.test(s);
  }

  function hasNameToken(text) {
    var s = labelWords(text);
    return s.indexOf('姓名') >= 0 || s.indexOf('nama') >= 0 || s.indexOf('name') >= 0;
  }

  function userOrNickName(text) {
    return /\b(?:user\s*name|username|nick\s*name|nickname|display\s+name)\b/.test(headPhrase(text));
  }

  function accountHolderName(text) {
    var s = labelWords(text);
    if (/\baccount\s+holders?\s+(?:full\s+)?(?:name|nama)\b/.test(s)) return true;
    if (/\b(?:name|nama)\s+of\s+(?:the\s+)?account\s+holders?\b/.test(s)) return true;
    if (/\baccount\s+(?:full\s+)?(?:name|nama)\b/.test(s)) return true;
    return /\b(?:name|nama)\s+of\s+(?:the\s+)?bank\s+accounts?\b/.test(s);
  }

  function placeName(text) {
    var s = labelWords(text);
    return /\b(?:buildings?|estates?)\s+(?:full\s+)?(?:name|nama)\b/.test(s) || /\b(?:name|nama)\s+of\s+(?:the\s+)?(?:buildings?|estates?)\b/.test(s);
  }

  function documentNameLabel(text) {
    if (!plainNameWord(text) && !hasNameWord(text)) return false;
    if (userOrNickName(text) || splitKind(text)) return false;
    var s = labelWords(text);
    if (new RegExp('\\bof\\s+(?:the\\s+)?' + DOC_WORD + '\\s+holders?\\b').test(s)) return true;
    return new RegExp(DOC_QUAL + '\\s+(?:the\\s+)?' + DOC_WORD + '\\b').test(s);
  }

  function idNameLabel(text) {
    var s = labelWords(text);
    if (/\b(?:nric|ic)\s+(?:name|nama)\b/.test(s)) return true;
    return /(?:nric|ic)\s*姓名/.test(s);
  }

  function hasIdNumberWord(text) {
    var s = labelWords(text);
    if (/\b(?:nric|ic|fin|passport)\b/.test(s)) return true;
    if (/\b(?:id|identification|identity)(?:\s+card)?\s*(?:no|number)\b/.test(s)) return true;
    return /\bidentification\s+card\b|\bidentity\s+card\b/.test(s);
  }

  function holderNameLabel(text) {
    return /\bholders?\s+(?:full\s+)?(?:name|nama)\b/.test(labelWords(text));
  }

  function combinedNameAndId(text) {
    if (!hasNameWord(text) || documentNameLabel(text) || idNameLabel(text) || holderNameLabel(text)) return false;
    return hasIdNumberWord(text);
  }

  function idOnlyLabel(text) {
    if (hasNameToken(text) || hasNameWord(text)) return false;
    var s = labelWords(text);
    if (/\bnric\b|\bfin\b|\bidentification\b/.test(s)) return true;
    return /\bidentity\s+(?:card|number)\b/.test(s);
  }

  function organisationNameLabel(text) {
    var s = labelWords(text);
    if (accountHolderName(text)) return false;
    var org = 'compan(?:y|ys|ies)|business(?:es)?|organi[sz]ations?|employers?|trading|firms?|corporate|brands?|merchants?|banks?|branch(?:s|es)?|institutions?|agenc(?:y|ys|ies)';
    if (new RegExp('\\b(?:' + org + ')\\s+(?:full\\s+)?(?:name|nama)\\b', 'i').test(s)) return true;
    return new RegExp('\\b(?:name|nama)\\s+of\\s+(?:the\\s+)?(?:' + org + ')(?!\\s+accounts?)\\b', 'i').test(s);
  }

  function bareName(label) {
    var s = String(label || '').toLowerCase().replace(/[*:.\s]+$/g, '').trim();
    return s === 'name' || s === 'full name' || s === 'percentage';
  }

  /* A label or the region header names someone else, a signature, or a
     bank-only block. This does not change which applicant lines match. */
  function unsafeDestination(field) {
    var label = String((field && field.label) || '');
    var group = String((field && field.group) || '');
    var section = String((field && field.section) || '');
    var heading = String((field && field.heading) || '');
    var region = String((field && field.region) || '');
    var blob = [label, group, section, heading].join('\n');
    if (region === 'signature' || region === 'bank-use' || region === 'other-person') return region;
    if (accountHolderName(label)) return 'account-holder';
    if (placeName(label)) return 'address-part';
    if (userOrNickName(label)) return 'not-offered';
    if (organisationNameLabel(label)) return 'organisation';
    if (/for bank use|bank use only|for official use|official use only|office use only/i.test(blob)) return 'bank-use';
    if (/signature verified|\bapproved by\b|name of signatory|\bsignatory\b|\bsignature\b/i.test(blob)) return 'signature';
    var parts = [label, group, section, heading];
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      if (personOf(parts[i]) === 'other') return 'other-person';
    }
    if (/\b(maiden|introducer|referrer|physician|emergency contact)\b/i.test(blob)) return 'other-person';
    if (/\bpercentage\b/i.test(label) && /nominee|witness/i.test(blob)) return 'other-person';
    if (lifePartyName(label)) return 'other-person';
    return '';
  }

  function markRegions(fields) {
    var list = fields || [];
    list.forEach(function (field) {
      var blob = [field.label, field.group, field.section, field.heading].filter(Boolean).join(' ');
      if (/for bank use|bank use only|for official use|official use only|office use only/i.test(blob)) field.region = 'bank-use';
      else if (/signature|signatory|approved by|verified by/i.test(blob)) field.region = 'signature';
      else if (/nominee|witness/i.test(blob)) field.region = 'other-person';
    });
    list.forEach(function (field) {
      if (field.region || !field.rect || !bareName(field.label)) return;
      var hit = '';
      list.forEach(function (other) {
        if (hit || other === field || !other.region || !other.rect) return;
        if ((other.page || 0) !== (field.page || 0)) return;
        var gap = boxGap(field.rect, other.rect);
        if (gap > 28) return;
        hit = other.region;
      });
      if (hit) field.region = hit;
    });
    return list;
  }

  function boxGap(a, b) {
    var a0 = a.y;
    var a1 = a.y + (a.height || 0);
    var b0 = b.y;
    var b1 = b.y + (b.height || 0);
    if (a1 < b0) return b0 - a1;
    if (b1 < a0) return a0 - b1;
    return 0;
  }

  function fieldKind(field) {
    var label = (field && field.label) || '';
    var head = headPhrase(label);
    var s = (label + ' ' + ((field && field.id) || '')).toLowerCase();
    /* 1. Head noun: a split word wins before any document phrase. */
    var split = splitKind(label);
    if (split === 'given' || split === 'surname') return split;
    if (split) return 'other';
    if (unsafeDestination(field)) return 'other';
    if (userOrNickName(label)) return 'other';
    if (chineseNameLabel(label)) return 'chineseName';
    if (/bank use only|for bank use|official use only/.test(s)) return 'other';
    if (/signature|authoris|authoriz/.test(s)) return 'other';
    if (/debit/.test(s)) return 'other';
    if (/account\s*no|account number|to be credited/.test(s)) return 'other';
    if (/\bamount\b/.test(s) || (/\bdate\b/.test(s) && !/birth|\bdob\b/.test(s))) return 'other';
    /* 2. A document reference on a plain name is the applicant's name.
       A bank-account name is the same head noun, not an early "as per" net. */
    if (holderNameLabel(label) || documentNameLabel(label) || idNameLabel(label)) return 'name';
    if (combinedNameAndId(label)) return 'other';
    if (/\b(?:name|nama)\b/.test(head) && /\bbank account\b/.test(head) && !/debit/.test(head)) return 'name';
    /* "Name as per" with no document and no bank account is unfinished. */
    if (/\bas\s+(?:in|per)\b/.test(head) && !documentNameLabel(label)) return 'other';
    if (/post mailbox|po mailbox|p\.?o\.? mailbox|\bmailbox\b/.test(s)) return 'mailbox';
    if (/e-?mail|\binbox\b/.test(s)) return 'email';
    if (/phone|tel|mobile|handset|callback/.test(s)) return 'phone';
    if (/birth|\bdob\b/.test(s)) return 'dob';
    /* 3. An ID field has no name token, including inside username. */
    if (!hasNameToken(label) && idOnlyLabel(label)) return 'nric';
    if (/(address|premises|dwelling|street)/.test(s) && !/mail/.test(s)) return 'address';
    if (/postal/.test(s)) return 'postal';
    if (applicantNameLabel(label)) return 'name';
    return 'other';
  }

  function lifePartyName(text) {
    var s = labelWords(text);
    if (/\bsum\s+insured\b/.test(s)) return false;
    if (!/\b(?:name|nama)\b/.test(s)) return false;
    return /\b(?:life\s+)?(?:insured|assured)s?\b/.test(s);
  }

  function chineseNameLabel(text) {
    if (/中文姓名/.test(String(text || ''))) return true;
    return /^chinese\s+name$/.test(headPhrase(text));
  }

  function allowOne(text) {
    var s = headPhrase(text);
    if (!s) return false;
    if (/^(?:full name|name|nama penuh|nama|姓名|英文姓名)$/.test(s)) return true;
    if (/^(?:your\s+)?(?:full\s+)?name$/.test(s)) return true;
    if (/^name in (?:full|block letters|capitals|english|bahasa malaysia)$/.test(s)) return true;
    if (/^(?:full legal name|full name in english|english name|legal name|official name)$/.test(s)) return true;
    if (/^(?:please\s+)?print(?:ed)?\s+(?:your\s+)?(?:full\s+)?name$/.test(s)) return true;
    if (/^name to appear on (?:the\s+)?(?:debit\s+|atm\s+)?cards?$/.test(s)) return true;
    if (/^name of accountholders?(?:\s+in\s+english)?$/.test(s)) return true;
    if (/^nama\s+(?:pemohon|pencadang|pemegang\s+polisi|pekerja|pelanggan)$/.test(s)) return true;
    var person = 'applicants?|customers?|members?|claimants?|proposers?|policy\\s*holders?|employees?|card\\s*holders?|clients?|subscribers?|taxpayers?|principals?|account\\s+applicants?|(?:main|primary)\\s+applicants?';
    if (new RegExp('^(?:' + person + ')s?\\s+(?:full\\s+)?(?:name|nama)$').test(s)) return true;
    if (new RegExp('^(?:full\\s+)?(?:name|nama)\\s+of\\s+(?:the\\s+)?(?:' + person + ')$').test(s)) return true;
    if (holderNameLabel(text) || idNameLabel(text) || documentNameLabel(text)) return true;
    return /\b(?:name|nama)\b/.test(s) && /\bas\s+per\b/.test(s) && /\bbank account\b/.test(s) && !/debit/.test(s);
  }

  /* The applicant name is an allowlist of person-head phrases. Any other
     "<noun> name" or "name of <noun>" is not offered. */
  function applicantNameLabel(text) {
    if (!text || chineseNameLabel(text) || lifePartyName(text)) return false;
    if (splitKind(text) || userOrNickName(text) || accountHolderName(text) || placeName(text) || organisationNameLabel(text)) return false;
    var pieces = String(text || '').split(/\s*\/\s*/);
    if (pieces.length > 1) {
      if (combinedNameAndId(text)) return false;
      return pieces.some(allowOne);
    }
    return allowOne(text);
  }

  function fieldRole(field) {
    var s = (((field && field.group) || '') + ' ' + ((field && field.label) || '')).toLowerCase();
    if (/dependant|dependent|spouse|\bchild\b|\bpatient\b/.test(s)) return 'other';
    if (/applicant|member|claimant/.test(s)) return 'applicant';
    return 'unspecified';
  }

  function personApi() {
    if (typeof globalThis !== 'undefined' && globalThis.FormPerson) return globalThis.FormPerson;
    if (typeof require === 'function') {
      try { return require('./person.js'); } catch (err) { return null; }
    }
    return null;
  }

  function personOf(text) {
    var api = personApi();
    return api && api.personOf ? api.personOf(text) : '';
  }

  function sectionKind(text) {
    var api = personApi();
    if (api && api.sectionKind) return api.sectionKind(text);
    return personOf(text);
  }

  function fieldContext(field) {
    return [field && field.group, field && field.heading, field && field.section]
      .filter(Boolean)
      .join(' ');
  }

  function namesOtherRole(text) {
    return personOf(text) === 'other';
  }

  function applicantSection(field) {
    return personOf(fieldContext(field)) === 'applicant';
  }

  /* The card name and NRIC are offered only on a line that is clearly the
     applicant's own. A section that names someone else abstains even when
     its Name or NRIC is the only one on the form. A repeated name or NRIC
     abstains when no applicant section can be told apart. */
  function applicantIdentitySlot(field) {
    var parts = [field && field.label, field && field.group, field && field.heading, field && field.section, field && field.id];
    if (!field || unsafeDestination(field) || parts.some(function (part) { return sectionKind(part) === 'reset' || personOf(part) === 'other'; })) return '';
    var s = String(field.label || '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/[:.\s#]+$/g, '');
    if (splitKind(field.label)) return '';
    if (chineseNameLabel(field.label)) return 'chineseName';
    if (applicantNameLabel(field.label)) return 'name';
    if (/^(?:nric|fin|passport)(?:\s*\/\s*(?:nric|fin|passport)){0,2}(?:\s*(?:no|number)\.?)?$/.test(s) && /nric|\bfin\b/.test(s)) return 'nric';
    if (/^(?:date of birth|dob|birth date)$/.test(s)) return 'dob';
    if (/^(?:sex|gender)$/.test(s)) return 'sex';
    if (/^(?:nationality|citizenship)$/.test(s)) return 'nationality';
    if (/^country of birth$/.test(s)) return 'birthCountry';
    if (/^race$/.test(s)) return 'race';
    if (/^(?:residential address|home address|address)$/.test(s)) return 'address';
    if (/^(?:postal|postal code)$/.test(s)) return 'postal';
    if (/^(?:blk(?:\s*\/\s*house no\.?)?|block)$/.test(s)) return 'blk';
    if (/^street(?: name)?$/.test(s)) return 'street';
    if (/^unit(?:\s+no\.?)?$/.test(s)) return 'unit';
    return '';
  }

  function formHasSlot(fields, slot) {
    return (fields || []).some(function (field) { return applicantIdentitySlot(field) === slot; });
  }

  function hasSplitAddress(fields) {
    return formHasSlot(fields, 'blk') || formHasSlot(fields, 'street') || formHasSlot(fields, 'unit') || formHasSlot(fields, 'postal');
  }

  function blockOpen(idn) {
    return !!idn.blkUnconfirmed || /^\d{4}$/.test(idn.blk || '');
  }

  function partConfirmed(idn, slot) {
    if (blockOpen(idn)) return false;
    if (slot === 'blk') return !!idn.blk && !!idn.blkChecked;
    return !!idn[slot] && !!idn[slot + 'Checked'];
  }

  /* Parts that already have their own row are left out. What remains is
     written in block, street, unit, postal order. */
  function addressRemainder(idn, fields) {
    var bits = [];
    var shaky = false;
    function take(slot, text) {
      if (!text || formHasSlot(fields, slot)) return;
      bits.push(text);
      if (!partConfirmed(idn, slot)) shaky = true;
    }
    take('blk', idn.blk || '');
    take('street', idn.street || '');
    take('unit', idn.unit ? '#' + String(idn.unit).replace(/^#/, '') : '');
    take('postal', idn.postal ? 'SINGAPORE ' + idn.postal : '');
    return { value: bits.join(' '), shaky: shaky };
  }

  /* A mixed form is left blank only when the block itself is not confirmed.
     An unconfirmed block stays visible, and a confirmed block keeps its parts. */
  function addressSlotsBlank(identity, fields) {
    var idn = identity || {};
    if (!hasSplitAddress(fields) || !formHasSlot(fields, 'address')) return false;
    if (blockOpen(idn)) return false;
    if (idn.blk && idn.blkChecked) return false;
    return !(idn.streetChecked && idn.postalChecked);
  }

  function identityCardOffer(identity, slot, fields) {
    var idn = identity || {};
    if (slot === 'address') {
      if (fields && !formHasSlot(fields, 'address')) return { value: '', checked: false, editable: false };
      var rest = addressRemainder(idn, fields);
      if (!rest.value) return { value: '', checked: false, editable: false };
      if (blockOpen(idn) || rest.shaky) return { value: rest.value, checked: false, editable: true };
      return { value: rest.value, checked: true, editable: false };
    }
    if (slot === 'blk') {
      if (!idn.blk) return { value: '', checked: false, editable: false };
      var blockUnconfirmed = !!idn.blkUnconfirmed || /^\d{4}$/.test(idn.blk);
      return { value: idn.blk, checked: !!idn.blkChecked && !blockUnconfirmed, editable: blockUnconfirmed };
    }
    if (slot === 'street' || slot === 'unit' || slot === 'postal') {
      var part = idn[slot] || '';
      if (!part) return { value: '', checked: false, editable: false };
      var open = blockOpen(idn);
      var checked = !open && !!idn[slot + 'Checked'] && !(slot === 'unit' && idn.unitUnconfirmed);
      return { value: part, checked: checked, editable: !checked && !open };
    }
    return null;
  }

  /* The nearest section heading or table header above or to the left of a
     field on the same page. A closer other-person heading wins over a
     farther applicant heading. */
  function nearestSectionHeading(field, texts) {
    var rect = field && field.rect;
    if (!rect) return null;
    var top = rect.y + (rect.height || 0);
    var best = null;
    (texts || []).forEach(function (text) {
      var raw = String(text && text.str || '').replace(/\s+/g, ' ').trim();
      var kind = sectionKind(raw);
      if (!kind) return;
      var above = text.y >= top - 8;
      var leftEdge = text.x + (text.w || 0);
      var left = leftEdge <= rect.x + 20 && Math.abs(text.y - rect.y) <= 28;
      if (!above && !left) return;
      if (text.x > rect.x + Math.max(rect.width || 0, 40) + 36) return;
      if (rect.x - text.x > 340) return;
      var dy = text.y - top;
      var limit = kind === 'applicant' ? 420 : 280;
      if (above && (dy > limit || dy < -8)) return;
      var dist = above ? Math.max(dy, 0) + Math.abs(text.x - rect.x) * 0.2 : Math.abs(text.y - rect.y) + Math.max(0, rect.x - leftEdge) + 12;
      if (!best || dist < best.dist) best = { kind: kind, line: raw.replace(/[:.\s]+$/g, ''), dist: dist };
    });
    return best;
  }

  function applySectionContext(fields) {
    (fields || []).forEach(function (field) {
      if (!field || field.section) return;
      var texts = field.texts || field.pageTexts || [];
      var hit = nearestSectionHeading(field, texts);
      if (hit) field.section = hit.line;
    });
    return fields;
  }

  function identityPhotoSlot(field, fields) {
    var slot = applicantIdentitySlot(field);
    if (!slot) return '';
    var list = fields && fields.length ? fields : [field];
    var same = list.filter(function (item) { return applicantIdentitySlot(item) === slot; });
    if (same.length <= 1) return slot;
    var owned = same.filter(applicantSection);
    if (!owned.length) return '';
    return owned.indexOf(field) >= 0 ? slot : '';
  }

  function normValue(kind, value) {
    var text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    if (kind === 'dob') {
      var m = text.match(/^(\d{1,2})[\/.\- ](\d{1,2})[\/.\- ](\d{4})$/);
      if (!m) return '';
      return ('0' + m[1]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + m[3];
    }
    if (kind === 'phone') {
      var digits = text.replace(/\D/g, '');
      if (digits.length < 8) return '';
      return digits.slice(-8);
    }
    if (kind === 'email') {
      return /@/.test(text) ? text.toLowerCase() : '';
    }
    if (kind === 'nric') {
      var id = text.replace(/\s/g, '').toUpperCase();
      return /^[STFGM]\d{7}[A-Z]$/.test(id) ? id : '';
    }
    return text;
  }

  function extract(text) {
    var raw = String(text || '');
    var same = SAME.test(raw);
    var section = '';
    var facts = [];
    var seq = 0;
    var cursor = 0;
    raw.split(/\n/).forEach(function (line, index) {
      var trimmed = line.trim();
      var heading = trimmed.match(HEAD);
      if (heading) {
        section = ROLE[heading[1].toLowerCase()] || 'other';
        cursor += line.length + 1;
        return;
      }
      var labeled = trimmed.match(/^([^:]{2,40}):\s*(.+)$/);
      if (!labeled) {
        cursor += line.length + 1;
        return;
      }
      var kind = kindOfLabel(labeled[1]);
      if (!kind) {
        cursor += line.length + 1;
        return;
      }
      var value = normValue(kind, labeled[2]);
      if (!value) {
        cursor += line.length + 1;
        return;
      }
      var role = section || 'unscoped';
      var explicit = !!section || /^(full name)$/i.test(labeled[1].trim());
      if (!section && /^full name$/i.test(labeled[1].trim())) role = 'applicant';
      var linked = false;
      if (same && (role === 'patient' || role === 'applicant')) {
        role = 'applicant';
        linked = true;
      }
      var at = line.indexOf(labeled[2]);
      if (at < 0) at = 0;
      facts.push({
        id: 'f' + (seq++),
        kind: kind,
        role: role,
        value: value,
        explicit: explicit,
        samePerson: linked,
        line: index + 1,
        start: cursor + at,
        end: cursor + at + labeled[2].length,
        quote: trimmed.slice(0, 180)
      });
      cursor += line.length + 1;
    });
    return { facts: facts, samePerson: same, people: people(facts) };
  }

  function factsApi() {
    if (typeof globalThis !== 'undefined' && globalThis.FormFacts && globalThis.FormFacts.extendsName) return globalThis.FormFacts;
    if (typeof require === 'function') {
      try { return require('./facts.js'); } catch (err) { return null; }
    }
    return null;
  }

  function normName(text) {
    return String(text || '').toUpperCase().replace(/[^A-Z'\- ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function namesAgree(detailsName, cardName) {
    var left = normName(detailsName);
    var right = normName(cardName);
    if (!left || !right) return false;
    if (left === right) return true;
    var facts = factsApi();
    if (!facts || !facts.extendsName) return false;
    return facts.extendsName(left, right) || facts.extendsName(right, left);
  }

  /* A photo read replaces other offers. A details name that is the same
     person as the card stays. */
  function keepAgreedName(row, field, cardName) {
    if (!row || row.decision === 'abstain' || !row.value || !cardName) return false;
    var kind = row.kind || fieldKind(field);
    if (kind !== 'name') return false;
    if (unsafeDestination(field) || combinedNameAndId(field && field.label)) return false;
    return namesAgree(row.value, cardName);
  }

  function people(facts) {
    var roles = {};
    facts.forEach(function (fact) {
      if (fact.role === 'unscoped') return;
      roles[fact.role] = true;
    });
    return Object.keys(roles);
  }

  return {
    extract: extract,
    fieldKind: fieldKind,
    fieldRole: fieldRole,
    identityPhotoSlot: identityPhotoSlot,
    nearestSectionHeading: nearestSectionHeading,
    applySectionContext: applySectionContext,
    identityCardOffer: identityCardOffer,
    addressSlotsBlank: addressSlotsBlank,
    normValue: normValue,
    kindOfLabel: kindOfLabel,
    unsafeDestination: unsafeDestination,
    markRegions: markRegions,
    splitKind: splitKind,
    fittedSize: fittedSize,
    fitInBox: fitInBox,
    allowsValue: allowsValue,
    keepAgreedName: keepAgreedName
  };
});
