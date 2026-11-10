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
    var prefix = id.charAt(0);
    // ICA publishes the M prefix and the shape (1 Jan 2022 media release,
    // example M1234567B is a format sketch, not a checksum). The arithmetic
    // is the published validator method: weights 2,7,6,5,4,3,2; offset 0 for
    // S/F, 4 for T/G, 3 for M. M reads the table KLJNPQRTUWX from the other
    // end, so remainder 0 is X and remainder 10 is K (XWUTRQPNJLK).
    // https://www.ica.gov.sg/about-ica/news-and-publications/media-room/new-m-fin-series-to-be-introduced-from-1-january-2022
    // https://github.com/ionbazan/go-nric/blob/v1.0.0/nric.go
    if (prefix === 'T' || prefix === 'G') sum += 4;
    if (prefix === 'M') sum += 3;
    var table = (prefix === 'S' || prefix === 'T') ? 'JZIHGFEDCBA'
      : (prefix === 'M' ? 'KLJNPQRTUWX'.split('').reverse().join('') : 'XWUTRQPNMLK');
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

  function plainOf(name) {
    return String(name || '').replace(/\s+\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
  }

  function aliasOf(name) {
    var match = String(name || '').match(/\(([A-Za-z][A-Za-z'’.\- ]*)\)\s*$/);
    return match ? match[1].replace(/\s+/g, ' ').trim() : '';
  }

  var ALIAS_BLOCK = {
    race: 1, male: 1, female: 1, chinese: 1, malay: 1, indian: 1, eurasian: 1,
    date: 1, birth: 1, blood: 1, group: 1, identity: 1, card: 1, singapore: 1,
    country: 1, sex: 1, name: 1, republic: 1, citizen: 1, nationality: 1,
    passport: 1, nric: 1, fin: 1, address: 1, issue: 1, official: 1,
    others: 1, pr: 1, postal: 1, code: 1, place: 1, expiry: 1, no: 1, number: 1,
    blk: 1, street: 1, unit: 1, permanent: 1, resident: 1, hanyu: 1, pinyin: 1,
    occupation: 1, religion: 1, dialect: 1, pass: 1, type: 1, status: 1
  };
  var ALIAS_STOP = { of: 1, the: 1, and: 1, or: 1 };
  var PLACE_ALIAS = {
    road: 1, street: 1, avenue: 1, ave: 1, drive: 1, lane: 1, crescent: 1,
    blk: 1, block: 1, singapore: 1, close: 1, place: 1, walk: 1, terrace: 1,
    boulevard: 1, blvd: 1, highway: 1, parkway: 1, expressway: 1, quay: 1,
    jalan: 1, lorong: 1, jln: 1, lor: 1
  };
  var PLACE_SHORT = { st: 1, rd: 1, dr: 1, cres: 1, cl: 1, ter: 1, av: 1, pl: 1, gdns: 1, hts: 1, ctrl: 1 };
  /* These street types are also surnames. A short personal alias may end in
     one of them. An address still has a number, a block, another street
     type, or a place word in front (Example Lane, Harbour Lane, Orchard Road). */
  var STREET_SURNAME = { lane: 1, close: 1, drive: 1, walk: 1 };
  var ADDRESS_HEAD = {
    example: 1, orchard: 1, harbour: 1, harbor: 1, cedar: 1, river: 1, record: 1, dock: 1, clinic: 1,
    north: 1, south: 1, east: 1, west: 1, upper: 1, lower: 1, sungei: 1, bukit: 1,
    circular: 1, ring: 1, market: 1, bedok: 1, tanjong: 1, tampines: 1, jurong: 1,
    clementi: 1, punggol: 1, woodlands: 1, sengkang: 1, hougang: 1, yishun: 1, bishan: 1
  };

  function placeAlias(words) {
    var lower = (words || []).map(function (word) { return String(word || '').toLowerCase(); });
    if (!lower.length) return false;
    if (lower.some(function (word) { return PLACE_ALIAS[word]; })) return true;
    return !!PLACE_SHORT[lower[lower.length - 1]];
  }

  function personalStreetSurname(words) {
    var lower = (words || []).map(function (word) { return String(word || '').toLowerCase(); });
    if (lower.length < 2 || lower.length > 3) return false;
    if (!STREET_SURNAME[lower[lower.length - 1]]) return false;
    var soft = 0;
    for (var i = 0; i < lower.length; i++) if (STREET_SURNAME[lower[i]]) soft += 1;
    if (soft !== 1) return false;
    for (var j = 0; j < lower.length - 1; j++) {
      if (ADDRESS_HEAD[lower[j]] || PLACE_ALIAS[lower[j]] || PLACE_SHORT[lower[j]] || ALIAS_BLOCK[lower[j]] || ALIAS_STOP[lower[j]]) return false;
    }
    return true;
  }

  function aliasIsPlace(words) {
    if (personalStreetSurname(words)) return false;
    return placeAlias(words);
  }

  function acceptableMain(words) {
    if (!words || words.length < 2 || words.length > 8) return false;
    if (words.some(function (word) { return word === 'REPUBLIC' || word === 'SINGAPORE' || word === 'IDENTITY' || word === 'CARD'; })) return false;
    if (words.filter(function (word) { return JUNK[word.toLowerCase()]; }).length >= words.length - 1) return false;
    if (words.every(function (word) { return JUNK[word.toLowerCase()]; })) return false;
    return true;
  }

  function aliasOk(text) {
    var raw = String(text || '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!raw || /\d/.test(raw)) return false;
    var words = raw.split(' ').filter(Boolean);
    if (words.length < 1 || words.length > 5) return false;
    if (words.some(function (word) { return !/^[A-Za-z][A-Za-z'’.\-]{1,}$/.test(word); })) return false;
    if (words.some(function (word) { return ALIAS_BLOCK[word.toLowerCase()]; })) return false;
    if (aliasIsPlace(words)) return false;
    if (words.every(function (word) { return ALIAS_STOP[word.toLowerCase()]; })) return false;
    return true;
  }

  function nameLikeLine(line) {
    var raw = String(line || '').replace(/\s+/g, ' ').trim();
    if (!raw || /\d/.test(raw)) return false;
    var words = raw.replace(/[()]/g, ' ').split(' ').filter(Boolean);
    if (!words.length || words.length > 6) return false;
    if (words.some(function (word) { return !/^[A-Za-z][A-Za-z'’.\-]{1,}$/.test(word); })) return false;
    if (!words.some(function (word) { return word.length >= 3; })) return false;
    if (placeAlias(words)) return false;
    var lower = words.map(function (word) { return word.toLowerCase(); });
    if (lower.every(function (word) { return JUNK[word] || ALIAS_BLOCK[word] || ALIAS_STOP[word]; })) return false;
    return true;
  }

  function markNameShape(parsed, lines, nameIndex, consumedNext) {
    var words = String(parsed.plain || '').split(' ').filter(Boolean);
    parsed.nameTokens = words.length;
    parsed.nameBelow = !consumedNext && nameLikeLine(lines[nameIndex + 1] || '');
    return parsed;
  }

  function nameResult(plain, alias, unbalanced) {
    var repaired = unbalanced && alias ? plain + ' (' + alias + ')' : '';
    var full = !unbalanced && alias ? plain + ' (' + alias + ')' : plain;
    return {
      full: full,
      plain: plain,
      alias: unbalanced ? '' : alias,
      repaired: repaired,
      unbalanced: !!unbalanced
    };
  }

  function splitMissingOpen(raw) {
    var words = String(raw || '').replace(/\)/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    if (words.length > 6 && acceptableMain(words)) return { plain: words.join(' '), alias: '' };
    var best = null;
    for (var n = Math.min(4, words.length - 2); n >= 2; n--) {
      var suffix = words.slice(words.length - n);
      var prefix = words.slice(0, words.length - n);
      if (prefix.length < suffix.length) continue;
      if (prefix.length > 4) continue;
      if (!aliasOk(suffix.join(' ')) || !acceptableMain(prefix)) continue;
      best = { plain: prefix.join(' '), alias: suffix.join(' ') };
      break;
    }
    if (best) return best;
    if (acceptableMain(words)) return { plain: words.join(' '), alias: '' };
    return null;
  }

  function parseNameLine(line) {
    var raw = String(line || '').replace(/\s+/g, ' ').trim();
    if (!raw) return null;
    var balanced = raw.match(/^([A-Z][A-Z'’.\-]+(?: +[A-Z][A-Z'’.\-]+){1,7}) +\(([A-Z][A-Z'’.\-]+(?: +[A-Z][A-Z'’.\-]+){0,4})\)\s*$/);
    if (balanced) {
      var main = balanced[1].split(' ').filter(Boolean);
      if (!acceptableMain(main)) return null;
      var alias = aliasOk(balanced[2]) ? balanced[2].replace(/\s+/g, ' ').trim() : '';
      return nameResult(main.join(' '), alias, false);
    }
    var opened = raw.match(/^([A-Z][A-Z'’.\-]+(?: +[A-Z][A-Z'’.\-]+){1,7}) +\(([A-Z][A-Z'’.\-]+(?: +[A-Z][A-Z'’.\-]+){0,4})\s*$/);
    if (opened && opened[0].indexOf(')') < 0) {
      var openMain = opened[1].split(' ').filter(Boolean);
      if (!acceptableMain(openMain)) return null;
      var openAlias = aliasOk(opened[2]) ? opened[2].replace(/\s+/g, ' ').trim() : '';
      return nameResult(openMain.join(' '), openAlias, true);
    }
    if (raw.indexOf('(') < 0 && /\)\s*$/.test(raw)) {
      var closed = splitMissingOpen(raw);
      if (!closed) return null;
      return nameResult(closed.plain, closed.alias, true);
    }
    var plain = raw.match(/^([A-Z][A-Z'’.\-]+(?: +[A-Z][A-Z'’.\-]+){1,7})$/);
    if (!plain) return null;
    var words = plain[1].split(' ').filter(Boolean);
    if (!acceptableMain(words)) return null;
    return nameResult(words.join(' '), '', false);
  }

  function isNameLabel(line) {
    var text = String(line || '').replace(/[:.\s]+$/g, '').trim();
    if (/debit|account|bank/i.test(text)) return false;
    return /^(full name|name)$/i.test(text);
  }

  function printedName(text) {
    var lines = linesOf(text);
    for (var i = 0; i < lines.length; i++) {
      if (!isNameLabel(lines[i])) continue;
      var parsed = parseNameLine(lines[i + 1] || '');
      if (!parsed) continue;
      var consumedNext = false;
      if (!parsed.alias && !parsed.unbalanced) {
        var wrapped = String(lines[i + 2] || '').replace(/\s+/g, ' ').trim();
        var closedWrap = wrapped.match(/^\(([A-Z][A-Z'’.\-]+(?: +[A-Z][A-Z'’.\-]+){0,4})\)$/);
        var openWrap = !closedWrap && wrapped.indexOf(')') < 0 ? wrapped.match(/^\(([A-Z][A-Z'’.\-]+(?: +[A-Z][A-Z'’.\-]+){0,4})$/) : null;
        var endWrap = !closedWrap && wrapped.indexOf('(') < 0 ? wrapped.match(/^([A-Z][A-Z'’.\-]+(?: +[A-Z][A-Z'’.\-]+){0,4})\)$/) : null;
        var inner = closedWrap ? closedWrap[1] : (openWrap ? openWrap[1] : (endWrap ? endWrap[1] : ''));
        if (inner && closedWrap && aliasOk(inner)) {
          parsed = nameResult(parsed.plain, inner.replace(/\s+/g, ' ').trim(), false);
          consumedNext = true;
        } else if (inner && (openWrap || endWrap)) {
          parsed = nameResult(parsed.plain, aliasOk(inner) ? inner.replace(/\s+/g, ' ').trim() : '', true);
          consumedNext = true;
        }
      }
      parsed.labeled = true;
      return markNameShape(parsed, lines, i + 1, consumedNext);
    }
    for (var j = 0; j < lines.length - 1; j++) {
      var line = parseNameLine(lines[j]);
      if (!line || line.alias || line.unbalanced) continue;
      var follow = String(lines[j + 1] || '').replace(/\s+/g, ' ').trim();
      var pair = follow.match(/^\(([A-Z][A-Z'’.\-]+(?: +[A-Z][A-Z'’.\-]+){1,4})\)$/);
      if (!pair || !aliasOk(pair[1])) continue;
      var found = nameResult(line.plain, pair[1].replace(/\s+/g, ' ').trim(), false);
      found.unlabeled = true;
      return markNameShape(found, lines, j, true);
    }
    return { full: '', plain: '', alias: '' };
  }

  function nameFrom(text) {
    var printed = printedName(text);
    if (printed.full) return printed.full;
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
      if (words.some(function (word) { return word === 'REPUBLIC' || word === 'SINGAPORE' || word === 'IDENTITY' || word === 'CARD' || word === 'BLK' || word === 'BLOCK'; })) continue;
      if (placeAlias(words)) continue;
      if (/\b\d{6}\b/.test(lines[i]) || /\b(lane|road|street|avenue|ave|walk|close|quay|drive|crescent|jln|lor)\b/i.test(lines[i])) continue;
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

  var BLOCK_LETTER = { '0': ['D', 'O'], '1': ['I'], '2': ['Z'], '4': ['A'], '5': ['S'], '6': ['G'], '8': ['B'] };

  function letterExplains(four, letter) {
    if (!/^\d{4}$/.test(four) || !/^\d{3}[A-Z]$/.test(letter)) return false;
    if (letter.slice(0, 3) !== four.slice(0, 3)) return false;
    var letters = BLOCK_LETTER[four.charAt(3)] || [];
    return letters.indexOf(letter.charAt(3)) >= 0;
  }

  function blockGlyphs(word) {
    if (!word) return [];
    if (word.glyphs && word.glyphs.length) return word.glyphs;
    var symbols = word.symbols || [];
    return symbols.map(function (symbol) {
      var choices = (symbol.choices || []).map(function (choice) {
        return {
          text: String(choice.text || ''),
          confidence: choice.confidence == null ? null : choice.confidence
        };
      }).filter(function (choice) { return choice.text; });
      return {
        text: String(symbol.text || ''),
        confidence: symbol.confidence == null ? null : symbol.confidence,
        choices: choices
      };
    });
  }

  function glyphsForBlock(words, block) {
    var found = [];
    (words || []).forEach(function (word) {
      var text = String(word && word.text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (text !== block && text !== 'BLK' + block && text !== 'BLOCK' + block) return;
      var glyphs = blockGlyphs(word);
      if (glyphs.length < 4) return;
      found = glyphs.slice(-4);
    });
    return found;
  }

  function blockLetterSuggestion(block, words) {
    var raw = String(block || '').toUpperCase();
    if (!/^\d{4}$/.test(raw)) return { value: '', kind: '' };
    var letters = BLOCK_LETTER[raw.charAt(3)];
    if (!letters) return { value: '', kind: '' };
    var glyphs = glyphsForBlock(words, raw);
    if (glyphs.length !== 4) return { value: '', kind: '' };
    var last = glyphs[3] || {};
    var picked = '';
    var best = -1;
    (last.choices || []).forEach(function (choice) {
      var letter = String(choice.text || '').toUpperCase();
      if (letters.indexOf(letter) < 0) return;
      var score = choice.confidence == null ? 0 : Number(choice.confidence);
      if (score > best || (score === best && (picked === '' || letters.indexOf(letter) < letters.indexOf(picked)))) {
        best = score;
        picked = letter;
      }
    });
    if (picked && best >= 20) return { value: raw.slice(0, 3) + picked, kind: 'choice' };
    var headOk = glyphs.slice(0, 3).every(function (glyph) {
      return glyph && /[0-9]/.test(glyph.text || '') && glyph.confidence != null && Number(glyph.confidence) >= 70;
    });
    var weak = last.confidence != null && Number(last.confidence) < 60 && String(last.text || '') === raw.charAt(3);
    if (headOk && weak) return { value: raw.slice(0, 3) + letters[0], kind: 'confidence' };
    return { value: '', kind: '' };
  }

  /* A 4-digit HDB block is implausible. Replace it only when a letter
     reading is supported, and never mark that replacement checked. */
  function repairFourBlock(reads, agreed, postal) {
    if (agreed && agreed.value && !/^\d{4}$/.test(agreed.value)) return null;
    var present = (reads || []).filter(function (read) { return read && read.blk; });
    var fours = [];
    present.forEach(function (read) {
      if (/^\d{4}$/.test(read.blk) && fours.indexOf(read.blk) < 0) fours.push(read.blk);
    });
    if (!fours.length) return null;
    if (present.some(function (read) {
      return !/^\d{4}$/.test(read.blk) && !fours.some(function (four) { return letterExplains(four, read.blk); });
    })) return null;
    var matched = [];
    present.forEach(function (read) {
      if (/^\d{3}[A-Z]$/.test(read.blk) && fours.some(function (four) { return letterExplains(four, read.blk); })) {
        matched.push({ value: read.blk, kind: 'read', raw: '' });
      }
      if (/^\d{4}$/.test(read.blk) && read.blkSuggest && letterExplains(read.blk, read.blkSuggest)) {
        matched.push({ value: read.blkSuggest, kind: read.blkSuggestKind || 'confidence', raw: read.blk });
      }
    });
    var unique = [];
    matched.forEach(function (item) {
      if (!unique.some(function (have) { return have.value === item.value; })) unique.push(item);
    });
    if (unique.length !== 1) return null;
    var candidate = unique[0].value;
    var raws = fours.filter(function (four) { return letterExplains(four, candidate); });
    if (raws.length !== 1) return null;
    var strong = matched.some(function (item) {
      return item.value === candidate && (item.kind === 'choice' || item.kind === 'read');
    });
    var postalKnown = postal && postal.checked && /^\d{6}$/.test(postal.value || '');
    var postalOk = !postalKnown || String(postal.value).slice(-3) === candidate.slice(0, 3);
    if (!strong && !postalOk) return null;
    return { value: candidate, hint: raws[0] };
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
    function plainPool(reads) {
      return (reads || []).map(function (read) {
        var name = '';
        if (typeof read === 'string') name = read;
        else if (read && typeof read.name === 'string') name = read.name;
        return plainOf(name);
      }).filter(Boolean);
    }
    var namePool = paired.length ? paired.map(plainOf) : plainPool(list);
    var plain = agreedName(namePool);
    if (!plain) {
      var counts = {};
      namePool.forEach(function (item) { counts[item] = (counts[item] || 0) + 1; });
      var repeated = [];
      Object.keys(counts).forEach(function (item) { if (counts[item] >= 2) repeated.push(item); });
      plain = agreedName(repeated);
    }
    var aliasCounts = {};
    if (plain) {
      list.forEach(function (read) {
        if (!read || plainOf(read.name) !== plain) return;
        var alias = aliasOf(read.name) || (read.nameAlias || '');
        if (alias && aliasOk(alias)) aliasCounts[alias] = (aliasCounts[alias] || 0) + 1;
      });
    }
    var alias = soleLeader(aliasCounts);
    if (alias && !aliasOk(alias)) alias = '';
    var repaired = '';
    var unbalanced = false;
    if (plain && !alias) {
      list.forEach(function (read) {
        if (!read || plainOf(read.name) !== plain) return;
        if (read.unbalanced) unbalanced = true;
        if (read.nameRepaired && aliasOk(aliasOf(read.nameRepaired))) repaired = read.nameRepaired;
      });
    }
    var name = plain ? (alias ? plain + ' (' + alias + ')' : plain) : '';
    var tokens = plain ? plain.split(' ').filter(Boolean) : [];
    var nameUnconfirmed = false;
    if (plain) {
      list.forEach(function (read) {
        if (!read || !read.name) return;
        var otherPlain = plainOf(read.name);
        if (otherPlain === plain) {
          if (read.nameConf != null && read.nameConf < 55) nameUnconfirmed = true;
          return;
        }
        var other = otherPlain.split(' ').filter(Boolean);
        if (other.length > tokens.length) nameUnconfirmed = true;
        if (tokens.length && tokens.every(function (word) { return other.indexOf(word) >= 0; })) nameUnconfirmed = true;
      });
    }
    if (unbalanced && !alias) nameUnconfirmed = true;
    function sameName(a, b) {
      if (!a || !b) return false;
      if (a === b) return true;
      var left = a.split(' ').filter(Boolean);
      var right = b.split(' ').filter(Boolean);
      var small = left.length <= right.length ? left : right;
      var large = left.length <= right.length ? right : left;
      if (!small.length || small.length === large.length) return false;
      for (var i = 0; i < small.length; i++) if (small[i] !== large[i]) return false;
      return true;
    }
    var anyAlias = !!alias;
    var labeledSupport = 0;
    var tokenCounts = [];
    var sawBelow = false;
    list.forEach(function (read) {
      if (!read) return;
      if (read.nameAlias || aliasOf(read.name) || read.nameRepaired) anyAlias = true;
      var other = plainOf(read.name);
      var related = plain && (other === plain || sameName(other, plain));
      if (related) {
        var count = read.nameTokens || other.split(' ').filter(Boolean).length;
        if (count) tokenCounts.push(count);
        if (read.nameBelow) sawBelow = true;
      }
      if (plain && read.labeled && other === plain) labeledSupport++;
    });
    var sameCount = tokenCounts.length > 0 && tokenCounts.every(function (count) { return count === tokens.length; });
    function agreedValue(key) {
      var counts = {};
      list.forEach(function (read) {
        var value = read && read[key];
        if (!value) return;
        counts[value] = (counts[value] || 0) + 1;
      });
      var value = soleLeader(counts);
      return { value: value || '', checked: !!(value && counts[value] >= 2) };
    }
    function agreedBlock(reads) {
      var counts = {};
      var order = [];
      (reads || []).forEach(function (read) {
        var value = read && read.blk;
        if (!value) return;
        if (!counts[value]) order.push(value);
        counts[value] = (counts[value] || 0) + 1;
      });
      var value = soleLeader(counts);
      var bad = function (item) { return /^\d{4}$/.test(item); };
      if (!value && order.length && order.every(bad)) {
        var bestCount = 0;
        order.forEach(function (item) { if (counts[item] > bestCount) bestCount = counts[item]; });
        value = order.filter(function (item) { return counts[item] === bestCount; })[0];
      }
      var unconfirmed = !!(value && (bad(value) || (reads || []).some(function (read) {
        return read && read.blk === value && read.blkUnconfirmed;
      })));
      return { value: value || '', checked: !!(value && counts[value] >= 2 && !unconfirmed), unconfirmed: unconfirmed };
    }
    var dob = agreedValue('dob');
    var dobUnconfirmed = false;
    if (dob.value) {
      var holders = list.filter(function (read) { return read && read.dob; });
      var doubtful = holders.some(function (read) { return read.dob === dob.value && read.dobUnconfirmed; });
      if (doubtful) {
        dob = { value: dob.value, checked: false };
        dobUnconfirmed = true;
      }
    }
    var sex = agreedValue('sex');
    var nationality = agreedValue('nationality');
    var race = agreedValue('race');
    var birthCountry = agreedValue('birthCountry');
    var blk = agreedBlock(list);
    var street = agreedValue('street');
    var unit = agreedValue('unit');
    var unitUnconfirmed = list.some(function (read) { return read && read.unit === unit.value && read.unitUnconfirmed; });
    if (unit.value && unitUnconfirmed) unit = { value: unit.value, checked: false };
    var postal = agreedValue('postal');
    var blkHint = '';
    var blockRepair = repairFourBlock(list, blk, postal);
    if (blockRepair) {
      blk = { value: blockRepair.value, checked: false, unconfirmed: true };
      blkHint = blockRepair.hint;
    }
    var address = agreedValue('address');
    var phrases = [];
    function remember(value) {
      var text = String(value || '').replace(/\s+/g, ' ').trim().toUpperCase();
      if (text && phrases.indexOf(text) < 0) phrases.push(text);
    }
    list.forEach(function (read) {
      if (!read) return;
      if (read.labeled) remember(read.namePlain || plainOf(read.name));
      if (read.nameAlias) remember(read.nameAlias);
      var kept = aliasOf(read.name);
      if (kept && aliasOk(kept)) remember(kept);
    });
    var streetFromBlk = list.some(function (read) {
      return read && read.streetFromBlk && String(read.street || '').toUpperCase() === String(street.value || '').toUpperCase();
    });
    if (street.value && !streetFromBlk && phrases.indexOf(String(street.value).toUpperCase()) >= 0) street = { value: '', checked: false };
    var whole = blk.value && !blk.unconfirmed && street.value && postal.value ? address.value : '';
    return {
      name: name || '',
      namePlain: plain || '',
      nameAlias: alias || '',
      nameRepaired: (!alias && repaired) || '',
      nric: nric || '',
      nricValid: !!nric,
      nameConf: null,
      nricConf: null,
      nameUnconfirmed: nameUnconfirmed,
      nricUnconfirmed: false,
      nameChecked: !!(name && tokens.length >= 2 && sameCount && !sawBelow && !nameUnconfirmed && !anyAlias && labeledSupport >= 2),
      nricChecked: !!(nric && nricCounts[nric] >= 2),
      dob: dob.value,
      sex: sex.value,
      nationality: nationality.value,
      race: race.value,
      birthCountry: birthCountry.value,
      blk: blk.value,
      street: street.value,
      unit: unit.value,
      postal: postal.value,
      address: whole,
      dobChecked: dob.checked,
      dobUnconfirmed: dobUnconfirmed,
      sexChecked: sex.checked,
      nationalityChecked: nationality.checked,
      raceChecked: race.checked,
      birthCountryChecked: birthCountry.checked,
      blkChecked: blk.checked,
      streetChecked: street.checked,
      unitChecked: unit.checked,
      unitUnconfirmed: unitUnconfirmed,
      postalChecked: postal.checked,
      blkUnconfirmed: blk.unconfirmed,
      blkHint: blkHint,
      addressChecked: !!(whole && address.checked && blk.checked && street.checked && postal.checked)
    };
  }

  function validCardDob(value) {
    var norm = normDate(value);
    if (!norm) return '';
    var parts = norm.split('/');
    var day = Number(parts[0]);
    var month = Number(parts[1]);
    var year = Number(parts[2]);
    if (year < 1900 || month < 1 || month > 12 || day < 1) return '';
    var stamped = new Date(Date.UTC(year, month - 1, day));
    if (stamped.getUTCFullYear() !== year || stamped.getUTCMonth() !== month - 1 || stamped.getUTCDate() !== day) return '';
    var now = new Date();
    var today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    if (Date.UTC(year, month - 1, day) > today) return '';
    return parts[0] + '-' + parts[1] + '-' + parts[2];
  }

  function lineWindow(lines, index) {
    return [lines[index] || '', lines[index + 1] || '', lines[index + 2] || ''].join(' ');
  }

  function dateIn(text) {
    var named = String(text || '').match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
    var numeric = String(text || '').match(/(\d{1,2})[\/.\- ](\d{1,2})[\/.\- ](\d{4})/);
    var got = named ? validCardDob(named[1] + ' ' + named[2] + ' ' + named[3]) : '';
    if (!got && numeric) got = validCardDob(numeric[1] + '/' + numeric[2] + '/' + numeric[3]);
    return got;
  }

  function cardDob(text) {
    var lines = String(text || '').split(/\n/);
    var issues = [];
    var doubtful = '';
    function rememberIssue(line) {
      var found = dateIn(line);
      if (found && issues.indexOf(found) < 0) issues.push(found);
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/\b(?:issue|expiry)\b/i.test(line)) rememberIssue(line);
      if (/issue|expiry|blood/i.test(line) && !/\bdate\s+of\s+b[a-z]{2,4}\b|\bdob\b|\bborn\b/i.test(line)) continue;
      var cue = line.match(/\bdate\s+of\s+b[a-z]{2,4}\b|\bdob\b|\bborn\b/i);
      var dropped = !cue && /\bdate\s+of\s*(?:sex\b)?\s*$/i.test(line) && !/issue|expiry|blood/i.test(line);
      if (!cue && !dropped) continue;
      var after = cue ? line.slice(cue.index + cue[0].length) : '';
      var got = dateIn(after);
      if (got) return { value: got, unconfirmed: false, issues: issues };
      var next = lines[i + 1] || '';
      if (/issue|expiry|blood/i.test(next)) {
        rememberIssue(next);
        if (!dateIn(next)) continue;
        var later = lines[i + 2] || '';
        if (/\bdate\s+of\s+b[a-z]{2,4}\b|\bdob\b|\bborn\b/i.test(later)) continue;
        if (/issue|expiry|blood/i.test(later)) continue;
        if (!/^\s*\d{1,2}(?:[\/.\- ]\d{1,2}[\/.\- ]\d{4}|\s+[A-Za-z]{3,9}\s+\d{4})\s*$/.test(later)) continue;
        var candidate = dateIn(later);
        var issued = dateIn(next);
        if (candidate && issued && candidate !== issued) {
          var bornParts = candidate.split('-');
          var issueParts = issued.split('-');
          var bornOn = new Date(Number(bornParts[2]), Number(bornParts[1]) - 1, Number(bornParts[0]));
          var issuedOn = new Date(Number(issueParts[2]), Number(issueParts[1]) - 1, Number(issueParts[0]));
          if (new Date(bornOn.getFullYear() + 10, bornOn.getMonth(), bornOn.getDate()) <= issuedOn) doubtful = candidate;
        }
        continue;
      }
      got = dateIn(next);
      if (got) return { value: got, unconfirmed: false, issues: issues };
    }
    return { value: doubtful, unconfirmed: !!doubtful, issues: issues };
  }

  function sexMark(text) {
    var raw = String(text || '');
    if (/\bmale\b/i.test(raw) && /\bfemale\b/i.test(raw)) return '';
    if (/\bfemale\b/i.test(raw)) return 'F';
    if (/\bmale\b/i.test(raw)) return 'M';
    var lone = raw.match(/(?:^|[\s:])([MF])(?:\s|$)/);
    return lone ? lone[1].toUpperCase() : '';
  }

  function cardSex(text) {
    var lines = String(text || '').split(/\n/);
    for (var i = 0; i < lines.length; i++) {
      if (!/\bsex\b|\bgender\b/i.test(lines[i])) continue;
      var after = lines[i].replace(/^.*\b(?:sex|gender)\b[:\s-]*/i, '');
      var same = sexMark(after);
      if (same) return same;
      var next = String(lines[i + 1] || '').trim();
      if (/^(?:male|female|[mf])$/i.test(next)) return sexMark(next);
      if (dateIn(next) && !looksLikeName(next)) {
        var token = next.match(/\b(female|male|[mf])\b/i);
        if (token && !( /\bmale\b/i.test(next) && /\bfemale\b/i.test(next) )) return sexMark(token[1]);
      }
    }
    return '';
  }

  function tidyNationality(value) {
    var text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 40 || /\d/.test(text)) return '';
    if (/singapore\s+citizen/i.test(text) || /^citizen$/i.test(text)) return 'Singapore citizen';
    return text;
  }

  function looksLikeName(line) {
    return /^[A-Za-z][A-Za-z'’.\-]+(?:\s+[A-Za-z][A-Za-z'’.\-]+){1,5}$/.test(String(line || '').trim()) && !/citizen|national/i.test(line);
  }

  function looksLikeLabel(line) {
    return /\b(country of|date of|nationality|citizenship|race|sex|gender|name|address|nric|birth)\b/i.test(line);
  }

  function cardNationality(text) {
    var lines = String(text || '').split(/\n/);
    for (var i = 0; i < lines.length; i++) {
      if (!/\bnationality\b|\bcitizenship\b/i.test(lines[i])) continue;
      var same = lines[i].replace(/^.*(?:nationality|citizenship)\b[:\s-]*/i, '').trim();
      var nearby = [same, lines[i + 1] || ''];
      for (var n = 0; n < nearby.length; n++) {
        var candidate = nearby[n];
        if (!candidate) continue;
        if (n > 0 && (looksLikeLabel(candidate) || looksLikeName(candidate))) continue;
        if (/\bsingapore\s+citizen\b/i.test(candidate)) return 'Singapore citizen';
        var value = tidyNationality(candidate);
        if (value) return value;
      }
    }
    return '';
  }

  var COUNTRY_LABEL = {
    origin: 1, residence: 1, birth: 1, nationality: 1, citizenship: 1, citizen: 1,
    country: 1, place: 1, issue: 1, expiry: 1, sex: 1, gender: 1, name: 1, address: 1,
    race: 1, blood: 1, group: 1, date: 1, card: 1, identity: 1
  };

  function countryValue(line) {
    var cleaned = String(line || '').replace(/[^A-Za-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    var tokens = cleaned.split(' ').filter(function (word) { return word.length >= 3; });
    if (!tokens.length || tokens.length > 3) return '';
    if (tokens.every(function (word) { return COUNTRY_LABEL[word.toLowerCase()]; })) return '';
    var value = tokens.join(' ');
    return value.length <= 30 ? value : '';
  }

  function cardBirthCountry(text) {
    var lines = String(text || '').split(/\n/);
    var cue = /\b(?:country|place)\s+of(?:\s+(?:b[a-z]{2,4}))?\s*$|\b(?:country|place)\s+of\s+b[a-z]{2,4}\b/i;
    for (var i = 0; i < lines.length; i++) {
      if (!cue.test(lines[i]) || /issue|expiry|blood|residence/i.test(lines[i])) continue;
      var same = lines[i].replace(/^.*\b(?:country|place)\s+of(?:\s+b[a-z]{2,4})?\b[:\s-]*/i, '').trim();
      var choices = [same, lines[i + 1] || '', lines[i + 2] || '', lines[i + 3] || ''];
      for (var n = 0; n < choices.length; n++) {
        var value = countryValue(choices[n]);
        if (value) return value;
      }
    }
    return '';
  }

  function usedByName(phrase, phrases) {
    var text = String(phrase || '').replace(/\s+/g, ' ').trim().toUpperCase();
    if (!text) return false;
    return (phrases || []).some(function (item) {
      var other = String(item || '').replace(/\s+/g, ' ').trim().toUpperCase();
      return other && (other === text || other.indexOf(text) >= 0);
    });
  }

  function birthAfterIssue(birthText, issueText) {
    var birth = dateIn(birthText);
    var issue = dateIn(issueText);
    if (!birth || (issue && birth === issue)) return '';
    var bornParts = birth.split('-');
    var born = new Date(Number(bornParts[2]), Number(bornParts[1]) - 1, Number(bornParts[0]));
    var now = new Date();
    var limit = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());
    if (born > limit) return '';
    if (issue) {
      var issueParts = issue.split('-');
      var issued = new Date(Number(issueParts[2]), Number(issueParts[1]) - 1, Number(issueParts[0]));
      if (born >= issued) return '';
    }
    return birth;
  }

  function isIssueDateLine(line) {
    return /\b(?:issue|expiry)\b/i.test(line) || /^\d{1,2}(?:\s+[A-Za-z]{3,9}\s+\d{4}|[\/.\-]\d{1,2}[\/.\-]\d{4})$/.test(String(line || '').trim());
  }

  function unitFrom(line) {
    var raw = String(line || '');
    if (/#\s?\d{1,2}\s*[-\/.]\s*\d{1,2}\s*[-\/.]\s*\d{2,4}\b/.test(raw)) return '';
    var mark = raw.match(/#\s?(\d{1,3})\s*-\s*(\d{1,4})([A-Za-z]?)(?!\d)/);
    if (!mark) return '';
    var year = Number(mark[2]);
    var yearLike = mark[2].length === 4 && year >= 1800 && year <= 2199;
    var dateContext = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|date|issue|expiry|birth|dob|day|month)\b/i.test(raw);
    var bareYear = /^#\s?\d{1,2}\s*-\s*\d{4}[A-Za-z]?$/.test(raw.trim()) && Number(mark[1]) >= 1 && Number(mark[1]) <= 31;
    if (yearLike && (dateContext || bareYear)) return '';
    return mark[1] + '-' + mark[2] + (mark[3] || '').toUpperCase();
  }

  function yearLikeUnit(value) {
    var mark = String(value || '').match(/^(\d+)-(\d+)/);
    if (!mark || Number(mark[1]) > 31 || mark[2].length !== 4) return false;
    var year = Number(mark[2]);
    return year >= 1800 && year <= 2199;
  }

  function unlockUnit(line) {
    var unit = unitFrom(line);
    if (!unit || yearLikeUnit(unit)) return '';
    var mark = unit.match(/^(\d+)-(\d+)/);
    if (mark && mark[2].length === 4 && Number(mark[1]) <= 31) {
      var second = Number(mark[2]);
      if (second >= 1700 && second <= 2299) return '';
    }
    return unit;
  }

  function cardAddress(text, phrases) {
    var out = { blk: '', street: '', unit: '', postal: '', address: '', blkUnconfirmed: false, unitUnconfirmed: false };
    var lines = String(text || '').split(/\n/);
    function streetPhrase(line) {
      var raw = String(line || '').replace(/\s+/g, ' ').trim();
      if (!raw || isIssueDateLine(raw)) return '';
      var bare = raw.replace(/\s+#\s?\d{1,4}\s*-\s*\d{1,4}.*$/i, '').replace(/\bSINGAPORE\b.*$/i, '').replace(/\s+\S*\d+\s*-\s*\d*\S*.*$/, '').trim();
      var lead = bare.match(/^(\d{1,3}[A-Z]?)\s+(\S(?:.*\S)?)$/i);
      if (lead) bare = lead[2];
      var words = bare.replace(/[^A-Za-z\s]/g, ' ').split(/\s+/).filter(Boolean);
      if (!words.length || words[0].length < 2 || !placeAlias(words) || personalStreetSurname(words) || usedByName(bare, phrases)) return '';
      return bare;
    }
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].replace(/\s+/g, ' ').trim();
      var prefixed = t.match(/\bSINGAPORE\s+S?\s?(\d{6})\b/i);
      var whole = t.match(/^S\s?(\d{6})$/i);
      if (prefixed || whole) out.postal = (prefixed || whole)[1];
      var unitNo = unitFrom(t);
      if (unitNo) {
        if (out.unit && out.unit !== unitNo) out.blkUnconfirmed = true;
        else {
          out.unit = unitNo;
          if (yearLikeUnit(unitNo)) out.unitUnconfirmed = true;
        }
      }
      if (/\b(?:BLK|BLOCK)\.?\s*\d{5,}/i.test(t)) continue;
      var blk = t.match(/\b(?:BLK|BLOCK)\.?\s*(\d{1,4})([A-Z])?\s+(.+)$/i);
      if (blk) {
        var number = blk[1];
        out.blk = (number + (blk[2] || '')).toUpperCase();
        if (number.length === 4 && !blk[2]) out.blkUnconfirmed = true;
        var rest = blk[3].replace(/\s+#\s?\d{1,4}\s*-\s*\d{1,4}.*$/i, '').replace(/\s+\S*\d+\s*-\s*\d*\S*.*$/, '').replace(/\s+SINGAPORE\b.*$/i, '').trim();
        if (rest) {
          out.street = rest.toUpperCase();
          out.streetFromBlk = true;
        }
        continue;
      }
      var alone = t.match(/^(?:BLK|BLOCK)\.?\s*(\d{1,4})([A-Z])?$/i);
      if (alone) {
        var look = i + 1;
        while (look < lines.length && !String(lines[look]).replace(/\s+/g, ' ').trim()) look++;
        if (look >= lines.length) continue;
        var nextTrim = String(lines[look]).replace(/\s+/g, ' ').trim();
        if (isIssueDateLine(nextTrim) || /\b[STFGM]\d{7}[A-Z]\b/i.test(nextTrim) || /\bCAN\b/i.test(nextTrim)) continue;
        var follow = streetPhrase(nextTrim);
        var unitNext = /^#/.test(nextTrim) ? unlockUnit(nextTrim) : '';
        if (!follow && !unitNext) continue;
        var blockNo = (alone[1] + (alone[2] || '')).toUpperCase();
        var four = alone[1].length === 4 && !alone[2];
        if (out.blk && out.blk !== blockNo) {
          out.blkUnconfirmed = true;
          continue;
        }
        if (follow && out.street && out.street !== follow.toUpperCase()) {
          out.blk = blockNo;
          out.blkUnconfirmed = true;
          continue;
        }
        if (unitNext && out.unit && out.unit !== unitNext) {
          out.blkUnconfirmed = true;
          continue;
        }
        out.blk = blockNo;
        if (four) out.blkUnconfirmed = true;
        if (follow && !out.street) {
          out.street = follow.toUpperCase();
          out.streetFromBlk = true;
        }
        continue;
      }
      if (out.street) continue;
      var hasUnit = /#\s?\d{1,4}\s*-\s*\d{1,4}/.test(t);
      var bare = t.replace(/\s+#\s?\d{1,4}\s*-\s*\d{1,4}.*$/i, '').replace(/\bSINGAPORE\b.*$/i, '').replace(/\s+\S*\d+\s*-\s*\d*\S*.*$/, '').trim();
      if (!bare || /^\d{4,}\b/.test(bare)) continue;
      var lead = bare.match(/^(\d{1,3}[A-Z]?)\s+(\S(?:.*\S)?)$/i);
      if (!lead && !hasUnit) continue;
      var streetText = lead ? lead[2] : bare;
      var streetWords = streetText.replace(/[^A-Za-z\s]/g, ' ').split(/\s+/).filter(Boolean);
      if (!streetWords.length || streetWords[0].length < 2 || !placeAlias(streetWords) || personalStreetSurname(streetWords) || usedByName(streetText, phrases)) continue;
      if (streetWords.some(function (word) { return word.toUpperCase() === 'BLK' || word.toUpperCase() === 'BLOCK'; })) continue;
      if (lead && !out.blk) out.blk = lead[1].toUpperCase();
      out.street = streetText.toUpperCase();
    }
    if (out.blk && !out.blkUnconfirmed && out.street && out.postal) {
      out.address = [out.blk, out.street, out.unit ? '#' + out.unit : '', 'SINGAPORE ' + out.postal].filter(Boolean).join(' ');
    }
    return out;
  }

  function identityRead(text, words) {
    var raw = String(text || '');
    var printed = printedName(raw);
    var name = printed.full || nameFrom(raw);
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
    var born = cardDob(raw);
    var namePhrases = [];
    if (printed.labeled && printed.plain) namePhrases.push(printed.plain);
    if (printed.alias) namePhrases.push(printed.alias);
    var home = cardAddress(raw, namePhrases);
    var suggested = blockLetterSuggestion(home.blk, words);
    return {
      name: name,
      namePlain: printed.plain || plainOf(name),
      nameAlias: printed.alias || '',
      nameRepaired: printed.repaired || '',
      unbalanced: !!printed.unbalanced,
      unlabeled: !!printed.unlabeled,
      labeled: !!printed.labeled,
      nameTokens: printed.nameTokens || plainOf(name).split(' ').filter(Boolean).length,
      nameBelow: !!printed.nameBelow,
      nric: nric,
      nricValid: nricValid,
      nameConf: nameConf,
      nricConf: nricConf,
      nameUnconfirmed: !!(printed.unbalanced || (name && nameConf != null && nameConf < 55)),
      nricUnconfirmed: !!(nric && (!nricValid || (nricConf != null && nricConf < 55))),
      nameChecked: false,
      nricChecked: false,
      dob: born.value || '',
      dobUnconfirmed: !!born.unconfirmed,
      issueDates: born.issues || [],
      sex: cardSex(raw),
      nationality: cardNationality(raw),
      race: raceFrom(raw),
      birthCountry: cardBirthCountry(raw),
      blk: home.blk,
      street: home.street,
      streetFromBlk: !!home.streetFromBlk,
      unit: home.unit,
      unitUnconfirmed: !!home.unitUnconfirmed,
      postal: home.postal,
      address: home.address,
      blkUnconfirmed: !!home.blkUnconfirmed,
      blkSuggest: suggested.value,
      blkSuggestKind: suggested.kind,
      dobChecked: false,
      sexChecked: false,
      nationalityChecked: false,
      raceChecked: false,
      birthCountryChecked: false,
      addressChecked: false
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
