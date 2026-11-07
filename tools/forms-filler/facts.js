/* Deterministic facts from an identity document. The small local model
   only sees whatever this parser could not fill. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FormFacts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var JUNK = {
    singapore: 1, republic: 1, identity: 1, card: 1, nric: 1, fin: 1,
    race: 1, sex: 1, date: 1, birth: 1, of: 1, the: 1, and: 1, blood: 1,
    group: 1, issue: 1, no: 1, name: 1, address: 1, chinese: 1, malay: 1,
    indian: 1, eurasian: 1, male: 1, female: 1, citizen: 1, country: 1
  };
  var PLACE = /^(singapore|republic of singapore|republic)$/i;

  function linesOf(text) {
    return String(text || '').split(/\n/).map(function (line) { return line.trim(); }).filter(Boolean);
  }

  function nricChecksum(id) {
    if (!/^[STFGM]\d{7}[A-Z]$/.test(id)) return false;
    var weights = [2, 7, 6, 5, 4, 3, 2];
    var sum = 0;
    for (var i = 0; i < 7; i++) sum += Number(id.charAt(i + 1)) * weights[i];
    if (id.charAt(0) === 'T' || id.charAt(0) === 'G') sum += 4;
    var table = (id.charAt(0) === 'S' || id.charAt(0) === 'T') ? 'JZIHGFEDCBA' : 'XWUTRQPNMLK';
    return table.charAt(sum % 11) === id.charAt(8);
  }

  function nricFrom(text) {
    var hits = [];
    var re = /(?:^|[^A-Z0-9$~])([STFGM])\s?(\d{7})\s?([A-Z])(?![A-Z0-9])/gi;
    var match;
    while ((match = re.exec(String(text || '')))) {
      hits.push((match[1] + match[2] + match[3]).toUpperCase());
    }
    if (!hits.length) return '';
    var valid = hits.filter(nricChecksum);
    return (valid[0] || hits[0]);
  }

  function nameFrom(text) {
    var inline = String(text || '').match(/\bfull name\b[ \t]*[:\-][ \t]*([A-Za-z][A-Za-z'’.\-]+(?:[ \t]+[A-Za-z][A-Za-z'’.\-]+){1,5})/i);
    if (inline) return inline[1].replace(/\s+/g, ' ').trim();
    var lines = linesOf(text);
    var labelled = text.match(/\bName\b[^\n]{0,40}\n+\s*([A-Z][A-Z ]{4,})/);
    if (labelled) {
      var fromLabel = labelled[1].trim().split(/\s+/).filter(Boolean);
      if (fromLabel.length >= 2 && fromLabel.length <= 6 && !fromLabel.some(function (word) {
        return word === 'REPUBLIC' || word === 'SINGAPORE' || word === 'IDENTITY' || word === 'CARD';
      })) return fromLabel.join(' ');
    }
    for (var i = 0; i < lines.length; i++) {
      var clean = lines[i].replace(/[^A-Za-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!/^[A-Z][A-Z\s]{4,}$/.test(clean)) continue;
      var words = clean.split(' ').filter(Boolean);
      if (words.length < 2 || words.length > 6) continue;
      if (words.filter(function (word) { return word.length === 1; }).length >= 2) continue;
      if (words.filter(function (word) { return JUNK[word.toLowerCase()]; }).length >= words.length - 1) continue;
      if (words.every(function (word) { return JUNK[word.toLowerCase()]; })) continue;
      if (words.some(function (word) { return word === 'REPUBLIC' || word === 'SINGAPORE' || word === 'IDENTITY' || word === 'CARD'; })) continue;
      return words.join(' ');
    }
    return '';
  }

  function dobFrom(text) {
    var raw = String(text || '');
    var near = raw.match(/(?:date of b\w+|dob|出生)[\s\S]{0,60}?(\d{2})[-\/.](\d{2})[-\/.](\d{4})/i)
      || raw.match(/\b(\d{2})[-\/.](\d{2})[-\/.](\d{4})\s+[MF]\b/);
    if (near) return near[1] + '/' + near[2] + '/' + near[3];
    var months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    var named = raw.match(/(?:date of birth|dob|born)[^\n]{0,48}?(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/i);
    if (!named) return '';
    var month = months[named[2].slice(0, 3).toLowerCase()];
    if (!month) return '';
    return ('0' + named[1]).slice(-2) + '/' + month + '/' + named[3];
  }

  function emailFrom(text) {
    var found = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return found ? found[0] : '';
  }

  function phoneFrom(text) {
    var raw = String(text || '');
    var labelled = raw.match(/(?:phone|mobile|\btel\b|contact)\s*(?:no\.?|number)?\s*[:\-]?\s*(\+?\d[\d\s()-]{7,})/i);
    var chunk = labelled ? labelled[1] : '';
    if (!chunk) {
      var stripped = raw.replace(/\b[STFGM]\d{7}[A-Z]\b/gi, ' ').replace(/\b\d{2}[-\/.]\d{2}[-\/.]\d{4}\b/g, ' ').replace(/\b\d{6}\b/g, ' ');
      var loose = stripped.match(/\+\d[\d\s()-]{8,}/);
      chunk = loose ? loose[0] : '';
    }
    var digits = chunk.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return '';
    return chunk.replace(/\s+/g, ' ').trim();
  }

  function companyFrom(text) {
    var found = String(text || '').match(/\b(?:company|employer)\b\s*[:\-]\s*([^\n]{2,80})/i);
    if (!found) return '';
    var value = found[1].replace(/\s+/g, ' ').trim().replace(/[.,;]+$/, '');
    if (!value || /^(singapore|republic of singapore|republic)$/i.test(value)) return '';
    return value;
  }

  function sexFrom(text) {
    var raw = String(text || '');
    var near = raw.match(/\b(\d{2}[-\/.]\d{2}[-\/.]\d{4})\s+([MF])\b/)
      || raw.match(/\bSex\b[\s\S]{0,40}\b([MF])\b/i);
    if (!near) return '';
    var mark = near[near.length - 1].toUpperCase();
    return mark === 'F' ? 'Female' : 'Male';
  }

  function raceFrom(text) {
    var race = String(text || '').match(/\b(CHINESE|MALAY|INDIAN|EURASIAN)\b/i);
    if (!race) return '';
    return race[1].charAt(0).toUpperCase() + race[1].slice(1).toLowerCase();
  }

  function addressFrom(text) {
    var raw = String(text || '');
    var addr = raw.match(/APT\s+BLK\s+(\S+)\s+(.+?)\s+#\s?(\d{1,3}\s?-\s?\d{1,5})/i)
      || raw.match(/\bBLK\s+(\S+)\s+(.+?)\s+#\s?(\d{1,3}\s?-\s?\d{1,5})/i);
    var out = {};
    if (addr) {
      out.blk = addr[1].toUpperCase();
      out.street = addr[2].replace(/\s+/g, ' ').trim().toUpperCase();
      out.unit = addr[3].replace(/\s/g, '');
    }
    var after = addr ? raw.slice(raw.indexOf(addr[0]) + addr[0].length) : raw;
    var postal = after.match(/\b(\d{6})\b/) || raw.match(/\b(\d{6})\b/);
    if (postal) out.postal = postal[1];
    return out;
  }

  function fromText(text) {
    var facts = {};
    var nric = nricFrom(text);
    if (nric) facts.nric = nric;
    var name = nameFrom(text);
    if (name) facts.name = name;
    var dob = dobFrom(text);
    if (dob) facts.dob = dob;
    var sex = sexFrom(text);
    if (sex) facts.sex = sex;
    var race = raceFrom(text);
    if (race) facts.race = race;
    var address = addressFrom(text);
    if (address.blk) facts.blk = address.blk;
    if (address.street) facts.street = address.street;
    if (address.unit) facts.unit = address.unit;
    if (address.postal) facts.postal = address.postal;
    var addressLine = [address.blk, address.street, address.unit ? '#' + address.unit : '', address.postal].filter(Boolean).join(' ');
    if (addressLine) facts.address = addressLine;
    var residential = residentialFrom(text);
    if (residential) facts.residential = residential;
    var email = emailFrom(text);
    if (email) facts.email = email;
    var phone = phoneFrom(text);
    if (phone) facts.phone = phone;
    var company = companyFrom(text);
    if (company) facts.company = company;
    var firstName = explicitPart(text, /\bfirst\s+name\b\s*[:\-]\s*([A-Za-z][A-Za-z'’.\-]+)/i);
    var lastName = explicitPart(text, /\b(?:last|family|surname)\s+name\b\s*[:\-]\s*([A-Za-z][A-Za-z'’.\-]+)/i);
    if (firstName) facts.firstName = firstName;
    if (lastName) facts.lastName = lastName;
    return facts;
  }

  function explicitPart(text, pattern) {
    var found = String(text || '').match(pattern);
    if (!found) return '';
    var word = found[1].replace(/\s+/g, ' ').trim();
    if (!/^[A-Za-z][A-Za-z'’.\-]{1,30}$/.test(word)) return '';
    return word;
  }

  function residentialFrom(text) {
    var raw = String(text || '');
    if (/singapore\s+citizen/i.test(raw)) return 'Singapore Citizen';
    if (/permanent\s+resident/i.test(raw)) return 'Permanent Resident';
    return '';
  }

  function blob(field) {
    return ((field && field.group) || '') + ' ' + ((field && field.label) || '') + ' ' + ((field && field.id) || '');
  }

  function oneEdit(a, b) {
    if (a === b) return true;
    var la = a.length;
    var lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    var i = 0;
    var j = 0;
    var edits = 0;
    while (i < la && j < lb) {
      if (a.charAt(i) === b.charAt(j)) { i++; j++; continue; }
      edits++;
      if (edits > 1) return false;
      if (la > lb) i++;
      else if (lb > la) j++;
      else { i++; j++; }
    }
    if (i < la || j < lb) edits++;
    return edits <= 1;
  }

  function factKey(field) {
    var label = blob(field);
    var tokens = label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (/dependant|dependent|spouse|\bchild\b|authorised officer|authorized officer/i.test(label)) return '';
    if (tokens.some(function (token) { return oneEdit(token, 'name'); }) && /nric|passport|fin/.test(label.toLowerCase())) return 'name';
    if (/\baddress\b/i.test(label) && !/e-?mail|ip\b/i.test(label)) return 'address';
    if (/street/i.test(label)) return 'street';
    if (/blk|house\s*no/i.test(label)) return 'blk';
    if (/unit\s*no/i.test(label)) return 'unit';
    if (/postal/i.test(label)) return 'postal';
    if (/company|employer/i.test(label)) return 'company';
    if (/e-?mail/i.test(label)) return 'email';
    if (/contact\s*(no\.?|number)|phone|\(hp\)|\bh\s*\/\s*p\b|\bhp\b|mobile|\btel\b/i.test(label)) return 'phone';
    if (/\bname\b/i.test(label) && /nric|\bfin\b/i.test(label)) return 'name';
    if (/nric|fin\s*number|身份证/i.test(label)) return 'nric';
    if (/date of birth|出生|\bdob\b/i.test(label)) return 'dob';
    if (/gender|性别|\bsex\b/i.test(label)) return 'sex';
    if (/\brace\b|种族/i.test(label)) return 'race';
    if (/residential|住户/i.test(label)) return 'residential';
    if (/bank/.test(label.toLowerCase()) && /name/i.test(label)) return '';
    if (/\bname\b/i.test(label) && /dependant|dependent|officer|union/.test(label)) return '';
    if (/business\s+name|disregarded entity/i.test(label)) return 'company';
    if (/\bfirst\b/i.test(label) && /\bname\b/i.test(label)) return 'firstName';
    if (/\b(last|family|surname)\b/i.test(label) && /\bname\b/i.test(label)) return 'lastName';
    if (/full\s*name|姓名/i.test(label)) return 'name';
    if (/\bapplicant'?s?\s+name\b/i.test(label)) return 'name';
    if (/\bname\b/i.test(label) && !/street|bank|company|user|emergency|first|given|last|family|middle|maiden|sign/i.test(label)) return 'name';
    return '';
  }

  function kindOf(field) {
    var key = factKey(field);
    if (key === 'name' || key === 'firstName' || key === 'lastName' || key === 'nric' || key === 'phone' || key === 'email' || key === 'street' || key === 'address' || key === 'blk' || key === 'company' || key === 'postal' || key === 'dob') return key;
    var label = blob(field).toLowerCase();
    if (/street/.test(label)) return 'street';
    if (/blk|house/.test(label)) return 'blk';
    if (/company/.test(label)) return 'company';
    if (/e-?mail/.test(label)) return 'email';
    if (/phone|\bhp\b|mobile/.test(label)) return 'phone';
    if (/nric|\bfin\b/.test(label)) return 'nric';
    if (/\bname\b/.test(label) && !/street|bank|company/.test(label)) return 'name';
    return 'text';
  }

  function accept(field, value) {
    var text = String(value || '').trim();
    if (!text || PLACE.test(text)) {
      var kind0 = kindOf(field);
      if (kind0 === 'name' || kind0 === 'phone' || kind0 === 'email' || kind0 === 'street' || kind0 === 'address' || kind0 === 'blk' || kind0 === 'company') return false;
      if (!text) return false;
    }
    var kind = kindOf(field);
    if (kind === 'firstName' || kind === 'lastName') return /^[A-Za-z][A-Za-z'’.\-]{1,30}$/.test(text);
    if (kind === 'name') {
      if (PLACE.test(text)) return false;
      if (/^(chinese|malay|indian|eurasian|male|female)$/i.test(text)) return false;
      return text.split(/\s+/).length >= 2;
    }
    if (kind === 'nric') return /^[STFGM]\d{7}[A-Z]$/i.test(text.replace(/\s/g, ''));
    if (kind === 'phone') return text.replace(/\D/g, '').length >= 8;
    if (kind === 'email') return /@/.test(text) && !PLACE.test(text);
    if (kind === 'street' || kind === 'address' || kind === 'blk' || kind === 'company') return !PLACE.test(text);
    if (kind === 'postal') return /^\d{6}$/.test(text);
    if (kind === 'dob') return /^\d{2}\/\d{2}\/\d{4}$/.test(text);
    return !PLACE.test(text);
  }

  function same(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  }

  function mapFactsToFields(facts, fields) {
    var out = {};
    (fields || []).forEach(function (field) {
      var key = factKey(field);
      if (!key || !facts || !facts[key]) return;
      var value = facts[key];
      if (field.type === 'radio' || field.type === 'checkbox') {
        if (same(field.label, value)) out[field.id] = field.label;
        return;
      }
      if (accept(field, value)) out[field.id] = value;
    });
    return out;
  }

  function signals(text) {
    var raw = String(text || '');
    var emails = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig) || [];
    var nrics = raw.match(/\b[STFGM]\d{7}[A-Z]\b/gi) || [];
    var cue = /\b(company|employer|designation|department|employee|occupation|e-?mail|\btel\b|phone|mobile|bank|account|nationality)\b/i.test(raw);
    var phone = !!phoneFrom(raw);
    return {
      raw: raw,
      emails: emails,
      phone: phone,
      idLike: nrics.length > 0 && !emails.length && !phone && !cue && raw.length < 2200
    };
  }

  function modelFields(fields, corpus) {
    var sig = signals(corpus);
    var out = [];
    (fields || []).forEach(function (field) {
      if (!field || field.type === 'radio' || field.type === 'checkbox' || out.length >= 8) return;
      var key = factKey(field);
      var label = blob(field).toLowerCase();
      if (key === 'email' || /e-?mail/.test(label)) {
        if (sig.emails.length) out.push(field);
        return;
      }
      if (key === 'phone' || /phone|\(hp\)|\bhp\b|mobile|\btel\b/.test(label)) {
        if (sig.phone) out.push(field);
        return;
      }
      if (sig.idLike) return;
      if (/company|employer|employee|bank|designation|department|occupation|title/.test(label)) {
        var hinted = label.split(/[^a-z0-9]+/).filter(function (word) { return word.length > 3; }).some(function (word) {
          return sig.raw.toLowerCase().indexOf(word) !== -1;
        });
        if (hinted) out.push(field);
        return;
      }
      var words = label.split(/[^a-z0-9]+/).filter(function (word) {
        return word.length > 3 && !/^(name|date|full|number|field|text|form|this|with|from)$/.test(word);
      });
      var hit = words.some(function (word) { return sig.raw.toLowerCase().indexOf(word) !== -1; });
      var prose = sig.raw.split(/\s+/).filter(Boolean).length > 40;
      if (hit || (prose && (key === 'name' || key === 'street' || key === 'dob' || /national|address|emergency/.test(label)))) out.push(field);
    });
    return out;
  }

  function preview(facts) {
    var items = [];
    function push(label, value) {
      if (!value || items.length >= 4) return;
      items.push(label + ' ' + String(value).replace(/\s+/g, ' ').trim());
    }
    if (!facts) return '';
    var address = (facts.blk || facts.street)
      ? [facts.blk, facts.street, facts.unit ? '#' + String(facts.unit).replace(/^#/, '') : '', facts.postal].filter(Boolean).join(' ')
      : '';
    push('Name', facts.name);
    push('DOB', facts.dob);
    push('Address', address);
    push('NRIC', facts.nric);
    push('Phone', facts.phone);
    push('Email', facts.email);
    push('Company', facts.company);
    return items.join(' · ');
  }

  return {
    fromText: fromText,
    mapFactsToFields: mapFactsToFields,
    modelFields: modelFields,
    preview: preview,
    accept: accept,
    nricChecksum: nricChecksum
  };
});
