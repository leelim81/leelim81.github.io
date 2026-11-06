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
    if (!near) return '';
    return near[1] + '/' + near[2] + '/' + near[3];
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
    var residential = residentialFrom(text);
    if (residential) facts.residential = residential;
    return facts;
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

  function factKey(field) {
    var label = blob(field);
    if (/street/i.test(label)) return 'street';
    if (/blk|house\s*no/i.test(label)) return 'blk';
    if (/unit\s*no/i.test(label)) return 'unit';
    if (/postal/i.test(label)) return 'postal';
    if (/company|employer/i.test(label)) return 'company';
    if (/e-?mail/i.test(label)) return 'email';
    if (/phone|\(hp\)|\bhp\b|mobile|\btel\b/i.test(label)) return 'phone';
    if (/nric|fin\s*number|身份证/i.test(label)) return 'nric';
    if (/date of birth|出生|\bdob\b/i.test(label)) return 'dob';
    if (/gender|性别|\bsex\b/i.test(label)) return 'sex';
    if (/\brace\b|种族/i.test(label)) return 'race';
    if (/residential|住户/i.test(label)) return 'residential';
    if (/bank/.test(label.toLowerCase()) && /name/i.test(label)) return '';
    if (/full\s*name|applicant|姓名/i.test(label)) return 'name';
    if (/\bname\b/i.test(label) && !/street|bank|company|user|emergency/i.test(label)) return 'name';
    return '';
  }

  function kindOf(field) {
    var key = factKey(field);
    if (key === 'name' || key === 'nric' || key === 'phone' || key === 'email' || key === 'street' || key === 'blk' || key === 'company' || key === 'postal' || key === 'dob') return key;
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
      if (kind0 === 'name' || kind0 === 'phone' || kind0 === 'email' || kind0 === 'street' || kind0 === 'blk' || kind0 === 'company') return false;
      if (!text) return false;
    }
    var kind = kindOf(field);
    if (kind === 'name') {
      if (PLACE.test(text)) return false;
      if (/^(chinese|malay|indian|eurasian|male|female)$/i.test(text)) return false;
      return text.split(/\s+/).length >= 2;
    }
    if (kind === 'nric') return /^[STFGM]\d{7}[A-Z]$/i.test(text.replace(/\s/g, ''));
    if (kind === 'phone') return text.replace(/\D/g, '').length >= 8;
    if (kind === 'email') return /@/.test(text) && !PLACE.test(text);
    if (kind === 'street' || kind === 'blk' || kind === 'company') return !PLACE.test(text);
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

  return {
    fromText: fromText,
    mapFactsToFields: mapFactsToFields,
    accept: accept,
    nricChecksum: nricChecksum
  };
});
