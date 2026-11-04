/* Resize photos to a size, a percent, or exact pixels. Nothing is uploaded. */
(function () {
  var DB = 'tools-photo-resize';
  var items = [];
  var uid = 0;
  var job = 0;
  var saveTimer = 0;
  var aspect = 1;

  function $(id) { return document.getElementById(id); }
  function toast(msg) { if (window.ToolsUI) ToolsUI.toast(msg); }
  function status(msg, busy) {
    var el = $('readStatus');
    el.hidden = !msg;
    el.classList.toggle('busy', !!busy);
    el.textContent = msg || '';
  }
  function extFor(mime) {
    if (mime === 'image/webp') return '.webp';
    if (mime === 'image/png') return '.png';
    return '.jpg';
  }
  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }
  function encode(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) reject(new Error('encode'));
        else blob.arrayBuffer().then(function (buf) { resolve(new Uint8Array(buf)); }, reject);
      }, mime, quality);
    });
  }
  function scaleTo(canvas, w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, c.width, c.height);
    return c;
  }
  function settings() {
    return {
      mode: $('mode').value,
      target: $('target').value,
      customKb: Number($('customKb').value) || 200,
      percent: Math.min(100, Math.max(1, Number($('percent').value) || 50)),
      pxW: Math.max(1, Number($('pxW').value) || 1),
      pxH: Math.max(1, Number($('pxH').value) || 1),
      lock: $('lock').checked,
      mime: $('mime').value
    };
  }
  function limitBytes(s) {
    if (s.target === 'custom') return Math.max(10, s.customKb) * 1024;
    return Number(s.target) || 1048576;
  }
  async function fitUnder(canvas, mime, limit) {
    var scale = 1;
    var q = mime === 'image/png' ? undefined : 0.86;
    var best = null;
    for (var i = 0; i < 9; i++) {
      var c = scale === 1 ? canvas : scaleTo(canvas, canvas.width * scale, canvas.height * scale);
      var bytes = await encode(c, mime, q);
      if (!best || bytes.length < best.length) best = bytes;
      if (bytes.length <= limit) return bytes;
      if (mime !== 'image/png' && q > 0.42) q = Math.round((q - 0.1) * 100) / 100;
      else scale *= 0.82;
    }
    return best;
  }
  async function renderItem(item, s) {
    var canvas = item.canvas;
    var mime = s.mime;
    if (s.mode === 'percent') {
      var p = s.percent / 100;
      return encode(scaleTo(canvas, canvas.width * p, canvas.height * p), mime, mime === 'image/png' ? undefined : 0.9);
    }
    if (s.mode === 'pixels') {
      return encode(scaleTo(canvas, s.pxW, s.pxH), mime, mime === 'image/png' ? undefined : 0.9);
    }
    return fitUnder(canvas, mime, limitBytes(s));
  }
  function showFields() {
    var mode = $('mode').value;
    $('sizeField').hidden = mode !== 'size';
    $('customField').hidden = !(mode === 'size' && $('target').value === 'custom');
    $('percentField').hidden = mode !== 'percent';
    $('wField').hidden = mode !== 'pixels';
    $('hField').hidden = mode !== 'pixels';
    $('lockField').hidden = mode !== 'pixels';
  }
  function saveBlob(bytes, name, mime) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: mime }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    try { if (window.ToolsUsage) ToolsUsage.recordUse('photo-resize'); } catch (err) {}
  }
  function paint() {
    var host = $('list');
    host.innerHTML = '';
    var mime = $('mime').value;
    items.forEach(function (item) {
      var card = document.createElement('article');
      card.className = 'thumb';
      card.dataset.name = item.name;
      var img = document.createElement('img');
      img.alt = '';
      img.src = item.preview || '';
      var cap = document.createElement('span');
      cap.className = 'cap';
      cap.textContent = item.name;
      var meta = document.createElement('span');
      meta.className = 'meta out';
      meta.textContent = item.outBytes ? formatBytes(item.outBytes.length) + ' · ' + (item.outW || '?') + '×' + (item.outH || '?') : '…';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = 'Download';
      btn.disabled = !item.outBytes;
      btn.addEventListener('click', function () {
        if (!item.outBytes) return;
        var base = item.name.replace(/\.[^.]+$/, '');
        saveBlob(item.outBytes, base + extFor(mime), mime);
      });
      card.append(img, cap, meta, btn);
      host.appendChild(card);
    });
    $('downloadAll').disabled = !items.some(function (it) { return it.outBytes; });
  }
  async function recompute() {
    var token = ++job;
    var s = settings();
    showFields();
    if (!items.length) { paint(); return; }
    status('Sizing…', true);
    for (var i = 0; i < items.length; i++) {
      if (token !== job) return;
      try {
        var bytes = await renderItem(items[i], s);
        if (token !== job) return;
        items[i].outBytes = bytes;
        var bmp = await createImageBitmap(new Blob([bytes], { type: s.mime }));
        items[i].outW = bmp.width;
        items[i].outH = bmp.height;
        if (bmp.close) bmp.close();
      } catch (err) {
        items[i].outBytes = null;
      }
      paint();
    }
    status('', false);
    scheduleSave();
  }
  function schedule() {
    clearTimeout(schedule.t);
    schedule.t = setTimeout(recompute, 180);
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      DeskDB.set(DB, 'session', {
        files: items.map(function (it) { return { id: it.id, name: it.name, bytes: it.bytes }; }),
        settings: settings()
      }).catch(function () {});
    }, 300);
  }
  async function addFiles(list) {
    var files = [];
    for (var i = 0; i < list.length; i++) files.push(list[i]);
    var images = files.filter(DeskImages.isImage);
    if (!files.length) return;
    if (!images.length) { toast('No photos in that selection.'); return; }
    status('Opening photos…', true);
    for (var n = 0; n < images.length; n++) {
      try {
        var canvas = await DeskImages.decode(images[n]);
        var bytes = new Uint8Array(await images[n].arrayBuffer());
        items.push({
          id: ++uid,
          name: DeskImages.fileLabel(images[n]),
          bytes: bytes,
          canvas: canvas,
          preview: canvas.toDataURL('image/jpeg', 0.7)
        });
        if (items.length === 1) {
          aspect = canvas.width / canvas.height;
          $('pxW').value = canvas.width;
          $('pxH').value = canvas.height;
        }
      } catch (err) {
        toast(err && err.message ? err.message : 'Couldn’t read ' + DeskImages.fileLabel(images[n]) + '.');
      }
    }
    status(items.length ? '' : '', false);
    paint();
    recompute();
  }
  function applySettings(s) {
    if (!s) return;
    $('mode').value = s.mode || 'size';
    if (s.target) $('target').value = s.target;
    if (s.customKb) $('customKb').value = s.customKb;
    if (s.percent) $('percent').value = s.percent;
    if (s.pxW) $('pxW').value = s.pxW;
    if (s.pxH) $('pxH').value = s.pxH;
    $('lock').checked = s.lock !== false;
    if (s.mime) $('mime').value = s.mime;
    showFields();
  }
  $('mode').addEventListener('change', schedule);
  $('target').addEventListener('change', function () { showFields(); schedule(); });
  ['customKb', 'percent', 'pxW', 'pxH', 'mime'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      if ($('lock').checked && (id === 'pxW' || id === 'pxH') && aspect) {
        if (id === 'pxW') $('pxH').value = Math.max(1, Math.round(Number($('pxW').value) / aspect));
        else $('pxW').value = Math.max(1, Math.round(Number($('pxH').value) * aspect));
      }
      schedule();
    });
  });
  $('lock').addEventListener('change', function () {
    if ($('lock').checked && items[0]) aspect = items[0].canvas.width / items[0].canvas.height;
  });
  $('addBtn').addEventListener('click', function () { $('fileInput').click(); });
  $('fileInput').addEventListener('change', function () {
    var input = $('fileInput');
    var files = [];
    if (input.files) for (var i = 0; i < input.files.length; i++) files.push(input.files[i]);
    input.value = '';
    addFiles(files);
  });
  $('clearAll').addEventListener('click', function () {
    items = [];
    paint();
    DeskDB.clear(DB).catch(function () {});
  });
  $('downloadAll').addEventListener('click', function () {
    var ready = items.filter(function (it) { return it.outBytes; });
    if (!ready.length) return;
    var mime = $('mime').value;
    if (ready.length === 1) {
      saveBlob(ready[0].outBytes, ready[0].name.replace(/\.[^.]+$/, '') + extFor(mime), mime);
      return;
    }
    var zip = DeskZip.store(ready.map(function (it, i) {
      return { name: (i + 1) + '-' + it.name.replace(/\.[^.]+$/, '') + extFor(mime), bytes: it.outBytes };
    }));
    saveBlob(zip, 'photos.zip', 'application/zip');
  });
  ['dragenter', 'dragover'].forEach(function (name) {
    document.addEventListener(name, function (e) { e.preventDefault(); });
  });
  document.addEventListener('drop', function (e) {
    if (!e.dataTransfer) return;
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  });
  showFields();
  DeskDB.get(DB, 'session').then(async function (session) {
    if (!session || !session.files || !session.files.length) return;
    applySettings(session.settings);
    status('Restoring…', true);
    for (var i = 0; i < session.files.length; i++) {
      var rec = session.files[i];
      var bytes = rec.bytes instanceof Uint8Array ? rec.bytes : new Uint8Array(rec.bytes);
      try {
        var file = new File([bytes], rec.name, { type: '' });
        var canvas = await DeskImages.decode(file);
        items.push({ id: rec.id, name: rec.name, bytes: bytes, canvas: canvas, preview: canvas.toDataURL('image/jpeg', 0.7) });
        uid = Math.max(uid, rec.id || 0);
      } catch (err) {}
    }
    if (items[0]) aspect = items[0].canvas.width / items[0].canvas.height;
    status('', false);
    recompute();
  }).catch(function () {});
})();
