/* Text from PDFs and photos, then the passages that match the fields.
   Long notes are embedded with MiniLM and ranked by cosine similarity.
   Short notes are kept whole. */
(function (global) {
  var workerPromise = null;
  var embedderPromise = null;

  function pdfjs() {
    if (!global.pdfjsLib) throw new Error('pdf.js is not loaded');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
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

  function ocrWorker() {
    if (workerPromise) return workerPromise;
    if (!global.Tesseract) {
      workerPromise = Promise.reject(new Error('OCR is not loaded'));
      return workerPromise;
    }
    workerPromise = Tesseract.createWorker('eng');
    workerPromise.catch(function () { workerPromise = null; });
    return workerPromise;
  }

  async function imageText(bytes, mime) {
    var worker = await ocrWorker();
    var blob = new Blob([bytes], { type: mime || 'image/png' });
    var url = URL.createObjectURL(blob);
    try {
      var result = await worker.recognize(url);
      return result && result.data && result.data.text ? result.data.text : '';
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function wordBoxes(source) {
    var worker = await ocrWorker();
    var result = await worker.recognize(source);
    var words = result && result.data && result.data.words ? result.data.words : [];
    return words.filter(function (word) {
      return word && word.text && String(word.text).trim() && (word.confidence == null || word.confidence >= 35);
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
    chunks: chunks,
    retrieve: retrieve
  };
})(window);
