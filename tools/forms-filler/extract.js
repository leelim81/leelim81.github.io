/* Text from PDFs and photos, then the passages that match the fields.
   Long notes are embedded with MiniLM and ranked by cosine similarity.
   Short notes are kept whole. */
(function (global) {
  var workerPromise = null;
  var liveWorker = null;
  var workerLease = null;
  var workerGen = 0;
  var embedderPromise = null;
  var ocrChain = Promise.resolve();
  var readChain = Promise.resolve();
  var reads = [];
  var OCR_BUDGET_MS = 12000;
  var trace = {
    destroyedLoad: 0,
    cancelledRender: 0,
    terminatedWorker: 0,
    spatialInflight: 0,
    peakSpatial: 0,
    ocrInflight: 0,
    peakOcr: 0
  };

  function cancelledError() {
    return new Error('cancelled');
  }

  function budgetError() {
    return new Error('budget');
  }

  function enterSpatial() {
    trace.spatialInflight += 1;
    if (trace.spatialInflight > trace.peakSpatial) trace.peakSpatial = trace.spatialInflight;
  }

  function leaveSpatial() {
    trace.spatialInflight = Math.max(0, trace.spatialInflight - 1);
  }

  function enterOcr() {
    trace.ocrInflight += 1;
    if (trace.ocrInflight > trace.peakOcr) trace.peakOcr = trace.ocrInflight;
  }

  function leaveOcr() {
    trace.ocrInflight = Math.max(0, trace.ocrInflight - 1);
  }

  function openRead() {
    var session = {
      cancelled: false,
      released: false,
      worker: null,
      workerPromise: null,
      loadingTask: null,
      pdf: null,
      renderTask: null,
      waiters: [],
      pagesRead: 0,
      pagesTotal: 0
    };
    reads.push(session);
    return session;
  }

  function dropRead(session) {
    var index = reads.indexOf(session);
    if (index >= 0) reads.splice(index, 1);
  }

  function wake(session) {
    var waiters = session.waiters.splice(0, session.waiters.length);
    waiters.forEach(function (fn) {
      try { fn(); } catch (err) {}
    });
  }

  function terminateWorker(worker) {
    if (!worker || worker.__ffGone) return;
    worker.__ffGone = true;
    try {
      var done = worker.terminate && worker.terminate();
      if (done && done.catch) done.catch(function () {});
    } catch (err) {}
    if (worker === liveWorker) {
      liveWorker = null;
      workerPromise = null;
    }
    trace.terminatedWorker += 1;
  }

  function invalidateWorker() {
    var existing = liveWorker;
    workerGen += 1;
    workerPromise = null;
    liveWorker = null;
    if (existing) terminateWorker(existing);
  }

  function closePdf(session) {
    var renderTask = session.renderTask;
    var loadingTask = session.loadingTask;
    var pdf = session.pdf;
    session.renderTask = null;
    session.loadingTask = null;
    session.pdf = null;
    if (renderTask && renderTask.cancel) {
      try { renderTask.cancel(); trace.cancelledRender += 1; } catch (err) {}
    }
    if (loadingTask && loadingTask.destroy) {
      try { loadingTask.destroy(); trace.destroyedLoad += 1; } catch (err) {}
    }
    if (pdf && pdf.destroy) {
      try {
        var closed = pdf.destroy();
        if (closed && closed.catch) closed.catch(function () {});
      } catch (err) {}
    }
  }

  function releaseLease(session) {
    if (!session) return;
    if (workerLease === session) workerLease = null;
    session.worker = null;
    session.workerPromise = null;
  }

  function cancelRead(session) {
    if (!session || session.released) return;
    session.cancelled = true;
    session.released = true;
    var holds = workerLease === session;
    var pending = session.workerPromise;
    session.worker = null;
    session.workerPromise = null;
    if (holds) {
      workerLease = null;
      invalidateWorker();
    } else if (!workerLease && pending && pending === workerPromise) {
      invalidateWorker();
    }
    closePdf(session);
    wake(session);
    dropRead(session);
  }

  function finishRead(session) {
    if (!session || session.released) return;
    session.released = true;
    session.worker = null;
    session.workerPromise = null;
    session.loadingTask = null;
    session.pdf = null;
    session.renderTask = null;
    dropRead(session);
  }

  function cancelAll() {
    reads.slice().forEach(cancelRead);
  }

  function bind(session, promise) {
    if (session && (session.cancelled || session.released)) return Promise.reject(cancelledError());
    if (!session) return Promise.resolve(promise);
    return new Promise(function (resolve, reject) {
      if (session.cancelled || session.released) {
        reject(cancelledError());
        return;
      }
      var settled = false;
      function finish(fn, value) {
        if (settled) return;
        settled = true;
        var index = session.waiters.indexOf(onCancel);
        if (index >= 0) session.waiters.splice(index, 1);
        fn(value);
      }
      function onCancel() {
        finish(reject, session.reason === 'budget' ? budgetError() : cancelledError());
      }
      session.waiters.push(onCancel);
      Promise.resolve(promise).then(function (value) {
        if (session.cancelled || session.released) finish(reject, cancelledError());
        else finish(resolve, value);
      }, function (err) {
        finish(reject, err);
      });
    });
  }

  function enqueueOcr(work) {
    var run = ocrChain.then(function () { return work(); }, function () { return work(); });
    ocrChain = run.then(function () {}, function () {});
    return run;
  }

  function enqueueRead(work) {
    var run = readChain.then(function () { return work(); }, function () { return work(); });
    readChain = run.then(function () {}, function () {});
    return run;
  }

  async function recognizeBounded(session, worker, source) {
    if (session && (session.cancelled || session.released)) throw cancelledError();
    if (global.__ffHoldOcr) await bind(session, global.__ffHoldOcr);
    var budget = global.__ffOcrBudgetMs > 0 ? global.__ffOcrBudgetMs : OCR_BUDGET_MS;
    var timer;
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () { reject(budgetError()); }, budget);
    });
    enterOcr();
    try {
      return await bind(session, Promise.race([worker.recognize(source), timeout]));
    } catch (err) {
      if (err && err.message === 'budget' && session) cancelRead(session);
      throw err;
    } finally {
      clearTimeout(timer);
      leaveOcr();
    }
  }

  async function applyParams(session, worker, params) {
    if (session && (session.cancelled || session.released)) throw cancelledError();
    enterOcr();
    try {
      await bind(session, worker.setParameters(params));
    } catch (err) {
      if (err && (err.message === 'cancelled' || err.message === 'budget')) throw err;
    } finally {
      leaveOcr();
    }
  }

  function pdfjs() {
    if (!global.pdfjsLib) throw new Error('pdf.js is not loaded');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf/pdf.worker.min.js', global.location.href).href;
    return pdfjsLib;
  }

  function openDocument(bytes) {
    var task = pdfjs().getDocument({ data: bytes.slice(0) });
    if (typeof global.__ffWrapDocument === 'function') {
      var wrapped = global.__ffWrapDocument(task);
      if (wrapped) return wrapped;
    }
    return task;
  }

  function startRender(page, params) {
    var task = page.render(params);
    if (typeof global.__ffWrapRender === 'function') {
      var wrapped = global.__ffWrapRender(task);
      if (wrapped) return wrapped;
    }
    return task;
  }

  async function textLayer(bytes, session) {
    var owned = !session;
    if (!session) session = openRead();
    var task = null;
    var pdf = null;
    try {
    if (session.cancelled || session.released) throw cancelledError();
    task = openDocument(bytes);
    session.loadingTask = task;
    pdf = await bind(session, task.promise);
    session.pdf = pdf;
    session.loadingTask = null;
    var parts = [];
    var total = pdf.numPages || 0;
    var pages = Math.min(total, 12);
    for (var i = 1; i <= pages; i++) {
      if (session.cancelled || session.released) throw cancelledError();
      var page = await bind(session, pdf.getPage(i));
      var content = await bind(session, page.getTextContent());
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
    session.textCovered = pages;
    session.pagesTotal = total;
    return parts.join('\n');
    } finally {
      if (!session.cancelled) {
        try {
          if (pdf && pdf.destroy) {
            var closed = pdf.destroy();
            if (closed && closed.catch) closed.catch(function () {});
          }
        } catch (err) {}
        try { if (!pdf && task && task.destroy) task.destroy(); } catch (err) {}
      }
      if (session.pdf === pdf) session.pdf = null;
      if (session.loadingTask === task) session.loadingTask = null;
      if (owned && !session.released) finishRead(session);
    }
  }

  function vendorBase() {
    return new URL('vendor/tesseract/', global.location.href).href;
  }

  function ocrWorker(session) {
    if (session && (session.cancelled || session.released)) return Promise.reject(cancelledError());
    if (!workerPromise) {
      if (!global.Tesseract) {
        var missing = Promise.reject(new Error('OCR is not loaded'));
        missing.catch(function () {});
        return missing;
      }
      var base = vendorBase();
      var gen = workerGen;
      var options = {
        workerPath: base + 'worker.min.js',
        corePath: base + 'tesseract-core-simd-lstm.wasm.js',
        langPath: base.replace(/\/$/, ''),
        gzip: true,
        cacheMethod: 'none'
      };
      function realWorker() { return Tesseract.createWorker('eng', 1, options); }
      var created = typeof global.__ffCreateWorker === 'function' ? global.__ffCreateWorker(realWorker) : realWorker();
      workerPromise = created.then(function (worker) {
        if (gen !== workerGen) {
          terminateWorker(worker);
          throw cancelledError();
        }
        liveWorker = worker;
        return worker;
      });
      workerPromise.catch(function () {
        if (gen === workerGen) workerPromise = null;
      });
    }
    var pending = workerPromise;
    if (session) session.workerPromise = pending;
    return bind(session, pending).then(function (worker) {
      if (session && (session.cancelled || session.released)) {
        if (!workerLease || workerLease === session) terminateWorker(worker);
        throw cancelledError();
      }
      if (session) {
        session.worker = worker;
        workerLease = session;
      }
      return worker;
    });
  }

  function armDeadline(session) {
    var budgetMs = global.__ffReadBudgetMs > 0 ? global.__ffReadBudgetMs : 15000;
    return setTimeout(function () {
      session.reason = 'budget';
      cancelRead(session);
    }, budgetMs);
  }

  function withDeadline(session, work) {
    var timer = armDeadline(session);
    var job = Promise.resolve().then(work);
    job.catch(function () {});
    return bind(session, job).then(function (value) {
      clearTimeout(timer);
      return value;
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
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
    var session = openRead();
    return enqueueOcr(function () {
      if (session.cancelled || session.released) return Promise.reject(cancelledError());
      return withDeadline(session, async function () {
        if (session.cancelled || session.released) throw cancelledError();
        var worker = await ocrWorker(session);
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
        await applyParams(session, worker, { tessedit_pageseg_mode: '6' });
        var result = await recognizeBounded(session, worker, blob);
        var text = result && result.data && result.data.text ? result.data.text : '';
        if (!text.trim()) {
          worker = await ocrWorker(session);
          await applyParams(session, worker, { tessedit_pageseg_mode: '3' });
          result = await recognizeBounded(session, worker, blob);
          text = result && result.data && result.data.text ? result.data.text : '';
        }
        return text;
      }).then(function (text) {
        releaseLease(session);
        finishRead(session);
        return text;
      }, function (err) {
        releaseLease(session);
        if (!session.released) finishRead(session);
        throw err;
      });
    });
  }

  async function wordBoxes(source, psm, opts) {
    var session = openRead();
    return enqueueOcr(function () {
      if (session.cancelled || session.released) return Promise.reject(cancelledError());
      return withDeadline(session, async function () {
        if (session.cancelled || session.released) throw cancelledError();
        var worker = await ocrWorker(session);
        if (psm) await applyParams(session, worker, { tessedit_pageseg_mode: String(psm) });
        var result = await recognizeBounded(session, worker, source);
        var words = result && result.data && result.data.words ? result.data.words : [];
        var minConfidence = opts && opts.minConfidence != null ? opts.minConfidence : 35;
        return words.filter(function (word) {
          return word && word.text && String(word.text).trim() && (word.confidence == null || word.confidence >= minConfidence);
        });
      }).then(function (words) {
        releaseLease(session);
        finishRead(session);
        return words;
      }, function (err) {
        releaseLease(session);
        if (!session.released) finishRead(session);
        throw err;
      });
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

  async function glyphText(session, worker, canvas, box) {
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
    await applyParams(session, worker, { tessedit_pageseg_mode: '10' });
    var result = await recognizeBounded(session, worker, crop);
    return result && result.data && result.data.text ? result.data.text.replace(/\s/g, '') : '';
  }

  async function dropDisputedEmails(session, worker, canvas, words) {
    for (var i = 0; i < (words || []).length; i++) {
      var word = words[i];
      if (!word || !word.symbols || !/@/.test(word.text || '')) continue;
      var at = -1;
      for (var s = 0; s < word.symbols.length; s++) if (word.symbols[s].text === '@') at = s;
      if (at <= 0) continue;
      var prev = word.symbols[at - 1];
      if (!prev || !prev.text || prev.text.length !== 1) continue;
      var again = await glyphText(session, worker, canvas, prev.bbox);
      if (again && again !== prev.text) word.text = '';
    }
  }

  function grayPixels(data) {
    var src = data.data;
    var gray = new Uint8Array(data.width * data.height);
    for (var i = 0, p = 0; i < src.length; i += 4, p++) {
      gray[p] = Math.round((src[i] * 30 + src[i + 1] * 59 + src[i + 2] * 11) / 100);
    }
    return gray;
  }

  function stretchGray(gray) {
    var hist = new Uint32Array(256);
    for (var i = 0; i < gray.length; i++) hist[gray[i]]++;
    var limit = Math.max(1, gray.length * 0.02);
    var low = 0;
    var high = 255;
    var seen = 0;
    for (var v = 0; v < 256; v++) { seen += hist[v]; if (seen >= limit) { low = v; break; } }
    seen = 0;
    for (var u = 255; u >= 0; u--) { seen += hist[u]; if (seen >= limit) { high = u; break; } }
    if (high <= low + 8) return gray;
    var scale = 255 / (high - low);
    for (var j = 0; j < gray.length; j++) {
      var x = Math.round((gray[j] - low) * scale);
      gray[j] = x < 0 ? 0 : x > 255 ? 255 : x;
    }
    return gray;
  }

  function adaptiveGray(gray, width, height) {
    var radius = 12;
    var bias = 8;
    var stride = width + 1;
    var integ = new Uint32Array(stride * (height + 1));
    for (var y = 1; y <= height; y++) {
      var row = 0;
      for (var x = 1; x <= width; x++) {
        row += gray[(y - 1) * width + (x - 1)];
        integ[y * stride + x] = integ[(y - 1) * stride + x] + row;
      }
    }
    var out = new Uint8Array(gray.length);
    for (var y2 = 0; y2 < height; y2++) {
      var y0 = Math.max(0, y2 - radius);
      var y1 = Math.min(height - 1, y2 + radius);
      for (var x2 = 0; x2 < width; x2++) {
        var x0 = Math.max(0, x2 - radius);
        var x1 = Math.min(width - 1, x2 + radius);
        var area = (x1 - x0 + 1) * (y1 - y0 + 1);
        var sum = integ[(y1 + 1) * stride + (x1 + 1)] - integ[y0 * stride + (x1 + 1)] - integ[(y1 + 1) * stride + x0] + integ[y0 * stride + x0];
        out[y2 * width + x2] = gray[y2 * width + x2] + bias >= sum / area ? 255 : 0;
      }
    }
    return out;
  }

  function paintGray(image, gray) {
    var src = image.data;
    for (var p = 0, i = 0; p < gray.length; p++, i += 4) {
      src[i] = src[i + 1] = src[i + 2] = gray[p];
      src[i + 3] = 255;
    }
    return image;
  }

  function cardVariant(source, spec) {
    var tilt = ((spec.rotate || 0) + (spec.tilt || 0)) * Math.PI / 180;
    var baseW = source.width;
    var baseH = source.height;
    var cos = Math.abs(Math.cos(tilt));
    var sin = Math.abs(Math.sin(tilt));
    var boundW = Math.ceil(baseW * cos + baseH * sin);
    var boundH = Math.ceil(baseW * sin + baseH * cos);
    var scale = boundW < 1400 ? 1400 / boundW : 1;
    if (boundW * scale > 1800) scale = 1800 / boundW;
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(boundW * scale));
    canvas.height = Math.max(1, Math.round(boundH * scale));
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(tilt);
    if (spec.shear) ctx.transform(1, 0, spec.shear, 1, 0, 0);
    ctx.scale(scale, scale);
    ctx.drawImage(source, -baseW / 2, -baseH / 2);
    ctx.restore();
    var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var gray = stretchGray(grayPixels(image));
    if (spec.threshold) gray = adaptiveGray(gray, canvas.width, canvas.height);
    ctx.putImageData(paintGray(image, gray), 0, 0);
    return canvas;
  }

  function cardJobs() {
    return [
      { rotate: 0, tilt: 0, threshold: false, shear: 0 },
      { rotate: 0, tilt: 0, threshold: true, shear: 0 },
      { rotate: 90, tilt: 0, threshold: false, shear: 0 },
      { rotate: 180, tilt: 0, threshold: false, shear: 0 },
      { rotate: 270, tilt: 0, threshold: false, shear: 0 },
      { rotate: 0, tilt: -6, threshold: true, shear: 0 },
      { rotate: 0, tilt: 6, threshold: true, shear: 0 },
      { rotate: 0, tilt: -3, threshold: false, shear: 0 },
      { rotate: 0, tilt: 3, threshold: false, shear: 0 },
      { rotate: 0, tilt: -8, threshold: true, shear: 0 },
      { rotate: 0, tilt: 8, threshold: true, shear: 0 },
      { rotate: 0, tilt: 0, threshold: true, shear: -0.12 },
      { rotate: 0, tilt: 0, threshold: true, shear: 0.12 }
    ];
  }

  function votedCardText(vote) {
    var lines = [];
    if (vote && vote.name) lines.push('Name', vote.name);
    if (vote && vote.nric) lines.push(vote.nric);
    return lines.join('\n');
  }

  async function recognizeCard(session, canvas, scale, pageWidth, pageHeight) {
    return enqueueOcr(async function () {
      try {
        if (session.cancelled || session.released) throw cancelledError();
        if (!global.FormFacts || !FormFacts.identityRead || !FormFacts.identityVote) {
          return recognizePlain(session, canvas, scale, pageWidth, pageHeight);
        }
        var worker = await ocrWorker(session);
        var bag = [];
        var words = [];
        var used = { rotate: 0, tilt: 0 };
        var jobs = cardJobs();
        for (var i = 0; i < jobs.length; i++) {
          if (session.cancelled || session.released) throw cancelledError();
          var variant = cardVariant(canvas, jobs[i]);
          await applyParams(session, worker, { tessedit_pageseg_mode: '6' });
          worker = await ocrWorker(session);
          var result = await recognizeBounded(session, worker, variant);
          var packed = linesFromWords(result && result.data && result.data.words);
          var read = FormFacts.identityRead(packed.text, mapWords(packed.items, scale, pageHeight));
          bag.push(read);
          if (read.nricValid || (read.name && read.name.split(' ').length >= 3)) {
            words = mapWords(packed.items, scale, pageHeight);
            used = jobs[i];
          }
          var vote = bag.length >= 2 ? FormFacts.identityVote(bag) : null;
          if (vote && vote.nric && vote.name) {
            return {
              text: votedCardText(vote),
              channel: 'ocr',
              words: words,
              identity: vote,
              transform: {
                kind: 'render-ocr',
                scale: scale,
                pageWidth: pageWidth,
                pageHeight: pageHeight,
                rotationDeg: used.rotate + used.tilt,
                deskew: 'search'
              }
            };
          }
        }
        var finalVote = FormFacts.identityVote(bag);
        return {
          text: votedCardText(finalVote),
          channel: 'ocr',
          words: words,
          identity: finalVote,
          transform: {
            kind: 'render-ocr',
            scale: scale,
            pageWidth: pageWidth,
            pageHeight: pageHeight,
            rotationDeg: used.rotate + used.tilt,
            deskew: finalVote && (finalVote.nric || finalVote.name) ? 'search' : 'none'
          }
        };
      } finally {
        releaseLease(session);
      }
    });
  }

  async function recognizePlain(session, canvas, scale, pageWidth, pageHeight) {
    var worker = await ocrWorker(session);
    await applyParams(session, worker, { tessedit_pageseg_mode: '6' });
    worker = await ocrWorker(session);
    var result = await recognizeBounded(session, worker, canvas);
    var packed = linesFromWords(result && result.data && result.data.words);
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

  async function recognizeCanvas(session, canvas, scale, pageWidth, pageHeight) {
    return enqueueOcr(async function () {
    try {
    if (session.cancelled || session.released) throw cancelledError();
    var worker = await ocrWorker(session);
    var best = { text: '', items: [] };
    var bestWords = null;
    var modes = ['6', '11'];
    for (var m = 0; m < modes.length; m++) {
      await applyParams(session, worker, { tessedit_pageseg_mode: modes[m] });
      worker = await ocrWorker(session);
      var result = await recognizeBounded(session, worker, canvas);
      var packed = linesFromWords(result && result.data && result.data.words);
      var letters = (packed.text.match(/[A-Za-z]{3,}/g) || []).length;
      var bestLetters = (best.text.match(/[A-Za-z]{3,}/g) || []).length;
      if (letters > bestLetters) {
        best = packed;
        bestWords = result && result.data && result.data.words;
      }
    }
    if (bestWords) {
      await dropDisputedEmails(session, worker, canvas, bestWords);
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
    } finally {
      releaseLease(session);
    }
    });
  }

  async function spatialPdf(bytes, session) {
    var task = null;
    var pdf = null;
    try {
    if (session.cancelled || session.released) throw cancelledError();
    task = openDocument(bytes);
    session.loadingTask = task;
    pdf = await bind(session, task.promise);
    session.pdf = pdf;
    session.loadingTask = null;
    var parts = [];
    var words = [];
    var total = pdf.numPages || 0;
    var pages = Math.min(total, 2);
    for (var i = 1; i <= pages; i++) {
      if (session.cancelled || session.released) throw cancelledError();
      var page = await bind(session, pdf.getPage(i));
      var base = page.getViewport({ scale: 1 });
      var scale = 2;
      var viewport = page.getViewport({ scale: scale });
      var canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      var renderTask = startRender(page, { canvasContext: canvas.getContext('2d'), viewport: viewport });
      session.renderTask = renderTask;
      await bind(session, renderTask.promise);
      session.renderTask = null;
      var seen = await recognizeCanvas(session, canvas, scale, base.width, base.height);
      if (seen.text) parts.push(seen.text);
      seen.words.forEach(function (word) {
        word.page = i - 1;
        words.push(word);
      });
    }
    session.ocrCovered = pages;
    session.usedOcr = true;
    session.pagesTotal = total;
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
    } finally {
      if (session && !session.cancelled) {
        try { if (session.renderTask && session.renderTask.cancel) session.renderTask.cancel(); } catch (err) {}
        session.renderTask = null;
        try {
          if (pdf && pdf.destroy) {
            var closed = pdf.destroy();
            if (closed && closed.catch) closed.catch(function () {});
          }
        } catch (err) {}
        try { if (!pdf && task && task.destroy) task.destroy(); } catch (err) {}
      }
      if (session && session.pdf === pdf) session.pdf = null;
      if (session && session.loadingTask === task) session.loadingTask = null;
    }
  }

  function withUnread(session, value) {
    var covered = session.usedOcr ? session.ocrCovered : session.textCovered;
    if (value && session.pagesTotal > (covered || 0)) {
      value.unread = 'Read ' + (covered || 0) + ' of ' + session.pagesTotal + ' pages. The rest was not read.';
    }
    return value;
  }

  async function spatial(bytes, mime, session) {
    var read = session || openRead();
    return enqueueRead(function () {
      if (read.cancelled || read.released) return Promise.reject(cancelledError());
      var budgetMs = global.__ffReadBudgetMs > 0 ? global.__ffReadBudgetMs : 15000;
      var timer = setTimeout(function () {
        read.reason = 'budget';
        cancelRead(read);
      }, budgetMs);
      enterSpatial();
      var job = Promise.resolve().then(function () { return spatialNow(bytes, mime, read); });
      job.catch(function () {});
      return bind(read, job).then(function (value) {
        clearTimeout(timer);
        leaveSpatial();
        var unread = withUnread(read, value);
        finishRead(read);
        return unread;
      }, function (err) {
        clearTimeout(timer);
        leaveSpatial();
        if (!read.released) finishRead(read);
        throw err;
      });
    });
  }

  async function spatialNow(bytes, mime, session) {
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
      if (session.cancelled || session.released) throw cancelledError();
      var pageWidth = canvas.width / 2;
      var pageHeight = canvas.height / 2;
      session.textCovered = 1;
      session.pagesTotal = 1;
      return recognizeCard(session, canvas, canvas.width / pageWidth, pageWidth, pageHeight);
    }
    var text = await textLayer(bytes, session);
    if (text.replace(/\s+/g, '').length >= 40) {
      return { text: text, channel: 'text-layer', words: [], transform: { kind: 'pdf-text-layer' } };
    }
    var seen = await spatialPdf(bytes, session);
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
    openRead: openRead,
    cancelRead: cancelRead,
    cancelAll: cancelAll,
    cancelOcr: cancelAll,
    trace: function () {
      return {
        destroyedLoad: trace.destroyedLoad,
        cancelledRender: trace.cancelledRender,
        terminatedWorker: trace.terminatedWorker,
        spatialInflight: trace.spatialInflight,
        peakSpatial: trace.peakSpatial,
        ocrInflight: trace.ocrInflight,
        peakOcr: trace.peakOcr
      };
    },
    resetTrace: function () {
      trace.destroyedLoad = 0;
      trace.cancelledRender = 0;
      trace.terminatedWorker = 0;
      trace.spatialInflight = 0;
      trace.peakSpatial = 0;
      trace.ocrInflight = 0;
      trace.peakOcr = 0;
    },
    chunks: chunks,
    retrieve: retrieve
  };
})(window);
