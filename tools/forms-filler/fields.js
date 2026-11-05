/* Read AcroForm fields, or find blank lines on a flat page, then write values back. */
(function (global) {
  function copy(bytes) {
    return bytes instanceof Uint8Array ? bytes.slice(0) : new Uint8Array(bytes);
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
      fields.push({
        id: field.getName(),
        label: prettify(field.getName()),
        type: type,
        options: options,
        source: 'acro'
      });
    });
    return fields;
  }

  function pdfjs() {
    if (!global.pdfjsLib) throw new Error('pdf.js is not loaded');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
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

  async function geometryFromPdf(bytes) {
    var pdf = await pdfjs().getDocument({ data: copy(bytes) }).promise;
    var OPS = pdfjsLib.OPS;
    var pages = [];
    var limit = Math.min(pdf.numPages, 4);
    for (var p = 1; p <= limit; p++) {
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
      pages.push({ page: p - 1, width: view.width, height: view.height, texts: texts, lines: lines, squares: squares, glyphs: texts.length });
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

  async function readFlat(bytes) {
    var pages = await geometryFromPdf(bytes);
    var glyphs = pages.reduce(function (sum, page) { return sum + (page.glyphs || 0); }, 0);
    var fields = layoutPages(pages);
    if (fields.length >= 4 && glyphs >= 12) return fields;
    var raster = await readRasterPdf(bytes);
    return raster.length > fields.length ? raster : fields;
  }

  function canvasFromBitmap(bmp, maxW) {
    var scale = bmp.width > maxW ? maxW / bmp.width : 1;
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function inkMask(canvas) {
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    var mask = new Uint8Array(canvas.width * canvas.height);
    for (var i = 0, p = 0; i < data.length; i += 4, p++) {
      var r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 150 && r > g + 45 && r > b + 45) continue;
      var luma = 0.3 * r + 0.59 * g + 0.11 * b;
      if (luma < 205) mask[p] = 1;
    }
    return mask;
  }

  function rasterGeometry(canvas) {
    var w = canvas.width;
    var h = canvas.height;
    var mask = inkMask(canvas);
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
      return band.y1 - band.y0 <= 6 && band.w >= 36;
    }).map(function (band) {
      return { x: band.x, y: h - (band.y1 + 1), w: band.w };
    });
    var squares = [];
    var sizes = [14, 18, 22];
    for (var s = 0; s < sizes.length; s++) {
      var side = sizes[s];
      for (var yy = 40; yy < h - side - 20; yy += 3) {
        for (var xx = 8; xx < w - side - 8; xx += 3) {
          var border = 0;
          var samples = 0;
          for (var i = 0; i < side; i += 2) {
            border += mask[yy * w + (xx + i)] + mask[(yy + side - 1) * w + (xx + i)];
            border += mask[(yy + i) * w + xx] + mask[(yy + i) * w + (xx + side - 1)];
            samples += 4;
          }
          var cx = xx + (side >> 1);
          var cy = yy + (side >> 1);
          if (border / samples < 0.7) continue;
          var centerDark = 0;
          var centerN = 0;
          var inset = Math.max(3, side / 4);
          for (var cy2 = yy + inset; cy2 < yy + side - inset; cy2++) {
            for (var cx2 = xx + inset; cx2 < xx + side - inset; cx2++) {
              centerDark += mask[cy2 * w + cx2];
              centerN++;
            }
          }
          if (!centerN || centerDark / centerN > 0.12) continue;
          var dup = squares.some(function (sq) {
            return Math.abs(sq.x - xx) < 10 && Math.abs((h - sq.y - sq.h) - yy) < 10;
          });
          if (dup) continue;
          squares.push({ x: xx, y: h - (yy + side), w: side, h: side });
          xx += side;
        }
      }
    }
    return { lines: lines, squares: squares, width: w, height: h };
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

  function unrotatePoint(x, y, angle, srcW, srcH, dstW, dstH) {
    var rad = -angle * Math.PI / 180;
    var cos = Math.cos(rad);
    var sin = Math.sin(rad);
    var dx = x - dstW / 2;
    var dy = y - dstH / 2;
    return [dx * cos - dy * sin + srcW / 2, dx * sin + dy * cos + srcH / 2];
  }

  function mapRect(rect, angle, srcW, srcH, dstW, dstH) {
    if (!angle) return rect;
    var corners = [
      unrotatePoint(rect.x, rect.y, angle, srcW, srcH, dstW, dstH),
      unrotatePoint(rect.x + rect.w, rect.y, angle, srcW, srcH, dstW, dstH),
      unrotatePoint(rect.x, rect.y + rect.h, angle, srcW, srcH, dstW, dstH),
      unrotatePoint(rect.x + rect.w, rect.y + rect.h, angle, srcW, srcH, dstW, dstH)
    ];
    var xs = corners.map(function (c) { return c[0]; });
    var ys = corners.map(function (c) { return c[1]; });
    var minX = Math.min.apply(null, xs);
    var maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys);
    var maxY = Math.max.apply(null, ys);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  async function wordsOn(canvas) {
    if (!global.FormExtract || !FormExtract.wordBoxes) return [];
    var words = await FormExtract.wordBoxes(canvas);
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

  function estimateSkew(texts) {
    var pts = (texts || []).filter(function (text) { return text.w > 18; }).map(function (text) {
      return { x: text.x + text.w / 2, y: text.y };
    });
    pts.sort(function (a, b) { return b.y - a.y; });
    var rows = [];
    pts.forEach(function (pt) {
      var row = null;
      for (var i = 0; i < rows.length; i++) {
        if (Math.abs(rows[i].y - pt.y) < 10) { row = rows[i]; break; }
      }
      if (!row) {
        row = { y: pt.y, pts: [] };
        rows.push(row);
      }
      row.pts.push(pt);
    });
    var slopes = [];
    rows.forEach(function (row) {
      if (row.pts.length < 3) return;
      row.pts.sort(function (a, b) { return a.x - b.x; });
      var a = row.pts[0];
      var b = row.pts[row.pts.length - 1];
      if (b.x - a.x < 100) return;
      slopes.push((b.y - a.y) / (b.x - a.x));
    });
    if (!slopes.length) return 0;
    slopes.sort(function (a, b) { return a - b; });
    return Math.atan(slopes[slopes.length >> 1]) * 180 / Math.PI;
  }

  function linesUnderLabels(texts, squares, width) {
    var extra = [];
    texts.forEach(function (text) {
      var str = String(text.str || '').trim();
      if (str.length < 3 || str.length > 42) return;
      if (!/[A-Za-z]/.test(str)) return;
      if ((str.match(/[\u3400-\u9fff]/g) || []).length > (str.match(/[A-Za-z]/g) || []).length) return;
      if (str.split(/\s+/).length > 4) return;
      if (str.charAt(0) === '(' && str.length > 5) return;
      if (!/name|nric|fin|address|email|date|street|postal|phone|company|title|department|gender|race|status|education|bank|signature|number|code|house|unit|birth|marital|employee|location|holder|contact|nationality/i.test(str)) return;
      var midRow = texts.some(function (other) {
        return other !== text && Math.abs(other.y - text.y) < 6 && other.x + other.w < text.x && text.x - (other.x + other.w) < 28;
      });
      if (midRow) return;
      var option = squares.some(function (square) {
        var gap = text.x - (square.x + square.w);
        return gap > -4 && gap < 18 && Math.abs(text.y - (square.y + 2)) < 8;
      });
      if (option) return;
      var colRight = text.x < width * 0.5 ? width * 0.48 : width * 0.94;
      var w = Math.min(colRight - text.x, width * 0.42);
      if (w < 70) return;
      var y = text.y - Math.max(14, (text.h || 10) + 6);
      var blocked = texts.some(function (other) {
        if (other === text) return false;
        if (other.y > text.y - 4 || other.y < y - 6) return false;
        return other.x >= text.x - 6 && other.x < text.x + w * 0.55 && String(other.str || '').length > 2;
      });
      if (blocked) return;
      extra.push({ x: text.x, y: y, w: w });
    });
    return extra;
  }

  async function layoutCanvas(canvas) {
    var straight = await wordsOn(canvas);
    var guess = estimateSkew(straight);
    var angle = Math.abs(guess) > 0.4 && Math.abs(guess) < 7 ? -guess : 0;
    var aligned = angle ? rotateCanvas(canvas, angle) : canvas;
    var geo = rasterGeometry(aligned);
    var texts = angle ? await wordsOn(aligned) : straight;
    geo.lines = geo.lines.concat(linesUnderLabels(texts, geo.squares, aligned.width));
    var fields = global.FormSpots ? FormSpots.layout({
      page: 0,
      width: aligned.width,
      height: aligned.height,
      texts: texts,
      lines: geo.lines,
      squares: geo.squares
    }) : [];
    if (!angle) return fields;
    return fields.map(function (field) {
      var mapped = mapRect({
        x: field.rect.x,
        y: field.rect.y,
        w: field.rect.width,
        h: field.rect.height
      }, angle, canvas.width, canvas.height, aligned.width, aligned.height);
      field.rect = { x: mapped.x, y: mapped.y, width: mapped.w, height: mapped.h };
      field.pageWidth = canvas.width;
      field.pageHeight = canvas.height;
      return field;
    });
  }

  async function readRasterPdf(bytes) {
    var pdf = await pdfjs().getDocument({ data: copy(bytes) }).promise;
    var fields = [];
    var limit = Math.min(pdf.numPages, 2);
    for (var p = 1; p <= limit; p++) {
      var page = await pdf.getPage(p);
      var view = page.getViewport({ scale: 1.4 });
      var canvas = document.createElement('canvas');
      canvas.width = Math.ceil(view.width);
      canvas.height = Math.ceil(view.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: view }).promise;
      var found = await layoutCanvas(canvas);
      var sx = view.width / 1.4 / canvas.width;
      var sy = view.height / 1.4 / canvas.height;
      found.forEach(function (field) {
        field.page = p - 1;
        field.rect = {
          x: field.rect.x * sx,
          y: field.rect.y * sy,
          width: field.rect.width * sx,
          height: field.rect.height * sy
        };
        field.pageWidth = view.width / 1.4;
        field.pageHeight = view.height / 1.4;
        field.lineH = (field.lineH || 12) * sy;
        fields.push(field);
      });
    }
    return fields;
  }

  async function read(bytes) {
    var doc = await PDFLib.PDFDocument.load(copy(bytes));
    var fields = readAcro(doc);
    if (fields.length) return { kind: 'acro', fields: fields };
    fields = await readFlat(bytes);
    return { kind: 'flat', fields: fields };
  }

  async function readImage(bytes, mime) {
    var bmp = await createImageBitmap(new Blob([copy(bytes)], { type: mime || 'image/jpeg' }));
    var canvas = canvasFromBitmap(bmp, 1400);
    if (bmp.close) bmp.close();
    var fields = await layoutCanvas(canvas);
    var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.86); });
    var jpeg = new Uint8Array(await blob.arrayBuffer());
    var doc = await PDFLib.PDFDocument.create();
    var image = await doc.embedJpg(jpeg);
    var page = doc.addPage([canvas.width, canvas.height]);
    page.drawImage(image, { x: 0, y: 0, width: canvas.width, height: canvas.height });
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
