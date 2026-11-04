/* Shared PDF size ladder.
   100% returns the bytes unchanged (vector text and full images).
   75 / 50 / 25 recompress embedded images first and keep the text.
   If that cannot undercut the previous file, pages are rebuilt as JPEGs. */
(function (global) {
  var LEVELS = [100, 75, 50, 25];
  var LADDERS = {
    75: [
      { scale: 0.85, maxEdge: 2000, quality: 0.8 },
      { scale: 0.7, maxEdge: 1600, quality: 0.68 }
    ],
    50: [
      { scale: 0.6, maxEdge: 1400, quality: 0.62 },
      { scale: 0.48, maxEdge: 1100, quality: 0.52 }
    ],
    25: [
      { scale: 0.4, maxEdge: 900, quality: 0.46 },
      { scale: 0.32, maxEdge: 700, quality: 0.38 }
    ]
  };
  var RASTERS = {
    75: [
      { scale: 1.65, quality: 0.82 },
      { scale: 1.35, quality: 0.7 },
      { scale: 1.15, quality: 0.6 }
    ],
    50: [
      { scale: 1.2, quality: 0.66 },
      { scale: 1.0, quality: 0.54 },
      { scale: 0.88, quality: 0.46 }
    ],
    25: [
      { scale: 0.95, quality: 0.5 },
      { scale: 0.8, quality: 0.42 },
      { scale: 0.68, quality: 0.36 }
    ]
  };

  function copyBytes(bytes) {
    var out = new Uint8Array(bytes.byteLength);
    out.set(bytes);
    return out;
  }

  function ensureWorker() {
    if (!global.pdfjsLib) throw new Error('pdf.js failed to load');
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }

  function asNumber(obj) {
    if (obj == null) return null;
    if (typeof obj.asNumber === 'function') return obj.asNumber();
    if (typeof obj.numberValue === 'function') return obj.numberValue();
    return null;
  }

  function nameList(obj) {
    if (!obj) return [];
    if (typeof obj.size === 'function' && typeof obj.lookup === 'function' && !obj.dict) {
      var list = [];
      for (var i = 0; i < obj.size(); i++) list.push(String(obj.lookup(i)).replace(/^\//, ''));
      return list;
    }
    return [String(obj).replace(/^\//, '')];
  }

  function yieldTick() {
    return new Promise(function (resolve) { setTimeout(resolve, 16); });
  }

  function canvasToJpeg(canvas, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error('Could not encode JPEG')); return; }
        blob.arrayBuffer().then(function (buf) { resolve(new Uint8Array(buf)); }, reject);
      }, 'image/jpeg', quality);
    });
  }

  function blobToCanvas(blob) {
    return createImageBitmap(blob).then(function (bmp) {
      var canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      canvas.getContext('2d').drawImage(bmp, 0, 0);
      if (bmp.close) bmp.close();
      return canvas;
    });
  }

  function paeth(a, b, c) {
    var p = a + b - c;
    var pa = Math.abs(p - a);
    var pb = Math.abs(p - b);
    var pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }

  function undoPredictor(data, width, height, comps, predictor) {
    if (!predictor || predictor === 1) return data;
    if (predictor < 10) return data;
    var bpp = comps;
    var rowBytes = width * bpp;
    var out = new Uint8Array(rowBytes * height);
    var offset = 0;
    var prev = new Uint8Array(rowBytes);
    for (var y = 0; y < height; y++) {
      if (offset >= data.length) break;
      var filter = data[offset++];
      var cur = new Uint8Array(rowBytes);
      for (var i = 0; i < rowBytes; i++) {
        var raw = data[offset++] || 0;
        var left = i >= bpp ? cur[i - bpp] : 0;
        var up = prev[i];
        var ul = i >= bpp ? prev[i - bpp] : 0;
        var val = raw;
        if (filter === 1) val = (raw + left) & 255;
        else if (filter === 2) val = (raw + up) & 255;
        else if (filter === 3) val = (raw + ((left + up) >> 1)) & 255;
        else if (filter === 4) val = (raw + paeth(left, up, ul)) & 255;
        cur[i] = val;
      }
      out.set(cur, y * rowBytes);
      prev = cur;
    }
    return out;
  }

  function predictorOf(dict) {
    try {
      var parms = dict.lookup(PDFLib.PDFName.of('DecodeParms'));
      if (!parms) return 1;
      if (typeof parms.size === 'function') {
        var first = parms.lookup(0);
        if (first && typeof first.lookup === 'function') parms = first;
      }
      if (!parms.lookup) return 1;
      return asNumber(parms.lookup(PDFLib.PDFName.of('Predictor'))) || 1;
    } catch (e) {
      return 1;
    }
  }

  function colorName(cs) {
    var s = cs ? String(cs) : '';
    if (s.indexOf('DeviceRGB') !== -1) return 'DeviceRGB';
    if (s.indexOf('DeviceGray') !== -1) return 'DeviceGray';
    if (s.indexOf('DeviceCMYK') !== -1) return 'DeviceCMYK';
    return '';
  }

  function pixelsToCanvas(data, w, h, kind) {
    var need = w * h * (kind === 'DeviceGray' ? 1 : kind === 'DeviceCMYK' ? 4 : 3);
    if (data.length < need) return null;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(w, h);
    var px = img.data;
    var i, p = 0;
    if (kind === 'DeviceRGB') {
      for (i = 0; i < w * h; i++) {
        px[p++] = data[i * 3];
        px[p++] = data[i * 3 + 1];
        px[p++] = data[i * 3 + 2];
        px[p++] = 255;
      }
    } else if (kind === 'DeviceGray') {
      for (i = 0; i < w * h; i++) {
        px[p++] = data[i];
        px[p++] = data[i];
        px[p++] = data[i];
        px[p++] = 255;
      }
    } else {
      for (i = 0; i < w * h; i++) {
        var c = data[i * 4] / 255;
        var m = data[i * 4 + 1] / 255;
        var y = data[i * 4 + 2] / 255;
        var k = data[i * 4 + 3] / 255;
        px[p++] = 255 * (1 - c) * (1 - k);
        px[p++] = 255 * (1 - m) * (1 - k);
        px[p++] = 255 * (1 - y) * (1 - k);
        px[p++] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  function imageStreamToCanvas(obj) {
    var dict = obj.dict;
    var filters = nameList(dict.lookup(PDFLib.PDFName.of('Filter')));
    var w = asNumber(dict.lookup(PDFLib.PDFName.of('Width')));
    var h = asNumber(dict.lookup(PDFLib.PDFName.of('Height')));
    if (!w || !h) return Promise.resolve(null);
    if (filters.length === 1 && filters[0] === 'DCTDecode') {
      return blobToCanvas(new Blob([obj.contents], { type: 'image/jpeg' })).catch(function () { return null; });
    }
    if (filters.length === 1 && filters[0] === 'FlateDecode') {
      var bpc = asNumber(dict.lookup(PDFLib.PDFName.of('BitsPerComponent')));
      if (bpc && bpc !== 8) return Promise.resolve(null);
      var kind = colorName(dict.lookup(PDFLib.PDFName.of('ColorSpace')));
      if (!kind) return Promise.resolve(null);
      var raw;
      try { raw = PDFLib.decodePDFRawStream(obj); }
      catch (e) { return Promise.resolve(null); }
      var comps = kind === 'DeviceGray' ? 1 : kind === 'DeviceCMYK' ? 4 : 3;
      var pixels = undoPredictor(raw, w, h, comps, predictorOf(dict));
      return Promise.resolve(pixelsToCanvas(pixels, w, h, kind));
    }
    return Promise.resolve(null);
  }

  function computeTarget(w, h, preset) {
    var tw = Math.max(1, Math.round(w * preset.scale));
    var th = Math.max(1, Math.round(h * preset.scale));
    var edge = Math.max(tw, th);
    if (edge > preset.maxEdge) {
      var f = preset.maxEdge / edge;
      tw = Math.max(1, Math.round(tw * f));
      th = Math.max(1, Math.round(th * f));
    }
    return { width: Math.min(tw, w), height: Math.min(th, h) };
  }

  function resizeCanvas(canvas, w, h) {
    if (canvas.width === w && canvas.height === h) return canvas;
    var next = document.createElement('canvas');
    next.width = w;
    next.height = h;
    var ctx = next.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, w, h);
    return next;
  }

  function shrinkMask(pdf, dict) {
    var sm = dict.get(PDFLib.PDFName.of('SMask'));
    if (!(sm instanceof PDFLib.PDFRef)) return;
    var tinyDict = pdf.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: 1,
      Height: 1,
      ColorSpace: 'DeviceGray',
      BitsPerComponent: 8,
      Length: 1
    });
    pdf.context.assign(sm, PDFLib.PDFRawStream.of(tinyDict, new Uint8Array([255])));
    dict.delete(PDFLib.PDFName.of('SMask'));
  }

  function writeJpeg(pdf, ref, dict, jpeg, w, h) {
    shrinkMask(pdf, dict);
    dict.set(PDFLib.PDFName.of('Width'), PDFLib.PDFNumber.of(w));
    dict.set(PDFLib.PDFName.of('Height'), PDFLib.PDFNumber.of(h));
    dict.set(PDFLib.PDFName.of('BitsPerComponent'), PDFLib.PDFNumber.of(8));
    dict.set(PDFLib.PDFName.of('ColorSpace'), PDFLib.PDFName.of('DeviceRGB'));
    dict.set(PDFLib.PDFName.of('Filter'), PDFLib.PDFName.of('DCTDecode'));
    dict.set(PDFLib.PDFName.of('Length'), PDFLib.PDFNumber.of(jpeg.length));
    ['DecodeParms', 'Mask', 'Intent', 'ImageMask', 'Decode'].forEach(function (key) {
      dict.delete(PDFLib.PDFName.of(key));
    });
    pdf.context.assign(ref, PDFLib.PDFRawStream.of(dict, jpeg));
  }

  function refKey(ref) {
    return ref && ref.tag ? String(ref.objectNumber) + ' ' + String(ref.generationNumber) : String(ref);
  }

  async function smartCompress(bytes, preset) {
    if (!global.PDFLib) throw new Error('pdf-lib failed to load');
    var pdf = await PDFLib.PDFDocument.load(copyBytes(bytes), { updateMetadata: false, ignoreEncryption: true });
    var entries = pdf.context.enumerateIndirectObjects().slice();
    var masks = {};
    entries.forEach(function (pair) {
      var obj = pair[1];
      if (!(obj instanceof PDFLib.PDFRawStream)) return;
      var sm = obj.dict.get(PDFLib.PDFName.of('SMask'));
      if (sm instanceof PDFLib.PDFRef) masks[refKey(sm)] = true;
    });
    var changed = false;
    for (var i = 0; i < entries.length; i++) {
      var ref = entries[i][0];
      var obj = entries[i][1];
      try {
        if (!(obj instanceof PDFLib.PDFRawStream)) continue;
        if (masks[refKey(ref)]) continue;
        var subtype = obj.dict.lookup(PDFLib.PDFName.of('Subtype'));
        if (!subtype || String(subtype) !== '/Image') continue;
        var maskFlag = obj.dict.lookup(PDFLib.PDFName.of('ImageMask'));
        if (maskFlag && String(maskFlag) === 'true') continue;
        var smask = obj.dict.get(PDFLib.PDFName.of('SMask'));
        if (smask && obj.contents.byteLength < 180000) continue;
        var canvas = await imageStreamToCanvas(obj);
        if (!canvas) continue;
        var target = computeTarget(canvas.width, canvas.height, preset);
        var resized = resizeCanvas(canvas, target.width, target.height);
        var jpeg = await canvasToJpeg(resized, preset.quality);
        if (jpeg.byteLength >= obj.contents.byteLength * 0.97) continue;
        writeJpeg(pdf, ref, obj.dict, jpeg, target.width, target.height);
        changed = true;
      } catch (e) { /* leave this image alone */ }
    }
    if (!changed) return null;
    var plain = await pdf.save({ useObjectStreams: false, addDefaultPage: false });
    var packed = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
    var best = plain.length <= packed.length ? plain : packed;
    if (best.length >= bytes.byteLength) return null;
    return best;
  }

  async function rasterize(bytes, scale, quality) {
    ensureWorker();
    var task = pdfjsLib.getDocument({ data: copyBytes(bytes) });
    var doc = await task.promise;
    var out = await PDFLib.PDFDocument.create();
    for (var i = 1; i <= doc.numPages; i++) {
      var page = await doc.getPage(i);
      var viewport = page.getViewport({ scale: scale });
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      var ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      var jpeg = await canvasToJpeg(canvas, quality);
      var img = await out.embedJpg(jpeg);
      var pt = page.getViewport({ scale: 1 });
      var pdfPage = out.addPage([pt.width, pt.height]);
      pdfPage.drawImage(img, { x: 0, y: 0, width: pt.width, height: pt.height });
      await yieldTick();
    }
    await doc.destroy();
    return out.save();
  }

  async function compressPdf(pdfBytes, options) {
    var level = options.level;
    if (level === 100) return { bytes: copyBytes(pdfBytes), method: 'full' };
    var limit = options.maxBytes != null ? options.maxBytes : pdfBytes.byteLength;
    var ladder = LADDERS[level] || LADDERS[50];
    for (var i = 0; i < ladder.length; i++) {
      var smart = await smartCompress(pdfBytes, ladder[i]);
      if (smart && smart.byteLength < limit) return { bytes: smart, method: 'images' };
      await yieldTick();
    }
    var rasters = RASTERS[level] || RASTERS[50];
    for (var r = 0; r < rasters.length; r++) {
      var raster = await rasterize(pdfBytes, rasters[r].scale, rasters[r].quality);
      if (raster.byteLength < limit) return { bytes: raster, method: 'raster' };
    }
    var scale = rasters[rasters.length - 1].scale;
    var quality = 0.4;
    var best = null;
    for (var n = 0; n < 6; n++) {
      var attempt = await rasterize(pdfBytes, scale, quality);
      if (!best || attempt.byteLength < best.byteLength) best = attempt;
      if (attempt.byteLength < limit) return { bytes: attempt, method: 'raster' };
      if (quality > 0.32) quality -= 0.05;
      else scale = Math.max(0.6, scale * 0.84);
    }
    if (best && best.byteLength < limit) return { bytes: best, method: 'raster' };
    throw new Error('Could not make the ' + level + '% file smaller');
  }

  async function computeVariants(pdfBytes, onProgress) {
    var source = copyBytes(pdfBytes);
    var previous = Infinity;
    var results = [];
    for (var i = 0; i < LEVELS.length; i++) {
      var level = LEVELS[i];
      if (onProgress) onProgress({ level: level, status: 'loading' });
      var result = await compressPdf(source, {
        level: level,
        maxBytes: previous === Infinity ? undefined : previous
      });
      if (result.bytes.byteLength >= previous) {
        throw new Error('The ' + level + '% file was not smaller than the one above it');
      }
      previous = result.bytes.byteLength;
      var info = {
        level: level,
        status: 'ready',
        bytes: result.bytes,
        size: result.bytes.byteLength,
        method: result.method
      };
      results.push(info);
      if (onProgress) onProgress(info);
      await yieldTick();
    }
    return results;
  }

  function formatMB(bytes) {
    var mb = bytes / (1024 * 1024);
    if (mb >= 10) return mb.toFixed(1) + ' MB';
    if (mb >= 1) return mb.toFixed(1) + ' MB';
    if (mb >= 0.1) return mb.toFixed(2) + ' MB';
    return mb.toFixed(3) + ' MB';
  }

  function formatSaving(size, baseline) {
    if (!baseline) return '';
    var pct = Math.round((1 - size / baseline) * 100);
    if (pct > 0) return 'saves ' + pct + '%';
    if (pct < 0) return Math.abs(pct) + '% larger';
    return 'same size';
  }

  function methodLabel(method) {
    if (method === 'images') return 'Images recompressed, text stays sharp';
    if (method === 'raster') return 'Rebuilt as images, still readable';
    return 'Full quality, vector text';
  }

  global.PdfCompress = {
    LEVELS: LEVELS,
    compressPdf: compressPdf,
    computeVariants: computeVariants,
    formatMB: formatMB,
    formatSaving: formatSaving,
    methodLabel: methodLabel
  };
})(window);
