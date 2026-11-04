/* Bind pictures into one PDF. Folders are walked with webkitdirectory and directory entries. */
(function () {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  var PAGES = {
    a4: { w: 595.28, h: 841.89 },
    letter: { w: 612, h: 792 }
  };
  var MARGIN = 18;
  var items = [];
  var pageSize = 'a4';
  var uid = 0;

  var IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif|tiff?)$/i;

  function fileLabel(file) {
    var name = file && file.name ? String(file.name) : '';
    var slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
    if (slash >= 0) name = name.slice(slash + 1);
    name = name.trim();
    return name || 'photo';
  }

  function isImage(file) {
    if (!file) return false;
    var name = fileLabel(file);
    if (!name || name === '.' || name === '..') return false;
    var type = String(file.type || '').toLowerCase();
    if (type === 'image/svg+xml' || /\.svg$/i.test(name)) return false;
    if (type.indexOf('image/') === 0) return true;
    return IMAGE_EXT.test(name);
  }

  function sortFiles(files) {
    return files.slice().sort(function (a, b) {
      return fileLabel(a).localeCompare(fileLabel(b), undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  function yieldTick() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  function readOrientation(buffer) {
    try {
      var view = new DataView(buffer);
      if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;
      var offset = 2;
      while (offset + 4 < view.byteLength) {
        var marker = view.getUint16(offset);
        if (marker === 0xffda || marker === 0xffd9) break;
        var size = view.getUint16(offset + 2);
        if (marker === 0xffe1 && offset + 10 < view.byteLength) {
          if (view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0) {
            return tiffOrientation(view, offset + 10);
          }
        }
        if (size < 2) break;
        offset += 2 + size;
      }
    } catch (e) {}
    return 1;
  }
  function tiffOrientation(view, tiff) {
    var le = view.getUint16(tiff) === 0x4949;
    var get16 = function (o) { return view.getUint16(tiff + o, le); };
    var get32 = function (o) { return view.getUint32(tiff + o, le); };
    if (get16(2) !== 42) return 1;
    var ifd = get32(4);
    if (tiff + ifd + 2 > view.byteLength) return 1;
    var count = get16(ifd);
    for (var i = 0; i < count; i++) {
      var entry = ifd + 2 + i * 12;
      if (tiff + entry + 10 > view.byteLength) break;
      if (get16(entry) === 0x0112) return get16(entry + 8);
    }
    return 1;
  }

  function drawOriented(bitmap, orientation) {
    var w = bitmap.width;
    var h = bitmap.height;
    var swap = orientation > 4;
    var canvas = document.createElement('canvas');
    canvas.width = swap ? h : w;
    canvas.height = swap ? w : h;
    var ctx = canvas.getContext('2d');
    switch (orientation) {
      case 2: ctx.translate(canvas.width, 0); ctx.scale(-1, 1); break;
      case 3: ctx.translate(canvas.width, canvas.height); ctx.rotate(Math.PI); break;
      case 4: ctx.translate(0, canvas.height); ctx.scale(1, -1); break;
      case 5: ctx.rotate(Math.PI / 2); ctx.scale(1, -1); break;
      case 6: ctx.rotate(Math.PI / 2); ctx.translate(0, -h); break;
      case 7: ctx.rotate(Math.PI / 2); ctx.translate(w, -h); ctx.scale(-1, 1); break;
      case 8: ctx.rotate(-Math.PI / 2); ctx.translate(-w, 0); break;
      default: break;
    }
    ctx.drawImage(bitmap, 0, 0);
    if (bitmap.close) bitmap.close();
    return canvas;
  }

  function loadHeic() {
    if (window.heic2any) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('HEIC support could not be loaded')); };
      document.head.appendChild(s);
    });
  }

  function jpegStoredSize(buffer) {
    var view = new DataView(buffer);
    var offset = 2;
    while (offset + 9 < view.byteLength) {
      var marker = view.getUint16(offset);
      var size = view.getUint16(offset + 2);
      if (marker === 0xffc0 || marker === 0xffc1 || marker === 0xffc2) {
        return { w: view.getUint16(offset + 7), h: view.getUint16(offset + 5) };
      }
      if (marker === 0xffda) break;
      if (size < 2) break;
      offset += 2 + size;
    }
    return null;
  }

  function decodeError(file) {
    var name = fileLabel(file);
    var type = String(file.type || '');
    if (/\.heic$|\.heif$/i.test(name) || /heic|heif/i.test(type)) {
      return name + ' is HEIC and this browser couldn’t decode it. Save it as JPG, or use Add images.';
    }
    if (/\.tiff?$/i.test(name) || /tiff/i.test(type)) {
      return name + ' is TIFF and this browser couldn’t read it.';
    }
    return 'Couldn’t read ' + name + '.';
  }

  async function decodeFile(file) {
    var name = fileLabel(file).toLowerCase();
    var type = String(file.type || '').toLowerCase();
    var heic = /\.heic$|\.heif$/.test(name) || /heic|heif/.test(type);
    if (/\.jpe?g$/.test(name) || /jpe?g/.test(type)) {
      try {
        var buf = await file.arrayBuffer();
        var orientation = readOrientation(buf);
        var blob = new Blob([buf], { type: 'image/jpeg' });
        var bmp = await createImageBitmap(blob);
        var stored = jpegStoredSize(buf);
        var swap = orientation > 4;
        var stillRaw = stored && swap && bmp.width === stored.w && bmp.height === stored.h;
        return drawOriented(bmp, stillRaw ? orientation : 1);
      } catch (err) { /* sniff the bytes below */ }
    }
    try {
      var bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return drawOriented(bitmap, 1);
    } catch (err) {
      if (!heic) throw err;
    }
    await loadHeic();
    var converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    var heicBlob = Array.isArray(converted) ? converted[0] : converted;
    var heicBmp = await createImageBitmap(heicBlob);
    return drawOriented(heicBmp, 1);
  }

  function layoutImage(imgW, imgH, pageW, pageH) {
    var boxW = pageW - MARGIN * 2;
    var boxH = pageH - MARGIN * 2;
    function fit(iw, ih) {
      var s = Math.min(boxW / iw, boxH / ih);
      return { w: iw * s, h: ih * s, area: iw * ih * s * s };
    }
    var normal = fit(imgW, imgH);
    var turned = fit(imgH, imgW);
    var rotated = false;
    var chosen = normal;
    var imgLandscape = imgW >= imgH;
    var pageLandscape = pageW >= pageH;
    if (imgLandscape !== pageLandscape && turned.area > normal.area * 1.01) {
      chosen = turned;
      rotated = true;
    }
    return {
      x: (pageW - chosen.w) / 2,
      y: (pageH - chosen.h) / 2,
      w: chosen.w,
      h: chosen.h,
      rotated: rotated
    };
  }

  function thumbFrom(canvas) {
    var maxW = 160;
    var scale = Math.min(1, maxW / canvas.width);
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(canvas.width * scale));
    c.height = Math.max(1, Math.round(canvas.height * scale));
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  }

  function showStatus(message, busy) {
    var el = document.getElementById('readStatus');
    el.hidden = !message;
    el.classList.toggle('busy', !!busy);
    el.textContent = message || '';
  }

  function showEmptyFolder(kind) {
    var box = document.getElementById('emptyFolder');
    var text = document.getElementById('emptyFolderText');
    box.hidden = false;
    text.textContent = kind === 'empty'
      ? 'The folder was allowed, but no files came through. That happens on some phones. Choose photos instead — that picker is the reliable one.'
      : 'No photos were found in that folder. This page looks for JPG, PNG, WebP, GIF, BMP, AVIF, HEIC and TIFF. Choose photos instead.';
    showStatus('');
  }

  function hideEmptyFolder() {
    document.getElementById('emptyFolder').hidden = true;
  }

  function setPicking(on) {
    document.getElementById('pickFiles').disabled = on;
    document.getElementById('pickFolder').disabled = on;
  }

  function snapshotFiles(fileList) {
    var out = [];
    if (!fileList) return out;
    for (var i = 0; i < fileList.length; i++) out.push(fileList[i]);
    return out;
  }

  async function addFiles(files) {
    var incoming = snapshotFiles(files);
    showStatus(incoming.length ? 'Reading folder…' : 'Reading folder…', true);
    setPicking(true);
    var batch = [];
    try {
      for (var i = 0; i < incoming.length; i++) {
        if (isImage(incoming[i])) batch.push(incoming[i]);
        if (i > 0 && i % 250 === 0) {
          showStatus('Checking ' + i + ' of ' + incoming.length + '…', true);
          await yieldTick();
        }
      }
      batch = sortFiles(batch);
      if (!incoming.length) {
        showEmptyFolder('empty');
        return;
      }
      if (!batch.length) {
        showEmptyFolder('none');
        return;
      }
      hideEmptyFolder();
      var failed = [];
      for (var n = 0; n < batch.length; n++) {
        showStatus('Reading ' + (n + 1) + ' of ' + batch.length + '…', true);
        try {
          var canvas = await decodeFile(batch[n]);
          items.push({
            id: ++uid,
            name: fileLabel(batch[n]),
            file: batch[n],
            width: canvas.width,
            height: canvas.height,
            thumb: thumbFrom(canvas)
          });
        } catch (err) {
          failed.push(decodeError(batch[n]));
        }
        if (n % 2 === 1) await yieldTick();
      }
      render();
      if (!items.length && failed.length) {
        showStatus(failed[0], false);
        document.getElementById('emptyFolder').hidden = false;
        document.getElementById('emptyFolderText').textContent = failed[0];
        return;
      }
      var addedCount = batch.length - failed.length;
      var lead = addedCount === 1 ? 'Added 1 photo. ' : 'Added ' + addedCount + ' photos. ';
      if (failed.length) showStatus(lead + failed[0], false);
      else showStatus(batch.length === 1 ? 'Added 1 photo.' : 'Added ' + batch.length + ' photos.', false);
    } finally {
      setPicking(false);
    }
  }

  async function walkHandle(handle, out) {
    var iter = handle.values ? handle.values() : handle.entries();
    var step = 0;
    for await (var entry of iter) {
      var child = entry && entry.kind ? entry : (entry && entry[1]);
      if (!child) continue;
      if (child.kind === 'file') {
        try {
          var file = await child.getFile();
          out.push(file);
        } catch (err) {}
      } else if (child.kind === 'directory') {
        await walkHandle(child, out);
      }
      if (++step % 40 === 0) {
        showStatus('Looking through the folder…', true);
        await yieldTick();
      }
    }
  }

  async function chooseFolder() {
    if (typeof window.showDirectoryPicker === 'function') {
      try {
        var handle = await window.showDirectoryPicker({ mode: 'read', id: 'images-to-pdf' });
        showStatus('Reading folder…', true);
        setPicking(true);
        var found = [];
        try {
          await walkHandle(handle, found);
        } catch (walkErr) {
          showStatus('Couldn’t read that folder. Choose photos instead.', false);
          document.getElementById('emptyFolder').hidden = false;
          document.getElementById('emptyFolderText').textContent = 'Couldn’t read that folder. Choose photos instead.';
          return;
        } finally {
          setPicking(false);
        }
        await addFiles(found);
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    document.getElementById('folderInput').click();
  }

  function render() {
    var list = document.getElementById('list');
    var workspace = document.getElementById('workspace');
    workspace.hidden = items.length === 0;
    document.getElementById('count').textContent = items.length + (items.length === 1 ? ' image' : ' images');
    document.getElementById('downloadBtn').disabled = items.length === 0;
    list.innerHTML = '';
    var page = PAGES[pageSize];
    items.forEach(function (item, index) {
      var row = document.createElement('div');
      row.className = 'irow';
      row.dataset.name = item.name;
      var handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'drag-handle';
      handle.setAttribute('aria-label', 'Drag to reorder ' + item.name);
      handle.textContent = '↕';
      handle.addEventListener('pointerdown', function (e) { startDrag(e, index); });
      var img = document.createElement('img');
      img.src = item.thumb;
      img.alt = '';
      var copy = document.createElement('div');
      var name = document.createElement('strong');
      name.textContent = item.name;
      var meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = item.width + ' × ' + item.height;
      copy.append(name, meta);
      var layout = layoutImage(item.width, item.height, page.w, page.h);
      var badge = document.createElement('span');
      badge.className = 'badge' + (layout.rotated ? ' on' : '');
      badge.textContent = layout.rotated ? 'Turns 90°' : (item.width >= item.height ? 'Landscape' : 'Portrait');
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove';
      remove.textContent = 'Remove';
      remove.addEventListener('click', function () {
        items.splice(index, 1);
        render();
      });
      row.append(handle, img, copy, badge, remove);
      list.appendChild(row);
    });
  }

  function startDrag(e, index) {
    e.preventDefault();
    var from = index;
    function over(ev) {
      var rows = Array.from(document.querySelectorAll('.irow'));
      var target = from;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i].getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) { target = i; break; }
        target = rows.length - 1;
      }
      if (target !== from) {
        var moved = items.splice(from, 1)[0];
        items.splice(target, 0, moved);
        from = target;
        render();
      }
    }
    function up() {
      window.removeEventListener('pointermove', over);
      window.removeEventListener('pointerup', up);
    }
    window.addEventListener('pointermove', over);
    window.addEventListener('pointerup', up);
  }

  function hasUsefulAlpha(canvas) {
    var ctx = canvas.getContext('2d');
    var stepX = Math.max(1, Math.floor(canvas.width / 32));
    var stepY = Math.max(1, Math.floor(canvas.height / 32));
    var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (var y = 0; y < canvas.height; y += stepY) {
      for (var x = 0; x < canvas.width; x += stepX) {
        if (data[(y * canvas.width + x) * 4 + 3] < 250) return true;
      }
    }
    return false;
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) reject(new Error('encode'));
        else blob.arrayBuffer().then(function (buf) { resolve(new Uint8Array(buf)); }, reject);
      }, type, quality);
    });
  }

  async function buildPdf() {
    var doc = await PDFLib.PDFDocument.create();
    var size = PAGES[pageSize];
    for (var i = 0; i < items.length; i++) {
      var canvas = await decodeFile(items[i].file);
      var layout = layoutImage(canvas.width, canvas.height, size.w, size.h);
      var page = doc.addPage([size.w, size.h]);
      var embedded;
      if (hasUsefulAlpha(canvas)) {
        embedded = await doc.embedPng(await canvasBlob(canvas, 'image/png'));
      } else {
        embedded = await doc.embedJpg(await canvasBlob(canvas, 'image/jpeg', 0.92));
      }
      if (!layout.rotated) {
        page.drawImage(embedded, { x: layout.x, y: layout.y, width: layout.w, height: layout.h });
      } else {
        page.drawImage(embedded, {
          x: layout.x + layout.w,
          y: layout.y,
          width: layout.h,
          height: layout.w,
          rotate: PDFLib.degrees(90)
        });
      }
    }
    return doc.save();
  }

  function fileOf(entry) {
    return new Promise(function (resolve, reject) { entry.file(resolve, reject); });
  }
  function readAll(reader) {
    return new Promise(function (resolve, reject) {
      var all = [];
      function batch() {
        reader.readEntries(function (entries) {
          if (!entries.length) resolve(all);
          else { all.push.apply(all, entries); batch(); }
        }, reject);
      }
      batch();
    });
  }
  async function walk(entry, out) {
    if (!entry) return;
    if (entry.isFile) {
      var file = await fileOf(entry);
      if (isImage(file)) out.push(file);
    } else if (entry.isDirectory) {
      var children = await readAll(entry.createReader());
      for (var i = 0; i < children.length; i++) await walk(children[i], out);
    }
  }
  async function collectFromEntries(entries) {
    var out = [];
    for (var i = 0; i < entries.length; i++) await walk(entries[i], out);
    return out;
  }
  window.collectFromEntries = collectFromEntries;

  function openPhotos() {
    document.getElementById('fileInput').click();
  }
  document.getElementById('pickFiles').addEventListener('click', openPhotos);
  document.getElementById('emptyPick').addEventListener('click', openPhotos);
  document.getElementById('pickFolder').addEventListener('click', function () { chooseFolder(); });
  document.getElementById('fileInput').addEventListener('change', function () {
    var input = document.getElementById('fileInput');
    var files = snapshotFiles(input.files);
    input.value = '';
    addFiles(files);
  });
  document.getElementById('folderInput').addEventListener('change', function () {
    var input = document.getElementById('folderInput');
    var files = snapshotFiles(input.files);
    input.value = '';
    addFiles(files);
  });
  document.querySelectorAll('input[name="pageSize"]').forEach(function (input) {
    input.addEventListener('change', function () {
      if (input.checked) { pageSize = input.value; render(); }
    });
  });
  document.getElementById('downloadBtn').addEventListener('click', function () {
    if (!items.length) return;
    document.getElementById('downloadModal').hidden = false;
    PdfSizes.mount(document.getElementById('sizeOptions'), {
      getBytes: buildPdf,
      nameFor: function (level) { return level === 100 ? 'bound.pdf' : 'bound-' + level + '.pdf'; }
    });
  });
  document.getElementById('dlClose').addEventListener('click', function () {
    document.getElementById('downloadModal').hidden = true;
  });
  document.getElementById('downloadModal').addEventListener('click', function (e) {
    if (e.target.id === 'downloadModal') document.getElementById('downloadModal').hidden = true;
  });

  ['dragenter', 'dragover'].forEach(function (name) {
    document.addEventListener(name, function (e) {
      e.preventDefault();
      document.getElementById('drop').classList.add('hot');
    });
  });
  document.addEventListener('dragleave', function (e) {
    if (e.target === document.documentElement) document.getElementById('drop').classList.remove('hot');
  });
  document.addEventListener('drop', async function (e) {
    e.preventDefault();
    document.getElementById('drop').classList.remove('hot');
    var dt = e.dataTransfer;
    if (!dt) return;
    var entries = [];
    var itemsList = dt.items ? Array.from(dt.items) : [];
    itemsList.forEach(function (item) {
      var entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : (item.getAsEntry ? item.getAsEntry() : null);
      if (entry) entries.push(entry);
    });
    var files = [];
    if (entries.length) files = await collectFromEntries(entries);
    if (!files.length && dt.files) files = Array.from(dt.files);
    addFiles(files);
  });
})();
