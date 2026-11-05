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

  function usableLabel(text) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (s.length < 2 || s.length > 60) return '';
    if (!latin(s)) return '';
    if (cjkCount(s) > (s.match(/[A-Za-z]/g) || []).length) return '';
    if (words(s).length > 6) return '';
    if (s.charAt(0) === '(' && s.length > 5) return '';
    if (/^(the|and|for|with|that|this|from|your|will|are|was|has|have|not|but|any|all|per|via)$/i.test(s)) return '';
    s = s.replace(/\.$/, '').trim();
    if (/^(page|form|union|membership application)$/i.test(s)) return '';
    return s.replace(/\s*\($/, '').trim();
  }

  function prepareTexts(items, height) {
    var out = [];
    (items || []).forEach(function (item) {
      var str = String(item.str || '').replace(/\s+/g, ' ').trim();
      if (!str) return;
      if (item.y < 88 || item.y > height - 68) return;
      if ((item.w || 0) > 300) return;
      var label = usableLabel(str);
      if (!label) return;
      out.push({
        x: item.x,
        y: item.y,
        w: item.w || 10,
        h: item.h || 8,
        str: label
      });
    });
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
        if (Math.abs(run.y - seg.y) > 2.4) continue;
        if (seg.x <= run.x + run.w + 14 && seg.x + seg.w >= run.x - 14) {
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
          if (Math.abs(a.y - b.y) > 2.4) continue;
          if (b.x <= a.x + a.w + 14 && a.x <= b.x + b.w + 14) {
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
        if (gap < -3 || gap > 16) return;
        if (Math.abs(text.y - (square.y + 1.5)) > 6) return;
        if (text.w > 150) return;
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

  function assignLabels(slots, texts, reserved) {
    var pairs = [];
    slots.forEach(function (slot, si) {
      texts.forEach(function (text, ti) {
        if (reserved.has(text)) return;
        var gap = slot.x - (text.x + text.w);
        var dy = text.y - slot.y;
        var overlap = text.x < slot.x + slot.w * 0.7 && text.x + text.w > slot.x - 8;
        if (gap >= -6 && gap <= 110 && Math.abs(dy) <= 9) {
          pairs.push({ si: si, ti: ti, score: Math.max(0, gap) * 0.25 + Math.abs(dy) });
        } else if (dy >= 8 && dy <= 34 && text.x >= slot.x - 16 && text.x <= slot.x + Math.min(slot.w * 0.5, 90)) {
          pairs.push({ si: si, ti: ti, score: 24 + dy + Math.abs(text.x - slot.x) * 0.2 });
        } else if (dy <= -2 && dy >= -16 && overlap && text.w < 150 && words(text.str).length < 6) {
          pairs.push({ si: si, ti: ti, score: 18 + Math.abs(dy) });
        }
      });
    });
    pairs.sort(function (a, b) { return a.score - b.score; });
    var slotUsed = {};
    var textUsed = {};
    pairs.forEach(function (pair) {
      if (slotUsed[pair.si] || textUsed[pair.ti]) return;
      slots[pair.si].label = texts[pair.ti].str;
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
        upper.h = (upper.y + upper.h) - lower.y;
        upper.y = lower.y;
        upper.lines = (upper.lines || 1) + 1;
        drop[j] = true;
      }
    }
    return list.filter(function (_, index) { return !drop[index]; });
  }

  function layout(page) {
    var width = page.width || 595;
    var height = page.height || 842;
    var texts = prepareTexts(page.texts, height);
    var squares = (page.squares || []).filter(function (square) {
      return square.w >= 5 && square.w <= 18 && square.h >= 5 && square.h <= 18
        && Math.abs(square.w - square.h) <= 5
        && square.y > 90 && square.y < height - 70;
    });
    var rawLines = (page.lines || []).filter(function (line) {
      return line.w >= 8 && line.y > 90 && line.y < height - 70 && !onSquareEdge(line, squares);
    });
    var runs = mergeRuns(rawLines).filter(function (run) {
      if (run.w < 26 || run.w >= width * 0.74) return false;
      var cover = 0;
      texts.forEach(function (text) {
        if (run.y < text.y - 3 || run.y > text.y + (text.h || 8) + 1) return;
        var overlap = Math.min(run.x + run.w, text.x + text.w) - Math.max(run.x, text.x);
        if (overlap > 0) cover += overlap;
      });
      return cover / run.w < 0.55;
    });
    runs = runs.reduce(function (all, run) { return all.concat(splitWideGaps(run)); }, []);

    var pairs = pairSquares(squares, texts);
    var optionSet = new Set(pairs.map(function (pair) { return pair.text; }));
    var slots = runs.map(function (run) {
      return { x: run.x, y: run.y + 1.4, w: run.w, h: 13, label: '', type: 'text', lines: 1 };
    });
    assignLabels(slots, texts, optionSet);
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
    var labeled = mergeStacks(slots);
    slots = labeled.filter(function (slot) {
      if (!slot.label) return false;
      if (slot.y > height * 0.9) return false;
      if (/^(job|contact details|address in singapore|personal particulars)$/i.test(slot.label)) return false;
      return true;
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
        group: '',
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
          push({
            label: pair.label,
            type: 'radio',
            options: options.slice(),
            group: title,
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

  function annotations(fields, values) {
    var byPage = {};
    (fields || []).forEach(function (field) {
      if (!field.rect || field.source === 'acro') return;
      var value = values && values[field.id] != null ? String(values[field.id]) : '';
      var check = field.type === 'radio' || field.type === 'checkbox';
      if (check && !chosen(field, value)) return;
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
      if (!byPage[page]) byPage[page] = [];
      var fontSize = check
        ? Math.max(8, Math.min(14, rect.height * 0.85))
        : Math.max(9, Math.min(13, (field.lineH || 12) * 0.85));
      byPage[page].push({
        id: uid(),
        type: 'text',
        x: x,
        y: y,
        w: w,
        h: h,
        text: check ? 'X' : value,
        fontSize: fontSize,
        color: '#1a1612'
      });
    });
    return byPage;
  }

  return { layout: layout, annotations: annotations, chosen: chosen };
});
