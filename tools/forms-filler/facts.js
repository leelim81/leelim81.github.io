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

  function nricTokens(text) {
    var hits = [];
    var re = /(?:^|[^A-Z0-9])([STFGM$5])\s?(\d{7})\s?([A-Z])(?![A-Z0-9])/gi;
    var match;
    while ((match = re.exec(String(text || '')))) {
      var head = match[1].toUpperCase();
      if (head === '$' || head === '5') head = 'S';
      var token = head + match[2] + match[3].toUpperCase();
      if (/^[STFGM]\d{7}[A-Z]$/.test(token)) hits.push(token);
    }
    return unique(hits);
  }

  function nricFrom(text) {
    var hits = nricTokens(text);
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
      if (/\b\d{6}\b/.test(lines[i]) || /\b(lane|road|street|avenue|ave|walk|close|quay|drive|crescent)\b/i.test(lines[i])) continue;
      return words.join(' ');
    }
    return '';
  }

  function dobFrom(text) {
    var raw = String(text || '');
    var found = [];
    function push(index, date) {
      var norm = normDate(date);
      if (norm) found.push({ index: index, date: norm });
    }
    var match;
    var numeric = /(?:date of b\w+|dob|出生|born)[\s\S]{0,40}?(\d{1,2})[\/.\- ](\d{1,2})[\/.\- ](\d{4})/ig;
    while ((match = numeric.exec(raw))) push(match.index, match[1] + '/' + match[2] + '/' + match[3]);
    var sexed = /\b(\d{1,2})[\/.\- ](\d{1,2})[\/.\- ](\d{4})\s+[MF]\b/ig;
    while ((match = sexed.exec(raw))) push(match.index, match[1] + '/' + match[2] + '/' + match[3]);
    var named = /(?:date of birth|dob|born)[^\n]{0,48}?(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/ig;
    while ((match = named.exec(raw))) push(match.index, match[1] + ' ' + match[2] + ' ' + match[3]);
    var ranked = found.map(function (item) {
      var lineStart = raw.lastIndexOf('\n', Math.max(0, item.index - 1)) + 1;
      var lineEnd = raw.indexOf('\n', item.index);
      if (lineEnd < 0) lineEnd = raw.length;
      var section = '';
      raw.slice(0, lineStart).split(/\n/).forEach(function (prior) {
        var heading = prior.trim().match(/^(patient|applicant|member|claimant|worker|dependant|dependent|spouse|child|nurse|visitor|resident)\b[:\s-]*$/i);
        if (heading) section = heading[1].toLowerCase();
      });
      return { date: item.date, index: item.index, role: dateRole(section, raw.slice(lineStart, lineEnd), raw) };
    }).filter(function (item) {
      if (item.role === 'applicant' || item.role === 'same') return true;
      return item.role === 'unscoped' && !mixedPeople(raw);
    });
    ranked.sort(function (a, b) {
      var rank = function (role) { return role === 'applicant' || role === 'same' ? 0 : 1; };
      return rank(a.role) - rank(b.role) || a.index - b.index;
    });
    return ranked.length ? ranked[0].date : '';
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
    var labeled = raw.match(/\b(?:premises|home address|residential address|mailing address)\s*[:\-]\s*([^\n.;]{4,120})/i);
    if (labeled) {
      var line = labeled[1].replace(/\s+/g, ' ').trim().replace(/[.,;]+$/, '');
      var tail = line.match(/^(.*?)(?:\s+)(\d{6})$/);
      if (tail && tail[1].replace(/\d/g, '').trim().length > 2) {
        out.postal = tail[2];
        out.labeled = (tail[1].trim() + ' ' + tail[2]).replace(/\s+/g, ' ');
      } else if (!/^\d{6}$/.test(line)) {
        out.labeled = line;
      }
    }
    var after = addr ? raw.slice(raw.indexOf(addr[0]) + addr[0].length) : '';
    var postal = after.match(/\b(\d{6})\b/);
    if (!out.postal && postal) out.postal = postal[1];
    return out;
  }

  function unique(list) {
    var out = [];
    list.forEach(function (item) {
      if (item && out.indexOf(item) === -1) out.push(item);
    });
    return out;
  }

  /* When a line is a person heading, later values belong to that person.
     A second applicant value is a conflict, not the first one in reading order. */
  function applicantLines(text) {
    var roleOf = {
      applicant: 'applicant', member: 'applicant', claimant: 'applicant', worker: 'applicant',
      patient: 'patient', dependant: 'dependant', dependent: 'dependant',
      spouse: 'other', child: 'other', nurse: 'other', visitor: 'other', resident: 'other',
      witness: 'other', guardian: 'other', parent: 'other', sibling: 'other', doctor: 'other'
    };
    var lines = String(text || '').split(/\n/);
    var section = '';
    var headed = false;
    var kept = [];
    lines.forEach(function (line) {
      var trimmed = line.trim();
      var bare = trimmed.match(/^([A-Za-z][A-Za-z'’\-]{1,24}):?$/);
      if (bare && roleOf[bare[1].toLowerCase()]) {
        section = roleOf[bare[1].toLowerCase()];
        headed = true;
        return;
      }
      if (section === 'applicant') kept.push(trimmed);
    });
    return headed ? kept.join('\n') : null;
  }

  function labelledNames(text) {
    var found = [];
    var re = /\bfull name\b[ \t]*[:\-][ \t]*([A-Za-z][A-Za-z'’.\-]+(?:[ \t]+[A-Za-z][A-Za-z'’.\-]+){1,5})/ig;
    var match;
    while ((match = re.exec(String(text || '')))) found.push(match[1].replace(/\s+/g, ' ').trim());
    return unique(found);
  }

  function labelledEmails(text) {
    return unique(String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig) || []);
  }

  function labelledPhones(text) {
    var found = [];
    var re = /(?:phone|mobile|\btel\b|contact)\s*(?:no\.?|number)?\s*[:\-]\s*(\+?\d[\d\s()-]{7,})/ig;
    var match;
    while ((match = re.exec(String(text || '')))) {
      var digits = match[1].replace(/\D/g, '');
      if (digits.length >= 8 && digits.length <= 15) found.push(match[1].replace(/\s+/g, ' ').trim());
    }
    return unique(found);
  }

  function fromText(text) {
    var facts = {};
    var scope = applicantLines(text);
    var scoped = scope != null;
    var nameSource = scoped ? scope : text;
    var names = labelledNames(nameSource);
    if (names.length > 1) facts.conflict = true;
    else if (names.length === 1) facts.name = names[0];
    else if (!scoped) {
      var name = nameFrom(text);
      if (name) facts.name = name;
    }
    var nricSource = scoped ? scope : text;
    var nricHits = nricTokens(nricSource);
    if (nricHits.length > 1) facts.conflict = true;
    else if (nricHits.length === 1) facts.nric = nricHits[0];
    else if (!scoped) {
      var nric = nricFrom(text);
      if (nric) facts.nric = nric;
    }
    var mailSource = scoped ? scope : text;
    var emails = labelledEmails(mailSource);
    if (emails.length > 1) facts.conflict = true;
    else if (emails.length === 1) facts.email = emails[0];
    var phoneSource = scoped ? scope : text;
    var phones = labelledPhones(phoneSource);
    if (phones.length > 1) facts.conflict = true;
    else if (phones.length === 1) facts.phone = phones[0];
    else if (!scoped) {
      var phone = phoneFrom(text);
      if (phone) facts.phone = phone;
    }
    var dob = dobFrom(text);
    if (dob) facts.dob = dob;
    var body = scoped ? scope : text;
    var sex = sexFrom(body);
    if (sex) facts.sex = sex;
    var race = raceFrom(body);
    if (race) facts.race = race;
    var addressLabels = (String(body).match(/\baddress\b\s*[:\-]/ig) || []).length;
    var address = addressLabels > 1 ? {} : addressFrom(body);
    if (addressLabels > 1) facts.conflict = true;
    if (address.blk) facts.blk = address.blk;
    if (address.street) facts.street = address.street;
    if (address.unit) facts.unit = address.unit;
    if (address.postal) facts.postal = address.postal;
    var addressLine = [address.blk, address.street, address.unit ? '#' + address.unit : '', address.postal].filter(Boolean).join(' ');
    if (address.blk || address.street) facts.address = addressLine;
    else if (address.labeled) facts.address = address.labeled;
    var residential = residentialFrom(text);
    if (residential) facts.residential = residential;
    if (residential) facts.citizenship = residential;
    var company = companyFrom(body);
    if (company) facts.company = company;
    var firstName = explicitPart(body, /\bfirst\s+name\b\s*[:\-]\s*([A-Za-z][A-Za-z'’.\-]+)/i);
    var lastName = explicitPart(body, /\b(?:last|family|surname)\s+name\b\s*[:\-]\s*([A-Za-z][A-Za-z'’.\-]+)/i);
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

  function statedStatus(text) {
    var kind = applicableCitizenship(text);
    if (kind === 'singapore') return 'Singapore Citizen';
    if (kind === 'pr') return 'Permanent Resident';
    if (kind === 'foreigner') return 'Foreigner';
    return '';
  }

  function residentialFrom(text) {
    return statedStatus(text);
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

  function cleanNameLabel(label) {
    var s = String(label || '');
    if (/printed|card|cord|\bphoto\b|behind|\bwrite\b|possport/i.test(s)) return false;
    var tokens = s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    var known = { name: 1, full: 1, first: 1, last: 1, family: 1, given: 1, surname: 1, middle: 1, maiden: 1, of: 1, the: 1, as: 1, in: 1, member: 1, claimant: 1, applicant: 1, applicants: 1, entity: 1, individual: 1, person: 1, nric: 1, fin: 1, passport: 1, no: 1, number: 1 };
    var odd = tokens.some(function (token) { return token.length > 2 && !known[token]; });
    if (odd) return false;
    return /\bname\b/i.test(s);
  }

  function personName(text) {
    var parts = String(text || '').trim().split(/\s+/);
    return parts.length >= 2 && parts.every(function (part) { return /^[A-Za-z][A-Za-z'’.\-]+$/.test(part); });
  }

  function factKey(field) {
    var label = blob(field);
    if (/dependant|dependent|spouse|\bchild\b|authorised officer|authorized officer/i.test(label)) return '';
    if (/\baddress\b/i.test(label) && !/e-?mail|ip\b/i.test(label)) return 'address';
    if (/street/i.test(label)) return 'street';
    if (/blk|house\s*no/i.test(label)) return 'blk';
    if (/unit\s*no/i.test(label)) return 'unit';
    if (/postal/i.test(label)) return 'postal';
    if (/company|employer/i.test(label)) return 'company';
    if (/e-?mail/i.test(label)) return 'email';
    if (/(^|\s)contact$/i.test(label) || /contact\s*(no\.?|number)|phone|\(hp\)|\bh\s*\/\s*p\b|\bhp\b|mobile|\btel\b/i.test(label)) return 'phone';
    if (/\bname\b/i.test(label) && /nric|\bfin\b/i.test(label)) return 'name';
    if (/nric|fin\s*number|身份证/i.test(label)) {
      var nricTokens = label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      var nricKnown = { nric: 1, fin: 1, no: 1, number: 1, name: 1, of: 1, the: 1, as: 1, in: 1, passport: 1, applicant: 1, member: 1 };
      if (nricTokens.some(function (token) { return token.length > 3 && !nricKnown[token]; })) return '';
      return 'nric';
    }
    if (/date of birth|出生|\bdob\b/i.test(label)) return 'dob';
    if (/gender|性别|\bsex\b/i.test(label)) return 'sex';
    if (/\brace\b|种族/i.test(label)) return 'race';
    if (/residential|住户/i.test(label)) return 'residential';
    if (/citizen|nationalit/.test(label)) return 'citizenship';
    if (/bank/.test(label.toLowerCase()) && /name/i.test(label)) return '';
    if (/\bname\b/i.test(label) && /dependant|dependent|officer|union/.test(label)) return '';
    if (/business\s+name|disregarded entity/i.test(label)) return 'company';
    if (/\bfirst\b/i.test(label) && /\bname\b/i.test(label)) return 'firstName';
    if (/\b(last|family|surname)\b/i.test(label) && /\bname\b/i.test(label)) return 'lastName';
    if (/full\s*name|姓名/i.test(label)) return 'name';
    if (/\bapplicant'?s?\s+name\b/i.test(label)) return 'name';
    if (/\bname\b/i.test(label) && !/street|bank|company|user|emergency|first|given|last|family|middle|maiden|sign/i.test(label)) {
      return cleanNameLabel(label) ? 'name' : '';
    }
    return '';
  }

  function normDate(value) {
    var text = String(value || '').trim();
    var numeric = text.match(/^(\d{1,2})[\/.\- ](\d{1,2})[\/.\- ](\d{4})$/);
    if (numeric) return ('0' + numeric[1]).slice(-2) + '/' + ('0' + numeric[2]).slice(-2) + '/' + numeric[3];
    var months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    var named = text.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
    if (!named) return '';
    var month = months[named[2].slice(0, 3).toLowerCase()];
    return month ? ('0' + named[1]).slice(-2) + '/' + month + '/' + named[3] : '';
  }

  function datesInSentence(sentence) {
    var found = [];
    var months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    var numeric = /(\d{1,2})[\/.\- ](\d{1,2})[\/.\- ](\d{4})/g;
    var match;
    while ((match = numeric.exec(sentence))) {
      found.push(('0' + match[1]).slice(-2) + '/' + ('0' + match[2]).slice(-2) + '/' + match[3]);
    }
    var named = /(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/g;
    while ((match = named.exec(sentence))) {
      var month = months[match[2].slice(0, 3).toLowerCase()];
      if (month) found.push(('0' + match[1]).slice(-2) + '/' + month + '/' + match[3]);
    }
    return found;
  }

  function modelScalar(value) {
    if (value == null) return '';
    var text = String(value).replace(/\s+/g, ' ').trim();
    if (/^(null|undefined)$/i.test(text)) return '';
    return text;
  }

  function placeholder(text) {
    return /not specified|unspecified|\bunknown\b|n\/a|\bnil\b/i.test(text);
  }

  function explicitSamePerson(hay) {
    return /patient is the applicant|applicant is the patient|the applicant is the patient|patient and the applicant are the same/i.test(hay);
  }

  function mixedPeople(hay) {
    return /\bpatient\b/i.test(hay) && /\b(applicant|member|claimant)\b/i.test(hay) && !explicitSamePerson(hay);
  }

  function linesWithSection(hay) {
    var section = '';
    var out = [];
    String(hay || '').split(/\n/).forEach(function (line) {
      var trimmed = line.trim();
      var heading = trimmed.match(/^(patient|applicant|member|claimant|worker|dependant|dependent|spouse|child|nurse|visitor|resident)\b[:\s-]*$/i);
      if (heading) {
        section = heading[1].toLowerCase();
        return;
      }
      if (trimmed) out.push({ section: section, text: trimmed });
    });
    return out;
  }

  function dateRole(section, sentence, hay) {
    var lower = (section + ' ' + sentence).toLowerCase();
    var patient = section === 'patient' || /\bpatient\b/.test(lower);
    var applicant = section === 'applicant' || section === 'member' || section === 'claimant' || section === 'worker' || /\b(applicant|member|claimant|worker)\b|\bfull name\b/.test(lower);
    var other = section === 'dependant' || section === 'dependent' || section === 'spouse' || section === 'child' || section === 'nurse' || section === 'visitor' || section === 'resident' || /\banother person\b|\baccompanied by\b|\b(dependant|dependent|spouse|child|nurse|visitor|resident)\b/.test(lower);
    if (other && !applicant) return 'other';
    if (patient && applicant && !explicitSamePerson(sentence) && !explicitSamePerson(hay)) return 'ambiguous';
    if (patient && explicitSamePerson(hay) && !other) return 'same';
    if (patient && !applicant) return 'patient';
    if (applicant) return 'applicant';
    return 'unscoped';
  }

  function dateAllowed(value, corpus) {
    var want = normDate(value);
    if (!want) return false;
    var hay = String(corpus || '');
    var mixed = mixedPeople(hay);
    var ok = false;
    linesWithSection(hay).forEach(function (row) {
      row.text.replace(/(\d{1,2})\.(\d{1,2})\.(\d{4})/g, '$1/$2/$3').split(/[.;]+/).forEach(function (sentence) {
        if (datesInSentence(sentence).indexOf(want) === -1) return;
        var role = dateRole(row.section, sentence, hay);
        if (role === 'applicant' || role === 'same' || (role === 'unscoped' && !mixed)) ok = true;
      });
    });
    return ok;
  }

  function citizenshipField(field) {
    return /citizen|nationalit|residential status|residency|\bforeigner\b/.test(blob(field).toLowerCase());
  }

  function bankField(field) {
    var label = blob(field).toLowerCase();
    return /\bbank\b|\bgiro\b|\bledger\b|\bpayee\b|\bsettlement\b|\baccount\b/.test(label) && !/e-?mail|holder/.test(label);
  }

  function dobField(field) {
    return /birth|\bdob\b|date of birth/.test(blob(field).toLowerCase());
  }

  function evidenceField(field) {
    return citizenshipField(field) || bankField(field) || dobField(field);
  }

  function citizenshipKind(value) {
    var text = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/^a\s+/, '');
    if (text === 'singapore' || text === 'singaporean' || text === 'singapore citizen') return 'singapore';
    if (text === 'permanent resident' || text === 'pr') return 'pr';
    if (text === 'foreigner') return 'foreigner';
    return '';
  }

  function statementKind(sentence) {
    var trimmed = String(sentence || '').trim();
    if (/^(?:a\s+)?(singapore citizen|singaporean|permanent resident|foreigner)$/i.test(trimmed)) return citizenshipKind(trimmed);
    var labeled = trimmed.match(/(?:citizenship|nationality|residential status|residency)\s*[:\-]?\s*(singapore citizen|singaporean|permanent resident|foreigner|singapore|not specified|unspecified|unknown|n\/a|nil)\b/i);
    if (labeled) {
      if (/not specified|unspecified|unknown|n\/a|nil/i.test(labeled[1])) return 'placeholder';
      return citizenshipKind(labeled[1]);
    }
    var said = sentence.match(/\b(?:applicant|member|claimant)\b[^.\n]{0,60}\b(?:is|as)\b[^.\n]{0,24}\b(?:a\s+)?(singapore citizen|singaporean|permanent resident|foreigner)\b/i);
    return said ? citizenshipKind(said[1]) : '';
  }

  function statementRole(section, sentence, hay) {
    var inline = sentence.match(/\b(patient|applicant|member|claimant|dependant|dependent|spouse|child)(?:'s|s)?\s+(?:citizenship|nationality|residential status|residency)\b/i);
    var who = inline ? inline[1].toLowerCase() : section;
    if (who === 'patient') return explicitSamePerson(hay) ? 'same' : 'patient';
    if (who === 'dependant' || who === 'dependent' || who === 'spouse' || who === 'child') return 'other';
    if (who === 'applicant' || who === 'member' || who === 'claimant') return 'applicant';
    if (mixedPeople(hay)) return 'ambiguous';
    return 'applicant';
  }

  function applicableCitizenship(hay) {
    var kinds = [];
    linesWithSection(hay).forEach(function (row) {
      row.text.split(/[.;]+/).forEach(function (sentence) {
        var kind = statementKind(sentence);
        if (!kind || kind === 'placeholder') return;
        var role = statementRole(row.section, sentence, hay);
        if (role === 'applicant' || role === 'same') kinds.push(kind);
      });
    });
    var uniq = kinds.filter(function (kind, index) { return kinds.indexOf(kind) === index; });
    return uniq.length === 1 ? uniq[0] : '';
  }

  function prepareCitizenship(field, value, corpus) {
    var want = citizenshipKind(value);
    var stated = applicableCitizenship(corpus);
    if (!want || !stated || want !== stated) return '';
    var options = field && field.options || [];
    for (var i = 0; i < options.length; i++) {
      if (citizenshipKind(options[i]) === stated) return String(options[i]);
    }
    if (stated === 'singapore') return 'Singapore Citizen';
    if (stated === 'pr') return 'Permanent Resident';
    return 'Foreigner';
  }

  function sameAccount(a, b) {
    if (a === b) return true;
    var left = a.replace(/^0+/, '');
    var right = b.replace(/^0+/, '');
    return left.length >= 6 && left === right;
  }

  function bankValue(value, corpus) {
    var digits = String(value || '').replace(/\D/g, '');
    if (digits.length < 6) return '';
    var found = '';
    var pattern = /\b(?:bank account(?:\s*(?:number|no\.?))?|account\s*(?:number|no\.?)|giro|ledger|payee|settlement)\b[^0-9\n]{0,24}([0-9][0-9\s-]{4,}[0-9])/ig;
    var match;
    while ((match = pattern.exec(String(corpus || '')))) {
      var run = match[1].replace(/\D/g, '');
      if (sameAccount(digits, run)) found = run;
    }
    return found;
  }

  function prepareModelValue(field, value, corpus) {
    var text = modelScalar(value);
    if (!text || placeholder(text)) return '';
    if (citizenshipField(field)) return prepareCitizenship(field, text, corpus);
    if (bankField(field)) return bankValue(text, corpus);
    if (dobField(field)) return dateAllowed(text, corpus) ? normDate(text) : '';
    return text;
  }

  function allowModelValue(field, value, corpus) {
    var text = modelScalar(value);
    if (!text || placeholder(text)) return false;
    if (evidenceField(field)) return prepareModelValue(field, text, corpus) !== '';
    return true;
  }

  function coerceModelObject(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    var out = {};
    Object.keys(data).forEach(function (key) {
      out[key] = modelScalar(data[key]);
    });
    return out;
  }

  function reviewLabels(fields) {
    var out = [];
    (fields || []).forEach(function (field) {
      if (!field || field.type === 'radio' || field.type === 'checkbox') return;
      if (field.untrusted) { out.push(String(field.label || 'line')); return; }
      if (factKey(field)) return;
      var label = blob(field);
      if (/\bname\b|possport|\bprinted\b|\bnome\b/i.test(label)) out.push(String(field.label || 'line'));
    });
    return out;
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
    if (personName(text) && (kind === 'sex' || kind === 'dob' || kind === 'race' || kind === 'nric' || /sex|gender|date of birth|\bdob\b|\brace\b/i.test(blob(field)))) return false;
    if (kind === 'name') {
      if (PLACE.test(text)) return false;
      if (/^(chinese|malay|indian|eurasian|male|female)$/i.test(text)) return false;
      if (!cleanNameLabel(blob(field))) return false;
      return text.split(/\s+/).length >= 2;
    }
    if (kind === 'nric') return /^[STFGM]\d{7}[A-Z]$/i.test(text.replace(/\s/g, ''));
    if (kind === 'phone') return text.replace(/\D/g, '').length >= 8;
    if (kind === 'email') return /@/.test(text) && !PLACE.test(text);
    if (kind === 'street' || kind === 'address' || kind === 'blk' || kind === 'company') return !PLACE.test(text);
    if (kind === 'postal') return /^\d{6}$/.test(text);
    if (kind === 'dob') return /^\d{2}\/\d{2}\/\d{4}$/.test(text);
    if (citizenshipField(field)) return citizenshipKind(text) !== '';
    return !PLACE.test(text);
  }

  function same(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  }

  function mapFactsToFields(facts, fields) {
    var out = {};
    (fields || []).forEach(function (field) {
      if (field && field.untrusted) return;
      var key = factKey(field);
      if (!key || !facts || !facts[key]) return;
      var value = facts[key];
      if (field.type === 'radio' || field.type === 'checkbox') {
        if (same(field.label, value)) out[field.id] = field.label;
        return;
      }
      if (field.options && field.options.length && (key === 'citizenship' || key === 'residential')) {
        var option = field.options.filter(function (item) { return citizenshipKind(item) && citizenshipKind(item) === citizenshipKind(value); })[0];
        if (option) { out[field.id] = option; return; }
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

  function tokenConfidence(words, value) {
    var parts = String(value || '').toUpperCase().split(/\s+/).filter(Boolean);
    if (!parts.length || !words || !words.length) return null;
    var scores = [];
    parts.forEach(function (part) {
      var key = part.replace(/[^A-Z0-9]/g, '');
      var hit = null;
      words.forEach(function (word) {
        var text = String(word.text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (text && text === key) hit = word;
      });
      if (hit && hit.confidence != null) scores.push(Number(hit.confidence));
    });
    if (!scores.length) return null;
    var total = 0;
    scores.forEach(function (score) { total += score; });
    return total / scores.length;
  }

  function soleLeader(counts) {
    var best = '';
    var seen = 0;
    var tie = false;
    Object.keys(counts).forEach(function (key) {
      if (counts[key] > seen) { seen = counts[key]; best = key; tie = false; }
      else if (counts[key] === seen) tie = true;
    });
    return tie ? '' : best;
  }

  function agreedName(names) {
    var unique = [];
    (names || []).forEach(function (name) {
      var clean = String(name || '').replace(/\s+/g, ' ').trim();
      if (clean && unique.indexOf(clean) < 0) unique.push(clean);
    });
    if (!unique.length) return '';
    var longest = unique.slice().sort(function (a, b) { return b.length - a.length; })[0];
    var ok = unique.every(function (name) {
      if (name === longest) return true;
      var small = name.split(' ');
      var large = longest.split(' ');
      if (small.length > large.length) return false;
      for (var i = 0; i < small.length; i++) {
        if (large[i] !== small[i] && large[i].indexOf(small[i]) !== 0) return false;
        if (small[i].length < 2) return false;
      }
      return true;
    });
    return ok ? longest : '';
  }

  function identityVote(reads) {
    var list = reads || [];
    var nricCounts = {};
    list.forEach(function (read) {
      var id = read && read.nric;
      if (!id || !nricChecksum(id)) return;
      nricCounts[id] = (nricCounts[id] || 0) + 1;
    });
    var nric = soleLeader(nricCounts);
    var paired = [];
    if (nric) {
      list.forEach(function (read) {
        if (read && read.nric === nric && nricChecksum(read.nric) && read.name) paired.push(read.name);
      });
    }
    var name = agreedName(paired);
    if (!name) {
      var repeated = [];
      var counts = {};
      list.forEach(function (read) {
        if (!read || !read.name) return;
        counts[read.name] = (counts[read.name] || 0) + 1;
      });
      Object.keys(counts).forEach(function (item) { if (counts[item] >= 2) repeated.push(item); });
      name = agreedName(repeated);
    }
    return {
      name: name || '',
      nric: nric || '',
      nricValid: !!nric,
      nameConf: null,
      nricConf: null,
      nameUnconfirmed: false,
      nricUnconfirmed: false
    };
  }

  function identityRead(text, words) {
    var raw = String(text || '');
    var name = nameFrom(raw);
    var hits = nricTokens(raw);
    var valid = hits.filter(nricChecksum);
    var nric = '';
    var nricValid = false;
    if (valid.length === 1) {
      nric = valid[0];
      nricValid = true;
    } else if (!valid.length && hits.length === 1) {
      nric = hits[0];
    }
    var nameConf = tokenConfidence(words, name);
    var nricConf = tokenConfidence(words, nric);
    return {
      name: name,
      nric: nric,
      nricValid: nricValid,
      nameConf: nameConf,
      nricConf: nricConf,
      nameUnconfirmed: !!(name && nameConf != null && nameConf < 55),
      nricUnconfirmed: !!(nric && (!nricValid || (nricConf != null && nricConf < 55)))
    };
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
    reviewLabels: reviewLabels,
    allowModelValue: allowModelValue,
    prepareModelValue: prepareModelValue,
    modelScalar: modelScalar,
    coerceModelObject: coerceModelObject,
    evidenceField: evidenceField,
    modelFields: modelFields,
    preview: preview,
    accept: accept,
    nricChecksum: nricChecksum,
    identityRead: identityRead,
    identityVote: identityVote
  };
});
