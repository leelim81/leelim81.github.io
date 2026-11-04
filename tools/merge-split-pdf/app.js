/* Merge pages from many PDFs, or split them. Bytes stay in IndexedDB. */
(function () {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var DB = 'tools-merge-split';
  var sources = [];
  var pages = [];
  var docs = {};
  var mode = 'merge';
  var splitPlan = null;
  var uid = 0;
  var saveTimer = 0;

  function $(id) { return document.getElementById(id); }
  function toast(msg) { if (window.ToolsUI) ToolsUI.toast(msg); }
  function status(msg, busy) {
    var el = $('readStatus');
    el.hidden = !msg;
    el.classList.toggle('busy', !!busy);
    el.textContent = msg || '';
  }
  function copyBytes(bytes) {
    var out = new Uint8Array(bytes.byteLength);
    out.set(bytes);
    return out;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }
  async function saveNow() {
    try {
      await DeskDB.set(DB, 'session', {
        sources: sources.map(function (s) { return { id: s.id, name: s.name, bytes: s.bytes }; }),
        pages: pages.map(function (p) { return { id: p.id, sourceId: p.sourceId, srcIndex: p.srcIndex, rotation: p.rotation || 0, selected: !!p.selected }; }),
        mode: mode
      });
    } catch (err) {}
  }

  async function pdfDoc(sourceId) {
    if (docs[sourceId]) return docs[sourceId];
    var src = sources.filter(function (s) { return s.id === sourceId; })[0];
    docs[sourceId] = await pdfjsLib.getDocument({ data: copyBytes(src.bytes) }).promise;
    return docs[sourceId];
  }

  async function thumbFor(page) {
    var doc = await pdfDoc(page.sourceId);
    var pdfPage = await doc.getPage(page.srcIndex + 1);
    var rot = ((pdfPage.rotate || 0) + (page.rotation || 0)) % 360;
    var vp = pdfPage.getViewport({ scale: 0.28, rotation: rot });
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(vp.width));
    canvas.height = Math.max(1, Math.floor(vp.height));
    await pdfPage.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport: vp }).promise;
    return canvas.toDataURL('image/jpeg', 0.72);
  }

  function sourceName(id) {
    var src = sources.filter(function (s) { return s.id === id; })[0];
    return src ? src.name : 'pdf';
  }

  function render() {
    var host = $('pages');
    host.innerHTML = '';
    pages.forEach(function (page, index) {
      var card = document.createElement('article');
      card.className = 'thumb' + (page.selected ? ' on' : '');
      card.dataset.index = String(index);
      card.dataset.name = sourceName(page.sourceId);
      var img = document.createElement('img');
      img.alt = '';
      img.src = page.thumb || '';
      var cap = document.createElement('span');
      cap.className = 'cap';
      cap.textContent = sourceName(page.sourceId) + ' · ' + (page.srcIndex + 1);
      var ops = document.createElement('div');
      ops.className = 'ops';
      var drag = document.createElement('button');
      drag.type = 'button';
      drag.className = 'drag';
      drag.textContent = '↕';
      drag.setAttribute('aria-label', 'Drag to reorder');
      drag.addEventListener('pointerdown', function (e) { startDrag(e, index); });
      var rot = document.createElement('button');
      rot.type = 'button';
      rot.textContent = '↻';
      rot.setAttribute('aria-label', 'Rotate page');
      rot.addEventListener('click', function () { rotate(index); });
      var del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Delete page');
      del.addEventListener('click', function () { pages.splice(index, 1); render(); scheduleSave(); });
      ops.append(drag, rot, del);
      card.append(img, cap, ops);
      card.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        if (mode !== 'split') return;
        page.selected = !page.selected;
        card.classList.toggle('on', page.selected);
        scheduleSave();
      });
      host.appendChild(card);
      if (!page.thumb) {
        thumbFor(page).then(function (url) {
          page.thumb = url;
          img.src = url;
        }).catch(function () {});
      }
    });
    $('downloadBtn').disabled = pages.length === 0;
    $('splitPanel').hidden = mode !== 'split';
  }

  function startDrag(e, index) {
    e.preventDefault();
    e.stopPropagation();
    var from = index;
    function over(ev) {
      var cards = Array.from(document.querySelectorAll('#pages .thumb'));
      var target = from;
      for (var i = 0; i < cards.length; i++) {
        var r = cards[i].getBoundingClientRect();
        var before = ev.clientY < r.top + r.height / 2 && ev.clientX < r.right;
        if (ev.clientY < r.top + r.height / 2 && (cards.length < 3 || ev.clientX < r.right)) {
          target = i;
          break;
        }
        target = i;
      }
      if (target !== from) {
        var moved = pages.splice(from, 1)[0];
        pages.splice(target, 0, moved);
        from = target;
        render();
      }
    }
    function up() {
      window.removeEventListener('pointermove', over);
      window.removeEventListener('pointerup', up);
      scheduleSave();
    }
    window.addEventListener('pointermove', over);
    window.addEventListener('pointerup', up);
  }

  async function rotate(index) {
    pages[index].rotation = ((pages[index].rotation || 0) + 90) % 360;
    pages[index].thumb = '';
    render();
    scheduleSave();
  }

  async function addFiles(fileList) {
    var files = [];
    for (var i = 0; i < fileList.length; i++) files.push(fileList[i]);
    if (!files.length) return;
    status('Opening PDFs…', true);
    for (var f = 0; f < files.length; f++) {
      var file = files[f];
      if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
        toast(file.name + ' is not a PDF.');
        continue;
      }
      try {
        var bytes = new Uint8Array(await file.arrayBuffer());
        var srcId = ++uid;
        sources.push({ id: srcId, name: file.name || 'document.pdf', bytes: bytes });
        var doc = await pdfjsLib.getDocument({ data: copyBytes(bytes) }).promise;
        docs[srcId] = doc;
        for (var p = 0; p < doc.numPages; p++) {
          pages.push({ id: ++uid, sourceId: srcId, srcIndex: p, rotation: 0, selected: false, thumb: '' });
        }
        status('Reading ' + (f + 1) + ' of ' + files.length + '…', true);
      } catch (err) {
        toast('Couldn’t open ' + (file.name || 'that PDF') + '.');
      }
    }
    render();
    await saveNow();
    status(pages.length ? pages.length + ' pages' : '', false);
  }

  function setMode(next) {
    mode = next;
    $('modeMerge').setAttribute('aria-pressed', next === 'merge' ? 'true' : 'false');
    $('modeSplit').setAttribute('aria-pressed', next === 'split' ? 'true' : 'false');
    if (next === 'merge') splitPlan = null;
    render();
    scheduleSave();
  }

  function parseRange(text) {
    var out = [];
    String(text || '').split(',').forEach(function (part) {
      part = part.trim();
      if (!part) return;
      var m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        var a = Number(m[1]), b = Number(m[2]);
        if (a > b) { var t = a; a = b; b = t; }
        for (var i = a; i <= b; i++) if (i >= 1 && i <= pages.length) out.push(i - 1);
      } else if (/^\d+$/.test(part)) {
        var n = Number(part);
        if (n >= 1 && n <= pages.length) out.push(n - 1);
      }
    });
    return out;
  }

  async function buildOne(list) {
    var out = await PDFLib.PDFDocument.create();
    var loaded = {};
    for (var i = 0; i < list.length; i++) {
      var page = list[i];
      var srcMeta = sources.filter(function (s) { return s.id === page.sourceId; })[0];
      if (!loaded[page.sourceId]) loaded[page.sourceId] = await PDFLib.PDFDocument.load(copyBytes(srcMeta.bytes));
      var copied = (await out.copyPages(loaded[page.sourceId], [page.srcIndex]))[0];
      var total = ((copied.getRotation().angle || 0) + (page.rotation || 0)) % 360;
      copied.setRotation(PDFLib.degrees(total));
      out.addPage(copied);
    }
    return out.save();
  }

  function planGroups() {
    if (mode === 'merge' || !splitPlan) return [pages.slice()];
    if (splitPlan.kind === 'pages') {
      var chosen = splitPlan.indexes.map(function (i) { return pages[i]; }).filter(Boolean);
      return chosen.length ? [chosen] : [];
    }
    if (splitPlan.kind === 'every') {
      var n = Math.max(1, splitPlan.n || 1);
      var groups = [];
      for (var i = 0; i < pages.length; i += n) groups.push(pages.slice(i, i + n));
      return groups;
    }
    return [pages.slice()];
  }

  async function buildOutput(levelBytesFn) {
    var groups = planGroups();
    if (!groups.length) throw new Error('No pages selected');
    var pdfs = [];
    for (var i = 0; i < groups.length; i++) {
      var raw = await buildOne(groups[i]);
      var bytes = levelBytesFn ? await levelBytesFn(raw) : raw;
      pdfs.push({ name: groups.length === 1 ? 'merged.pdf' : 'part-' + (i + 1) + '.pdf', bytes: bytes });
    }
    if (pdfs.length === 1) return { bytes: pdfs[0].bytes, zip: false };
    return { bytes: DeskZip.store(pdfs), zip: true };
  }

  async function partAt(group, level) {
    var raw = await buildOne(group);
    if (level === 100) return raw;
    try {
      var out = await PdfCompress.compressPdf(raw, { level: level, maxBytes: raw.byteLength });
      return out.bytes;
    } catch (err) {
      return raw;
    }
  }
  function openDownloadFixed() {
    if (!pages.length) return;
    var groups = planGroups();
    if (!groups.length) { toast('Choose pages to extract.'); return; }
    var zip = groups.length > 1;
    $('dlHint').textContent = zip
      ? 'Several PDFs download as one zip. Each smaller choice compresses every piece.'
      : '100% keeps the pages as they are. Smaller choices compress pictures inside them.';
    $('downloadModal').hidden = false;
    var opts = {
      mime: zip ? 'application/zip' : 'application/pdf',
      usageKey: 'merge-split',
      nameFor: function (level) {
        var ext = zip ? '.zip' : '.pdf';
        var stem = zip ? 'split' : 'merged';
        return level === 100 ? stem + ext : stem + '-' + level + ext;
      }
    };
    if (zip) {
      opts.perLevel = async function (level) {
        var parts = [];
        for (var i = 0; i < groups.length; i++) {
          parts.push({ name: 'part-' + (i + 1) + '.pdf', bytes: await partAt(groups[i], level) });
        }
        return DeskZip.store(parts);
      };
    } else {
      opts.getBytes = function () { return buildOne(groups[0]); };
    }
    PdfSizes.mount($('sizeOptions'), opts);
  }

  async function restore() {
    try {
      var session = await DeskDB.get(DB, 'session');
      if (!session || !session.sources || !session.sources.length) return;
      sources = session.sources.map(function (s) {
        return { id: s.id, name: s.name, bytes: s.bytes instanceof Uint8Array ? s.bytes : new Uint8Array(s.bytes) };
      });
      pages = session.pages || [];
      uid = sources.concat(pages).reduce(function (m, x) { return Math.max(m, x.id || 0); }, 0);
      if (session.mode) setMode(session.mode);
      status(pages.length + ' pages restored', false);
      render();
    } catch (err) {}
  }

  $('modeMerge').addEventListener('click', function () { setMode('merge'); });
  $('modeSplit').addEventListener('click', function () { setMode('split'); });
  $('addPdf').addEventListener('click', function () { $('fileInput').click(); });
  $('fileInput').addEventListener('change', function () {
    var input = $('fileInput');
    var list = input.files;
    var files = [];
    if (list) for (var i = 0; i < list.length; i++) files.push(list[i]);
    input.value = '';
    addFiles(files);
  });
  $('clearAll').addEventListener('click', async function () {
    sources = [];
    pages = [];
    docs = {};
    splitPlan = null;
    render();
    try { await DeskDB.clear(DB); } catch (err) {}
    status('', false);
  });
  $('useRange').addEventListener('click', function () {
    var idx = parseRange($('range').value);
    if (!idx.length) { toast('Type a range like 1-3, 5.'); return; }
    splitPlan = { kind: 'pages', indexes: idx };
    toast('Range ready — ' + idx.length + ' page' + (idx.length === 1 ? '' : 's') + '.');
  });
  $('useSelected').addEventListener('click', function () {
    var idx = [];
    pages.forEach(function (p, i) { if (p.selected) idx.push(i); });
    if (!idx.length) { toast('Tap pages to select them.'); return; }
    splitPlan = { kind: 'pages', indexes: idx };
    toast(idx.length + ' selected.');
  });
  $('useEvery').addEventListener('click', function () {
    var n = Math.max(1, Number($('everyN').value) || 1);
    splitPlan = { kind: 'every', n: n };
    toast('Will split every ' + n + ' page' + (n === 1 ? '' : 's') + '.');
  });
  $('useEach').addEventListener('click', function () {
    splitPlan = { kind: 'every', n: 1 };
    toast('Will split into one PDF per page.');
  });
  $('downloadBtn').addEventListener('click', openDownloadFixed);
  $('dlClose').addEventListener('click', function () { $('downloadModal').hidden = true; });
  $('downloadModal').addEventListener('click', function (e) { if (e.target.id === 'downloadModal') $('downloadModal').hidden = true; });
  ['dragenter', 'dragover'].forEach(function (name) {
    document.addEventListener(name, function (e) { e.preventDefault(); });
  });
  document.addEventListener('drop', function (e) {
    if (!e.dataTransfer || !e.dataTransfer.files) return;
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  });
  restore();
})();
