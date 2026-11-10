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
    if (/^(full name|name)$/.test(s)) return 'name';
    return '';
  }

  function fieldKind(field) {
    var s = ((field && field.label) || '') + ' ' + ((field && field.id) || '');
    s = s.toLowerCase();
    if (/bank use only|for bank use|official use only/.test(s)) return 'other';
    if (/signature|authoris|authoriz/.test(s)) return 'other';
    if (/debit/.test(s)) return 'other';
    if (/account\s*no|account number|to be credited/.test(s)) return 'other';
    if (/\bamount\b/.test(s) || (/\bdate\b/.test(s) && !/birth|\bdob\b/.test(s))) return 'other';
    if (/name as per/.test(s)) return /bank account/.test(s) ? 'name' : 'other';
    if (/post mailbox|po mailbox|p\.?o\.? mailbox|\bmailbox\b/.test(s)) return 'mailbox';
    if (/e-?mail|\binbox\b/.test(s)) return 'email';
    if (/phone|tel|mobile|handset|callback/.test(s)) return 'phone';
    if (/birth|\bdob\b/.test(s)) return 'dob';
    if (/nric|\bfin\b|identity number|identification/.test(s)) return 'nric';
    if (/(address|premises|dwelling|street)/.test(s) && !/mail/.test(s)) return 'address';
    if (/postal/.test(s)) return 'postal';
    if (/\bname\b/.test(s) && !/user|street|bank/.test(s)) return 'name';
    return 'other';
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
    if (!field || parts.some(function (part) { return sectionKind(part) === 'reset' || personOf(part) === 'other'; })) return '';
    var s = String(field.label || '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/[:.\s#]+$/g, '');
    if (/name as per\b/.test(s) && /bank account/.test(s) && !/debit/.test(s)) return 'name';
    if (/^name as per nric\b/.test(s)) return 'name';
    if (/^applicants?(?:'s|’s)? (?:full )?name$/.test(s)) return 'name';
    if (/^(?:full name|name)$/.test(s)) return 'name';
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
      var checked = !open && !!idn[slot + 'Checked'];
      return { value: part, checked: checked, editable: !checked && !open };
    }
    return null;
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
    identityCardOffer: identityCardOffer,
    addressSlotsBlank: addressSlotsBlank,
    normValue: normValue,
    kindOfLabel: kindOfLabel
  };
});
