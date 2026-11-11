/* Find the blank spots on a flat form and turn them into editor text boxes.
   Coordinates are PDF-style: origin at the bottom left, y grows upward.
   Geometry comes from vector ops, underscore glyphs, or a raster pass. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FormSpots = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function slug(text) {
    var s = String(text || 'field').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    return (s || 'field').slice(0, 42);
  }

  function latin(text) {
    return /[A-Za-z]/.test(text || '');
  }

  function words(text) {
    return String(text || '').trim().split(/\s+/).filter(Boolean);
  }

  function cjkCount(text) {
    return (String(text).match(/[\u3400-\u9fff]/g) || []).length;
  }

  function identityLabel(text) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (/debit/i.test(s)) return '';
    if (/name as per/i.test(s) && /bank account/i.test(s)) return s.replace(/\s*\(.*$/, '').trim();
    if (/nric/i.test(s) && /passport|fin/i.test(s)) return s;
    return '';
  }

  function usableLabel(text) {
    var s = String(text || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
    if (s.length < 2 || s.length > 60) return '';
    if (!latin(s)) return '';
    if (cjkCount(s) > (s.match(/[A-Za-z]/g) || []).length) return '';
    if (words(s).length > 6) return '';
    if (s.charAt(0) === '(' && s.length > 5) return '';
    if (/^(the|and|for|with|that|this|from|your|will|are|was|has|have|not|but|any|all|per|via)$/i.test(s)) return '';
    /* "(Surname first)" and "(Underline surname)" are instructions. The
       words in front of them are still the label. */
    var bare = s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (/sumame|surname|underline|please underline/i.test(bare)) return '';
    if (/[\\|]/.test(s)) return '';
    var letters = s.replace(/[^A-Za-z]/g, '');
    if (letters.length >= 5) {
      var vowels = (letters.match(/[aeiou]/ig) || []).length;
      if (vowels / letters.length < 0.2) return '';
    }
    if ((s.match(/[^A-Za-z0-9\s:./#'()\-&,]/g) || []).length > 0) return '';
    s = s.replace(/\.$/, '').trim();
    if (/^(page|form|union)$/i.test(s)) return '';
    return s.replace(/\s*\($/, '').trim();
  }

  function prepareTexts(items, height) {
    var out = [];
    (items || []).forEach(function (item) {
      var str = String(item.str || '').replace(/\s+/g, ' ').trim();
      if (!str) return;
      if (item.y < 88 || item.y > height - 68) return;
      var identity = identityLabel(str);
      if ((item.w || 0) > 300 && !identity) return;
      var label = identity || usableLabel(str);
      if (!label) return;
      out.push({
        x: item.x,
        y: item.y,
        w: item.w || 10,
        h: item.h || 8,
        str: label
      });
    });
    for (var i = 0; i < out.length; i++) {
      for (var j = 0; j < out.length; j++) {
        if (i === j) continue;
        var gap = out[j].x - (out[i].x + out[i].w);
        if (gap < -1 || gap > 6) continue;
        if (Math.abs(out[i].y - out[j].y) > 3) continue;
        var joined = (out[i].str + ' ' + out[j].str).replace(/\s+/g, ' ').trim();
        if (!/^your name$/i.test(joined)) continue;
        out[i] = {
          x: out[i].x,
          y: out[i].y,
          w: out[j].x + out[j].w - out[i].x,
          h: Math.max(out[i].h, out[j].h),
          str: 'Your name'
        };
        out.splice(j, 1);
        if (j < i) i--;
        break;
      }
    }
    return out;
  }

  function onSquareEdge(line, squares) {
    for (var i = 0; i < squares.length; i++) {
      var s = squares[i];
      var horizontal = Math.abs(line.y - s.y) < 1.6 || Math.abs(line.y - (s.y + s.h)) < 1.6;
      var overlap = line.x < s.x + s.w + 1 && line.x + line.w > s.x - 1;
      if (horizontal && overlap && line.w < s.w + 6) return true;
    }
    return false;
  }

  function joinLimit(run, seg) {
    var cell = Math.min(seg.w, run.w / Math.max(run.n, 1));
    return cell < 36 ? 18 : 12;
  }

  function mergeRuns(lines) {
    var sorted = lines.slice().sort(function (a, b) {
      if (Math.abs(a.y - b.y) > 2) return b.y - a.y;
      return a.x - b.x;
    });
    var runs = [];
    sorted.forEach(function (seg) {
      var hit = null;
      for (var i = 0; i < runs.length; i++) {
        var run = runs[i];
        var limit = joinLimit(run, seg);
        var yLimit = Math.min(seg.w, run.w / Math.max(run.n, 1)) < 36 ? 6 : 2.8;
        if (Math.abs(run.y - seg.y) > yLimit) continue;
        if (seg.x <= run.x + run.w + limit && seg.x + seg.w >= run.x - limit) {
          var right = Math.max(run.x + run.w, seg.x + seg.w);
          run.x = Math.min(run.x, seg.x);
          run.w = right - run.x;
          run.y = (run.y * run.n + seg.y) / (run.n + 1);
          run.n += 1;
          hit = run;
          break;
        }
      }
      if (!hit) runs.push({ x: seg.x, y: seg.y, w: seg.w, n: 1 });
    });
    var changed = true;
    while (changed) {
      changed = false;
      for (var i = 0; i < runs.length; i++) {
        for (var j = i + 1; j < runs.length; j++) {
          var a = runs[i];
          var b = runs[j];
          var yLimit = Math.min(a.w / Math.max(a.n, 1), b.w / Math.max(b.n, 1)) < 36 ? 6 : 2.8;
          if (Math.abs(a.y - b.y) > yLimit) continue;
          var limit = joinLimit(a, b);
          if (b.x <= a.x + a.w + limit && a.x <= b.x + b.w + limit) {
            var right = Math.max(a.x + a.w, b.x + b.w);
            a.x = Math.min(a.x, b.x);
            a.w = right - a.x;
            a.y = (a.y * a.n + b.y * b.n) / (a.n + b.n);
            a.n += b.n;
            runs.splice(j, 1);
            changed = true;
            break;
          }
        }
        if (changed) break;
      }
    }
    return runs;
  }

  function splitWideGaps(run) {
    return [run];
  }

  function pairSquares(squares, texts) {
    var used = {};
    var pairs = [];
    squares.forEach(function (square) {
      var best = null;
      var bestGap = 18;
      texts.forEach(function (text, index) {
        if (used[index]) return;
        var gap = text.x - (square.x + square.w);
        if (gap < -6 || gap > 28) return;
        if (Math.abs(text.y - (square.y + square.h * 0.25)) > 12) return;
        if (text.w > 130) return;
        if (String(text.str || '').replace(/[^A-Za-z]/g, '').length < 3) return;
        if (gap < bestGap) {
          best = index;
          bestGap = gap;
        }
      });
      if (best == null) return;
      used[best] = true;
      pairs.push({ square: square, text: texts[best], label: texts[best].str });
    });
    return pairs;
  }

  function clusterRows(pairs) {
    var rows = [];
    pairs.slice().sort(function (a, b) { return b.square.y - a.square.y; }).forEach(function (pair) {
      var row = null;
      for (var i = 0; i < rows.length; i++) {
        if (Math.abs(rows[i].y - pair.square.y) < 8) { row = rows[i]; break; }
      }
      if (!row) {
        row = { y: pair.square.y, pairs: [] };
        rows.push(row);
      }
      row.pairs.push(pair);
    });
    rows.forEach(function (row) {
      row.pairs.sort(function (a, b) { return a.square.x - b.square.x; });
      row.x = row.pairs[0].square.x;
      row.right = row.pairs[row.pairs.length - 1].square.x;
    });
    var groups = [];
    rows.forEach(function (row) {
      var prev = groups[groups.length - 1];
      var prevRow = prev && prev.rows[prev.rows.length - 1];
      var close = prevRow && prevRow.y - row.y < 24 && prevRow.y - row.y > 4;
      var overlap = prevRow && Math.min(prevRow.right, row.right) - Math.max(prevRow.x, row.x) > -40;
      if (close && overlap) prev.rows.push(row);
      else groups.push({ rows: [row] });
    });
    return groups;
  }

  function groupTitle(group, texts, optionSet) {
    var first = group.rows[0];
    var left = first.x;
    var y = first.pairs[0].text.y;
    var best = '';
    var score = 1e9;
    texts.forEach(function (text) {
      if (optionSet.has(text)) return;
      if (text.w > 160) return;
      var dy = text.y - y;
      var sameRow = Math.abs(dy) < 8 && text.x + text.w <= left + 8 && left - text.x < 150;
      var above = dy > 6 && dy < 30 && text.x > left - 36 && text.x < left + 70;
      if (!sameRow && !above) return;
      var align = Math.abs(text.x - left);
      var next = align * 0.45 + Math.abs(dy) * 1.4;
      if (next < score) { score = next; best = text.str; }
    });
    return best || 'Choice';
  }

  function expandLabel(text, texts) {
    var label = text.str;
    var edge = text;
    for (var n = 0; n < 4; n++) {
      var prev = null;
      for (var i = 0; i < texts.length; i++) {
        var other = texts[i];
        if (other === edge) continue;
        var gap = edge.x - (other.x + other.w);
        if (gap < -2 || gap > 16) continue;
        if (Math.abs(other.y - edge.y) > 4) continue;
        if (!prev || other.x > prev.x) prev = other;
      }
      if (!prev) break;
      label = prev.str + ' ' + label;
      edge = prev;
    }
    return label.replace(/\s+/g, ' ').trim();
  }

  function assignLabels(slots, texts, reserved, width) {
    var pairs = [];
    slots.forEach(function (slot, si) {
      texts.forEach(function (text, ti) {
        if (reserved.has(text)) return;
        var gap = slot.x - (text.x + text.w);
        var dy = text.y - slot.y;
        var overlap = text.x < slot.x + slot.w * 0.7 && text.x + text.w > slot.x - 8;
        var hint = /surname|underline|please|passport|family/i.test(text.str) ? 30 : 0;
        var longer = Math.min(24, text.str.length) * 0.35;
        if (gap >= -6 && gap <= 110 && Math.abs(dy) <= 14) {
          pairs.push({ si: si, ti: ti, score: hint + Math.max(0, gap) * 0.25 + Math.abs(dy) - longer });
        } else if (dy >= 8 && dy <= 36 && text.x >= slot.x - 30 && text.x <= slot.x + Math.min(slot.w * 0.55, 110)) {
          pairs.push({ si: si, ti: ti, score: hint + 18 + dy + Math.abs(text.x - slot.x) * 0.15 - longer });
        } else if (slot.w < width * 0.72 && dy <= -2 && dy >= -16 && overlap && text.w < 150 && words(text.str).length < 6) {
          var floor = slots.some(function (other, index) {
            if (index === si) return false;
            var below = text.y - (other.lineY != null ? other.lineY : other.y);
            if (below < 8 || below > 42) return false;
            return text.x + 6 > other.x && text.x < other.x + other.w;
          });
          if (!floor) {
            var under = slots.some(function (other, index) {
              if (index === si) return false;
              var line = other.lineY != null ? other.lineY : other.y;
              var below = text.y - line;
              if (below < 6 || below > 22) return false;
              return Math.min(other.x + other.w, text.x + text.w) - Math.max(other.x, text.x) > 12;
            });
            if (!under) pairs.push({ si: si, ti: ti, score: 18 + Math.abs(dy) });
          }
        }
      });
    });
    pairs.sort(function (a, b) { return a.score - b.score; });
    var slotUsed = {};
    var textUsed = {};
    pairs.forEach(function (pair) {
      if (slotUsed[pair.si] || textUsed[pair.ti]) return;
      slots[pair.si].label = expandLabel(texts[pair.ti], texts);
      slotUsed[pair.si] = true;
      textUsed[pair.ti] = true;
    });
  }

  function mergeStacks(slots) {
    var list = slots.slice().sort(function (a, b) { return b.y - a.y; });
    var drop = {};
    for (var i = 0; i < list.length; i++) {
      if (drop[i] || !list[i].label) continue;
      for (var j = i + 1; j < list.length; j++) {
        if (drop[j]) continue;
        var upper = list[i];
        var lower = list[j];
        var dy = upper.y - lower.y;
        if (dy > 22) break;
        if (dy < 10) continue;
        if (lower.label && lower.label !== upper.label) continue;
        if (Math.abs(upper.x - lower.x) > 18) continue;
        if (Math.abs(upper.w - lower.w) > Math.max(upper.w, lower.w) * 0.25) continue;
        var overlap = Math.min(upper.x + upper.w, lower.x + lower.w) - Math.max(upper.x, lower.x);
        if (overlap / Math.min(upper.w, lower.w) < 0.75) continue;
        upper.lineY = lower.lineY != null ? lower.lineY : lower.y;
        upper.h = (upper.y + upper.h) - lower.y;
        upper.y = lower.y;
        upper.lines = (upper.lines || 1) + 1;
        drop[j] = true;
      }
    }
    return list.filter(function (_, index) { return !drop[index]; });
  }

  function columnEnd(x, width) {
    if (x < width * 0.47) return width * 0.485;
    return width * 0.975;
  }

  function widenSlot(slot, texts, width, slots) {
    var label = null;
    for (var i = 0; i < texts.length; i++) {
      if (texts[i].str === slot.label) { label = texts[i]; break; }
    }
    if (label && label.x < slot.x + slot.w * 0.45 && label.x + label.w > slot.x - 2 && Math.abs(label.y - slot.lineY) < 16) {
      var start = label.x + label.w + 3;
      if (start < slot.x + slot.w - 24) {
        slot.w = slot.x + slot.w - start;
        slot.x = start;
      }
    }
    var end = columnEnd(slot.x, width);
    texts.forEach(function (text) {
      if (text.str === slot.label) return;
      if (text.x < slot.x + 16) return;
      if (Math.abs(text.y - slot.lineY) > 14) return;
      if (text.x - 4 < end) end = text.x - 4;
    });
    (slots || []).forEach(function (other) {
      if (other === slot) return;
      var sameRow = Math.abs((other.lineY != null ? other.lineY : other.y) - slot.lineY) < 6;
      if (!sameRow || other.x <= slot.x + 8) return;
      if (other.x - 6 < end) end = other.x - 6;
    });
    if (end - slot.x > slot.w + 8) slot.w = end - slot.x;
    if (!(slot.lines > 1)) {
      slot.y = (slot.lineY != null ? slot.lineY : slot.y - 1) + 1;
      slot.h = 12;
    }
  }

  function keepSlot(slot, texts) {
    if (/important notice|please submit|^please\b|particulars of|details of|declaration by|i agree|i hereby|for official use|bank use only|for bank use|certificate of|this section/i.test(slot.label)) return false;
    if (!/\b(full\s*)?name\b|\bnric\b|\bfin\b|\baddress\b|\bpostal\b|\bpost\s*code\b|\bzip\b|\be-?mail\b|\bphone\b|\btel\b|\bhandset\b|\bcallback\b|\bmobile\b|\binbox\b|\bmailbox\b|\bpremises\b|\bdwelling\b|\bh\s*\/\s*p\b|\bdate\b|\bbirth\b|\bdob\b|\bsignature\b|\bmember\b|\bsex\b|\bmale\b|\bfemale\b|\brace\b|\bcontact\b|\bhospital\b|\badmit|\bdischarge|\bsalary\b|\bdesignation\b|\bdepartment\b|\boffice\b|\bapplicant\b|\bpassport\b|\bcompany\b|\bunion\b|\bcode\b|\bgender\b|\bmarital\b|\bemployer\b|\boccupation\b|\bnationality\b|\bbank\b|\baccount\b|\bsection\b|\bdepot\b|\bpolicy\b|\bofficer\b|\brelationship\b|\bplan\b|\bemail\b|\bstreet\b|\bunit\b|\bblk\b|\bhouse\b|\bjoined\b|\bservice\b|\bidentification\b|\bidentity\b|\b(off|res|pgr|hp)\s*no\b/i.test(slot.label)) return false;
    if (/^(job|contact details|your contact|address in singapore|personal particulars|residential status|marital status|highest education( level)?|ntuc|race|gender)$/i.test(slot.label)) return false;
    if (/fairprice|ntuc|understand|rebates|dividend|entrance fee|this section/i.test(slot.label)) return false;
    if (/^(contacts?)$/i.test(String(slot.label || '').trim())) return false;
    if (/^[a-z]/.test(slot.label)) return false;
    if (/^\(/.test(slot.label) && !/^\(hp\)$/i.test(slot.label)) return false;
    var onLine = 0;
    for (var n = 0; n < texts.length; n++) {
      var sitting = texts[n];
      if (sitting.str === slot.label) continue;
      if (Math.abs(sitting.y - slot.lineY) > 7) continue;
      var over = Math.min(slot.x + slot.w, sitting.x + sitting.w) - Math.max(slot.x, sitting.x);
      if (over > 6) onLine++;
    }
    if (onLine >= 2) return false;
    var inside = 0;
    for (var i = 0; i < texts.length; i++) {
      var text = texts[i];
      if (text.str === slot.label) continue;
      if (text.x < slot.x && text.x + text.w < slot.x + 24) continue;
      if (text.y < slot.y + 1 || text.y > slot.y + slot.h + 1) continue;
      var overlap = Math.min(slot.x + slot.w, text.x + text.w) - Math.max(slot.x, text.x);
      /* A word that only grazes the right edge is the next column. */
      if (overlap > 18) inside++;
    }
    return inside === 0;
  }

  function normLabel(label) {
    return String(label || '').replace(/[:\s]+$/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function personApi() {
    var api = (typeof globalThis !== 'undefined' && globalThis.FormPerson) || null;
    if (!api && typeof require === 'function') {
      try { api = require('./person.js'); } catch (err) { api = null; }
    }
    return api;
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

  function headingTitle(text, slots) {
    var line = String(text && text.str || '').replace(/\s+/g, ' ').trim();
    if (!line || words(line).length > 8 || line.length > 48) return null;
    var kind = sectionKind(line);
    if (typeof FormEvidence !== 'undefined' && FormEvidence.isSectionHeading) {
      kind = FormEvidence.isSectionHeading(line);
    }
    var bare = line.replace(/[:.\s]+$/g, '');
    if (!kind && /^(approved by|signature verified by|verified by|for bank use only|for official use(?: only)?|office use only)$/i.test(bare)) kind = 'reset';
    if (!kind) return null;
    var want = normLabel(line);
    if (slots.some(function (other) { return normLabel(other.label) === want; })) return null;
    return { kind: kind, line: line.replace(/[:.\s]+$/g, '').trim() };
  }

  /* The nearest section title above a blank wins. A form-part title such as
     Declaration or For bank use resets the person, even when it mentions the
     applicant. An applicant heading owns a blank only within 420pt. Another
     person's heading still owns a blank further down the same page. */
  function personHeading(slot, slots, texts, carried) {
    var y = slot.lineY != null ? slot.lineY : slot.y;
    var best = null;
    texts.forEach(function (text) {
      var title = headingTitle(text, slots);
      if (!title) return;
      var dy = text.y - y;
      if (dy < 8 || dy > 980) return;
      if (text.x > slot.x + 80) return;
      if (slot.x - text.x > 260) return;
      var dx = Math.abs(text.x - slot.x);
      if (!best || dy < best.dy || (dy === best.dy && dx < best.dx)) best = { kind: title.kind, line: title.line, dy: dy, dx: dx };
    });
    if (best) {
      if (best.kind === 'reset') return best.line;
      if (best.kind === 'applicant' && best.dy > 420) return '';
      return best.line;
    }
    if (carried && personOf(carried) === 'other') return carried;
    return '';
  }

  function lastPersonHeading(texts, slots, carried) {
    var best = null;
    texts.forEach(function (text) {
      var title = headingTitle(text, slots);
      if (!title) return;
      if (!best || text.y < best.y) best = { kind: title.kind, line: title.line, y: text.y };
    });
    if (!best) return carried && personOf(carried) === 'other' ? carried : '';
    if (best.kind === 'other') return best.line;
    return '';
  }

  function dedupeSlots(slots, texts) {
    var drop = {};
    function lineY(slot) { return slot.lineY != null ? slot.lineY : slot.y; }
    function labelDelta(slot) {
      var want = normLabel(slot.label);
      var best = null;
      var bestAbs = 1e9;
      texts.forEach(function (text) {
        var got = normLabel(text.str);
        if (!(got === want || got.indexOf(want) === 0 || want.indexOf(got) === 0)) return;
        var delta = text.y - lineY(slot);
        if (Math.abs(delta) < bestAbs) { bestAbs = Math.abs(delta); best = delta; }
      });
      return best == null ? 1e9 : best;
    }
    for (var i = 0; i < slots.length; i++) {
      if (drop[i] || slots[i].type === 'radio') continue;
      for (var j = i + 1; j < slots.length; j++) {
        if (drop[j] || slots[j].type === 'radio') continue;
        var a = slots[i];
        var b = slots[j];
        var same = normLabel(a.label) && normLabel(a.label) === normLabel(b.label);
        var dy = Math.abs(lineY(a) - lineY(b));
        var overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        var overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        var smaller = Math.min(a.w * Math.max(a.h, 1), b.w * Math.max(b.h, 1));
        var inter = Math.max(0, overlapW) * Math.max(0, overlapH);
        var stacked = same && dy < 42 && overlapW > 6;
        var piled = inter > smaller * 0.45 && dy < 18;
        if (!stacked && !piled) continue;
        var lose = j;
        if (same) {
          var da = labelDelta(a);
          var db = labelDelta(b);
          var ceilingA = da < -2 && da > -20;
          var ceilingB = db < -2 && db > -20;
          var floorA = da > 4 && da <= 42;
          var floorB = db > 4 && db <= 42;
          if (ceilingA && floorB) lose = i;
          else if (ceilingB && floorA) lose = j;
          else lose = Math.abs(da) <= Math.abs(db) ? j : i;
        } else lose = (a.w * a.h) >= (b.w * b.h) ? j : i;
        drop[lose] = true;
      }
    }
    return slots.filter(function (_, index) { return !drop[index]; });
  }

  function moveCaptionToFloor(slots, texts) {
    slots.forEach(function (slot) {
      var y = slot.lineY != null ? slot.lineY : slot.y;
      var cap = null;
      texts.forEach(function (text) {
        var got = normLabel(text.str);
        var want = normLabel(slot.label);
        if (!(got === want || got.indexOf(want) === 0 || want.indexOf(got) === 0)) return;
        var delta = text.y - y;
        if (delta < -2 && delta > -20) cap = text;
      });
      if (!cap) return;
      var floor = null;
      slots.forEach(function (other) {
        if (other === slot || other.label) return;
        var below = cap.y - (other.lineY != null ? other.lineY : other.y);
        if (below < 8 || below > 42) return;
        if (cap.x < other.x - 4 || cap.x > other.x + other.w) return;
        floor = other;
      });
      if (!floor) return;
      floor.label = slot.label;
      slot.drop = true;
    });
    return slots.filter(function (slot) { return !slot.drop && slot.label; });
  }

  function splitOnCaptions(runs, texts) {
    var cue = /name|nric|fin|date|birth|address|e-?mail|phone|age|occupation|sex|gender|postal|post\s*code|\bzip\b|race|contact/i;
    var out = [];
    runs.forEach(function (run) {
      var caps = texts.filter(function (text) {
        var dy = text.y - run.y;
        if (dy < 6 || dy > 40) return false;
        if (text.x < run.x + 24 || text.x > run.x + run.w - 24) return false;
        return cue.test(text.str);
      }).sort(function (a, b) { return a.x - b.x; });
      if (!caps.length) { out.push(run); return; }
      var cursor = run.x;
      caps.forEach(function (cap) {
        if (cap.x - cursor >= 26) out.push({ x: cursor, y: run.y, w: cap.x - cursor, n: 1 });
        cursor = cap.x;
      });
      if (run.x + run.w - cursor >= 26) out.push({ x: cursor, y: run.y, w: run.x + run.w - cursor, n: 1 });
    });
    return out;
  }

  /* A row of equal boxes under a date is a comb. Each character belongs in one box. */
  function dateComb(slot, squares) {
    if (!/birth|\bdob\b/i.test(slot.label || '')) return null;
    var y = slot.lineY != null ? slot.lineY : slot.y;
    var row = (squares || []).filter(function (sq) {
      if (!(sq.w >= 8 && sq.w <= 16 && sq.h >= 8 && sq.h <= 16)) return false;
      return y >= sq.y - 8 && y <= sq.y + sq.h + 10;
    }).sort(function (a, b) { return a.x - b.x; });
    var run = [];
    var best = [];
    row.forEach(function (sq) {
      var prev = run[run.length - 1];
      if (prev && sq.x - (prev.x + prev.w) > 28) {
        if (run.length > best.length) best = run;
        run = [];
      }
      run.push(sq);
    });
    if (run.length > best.length) best = run;
    return best.length >= 6 ? best : null;
  }

  function layout(page) {
    var width = page.width || 595;
    var height = page.height || 842;
    var texts = prepareTexts(page.texts, height);
    var coverTexts = (page.texts || []).filter(function (text) {
      return text && text.str && text.w > 6;
    });
    var squares = (page.squares || []).filter(function (square) {
      return square.w >= 5 && square.w <= 18 && square.h >= 5 && square.h <= 18
        && Math.abs(square.w - square.h) <= 5
        && square.y > 90 && square.y < height - 95;
    }).filter(function (square, index, all) {
      for (var j = 0; j < index; j++) {
        var other = all[j];
        var overlapW = Math.min(square.x + square.w, other.x + other.w) - Math.max(square.x, other.x);
        var overlapH = Math.min(square.y + square.h, other.y + other.h) - Math.max(square.y, other.y);
        if (overlapW > square.w * 0.45 && overlapH > square.h * 0.45) return false;
      }
      return true;
    });
    var rawLines = (page.lines || []).filter(function (line) {
      return line.w >= 8 && line.y > 90 && line.y < height - 70 && !onSquareEdge(line, squares);
    });
    var runs = mergeRuns(rawLines).filter(function (run) {
      if (run.w < 26 || run.w >= width * 0.93) return false;
      var cover = 0;
      coverTexts.forEach(function (text) {
        var str = String(text.str || '');
        if (str.length < 28) return;
        if (/please|surname|underline|sumame/i.test(str)) return;
        if (run.y < text.y - 3 || run.y > text.y + (text.h || 8) + 1) return;
        var overlap = Math.min(run.x + run.w, text.x + text.w) - Math.max(run.x, text.x);
        if (overlap > 0) cover += overlap;
      });
      return cover / run.w < 0.55;
    });
    runs = runs.reduce(function (all, run) { return all.concat(splitWideGaps(run)); }, []);
    runs = splitOnCaptions(runs, texts);

    var pairs = pairSquares(squares, texts);
    var optionSet = new Set(pairs.map(function (pair) { return pair.text; }));
    var slots = runs.map(function (run) {
      return { x: run.x, y: run.y + 1, w: run.w, h: 12, label: '', type: 'text', lines: 1, lineY: run.y };
    });
    assignLabels(slots, texts, optionSet, width);
    slots.forEach(function (slot) {
      if (slot.label) return;
      var best = null;
      var bestGap = 24;
      pairs.forEach(function (pair) {
        var gap = slot.x - (pair.text.x + pair.text.w);
        if (gap < -4 || gap > bestGap) return;
        if (Math.abs(pair.text.y - slot.y) > 10) return;
        best = pair;
        bestGap = gap;
      });
      if (best) slot.label = best.label;
    });
    slots = mergeStacks(slots);
    slots = moveCaptionToFloor(slots, texts);
    slots = slots.filter(function (slot) { return !!slot.label; });
    slots.forEach(function (slot) { widenSlot(slot, texts, width, slots); });
    slots = slots.filter(function (slot) { return keepSlot(slot, texts); });
    texts.forEach(function (text) {
      var bare = String(text.str || '').replace(/[:\s]+$/, '');
      if (words(bare).length > 6 || bare.length > 42) return;
      if (!/:\s*$/.test(text.str) && !/^(name|nric(\s*no\.?)?|address|e-?mail|email|date of birth|contact(\s+no\.?)?)\b/i.test(bare)) return;
      var already = slots.some(function (slot) {
        var same = String(slot.label || '').replace(/[:\s]+$/, '').toLowerCase() === bare.toLowerCase();
        var dy = Math.abs((slot.lineY != null ? slot.lineY : slot.y) - text.y);
        return same && dy < 28;
      });
      if (already) return;
      var start = text.x + text.w + 4;
      var end = columnEnd(start, width);
      texts.forEach(function (other) {
        if (other === text) return;
        if (Math.abs(other.y - text.y) > 6) return;
        if (other.x >= start - 2 && other.x < end) end = other.x - 4;
      });
      if (end - start < 36) return;
      var made = {
        x: start,
        y: text.y + 1,
        w: end - start,
        h: 12,
        label: bare,
        type: 'text',
        lines: 1,
        lineY: text.y
      };
      if (keepSlot(made, texts)) slots.push(made);
    });
    slots = dedupeSlots(slots, texts);
    slots.forEach(function (slot) {
      var y = slot.lineY != null ? slot.lineY : slot.y;
      var nearest = null;
      var nearestDy = 80;
      slots.forEach(function (other) {
        if (other === slot || !/\bname\b/i.test(other.label || '')) return;
        var dy = (other.lineY != null ? other.lineY : other.y) - y;
        if (dy < 8 || dy > 78 || dy >= nearestDy) return;
        nearest = other;
        nearestDy = dy;
      });
      if (!slot.group && nearest && /dependant|dependent|spouse|\bchild\b|officer|nominee|referee|beneficiary|mother|father|parent|guardian|payee|witness|introducer|\bkin\b|\bagent\b/i.test(nearest.label)) slot.group = nearest.label;
      slots.forEach(function (other) {
        if (other === slot || slot.group) return;
        if (Math.abs((other.lineY != null ? other.lineY : other.y) - y) > 8) return;
        if (/dependant|dependent|spouse|\bchild\b|officer|nominee|referee|beneficiary|mother|father|parent|guardian|payee|witness|introducer|\bkin\b|\bagent\b/i.test(other.label)) slot.group = other.label;
      });
      var heading = personHeading(slot, slots, texts, page.carriedPerson || '');
      if (heading) {
        slot.section = heading;
        if (!slot.group) slot.group = heading;
      }
      var cells = dateComb(slot, squares);
      if (cells) {
        slot.comb = true;
        slot.cells = cells;
        var left = cells[0].x;
        var right = cells[cells.length - 1].x + cells[cells.length - 1].w;
        var top = cells[0].y + cells[0].h;
        var bottom = cells[0].y;
        cells.forEach(function (cell) {
          if (cell.y < bottom) bottom = cell.y;
          if (cell.y + cell.h > top) top = cell.y + cell.h;
        });
        slot.x = left;
        slot.y = bottom;
        slot.w = right - left;
        slot.h = top - bottom;
      }
      var own = normLabel(slot.label);
      var nearLabel = texts.some(function (text) {
        var textName = normLabel(text.str);
        if (!(textName === own || own.indexOf(textName) === 0 || textName.indexOf(own) === 0)) return false;
        var dy = Math.abs(text.y - y);
        var beside = text.x + text.w <= slot.x + 30 && slot.x - (text.x + text.w) < 140;
        var over = text.x < slot.x + slot.w && text.x + text.w > slot.x - 8;
        return dy <= 36 && (beside || over);
      });
      if (!nearLabel) slot.untrusted = true;
    });

    var fields = [];
    var seen = {};
    function push(field) {
      var id = slug(field.group ? field.group + ' ' + field.label : field.label);
      if (seen[id]) id = id + '_' + fields.length;
      seen[id] = true;
      field.id = id;
      field.page = page.page || 0;
      field.source = 'flat';
      field.pageWidth = width;
      field.pageHeight = height;
      fields.push(field);
    }

    slots.forEach(function (slot) {
      push({
        label: slot.label,
        type: 'text',
        options: [],
        group: slot.group || '',
        section: slot.section || '',
        untrusted: !!slot.untrusted,
        comb: !!slot.comb,
        cells: slot.cells || null,
        texts: texts,
        pageTexts: page.texts || [],
        rect: { x: slot.x, y: slot.y, width: slot.w, height: Math.max(12, slot.h) },
        lineH: 12
      });
    });

    clusterRows(pairs).forEach(function (group) {
      var title = groupTitle(group, texts, optionSet);
      var options = [];
      group.rows.forEach(function (row) {
        row.pairs.forEach(function (pair) { options.push(pair.label); });
      });
      group.rows.forEach(function (row) {
        row.pairs.forEach(function (pair) {
          var square = pair.square;
          var around = '';
          slots.forEach(function (slot) {
            if (Math.abs((slot.lineY != null ? slot.lineY : slot.y) - square.y) > 22) return;
            if (/dependant|dependent|spouse|\bchild\b|officer/i.test(slot.label)) around = slot.label;
          });
          push({
            label: pair.label,
            type: 'radio',
            options: options.slice(),
            group: around ? around + ' ' + title : title,
            rect: { x: square.x, y: square.y, width: square.w, height: square.h },
            lineH: square.h
          });
        });
      });
    });

    fields.sort(function (a, b) {
      if (a.rect.y !== b.rect.y) return b.rect.y - a.rect.y;
      return a.rect.x - b.rect.x;
    });
    page.lastPerson = lastPersonHeading(texts, slots, page.carriedPerson || '');
    return fields;
  }

  function chosen(field, value) {
    var raw = String(value || '').trim();
    if (!raw) return false;
    if (field.type === 'checkbox') return /^(yes|true|x|on|checked)$/i.test(raw);
    return raw.toLowerCase() === String(field.label || '').toLowerCase();
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function evidenceApi() {
    if (typeof globalThis !== 'undefined' && globalThis.FormEvidence) return globalThis.FormEvidence;
    if (typeof require === 'function') {
      try { return require('./evidence.js'); } catch (err) { return null; }
    }
    return null;
  }

  function annotations(fields, values) {
    var byPage = {};
    var unplaced = [];
    var evidence = evidenceApi();
    (fields || []).forEach(function (field) {
      var value = values && values[field.id] != null ? String(values[field.id]) : '';
      var check = field.type === 'radio' || field.type === 'checkbox';
      if (check && !chosen(field, value)) return;
      if (!check && !value.trim()) return;
      var refusal = evidence && evidence.unsafeDestination ? evidence.unsafeDestination(field) : '';
      if (refusal) {
        unplaced.push({ id: field.id, label: field.label || field.id, reason: refusal });
        return;
      }
      if (!field.rect || field.source === 'acro') {
        if (!check) unplaced.push({ id: field.id, label: field.label || field.id, reason: field.source === 'acro' ? 'not a drawn line' : 'no box' });
        return;
      }
      if (field.cells && field.cells.length) {
        var chars = value.replace(/[^0-9A-Za-z]/g, '').split('');
        var page = field.page || 0;
        var pw = field.pageWidth || 595;
        var ph = field.pageHeight || 842;
        if (!byPage[page]) byPage[page] = [];
        field.cells.forEach(function (cell, index) {
          var glyph = chars[index];
          if (!glyph) return;
          var size = Math.max(7, Math.min(11, cell.h * 0.72));
          var glyphW = size * 0.56;
          var cx = cell.x + Math.max(0, (cell.w - glyphW) / 2);
          var cy = cell.y + Math.max(0, (cell.h - size) / 2);
          byPage[page].push({
            id: uid(),
            type: 'text',
            x: cx / pw,
            y: 1 - (cy + size) / ph,
            w: Math.max(0.008, glyphW / pw),
            h: Math.max(0.008, size / ph),
            text: glyph,
            fontSize: size,
            lockBox: true,
            color: '#1a1612',
            factKey: field.factKey || '',
            profileId: field.profileId || '',
            seedText: glyph
          });
        });
        return;
      }
      var rect = field.rect;
      var pw = field.pageWidth || 595;
      var ph = field.pageHeight || 842;
      var x = rect.x / pw;
      var y = 1 - (rect.y + rect.height) / ph;
      var w = rect.width / pw;
      var h = rect.height / ph;
      if (x < 0) { w += x; x = 0; }
      if (y < 0) { h += y; y = 0; }
      w = Math.max(0.02, Math.min(w, 1 - x));
      h = Math.max(check ? 0.008 : 0.014, Math.min(h, 1 - y));
      var page = field.page || 0;
      var fontSize = check
        ? Math.max(8, Math.min(14, rect.height * 0.85))
        : Math.max(9, Math.min(13, (field.lineH || 12) * 0.85));
      if (!check && evidence && (evidence.fitInBox || evidence.fittedSize)) {
        var fit = evidence.fitInBox
          ? evidence.fitInBox(value, rect.width, rect.height, fontSize)
          : evidence.fittedSize(value, rect.width, fontSize);
        fontSize = fit.size;
        if (!fit.fits) {
          unplaced.push({ id: field.id, label: field.label || field.id, reason: 'does not fit' });
          return;
        }
      }
      if (!byPage[page]) byPage[page] = [];
      byPage[page].push({
        id: uid(),
        type: 'text',
        x: x,
        y: y,
        w: w,
        h: h,
        text: check ? 'X' : value,
        fontSize: fontSize,
        lockBox: true,
        color: '#1a1612',
        factKey: check ? '' : (field.factKey || ''),
        profileId: check ? '' : (field.profileId || ''),
        seedText: check ? '' : value
      });
    });
    byPage.unplaced = unplaced;
    return byPage;
  }

  return { layout: layout, annotations: annotations, chosen: chosen };
});
