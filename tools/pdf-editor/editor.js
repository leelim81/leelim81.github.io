/* Edit and Sign PDF. The original file lives in IndexedDB; marks live beside it. */
(function () {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  var DB = 'tools-edit-sign-pdf';
  var SIG_KEY = 'tools-saved-signatures';
  var FONTS = ['Caveat', 'Dancing Script', 'Great Vibes', 'Pacifico'];
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var state = {
    fileName: '',
    pdfBytes: null,
    doc: null,
    pages: [],
    zoom: 1,
    current: 0,
    selectedId: null,
    pen: '#16130f',
    sigFont: 'Caveat',
    sigTab: 'draw',
    uploadDataUrl: '',
    strokes: [],
    activeStroke: null,
    activePointer: null,
    drawing: false
  };

  function $(id) { return document.getElementById(id); }
  function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function toast(msg) { if (window.ToolsUI) ToolsUI.toast(msg); }

  function hexToRgb(hex) {
    var h = String(hex || '#1a1612').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    if (!isFinite(n)) n = 0x1a1612;
    return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbGet(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction('kv', 'readonly').objectStore('kv').get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }
  function idbSet(key, value) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function idbClear() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  var saveTimer = 0;
  var saveGen = 0;
  function setSaveStatus(text) {
    var el = $('saveState');
    el.textContent = text || '';
  }
  function scheduleSave() {
    if (!state.pdfBytes) return;
    setSaveStatus('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveNow(); }, 160);
  }
  async function saveNow() {
    if (!state.pdfBytes) return;
    var gen = ++saveGen;
    setSaveStatus('Saving…');
    try {
      var session = {
        fileName: state.fileName,
        zoom: state.zoom,
        current: state.current,
        pages: state.pages.map(function (p) {
          return {
            id: p.id,
            srcIndex: p.srcIndex,
            rotation: p.rotation || 0,
            annotations: p.annotations.map(function (a) { return Object.assign({}, a); })
          };
        })
      };
      await idbSet('pdf', new Uint8Array(state.pdfBytes));
      await idbSet('session', session);
      if (gen !== saveGen) return;
      var el = $('saveState');
      el.dataset.gen = String(Number(el.dataset.gen || 0) + 1);
      setSaveStatus('Saved');
    } catch (err) {
      setSaveStatus('Not saved');
      toast('Could not save in this browser.');
    }
  }
  window.addEventListener('pagehide', function () { if (state.pdfBytes) saveNow(); });

  function showWorkspace() {
    $('empty').hidden = true;
    $('toolbar').hidden = false;
    $('status').hidden = false;
    $('downloadBtn').hidden = false;
    $('startOver').hidden = false;
    $('fileName').textContent = state.fileName || '';
  }
  function showEmpty() {
    $('empty').hidden = false;
    $('toolbar').hidden = true;
    $('status').hidden = true;
    $('downloadBtn').hidden = true;
    $('startOver').hidden = true;
    $('pages').innerHTML = '';
    setSaveStatus('');
  }

  function findAnn(id) {
    for (var i = 0; i < state.pages.length; i++) {
      var ann = state.pages[i].annotations.find(function (a) { return a.id === id; });
      if (ann) return ann;
    }
    return null;
  }
  function currentPage() { return state.pages[state.current] || state.pages[0]; }

  function place(el, ann) {
    el.style.left = (ann.x * 100) + '%';
    el.style.top = (ann.y * 100) + '%';
    el.style.width = (ann.w * 100) + '%';
    el.style.height = (ann.h * 100) + '%';
    if (ann.fontSize) {
      el.style.fontSize = (ann.fontSize * state.zoom) + 'px';
      el.dataset.fontSize = String(ann.fontSize);
    }
    if (ann.color) el.dataset.color = ann.color;
    if (ann.color && (ann.type === 'text' || ann.type === 'date')) el.style.color = ann.color;
    if (ann.color && (ann.type === 'rect' || ann.type === 'ellipse')) el.style.borderColor = ann.color;
  }

  function select(id) {
    state.selectedId = id;
    document.querySelectorAll('.ann.selected').forEach(function (el) { el.classList.remove('selected'); });
    var ann = findAnn(id);
    var bar = $('selectionBar');
    if (!ann) { bar.hidden = true; return; }
    var el = document.querySelector('.ann[data-id="' + CSS.escape(id) + '"]');
    if (el) el.classList.add('selected');
    bar.hidden = false;
    var isText = ann.type === 'text' || ann.type === 'date';
    $('fontSizeWrap').hidden = !isText;
    $('fontSize').value = ann.fontSize || 18;
    $('fontColor').value = toHex(ann.color || '#1a1612');
  }
  function toHex(c) {
    if (!c) return '#1a1612';
    if (c[0] === '#') return c.length === 7 ? c : '#1a1612';
    return '#1a1612';
  }

  function drawOne(rec, ann) {
    var el = document.createElement('div');
    el.className = 'ann ' + ann.type + (ann.id === state.selectedId ? ' selected' : '');
    el.dataset.id = ann.id;
    el.dataset.type = ann.type;
    place(el, ann);

    if (ann.type === 'text' || ann.type === 'date') {
      var grip = document.createElement('button');
      grip.type = 'button';
      grip.className = 'grip';
      grip.setAttribute('aria-label', 'Move text');
      var body = document.createElement('div');
      body.className = 'ann-body';
      body.contentEditable = 'plaintext-only';
      if (body.contentEditable !== 'plaintext-only') body.contentEditable = 'true';
      body.spellcheck = false;
      body.textContent = ann.text || '';
      body.addEventListener('input', function () {
        ann.text = body.innerText.replace(/\u00a0/g, ' ').replace(/\n$/, '');
        fitTextHeight(el, ann);
        scheduleSave();
      });
      el.append(grip, body);
    } else if (ann.dataUrl) {
      var img = document.createElement('img');
      img.src = ann.dataUrl;
      img.alt = ann.type === 'signature' ? 'Signature' : 'Placed image';
      img.draggable = false;
      el.appendChild(img);
    }

    ['nw', 'ne', 'sw', 'se'].forEach(function (dir) {
      var handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'handle ' + dir;
      handle.dataset.dir = dir;
      handle.setAttribute('aria-label', 'Resize');
      el.appendChild(handle);
    });
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'ann-del';
    del.setAttribute('aria-label', 'Delete item');
    del.textContent = '×';
    del.addEventListener('click', function (e) {
      e.stopPropagation();
      removeAnn(ann.id);
    });
    el.appendChild(del);

    el.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      if (e.target.closest('.ann-del')) return;
      var handle = e.target.closest('.handle');
      var grip = e.target.closest('.grip');
      select(ann.id);
      if (handle) {
        e.preventDefault();
        e.stopPropagation();
        startResize(e, el, ann, handle.dataset.dir);
        return;
      }
      var isText = ann.type === 'text' || ann.type === 'date';
      if (isText && !grip) return;
      e.preventDefault();
      startMove(e, el, ann);
    });

    rec.layer.appendChild(el);
    return el;
  }

  function fitTextHeight(el, ann) {
    var body = el.querySelector('.ann-body');
    if (!body || !el.parentElement) return;
    var pageH = el.parentElement.clientHeight || 1;
    el.style.height = 'auto';
    var px = Math.max(body.scrollHeight, (ann.fontSize || 16) * state.zoom * 1.3);
    ann.h = clamp(px / pageH, 0.03, 0.95);
    el.style.height = (ann.h * 100) + '%';
  }

  function startMove(e, el, ann) {
    var rect = el.parentElement.getBoundingClientRect();
    var origin = { x: e.clientX, y: e.clientY, ax: ann.x, ay: ann.y };
    function move(ev) {
      ann.x = clamp(origin.ax + (ev.clientX - origin.x) / rect.width, 0, 1 - ann.w);
      ann.y = clamp(origin.ay + (ev.clientY - origin.y) / rect.height, 0, 1 - ann.h);
      place(el, ann);
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      saveNow();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function startResize(e, el, ann, dir) {
    var rect = el.parentElement.getBoundingClientRect();
    var origin = { x: e.clientX, y: e.clientY, ax: ann.x, ay: ann.y, aw: ann.w, ah: ann.h };
    function move(ev) {
      var dx = (ev.clientX - origin.x) / rect.width;
      var dy = (ev.clientY - origin.y) / rect.height;
      var x = origin.ax, y = origin.ay, w = origin.aw, h = origin.ah;
      if (dir.indexOf('e') !== -1) w = origin.aw + dx;
      if (dir.indexOf('s') !== -1) h = origin.ah + dy;
      if (dir.indexOf('w') !== -1) { x = origin.ax + dx; w = origin.aw - dx; }
      if (dir.indexOf('n') !== -1) { y = origin.ay + dy; h = origin.ah - dy; }
      w = Math.max(0.04, w);
      h = Math.max(0.03, h);
      if (ann.pixelAspect) {
        h = (w * (rect.width / rect.height)) / ann.pixelAspect;
      }
      if (x < 0) { w += x; x = 0; }
      if (y < 0) { h += y; y = 0; }
      if (x + w > 1) w = 1 - x;
      if (y + h > 1) h = 1 - y;
      ann.x = x; ann.y = y; ann.w = Math.max(0.04, w); ann.h = Math.max(0.03, h);
      place(el, ann);
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (ann.type === 'text' || ann.type === 'date') fitTextHeight(el, ann);
      saveNow();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function removeAnn(id) {
    state.pages.forEach(function (p) {
      p.annotations = p.annotations.filter(function (a) { return a.id !== id; });
    });
    var el = document.querySelector('.ann[data-id="' + CSS.escape(id) + '"]');
    if (el) el.remove();
    if (state.selectedId === id) select(null);
    saveNow();
  }

  function addAnn(partial) {
    var rec = currentPage();
    if (!rec) return null;
    var ann = Object.assign({
      id: uid(), type: 'text', x: 0.15, y: 0.15, w: 0.4, h: 0.08,
      text: '', fontSize: 18, color: '#1a1612'
    }, partial);
    rec.annotations.push(ann);
    var el = drawOne(rec, ann);
    select(ann.id);
    saveNow();
    return el;
  }

  function updatePageLabel() {
    $('pageLabel').textContent = (state.current + 1) + ' / ' + state.pages.length;
    $('zoomLabel').textContent = Math.round(state.zoom * 100) + '%';
  }

  var pageObserver = null;
  function observePages() {
    if (pageObserver) pageObserver.disconnect();
    pageObserver = new IntersectionObserver(function (entries) {
      var best = entries.filter(function (e) { return e.isIntersecting; })
        .sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; })[0];
      if (!best) return;
      state.current = Number(best.target.dataset.index);
      updatePageLabel();
    }, { root: $('stage'), threshold: [0.45, 0.7] });
    document.querySelectorAll('.page').forEach(function (p) { pageObserver.observe(p); });
  }

  async function renderCanvas(rec) {
    var pdfPage = await state.doc.getPage(rec.srcIndex + 1);
    var total = ((pdfPage.rotate || 0) + (rec.rotation || 0)) % 360;
    var cssVp = pdfPage.getViewport({ scale: state.zoom, rotation: total });
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var vp = pdfPage.getViewport({ scale: state.zoom * dpr, rotation: total });
    rec.el.style.width = cssVp.width + 'px';
    rec.el.style.height = cssVp.height + 'px';
    rec.canvas.width = Math.max(1, Math.floor(vp.width));
    rec.canvas.height = Math.max(1, Math.floor(vp.height));
    rec.canvas.style.width = cssVp.width + 'px';
    rec.canvas.style.height = cssVp.height + 'px';
    if (rec.task) { try { rec.task.cancel(); } catch (e) {} }
    var ctx = rec.canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rec.canvas.width, rec.canvas.height);
    rec.task = pdfPage.render({ canvasContext: ctx, viewport: vp });
    try { await rec.task.promise; }
    catch (err) { if (!err || err.name !== 'RenderingCancelledException') throw err; }
  }

  async function renderAll() {
    var host = $('pages');
    host.innerHTML = '';
    for (var i = 0; i < state.pages.length; i++) {
      var rec = state.pages[i];
      var wrap = document.createElement('article');
      wrap.className = 'page';
      wrap.dataset.index = String(i);
      var canvas = document.createElement('canvas');
      var layer = document.createElement('div');
      layer.className = 'layer';
      wrap.append(canvas, layer);
      host.appendChild(wrap);
      rec.el = wrap;
      rec.canvas = canvas;
      rec.layer = layer;
      layer.addEventListener('pointerdown', function (e) {
        if (e.target === layer) select(null);
      });
      rec.annotations.forEach(function (ann) { drawOne(rec, ann); });
      await renderCanvas(rec);
    }
    updatePageLabel();
    observePages();
  }

  async function setZoom(z) {
    state.zoom = clamp(z, 0.35, 3);
    for (var i = 0; i < state.pages.length; i++) await renderCanvas(state.pages[i]);
    document.querySelectorAll('.ann').forEach(function (el) {
      var ann = findAnn(el.dataset.id);
      if (ann) place(el, ann);
    });
    updatePageLabel();
    scheduleSave();
  }

  async function fitWidth(rerender) {
    if (!state.doc || !state.pages.length) return;
    var rec = state.pages[Math.min(state.current, state.pages.length - 1)];
    var pdfPage = await state.doc.getPage(rec.srcIndex + 1);
    var total = ((pdfPage.rotate || 0) + (rec.rotation || 0)) % 360;
    var base = pdfPage.getViewport({ scale: 1, rotation: total });
    var avail = Math.max(200, $('stage').clientWidth - 36);
    state.zoom = clamp(avail / base.width, 0.35, 2.4);
    if (rerender) await setZoom(state.zoom);
    else updatePageLabel();
  }

  async function loadBytes(bytes, fileName, session) {
    state.pdfBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    state.fileName = fileName || 'document.pdf';
    if (state.doc) { try { await state.doc.destroy(); } catch (e) {} }
    state.doc = await pdfjsLib.getDocument({ data: state.pdfBytes.slice(0) }).promise;
    if (session && session.pages) {
      state.pages = session.pages;
      state.zoom = session.zoom || 1;
      state.current = Math.min(session.current || 0, state.pages.length - 1);
    } else {
      state.pages = [];
      for (var i = 0; i < state.doc.numPages; i++) {
        state.pages.push({ id: uid(), srcIndex: i, rotation: 0, annotations: [] });
      }
      state.current = 0;
      state.zoom = 1;
    }
    state.selectedId = null;
    showWorkspace();
    if (!session) await fitWidth(false);
    await renderAll();
    if (state.pages[state.current] && state.pages[state.current].el) {
      state.pages[state.current].el.scrollIntoView();
    }
  }

  async function loadFile(file) {
    if (!file) return;
    try {
      var buf = await file.arrayBuffer();
      await loadBytes(new Uint8Array(buf), file.name || 'document.pdf', null);
      await saveNow();
    } catch (err) {
      toast('This PDF could not be opened. If it has a password, remove it and try again.');
    }
  }

  function rotCW(a) {
    var x = 1 - (a.y + a.h);
    var y = a.x;
    var w = a.h;
    var h = a.w;
    a.x = x; a.y = y; a.w = w; a.h = h;
  }

  async function rotatePage() {
    var rec = currentPage();
    if (!rec) return;
    rec.rotation = ((rec.rotation || 0) + 90) % 360;
    rec.annotations.forEach(rotCW);
    await renderAll();
    await saveNow();
  }
  async function deletePage() {
    if (state.pages.length < 2) {
      toast('The last page stays. Start over clears the whole file.');
      return;
    }
    if (!confirm('Remove this page from the document?')) return;
    state.pages.splice(state.current, 1);
    state.current = Math.min(state.current, state.pages.length - 1);
    await renderAll();
    await saveNow();
  }
  async function movePage(dir) {
    var i = state.current;
    var j = i + dir;
    if (j < 0 || j >= state.pages.length) return;
    var item = state.pages.splice(i, 1)[0];
    state.pages.splice(j, 0, item);
    state.current = j;
    await renderAll();
    if (state.pages[j].el) state.pages[j].el.scrollIntoView();
    await saveNow();
  }

  function go(delta) {
    if (!state.pages.length) return;
    var next = clamp(state.current + delta, 0, state.pages.length - 1);
    state.current = next;
    state.pages[next].el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    updatePageLabel();
  }

  function dataUrlToBytes(dataUrl) {
    var b64 = dataUrl.split(',')[1] || '';
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function canvasToPng(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error('png')); return; }
        blob.arrayBuffer().then(function (buf) { resolve(new Uint8Array(buf)); }, reject);
      }, 'image/png');
    });
  }
  async function embedDataUrl(out, dataUrl) {
    if (dataUrl.indexOf('image/png') !== -1) return out.embedPng(dataUrlToBytes(dataUrl));
    if (dataUrl.indexOf('image/jpeg') !== -1 || dataUrl.indexOf('image/jpg') !== -1) return out.embedJpg(dataUrlToBytes(dataUrl));
    var bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
    var canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    canvas.getContext('2d').drawImage(bmp, 0, 0);
    if (bmp.close) bmp.close();
    return out.embedPng(await canvasToPng(canvas));
  }
  function canEncode(font, text) {
    try { font.encodeText(text); return true; } catch (e) { return false; }
  }
  function wrapText(text, font, size, maxW) {
    var lines = [];
    String(text || '').split('\n').forEach(function (para) {
      if (!para) { lines.push(''); return; }
      var words = para.split(/\s+/);
      var line = '';
      words.forEach(function (word) {
        var next = line ? line + ' ' + word : word;
        if (line && font.widthOfTextAtSize(next, size) > maxW) {
          lines.push(line);
          line = word;
        } else line = next;
      });
      if (line) lines.push(line);
    });
    return lines;
  }

  async function drawAnn(out, page, font, ann, pw, ph) {
    var x = ann.x * pw;
    var y = ph - (ann.y + ann.h) * ph;
    var w = Math.max(1, ann.w * pw);
    var h = Math.max(1, ann.h * ph);
    if (ann.type === 'whiteout') {
      page.drawRectangle({ x: x, y: y, width: w, height: h, color: PDFLib.rgb(1, 1, 1) });
    } else if (ann.type === 'highlight') {
      page.drawRectangle({
        x: x, y: y, width: w, height: h,
        color: PDFLib.rgb(1, 0.9, 0.2),
        opacity: 0.45,
        blendMode: PDFLib.BlendMode.Multiply
      });
    } else if (ann.type === 'rect') {
      page.drawRectangle({ x: x, y: y, width: w, height: h, borderColor: hexToRgb(ann.color), borderWidth: 1.6 });
    } else if (ann.type === 'ellipse') {
      page.drawEllipse({
        x: x + w / 2, y: y + h / 2,
        xScale: Math.max(1, w / 2), yScale: Math.max(1, h / 2),
        borderColor: hexToRgb(ann.color), borderWidth: 1.6
      });
    } else if (ann.type === 'text' || ann.type === 'date') {
      if (!ann.text) return;
      var size = ann.fontSize || 16;
      var lines = wrapText(ann.text, font, size, Math.max(8, w - 2));
      var ok = lines.every(function (line) { return !line || canEncode(font, line); });
      if (!ok) {
        var scale = 3;
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(2, Math.floor(w * scale));
        canvas.height = Math.max(2, Math.floor(h * scale));
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = ann.color || '#1a1612';
        ctx.font = (size * scale) + 'px Helvetica, Arial, sans-serif';
        ctx.textBaseline = 'top';
        String(ann.text).split('\n').forEach(function (line, i) {
          ctx.fillText(line, 2, i * size * scale * 1.3);
        });
        var img = await out.embedPng(await canvasToPng(canvas));
        page.drawImage(img, { x: x, y: y, width: w, height: h });
        return;
      }
      var baseline = y + h - size * 0.85;
      var lineH = size * 1.3;
      lines.forEach(function (line) {
        if (baseline < y - size) return;
        if (line) page.drawText(line, { x: x + 1, y: baseline, size: size, font: font, color: hexToRgb(ann.color) });
        baseline -= lineH;
      });
    } else if (ann.dataUrl) {
      var embedded = await embedDataUrl(out, ann.dataUrl);
      page.drawImage(embedded, { x: x, y: y, width: w, height: h });
    }
  }

  async function flatten() {
    var src = await PDFLib.PDFDocument.load(state.pdfBytes.slice(0), { ignoreEncryption: true, updateMetadata: false });
    var out = await PDFLib.PDFDocument.create();
    var font = await out.embedFont(PDFLib.StandardFonts.Helvetica);
    for (var i = 0; i < state.pages.length; i++) {
      var rec = state.pages[i];
      var copied = (await out.copyPages(src, [rec.srcIndex]))[0];
      var total = ((copied.getRotation().angle || 0) + (rec.rotation || 0)) % 360;
      copied.setRotation(PDFLib.degrees(total));
      out.addPage(copied);
      var size = copied.getSize();
      for (var a = 0; a < rec.annotations.length; a++) {
        await drawAnn(out, copied, font, rec.annotations[a], size.width, size.height);
      }
    }
    return out.save();
  }

  function openDownload() {
    if (!state.pdfBytes) return;
    $('downloadModal').hidden = false;
    var stem = (state.fileName || 'document').replace(/\.pdf$/i, '');
    PdfSizes.mount($('sizeOptions'), {
      getBytes: flatten,
      nameFor: function (level) {
        return level === 100 ? stem + '-edited.pdf' : stem + '-edited-' + level + '.pdf';
      },
      usageKey: 'pdf-editor'
    });
  }

  function loadSignatures() {
    try { return JSON.parse(localStorage.getItem(SIG_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function storeSignature(dataUrl) {
    var list = loadSignatures().filter(function (s) { return s.dataUrl !== dataUrl; });
    list.unshift({ id: uid(), dataUrl: dataUrl, at: Date.now() });
    list = list.slice(0, 8);
    try { localStorage.setItem(SIG_KEY, JSON.stringify(list)); }
    catch (e) { list.pop(); try { localStorage.setItem(SIG_KEY, JSON.stringify(list)); } catch (err) {} }
    renderSaved();
  }
  function renderSaved() {
    var host = $('savedSigs');
    host.innerHTML = '';
    var list = loadSignatures();
    if (!list.length) return;
    var label = document.createElement('p');
    label.className = 'hint';
    label.textContent = 'Saved on this device';
    host.appendChild(label);
    list.forEach(function (sig) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.title = 'Place this signature';
      var img = document.createElement('img');
      img.src = sig.dataUrl;
      img.alt = 'Saved signature';
      btn.appendChild(img);
      btn.addEventListener('click', function () {
        placeRaster(sig.dataUrl, 'signature');
        closeSig();
      });
      host.appendChild(btn);
    });
  }

  function placeRaster(dataUrl, type) {
    var probe = new Image();
    probe.onload = function () {
      var rec = currentPage();
      if (!rec || !rec.el) return;
      var aspect = probe.naturalWidth / Math.max(1, probe.naturalHeight);
      var nw = type === 'signature' ? 0.34 : 0.42;
      var nh = (nw * rec.el.clientWidth / aspect) / rec.el.clientHeight;
      if (nh > 0.5) { nh = 0.5; nw = (nh * rec.el.clientHeight * aspect) / rec.el.clientWidth; }
      var count = rec.annotations.filter(function (a) { return a.type === type; }).length;
      addAnn({
        type: type,
        text: '',
        dataUrl: dataUrl,
        pixelAspect: aspect,
        x: clamp(0.18 + (count % 3) * 0.06, 0, 0.7),
        y: clamp(0.22 + (count % 4) * 0.08, 0, 0.72),
        w: nw,
        h: nh
      });
    };
    probe.src = dataUrl;
  }

  function sizeSignCanvas(tries) {
    var canvas = $('signCanvas');
    var rect = canvas.getBoundingClientRect();
    if ((rect.width < 2 || rect.height < 2) && (tries || 0) < 12) {
      requestAnimationFrame(function () { sizeSignCanvas((tries || 0) + 1); });
      return;
    }
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var nextW = Math.max(2, Math.floor(rect.width * dpr));
    var nextH = Math.max(2, Math.floor(rect.height * dpr));
    var css = canvas._css;
    var unchanged = css && canvas.width === nextW && canvas.height === nextH &&
      css.dpr === dpr && Math.abs(css.w - rect.width) < 0.5 && Math.abs(css.h - rect.height) < 0.5;
    canvas._css = { w: rect.width, h: rect.height, dpr: dpr };
    if (!unchanged) {
      canvas.width = nextW;
      canvas.height = nextH;
    }
    redrawSign();
  }
  function drawStroke(ctx, stroke) {
    var pts = stroke.points;
    if (!pts || !pts.length) return;
    ctx.fillStyle = stroke.color;
    ctx.strokeStyle = stroke.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, 1.8, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.lineWidth = 2.6;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i].x + pts[i + 1].x) / 2;
      var my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
  }
  function redrawSign() {
    var canvas = $('signCanvas');
    var ctx = canvas.getContext('2d');
    var css = canvas._css || { w: canvas.clientWidth || canvas.width, h: canvas.clientHeight || canvas.height, dpr: 1 };
    ctx.setTransform(css.dpr || 1, 0, 0, css.dpr || 1, 0, 0);
    ctx.clearRect(0, 0, css.w, css.h);
    state.strokes.forEach(function (stroke) { drawStroke(ctx, stroke); });
  }
  function signPoint(e) {
    var r = $('signCanvas').getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp };
  }
  function cropSignature() {
    var canvas = $('signCanvas');
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    var data = ctx.getImageData(0, 0, w, h).data;
    var minX = w, minY = h, maxX = 0, maxY = 0, found = false;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 12) {
          found = true;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) return null;
    var pad = Math.round(8 * (canvas._css ? canvas._css.dpr : 1));
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad);
    maxY = Math.min(h - 1, maxY + pad);
    var cw = maxX - minX + 1;
    var ch = maxY - minY + 1;
    var out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    out.getContext('2d').drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
    return out.toDataURL('image/png');
  }

  function setTab(name) {
    state.sigTab = name;
    ['draw', 'type', 'upload'].forEach(function (tab) {
      $('panel-' + tab).hidden = tab !== name;
      $('tab-' + tab).setAttribute('aria-selected', tab === name ? 'true' : 'false');
    });
    if (name === 'draw') requestAnimationFrame(sizeSignCanvas);
    if (name === 'type') updateTypePreview();
  }
  function openSig() {
    if (!state.pdfBytes) return;
    state.strokes = [];
    state.activeStroke = null;
    state.activePointer = null;
    state.drawing = false;
    $('sigModal').hidden = false;
    setTab('draw');
    renderSaved();
    requestAnimationFrame(function () { requestAnimationFrame(sizeSignCanvas); });
  }
  function closeSig() { $('sigModal').hidden = true; }

  async function updateTypePreview() {
    var text = $('typeName').value || 'Your name';
    var font = state.sigFont;
    try { await document.fonts.load('64px "' + font + '"'); } catch (e) {}
    var canvas = $('typePreview');
    var ctx = canvas.getContext('2d');
    var size = 64;
    ctx.font = '600 ' + size + 'px "' + font + '", cursive';
    var width = Math.ceil(ctx.measureText(text).width + 28);
    canvas.width = Math.max(80, width);
    canvas.height = 100;
    ctx.font = '600 ' + size + 'px "' + font + '", cursive';
    ctx.fillStyle = state.pen;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 12, canvas.height / 2 + 4);
  }
  async function typedDataUrl() {
    var text = $('typeName').value.trim();
    if (!text) return null;
    await updateTypePreview();
    return $('typePreview').toDataURL('image/png');
  }

  function buildFontChoices() {
    var host = $('fontChoices');
    FONTS.forEach(function (name, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = name;
      btn.style.fontFamily = '"' + name + '", cursive';
      btn.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
      btn.addEventListener('click', function () {
        state.sigFont = name;
        host.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
        updateTypePreview();
      });
      host.appendChild(btn);
    });
  }

  async function applySig() {
    var dataUrl = null;
    if (state.sigTab === 'draw') dataUrl = cropSignature();
    else if (state.sigTab === 'type') dataUrl = await typedDataUrl();
    else dataUrl = state.uploadDataUrl;
    if (!dataUrl) {
      toast('Add a signature first.');
      return;
    }
    storeSignature(dataUrl);
    placeRaster(dataUrl, 'signature');
    closeSig();
  }

  function wire() {
    function pick() { $('fileInput').click(); }
    $('openBtn').addEventListener('click', pick);
    $('openBtnBar').addEventListener('click', pick);
    $('fileInput').addEventListener('change', function () {
      var file = $('fileInput').files && $('fileInput').files[0];
      $('fileInput').value = '';
      if (file) loadFile(file);
    });
    $('addText').addEventListener('click', function () {
      var el = addAnn({ type: 'text', text: '', x: 0.14, y: 0.14, w: 0.46, h: 0.08, fontSize: 18, color: '#1a1612' });
      if (el) {
        var body = el.querySelector('.ann-body');
        if (body) body.focus();
      }
    });
    $('addWhiteout').addEventListener('click', function () {
      addAnn({ type: 'whiteout', x: 0.2, y: 0.3, w: 0.45, h: 0.08 });
    });
    $('addHighlight').addEventListener('click', function () {
      addAnn({ type: 'highlight', x: 0.18, y: 0.42, w: 0.5, h: 0.06 });
    });
    $('addRect').addEventListener('click', function () {
      addAnn({ type: 'rect', x: 0.22, y: 0.22, w: 0.28, h: 0.16, color: '#1a1612' });
    });
    $('addEllipse').addEventListener('click', function () {
      addAnn({ type: 'ellipse', x: 0.28, y: 0.28, w: 0.24, h: 0.16, color: '#c23b22' });
    });
    $('addImage').addEventListener('click', function () { $('imageInput').click(); });
    $('imageInput').addEventListener('change', async function () {
      var file = $('imageInput').files && $('imageInput').files[0];
      $('imageInput').value = '';
      if (!file) return;
      try {
        var bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        var maxEdge = 1600;
        var scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bmp.width * scale));
        canvas.height = Math.max(1, Math.round(bmp.height * scale));
        canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
        if (bmp.close) bmp.close();
        placeRaster(canvas.toDataURL('image/png'), 'image');
      } catch (err) { toast('That image could not be placed.'); }
    });
    $('addSignature').addEventListener('click', openSig);
    $('addDate').addEventListener('click', function () {
      var d = new Date();
      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      var el = addAnn({
        type: 'date',
        text: d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear(),
        fontSize: 14,
        color: '#1a1612',
        x: 0.56,
        y: 0.86,
        w: 0.36,
        h: 0.05
      });
      if (el) fitTextHeight(el, findAnn(el.dataset.id));
    });
    $('rotatePage').addEventListener('click', rotatePage);
    $('deletePage').addEventListener('click', deletePage);
    $('movePageUp').addEventListener('click', function () { movePage(-1); });
    $('movePageDown').addEventListener('click', function () { movePage(1); });
    $('prevPage').addEventListener('click', function () { go(-1); });
    $('nextPage').addEventListener('click', function () { go(1); });
    $('zoomOut').addEventListener('click', function () { setZoom(state.zoom / 1.15); });
    $('zoomIn').addEventListener('click', function () { setZoom(state.zoom * 1.15); });
    $('fitWidth').addEventListener('click', function () { fitWidth(true); });
    $('deleteAnn').addEventListener('click', function () { if (state.selectedId) removeAnn(state.selectedId); });
    $('fontSize').addEventListener('input', function () {
      var ann = findAnn(state.selectedId);
      if (!ann) return;
      ann.fontSize = clamp(Number($('fontSize').value) || 18, 8, 96);
      var el = document.querySelector('.ann[data-id="' + CSS.escape(ann.id) + '"]');
      if (el) { place(el, ann); fitTextHeight(el, ann); }
      scheduleSave();
    });
    $('fontColor').addEventListener('input', function () {
      var ann = findAnn(state.selectedId);
      if (!ann) return;
      ann.color = $('fontColor').value;
      var el = document.querySelector('.ann[data-id="' + CSS.escape(ann.id) + '"]');
      if (el) place(el, ann);
      scheduleSave();
    });
    $('startOver').addEventListener('click', async function () {
      if (!confirm('Clear this document and its marks from this browser? Saved signatures stay.')) return;
      clearTimeout(saveTimer);
      await idbClear();
      if (state.doc) { try { await state.doc.destroy(); } catch (e) {} }
      state.pdfBytes = null;
      state.doc = null;
      state.pages = [];
      state.selectedId = null;
      showEmpty();
    });
    $('downloadBtn').addEventListener('click', openDownload);
    $('dlClose').addEventListener('click', function () { $('downloadModal').hidden = true; });
    $('downloadModal').addEventListener('click', function (e) {
      if (e.target === $('downloadModal')) $('downloadModal').hidden = true;
    });

    var canvas = $('signCanvas');
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', function (e) {
      if (state.sigTab !== 'draw') return;
      if (e.button != null && e.button !== 0) return;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      state.drawing = true;
      state.activePointer = e.pointerId;
      var stroke = { color: state.pen, points: [signPoint(e)] };
      state.strokes.push(stroke);
      state.activeStroke = stroke;
      redrawSign();
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('pointermove', function (e) {
      if (!state.drawing || !state.activeStroke || e.pointerId !== state.activePointer) return;
      if (canvas.setPointerCapture && !(canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId))) {
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      }
      var events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      events.forEach(function (ev) { state.activeStroke.points.push(signPoint(ev)); });
      redrawSign();
      e.preventDefault();
    }, { passive: false });
    function endDraw(e) {
      if (e && state.activePointer != null && e.pointerId !== state.activePointer) return;
      state.drawing = false;
      state.activeStroke = null;
      state.activePointer = null;
      if (e && canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
        try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
      }
    }
    canvas.addEventListener('pointerup', endDraw);
    canvas.addEventListener('pointercancel', endDraw);
    window.addEventListener('resize', function () {
      if (!$('sigModal').hidden && state.sigTab === 'draw') sizeSignCanvas();
    });
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        if (!$('sigModal').hidden && state.sigTab === 'draw') sizeSignCanvas();
      }).observe(canvas.parentElement || canvas);
    }
    $('sigClear').addEventListener('click', function () {
      state.strokes = [];
      state.activeStroke = null;
      state.drawing = false;
      redrawSign();
    });
    $('sigCancel').addEventListener('click', closeSig);
    $('sigClose').addEventListener('click', closeSig);
    $('sigApply').addEventListener('click', applySig);
    $('sigModal').addEventListener('click', function (e) { if (e.target === $('sigModal')) closeSig(); });
    document.querySelectorAll('.swatch').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.pen = btn.dataset.color;
        document.querySelectorAll('.swatch').forEach(function (s) { s.classList.toggle('on', s === btn); });
        redrawSign();
        updateTypePreview();
      });
    });
    ['draw', 'type', 'upload'].forEach(function (tab) {
      $('tab-' + tab).addEventListener('click', function () { setTab(tab); });
    });
    $('typeName').addEventListener('input', updateTypePreview);
    $('uploadSig').addEventListener('change', async function () {
      var file = $('uploadSig').files && $('uploadSig').files[0];
      $('uploadSig').value = '';
      if (!file) return;
      try {
        var bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        var maxEdge = 1200;
        var scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bmp.width * scale));
        c.height = Math.max(1, Math.round(bmp.height * scale));
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        if (bmp.close) bmp.close();
        state.uploadDataUrl = c.toDataURL('image/png');
        var preview = $('uploadPreview');
        preview.src = state.uploadDataUrl;
        preview.hidden = false;
      } catch (err) { toast('That image could not be read.'); }
    });

    document.addEventListener('keydown', function (e) {
      var typing = e.target.closest && (e.target.isContentEditable || e.target.closest('input, textarea'));
      if (e.key === 'Escape') {
        $('sigModal').hidden = true;
        $('downloadModal').hidden = true;
        select(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId && !typing) {
        e.preventDefault();
        removeAnn(state.selectedId);
      }
      if (typing || !state.pdfBytes) return;
      if (e.key === '+' || e.key === '=') setZoom(state.zoom * 1.1);
      if (e.key === '-' || e.key === '_') setZoom(state.zoom / 1.1);
      if (e.altKey && e.key === 'ArrowRight') go(1);
      if (e.altKey && e.key === 'ArrowLeft') go(-1);
    });

    ['dragenter', 'dragover'].forEach(function (name) {
      document.addEventListener(name, function (e) {
        if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
        e.preventDefault();
        $('stage').classList.add('hot');
      });
    });
    document.addEventListener('dragleave', function (e) {
      if (e.target === document.documentElement) $('stage').classList.remove('hot');
    });
    document.addEventListener('drop', function (e) {
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      e.preventDefault();
      $('stage').classList.remove('hot');
      var file = e.dataTransfer.files[0];
      if (file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) loadFile(file);
      else toast('Drop a PDF file.');
    });
  }

  async function boot() {
    if (!window.pdfjsLib || !window.PDFLib) {
      toast('PDF libraries did not load. Check the connection and reload.');
      return;
    }
    buildFontChoices();
    wire();
    try {
      var pdf = await idbGet('pdf');
      var session = await idbGet('session');
      if (pdf && session && session.pages && session.pages.length) {
        await loadBytes(pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf), session.fileName, session);
        setSaveStatus('Saved');
        $('saveState').dataset.gen = '1';
      }
    } catch (err) {
      toast('A saved document was found but could not be restored.');
    }
  }
  boot();
})();
