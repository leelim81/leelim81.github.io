/* Edit and Sign PDF. The original file lives in IndexedDB; marks live beside it. */
(function () {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../forms-filler/vendor/pdf/pdf.worker.min.js', location.href).href;

  function currentDesk() {
    try {
      return new URLSearchParams(location.search).get('desk') === 'forms' ? 'forms' : 'edit';
    } catch (err) {
      return 'edit';
    }
  }
  var desk = currentDesk();
  var DB = desk === 'forms' ? 'tools-forms-editor' : 'tools-edit-sign-pdf';
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
    drawing: false,
    epoch: 0,
    recoverArmed: false,
    undo: [],
    sourceSha256: '',
    pdfSha256: '',
    resumeProfileId: '',
    resumeNote: '',
    docSerial: 0
  };
  var closed = false;

  function $(id) { return document.getElementById(id); }
  function recoverSay(text) {
    var el = $('recoverStatus');
    if (el) el.textContent = text || '';
  }
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
  function clearGeneration() {
    try { return Number(localStorage.getItem('ff-editor-clear-generation') || 0); } catch (err) { return 0; }
  }
  function sessionGeneration(session) {
    return Number(session && (session.generation || session.epoch) || 0);
  }
  function sessionRetired(session) {
    var mark = clearGeneration();
    var gen = sessionGeneration(session);
    return !!(mark && gen && gen <= mark);
  }
  function rememberHandoff(session) {
    if (!session || sessionRetired(session)) return;
    try { sessionStorage.setItem('ff-editor-handoff', JSON.stringify(session)); } catch (err) {}
  }
  function idbSave(pdfBytes, session) {
    var epoch = session && session.epoch;
    if (sessionRetired(session)) return Promise.resolve({ written: false, reason: 'cleared' });
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('kv', 'readwrite');
        var store = tx.objectStore('kv');
        var outcome = { written: false, reason: 'skipped' };
        var getReq = store.get('session');
        getReq.onsuccess = function () {
          if (closed) { outcome = { written: false, reason: 'closed' }; return; }
          if (sessionRetired(session)) { outcome = { written: false, reason: 'cleared' }; return; }
          var existing = getReq.result;
          if (existing && existing.epoch && epoch && existing.epoch > epoch) { outcome = { written: false, reason: 'conflict' }; return; }
          if (existing && sessionGeneration(existing) > sessionGeneration(session)) { outcome = { written: false, reason: 'conflict' }; return; }
          if (existing && existing.savedAt && session.savedAt && existing.savedAt > session.savedAt) { outcome = { written: false, reason: 'older' }; return; }
          var existingRevision = existing && existing.revision ? Number(existing.revision) : 0;
          var baseRevision = Number(session && session.baseRevision || 0);
          var sameWriter = !!(existing && existing.writerTab && session.writerTab && existing.writerTab === session.writerTab);
          if (existing && existing.savedAt && session.savedAt && existing.savedAt === session.savedAt && !sameWriter) {
            outcome = { written: false, reason: 'conflict' }; return;
          }
          var otherWriter = !!(existing && existing.writerTab && session.writerTab && existing.writerTab !== session.writerTab);
          if (otherWriter && existingRevision !== baseRevision) { outcome = { written: false, reason: 'conflict' }; return; }
          var stored = Object.assign({}, session);
          delete stored.baseRevision;
          stored.revision = existingRevision + 1;
          stored.writerTab = session.writerTab || tabId();
          store.put(pdfBytes, 'pdf');
          store.put(stored, 'session');
          outcome = { written: true, revision: stored.revision };
        };
        tx.oncomplete = function () { resolve(outcome); };
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
  var saveClock = 0;
  var saveNotice = '';
  var tabToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
  function tabId() {
    try {
      var id = sessionStorage.getItem('ff-editor-tab');
      if (!id) {
        id = tabToken;
        sessionStorage.setItem('ff-editor-tab', id);
      }
      return id;
    } catch (err) { return tabToken; }
  }
  function sayUnsaved(text) {
    setSaveStatus('Not saved');
    if (saveNotice === text) return;
    saveNotice = text;
    toast(text);
  }
  function nextSaveStamp() {
    var now = Date.now();
    if (now <= saveClock) now = saveClock + 1;
    saveClock = now;
    return now;
  }
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
  async function hashBytes(bytes) {
    var digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }
  function editorSession() {
    return {
      fileName: state.fileName,
      zoom: state.zoom,
      current: state.current,
      epoch: state.epoch,
      source: desk,
      sourceSha256: state.sourceSha256 || '',
      pdfSha256: state.pdfSha256 || '',
      sheet: state.sheet || null,
      resumeProfileId: ($('recoverPerson') && $('recoverPerson').value) || state.resumeProfileId || '',
      generation: state.generation || state.epoch || 0,
      baseRevision: state.baseRevision || 0,
      writerTab: tabId(),
      editedAt: Date.now(),
      resumeNote: '',
      withheld: Array.isArray(state.withheld) ? state.withheld.map(function (page) {
        return {
          srcIndex: page.srcIndex,
          annotations: (page.annotations || []).map(function (a) { return Object.assign({}, a); })
        };
      }) : [],
      pages: state.pages.map(function (p) {
        return {
          id: p.id,
          srcIndex: p.srcIndex,
          rotation: p.rotation || 0,
          annotations: p.annotations.map(function (a) { return Object.assign({}, a); })
        };
      })
    };
  }
  async function saveNow() {
    if (!state.pdfBytes) return false;
    if (!state.pdfSha256) {
      try { state.pdfSha256 = await hashBytes(state.pdfBytes); } catch (err) { return false; }
    }
    var gen = ++saveGen;
    setSaveStatus('Saving…');
    try {
      var session = editorSession();
      session.savedAt = nextSaveStamp();
      if (sessionRetired(session)) {
        if (gen === saveGen) sayUnsaved('Not saved. Another tab cleared this file.');
        return false;
      }
      rememberHandoff(session);
      var result = await idbSave(new Uint8Array(state.pdfBytes), session);
      if (gen !== saveGen || closed || !state.pdfBytes) return true;
      if (!result || !result.written) {
        try { sessionStorage.removeItem('ff-editor-handoff'); } catch (err) {}
        if (result && result.reason === 'cleared') sayUnsaved('Not saved. Another tab cleared this file.');
        else sayUnsaved('Not saved. This browser kept another save of this file. Reload to see it.');
        return false;
      }
      state.baseRevision = result.revision;
      saveNotice = '';
      var el = $('saveState');
      el.dataset.gen = String(Number(el.dataset.gen || 0) + 1);
      setSaveStatus('Saved');
      return true;
    } catch (err) {
      if (gen === saveGen) {
        setSaveStatus('Not saved');
        toast('Could not save in this browser.');
      }
      return false;
    }
  }
  window.addEventListener('pagehide', function () {
    cancelRecoverCommit();
    if (!state.pdfBytes) return;
    if (state.pdfSha256) rememberHandoff(editorSession());
    saveNow();
  });

  function showWorkspace() {
    $('empty').hidden = true;
    $('toolbar').hidden = false;
    $('status').hidden = false;
    $('downloadBtn').hidden = false;
    refreshRecover();
    $('startOver').hidden = false;
    $('fileName').textContent = state.fileName || '';
  }
  function showEmpty() {
    state.docSerial += 1;
    recoverPanelGen += 1;
    $('empty').hidden = false;
    $('toolbar').hidden = true;
    $('status').hidden = true;
    $('downloadBtn').hidden = true;
    $('startOver').hidden = true;
    if ($('assistBar')) $('assistBar').hidden = true;
    if ($('recoverBar')) $('recoverBar').hidden = true;
    if ($('mapBox')) $('mapBox').hidden = true;
    $('pages').innerHTML = '';
    var name = $('fileName');
    if (name) name.textContent = '';
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
      if (ann.manual) {
        var note = document.createElement('p');
        note.className = 'ann-note';
        note.textContent = (ann.personName || 'Saved person') + ' · ' + (ann.factKey || 'value') + ' · placed by you';
        el.appendChild(note);
      }
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
      var composing = false;
      function readBody() {
        if (composing || el.dataset.painting) return;
        var shown = body.innerText.replace(/\u00a0/g, ' ').replace(/\n$/, '');
        ann.text = el.dataset.painted ? logicalFromPainted(ann.text, el.dataset.painted, shown) : shown;
        if (window.FormProfiles && ann.type === 'text' && ann.factKey && ann.profileId && ann.text !== ann.seedText) {
          FormProfiles.load().then(function (loaded) {
            if (!loaded.ok) return null;
            var noted = FormProfiles.noteFieldEdit(loaded.vault, {
              profileId: ann.profileId,
              key: ann.factKey,
              value: ann.text,
              seed: ann.seedText
            });
            if (!noted.changed) return null;
            return FormProfiles.persist(noted.vault);
          }).catch(function () {});
        }
        fitTextHeight(el, ann);
        scheduleSave();
        scheduleFitNote();
      }
      function markIsCurrent() {
        if (!body.isConnected) return false;
        for (var i = 0; i < state.pages.length; i++) {
          var list = state.pages[i].annotations || [];
          for (var j = 0; j < list.length; j++) if (list[j] === ann) return true;
        }
        return false;
      }
      body.addEventListener('compositionstart', function () {
        composing = true;
        body.dataset.composing = '1';
      });
      body.addEventListener('compositionend', function () {
        composing = false;
        delete body.dataset.composing;
        if (!markIsCurrent()) return;
        readBody();
      });
      body.addEventListener('input', function () { if (!composing) readBody(); });
      body.addEventListener('keyup', function () { if (!composing) readBody(); });
      body.addEventListener('focus', function () { paintWrap(el, ann); });
      body.addEventListener('blur', function () {
        if (composing) return;
        readBody();
        paintWrap(el, ann);
      });
      var mirror = document.createElement('div');
      mirror.className = 'ann-mirror';
      mirror.setAttribute('aria-hidden', 'true');
      el.append(grip, body, mirror);
      paintWrap(el, ann);
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

  var wrapFontPromise = null;
  var wrapFontCached = null;
  function wrapFont() {
    if (!wrapFontPromise && window.PDFLib) {
      wrapFontPromise = PDFLib.PDFDocument.create().then(function (doc) {
        return doc.embedFont(PDFLib.StandardFonts.Helvetica).then(function (font) {
          wrapFontCached = font;
          return font;
        });
      });
    }
    return wrapFontPromise;
  }
  function flatText(value) { return String(value || '').replace(/\n/g, ''); }
  function logicalFromPainted(logical, painted, shown) {
    var from = flatText(painted);
    var to = flatText(shown);
    var base = flatText(logical);
    var pre = 0;
    while (pre < from.length && pre < to.length && from.charAt(pre) === to.charAt(pre)) pre++;
    var suf = 0;
    while (suf < from.length - pre && suf < to.length - pre && from.charAt(from.length - 1 - suf) === to.charAt(to.length - 1 - suf)) suf++;
    var inserted = to.slice(pre, to.length - suf);
    var removed = from.length - pre - suf;
    var next = base.slice(0, pre) + inserted + base.slice(pre + removed);
    var hard = [];
    var at = 0;
    for (var i = 0; i < logical.length; i++) {
      if (logical.charAt(i) === '\n') hard.push(at);
      else at++;
    }
    var delta = inserted.length - removed;
    var keep = [];
    hard.forEach(function (pos) {
      if (pos <= pre) keep.push(pos);
      else if (pos >= pre + removed) keep.push(pos + delta);
    });
    var shownAt = 0;
    for (var s = 0; s < shown.length; s++) {
      if (shown.charAt(s) !== '\n') { shownAt++; continue; }
      var paintedBreak = false;
      var pAt = 0;
      for (var p = 0; p < painted.length; p++) {
        if (painted.charAt(p) !== '\n') { pAt++; continue; }
        if (pAt === shownAt) { paintedBreak = true; break; }
      }
      if (!paintedBreak && keep.indexOf(shownAt) < 0) keep.push(shownAt);
    }
    keep.sort(function (a, b) { return a - b; });
    var out = '';
    var n = 0;
    for (var c = 0; c < next.length; c++) {
      while (keep.length && keep[0] === n) { out += '\n'; keep.shift(); }
      out += next.charAt(c);
      n++;
    }
    while (keep.length && keep[0] === n) { out += '\n'; keep.shift(); }
    return out;
  }
  function applyPaint(el, ann, font) {
    var mirror = el.querySelector('.ann-mirror');
    var body = el.querySelector('.ann-body');
    if (!mirror || !font) return;
    var size = ann.fontSize || 16;
    var maxW = Math.max(8, (el.clientWidth / (state.zoom || 1)) - 2);
    mirror.textContent = wrapText(ann.text || '', font, size, maxW).join('\n');
    if (!body || !body.isConnected) return;
    if (body.dataset.composing === '1' || document.activeElement === body) {
      if (el.dataset.painted) delete el.dataset.painted;
      return;
    }
    el.dataset.painting = '1';
    body.textContent = ann.text || '';
    delete el.dataset.painted;
    delete el.dataset.painting;
  }
  function paintWrap(el, ann) {
    if (!el.querySelector('.ann-mirror') || !ann) return Promise.resolve();
    if (wrapFontCached) {
      applyPaint(el, ann, wrapFontCached);
      return Promise.resolve();
    }
    var ready = wrapFont();
    if (!ready) return Promise.resolve();
    return ready.then(function (font) { applyPaint(el, ann, font); }).catch(function () {});
  }
  function fitTextHeight(el, ann) {
    var body = el.querySelector('.ann-body');
    var mirror = el.querySelector('.ann-mirror');
    if (!body || !el.parentElement) return;
    var pageH = el.parentElement.clientHeight || 1;
    function apply(node) {
      el.style.height = 'auto';
      node.style.height = 'auto';
      var px = Math.max(node.scrollHeight, (ann.fontSize || 16) * state.zoom * 1.3);
      ann.h = clamp(px / pageH, 0.03, 0.95);
      el.style.height = (ann.h * 100) + '%';
      node.style.height = '';
    }
    if (!mirror) { apply(body); return; }
    paintWrap(el, ann).then(function () { if (el.parentElement) apply(mirror); });
  }

  function startMove(e, el, ann) {
    var rect = el.parentElement.getBoundingClientRect();
    var origin = { x: e.clientX, y: e.clientY, ax: ann.x, ay: ann.y };
    if (el.setPointerCapture && e.pointerId != null) {
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
    }
    function move(ev) {
      ann.x = clamp(origin.ax + (ev.clientX - origin.x) / rect.width, 0, 1 - ann.w);
      ann.y = clamp(origin.ay + (ev.clientY - origin.y) / rect.height, 0, 1 - ann.h);
      place(el, ann);
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (el.releasePointerCapture && e.pointerId != null) {
        try { el.releasePointerCapture(e.pointerId); } catch (err) {}
      }
      saveNow();
      scheduleFitNote();
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
      scheduleFitNote();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function removeAnn(id) {
    pushUndo();
    state.pages.forEach(function (p) {
      p.annotations = p.annotations.filter(function (a) { return a.id !== id; });
    });
    var el = document.querySelector('.ann[data-id="' + CSS.escape(id) + '"]');
    if (el) el.remove();
    if (state.selectedId === id) select(null);
    saveNow();
    scheduleFitNote();
  }

  function addAnn(partial, rec) {
    rec = rec || currentPage();
    if (!rec) return null;
    var ann = Object.assign({
      id: uid(), type: 'text', x: 0.15, y: 0.15, w: 0.4, h: 0.08,
      text: '', fontSize: 18, color: '#1a1612'
    }, partial);
    if (!ann.profileId && !ann.originProfileId) {
      ann.originProfileId = ($('recoverPerson') && $('recoverPerson').value) || '';
    }
    if (!partial || !partial.skipUndo) pushUndo();
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
      var index = Number(best.target.dataset.index);
      if (index !== state.current) disarmRecover('Placement was cancelled because the page changed.');
      state.current = index;
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
      (function (pageRec, pageLayer) {
        pageLayer.addEventListener('pointerdown', function (e) {
          if (e.target !== pageLayer) return;
          if (state.recoverArmed) {
            var rect = pageLayer.getBoundingClientRect();
            placeRecovered(pageRec, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
            return;
          }
          select(null);
        });
      })(rec, layer);
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
    state.docSerial += 1;
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
    state.recoverArmed = false;
    state.undo = [];
    state.epoch = session && session.epoch ? session.epoch : Date.now();
    state.sourceSha256 = session && session.sourceSha256 ? session.sourceSha256 : '';
    state.pdfSha256 = session && session.pdfSha256 ? session.pdfSha256 : '';
    state.resumeProfileId = session && session.resumeProfileId ? session.resumeProfileId : '';
    state.resumeNote = session && session.resumeNote ? session.resumeNote : '';
    state.generation = session && (session.generation || session.epoch) ? (session.generation || session.epoch) : Date.now();
    state.baseRevision = session && session.revision ? Number(session.revision) : 0;
    state.withheld = session && Array.isArray(session.withheld) ? session.withheld : [];
    state.sheet = session && session.sheet ? session.sheet : null;
    state.wantRecover = !!(session && session.recover);
    if (!state.pdfSha256 && state.pdfBytes) {
      try { state.pdfSha256 = await hashBytes(state.pdfBytes); } catch (err) {}
    }
    closed = false;
    showWorkspace();
    if (session && session.recover) {
      var assistKey = 'ff-assist-' + (session.epoch || '');
      var seen = false;
      try { seen = !!sessionStorage.getItem(assistKey); } catch (err) { seen = false; }
      if (!seen) {
        try { sessionStorage.setItem(assistKey, '1'); } catch (err) {}
        setPanel('recoverBar', 'assistToggle', true);
      }
    }
    if (!session || session.fit) await fitWidth(false);
    await renderAll();
    scheduleFitNote();
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
    disarmRecover('Placement was cancelled because the page changed.');
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
    disarmRecover('Placement was cancelled because the page changed.');
    state.pages.splice(state.current, 1);
    state.current = Math.min(state.current, state.pages.length - 1);
    await renderAll();
    await saveNow();
  }
  async function movePage(dir) {
    var i = state.current;
    var j = i + dir;
    if (j < 0 || j >= state.pages.length) return;
    disarmRecover('Placement was cancelled because the page changed.');
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
    disarmRecover('Placement was cancelled because the page changed.');
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

  function placedFrame(page) {
    if (!window.FormCoords) return null;
    var rotation = FormCoords.normRotation(page.getRotation().angle || 0);
    if (rotation == null) return null;
    var crop = page.getCropBox();
    if (!crop || !(crop.width > 0) || !(crop.height > 0)) return null;
    return { crop: crop, rotation: rotation };
  }

  async function drawAnn(out, page, font, ann) {
    var frame = placedFrame(page);
    if (!frame) return;
    var box = FormCoords.boxOf(ann, frame.crop, frame.rotation);
    var width = Math.max(1, box.width);
    var height = Math.max(1, box.height);
    var spin = PDFLib.degrees(box.rotate);
    if (ann.type === 'whiteout') {
      page.drawRectangle({ x: box.x, y: box.y, width: width, height: height, color: PDFLib.rgb(1, 1, 1), rotate: spin });
    } else if (ann.type === 'highlight') {
      page.drawRectangle({
        x: box.x, y: box.y, width: width, height: height,
        color: PDFLib.rgb(1, 0.9, 0.2),
        opacity: 0.45,
        blendMode: PDFLib.BlendMode.Multiply,
        rotate: spin
      });
    } else if (ann.type === 'rect') {
      page.drawRectangle({ x: box.x, y: box.y, width: width, height: height, borderColor: hexToRgb(ann.color), borderWidth: 1.6, rotate: spin });
    } else if (ann.type === 'ellipse') {
      var center = FormCoords.fractionToPdf(ann.x + ann.w / 2, ann.y + ann.h / 2, frame.crop, frame.rotation);
      page.drawEllipse({
        x: center.x, y: center.y,
        xScale: Math.max(1, box.width / 2), yScale: Math.max(1, box.height / 2),
        borderColor: hexToRgb(ann.color), borderWidth: 1.6,
        rotate: spin
      });
    } else if (ann.type === 'text' || ann.type === 'date') {
      if (!ann.text) return;
      var size = ann.fontSize || 16;
      var lines = wrapText(ann.text, font, size, Math.max(8, box.width - 2));
      var ok = lines.every(function (line) { return !line || canEncode(font, line); });
      if (!ok) {
        var scale = 3;
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(2, Math.floor(width * scale));
        canvas.height = Math.max(2, Math.floor(height * scale));
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = ann.color || '#1a1612';
        ctx.font = (size * scale) + 'px Helvetica, Arial, sans-serif';
        ctx.textBaseline = 'top';
        String(ann.text).split('\n').forEach(function (line, i) {
          ctx.fillText(line, 2, i * size * scale * 1.3);
        });
        var img = await out.embedPng(await canvasToPng(canvas));
        page.drawImage(img, { x: box.x, y: box.y, width: width, height: height, rotate: spin });
        return;
      }
      var origin = FormCoords.textOrigin(ann, frame.crop, frame.rotation, size);
      var sunk = size * 0.85;
      var lineH = size * 1.3;
      lines.forEach(function (line) {
        var shift = sunk - size * 0.85;
        if (line) {
          page.drawText(line, {
            x: origin.x + origin.down.x * shift,
            y: origin.y + origin.down.y * shift,
            size: size,
            font: font,
            color: hexToRgb(ann.color),
            rotate: PDFLib.degrees(origin.rotate)
          });
        }
        sunk += lineH;
      });
    } else if (ann.dataUrl) {
      var embedded = await embedDataUrl(out, ann.dataUrl);
      page.drawImage(embedded, { x: box.x, y: box.y, width: width, height: height, rotate: spin });
    }
  }

  function syncLiveText() {
    document.querySelectorAll('.ann[data-id]').forEach(function (el) {
      var body = el.querySelector('.ann-body');
      var ann = findAnn(el.dataset.id);
      if (!body || !ann || (ann.type !== 'text' && ann.type !== 'date')) return;
      if (!body.isConnected || body.dataset.composing === '1') return;
      ann.text = body.innerText.replace(/\u00a0/g, ' ').replace(/\n$/, '');
    });
  }

  function exportShot() {
    if (!state.pdfBytes) return null;
    syncLiveText();
    return {
      doc: state.docSerial,
      bytes: state.pdfBytes,
      fileName: state.fileName || '',
      person: ($('recoverPerson') && $('recoverPerson').value) || '',
      pages: state.pages.map(function (page) {
        return {
          srcIndex: page.srcIndex,
          rotation: page.rotation || 0,
          annotations: (page.annotations || []).map(copyAnn)
        };
      })
    };
  }
  function exportShotCurrent(shot) {
    var person = ($('recoverPerson') && $('recoverPerson').value) || '';
    return !!shot && shot.doc === state.docSerial && shot.bytes === state.pdfBytes && shot.person === person && !!state.pdfBytes;
  }

  async function flatten(shot) {
    if (!shot) shot = exportShot();
    if (!shot || !shot.bytes) return new Uint8Array();
    var samePages = shot.pages.length > 0 && shot.pages.every(function (rec, index) {
      return rec.srcIndex === index && !rec.rotation;
    });
    if (samePages) {
      var kept = await PDFLib.PDFDocument.load(shot.bytes.slice(0), { ignoreEncryption: true, updateMetadata: false });
      if (kept.getPageCount() === shot.pages.length) {
        var keptFont = await kept.embedFont(PDFLib.StandardFonts.Helvetica);
        for (var k = 0; k < shot.pages.length; k++) {
          var keptPage = kept.getPages()[k];
          for (var ak = 0; ak < shot.pages[k].annotations.length; ak++) {
            await drawAnn(kept, keptPage, keptFont, shot.pages[k].annotations[ak]);
          }
        }
        return kept.save();
      }
    }
    var src = await PDFLib.PDFDocument.load(shot.bytes.slice(0), { ignoreEncryption: true, updateMetadata: false });
    var out = await PDFLib.PDFDocument.create();
    var font = await out.embedFont(PDFLib.StandardFonts.Helvetica);
    for (var i = 0; i < shot.pages.length; i++) {
      var rec = shot.pages[i];
      var copied = (await out.copyPages(src, [rec.srcIndex]))[0];
      var total = ((copied.getRotation().angle || 0) + (rec.rotation || 0)) % 360;
      copied.setRotation(PDFLib.degrees(total));
      out.addPage(copied);
      for (var a = 0; a < rec.annotations.length; a++) {
        await drawAnn(out, copied, font, rec.annotations[a]);
      }
    }
    return out.save();
  }

  function pointOnPage(x, y, crop) {
    var slop = 0.75;
    return x >= crop.x - slop && y >= crop.y - slop
      && x <= crop.x + crop.width + slop && y <= crop.y + crop.height + slop;
  }

  /* Same lines and origin as the export. A viewer clips to the crop box. */
  function glyphBounds(ann, crop, rotation, font) {
    if (!ann || (ann.type !== 'text' && ann.type !== 'date') || !ann.text) return null;
    if (!crop || !(crop.width > 0) || !(crop.height > 0) || rotation == null) return null;
    var size = ann.fontSize || 16;
    var origin = FormCoords.textOrigin(ann, crop, rotation, size);
    var box = FormCoords.boxOf(ann, crop, rotation);
    var lines = wrapText(ann.text, font, size, Math.max(8, box.width - 2));
    var lineH = size * 1.3;
    var ascent = size * 0.72;
    var descent = size * 0.21;
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    var shift = 0;
    for (var i = 0; i < lines.length; i++) {
      var x = origin.x + origin.down.x * shift;
      var y = origin.y + origin.down.y * shift;
      var width = lines[i] ? font.widthOfTextAtSize(lines[i], size) : 0;
      var ex = x + origin.right.x * width;
      var ey = y + origin.right.y * width;
      var points = [
        [x, y], [ex, ey],
        [x + origin.down.x * descent, y + origin.down.y * descent],
        [x - origin.down.x * ascent, y - origin.down.y * ascent],
        [ex + origin.down.x * descent, ey + origin.down.y * descent],
        [ex - origin.down.x * ascent, ey - origin.down.y * ascent]
      ];
      for (var p = 0; p < points.length; p++) {
        if (points[p][0] < minX) minX = points[p][0];
        if (points[p][1] < minY) minY = points[p][1];
        if (points[p][0] > maxX) maxX = points[p][0];
        if (points[p][1] > maxY) maxY = points[p][1];
      }
      shift += lineH;
    }
    if (!isFinite(minX)) return null;
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function viewShift(shiftX, shiftY, crop, rotation) {
    if (rotation === 90) return { dfx: shiftY / crop.height, dfy: shiftX / crop.width };
    if (rotation === 180) return { dfx: -shiftX / crop.width, dfy: shiftY / crop.height };
    if (rotation === 270) return { dfx: -shiftY / crop.height, dfy: -shiftX / crop.width };
    return { dfx: shiftX / crop.width, dfy: -shiftY / crop.height };
  }

  function millimetres(points, userUnit) {
    var mm = Math.abs(points) * (userUnit || 1) * 25.4 / 72;
    return Math.max(1, Math.ceil(mm - 1e-6));
  }

  /* A move is in millimetres on the page the person sees. No move is named
     when the glyphs are larger than the page or the box cannot travel far enough. */
  function overflowAdvice(ann, crop, rotation, font, userUnit) {
    var bounds = glyphBounds(ann, crop, rotation, font);
    if (!bounds) return null;
    var offL = bounds.minX < crop.x - 0.75;
    var offR = bounds.maxX > crop.x + crop.width + 0.75;
    var offB = bounds.minY < crop.y - 0.75;
    var offT = bounds.maxY > crop.y + crop.height + 0.75;
    if (!offL && !offR && !offB && !offT) return null;
    var tooWide = (offL && offR) || (bounds.maxX - bounds.minX) > crop.width;
    var tooTall = (offT && offB) || (bounds.maxY - bounds.minY) > crop.height;
    if (tooWide || tooTall) {
      return { fit: false, wide: tooWide, tall: tooTall };
    }
    var shiftX = offR ? (crop.x + crop.width - bounds.maxX) : (offL ? (crop.x - bounds.minX) : 0);
    var shiftY = offT ? (crop.y + crop.height - bounds.maxY) : (offB ? (crop.y - bounds.minY) : 0);
    var view = viewShift(shiftX, shiftY, crop, rotation);
    var nextX = ann.x + view.dfx;
    var nextY = ann.y + view.dfy;
    if (nextX < -1e-4 || nextY < -1e-4 || nextX > 1 - ann.w + 1e-4 || nextY > 1 - ann.h + 1e-4) {
      return { fit: false, wide: offL || offR, tall: offT || offB };
    }
    var seen = FormCoords.viewSize(crop, rotation);
    var moves = [];
    if (Math.abs(view.dfx) > 1e-4) moves.push((view.dfx < 0 ? 'left' : 'right') + ' about ' + millimetres(view.dfx * seen.width, userUnit) + ' mm');
    if (Math.abs(view.dfy) > 1e-4) moves.push((view.dfy < 0 ? 'up' : 'down') + ' about ' + millimetres(view.dfy * seen.height, userUnit) + ' mm');
    if (!moves.length) return null;
    return { fit: true, move: moves.join(' and ') };
  }

  async function textOffPage(shot) {
    if (!shot) shot = exportShot();
    if (!shot || !shot.bytes) return [];
    var src = await PDFLib.PDFDocument.load(shot.bytes.slice(0), { ignoreEncryption: true, updateMetadata: false });
    var font = await src.embedFont(PDFLib.StandardFonts.Helvetica);
    var found = [];
    for (var i = 0; i < shot.pages.length; i++) {
      var rec = shot.pages[i];
      var lib = src.getPages()[rec.srcIndex];
      if (!lib) continue;
      var crop = lib.getCropBox();
      var angle = FormCoords.normRotation(((lib.getRotation().angle || 0) + (rec.rotation || 0)));
      var unit = window.FormCoords && FormCoords.fileUserUnit ? FormCoords.fileUserUnit(lib) : 1;
      if (!(unit > 0)) unit = 1;
      for (var a = 0; a < rec.annotations.length; a++) {
        var ann = rec.annotations[a];
        var advice = overflowAdvice(ann, crop, angle, font, unit);
        if (!advice) continue;
        found.push({ id: ann.id, text: ann.text || '', page: i + 1, pages: shot.pages.length, advice: advice });
      }
    }
    return found;
  }

  function fitSentence(item) {
    var sample = String(item.text || '').replace(/\s+/g, ' ').trim();
    if (sample.length > 48) sample = sample.slice(0, 45) + '...';
    var where = item.pages > 1 ? ' on page ' + item.page : '';
    if (!item.advice.fit) {
      if (item.advice.wide && !item.advice.tall) return '"' + sample + '"' + where + ' is wider than the page, so moving it cannot bring it on. Edit the text or choose a smaller size.';
      if (item.advice.tall && !item.advice.wide) return '"' + sample + '"' + where + ' is taller than the page, so moving it cannot bring it on. Edit the text or choose a smaller size.';
      return '"' + sample + '"' + where + ' cannot be brought on the page by moving it. Edit the text or choose a smaller size.';
    }
    return '"' + sample + '"' + where + ' runs past the page. Move it ' + item.advice.move + '.';
  }

  async function textFitList() {
    syncLiveText();
    if (!state.pdfBytes) return [];
    var src = await PDFLib.PDFDocument.load(state.pdfBytes.slice(0), { ignoreEncryption: true, updateMetadata: false });
    var font = await src.embedFont(PDFLib.StandardFonts.Helvetica);
    var found = [];
    for (var i = 0; i < state.pages.length; i++) {
      var rec = state.pages[i];
      var lib = src.getPages()[rec.srcIndex];
      if (!lib) continue;
      var crop = lib.getCropBox();
      var angle = FormCoords.normRotation(((lib.getRotation().angle || 0) + (rec.rotation || 0)));
      var unit = window.FormCoords && FormCoords.fileUserUnit ? FormCoords.fileUserUnit(lib) : 1;
      if (!(unit > 0)) unit = 1;
      for (var a = 0; a < rec.annotations.length; a++) {
        var ann = rec.annotations[a];
        var advice = overflowAdvice(ann, crop, angle, font, unit);
        if (!advice) continue;
        found.push({ id: ann.id, text: ann.text || '', page: i + 1, pages: state.pages.length, advice: advice });
      }
    }
    return found;
  }

  var fitTimer = null;
  var fitGen = 0;
  function scheduleFitNote() {
    if (fitTimer) clearTimeout(fitTimer);
    fitTimer = setTimeout(function () {
      fitTimer = null;
      var gen = ++fitGen;
      refreshFitNote(gen);
    }, 400);
  }
  async function refreshFitNote(gen) {
    var list = [];
    try { list = await textFitList(); } catch (err) { list = []; }
    if (gen !== fitGen) return;
    document.querySelectorAll('.ann-offpage').forEach(function (el) {
      el.classList.remove('ann-offpage');
      el.removeAttribute('aria-invalid');
    });
    var box = $('fitNote');
    if (!box) return;
    box.replaceChildren();
    if (!list.length) { box.hidden = true; return; }
    box.hidden = false;
    if (list.length > 1) {
      var lead = document.createElement('p');
      lead.textContent = list.length + ' pieces of text run past the page.';
      box.appendChild(lead);
    }
    var ul = document.createElement('ul');
    list.forEach(function (item, index) {
      var li = document.createElement('li');
      var p = document.createElement('p');
      p.textContent = fitSentence(item);
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn';
      if (index === 0) button.id = 'fitShow';
      button.textContent = 'Show this text';
      var name = 'Show this text';
      if (item.pages > 1) name += ', page ' + item.page;
      button.setAttribute('aria-label', name);
      button.addEventListener('click', function () {
        select(item.id);
        var el = document.querySelector('.ann[data-id="' + CSS.escape(item.id) + '"]');
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'nearest' });
      });
      li.appendChild(p);
      li.appendChild(button);
      ul.appendChild(li);
      var mark = document.querySelector('.ann[data-id="' + CSS.escape(item.id) + '"]');
      if (mark) {
        mark.classList.add('ann-offpage');
        mark.setAttribute('aria-invalid', 'true');
      }
    });
    box.appendChild(ul);
  }

  function warnSentence(item) {
    var sample = String(item.text || '').replace(/\s+/g, ' ').trim();
    if (sample.length > 48) sample = sample.slice(0, 45) + '...';
    var where = item.pages > 1 ? ' on page ' + item.page : '';
    var tail = ' The type is not moved or shortened.';
    if (!item.advice.fit) {
      if (item.advice.wide && !item.advice.tall) return '"' + sample + '"' + where + ' is wider than the page, so moving it cannot bring it on. Edit the text or choose a smaller size.' + tail;
      if (item.advice.tall && !item.advice.wide) return '"' + sample + '"' + where + ' is taller than the page, so moving it cannot bring it on. Edit the text or choose a smaller size.' + tail;
      return '"' + sample + '"' + where + ' cannot be brought on the page by moving it. Edit the text or choose a smaller size.' + tail;
    }
    return '"' + sample + '"' + where + ' runs past the page. Move it ' + item.advice.move + '. A PDF viewer will cut off what does not fit.' + tail;
  }

  function paintExportWarn(list) {
    var box = $('exportWarn');
    if (!box) return;
    box.replaceChildren();
    if (!list.length) { box.hidden = true; return; }
    box.hidden = false;
    if (list.length > 1) {
      var lead = document.createElement('p');
      lead.textContent = list.length + ' pieces of text run past the page.';
      box.appendChild(lead);
    }
    var ul = document.createElement('ul');
    list.forEach(function (item, index) {
      var li = document.createElement('li');
      var p = document.createElement('p');
      p.textContent = warnSentence(item);
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn';
      if (index === 0) button.id = 'exportShow';
      button.textContent = 'Show this text';
      var name = 'Show this text';
      if (item.pages > 1) name += ', page ' + item.page;
      button.setAttribute('aria-label', name);
      button.addEventListener('click', function () {
        $('downloadModal').hidden = true;
        select(item.id);
        var el = document.querySelector('.ann[data-id="' + CSS.escape(item.id) + '"]');
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'nearest' });
      });
      li.appendChild(p);
      li.appendChild(button);
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  function dialogItems(root) {
    if (!root) return [];
    return Array.prototype.filter.call(root.querySelectorAll('button, a[href], input, select, textarea'), function (el) {
      if (el.disabled || el.hidden) return false;
      if (el.closest('[hidden]')) return false;
      return true;
    });
  }
  function focusDownload() {
    var modal = $('downloadModal');
    var items = dialogItems(modal);
    var show = $('exportShow');
    var preferred = show && !$('exportWarn').hidden && items.indexOf(show) >= 0 ? show : items[0];
    if (preferred) preferred.focus();
  }
  function closeDownload() {
    var modal = $('downloadModal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    if ($('downloadBtn')) $('downloadBtn').focus();
  }

  async function openDownload() {
    if (!state.pdfBytes) return;
    var shot = exportShot();
    if (!shot) return;
    var warn = [];
    try { warn = await textOffPage(shot); } catch (err) { warn = []; }
    if (!exportShotCurrent(shot)) return;
    paintExportWarn(warn);
    $('downloadModal').hidden = false;
    var stem = (shot.fileName || 'document').replace(/\.pdf$/i, '');
    PdfSizes.mount($('sizeOptions'), {
      getBytes: function () { return flatten(shot); },
      nameFor: function (level) {
        return level === 100 ? stem + '-edited.pdf' : stem + '-edited-' + level + '.pdf';
      },
      usageKey: 'pdf-editor'
    });
    focusDownload();
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

  function copyAnn(ann) {
    return Object.assign({}, ann);
  }
  function snapshotPages() {
    return {
      personId: ($('recoverPerson') && $('recoverPerson').value) || state.selectedResumePerson || '',
      pages: state.pages.map(function (page) {
        return { id: page.id, annotations: (page.annotations || []).map(copyAnn) };
      }),
      withheld: (state.withheld || []).map(function (page) {
        return { srcIndex: page.srcIndex, annotations: (page.annotations || []).map(copyAnn) };
      })
    };
  }
  function pushUndo() {
    state.undo.push(snapshotPages());
    if (state.undo.length > 30) state.undo.shift();
    if ($('recoverUndo')) $('recoverUndo').disabled = !state.undo.length;
  }
  function markOwnerOf(ann) {
    if (!ann) return '';
    if (ann.profileId) return ann.profileId;
    if (ann.originProfileId) return ann.originProfileId;
    return '';
  }
  function partitionStamp() {
    function side(pages) {
      return (pages || []).map(function (page) {
        var src = page.srcIndex == null ? '' : page.srcIndex;
        var ids = (page.annotations || []).map(function (ann) { return (ann.id || '') + '/' + markOwnerOf(ann); });
        return src + ':' + ids.join(',');
      }).join('|');
    }
    return side(state.pages) + '||' + side(state.withheld);
  }
  function partitionFor(personId) {
    var before = partitionStamp();
    var pool = {};
    function add(srcIndex, ann) {
      if (!pool[srcIndex]) pool[srcIndex] = [];
      pool[srcIndex].push(ann);
    }
    state.pages.forEach(function (rec, index) {
      (rec.annotations || []).forEach(function (ann) { add(rec.srcIndex == null ? index : rec.srcIndex, ann); });
    });
    (state.withheld || []).forEach(function (page) {
      (page.annotations || []).forEach(function (ann) { add(page.srcIndex, ann); });
    });
    var withheld = [];
    var hidden = 0;
    state.pages.forEach(function (rec, index) {
      var src = rec.srcIndex == null ? index : rec.srcIndex;
      var mine = [];
      var theirs = [];
      (pool[src] || []).forEach(function (ann) {
        var owner = markOwnerOf(ann);
        if (!owner) { hidden += 1; return; }
        if (owner === personId) mine.push(ann);
        else { theirs.push(ann); hidden += 1; }
      });
      rec.annotations = mine;
      if (theirs.length) withheld.push({ srcIndex: src, annotations: theirs });
    });
    state.withheld = withheld;
    return { changed: before !== partitionStamp(), hidden: hidden };
  }
  function redrawAnnotations() {
    state.pages.forEach(function (rec) {
      if (!rec.layer) return;
      rec.layer.innerHTML = '';
      rec.annotations.forEach(function (ann) { drawOne(rec, ann); });
    });
  }
  function undoRecover() {
    var snap = state.undo.pop();
    if (!snap) return;
    var pages = Array.isArray(snap) ? snap : (snap.pages || []);
    var withheld = Array.isArray(snap) ? [] : (snap.withheld || []);
    pages.forEach(function (page) {
      var rec = state.pages.filter(function (item) { return item.id === page.id; })[0];
      if (rec) rec.annotations = (page.annotations || []).map(copyAnn);
    });
    state.withheld = withheld.map(function (page) {
      return { srcIndex: page.srcIndex, annotations: (page.annotations || []).map(copyAnn) };
    });
    var personId = ($('recoverPerson') && $('recoverPerson').value) || state.selectedResumePerson || '';
    if (personId) partitionFor(personId);
    state.recoverArmed = false;
    redrawAnnotations();
    select(null);
    if ($('recoverUndo')) $('recoverUndo').disabled = !state.undo.length;
    recoverSay('Undid the last placement change.');
    saveNow();
    scheduleFitNote();
  }
  function disarmRecover(message) {
    var was = state.recoverArmed;
    state.recoverArmed = false;
    if (was && message) recoverSay(message);
  }
  async function frameAllowsPlace() {
    var rec = currentPage();
    if (!rec || !state.pdfBytes || !state.doc) return { ok: false, reason: 'Open a page first.' };
    if (!window.FormCoords) return { ok: false, reason: 'The page scale tools did not load, so a saved value is not placed.' };
    var src = await PDFLib.PDFDocument.load(state.pdfBytes.slice(0));
    var lib = src.getPages()[rec.srcIndex];
    if (!lib) return { ok: false, reason: 'That page could not be read.' };
    var pdfPage = await state.doc.getPage(rec.srcIndex + 1);
    var frame = FormCoords.frameOf(lib, pdfPage, rec.rotation || 0);
    if (!frame.ok) {
      if (frame.reasons.indexOf('rotation') >= 0) return { ok: false, reason: 'This page’s rotation is not a quarter turn. A saved value is not placed on it.' };
      if (frame.reasons.indexOf('scale') >= 0) return { ok: false, reason: 'This reader could not read a usable page scale, so a saved value is not placed.' };
      return { ok: false, reason: 'This page’s crop could not be read, so a saved value is not placed.' };
    }
    return { ok: true, frame: frame };
  }
  function selectedRecoverFact() {
    var person = $('recoverPerson');
    var fact = $('recoverFact');
    if (!person || !fact || !fact.value) return null;
    var option = fact.options[fact.selectedIndex];
    if (!option) return null;
    return {
      profileId: person.value,
      personName: person.options[person.selectedIndex] ? person.options[person.selectedIndex].textContent : '',
      key: option.dataset.key || '',
      label: option.dataset.label || option.dataset.key || '',
      value: option.dataset.value || '',
      role: $('recoverRole') ? $('recoverRole').value : 'applicant'
    };
  }
  async function fileSha() {
    if (state.sourceSha256) return state.sourceSha256;
    var digest = await crypto.subtle.digest('SHA-256', state.pdfBytes);
    return Array.from(new Uint8Array(digest)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  async function pagesSupported() {
    if (!state.pdfBytes || !state.doc || !state.pages.length) return { ok: false, reason: 'Open a page first.' };
    if (!window.FormCoords) return { ok: false, reason: 'The page scale tools did not load, so a map is not saved or applied.' };
    var src = await PDFLib.PDFDocument.load(state.pdfBytes.slice(0));
    if (src.getPageCount() !== state.pages.length) return { ok: false, reason: 'Pages were removed. A map needs the original pages in their original order.' };
    var frames = [];
    for (var i = 0; i < state.pages.length; i++) {
      var rec = state.pages[i];
      if (rec.srcIndex !== i || rec.rotation) return { ok: false, reason: 'Pages were rotated or reordered in the editor. Open the exact blank original.' };
      var lib = src.getPages()[i];
      var pdfPage = await state.doc.getPage(i + 1);
      var frame = FormCoords.frameOf(lib, pdfPage, 0);
      if (!frame.ok) {
        if (frame.reasons.indexOf('rotation') >= 0) return { ok: false, reason: 'This page’s rotation is not a quarter turn. A map is not saved or applied on it.' };
        if (frame.reasons.indexOf('scale') >= 0) return { ok: false, reason: 'This file’s page scale could not be read, so a map is not saved or applied.' };
        return { ok: false, reason: 'This page’s crop could not be read, so a map is not saved or applied.' };
      }
      frames.push(frame);
    }
    return { ok: true, doc: src, frames: frames };
  }
  function manualSlots() {
    var roles = {};
    var people = {};
    var pages = state.pages.map(function () { return []; });
    state.pages.forEach(function (rec, index) {
      rec.annotations.forEach(function (ann) {
        if (!ann.manual || ann.type !== 'text' || !ann.factKey) return;
        roles[ann.role || 'applicant'] = true;
        if (ann.profileId) people[ann.profileId] = true;
        pages[index].push({
          key: ann.factKey,
          role: ann.role || 'applicant',
          x: ann.x, y: ann.y, w: ann.w, h: ann.h,
          fontSize: ann.fontSize || 14
        });
      });
    });
    return { roles: Object.keys(roles), people: Object.keys(people), pages: pages, count: pages.reduce(function (n, list) { return n + list.length; }, 0) };
  }
  async function refreshMaps() {
    var pick = $('mapPick');
    if (!pick || !window.FormMaps || !state.pdfBytes) return;
    var loaded = await FormMaps.load();
    var sha = await fileSha();
    state.mapSha = sha;
    state.mapVault = loaded.vault;
    var previous = pick.value;
    pick.textContent = '';
    var maps = (loaded.vault.maps || []).filter(function (map) { return map.fileSha256 === sha; });
    if (!maps.length) {
      var empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'No map for this exact file';
      pick.appendChild(empty);
      return;
    }
    maps.forEach(function (map) {
      var opt = document.createElement('option');
      opt.value = map.id;
      opt.textContent = map.name + ' · ' + map.role;
      pick.appendChild(opt);
    });
    if (previous && maps.some(function (map) { return map.id === previous; })) pick.value = previous;
  }
  function chosenMap() {
    var id = $('mapPick') && $('mapPick').value;
    var maps = (state.mapVault && state.mapVault.maps) || [];
    return maps.filter(function (map) { return map.id === id; })[0] || null;
  }
  async function saveCurrentMap() {
    if (!window.FormMaps) return;
    var support = await pagesSupported();
    if (!support.ok) { recoverSay(support.reason); return; }
    var found = manualSlots();
    if (!found.count) { recoverSay('Place at least one confirmed value before saving a map. The map stores the place, not the words.'); return; }
    if (found.people.length !== 1) { recoverSay('A map remembers places for one person at a time. Places for more than one person were not saved.'); return; }
    if (found.roles.length !== 1) { recoverSay('A map remembers one role. Applicant and patient places together were not saved.'); return; }
    var loaded = await FormMaps.load();
    if (!loaded.ok && loaded.reason !== 'version') { recoverSay('Maps could not be read (' + loaded.reason + '). Nothing was saved.'); return; }
    if (state.sourceSha256 && (!state.sheet || !window.FormMaps.matchesSheet(state.sheet, state.sheet))) {
      recoverSay('This photo’s sheet could not be checked, so the map was not saved.');
      return;
    }
    var label = ($('mapName').value || '').trim();
    var draft = {
      name: label || ('Blank map ' + ((loaded.vault.maps || []).length + 1)),
      fileSha256: await fileSha(),
      sheet: state.sourceSha256 ? state.sheet : null,
      pages: support.frames.map(function (frame, index) {
        return {
          width: frame.media.width,
          height: frame.media.height,
          rotation: frame.rotation,
          userUnit: frame.userUnit,
          cropX: frame.crop.x,
          cropY: frame.crop.y,
          cropWidth: frame.crop.width,
          cropHeight: frame.crop.height,
          slots: found.pages[index] || []
        };
      })
    };
    var saved = FormMaps.saveMap(loaded.ok ? loaded.vault : FormMaps.empty(), draft);
    if (!saved.ok) { recoverSay('The map was not saved (' + saved.reason + ').'); return; }
    var stored = await FormMaps.persist(saved.vault);
    if (!stored.ok) { recoverSay('The map stayed unsaved (' + stored.reason + ').'); return; }
    $('mapName').value = '';
    await refreshMaps();
    recoverSay('Saved ' + saved.map.name + ' for this exact file, role ' + saved.map.role + '. It does not keep the person or the values.');
  }
  function mapClickIntent() {
    return {
      doc: state.docSerial,
      panel: recoverPanelGen,
      person: ($('recoverPerson') && $('recoverPerson').value) || '',
      bytes: state.pdfBytes
    };
  }
  function mapClickCurrent(intent) {
    var personNow = ($('recoverPerson') && $('recoverPerson').value) || '';
    return !!intent && intent.doc === state.docSerial && intent.panel === recoverPanelGen && intent.person === personNow && intent.bytes === state.pdfBytes && !!state.pdfBytes;
  }
  async function previewMap() {
    var map = chosenMap();
    var box = $('mapPreviewText');
    if (!map) { if (box) box.textContent = 'No map for this exact file.'; return; }
    var intent = mapClickIntent();
    var support = await pagesSupported();
    if (!mapClickCurrent(intent)) return;
    if (!support.ok) { if (box) box.textContent = support.reason; return; }
    if (map.fileSha256 !== await fileSha()) {
      if (!mapClickCurrent(intent)) return;
      if (box) box.textContent = 'This is not the same file. Open the exact blank original.';
      return;
    }
    if (!mapClickCurrent(intent)) return;
    if (map.sheet && !window.FormMaps.matchesSheet(map.sheet, state.sheet)) {
      var refused = 'This photo opened onto a different sheet. The map was not used.';
      if (box) box.textContent = refused;
      recoverSay(refused);
      return;
    }
    var person = $('recoverPerson');
    var fact = selectedRecoverFact();
    var loaded = window.FormProfiles ? await FormProfiles.load() : { ok: false };
    if (!mapClickCurrent(intent)) return;
    var profile = loaded.ok ? (loaded.vault.profiles || []).filter(function (item) { return item.id === (person && person.value); })[0] : null;
    var lines = [];
    var ready = 0;
    var skipped = 0;
    map.pages.forEach(function (page, index) {
      var frame = support.frames[index];
      if (!window.FormMaps.matchesFrame(page, frame)) {
        lines.push('Page ' + (index + 1) + ' does not match this map.');
        skipped += page.slots.length;
        return;
      }
      page.slots.forEach(function (slot) {
        var have = profile && (profile.facts || []).filter(function (item) { return item.key === slot.key && item.status === 'confirmed' && item.value; })[0];
        if (!have) { skipped += 1; lines.push('Page ' + (index + 1) + ' ' + slot.role + ' ' + slot.key + ' has no confirmed value.'); return; }
        ready += 1;
        lines.push('Page ' + (index + 1) + ' ' + slot.role + ' ' + slot.key + ' would be placed.');
      });
    });
    var text = 'Preview only, nothing written. Role ' + map.role + '. ' + ready + ' place(s), ' + skipped + ' left blank. ' + lines.join(' ');
    if (box) box.textContent = text;
    recoverSay(text);
  }
  async function applyMap() {
    var map = chosenMap();
    if (!map) { recoverSay('Choose a map for this exact file.'); return; }
    var intent = mapClickIntent();
    var support = await pagesSupported();
    if (!mapClickCurrent(intent)) return;
    if (!support.ok) { recoverSay(support.reason); return; }
    if (map.fileSha256 !== await fileSha()) {
      if (!mapClickCurrent(intent)) return;
      recoverSay('This is not the same file the map was saved from. Open the exact blank original. A changed copy is not used.');
      return;
    }
    if (!mapClickCurrent(intent)) return;
    if (map.sheet && !window.FormMaps.matchesSheet(map.sheet, state.sheet)) {
      recoverSay('This photo opened onto a different sheet. The map was not used.');
      return;
    }
    if (state.pages.some(function (rec, index) { return rec.srcIndex !== index || rec.rotation; })) {
      recoverSay('Pages were rotated or reordered. The map was not applied.');
      return;
    }
    var person = $('recoverPerson');
    var loaded = window.FormProfiles ? await FormProfiles.load() : { ok: false };
    if (!mapClickCurrent(intent)) return;
    var profile = loaded.ok ? (loaded.vault.profiles || []).filter(function (item) { return item.id === intent.person; })[0] : null;
    if (!profile) { recoverSay('Choose a person before applying a map.'); return; }
    if (!mapClickCurrent(intent)) return;
    pushUndo();
    var parked = state.withheld ? state.withheld.slice() : [];
    state.pages.forEach(function (rec, index) {
      var keep = [];
      var foreign = [];
      (rec.annotations || []).forEach(function (ann) {
        if (ann.mapId === map.id) return;
        if (ann.profileId && ann.profileId !== profile.id) { foreign.push(ann); return; }
        keep.push(ann);
      });
      rec.annotations = keep;
      if (foreign.length) parked.push({ srcIndex: rec.srcIndex == null ? index : rec.srcIndex, annotations: foreign });
    });
    state.withheld = parked;
    var placed = 0;
    var skipped = 0;
    map.pages.forEach(function (page, index) {
      if (!window.FormMaps.matchesFrame(page, support.frames[index])) { skipped += page.slots.length; return; }
      page.slots.forEach(function (slot) {
        var have = (profile.facts || []).filter(function (item) { return item.key === slot.key && item.status === 'confirmed' && item.value; })[0];
        if (!have) { skipped += 1; return; }
        addAnn({
          type: 'text',
          text: have.value,
          x: slot.x, y: slot.y, w: slot.w, h: slot.h,
          fontSize: slot.fontSize,
          color: '#1a1612',
          manual: true,
          mapId: map.id,
          factKey: slot.key,
          role: slot.role,
          profileId: profile.id,
          personName: profile.name,
          seedText: have.value,
          skipUndo: true
        }, state.pages[index]);
        placed += 1;
      });
    });
    redrawAnnotations();
    state.recoverArmed = false;
    recoverSay('Applied ' + placed + ' place(s) for ' + profile.name + ' as ' + map.role + '. ' + skipped + ' left blank. This is not an automatic fill. Apply again replaces these places. Undo restores the previous lines.');
    scheduleFitNote();
  }
  function setPanel(barId, toggleId, open) {
    var bar = $(barId);
    var toggle = $(toggleId);
    if (!bar || !toggle) return;
    var was = !bar.hidden;
    bar.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && !was) {
      var nodes = bar.querySelectorAll('select, input, button');
      var focus = null;
      for (var i = 0; i < nodes.length; i++) {
        if (!nodes[i].closest('[hidden]')) { focus = nodes[i]; break; }
      }
      if (focus) focus.focus();
    }
    if (!open && was) toggle.focus();
    if (barId === 'recoverBar' && open !== was) recoverPanelGen += 1;
    if (!open && was && barId === 'recoverBar') {
      cancelRecoverCommit();
      disarmRecover('Placement was cancelled.');
    }
    if (open && !was && barId === 'recoverBar') refreshRecover();
  }
  var recoverCommit = 0;
  function setRecoverBusy(on) {
    ['recoverAddPerson', 'recoverAddFact', 'recoverPerson', 'recoverFactKey', 'recoverPersonName', 'recoverFactValue'].forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = !!on;
    });
  }
  function cancelRecoverCommit() {
    recoverCommit++;
    setRecoverBusy(false);
  }
  function recoverOpen(token) {
    return token === recoverCommit && $('recoverBar') && !$('recoverBar').hidden;
  }
  var recoverListGen = 0;
  var recoverPanelGen = 0;
  function recoverTicket() {
    return { request: recoverListGen, doc: state.docSerial, panel: recoverPanelGen };
  }
  function recoverTicketCurrent(ticket) {
    return !!ticket && ticket.request === recoverListGen && ticket.doc === state.docSerial && ticket.panel === recoverPanelGen;
  }
  function focusRecoverIfUnowned(el, ticket) {
    if (!el || !el.isConnected || el.closest('[hidden]')) return;
    var bar = $('recoverBar');
    if (!bar || bar.hidden || !bar.contains(el)) return;
    var active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement) return;
    el.focus();
    if (!ticket) return;
    requestAnimationFrame(function () {
      if (!recoverTicketCurrent(ticket)) return;
      focusRecoverIfUnowned(el);
    });
  }
  async function refreshRecover() {
    if ($('assistBar')) $('assistBar').hidden = !state.pdfBytes;
    var person = $('recoverPerson');
    var fact = $('recoverFact');
    if (!person || !fact) return;
    var previous = person.value;
    var ticket = recoverTicket();
    ticket.request = ++recoverListGen;
    if (!window.FormProfiles) {
      if (!recoverTicketCurrent(ticket)) return;
      recoverSay('Saved values are not available in this browser.');
      $('recoverPlace').disabled = true;
      return;
    }
    function sayReady(text) {
      if (!recoverTicketCurrent(ticket)) return;
      if (state.resumeNote) {
        recoverSay(state.resumeNote + ' ' + text);
        state.resumeNote = '';
        return;
      }
      recoverSay(text);
    }
    var loaded = await FormProfiles.load();
    if (!recoverTicketCurrent(ticket)) return;
    person.textContent = '';
    fact.textContent = '';
    var profiles = loaded.ok ? loaded.vault.profiles : [];
    var personLabel = $('recoverPerson') && $('recoverPerson').closest('label');
    if (personLabel) personLabel.hidden = !profiles.length;
    if (!profiles.length) {
      if (!recoverTicketCurrent(ticket)) return;
      showRecoverCreate('person');
      sayReady('No one is saved yet. Add a person and a confirmed value, then place it. Text on the toolbar types on the page without saving a person.');
      $('recoverPlace').disabled = true;
      if (state.wantRecover && $('recoverBar').hidden) {
        if (!recoverTicketCurrent(ticket)) return;
        setPanel('recoverBar', 'assistToggle', true);
        return;
      }
      focusRecoverIfUnowned($('recoverPersonName'), ticket);
      return;
    }
    profiles.forEach(function (profile) {
      var opt = document.createElement('option');
      opt.value = profile.id;
      opt.textContent = profile.name;
      person.appendChild(opt);
    });
    if (!state.resumePersonApplied && state.resumeProfileId && profiles.some(function (profile) { return profile.id === state.resumeProfileId; })) {
      person.value = state.resumeProfileId;
      state.resumePersonApplied = true;
    } else if (previous && profiles.some(function (profile) { return profile.id === previous; })) person.value = previous;
    state.selectedResumePerson = person.value;
    var chosen = profiles.filter(function (profile) { return profile.id === person.value; })[0] || profiles[0];
    var facts = (chosen.facts || []).filter(function (item) { return item.status === 'confirmed' && item.value; });
    facts.forEach(function (item) {
      var opt = document.createElement('option');
      opt.value = item.id;
      opt.dataset.key = item.key;
      opt.dataset.label = item.label || item.key;
      opt.dataset.value = item.value;
      opt.textContent = (item.label || item.key) + ': ' + item.value;
      fact.appendChild(opt);
    });
    $('recoverPlace').disabled = !facts.length;
    if (!recoverTicketCurrent(ticket)) return;
    focusRecoverIfUnowned(person, ticket);
    if (!facts.length) {
      showRecoverCreate('fact');
      sayReady(chosen.name + ' has no confirmed value yet. Type one and save it, then place it. Unconfirmed reads stay unconfirmed.');
    } else {
      showRecoverCreate('off');
      if (!state.recoverArmed) sayReady('Choose the person and the confirmed value, then place it on the page.');
    }
    refreshMaps();
  }
  function showRecoverCreate(mode) {
    var box = $('recoverCreate');
    if (!box) return;
    box.hidden = mode === 'off';
    var personLabel = $('recoverPersonName') && $('recoverPersonName').closest('label');
    if (personLabel) personLabel.hidden = mode !== 'person';
    if ($('recoverAddPerson')) $('recoverAddPerson').hidden = mode !== 'person';
    if ($('recoverFactCreate')) $('recoverFactCreate').hidden = mode !== 'fact';
  }
  async function placeRecovered(rec, x, y) {
    var fact = selectedRecoverFact();
    if (!state.recoverArmed || !fact || !fact.value) {
      disarmRecover('That placement was cancelled.');
      return;
    }
    state.current = state.pages.indexOf(rec);
    var width = 0.42;
    var height = 0.05;
    var fontSize = 14;
    var frame = await frameAllowsPlace();
    if (!frame.ok) {
      disarmRecover(frame.reason);
      return;
    }
    var view = window.FormCoords.viewSize(frame.frame.crop, frame.frame.rotation);
    var wanted = FormCoords.topForBaseline(y, fontSize, view.height);
    var top = clamp(wanted, 0, 1 - height);
    var onClick = Math.abs(top - wanted) < 1e-4;
    var el = addAnn({
      type: 'text',
      text: fact.value,
      x: clamp(x, 0, 1 - width),
      y: top,
      w: width,
      h: height,
      fontSize: 14,
      color: '#1a1612',
      manual: true,
      role: fact.role || 'applicant',
      factKey: fact.key,
      profileId: fact.profileId,
      personName: fact.personName,
      seedText: fact.value
    }, rec);
    state.recoverArmed = false;
    var saved = await saveNow();
    if (!saved) {
      recoverSay('The mark is on the page, but this browser could not store it. Back or reload will lose it.');
      return;
    }
    recoverSay(onClick
      ? 'Placed ' + fact.personName + '’s ' + fact.label + '. The baseline sits on the click. It is not an automatic fill.'
      : 'Placed ' + fact.personName + '’s ' + fact.label + ' on the page. The baseline could not sit on that click without leaving the page. Nudge it or choose another size.');
    if (el) fitTextHeight(el, findAnn(el.dataset.id));
    scheduleFitNote();
  }
  function nudgeSelected(dx, dy) {
    var ann = findAnn(state.selectedId);
    if (!ann) return;
    pushUndo();
    ann.x = clamp(ann.x + dx, 0, 1 - ann.w);
    ann.y = clamp(ann.y + dy, 0, 1 - ann.h);
    var el = document.querySelector('.ann[data-id="' + CSS.escape(ann.id) + '"]');
    if (el) place(el, ann);
    saveNow();
    scheduleFitNote();
  }

  function wire() {
    function pick() { $('fileInput').click(); }
    function closeDrawer() {
      $('toolDrawer').hidden = true;
      $('moreTools').setAttribute('aria-expanded', 'false');
    }
    $('moreTools').addEventListener('click', function (e) {
      e.stopPropagation();
      var open = $('toolDrawer').hidden;
      $('toolDrawer').hidden = !open;
      $('moreTools').setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $('toolDrawer').addEventListener('click', function (e) {
      if (e.target.closest('button')) closeDrawer();
    });
    document.addEventListener('click', function (e) {
      if ($('toolDrawer').hidden) return;
      if (e.target.closest('#toolDrawer') || e.target.closest('#moreTools')) return;
      closeDrawer();
    });
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
    [['nudgeLeft', -0.02, 0], ['nudgeRight', 0.02, 0], ['nudgeUp', 0, -0.02], ['nudgeDown', 0, 0.02]].forEach(function (spec) {
      $(spec[0]).addEventListener('click', function () { nudgeSelected(spec[1], spec[2]); });
    });
    $('recoverPerson').addEventListener('change', function () {
      disarmRecover('The person changed, so the placement was cancelled.');
    });
    $('recoverFact').addEventListener('change', function () {
      disarmRecover('The value changed, so the placement was cancelled.');
    });
    $('recoverRole').addEventListener('change', function () {
      disarmRecover('The role changed, so the placement was cancelled.');
    });
    $('mapSave').addEventListener('click', saveCurrentMap);
    $('mapPreview').addEventListener('click', previewMap);
    $('mapApply').addEventListener('click', applyMap);
    $('mapDelete').addEventListener('click', async function () {
      var map = chosenMap();
      if (!map || !window.FormMaps) return;
      var loaded = await FormMaps.load();
      var next = FormMaps.deleteMap(loaded.vault, map.id);
      var stored = await FormMaps.persist(next.vault);
      if (!stored.ok) { recoverSay('The map was not deleted (' + stored.reason + ').'); return; }
      await refreshMaps();
      recoverSay('Deleted that blank map from this browser.');
    });
    $('mapClear').addEventListener('click', async function () {
      if (!window.FormMaps) return;
      if (!confirm('Clear every blank map stored in this browser? Saved people and values stay.')) return;
      var cleared = await FormMaps.clearAll();
      if (!cleared.ok) { recoverSay('Maps were not cleared (' + cleared.reason + ').'); return; }
      await refreshMaps();
      recoverSay('Cleared every blank map in this browser. People and values were kept.');
    });
    if ($('recoverPerson')) $('recoverPerson').addEventListener('change', function () {
      var id = $('recoverPerson').value;
      var from = state.selectedResumePerson || '';
      if (!id || from === id) return;
      state.selectedResumePerson = id;
      var split = partitionFor(id);
      if (split.changed) {
        redrawAnnotations();
        if (split.hidden) recoverSay('The other person’s marks were left off.');
        saveNow();
        scheduleFitNote();
      }
      refreshRecover();
    });
    $('recoverPlace').addEventListener('click', async function () {
      var fact = selectedRecoverFact();
      if (!fact) {
        recoverSay('Choose a confirmed value first.');
        return;
      }
      var frame = await frameAllowsPlace();
      if (!frame.ok) {
        state.recoverArmed = false;
        recoverSay(frame.reason);
        return;
      }
      state.recoverArmed = true;
      recoverSay('Click the page where ' + fact.personName + '’s ' + fact.label + ' should sit. The baseline goes on that click. Cancel if this is the wrong person.');
    });
    $('recoverCancel').addEventListener('click', function () {
      state.recoverArmed = false;
      recoverSay('Placement cancelled. Nothing was added.');
    });
    $('recoverUndo').disabled = true;
    $('recoverUndo').addEventListener('click', undoRecover);
    var factKey = $('recoverFactKey');
    if (factKey && window.FormProfiles && FormProfiles.CANON) {
      FormProfiles.CANON.forEach(function (name) {
        var opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        factKey.appendChild(opt);
      });
    }
    if ($('recoverAddPerson')) $('recoverAddPerson').addEventListener('click', async function () {
      var name = ($('recoverPersonName').value || '').trim().slice(0, 80);
      if (!name) { recoverSay('Type a name for the person first.'); $('recoverPersonName').focus(); return; }
      var token = ++recoverCommit;
      setRecoverBusy(true);
      try {
        var loaded = await FormProfiles.load();
        if (!loaded.ok) { recoverSay('Saved values are not available in this browser.'); return; }
        if (!recoverOpen(token) || ($('recoverPersonName').value || '').trim().slice(0, 80) !== name) {
          recoverSay('That person was not added.');
          return;
        }
        var again = await FormProfiles.load();
        if (!again.ok || !recoverOpen(token) || ($('recoverPersonName').value || '').trim().slice(0, 80) !== name) {
          recoverSay('That person was not added.');
          return;
        }
        if (again.vault.profiles.some(function (profile) { return profile.name === name; })) {
          recoverSay(name + ' is already saved. Nothing new was added.');
          refreshRecover();
          return;
        }
        if (again.vault.profiles.length >= 30) { recoverSay('Too many people are stored.'); return; }
        var saved = await FormProfiles.persist(null, function (current) {
          if (!recoverOpen(token) || ($('recoverPersonName').value || '').trim().slice(0, 80) !== name) return { ok: false, reason: 'cancelled' };
          if (current.profiles.some(function (profile) { return profile.name === name; })) return { ok: false, reason: 'exists' };
          if (current.profiles.length >= 30) return { ok: false, reason: 'full' };
          var next = FormProfiles.migrate(JSON.parse(JSON.stringify(current)));
          next.profiles.push({ id: uid(), name: name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), facts: [] });
          if (!recoverOpen(token)) return { ok: false, reason: 'cancelled' };
          return { ok: true, vault: next };
        });
        if (saved.reason === 'exists') { recoverSay(name + ' is already saved. Nothing new was added.'); refreshRecover(); return; }
        if (saved.reason === 'full') { recoverSay('Too many people are stored.'); return; }
        if (!saved.ok && saved.reason === 'cancelled') { recoverSay('That person was not added.'); return; }
        if (!saved.ok) { if (token === recoverCommit) recoverSay('That person was not saved.'); return; }
        if (token !== recoverCommit) { recoverSay(name + ' was saved.'); refreshRecover(); return; }
        $('recoverPersonName').value = '';
        refreshRecover();
      } catch (err) {
        if (token === recoverCommit) recoverSay('That person was not saved.');
      } finally {
        if (token === recoverCommit) setRecoverBusy(false);
      }
    });
    if ($('recoverAddFact')) $('recoverAddFact').addEventListener('click', async function () {
      var value = ($('recoverFactValue').value || '').trim().slice(0, 400);
      if (!value) { recoverSay('Type the value to confirm.'); $('recoverFactValue').focus(); return; }
      var personId = $('recoverPerson') ? $('recoverPerson').value : '';
      var key = ($('recoverFactKey') && $('recoverFactKey').value) || 'name';
      if (!personId) { recoverSay('Choose a person first. Nothing was confirmed.'); return; }
      var token = ++recoverCommit;
      setRecoverBusy(true);
      try {
        var loaded = await FormProfiles.load();
        if (!loaded.ok) { recoverSay('Saved values are not available in this browser.'); return; }
        if (!recoverOpen(token) || $('recoverPerson').value !== personId || (($('recoverFactKey') && $('recoverFactKey').value) || 'name') !== key) {
          recoverSay('That save was cancelled because the person or kind changed. Nothing was confirmed.');
          return;
        }
        var again = await FormProfiles.load();
        if (!again.ok || !recoverOpen(token) || $('recoverPerson').value !== personId || (($('recoverFactKey') && $('recoverFactKey').value) || 'name') !== key) {
          recoverSay('That save was cancelled because the person or kind changed. Nothing was confirmed.');
          return;
        }
        var profile = again.vault.profiles.filter(function (item) { return item.id === personId; })[0];
        if (!profile) {
          recoverSay('That person is no longer saved. Nothing was confirmed.');
          refreshRecover();
          return;
        }
        var existing = (profile.facts || []).filter(function (item) { return item.key === key && item.status === 'confirmed' && item.value; })[0];
        if (existing && existing.value !== value) {
          recoverSay('A confirmed ' + key + ' is already saved for this person. Nothing was replaced.');
          return;
        }
        if (existing && existing.value === value) {
          $('recoverFactValue').value = '';
          recoverSay('That value is already confirmed.');
          refreshRecover();
          return;
        }
        var saved = await FormProfiles.persist(null, function (current) {
          if (!recoverOpen(token) || $('recoverPerson').value !== personId || (($('recoverFactKey') && $('recoverFactKey').value) || 'name') !== key) return { ok: false, reason: 'cancelled' };
          var profile = current.profiles.filter(function (item) { return item.id === personId; })[0];
          if (!profile) return { ok: false, reason: 'deleted' };
          var existing = (profile.facts || []).filter(function (item) { return item.key === key && item.status === 'confirmed' && item.value; })[0];
          if (existing && existing.value !== value) return { ok: false, reason: 'conflict' };
          if (existing && existing.value === value) return { ok: true, unchanged: true };
          var noted = FormProfiles.confirmFact(current, personId, key, value);
          if (!noted.ok || !recoverOpen(token) || $('recoverPerson').value !== personId) return { ok: false, reason: noted.ok ? 'cancelled' : (noted.reason || 'rejected') };
          return { ok: true, vault: noted.vault };
        });
        if (saved.reason === 'unchanged') {
          $('recoverFactValue').value = '';
          recoverSay('That value is already confirmed.');
          refreshRecover();
          return;
        }
        if (saved.reason === 'conflict') { recoverSay('A confirmed ' + key + ' is already saved for this person. Nothing was replaced.'); return; }
        if (saved.reason === 'deleted') { recoverSay('That person is no longer saved. Nothing was confirmed.'); refreshRecover(); return; }
        if (saved.reason === 'cancelled') { recoverSay('That save was cancelled because the person or kind changed. Nothing was confirmed.'); return; }
        if (!saved.ok) { if (token === recoverCommit) recoverSay('That value was not saved.'); return; }
        if (token !== recoverCommit) { recoverSay('That value was saved.'); refreshRecover(); return; }
        $('recoverFactValue').value = '';
        refreshRecover();
      } catch (err) {
        if (token === recoverCommit) recoverSay('That value was not saved.');
      } finally {
        if (token === recoverCommit) setRecoverBusy(false);
      }
    });
    $('assistToggle').addEventListener('click', function () {
      setPanel('recoverBar', 'assistToggle', $('recoverBar').hidden);
    });
    $('mapToggle').addEventListener('click', function () {
      var open = $('mapBox').hidden;
      $('mapBox').hidden = !open;
      $('mapToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        var focus = $('mapBox').querySelector('input, select, button');
        if (focus) focus.focus();
      } else $('mapToggle').focus();
    });
    $('fontSize').addEventListener('input', function () {
      var ann = findAnn(state.selectedId);
      if (!ann) return;
      ann.fontSize = clamp(Number($('fontSize').value) || 18, 8, 96);
      var el = document.querySelector('.ann[data-id="' + CSS.escape(ann.id) + '"]');
      if (el) { place(el, ann); fitTextHeight(el, ann); }
      scheduleFitNote();
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
      var which = desk === 'forms' ? 'this filled form' : 'this document';
      if (!confirm('Clear ' + which + ' and its marks from this browser? Saved signatures stay.')) return;
      clearTimeout(saveTimer);
      closed = true;
      state.epoch = 0;
      state.pdfBytes = null;
      try { localStorage.setItem('ff-editor-clear-generation', String(Date.now())); } catch (err) {}
      try { sessionStorage.removeItem('ff-editor-handoff'); } catch (err) {}
      await idbClear();
      if (state.doc) { try { await state.doc.destroy(); } catch (e) {} }
      state.pdfBytes = null;
      state.doc = null;
      state.pages = [];
      state.selectedId = null;
      showEmpty();
    });
    $('downloadBtn').addEventListener('click', openDownload);
    $('dlClose').addEventListener('click', closeDownload);
    $('downloadModal').addEventListener('click', function (e) {
      if (e.target === $('downloadModal')) closeDownload();
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

    function markBody(target) {
      return target && target.closest ? target.closest('.ann-body') : null;
    }
    function leaveMarkEditing(body) {
      if (!(body && body.isConnected && document.activeElement === body)) return;
      body.blur();
      if ($('addText') && !$('addText').hidden) $('addText').focus();
    }
    document.addEventListener('keydown', function (e) {
      var typing = e.target.closest && (e.target.isContentEditable || e.target.closest('input, textarea'));
      var downloadOpen = $('downloadModal') && !$('downloadModal').hidden;
      if (e.key === 'Escape' && (e.isComposing || e.keyCode === 229)) return;
      if (e.key === 'Tab' && downloadOpen) {
        var items = dialogItems($('downloadModal'));
        if (items.length) {
          var first = items[0];
          var last = items[items.length - 1];
          var active = document.activeElement;
          var inside = $('downloadModal').contains(active);
          if (e.shiftKey && (!inside || active === first)) {
            e.preventDefault();
            last.focus();
            return;
          }
          if (!e.shiftKey && (!inside || active === last)) {
            e.preventDefault();
            first.focus();
            return;
          }
        }
      }
      var sigOpen = $('sigModal') && !$('sigModal').hidden;
      if (e.key === 'Escape') {
        var editing = markBody(e.target);
        if (editing && !downloadOpen && !sigOpen) leaveMarkEditing(editing);
        if (sigOpen) $('sigModal').hidden = true;
        if (downloadOpen) closeDownload();
        else if ($('downloadModal')) $('downloadModal').hidden = true;
        if (!downloadOpen) select(null);
        var inAssist = e.target.closest && e.target.closest('#recoverBar, #mapBox');
        if (!downloadOpen && !sigOpen && (inAssist || state.recoverArmed)) {
          if ($('recoverBar') && !$('recoverBar').hidden) setPanel('recoverBar', 'assistToggle', false);
          if ($('mapBox') && !$('mapBox').hidden) {
            $('mapBox').hidden = true;
            $('mapToggle').setAttribute('aria-expanded', 'false');
          }
        }
      }
      if (downloadOpen || sigOpen) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId && !typing) {
        e.preventDefault();
        removeAnn(state.selectedId);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !typing) {
        e.preventDefault();
        undoRecover();
      }
      if (!typing && state.selectedId && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) >= 0) {
        e.preventDefault();
        var step = e.shiftKey ? 0.05 : 0.02;
        if (e.key === 'ArrowLeft') nudgeSelected(-step, 0);
        if (e.key === 'ArrowRight') nudgeSelected(step, 0);
        if (e.key === 'ArrowUp') nudgeSelected(0, -step);
        if (e.key === 'ArrowDown') nudgeSelected(0, step);
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
      var usable = pdf && session && session.pages && session.pages.length && session.source !== (desk === 'forms' ? 'edit' : 'forms');
      if (usable) {
        await loadBytes(pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf), session.fileName, session);
        if (session.reviewNote) toast(session.reviewNote);
        setSaveStatus('Saved');
        $('saveState').dataset.gen = '1';
      } else if (desk === 'forms') {
        showEmpty();
        toast('No filled form is waiting. Go back to Forms Filler and choose Fill again.');
      }
    } catch (err) {
      showEmpty();
      toast('A saved document was found but could not be restored.');
    }
  }
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted || !state.epoch) return;
    idbGet('session').then(function (session) {
      if (!session || !session.epoch || session.epoch <= state.epoch) return null;
      return idbGet('pdf').then(function (pdf) {
        if (!pdf) return null;
        return loadBytes(pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf), session.fileName, session);
      });
    }).catch(function () {});
  });
  boot();
})();
