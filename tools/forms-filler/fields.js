/* Read AcroForm fields, or find blank lines on a flat page, then write values back. */
(function (global) {
  function paleFill(fill) {
    if (!fill || !fill.set) return false;
    var r = Number(fill.r) || 0;
    var g = Number(fill.g) || 0;
    var b = Number(fill.b) || 0;
    if (r > 1 || g > 1 || b > 1) { r = r / 255; g = g / 255; b = b / 255; }
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var lum = 0.3 * r + 0.59 * g + 0.11 * b;
    var sat = max === 0 ? 0 : (max - min) / max;
    return lum >= 0.82 && sat <= 0.2;
  }

  function nearRoundedRect(box, points) {
    if (!box || !(box.h >= 8 && box.h <= 32 && box.w >= 36 && box.w >= box.h * 2.2)) return false;
    if (!points || points.length < 4) return false;
    var edge = Math.max(2.5, Math.min(box.h, 8));
    function near(v, target) { return Math.abs(v - target) <= edge; }
    var left = 0;
    var right = 0;
    var top = 0;
    var bottom = 0;
    points.forEach(function (p) {
      if (!p) return;
      if (near(p[0], box.x)) left++;
      if (near(p[0], box.x + box.w)) right++;
      if (near(p[1], box.y)) bottom++;
      if (near(p[1], box.y + box.h)) top++;
    });
    return left >= 1 && right >= 1 && top >= 1 && bottom >= 1;
  }

  function labelNearBox(box, texts) {
    var top = box.y + box.h;
    for (var i = 0; i < (texts || []).length; i++) {
      var text = texts[i];
      var str = String(text && text.str || '').replace(/\s+/g, ' ').trim();
      if (str.length < 2 || !/[A-Za-z]/.test(str)) continue;
      var gap = box.x - (text.x + (text.w || 0));
      var beside = gap >= -8 && gap <= 110 && text.y >= box.y - 6 && text.y <= top + 10;
      var above = (text.y - top) >= -2 && (text.y - top) <= 46 && text.x < box.x + box.w && text.x + (text.w || 0) > box.x - 12;
      if (beside || above) return true;
    }
    return false;
  }

  function sameLine(box, line) {
    if (!line) return false;
    var close = Math.abs(line.y - box.y) <= 2.5 || Math.abs(line.y - (box.y + box.h)) <= 2.5;
    if (!close) return false;
    var overlap = Math.min(line.x + line.w, box.x + box.w) - Math.max(line.x, box.x);
    return overlap > Math.min(line.w, box.w) * 0.6;
  }

  function acceptDrawnBox(spec) {
    var box = spec && spec.box;
    if (!box || !(box.w < (spec.pageWidth || 595) * 0.98)) return false;
    if (!nearRoundedRect(box, spec.points)) return false;
    if (!spec.strokedOnly && !paleFill(spec.fill)) return false;
    if (!labelNearBox(box, spec.texts)) return false;
    var lines = spec.lines || [];
    for (var i = 0; i < lines.length; i++) if (sameLine(box, lines[i])) return false;
    return true;
  }

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
      var fillColor = { r: 0, g: 0, b: 0, set: false };
      var stack = [];
      var pending = null;
      var squares = [];
      function pathBounds(path) {
        if (!path) return null;
        var ops = path[0];
        var args = path[1];
        if (!ops || !args) return null;
        var i = 0;
        var minX = 1e9;
        var minY = 1e9;
        var maxX = -1e9;
        var maxY = -1e9;
        var any = false;
        var points = [];
        function add(x, y) {
          var p = mapPoint(ctm, x, y);
          any = true;
          points.push(p);
          if (p[0] < minX) minX = p[0];
          if (p[1] < minY) minY = p[1];
          if (p[0] > maxX) maxX = p[0];
          if (p[1] > maxY) maxY = p[1];
        }
        for (var b = 0; b < ops.length; b++) {
          var code = ops[b];
          if (code === OPS.moveTo || code === OPS.lineTo) {
            add(args[i], args[i + 1]);
            i += 2;
          } else if (code === OPS.curveTo) {
            add(args[i], args[i + 1]);
            add(args[i + 2], args[i + 3]);
            add(args[i + 4], args[i + 5]);
            i += 6;
          } else if (code === OPS.curveTo2 || code === OPS.curveTo3) {
            add(args[i], args[i + 1]);
            add(args[i + 2], args[i + 3]);
            i += 4;
          } else if (code === OPS.rectangle) {
            add(args[i], args[i + 1]);
            add(args[i] + args[i + 2], args[i + 1] + args[i + 3]);
            i += 4;
          }
        }
        if (!any) return null;
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, points: points };
      }
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
        if (fn === OPS.save) stack.push({ ctm: ctm.slice(), fill: { r: fillColor.r, g: fillColor.g, b: fillColor.b, set: fillColor.set } });
        else if (fn === OPS.restore) {
          var prev = stack.pop();
          ctm = prev ? prev.ctm : [1, 0, 0, 1, 0, 0];
          fillColor = prev ? prev.fill : { r: 0, g: 0, b: 0, set: false };
        }
        else if (fn === OPS.transform && args) ctm = multiply(ctm, args);
        else if (fn === OPS.setFillRGBColor && args) fillColor = { r: args[0], g: args[1], b: args[2], set: true };
        else if ((fn === OPS.setFillGray || fn === OPS.setFillGrayColor) && args) fillColor = { r: args[0], g: args[0], b: args[0], set: true };
        else if (fn === OPS.constructPath) pending = args;
        else if (fn === OPS.stroke || fn === OPS.closeStroke || fn === OPS.fill || fn === OPS.eoFill || fn === OPS.fillStroke || fn === OPS.eoFillStroke) {
          var box = pathBounds(pending);
          var strokedOnly = fn === OPS.stroke || fn === OPS.closeStroke;
          consume(pending);
          pending = null;
          if (acceptDrawnBox({
            box: box,
            points: box && box.points,
            fill: fillColor,
            strokedOnly: strokedOnly,
            texts: texts,
            lines: lines,
            pageWidth: view.width
          })) {
            lines.push({ x: box.x, y: box.y, w: box.w });
          }
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
    var carried = '';
    pages.forEach(function (page) {
      page.carriedPerson = carried;
      FormSpots.layout(page).forEach(function (field) { fields.push(field); });
      carried = page.lastPerson || '';
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
      deskewDeg: raster.deskewDeg || (raster.sheet && raster.sheet.deskewDeg) || 0,
      route: raster.placementBlock ? 'raster-blocked' : (raster.reviewTransport && raster.reviewTransport.looked ? 'raster-review' : 'raster'),
      placementBlock: raster.placementBlock || '',
      reviewTransport: raster.reviewTransport || null
    };
  }

  /* Working sheet. Width 1500 is the cap already used for photos.
     Height 1850 is one pixel past the 1848-tall sheet measured for the
     4842×5964 Surrey JPEG after that width cap, so that sheet is unchanged
     and a narrower, taller photo cannot exceed it. */
  var MAX_WORKING_WIDTH = 1500;
  var MAX_WORKING_HEIGHT = 1850;
  /* Largest source this browser resized on request: a flat JPEG 32768 wide.
     Largest real photograph that completed: 4842×5964. A header above either
     limit is refused before createImageBitmap. */
  var MAX_SOURCE_EDGE = 32768;
  var MAX_SOURCE_PIXELS = 4842 * 5964;

  function canvasFromBitmap(bmp, maxW, maxH) {
    var scale = 1;
    var limitW = maxW || bmp.width;
    var limitH = maxH || bmp.height;
    if (bmp.width > limitW) scale = limitW / bmp.width;
    if (bmp.height * scale > limitH) scale = limitH / bmp.height;
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function u16be(bytes, i) {
    return (bytes[i] << 8) | bytes[i + 1];
  }

  function exifOrientation(bytes, start, length) {
    if (length < 16) return 0;
    if (bytes[start] !== 0x45 || bytes[start + 1] !== 0x78 || bytes[start + 2] !== 0x69 || bytes[start + 3] !== 0x66) return 0;
    var tiff = start + 6;
    if (tiff + 8 > bytes.length) return 0;
    var le = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
    var be = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
    if (!le && !be) return 0;
    function u16(o) {
      return le ? (bytes[o] | (bytes[o + 1] << 8)) : ((bytes[o] << 8) | bytes[o + 1]);
    }
    function u32(o) {
      return le
        ? ((bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0)
        : ((bytes[o] * 16777216) + ((bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3])) >>> 0;
    }
    if (u16(tiff + 2) !== 42) return 0;
    var ifd = tiff + u32(tiff + 4);
    if (ifd + 2 > bytes.length) return 0;
    var count = u16(ifd);
    for (var n = 0; n < count && n < 64; n++) {
      var entry = ifd + 2 + n * 12;
      if (entry + 10 > bytes.length) break;
      if (u16(entry) === 0x0112) {
        var value = u16(entry + 8);
        return value >= 1 && value <= 8 ? value : 0;
      }
    }
    return 0;
  }

  function jpegHeader(bytes) {
    if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    var i = 2;
    var orientation = 1;
    var width = 0;
    var height = 0;
    while (i + 3 < bytes.length) {
      if (bytes[i] !== 0xff) break;
      var marker = bytes[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      var len = u16be(bytes, i + 2);
      if (len < 2 || i + 2 + len > bytes.length) break;
      if (marker === 0xe1) {
        var found = exifOrientation(bytes, i + 4, len - 2);
        if (found) orientation = found;
      }
      var sof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
      if (sof && len >= 7) {
        height = u16be(bytes, i + 5);
        width = u16be(bytes, i + 7);
      }
      i += 2 + len;
    }
    if (!width || !height) return null;
    return { width: width, height: height, orientation: orientation };
  }

  function pngHeader(bytes) {
    if (!bytes || bytes.length < 24) return null;
    var sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (var s = 0; s < 8; s++) if (bytes[s] !== sig[s]) return null;
    if (bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82) return null;
    var width = bytes[16] * 16777216 + (bytes[17] << 16) + (bytes[18] << 8) + bytes[19];
    var height = bytes[20] * 16777216 + (bytes[21] << 16) + (bytes[22] << 8) + bytes[23];
    if (!width || !height) return null;
    return { width: width, height: height, orientation: 1 };
  }

  function imageHeader(bytes) {
    return jpegHeader(bytes) || pngHeader(bytes);
  }

  function orientedPixels(header) {
    var turn = header.orientation || 1;
    if (turn >= 5 && turn <= 8) return { width: header.height, height: header.width };
    return { width: header.width, height: header.height };
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

  async function wordsOn(canvas, minConfidence) {
    if (canvas && canvas._ffWordOverride && minConfidence == null) return canvas._ffWordOverride;
    if (!global.FormExtract || !FormExtract.wordBoxes) return [];
    var opts = minConfidence == null ? undefined : { minConfidence: minConfidence };
    var words = await FormExtract.wordBoxes(canvas, 11, opts);
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
    if (maxX <= minX || maxY <= minY) {
      canvas._ffCrop = { x: 0, y: 0, w: w, h: h };
      return canvas;
    }
    var pad = 8;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad);
    maxY = Math.min(h - 1, maxY + pad);
    var cw = maxX - minX;
    var ch = maxY - minY;
    if (cw > w * 0.98 && ch > h * 0.98) {
      canvas._ffCrop = { x: 0, y: 0, w: w, h: h };
      return canvas;
    }
    var out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    out.getContext('2d').drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
    out._ffCrop = { x: minX, y: minY, w: cw, h: ch };
    return out;
  }

  /* The photo the user sees keeps the orientation createImageBitmap already
     normalized from EXIF. The line-angle search is not painted into that
     sheet: an upright page was being turned by a weak score, and the export
     then matched the turned pixels. PDF scans still consult the score and
     refuse to turn a sideways page. */
  async function uprightSheet(canvas) {
    var cropped = cropToPage(canvas);
    cropped._ffFrame = {
      angle: 0,
      inW: canvas.width,
      inH: canvas.height,
      turnW: canvas.width,
      turnH: canvas.height
    };
    return cropped;
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

  async function fieldsOnSheet(canvas, progress, carried) {
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
    page.carriedPerson = carried || '';
    var primary = FormSpots.layout(page);
    primary.lastPerson = page.lastPerson || '';
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
        var vertical = text.y - line.y;
        var overlaps = text.x < line.x + line.w && text.x + text.w > line.x - 8;
        var above = overlaps && vertical >= 6 && vertical <= 80;
        var below = overlaps && vertical <= -4 && vertical >= -36;
        var gap = line.x - (text.x + text.w);
        var beside = gap >= -8 && gap <= 48 && Math.abs(vertical) <= 18;
        if (!above && !below && !beside) return;
        var dist = Math.abs(vertical);
        var nearer = rules.some(function (other) {
          if (other === line) return false;
          var otherOverlap = text.x < other.x + other.w && text.x + text.w > other.x - 8;
          return otherOverlap && Math.abs(text.y - other.y) + 3 < dist;
        });
        if (nearer) return;
        candidates.push({ text: text, dy: dist, above: vertical > 0 });
      });
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

  /* The guarded scan still refuses rotation, an offset crop, and any page
     scale other than 1. A non-positive or unreadable file UserUnit is refused
     here even when the reader reports 1. Review transport, below, may carry
     an unchanged detector result only after that refusal, and only when the
     ledger accepts the page. It does not change line thresholds. */
  async function scanFrame(bytes) {
    var doc = await PDFLib.PDFDocument.load(copy(bytes));
    var pdf = await pdfjs().getDocument({ data: copy(bytes) }).promise;
    var reasons = [];
    var limit = Math.min(doc.getPageCount(), pdf.numPages, 2);
    for (var i = 0; i < limit; i++) {
      var libPage = doc.getPages()[i];
      var media = libPage.getMediaBox();
      var crop = libPage.getCropBox();
      var angle = ((libPage.getRotation().angle % 360) + 360) % 360;
      if (angle) reasons.push('rotation');
      if (Math.abs(crop.x - media.x) > 0.5 || Math.abs(crop.y - media.y) > 0.5 || Math.abs(crop.width - media.width) > 0.5 || Math.abs(crop.height - media.height) > 0.5) reasons.push('crop');
      var jsPage = await pdf.getPage(i + 1);
      var fileUnit = global.FormCoords && FormCoords.fileUserUnit ? FormCoords.fileUserUnit(libPage) : null;
      if (fileUnit == null || !(fileUnit > 0) || fileUnit > 75000) reasons.push('scale');
      else if (typeof jsPage.userUnit !== 'number' || Math.abs(jsPage.userUnit - fileUnit) > 0.001) reasons.push('scale-unread');
      else if (Math.abs(fileUnit - 1) > 0.001) reasons.push('scale');
    }
    var unique = [];
    reasons.forEach(function (reason) { if (unique.indexOf(reason) < 0) unique.push(reason); });
    var bits = [];
    if (unique.indexOf('rotation') >= 0) bits.push('rotated');
    if (unique.indexOf('crop') >= 0) bits.push('cropped');
    if (unique.indexOf('scale') >= 0) bits.push('on a page scale other than 1');
    if (unique.indexOf('scale-unread') >= 0) bits.push('missing a readable page scale');
    return {
      blocked: unique.length > 0,
      reasons: unique,
      message: unique.length
        ? 'This scan is ' + bits.join(' and ') + '. Line positions are not offered, because a guess would land in the wrong place. Open it in the editor and place the values yourself.'
        : ''
    };
  }

  async function transportFrame(bytes) {
    if (!global.FormCoords) return { ok: false, reason: 'ledger-missing' };
    var doc = await PDFLib.PDFDocument.load(copy(bytes));
    var pdf = await pdfjs().getDocument({ data: copy(bytes) }).promise;
    var limit = Math.min(doc.getPageCount(), pdf.numPages, 2);
    var pages = [];
    for (var i = 0; i < limit; i++) {
      var frame = FormCoords.frameOf(doc.getPages()[i], await pdf.getPage(i + 1), 0);
      if (!frame.ok) return { ok: false, reason: (frame.reasons && frame.reasons[0]) || 'frame' };
      pages.push({
        rotation: frame.rotation,
        userUnit: frame.userUnit,
        crop: { x: frame.crop.x, y: frame.crop.y, width: frame.crop.width, height: frame.crop.height }
      });
    }
    return { ok: true, pages: pages };
  }

  function fallbackMessage(frame, review) {
    if (review && review.looked && !review.fields.length) {
      var sideways = (review.abstain || []).some(function (item) { return item.reason === 'sideways-in-view'; });
      if (sideways) return 'This scan is sideways in the view. It was not turned to force a reading. Place the values yourself.';
      return 'This scan did not produce a line position in the view. The page was not turned to force a reading. Place the values yourself.';
    }
    return frame.message;
  }

  async function readRasterReview(bytes, progress) {
    var started = Date.now();
    var allowed = await transportFrame(bytes);
    if (!allowed.ok) return { ok: false, reason: allowed.reason, looked: false, fields: [], abstain: [], ms: Date.now() - started };
    var pdf = await pdfjs().getDocument({ data: copy(bytes) }).promise;
    var fields = [];
    var abstain = [];
    var carried = '';
    var limit = Math.min(pdf.numPages, 2);
    for (var p = 1; p <= limit; p++) {
      say(progress, 'Reading scan page ' + p + ' of ' + limit + '…');
      var page = await pdf.getPage(p);
      var view = page.getViewport({ scale: 2 });
      var canvas = document.createElement('canvas');
      canvas.width = Math.ceil(view.width);
      canvas.height = Math.ceil(view.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: view }).promise;
      var angle = await bestLineAngle(canvas);
      if (angle) {
        abstain.push({ page: p - 1, reason: 'sideways-in-view', angle: angle });
        continue;
      }
      var found = await fieldsOnSheet(canvas, progress, carried);
      carried = found.lastPerson || '';
      var pageW = 595;
      var pageH = canvas.height * (pageW / canvas.width);
      if (!found.length) {
        abstain.push({ page: p - 1, reason: 'no-detector-position' });
        continue;
      }
      found.forEach(function (field) {
        field.page = p - 1;
        field.pageWidth = pageW;
        field.pageHeight = pageH;
        field.transport = 'viewport-review';
        field.viewWidth = canvas.width;
        field.viewHeight = canvas.height;
        if (field.pageWidth > field.pageHeight * 1.2) field.untrusted = true;
        fields.push(field);
      });
    }
    return {
      ok: fields.length > 0,
      looked: true,
      fields: fields,
      abstain: abstain,
      pages: allowed.pages,
      ms: Date.now() - started
    };
  }

  /* A field found on a turned copy is stated in that copy's page space, y up.
     The editor opens the original PDF, so the rect has to come back through
     the same rotation, including the grown canvas. A rect that does not land
     on the original page is dropped. The original file is not replaced. */
  function unturnField(field, srcW, srcH, turnW, turnH, angle) {
    if (!global.FormFrame || !field.rect) return null;
    var rect = field.rect;
    var pageW = field.pageWidth || 595;
    var pageH = field.pageHeight || (turnH * (pageW / turnW));
    var frame = { angle: angle, inW: srcW, inH: srcH, turnW: turnW, turnH: turnH };
    function corner(x, yUp) {
      var tx = x / pageW * turnW;
      var ty = turnH - (yUp / pageH * turnH);
      return FormFrame.turnToInput(tx, ty, frame);
    }
    var pts = [
      corner(rect.x, rect.y),
      corner(rect.x + rect.width, rect.y),
      corner(rect.x, rect.y + rect.height),
      corner(rect.x + rect.width, rect.y + rect.height)
    ];
    var minX = Math.min.apply(null, pts.map(function (p) { return p.x; }));
    var maxX = Math.max.apply(null, pts.map(function (p) { return p.x; }));
    var minY = Math.min.apply(null, pts.map(function (p) { return p.y; }));
    var maxY = Math.max.apply(null, pts.map(function (p) { return p.y; }));
    var pad = 8;
    if (maxX < -pad || minX > srcW + pad || maxY < -pad || minY > srcH + pad) return null;
    var origW = 595;
    var origH = srcH * (origW / srcW);
    var cx = (minX + maxX) / 2;
    var cy = (minY + maxY) / 2;
    var w = rect.width / pageW * turnW / srcW * origW;
    var h = rect.height / pageH * turnH / srcH * origH;
    var yUp = (srcH - cy) / srcH * origH;
    return {
      rect: {
        x: cx / srcW * origW - w / 2,
        y: yUp - h / 2,
        width: w,
        height: h
      },
      pageWidth: origW,
      pageHeight: origH
    };
  }

  async function readRasterPdf(bytes, progress) {
    var frame = await scanFrame(bytes);
    if (frame.blocked) {
      var review = await readRasterReview(bytes, progress);
      if (!review || !review.fields.length) {
        return {
          fields: [],
          sheet: null,
          placementBlock: fallbackMessage(frame, review),
          frame: frame,
          reviewTransport: review
        };
      }
      return {
        fields: review.fields,
        sheet: null,
        deskewDeg: 0,
        placementBlock: '',
        frame: { blocked: false, reasons: [], transported: true },
        reviewTransport: {
          looked: true,
          ms: review.ms,
          abstain: review.abstain,
          pages: review.pages,
          count: review.fields.length
        }
      };
    }
    var pdf = await pdfjs().getDocument({ data: copy(bytes) }).promise;
    var fields = [];
    var limit = Math.min(pdf.numPages, 2);
    var angles = [];
    var carriedRaster = '';
    for (var p = 1; p <= limit; p++) {
      say(progress, 'Reading scan page ' + p + ' of ' + limit + '…');
      var page = await pdf.getPage(p);
      var view = page.getViewport({ scale: 2 });
      var canvas = document.createElement('canvas');
      canvas.width = Math.ceil(view.width);
      canvas.height = Math.ceil(view.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: view }).promise;
      var angle = await bestLineAngle(canvas) || 0;
      var turned = angle ? rotateCanvas(canvas, angle) : canvas;
      angles.push({ page: p - 1, angle: angle, srcW: canvas.width, srcH: canvas.height, turnW: turned.width, turnH: turned.height });
      var found = await fieldsOnSheet(turned, progress, carriedRaster);
      carriedRaster = found.lastPerson || '';
      var pageW = 595;
      var pageH = canvas.height * (pageW / canvas.width);
      found.forEach(function (field) {
        if (angle) {
          var mapped = unturnField(field, canvas.width, canvas.height, turned.width, turned.height, angle);
          if (!mapped) return;
          field.rect = mapped.rect;
          field.pageWidth = mapped.pageWidth;
          field.pageHeight = mapped.pageHeight;
          field.transport = 'viewport-review';
          field.detectAngle = angle;
        } else {
          field.pageWidth = pageW;
          field.pageHeight = pageH;
        }
        field.page = p - 1;
        if (field.pageWidth > field.pageHeight * 1.2) field.untrusted = true;
        fields.push(field);
      });
    }
    var tilted = angles.filter(function (item) { return item.angle; });
    if (tilted.length && !fields.length) {
      return {
        fields: [],
        sheet: null,
        deskewDeg: angles[0] ? angles[0].angle : 0,
        placementBlock: '',
        frame: { blocked: false, reasons: [], userUnitRead: true },
        reviewTransport: null
      };
    }
    return {
      fields: fields,
      sheet: null,
      deskewDeg: angles[0] ? angles[0].angle : 0,
      frame: { blocked: false, reasons: [], userUnitRead: true },
      reviewTransport: tilted.length ? { looked: true, angles: angles, count: fields.length, abstain: [] } : null
    };
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
    function wordsOfSentence(s) {
      return String(s || '').split(/\s+/).length > 10;
    }
    function clipLabel(str) {
      var cut = String(str || '').replace(/\s+/g, ' ').trim().split('.')[0];
      var parts = cut.split(/\s+/).filter(Boolean);
      if (/^\d+[a-z]?$/i.test(parts[0] || '')) parts = parts.slice(1);
      if (parts.length > 8) parts = parts.slice(0, 6);
      var s = parts.join(' ').replace(/[:,\s]+$/, '');
      if (s.length < 3 || s.length > 72) return '';
      if (!/^[A-Z]/.test(s)) return '';
      if (wordsOfSentence(s)) return '';
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
    fields.forEach(function (field) {
      field.texts = textsByPage[field.page || 0] || [];
    });
    if (global.FormEvidence && FormEvidence.applySectionContext) FormEvidence.applySectionContext(fields);
    fields.forEach(function (field) { delete field.texts; });
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
    if (flat && (flat.fields || flat.placementBlock)) {
      return {
        kind: 'flat',
        route: flat.route || 'text',
        fields: flat.fields || [],
        bytes: flat.bytes || null,
        deskewDeg: flat.deskewDeg || 0,
        placementBlock: flat.placementBlock || '',
        reviewTransport: flat.reviewTransport || null
      };
    }
    return { kind: 'flat', route: flat && flat.route || 'empty', fields: [], placementBlock: '' };
  }

  async function readImage(bytes, mime, progress, alive) {
    var current = typeof alive === 'function' ? alive : function () { return true; };
    var data = copy(bytes);
    var header = imageHeader(data);
    var oriented = header ? orientedPixels(header) : null;
    if (oriented && (oriented.width > MAX_SOURCE_EDGE || oriented.height > MAX_SOURCE_EDGE || oriented.width * oriented.height > MAX_SOURCE_PIXELS)) {
      throw new Error('This image is ' + oriented.width + '×' + oriented.height + '. This reader stops at 4842×5964 pixels or an edge of 32768 and did not decode it.');
    }
    say(progress, 'Reading the photo…');
    var options = { imageOrientation: 'from-image' };
    if (oriented) {
      var prescale = 1;
      if (oriented.width > MAX_WORKING_WIDTH) prescale = MAX_WORKING_WIDTH / oriented.width;
      if (oriented.height * prescale > MAX_WORKING_HEIGHT) prescale = MAX_WORKING_HEIGHT / oriented.height;
      if (prescale < 1) {
        options.resizeWidth = Math.max(1, Math.round(oriented.width * prescale));
        options.resizeHeight = Math.max(1, Math.round(oriented.height * prescale));
        options.resizeQuality = 'high';
      }
    }
    var bmp = null;
    try {
      bmp = await createImageBitmap(new Blob([data], { type: mime || 'image/jpeg' }), options);
    } catch (err) {
      throw new Error('That image could not be opened. Nothing was kept from it.');
    }
    if (!current()) {
      if (bmp && bmp.close) bmp.close();
      return null;
    }
    var sourceW = oriented ? oriented.width : bmp.width;
    var sourceH = oriented ? oriented.height : bmp.height;
    say(progress, 'Straightening the photo…');
    var canvas = await uprightSheet(canvasFromBitmap(bmp, MAX_WORKING_WIDTH, MAX_WORKING_HEIGHT));
    if (bmp.close) bmp.close();
    bmp = null;
    if (!current()) return null;
    var fields = await fieldsOnSheet(canvas, progress);
    if (!current()) return null;
    var frame = canvas._ffFrame || { angle: 0, inW: canvas.width, inH: canvas.height, turnW: canvas.width, turnH: canvas.height };
    var crop = canvas._ffCrop || { x: 0, y: 0, w: canvas.width, h: canvas.height };
    var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.9); });
    if (!blob || !current()) return null;
    var jpeg = new Uint8Array(await blob.arrayBuffer());
    var doc = await PDFLib.PDFDocument.create();
    var image = await doc.embedJpg(jpeg);
    var pageW = 595;
    var pageH = canvas.height * (pageW / canvas.width);
    var page = doc.addPage([pageW, pageH]);
    page.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });
    if (!current()) return null;
    return {
      kind: 'flat',
      fields: fields,
      bytes: new Uint8Array(await doc.save()),
      frame: {
        angle: frame.angle,
        inW: frame.inW,
        inH: frame.inH,
        turnW: frame.turnW,
        turnH: frame.turnH,
        crop: crop,
        outW: canvas.width,
        outH: canvas.height,
        sourceW: sourceW,
        sourceH: sourceH
      }
    };
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

  function evidenceApi() {
    if (global.FormEvidence && global.FormEvidence.fittedSize) return global.FormEvidence;
    if (typeof require === 'function') {
      try { return require('./evidence.js'); } catch (err) { return null; }
    }
    return null;
  }

  async function fill(bytes, fields, values, opts) {
    var doc = await PDFLib.PDFDocument.load(copy(bytes));
    var font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    var byName = {};
    var missed = [];
    var evidence = evidenceApi();
    if (fields.some(function (field) { return field.source === 'acro'; })) {
      var form = doc.getForm();
      form.getFields().forEach(function (field) {
        byName[field.getName()] = field;
      });
      fields.forEach(function (meta) {
        var value = values ? values[meta.id] : '';
        if (value == null || String(value).trim() === '') return;
        if (meta.source !== 'acro' || !byName[meta.id]) {
          missed.push({ id: meta.id, label: meta.label || meta.id, reason: 'no matching field' });
          return;
        }
        if ((meta.type === 'checkbox' || meta.type === 'radio') && !truthy(value)) {
          missed.push({ id: meta.id, label: meta.label || meta.id, reason: 'this box cannot hold that value' });
          return;
        }
        if (meta.type === 'text' && meta.rect && evidence && evidence.fittedSize) {
          var fit = evidence.fittedSize(String(value), meta.rect.width, 12);
          if (!fit.fits) {
            missed.push({ id: meta.id, label: meta.label || meta.id, reason: 'does not fit' });
            return;
          }
          if (fit.size < 12 && typeof byName[meta.id].setFontSize === 'function') byName[meta.id].setFontSize(fit.size);
        }
        try {
          applyAcro(byName[meta.id], meta, value);
        } catch (err) {
          missed.push({ id: meta.id, label: meta.label || meta.id, reason: 'could not be written' });
        }
      });
      form.updateFieldAppearances(font);
      /* A second appearance pass drops comb text, so the export has no new words. */
      if (opts && opts.flatten) form.flatten({ updateFieldAppearances: false });
    }
    var out = new Uint8Array(await doc.save());
    out.unplaced = missed;
    return out;
  }

  function sourceToSheet(x, y, frame) {
    var sx = frame.sourceW / frame.inW;
    var sy = frame.sourceH / frame.inH;
    var sheetX = x / sx - frame.crop.x;
    var sheetY = y / sy - frame.crop.y;
    if (frame.angle) {
      var back = { x: sheetX, y: sheetY };
      return back;
    }
    return { x: sheetX, y: sheetY };
  }

  function sampleBand(canvas, frame, rect) {
    var a = sourceToSheet(rect[0], rect[1], frame);
    var b = sourceToSheet(rect[2], rect[3], frame);
    var x0 = Math.max(0, Math.floor(Math.min(a.x, b.x)));
    var x1 = Math.min(canvas.width - 1, Math.ceil(Math.max(a.x, b.x)));
    var y0 = Math.max(3, Math.floor(Math.min(a.y, b.y)));
    var y1 = Math.min(canvas.height - 4, Math.ceil(Math.max(a.y, b.y)));
    var onSheet = x1 > x0 && y1 > y0;
    if (!onSheet) return { onSheet: false, n: 0 };
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    var w = canvas.width;
    function lum(x, y) {
      var i = (y * w + x) * 4;
      return 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
    }
    var deltas = [];
    var greens = [];
    var mask = 0;
    var yStart = Math.max(3, y1 - 5);
    var bestRow = { y: y1, mask: 0, delta: null };
    var rowLo = Math.max(3, y1 - 8);
    var rowHi = Math.min(canvas.height - 4, y1 + 8);
    for (var y = rowLo; y <= rowHi; y++) {
      var rowMask = 0;
      var rowDelta = [];
      var inBand = y >= yStart && y <= y1;
      for (var x = x0; x <= x1; x += 2) {
        var i = (y * w + x) * 4;
        var c = lum(x, y);
        var delta = Math.min(lum(x, y - 3) - c, lum(x, y + 3) - c);
        if (inBand) {
          deltas.push(delta);
          greens.push(data[i + 1] - Math.max(data[i], data[i + 2]));
          if (c + 8 < lum(x, y - 4) && c + 8 < lum(x, y + 4)) mask++;
        }
        if (c + 8 < lum(x, y - 4) && c + 8 < lum(x, y + 4)) rowMask++;
        rowDelta.push(delta);
      }
      if (rowMask > bestRow.mask) {
        rowDelta.sort(function (p, q) { return p - q; });
        bestRow = {
          y: y,
          mask: rowMask,
          delta: rowDelta.length ? rowDelta[Math.floor(rowDelta.length * 0.9)] : null
        };
      }
    }
    deltas.sort(function (p, q) { return p - q; });
    greens.sort(function (p, q) { return p - q; });
    function pick(list, p) {
      if (!list.length) return null;
      return list[Math.min(list.length - 1, Math.floor(list.length * p))];
    }
    var strong = 0;
    deltas.forEach(function (d) { if (d > 30) strong++; });
    return {
      onSheet: true,
      n: deltas.length,
      mask: mask,
      deltaMedian: pick(deltas, 0.5),
      deltaP90: pick(deltas, 0.9),
      strong30: strong,
      greenMedian: pick(greens, 0.5),
      bestRow: bestRow
    };
  }

  /* Research only. Not used by read or readImage.
     Frozen crop: up to 8 ink-mask lines of at least 80px, longest first.
     Each crop is 28px above that line and 8px below, at most 420px wide,
     copied 1:1 from the working sheet. PSM 7. Confidence stays 35.
     Stop at 8s or 250000 crop pixels. */
  async function lineLocalOcr(canvas) {
    var h = canvas.height;
    var geo = await rasterGeometry(canvas);
    var lines = geo.lines.filter(function (line) { return line.w >= 80; });
    lines.sort(function (a, b) { return b.w - a.w; });
    if (lines.length > 8) lines = lines.slice(0, 8);
    var words = [];
    var started = Date.now();
    var pixels = 0;
    var crops = 0;
    for (var i = 0; i < lines.length; i++) {
      if (Date.now() - started > 8000) break;
      var line = lines[i];
      var yLine = h - line.y;
      var y0 = Math.max(0, Math.round(yLine - 28));
      var y1 = Math.min(h, Math.round(yLine + 8));
      var x0 = Math.max(0, Math.round(line.x - 4));
      var x1 = Math.min(canvas.width, Math.round(Math.min(line.x + line.w, line.x + 420) + 4));
      var cw = Math.max(1, x1 - x0);
      var ch = Math.max(1, y1 - y0);
      if (cw * ch > 480 * 48) cw = Math.min(cw, 480);
      pixels += cw * ch;
      if (pixels > 250000) break;
      var crop = document.createElement('canvas');
      crop.width = cw;
      crop.height = ch;
      crop.getContext('2d').drawImage(canvas, x0, y0, cw, ch, 0, 0, cw, ch);
      var found = global.FormExtract ? await FormExtract.wordBoxes(crop, 7) : [];
      crops++;
      found.forEach(function (word) {
        var box = word.bbox || {};
        var yb = y0 + (box.y1 || box.y0 || 0);
        words.push({
          x: x0 + (box.x0 || 0),
          y: h - yb,
          w: Math.max(4, (box.x1 || 0) - (box.x0 || 0)),
          h: Math.max(6, (box.y1 || 0) - (box.y0 || 0)),
          str: word.text || ''
        });
      });
    }
    return { words: words, crops: crops, pixels: pixels, ms: Date.now() - started, lines: lines.length };
  }

  async function openSheet(bytes, mime) {
    var data = copy(bytes);
    var header = imageHeader(data);
    var oriented = header ? orientedPixels(header) : null;
    var options = { imageOrientation: 'from-image' };
    if (oriented) {
      var prescale = 1;
      if (oriented.width > MAX_WORKING_WIDTH) prescale = MAX_WORKING_WIDTH / oriented.width;
      if (oriented.height * prescale > MAX_WORKING_HEIGHT) prescale = MAX_WORKING_HEIGHT / oriented.height;
      if (prescale < 1) {
        options.resizeWidth = Math.max(1, Math.round(oriented.width * prescale));
        options.resizeHeight = Math.max(1, Math.round(oriented.height * prescale));
        options.resizeQuality = 'high';
      }
    }
    var bmp = await createImageBitmap(new Blob([data], { type: mime || 'image/jpeg' }), options);
    var sourceW = oriented ? oriented.width : bmp.width;
    var sourceH = oriented ? oriented.height : bmp.height;
    var canvas = await uprightSheet(canvasFromBitmap(bmp, MAX_WORKING_WIDTH, MAX_WORKING_HEIGHT));
    if (bmp.close) bmp.close();
    var base = canvas._ffFrame || { angle: 0, inW: canvas.width, inH: canvas.height, turnW: canvas.width, turnH: canvas.height };
    return {
      canvas: canvas,
      frame: {
        angle: base.angle || 0,
        inW: base.inW, inH: base.inH, turnW: base.turnW, turnH: base.turnH,
        crop: canvas._ffCrop || { x: 0, y: 0, w: canvas.width, h: canvas.height },
        outW: canvas.width, outH: canvas.height, sourceW: sourceW, sourceH: sourceH
      }
    };
  }

  async function candidateReport(bytes, mime) {
    var t0 = Date.now();
    var opened = await openSheet(bytes, mime);
    var local = await lineLocalOcr(opened.canvas);
    opened.canvas._ffWordOverride = local.words;
    var fields = [];
    try {
      fields = await fieldsOnSheet(opened.canvas);
    } finally {
      opened.canvas._ffWordOverride = null;
    }
    return {
      ms: Date.now() - t0,
      ocrMs: local.ms,
      crops: local.crops,
      pixels: local.pixels,
      lines: local.lines,
      words: local.words.map(function (word) {
        return {
          kind: global.FormEvidence ? FormEvidence.fieldKind({ label: word.str }) : 'other',
          x: Math.round(word.x),
          y: Math.round(opened.canvas.height - (word.y + word.h)),
          w: Math.round(word.w),
          h: Math.round(word.h)
        };
      }),
      fields: fields.map(function (field) {
        return {
          kind: global.FormEvidence ? FormEvidence.fieldKind(field) : 'other',
          labelKind: global.FormEvidence ? FormEvidence.fieldKind(field) : 'other',
          x: field.rect ? field.rect.x : null,
          y: field.rect ? field.rect.y : null,
          w: field.rect ? field.rect.width : null,
          h: field.rect ? field.rect.height : null,
          pw: field.pageWidth,
          ph: field.pageHeight
        };
      }),
      frame: opened.frame,
      heap: typeof performance !== 'undefined' && performance.memory ? performance.memory.usedJSHeapSize : null
    };
  }

  async function stageReport(bytes, mime, bands) {
    var t0 = Date.now();
    var data = copy(bytes);
    var header = imageHeader(data);
    var oriented = header ? orientedPixels(header) : null;
    var options = { imageOrientation: 'from-image' };
    if (oriented) {
      var prescale = 1;
      if (oriented.width > MAX_WORKING_WIDTH) prescale = MAX_WORKING_WIDTH / oriented.width;
      if (oriented.height * prescale > MAX_WORKING_HEIGHT) prescale = MAX_WORKING_HEIGHT / oriented.height;
      if (prescale < 1) {
        options.resizeWidth = Math.max(1, Math.round(oriented.width * prescale));
        options.resizeHeight = Math.max(1, Math.round(oriented.height * prescale));
        options.resizeQuality = 'high';
      }
    }
    var bmp = await createImageBitmap(new Blob([data], { type: mime || 'image/jpeg' }), options);
    var sourceW = oriented ? oriented.width : bmp.width;
    var sourceH = oriented ? oriented.height : bmp.height;
    var canvas = await uprightSheet(canvasFromBitmap(bmp, MAX_WORKING_WIDTH, MAX_WORKING_HEIGHT));
    if (bmp.close) bmp.close();
    var frame = canvas._ffFrame || { angle: 0, inW: canvas.width, inH: canvas.height, turnW: canvas.width, turnH: canvas.height };
    frame = {
      angle: frame.angle || 0,
      inW: frame.inW, inH: frame.inH, turnW: frame.turnW, turnH: frame.turnH,
      crop: canvas._ffCrop || { x: 0, y: 0, w: canvas.width, h: canvas.height },
      outW: canvas.width, outH: canvas.height, sourceW: sourceW, sourceH: sourceH
    };
    var h = canvas.height;
    var tLines = Date.now();
    var plain = await rasterGeometry(canvas);
    var contrasted = await rasterGeometry(await stretchContrast(canvas));
    var under = underlineRules(canvas);
    var strokes = strokeRules(canvas);
    var tOcr = Date.now();
    var words = await wordsOn(canvas);
    var unfiltered = await wordsOn(canvas, 0);
    var contrastWords = await wordsOn(await stretchContrast(canvas));
    var ink = document.createElement('canvas');
    ink.width = canvas.width;
    ink.height = canvas.height;
    var inkCtx = ink.getContext('2d', { willReadFrequently: true });
    inkCtx.drawImage(canvas, 0, 0);
    var inkImage = inkCtx.getImageData(0, 0, ink.width, ink.height);
    var inkData = inkImage.data;
    for (var p = 0; p < inkData.length; p += 4) {
      var excess = inkData[p + 1] - Math.max(inkData[p], inkData[p + 2]);
      var luma = 0.3 * inkData[p] + 0.59 * inkData[p + 1] + 0.11 * inkData[p + 2];
      var dark = excess > 6 && luma < 210;
      inkData[p] = inkData[p + 1] = inkData[p + 2] = dark ? 20 : 245;
    }
    inkCtx.putImageData(inkImage, 0, 0);
    var inkWords = await wordsOn(ink);
    var tFields = Date.now();
    var fields = await fieldsOnSheet(canvas);
    function tops(list) {
      return list.map(function (line) {
        return { x: Math.round(line.x), y: Math.round(h - line.y), w: Math.round(line.w) };
      });
    }
    function wordBoxesOf(list) {
      var known = 0;
      var boxes = list.map(function (word) {
        var kind = global.FormEvidence ? FormEvidence.fieldKind({ label: word.str }) : 'other';
        if (kind && kind !== 'other') known++;
        return {
          x: Math.round(word.x),
          y: Math.round(h - (word.y + word.h)),
          w: Math.round(word.w),
          h: Math.round(word.h),
          kind: kind || 'other'
        };
      });
      return { known: known, boxes: boxes };
    }
    var rawWords = wordBoxesOf(words);
    var stretched = wordBoxesOf(contrastWords);
    var inkBoxed = wordBoxesOf(inkWords);
    return {
      ms: { open: tLines - t0, lines: tOcr - tLines, ocr: tFields - tOcr, fields: Date.now() - tFields },
      frame: frame,
      counts: {
        plainLines: plain.lines.length,
        contrastLines: contrasted.lines.length,
        underlines: under.length,
        strokes: strokes.length,
        wordsUnfiltered: unfiltered.length,
        words: words.length,
        wordsKnownKind: rawWords.known,
        contrastWords: contrastWords.length,
        contrastKnownKind: stretched.known,
        inkWords: inkWords.length,
        inkKnownKind: inkBoxed.known,
        fields: fields.length
      },
      lines: { plain: tops(plain.lines), contrast: tops(contrasted.lines), under: tops(under), stroke: tops(strokes) },
      words: rawWords.boxes,
      contrastWordBoxes: stretched.boxes,
      inkWordBoxes: inkBoxed.boxes,
      fields: fields.map(function (field) {
        return {
          kind: global.FormEvidence ? FormEvidence.fieldKind(field) : 'other',
          x: field.rect ? field.rect.x : null,
          y: field.rect ? field.rect.y : null,
          w: field.rect ? field.rect.width : null,
          h: field.rect ? field.rect.height : null,
          pw: field.pageWidth,
          ph: field.pageHeight
        };
      }),
      bands: (bands || []).map(function (rect) { return sampleBand(canvas, frame, rect); })
    };
  }

  /* Research only. The same eight ink-mask crops as lineLocalOcr, without OCR
     and without a native decode. read and readImage do not call this. */
  async function lineCropReport(bytes, mime) {
    var opened = await openSheet(bytes, mime);
    var h = opened.canvas.height;
    var geo = await rasterGeometry(opened.canvas);
    var lines = geo.lines.filter(function (line) { return line.w >= 80; });
    lines.sort(function (a, b) { return b.w - a.w; });
    if (lines.length > 8) lines = lines.slice(0, 8);
    var crops = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var yLine = h - line.y;
      var y0 = Math.max(0, Math.round(yLine - 28));
      var y1 = Math.min(h, Math.round(yLine + 8));
      var x0 = Math.max(0, Math.round(line.x - 4));
      var x1 = Math.min(opened.canvas.width, Math.round(Math.min(line.x + line.w, line.x + 420) + 4));
      var cw = Math.max(1, x1 - x0);
      var ch = Math.max(1, y1 - y0);
      if (cw * ch > 480 * 48) cw = Math.min(cw, 480);
      crops.push({
        x: x0,
        y: y0,
        w: cw,
        h: ch,
        line: { x: line.x, y: line.y, w: line.w }
      });
    }
    return { frame: opened.frame, sheetW: opened.canvas.width, sheetH: h, crops: crops };
  }

  /* Research only. Places fields with the existing linker and an injected word
     list. Not a read path. */
  async function fieldsFromWords(bytes, mime, words) {
    var opened = await openSheet(bytes, mime);
    opened.canvas._ffWordOverride = words || [];
    var fields = [];
    try {
      fields = await fieldsOnSheet(opened.canvas);
    } finally {
      opened.canvas._ffWordOverride = null;
    }
    return {
      frame: opened.frame,
      fields: fields.map(function (field) {
        return {
          kind: global.FormEvidence ? FormEvidence.fieldKind(field) : 'other',
          label: field.label || '',
          x: field.rect ? field.rect.x : null,
          y: field.rect ? field.rect.y : null,
          w: field.rect ? field.rect.width : null,
          h: field.rect ? field.rect.height : null,
          pw: field.pageWidth,
          ph: field.pageHeight
        };
      })
    };
  }

  global.FormFields = {
    read: read,
    readImage: readImage,
    fill: fill,
    stageReport: stageReport,
    candidateReport: candidateReport,
    lineCropReport: lineCropReport,
    fieldsFromWords: fieldsFromWords,
    acceptDrawnBox: acceptDrawnBox
  };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : globalThis).FormFields;
