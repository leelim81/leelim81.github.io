/* Read AcroForm fields, or find blank lines on a flat page, then write values back. */
(function (global) {
  function copy(bytes) {
    return bytes instanceof Uint8Array ? bytes.slice(0) : new Uint8Array(bytes);
  }

  function pause() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  function say(progress, msg) {
    if (typeof progress === 'function') progress(msg);
  }

  function prettify(name) {
    var text = String(name || 'Field').replace(/[._[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return 'Field';
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function fieldType(field) {
    if (typeof field.setText === 'function' && typeof field.getText === 'function') return 'text';
    if (typeof field.check === 'function' && typeof field.isChecked === 'function') return 'checkbox';
    if (typeof field.getOptions === 'function' && typeof field.select === 'function') {
      try {
        var selected = field.getSelected();
        if (Array.isArray(selected)) return 'dropdown';
      } catch (err) {}
      return 'radio';
    }
    return 'other';
  }

  function readAcro(doc) {
    var form;
    try { form = doc.getForm(); } catch (err) { return []; }
    var fields = [];
    form.getFields().forEach(function (field) {
      var type = fieldType(field);
      if (type === 'other') return;
      var options = [];
      if (type === 'radio' || type === 'dropdown') {
        try { options = field.getOptions().map(String); } catch (err) { options = []; }
      }
      var rect = null;
      var pageIndex = 0;
      try {
        var widgets = field.acroField && field.acroField.getWidgets ? field.acroField.getWidgets() : [];
        if (widgets.length && widgets[0].getRectangle) rect = widgets[0].getRectangle();
        var pref = widgets.length && widgets[0].dict ? widgets[0].dict.get(PDFLib.PDFName.of('P')) : null;
        var pages = doc.getPages();
        for (var pi = 0; pi < pages.length; pi++) {
          if (pref && pages[pi].ref === pref) pageIndex = pi;
        }
      } catch (err) {}
      fields.push({
        id: field.getName(),
        label: prettify(field.getName()),
        type: type,
        options: options,
        source: 'acro',
        rect: rect,
        page: pageIndex
      });
    });
    return fields;
  }

  function pdfjs() {
    if (!global.pdfjsLib) throw new Error('pdf.js is not loaded');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf/pdf.worker.min.js', global.location.href).href;
    return pdfjsLib;
  }

  function multiply(m, t) {
    var a = t[0], b = t[1], c = t[2], d = t[3], e = t[4], f = t[5];
    return [
      m[0] * a + m[2] * b,
      m[1] * a + m[3] * b,
      m[0] * c + m[2] * d,
      m[1] * c + m[3] * d,
      m[0] * e + m[2] * f + m[4],
      m[1] * e + m[3] * f + m[5]
    ];
  }

  function mapPoint(m, x, y) {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }

  async function geometryFromPdf(bytes, progress) {
    var pdf = await pdfjs().getDocument({ data: copy(bytes) }).promise;
    var OPS = pdfjsLib.OPS;
    var pages = [];
    var limit = Math.min(pdf.numPages, 4);
    for (var p = 1; p <= limit; p++) {
      say(progress, 'Reading page ' + p + ' of ' + limit + '…');
      await pause();
      var page = await pdf.getPage(p);
      var view = page.getViewport({ scale: 1 });
      var content = await page.getTextContent();
      var texts = [];
      var lines = [];
      content.items.forEach(function (item) {
        if (!item.str || !String(item.str).trim()) return;
        var str = String(item.str).trim();
        var x = item.transform[4];
        var y = item.transform[5];
        var w = item.width || 0;
        var h = item.height || 8;
        var marks = str.match(/^(.*?)(_{3,})\s*$/);
        if (marks) {
          var label = marks[1].replace(/[:\s]+$/, '').trim();
          var frac = marks[2].length / Math.max(str.length, 1);
          var lw = Math.max(24, w * frac);
          lines.push({ x: x + Math.max(0, w - lw), y: y, w: lw });
          if (label) texts.push({ x: x, y: y, w: Math.max(8, w - lw), h: h, str: label });
          return;
        }
        if (/^_+$/.test(str) && w > 16) {
          lines.push({ x: x, y: y, w: w });
          return;
        }
        texts.push({ x: x, y: y, w: w, h: h, str: str });
      });
      var op = await page.getOperatorList();
      var ctm = [1, 0, 0, 1, 0, 0];
      var stack = [];
      var pending = null;
      var squares = [];
      function consume(path) {
        if (!path) return;
        var ops = path[0];
        var args = path[1];
        var i = 0;
        var pts = [];
        for (var k = 0; k < ops.length; k++) {
          var code = ops[k];
          if (code === OPS.moveTo || code === OPS.lineTo) {
            pts.push(mapPoint(ctm, args[i], args[i + 1]));
            i += 2;
          } else if (code === OPS.curveTo) {
            i += 6;
            pts.push(null);
          } else if (code === OPS.curveTo2 || code === OPS.curveTo3) {
            i += 4;
            pts.push(null);
          } else if (code === OPS.rectangle) {
            var rx = args[i], ry = args[i + 1], rw = args[i + 2], rh = args[i + 3];
            i += 4;
            var corners = [mapPoint(ctm, rx, ry), mapPoint(ctm, rx + rw, ry), mapPoint(ctm, rx, ry + rh), mapPoint(ctm, rx + rw, ry + rh)];
            var xs = corners.map(function (c) { return c[0]; });
            var ys = corners.map(function (c) { return c[1]; });
            var minX = Math.min.apply(null, xs);
            var maxX = Math.max.apply(null, xs);
            var minY = Math.min.apply(null, ys);
            var maxY = Math.max.apply(null, ys);
            squares.push({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
            lines.push({ x: minX, y: minY, w: maxX - minX });
            lines.push({ x: minX, y: maxY, w: maxX - minX });
          } else if (code === OPS.closePath) {
            pts.push(null);
          }
        }
        for (var n = 1; n < pts.length; n++) {
          if (!pts[n - 1] || !pts[n]) continue;
          var dx = Math.abs(pts[n][0] - pts[n - 1][0]);
          var dy = Math.abs(pts[n][1] - pts[n - 1][1]);
          if (dy < 1.6 && dx >= 8) {
            lines.push({
              x: Math.min(pts[n - 1][0], pts[n][0]),
              y: (pts[n - 1][1] + pts[n][1]) / 2,
              w: dx
            });
          }
        }
      }
      for (var step = 0; step < op.fnArray.length; step++) {
        if (step && step % 800 === 0) await pause();
        var fn = op.fnArray[step];
        var args = op.argsArray[step];
        if (fn === OPS.save) stack.push(ctm.slice());
        else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
        else if (fn === OPS.transform && args) ctm = multiply(ctm, args);
        else if (fn === OPS.constructPath) pending = args;
        else if (fn === OPS.stroke || fn === OPS.closeStroke || fn === OPS.fill || fn === OPS.eoFill || fn === OPS.fillStroke || fn === OPS.eoFillStroke) {
          consume(pending);
          pending = null;
        }
      }
      var images = 0;
      for (var imgStep = 0; imgStep < op.fnArray.length; imgStep++) {
        var imgFn = op.fnArray[imgStep];
        if (imgFn === OPS.paintImageXObject || imgFn === OPS.paintInlineImageXObject || imgFn === OPS.paintImageMaskXObject) images++;
      }
      var chars = 0;
      texts.forEach(function (text) { chars += String(text.str || '').replace(/\s/g, '').length; });
      pages.push({
        page: p - 1,
        width: view.width,
        height: view.height,
        texts: texts,
        lines: lines,
        squares: squares,
        glyphs: texts.length,
        images: images,
        chars: chars
      });
    }
    return pages;
  }

  function layoutPages(pages) {
    if (!global.FormSpots) return [];
    var fields = [];
    pages.forEach(function (page) {
      FormSpots.layout(page).forEach(function (field) { fields.push(field); });
    });
    return fields;
  }

  async function readFlat(bytes, progress) {
    var pages = await geometryFromPdf(bytes, progress);
    var glyphs = pages.reduce(function (sum, page) { return sum + (page.glyphs || 0); }, 0);
    var chars = pages.reduce(function (sum, page) { return sum + (page.chars || 0); }, 0);
    var images = pages.reduce(function (sum, page) { return sum + (page.images || 0); }, 0);
    var fields = layoutPages(pages);
    if (chars >= 40 || glyphs >= 12) return { fields: fields, route: 'text' };
    if (!images) return { fields: [], route: 'empty' };
    say(progress, 'Reading the scan…');
    var raster = await readRasterPdf(bytes, progress);
    return {
      fields: raster.fields,
      bytes: raster.sheet && raster.sheet.bytes,
      deskewDeg: raster.sheet && raster.sheet.deskewDeg,
      route: 'raster'
    };
  }

  function canvasFromBitmap(bmp, maxW) {
    var scale = bmp.width > maxW ? maxW / bmp.width : 1;
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async function inkMask(canvas) {
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var w = canvas.width;
    var h = canvas.height;
    var data = ctx.getImageData(0, 0, w, h).data;
    var luma = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) {
      if (y && y % 160 === 0) await pause();
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        var r = data[i], g = data[i + 1], b = data[i + 2];
        if (r > 160 && r > g + 50 && r > b + 50) {
          luma[y * w + x] = 255;
          continue;
        }
        luma[y * w + x] = 0.3 * r + 0.59 * g + 0.11 * b;
      }
    }
    var mask = new Uint8Array(w * h);
    var gap = 4;
    for (var y2 = gap; y2 < h - gap; y2++) {
      if (y2 % 160 === 0) await pause();
      for (var x2 = 0; x2 < w; x2++) {
        var c = luma[y2 * w + x2];
        var above = luma[(y2 - gap) * w + x2];
        var below = luma[(y2 + gap) * w + x2];
        if (c + 8 < above && c + 8 < below) mask[y2 * w + x2] = 1;
      }
    }
    return mask;
  }

  async function graySquares(canvas, w, h) {
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var data = ctx.getImageData(0, 0, w, h).data;
    function lumaAt(x, y) {
      var i = (y * w + x) * 4;
      return 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
    }
    var squares = [];
    var sizes = [14, 18, 22];
    var row = 0;
    for (var s = 0; s < sizes.length; s++) {
      var side = sizes[s];
      for (var y0 = 24; y0 + side < h - 16; y0 += 4) {
        if ((row++ % 48) === 0) await pause();
        for (var x0 = 8; x0 + side < w - 8; x0 += 4) {
          var inside = 0;
          var nIn = 0;
          var samples = [];
          var outside = 0;
          var nOut = 0;
          for (var yy = y0 + 3; yy < y0 + side - 3; yy += 2) {
            for (var xx = x0 + 3; xx < x0 + side - 3; xx += 2) {
              var sample = lumaAt(xx, yy);
              inside += sample;
              samples.push(sample);
              nIn++;
            }
          }
          for (var e = 0; e < side; e += 3) {
            if (y0 >= 6) { outside += lumaAt(x0 + e, y0 - 5); nOut++; }
            if (y0 + side + 5 < h) { outside += lumaAt(x0 + e, y0 + side + 5); nOut++; }
          }
          if (!nIn || !nOut) continue;
          var inn = inside / nIn;
          var out = outside / nOut;
          if (inn < 150 || inn > 236) continue;
          if (out - inn < 14 || out - inn > 55) continue;
          var variance = 0;
          for (var vi = 0; vi < samples.length; vi++) {
            var dv = samples[vi] - inn;
            variance += dv * dv;
          }
          if (Math.sqrt(variance / samples.length) > 10) continue;
          var dup = squares.some(function (sq) {
            return Math.abs(sq.x - x0) < 11 && Math.abs((h - sq.y - sq.h) - y0) < 11;
          });
          if (dup) continue;
          squares.push({ x: x0, y: h - (y0 + side), w: side, h: side });
          x0 += Math.floor(side / 2);
        }
      }
    }
    return squares;
  }

  async function rasterGeometry(canvas) {
    var w = canvas.width;
    var h = canvas.height;
    var mask = await inkMask(canvas);
    var runs = [];
    for (var y = 0; y < h; y++) {
      var start = -1;
      var dark = 0;
      for (var x = 0; x <= w; x++) {
        var on = x < w && mask[y * w + x];
        if (on && start < 0) { start = x; dark = 1; }
        else if (on) dark++;
        else if (start >= 0) {
          if (x - start >= 8 && dark / (x - start) > 0.6) runs.push({ x: start, y: y, w: x - start });
          start = -1;
        }
      }
    }
    var bands = [];
    runs.forEach(function (run) {
      var band = null;
      for (var i = bands.length - 1; i >= 0 && i > bands.length - 8; i--) {
        var item = bands[i];
        if (run.y > item.y1 + 2) continue;
        if (run.y < item.y0 - 1) continue;
        if (run.x < item.x + item.w + 8 && run.x + run.w > item.x - 8) { band = item; break; }
      }
      if (!band) bands.push({ x: run.x, w: run.w, y0: run.y, y1: run.y });
      else {
        var right = Math.max(band.x + band.w, run.x + run.w);
        band.x = Math.min(band.x, run.x);
        band.w = right - band.x;
        band.y0 = Math.min(band.y0, run.y);
        band.y1 = Math.max(band.y1, run.y);
      }
    });
    var lines = bands.filter(function (band) {
      return band.y1 - band.y0 <= 5 && band.w >= 12;
    }).map(function (band) {
      return { x: band.x, y: h - (band.y1 + 1), w: band.w };
    });
    lines = mergeCellRows(lines);
    return { lines: lines, squares: [], width: w, height: h };
  }

  /* Separate from rasterGeometry. Looks only for rules longer than 45% of the
     page, and may bridge eight white pixels inside those long rules. Boxed
     edges on the development sheets are shorter than that, so this does not
     change the ink mask the boxed path uses. */
  function underlineRules(canvas) {
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var w = canvas.width;
    var h = canvas.height;
    var data = ctx.getImageData(0, 0, w, h).data;
    function lum(x, y) {
      var i = (y * w + x) * 4;
      return 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
    }
    function rulePixel(x, y) {
      if (x < 0 || x >= w || y < 3 || y >= h - 3) return false;
      var c = lum(x, y);
      var above = lum(x, y - 3);
      var below = lum(x, y + 3);
      return c < 150 && above - c > 30 && below - c > 30;
    }
    var minW = w * 0.45;
    var found = [];
    for (var y = 3; y < h - 3; y++) {
      var start = -1;
      var last = -1;
      var dark = 0;
      for (var x = 0; x <= w; x++) {
        var on = x < w && rulePixel(x, y);
        if (!on && start >= 0 && x < w) {
          for (var g = 1; g <= 8 && x + g < w; g++) {
            if (rulePixel(x + g, y)) { on = true; break; }
          }
        }
        if (on) {
          if (start < 0) start = x;
          last = x;
          dark++;
        } else if (start >= 0) {
          var width = last - start + 1;
          if (width >= minW && dark / width > 0.25) found.push({ x: start, y: h - y, w: width });
          start = -1;
          last = -1;
          dark = 0;
        }
      }
    }
    return mergeCellRows(found).filter(function (line) { return line.w >= minW; });
  }

  /* Thin blank rules. A real underline on these scans is about 170px of dark
     ink with paper on both sides. Boxed edges on the intake sheets are thicker
     and do not pass. 80px is the stroke length, not a fraction of the page. */
  function strokeRules(canvas) {
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var w = canvas.width;
    var h = canvas.height;
    var data = ctx.getImageData(0, 0, w, h).data;
    function lum(x, y) {
      var i = (y * w + x) * 4;
      return 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
    }
    var found = [];
    for (var y = 4; y < h - 4; y++) {
      var start = -1;
      var last = -1;
      var dark = 0;
      for (var x = 0; x <= w; x++) {
        var on = false;
        if (x < w) {
          var c = lum(x, y);
          on = c < 160 && lum(x, y - 3) - c > 40 && lum(x, y + 3) - c > 40;
        }
        if (on) {
          if (start < 0) start = x;
          last = x;
          dark++;
        } else if (start >= 0) {
          var width = last - start + 1;
          if (width >= 80 && dark / width > 0.5) found.push({ x: start, y: h - y, w: width });
          start = -1;
          last = -1;
          dark = 0;
        }
      }
    }
    return mergeCellRows(found).filter(function (line) { return line.w >= 80; });
  }


  function mergeCellRows(lines) {
    var sorted = lines.slice().sort(function (a, b) {
      if (Math.abs(a.y - b.y) > 3) return b.y - a.y;
      return a.x - b.x;
    });
    var runs = [];
    sorted.forEach(function (seg) {
      var hit = null;
      for (var i = 0; i < runs.length; i++) {
        var run = runs[i];
        var cell = Math.min(seg.w, run.w / Math.max(run.n, 1));
        var limit = cell < 80 ? 32 : 8;
        if (Math.abs(run.y - seg.y) > 10) continue;
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
    return runs.map(function (run) { return { x: run.x, y: run.y, w: run.w }; });
  }

  function rotateCanvas(canvas, angle) {
    var rad = angle * Math.PI / 180;
    var sin = Math.abs(Math.sin(rad));
    var cos = Math.abs(Math.cos(rad));
    var out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(canvas.width * cos + canvas.height * sin));
    out.height = Math.max(1, Math.round(canvas.width * sin + canvas.height * cos));
    var ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return out;
  }

  async function wordsOn(canvas) {
    if (!global.FormExtract || !FormExtract.wordBoxes) return [];
    var words = await FormExtract.wordBoxes(canvas, 11);
    var h = canvas.height;
    return (words || []).map(function (word) {
      var box = word.bbox || {};
      var x0 = box.x0 || 0;
      var y0 = box.y0 || 0;
      var x1 = box.x1 || x0;
      var y1 = box.y1 || y0;
      return {
        x: x0,
        y: h - y1,
        w: Math.max(4, x1 - x0),
        h: Math.max(6, y1 - y0),
        str: word.text || ''
      };
    });
  }

  function shrinkCanvas(canvas, maxW) {
    if (canvas.width <= maxW) return canvas;
    var scale = maxW / canvas.width;
    var out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(canvas.width * scale));
    out.height = Math.max(1, Math.round(canvas.height * scale));
    out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height);
    return out;
  }

  async function stretchContrast(canvas) {
    var out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    var ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0);
    var image = ctx.getImageData(0, 0, out.width, out.height);
    var data = image.data;
    var samples = [];
    for (var i = 0; i < data.length; i += 16) {
      samples.push(0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]);
    }
    samples.sort(function (a, b) { return a - b; });
    var lo = samples[Math.floor(samples.length * 0.06)] || 0;
    var hi = samples[Math.floor(samples.length * 0.9)] || 255;
    if (hi - lo < 24) { lo = 0; hi = 255; }
    var span = hi - lo || 1;
    var stride = Math.max(4, canvas.width * 160 * 4);
    for (var p = 0; p < data.length; p += 4) {
      if (p && p % stride === 0) await pause();
      var luma = 0.3 * data[p] + 0.59 * data[p + 1] + 0.11 * data[p + 2];
      var stretched = Math.max(0, Math.min(255, (luma - lo) / span * 255));
      data[p] = data[p + 1] = data[p + 2] = stretched;
    }
    ctx.putImageData(image, 0, 0);
    return out;
  }

  async function horizontalScore(canvas) {
    var mask = await inkMask(await stretchContrast(canvas));
    var w = canvas.width;
    var h = canvas.height;
    var total = 0;
    for (var y = 0; y < h; y += 2) {
      var start = -1;
      for (var x = 0; x <= w; x++) {
        var on = x < w && mask[y * w + x];
        if (on && start < 0) start = x;
        else if (!on && start >= 0) {
          if (x - start > 28) total += x - start;
          start = -1;
        }
      }
    }
    return total;
  }

  async function longRuleScore(canvas) {
    var mask = await inkMask(canvas);
    var w = canvas.width;
    var h = canvas.height;
    var min = Math.max(80, w * 0.34);
    var total = 0;
    for (var y = 0; y < h; y++) {
      var start = -1;
      for (var x = 0; x <= w; x++) {
        var on = x < w && mask[y * w + x];
        if (on && start < 0) start = x;
        else if (!on && start >= 0) {
          if (x - start >= min) total += x - start;
          start = -1;
        }
      }
    }
    return total;
  }

  async function bestLineAngle(canvas) {
    var small = shrinkCanvas(canvas, 480);
    var uprightScore = await longRuleScore(small);
    async function scan(from, to, step) {
      var best = 0;
      var bestScore = uprightScore;
      for (var deg = from; deg <= to + 0.0001; deg += step) {
        await pause();
        var turned = Math.abs(deg) < 0.02 ? small : rotateCanvas(small, deg);
        var score = await longRuleScore(turned);
        if (score > bestScore) {
          bestScore = score;
          best = deg;
        }
      }
      return best;
    }
    var coarse = await scan(-6, 6, 0.5);
    if (!coarse) return 0;
    return scan(coarse - 0.4, coarse + 0.4, 0.1);
  }

  function cropToPage(canvas) {
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = image.data;
    var w = canvas.width;
    var h = canvas.height;
    function at(x, y) {
      var i = (y * w + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    }
    var corner = at(2, 2);
    var minX = w;
    var minY = h;
    var maxX = 0;
    var maxY = 0;
    var step = 3;
    for (var y = 0; y < h; y += step) {
      for (var x = 0; x < w; x += step) {
        var px = at(x, y);
        var dist = Math.abs(px[0] - corner[0]) + Math.abs(px[1] - corner[1]) + Math.abs(px[2] - corner[2]);
        if (dist < 28) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX <= minX || maxY <= minY) return canvas;
    var pad = 8;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad);
    maxY = Math.min(h - 1, maxY + pad);
    var cw = maxX - minX;
    var ch = maxY - minY;
    if (cw > w * 0.98 && ch > h * 0.98) return canvas;
    var out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    out.getContext('2d').drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
    return out;
  }

  async function uprightSheet(canvas) {
    var angle = await bestLineAngle(canvas);
    var turned = angle ? rotateCanvas(canvas, angle) : canvas;
    return cropToPage(turned);
  }

  function joinPhrases(items) {
    var list = items.slice().sort(function (a, b) {
      if (Math.abs(a.y - b.y) > 4) return b.y - a.y;
      return a.x - b.x;
    });
    var used = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (used[i]) continue;
      var cur = { x: list[i].x, y: list[i].y, w: list[i].w, h: list[i].h, str: String(list[i].str || '').trim() };
      used[i] = true;
      var grew = true;
      while (grew) {
        grew = false;
        for (var j = 0; j < list.length; j++) {
          if (used[j]) continue;
          var other = list[j];
          var gap = other.x - (cur.x + cur.w);
          if (gap < -2 || gap > Math.max(8, cur.h * 0.7)) continue;
          if (Math.abs(other.y - cur.y) > Math.max(4, cur.h * 0.45)) continue;
          var next = String(other.str || '').trim();
          if (!/[A-Za-z]/.test(next) || /^\(/.test(next)) continue;
          if (cur.str.split(/\s+/).length >= 4) continue;
          var right = Math.max(cur.x + cur.w, other.x + other.w);
          if (other.x < cur.x) cur.x = other.x;
          cur.w = right - cur.x;
          cur.h = Math.max(cur.h, other.h);
          cur.str = (cur.str + ' ' + String(other.str || '').trim()).replace(/\s+/g, ' ').trim();
          used[j] = true;
          grew = true;
        }
      }
      if (cur.str) out.push(cur);
    }
    return out;
  }

  function scalePage(geo, scale) {
    function n(v) { return v * scale; }
    return {
      page: 0,
      width: geo.width * scale,
      height: geo.height * scale,
      texts: geo.texts.map(function (text) {
        return { x: n(text.x), y: n(text.y), w: n(text.w), h: n(text.h), str: text.str };
      }),
      lines: geo.lines.map(function (line) {
        return { x: n(line.x), y: n(line.y), w: n(line.w) };
      }),
      squares: geo.squares.map(function (square) {
        return { x: n(square.x), y: n(square.y), w: n(square.w), h: n(square.h) };
      })
    };
  }

  async function fieldsOnSheet(canvas, progress) {
    say(progress, 'Reading the words on the form…');
    var source = canvas;
    var texts = joinPhrases(await wordsOn(source));
    await pause();
    say(progress, 'Finding the blank lines…');
    var geo = await rasterGeometry(await stretchContrast(source));
    geo.squares = await graySquares(source, source.width, source.height);
    geo.squares = geo.squares.filter(function (square) {
      var mid = square.y + square.h * 0.5;
      var onWord = texts.some(function (text) {
        var overlaps = text.x < square.x + square.w * 0.25 && text.x + text.w > square.x + square.w * 0.75;
        return overlaps && Math.abs(text.y - mid) < Math.max(8, text.h);
      });
      if (onWord) return false;
      var pitch = 1e9;
      geo.squares.forEach(function (other) {
        if (other === square || Math.abs(other.y - square.y) > 14) return;
        var gap = Math.abs(other.x - square.x);
        if (gap < pitch) pitch = gap;
      });
      if (pitch < square.w * 3.2) return false;
      return geo.squares.some(function (other) {
        if (other === square) return false;
        return Math.abs(other.y - square.y) < 16 && Math.abs(other.w - square.w) < 8
          && Math.abs(other.x - square.x) > square.w && Math.abs(other.x - square.x) < 260;
      });
    });
    var scale = 595 / source.width;
    if (!global.FormSpots) return [];
    var page = scalePage({
      width: source.width,
      height: source.height,
      texts: texts,
      lines: geo.lines,
      squares: geo.squares
    }, scale);
    var primary = FormSpots.layout(page);
    var rules = underlineRules(source).concat(strokeRules(source));
    if (!rules.length || !global.FormEvidence) return primary;
    rules.forEach(function (line) {
      var x = line.x * scale;
      var y = line.y * scale;
      var width = Math.max(40, line.w * scale);
      var occupied = primary.some(function (field) {
        var rect = field.rect || {};
        var overlap = Math.min((rect.x || 0) + (rect.width || 0), x + width) - Math.max(rect.x || 0, x);
        return Math.abs((rect.y || 0) - y) < 18 && overlap > Math.min(rect.width || 0, width) * 0.45;
      });
      if (occupied) return;
      var candidates = [];
      texts.forEach(function (text) {
        var dy = text.y - line.y;
        if (dy < 8 || dy > 80) return;
        if (text.x > line.x + line.w || text.x + text.w < line.x) return;
        candidates.push({ text: text, dy: dy });
      });
      if (!candidates.length) {
        texts.forEach(function (text) {
          var dy = Math.abs(text.y - line.y);
          var gap = line.x - (text.x + text.w);
          if (dy > 18 || gap < -8 || gap > 48) return;
          candidates.push({ text: text, dy: dy });
        });
      }
      var known = [];
      candidates.forEach(function (item) {
        var itemKind = FormEvidence.fieldKind({ label: item.text.str });
        if (!itemKind || itemKind === 'other') return;
        item.kind = itemKind;
        known.push(item);
      });
      if (!known.length) return;
      var best = known[0].text;
      var kind = known[0].kind;
      if (known.length > 1) {
        var sameKind = known.every(function (item) { return item.kind === kind; });
        var ys = known.map(function (item) { return item.text.y; });
        var spread = Math.max.apply(null, ys) - Math.min.apply(null, ys);
        if (!sameKind || spread > 18) return;
        known.sort(function (a, b) { return a.text.x - b.text.x; });
        best = { str: known.map(function (item) { return item.text.str; }).join(' ') };
        kind = FormEvidence.fieldKind({ label: best.str });
      }
      if (!kind || kind === 'other') return;
      var labelKey = String(best.str || '').toLowerCase().replace(/\s+/g, ' ').trim();
      var repeated = primary.some(function (field) {
        var rect = field.rect || {};
        var have = String(field.label || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (have !== labelKey) return false;
        var overlap = Math.min((rect.x || 0) + (rect.width || 0), x + width) - Math.max(rect.x || 0, x);
        return Math.abs((rect.y || 0) - y) < 32 && overlap > 20;
      });
      if (repeated) return;
      primary.push({
        id: 'rule-' + Math.round(line.x) + '-' + Math.round(line.y),
        label: best.str,
        type: 'text',
        options: [],
        group: '',
        untrusted: false,
        source: 'flat',
        page: 0,
        pageWidth: 595,
        pageHeight: source.height * scale,
        rect: { x: x, y: y, width: width, height: 16 },
        lineH: 12
      });
    });
    return primary;
  }

  async function readRasterPdf(bytes, progress) {
    var pdf = await pdfjs().getDocument({ data: copy(bytes) }).promise;
    var fields = [];
    var limit = Math.min(pdf.numPages, 2);
    var sheet = null;
    for (var p = 1; p <= limit; p++) {
      say(progress, 'Reading scan page ' + p + ' of ' + limit + '…');
      var page = await pdf.getPage(p);
      var view = page.getViewport({ scale: 2 });
      var canvas = document.createElement('canvas');
      canvas.width = Math.ceil(view.width);
      canvas.height = Math.ceil(view.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: view }).promise;
      var angle = await bestLineAngle(canvas);
      var turned = angle ? rotateCanvas(canvas, angle) : canvas;
      var found = await fieldsOnSheet(turned, progress);
      var pageW = 595;
      var pageH = turned.height * (pageW / turned.width);
      found.forEach(function (field) {
        field.page = p - 1;
        field.pageWidth = pageW;
        field.pageHeight = pageH;
        if (field.pageWidth > field.pageHeight * 1.2) field.untrusted = true;
        fields.push(field);
      });
      if (p === 1) {
        var blob = await new Promise(function (resolve) { turned.toBlob(resolve, 'image/jpeg', 0.92); });
        var jpeg = new Uint8Array(await blob.arrayBuffer());
        var doc = await PDFLib.PDFDocument.create();
        var image = await doc.embedJpg(jpeg);
        var sheetPage = doc.addPage([pageW, pageH]);
        sheetPage.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });
        sheet = {
          bytes: new Uint8Array(await doc.save()),
          deskewDeg: angle,
          pageWidth: pageW,
          pageHeight: pageH
        };
      }
    }
    return { fields: fields, sheet: sheet };
  }

  function opaqueLabel(label) {
    var text = String(label || '');
    if (/topmost|subform|readorder|page\d|f\d+_\d+|c\d+_\d+/i.test(text)) return true;
    var letters = text.replace(/[^A-Za-z]/g, '');
    return letters.length < 3;
  }

  async function labelAcro(bytes, fields) {
    var pdf = await pdfjs().getDocument({ data: copy(bytes) }).promise;
    var textsByPage = {};
    var limit = Math.min(pdf.numPages, 8);
    for (var p = 1; p <= limit; p++) {
      var page = await pdf.getPage(p);
      var content = await page.getTextContent();
      textsByPage[p - 1] = content.items.filter(function (item) {
        return item.str && String(item.str).trim() && (item.width || 0) < 560;
      }).map(function (item) {
        return {
          x: item.transform[4],
          y: item.transform[5],
          w: item.width || 8,
          h: item.height || 8,
          str: String(item.str).replace(/\s+/g, ' ').trim()
        };
      });
    }
    function clipLabel(str) {
      var cut = String(str || '').replace(/\s+/g, ' ').trim().split('.')[0];
      var parts = cut.split(/\s+/).filter(Boolean);
      if (/^\d+[a-z]?$/i.test(parts[0] || '')) parts = parts.slice(1);
      if (parts.length > 8) parts = parts.slice(0, 6);
      var s = parts.join(' ').replace(/[:,\s]+$/, '');
      if (s.length < 3 || s.length > 72) return '';
      if (!/^[A-Za-z]/.test(s)) return '';
      if (parts.length < 6 && /^(see|if|for|the|an|and|only)\b/i.test(s)) return '';
      return s;
    }
    fields.forEach(function (field) {
      if (!field.rect || !opaqueLabel(field.label)) return;
      var texts = textsByPage[field.page || 0] || [];
      var best = '';
      var bestScore = 1e9;
      texts.forEach(function (text) {
        var clipped = clipLabel(text.str);
        if (!clipped) return;
        var fieldish = /name|address|city|state|zip|tin|\bssn\b|ein|account|exempt|business|requester|street|postal|phone|email|social|security|spouse|taxpayer|birth|customer|form number/i.test(clipped);
        if (field.type === 'text' && !fieldish) return;
        var above = text.y - (field.rect.y + (field.rect.height || 10));
        var gap = field.rect.x - (text.x + text.w);
        var score = null;
        if (above >= -4 && above <= 28 && Math.abs(text.x - field.rect.x) < 80) score = above + Math.abs(text.x - field.rect.x) * 0.05;
        else if (gap >= -8 && gap <= 80 && Math.abs(text.y - field.rect.y) <= 10) score = 12 + gap * 0.2;
        if (score != null && score < bestScore) {
          bestScore = score;
          best = clipped;
        }
      });
      if (best) field.label = best;
    });
  }

  async function read(bytes, progress) {
    say(progress, 'Opening the PDF…');
    var doc = await PDFLib.PDFDocument.load(copy(bytes));
    var fields = readAcro(doc);
    if (fields.length) {
      try { await labelAcro(bytes, fields); } catch (err) {}
      return { kind: 'acro', route: 'acro', fields: fields };
    }
    say(progress, 'Finding the blank lines…');
    var flat = await readFlat(bytes, progress);
    if (flat && flat.fields) {
      return {
        kind: 'flat',
        route: flat.route || 'text',
        fields: flat.fields,
        bytes: flat.bytes || null,
        deskewDeg: flat.deskewDeg || 0
      };
    }
    return { kind: 'flat', route: flat && flat.route || 'empty', fields: [] };
  }

  async function readImage(bytes, mime, progress) {
    say(progress, 'Reading the photo…');
    var bmp = await createImageBitmap(new Blob([copy(bytes)], { type: mime || 'image/jpeg' }));
    say(progress, 'Straightening the photo…');
    var canvas = await uprightSheet(canvasFromBitmap(bmp, 1500));
    if (bmp.close) bmp.close();
    var fields = await fieldsOnSheet(canvas, progress);
    var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.9); });
    var jpeg = new Uint8Array(await blob.arrayBuffer());
    var doc = await PDFLib.PDFDocument.create();
    var image = await doc.embedJpg(jpeg);
    var pageW = 595;
    var pageH = canvas.height * (pageW / canvas.width);
    var page = doc.addPage([pageW, pageH]);
    page.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });
    return { kind: 'flat', fields: fields, bytes: new Uint8Array(await doc.save()) };
  }

  function truthy(value) {
    return /^(yes|true|1|on|checked|agree|agreed)$/i.test(String(value || '').trim());
  }

  function applyAcro(field, meta, value) {
    var empty = value == null || String(value).trim() === '';
    if (meta.type === 'text') {
      field.setText(empty ? '' : String(value));
      return;
    }
    if (meta.type === 'checkbox') {
      if (!empty && truthy(value)) field.check();
      else field.uncheck();
      return;
    }
    if (empty) return;
    var options = [];
    try { options = field.getOptions(); } catch (err) { options = []; }
    var want = String(value).trim().toLowerCase();
    var match = options.filter(function (option) {
      return String(option).trim().toLowerCase() === want;
    })[0];
    if (match != null) field.select(match);
  }

  async function fill(bytes, fields, values, opts) {
    var doc = await PDFLib.PDFDocument.load(copy(bytes));
    var font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    var byName = {};
    if (fields.some(function (field) { return field.source === 'acro'; })) {
      var form = doc.getForm();
      form.getFields().forEach(function (field) {
        byName[field.getName()] = field;
      });
      fields.forEach(function (meta) {
        if (meta.source !== 'acro' || !byName[meta.id]) return;
        applyAcro(byName[meta.id], meta, values[meta.id]);
      });
      form.updateFieldAppearances(font);
      if (opts && opts.flatten) form.flatten();
    }
    return new Uint8Array(await doc.save());
  }

  global.FormFields = { read: read, readImage: readImage, fill: fill };
})(window);
