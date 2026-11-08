/* Text from PDFs and photos, then the passages that match the fields.
   Long notes are embedded with MiniLM and ranked by cosine similarity.
   Short notes are kept whole. */
(function (global) {
  var workerPromise = null;
  var embedderPromise = null;

  function pdfjs() {
    if (!global.pdfjsLib) throw new Error('pdf.js is not loaded');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf/pdf.worker.min.js', global.location.href).href;
    return pdfjsLib;
  }

  async function textLayer(bytes) {
    var pdf = await pdfjs().getDocument({ data: bytes.slice(0) }).promise;
    var parts = [];
    var pages = Math.min(pdf.numPages, 12);
    for (var i = 1; i <= pages; i++) {
      var page = await pdf.getPage(i);
      var content = await page.getTextContent();
      var rows = [];
      content.items.forEach(function (item) {
        if (!item.str || !String(item.str).trim()) return;
        var y = item.transform ? item.transform[5] : 0;
        var row = null;
        for (var r = 0; r < rows.length; r++) {
          if (Math.abs(rows[r].y - y) < 3) { row = rows[r]; break; }
        }
        if (!row) {
          row = { y: y, parts: [] };
          rows.push(row);
        }
        row.parts.push(item.str);
      });
      rows.sort(function (a, b) { return b.y - a.y; });
      var line = rows.map(function (row) { return row.parts.join(' ').trim(); }).filter(Boolean).join('\n');
      if (line) parts.push(line);
    }
    return parts.join('\n');
  }

  function vendorBase() {
    return new URL('vendor/tesseract/', global.location.href).href;
  }

  function ocrWorker() {
    if (workerPromise) return workerPromise;
    if (!global.Tesseract) {
      workerPromise = Promise.reject(new Error('OCR is not loaded'));
      return workerPromise;
    }
    var base = vendorBase();
    workerPromise = Tesseract.createWorker('eng', 1, {
      workerPath: base + 'worker.min.js',
      corePath: base + 'tesseract-core-simd-lstm.wasm.js',
      langPath: base.replace(/\/$/, ''),
      gzip: true,
      cacheMethod: 'none'
    });
    workerPromise.catch(function () { workerPromise = null; });
    return workerPromise;
  }

  function stretchCanvas(canvas) {
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = image.data;
    var samples = [];
    for (var i = 0; i < data.length; i += 32) samples.push(0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]);
    samples.sort(function (a, b) { return a - b; });
    var lo = samples[Math.floor(samples.length * 0.05)] || 0;
    var hi = samples[Math.floor(samples.length * 0.92)] || 255;
    if (hi - lo < 48) return canvas;
    var span = hi - lo;
    for (var p = 0; p < data.length; p += 4) {
      var luma = 0.3 * data[p] + 0.59 * data[p + 1] + 0.11 * data[p + 2];
      var next = Math.max(0, Math.min(255, (luma - lo) / span * 255));
      data[p] = data[p + 1] = data[p + 2] = next;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  function rowScore(canvas) {
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    var w = canvas.width;
    var h = canvas.height;
    var total = 0;
    for (var y = 0; y < h; y += 2) {
      var ink = 0;
      for (var x = 0; x < w; x += 2) {
        if (data[(y * w + x) * 4] < 140) ink++;
      }
      total += ink * ink;
    }
    return total;
  }

  function rotateCanvas(canvas, deg) {
    var rad = deg * Math.PI / 180;
    var sin = Math.abs(Math.sin(rad));
    var cos = Math.abs(Math.cos(rad));
    var out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(canvas.width * cos + canvas.height * sin));
    out.height = Math.max(1, Math.round(canvas.width * sin + canvas.height * cos));
    var ctx = out.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return out;
  }

  function prepareOcr(canvas) {
    var small = document.createElement('canvas');
    var scale = canvas.width > 480 ? 480 / canvas.width : 1;
    small.width = Math.max(1, Math.round(canvas.width * scale));
    small.height = Math.max(1, Math.round(canvas.height * scale));
    small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
    var best = 0;
    var bestScore = rowScore(small);
    for (var deg = -3; deg <= 3; deg += 0.5) {
      if (!deg) continue;
      var score = rowScore(rotateCanvas(small, deg));
      if (score > bestScore) { bestScore = score; best = deg; }
    }
    var turned = best ? rotateCanvas(canvas, best) : canvas;
    return stretchCanvas(turned);
  }

  async function imageText(bytes, mime) {
    var worker = await ocrWorker();
    var bmp = await createImageBitmap(new Blob([bytes.slice(0)], { type: mime || 'image/png' }));
    var maxW = 1600;
    var scale = bmp.width > maxW ? maxW / bmp.width : 1;
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    if (bmp.close) bmp.close();
    var ready = prepareOcr(canvas);
    var blob = await new Promise(function (resolve) { ready.toBlob(resolve, 'image/png'); });
    try { await worker.setParameters({ tessedit_pageseg_mode: '6' }); } catch (err) {}
    var result = await worker.recognize(blob);
    var text = result && result.data && result.data.text ? result.data.text : '';
    if (text.trim()) return text;
    try { await worker.setParameters({ tessedit_pageseg_mode: '3' }); } catch (err) {}
    result = await worker.recognize(blob);
    return result && result.data && result.data.text ? result.data.text : '';
  }

  async function wordBoxes(source, psm, opts) {
    var worker = await ocrWorker();
    if (psm) {
      try { await worker.setParameters({ tessedit_pageseg_mode: String(psm) }); } catch (err) {}
    }
    var timer;
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        reject(new Error('Reading the words took too long.'));
      }, 25000);
    });
    var result;
    try {
      result = await Promise.race([worker.recognize(source), timeout]);
    } catch (err) {
      try { if (worker.terminate) await worker.terminate(); } catch (e) {}
      workerPromise = null;
      throw err;
    } finally {
      clearTimeout(timer);
    }
    var words = result && result.data && result.data.words ? result.data.words : [];
    var minConfidence = opts && opts.minConfidence != null ? opts.minConfidence : 35;
    return words.filter(function (word) {
      return word && word.text && String(word.text).trim() && (word.confidence == null || word.confidence >= minConfidence);
    });
  }

  async function ocrPdf(bytes) {
    var pdf = await pdfjs().getDocument({ data: bytes.slice(0) }).promise;
    var parts = [];
    var pages = Math.min(pdf.numPages, 3);
    for (var i = 1; i <= pages; i++) {
      var page = await pdf.getPage(i);
      var viewport = page.getViewport({ scale: 1.6 });
      var canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
      var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
      var buf = new Uint8Array(await blob.arrayBuffer());
      parts.push(await imageText(buf, 'image/png'));
    }
    return parts.join('\n');
  }

  function linesFromWords(words) {
    var items = (words || []).map(function (word) {
      var box = word.bbox || {};
      return {
        text: String(word.text || '').trim(),
        x0: box.x0 || 0,
        y0: box.y0 || 0,
        x1: box.x1 || box.x0 || 0,
        y1: box.y1 || box.y0 || 0,
        confidence: word.confidence == null ? null : word.confidence
      };
    }).filter(function (word) {
      return word.text && (word.confidence == null || word.confidence >= 20);
    });
    items.sort(function (a, b) {
      var dy = ((a.y0 + a.y1) / 2) - ((b.y0 + b.y1) / 2);
      if (Math.abs(dy) > 8) return dy;
      return a.x0 - b.x0;
    });
    var lines = [];
    items.forEach(function (word) {
      var mid = (word.y0 + word.y1) / 2;
      var line = lines.length ? lines[lines.length - 1] : null;
      var lineMid = line ? (line.y0 + line.y1) / 2 : 0;
      if (!line || Math.abs(mid - lineMid) > 12) {
        lines.push({ y0: word.y0, y1: word.y1, words: [word] });
      } else {
        line.words.push(word);
        line.y0 = Math.min(line.y0, word.y0);
        line.y1 = Math.max(line.y1, word.y1);
      }
    });
    return {
      items: items,
      text: lines.map(function (line) {
        line.words.sort(function (a, b) { return a.x0 - b.x0; });
        return line.words.map(function (word) { return word.text; }).join(' ').replace(/\s+/g, ' ').trim();
      }).filter(Boolean).join('\n')
    };
  }

  function mapWords(items, scale, pageHeight) {
    return items.map(function (word) {
      return {
        text: word.text,
        confidence: word.confidence,
        x: word.x0 / scale,
        y: pageHeight - (word.y1 / scale),
        w: Math.max(0, word.x1 - word.x0) / scale,
        h: Math.max(0, word.y1 - word.y0) / scale
      };
    });
  }

  async function glyphText(worker, canvas, box) {
    if (!box) return '';
    var pad = 6;
    var width = Math.max(1, (box.x1 || 0) - (box.x0 || 0));
    var height = Math.max(1, (box.y1 || 0) - (box.y0 || 0));
    var crop = document.createElement('canvas');
    crop.width = width + pad * 2;
    crop.height = height + pad * 2;
    var ctx = crop.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, crop.width, crop.height);
    ctx.drawImage(canvas, box.x0 || 0, box.y0 || 0, width, height, pad, pad, width, height);
    try { await worker.setParameters({ tessedit_pageseg_mode: '10' }); } catch (err) {}
    var result = await worker.recognize(crop);
    return result && result.data && result.data.text ? result.data.text.replace(/\s/g, '') : '';
  }

  async function dropDisputedEmails(worker, canvas, words) {
    for (var i = 0; i < (words || []).length; i++) {
      var word = words[i];
      if (!word || !word.symbols || !/@/.test(word.text || '')) continue;
      var at = -1;
      for (var s = 0; s < word.symbols.length; s++) if (word.symbols[s].text === '@') at = s;
      if (at <= 0) continue;
      var prev = word.symbols[at - 1];
      if (!prev || !prev.text || prev.text.length !== 1) continue;
      var again = await glyphText(worker, canvas, prev.bbox);
      if (again && again !== prev.text) word.text = '';
    }
  }

  async function recognizeCanvas(canvas, scale, pageWidth, pageHeight) {
    var worker = await ocrWorker();
    var best = { text: '', items: [] };
    var bestWords = null;
    var modes = ['6', '11'];
    for (var m = 0; m < modes.length; m++) {
      try { await worker.setParameters({ tessedit_pageseg_mode: modes[m] }); } catch (err) {}
      var result = await worker.recognize(canvas);
      var packed = linesFromWords(result && result.data && result.data.words);
      var letters = (packed.text.match(/[A-Za-z]{3,}/g) || []).length;
      var bestLetters = (best.text.match(/[A-Za-z]{3,}/g) || []).length;
      if (letters > bestLetters) {
        best = packed;
        bestWords = result && result.data && result.data.words;
      }
    }
    if (bestWords) {
      await dropDisputedEmails(worker, canvas, bestWords);
      best = linesFromWords(bestWords);
    }
    var packed = best;
    return {
      text: packed.text,
      channel: 'ocr',
      words: mapWords(packed.items, scale, pageHeight),
      transform: {
        kind: 'render-ocr',
        scale: scale,
        pageWidth: pageWidth,
        pageHeight: pageHeight,
        rotationDeg: 0,
        deskew: 'none'
      }
    };
  }

  async function spatialPdf(bytes) {
    var pdf = await pdfjs().getDocument({ data: bytes.slice(0) }).promise;
    var parts = [];
    var words = [];
    var pages = Math.min(pdf.numPages, 2);
    for (var i = 1; i <= pages; i++) {
      var page = await pdf.getPage(i);
      var base = page.getViewport({ scale: 1 });
      var scale = 2;
      var viewport = page.getViewport({ scale: scale });
      var canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
      var seen = await recognizeCanvas(canvas, scale, base.width, base.height);
      if (seen.text) parts.push(seen.text);
      seen.words.forEach(function (word) {
        word.page = i - 1;
        words.push(word);
      });
    }
    return {
      text: parts.join('\n'),
      channel: 'ocr',
      words: words,
      transform: {
        kind: 'render-ocr',
        scale: 2,
        pages: pages,
        rotationDeg: 0,
        deskew: 'none'
      }
    };
  }

  async function spatial(bytes, mime) {
    var isPdf = !mime || mime === 'application/pdf';
    if (!isPdf) {
      var bmp = await createImageBitmap(new Blob([bytes.slice(0)], { type: mime || 'image/png' }));
      var maxW = 1600;
      var scale = bmp.width > maxW ? bmp.width / maxW : 1;
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bmp.width / scale));
      canvas.height = Math.max(1, Math.round(bmp.height / scale));
      canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
      if (bmp.close) bmp.close();
      var pageWidth = canvas.width / 2;
      var pageHeight = canvas.height / 2;
      return recognizeCanvas(canvas, canvas.width / pageWidth, pageWidth, pageHeight);
    }
    var text = await textLayer(bytes);
    if (text.replace(/\s+/g, '').length >= 40) {
      return { text: text, channel: 'text-layer', words: [], transform: { kind: 'pdf-text-layer' } };
    }
    var seen = await spatialPdf(bytes);
    if (text.trim()) seen.text = (text + '\n' + seen.text).trim();
    return seen;
  }

  async function fromPdf(bytes) {
    var text = await textLayer(bytes);
    if (text.replace(/\s+/g, '').length >= 40) return text;
    try {
      var seen = await ocrPdf(bytes);
      return (text + '\n' + seen).trim();
    } catch (err) {
      return text;
    }
  }

  function chunks(text) {
    var clean = String(text || '').replace(/\s+\n/g, '\n').trim();
    if (!clean) return [];
    var size = 650;
    var step = 500;
    var out = [];
    if (clean.length <= size) return [{ text: clean }];
    for (var i = 0; i < clean.length; i += step) {
      out.push({ text: clean.slice(i, i + size) });
      if (i + size >= clean.length) break;
    }
    return out;
  }

  function lexical(text, query) {
    var terms = String(query || '').toLowerCase().split(/[^a-z0-9@.+]+/).filter(function (w) { return w.length > 2; });
    if (!terms.length) return 0;
    var hay = text.toLowerCase();
    var hit = 0;
    terms.forEach(function (term) { if (hay.indexOf(term) !== -1) hit++; });
    return hit / terms.length;
  }

  function embedder() {
    if (embedderPromise) return embedderPromise;
    embedderPromise = import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2').then(function (mod) {
      if (mod.env) {
        mod.env.allowLocalModels = false;
        mod.env.useBrowserCache = true;
      }
      return mod.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    });
    embedderPromise.catch(function () { embedderPromise = null; });
    return embedderPromise;
  }

  async function vector(pipe, text) {
    var out = await pipe(text.slice(0, 800), { pooling: 'mean', normalize: true });
    return out && out.data ? Array.from(out.data) : null;
  }

  function cosine(a, b) {
    var n = Math.min(a.length, b.length);
    var dot = 0;
    for (var i = 0; i < n; i++) dot += a[i] * b[i];
    return dot;
  }

  async function retrieve(text, query) {
    var parts = chunks(text);
    if (parts.length <= 2) return parts.map(function (p) { return p.text; }).join('\n\n');
    var ranked = parts.map(function (part) {
      return { text: part.text, score: lexical(part.text, query) };
    });
    try {
      var pipe = await Promise.race([
        embedder(),
        new Promise(function (_, reject) { setTimeout(function () { reject(new Error('embed-timeout')); }, 20000); })
      ]);
      var qv = await vector(pipe, query);
      if (qv) {
        for (var i = 0; i < parts.length; i++) {
          var cv = await vector(pipe, parts[i].text);
          if (cv) ranked[i].score = 0.25 * ranked[i].score + 0.75 * cosine(qv, cv);
        }
      }
    } catch (err) { /* lexical scores still order the passages */ }
    ranked.sort(function (a, b) { return b.score - a.score; });
    return ranked.slice(0, 3).map(function (p) { return p.text; }).join('\n\n').slice(0, 1800);
  }

  global.FormExtract = {
    fromPdf: fromPdf,
    imageText: imageText,
    wordBoxes: wordBoxes,
    spatial: spatial,
    chunks: chunks,
    retrieve: retrieve
  };
})(window);
