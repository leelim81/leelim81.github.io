/* Scan a page: find four corners, flatten, filter, bind into a PDF. */
(function () {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var DB = 'tools-scan-pdf';
  var pages = [];
  var active = -1;
  var uid = 0;
  var stream = null;
  var saveTimer = 0;

  function $(id) { return document.getElementById(id); }
  function toast(msg) { if (window.ToolsUI) ToolsUI.toast(msg); }
  function status(msg, busy) {
    var el = $('readStatus');
    el.hidden = !msg;
    el.classList.toggle('busy', !!busy);
    el.textContent = msg || '';
  }
  function fullCorners() {
    return [{ x: 0.04, y: 0.04 }, { x: 0.96, y: 0.04 }, { x: 0.96, y: 0.96 }, { x: 0.04, y: 0.96 }];
  }

  function detectCorners(canvas) {
    try {
      var sw = 180;
      var sh = Math.max(1, Math.round(canvas.height * sw / canvas.width));
      var small = document.createElement('canvas');
      small.width = sw;
      small.height = sh;
      var ctx = small.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(canvas, 0, 0, sw, sh);
      var data = ctx.getImageData(0, 0, sw, sh).data;
      function lum(x, y) {
        var i = (y * sw + x) * 4;
        return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      }
      var bg = (lum(1, 1) + lum(sw - 2, 1) + lum(1, sh - 2) + lum(sw - 2, sh - 2)) / 4;
      var minX = sw, minY = sh, maxX = 0, maxY = 0, count = 0;
      for (var y = 0; y < sh; y++) {
        for (var x = 0; x < sw; x++) {
          if (Math.abs(lum(x, y) - bg) > 26) {
            count++;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (count < sw * sh * 0.03 || maxX - minX < 12 || maxY - minY < 12) return { corners: fullCorners(), found: false };
      var pad = 1;
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(sw - 1, maxX + pad);
      maxY = Math.min(sh - 1, maxY + pad);
      return {
        found: true,
        corners: [
          { x: minX / sw, y: minY / sh },
          { x: maxX / sw, y: minY / sh },
          { x: maxX / sw, y: maxY / sh },
          { x: minX / sw, y: maxY / sh }
        ]
      };
    } catch (err) {
      return { corners: fullCorners(), found: false };
    }
  }

  function solve(A, b) {
    var n = b.length;
    var m = A.map(function (row, i) { return row.concat([b[i]]); });
    for (var col = 0; col < n; col++) {
      var pivot = col;
      for (var r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
      var tmp = m[col]; m[col] = m[pivot]; m[pivot] = tmp;
      var div = m[col][col] || 1e-12;
      for (var c = col; c <= n; c++) m[col][c] /= div;
      for (var r2 = 0; r2 < n; r2++) {
        if (r2 === col) continue;
        var f = m[r2][col];
        for (var c2 = col; c2 <= n; c2++) m[r2][c2] -= f * m[col][c2];
      }
    }
    return m.map(function (row) { return row[n]; });
  }
  function homography(from, to) {
    var A = [], b = [];
    for (var i = 0; i < 4; i++) {
      var x = from[i].x, y = from[i].y, X = to[i].x, Y = to[i].y;
      A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
      b.push(X);
      A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
      b.push(Y);
    }
    var h = solve(A, b);
    h.push(1);
    return h;
  }
  function applyH(h, x, y) {
    var w = h[6] * x + h[7] * y + h[8];
    return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
  }
  function sample(data, w, h, x, y) {
    if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return [255, 255, 255, 255];
    var x0 = Math.floor(x), y0 = Math.floor(y);
    var dx = x - x0, dy = y - y0;
    function px(ix, iy) {
      var i = (iy * w + ix) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    }
    var a = px(x0, y0), b = px(x0 + 1, y0), c = px(x0, y0 + 1), d = px(x0 + 1, y0 + 1);
    var o = [0, 0, 0, 0];
    for (var k = 0; k < 4; k++) {
      o[k] = a[k] * (1 - dx) * (1 - dy) + b[k] * dx * (1 - dy) + c[k] * (1 - dx) * dy + d[k] * dx * dy;
    }
    return o;
  }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function warp(canvas, corners) {
    var sw = canvas.width, sh = canvas.height;
    var src = corners.map(function (p) { return { x: p.x * sw, y: p.y * sh }; });
    var dw = Math.max(src[0].x === undefined ? 2 : 2, Math.round(Math.max(dist(src[0], src[1]), dist(src[3], src[2]))));
    var dh = Math.max(2, Math.round(Math.max(dist(src[0], src[3]), dist(src[1], src[2]))));
    var cap = 1200;
    var sc = Math.min(1, cap / Math.max(dw, dh));
    dw = Math.max(2, Math.round(dw * sc));
    dh = Math.max(2, Math.round(dh * sc));
    var dest = [{ x: 0, y: 0 }, { x: dw, y: 0 }, { x: dw, y: dh }, { x: 0, y: dh }];
    var H = homography(dest, src);
    var sctx = canvas.getContext('2d', { willReadFrequently: true });
    var srcData = sctx.getImageData(0, 0, sw, sh).data;
    var out = document.createElement('canvas');
    out.width = dw;
    out.height = dh;
    var img = out.getContext('2d').createImageData(dw, dh);
    var o = img.data;
    for (var y = 0; y < dh; y++) {
      for (var x = 0; x < dw; x++) {
        var p = applyH(H, x + 0.5, y + 0.5);
        var px = sample(srcData, sw, sh, p.x, p.y);
        var i = (y * dw + x) * 4;
        o[i] = px[0]; o[i + 1] = px[1]; o[i + 2] = px[2]; o[i + 3] = 255;
      }
    }
    out.getContext('2d').putImageData(img, 0, 0);
    return out;
  }
  function filterCanvas(canvas, kind) {
    if (kind === 'original') return canvas;
    var c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0);
    var img = ctx.getImageData(0, 0, c.width, c.height);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var r = d[i], g = d[i + 1], b = d[i + 2];
      var y = r * 0.299 + g * 0.587 + b * 0.114;
      if (kind === 'grey') {
        d[i] = d[i + 1] = d[i + 2] = y;
      } else if (kind === 'bw') {
        var v = y > 168 ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
      } else {
        var c1 = (r - 128) * 1.25 + 128;
        var c2 = (g - 128) * 1.25 + 128;
        var c3 = (b - 128) * 1.25 + 128;
        d[i] = Math.max(0, Math.min(255, c1 + 8));
        d[i + 1] = Math.max(0, Math.min(255, c2 + 8));
        d[i + 2] = Math.max(0, Math.min(255, c3 + 8));
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  function jpegBytes(canvas, q) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) reject(new Error('jpeg'));
        else blob.arrayBuffer().then(function (b) { resolve(new Uint8Array(b)); }, reject);
      }, 'image/jpeg', q || 0.92);
    });
  }

  function current() { return pages[active]; }
  function redrawSource() {
    var page = current();
    if (!page) return;
    var canvas = $('source');
    var maxW = 900;
    var sc = Math.min(1, maxW / page.source.width);
    canvas.width = Math.max(1, Math.round(page.source.width * sc));
    canvas.height = Math.max(1, Math.round(page.source.height * sc));
    canvas.getContext('2d').drawImage(page.source, 0, 0, canvas.width, canvas.height);
    canvas._scale = sc;
    placeHandles();
  }
  function placeHandles() {
    var page = current();
    var stage = $('stage');
    stage.querySelectorAll('.handle').forEach(function (n) { n.remove(); });
    if (!page) return;
    page.corners.forEach(function (corner, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'handle';
      btn.dataset.corner = String(i);
      btn.style.left = (corner.x * 100) + '%';
      btn.style.top = (corner.y * 100) + '%';
      btn.setAttribute('aria-label', 'Corner ' + (i + 1));
      btn.addEventListener('pointerdown', function (e) { dragCorner(e, i); });
      stage.appendChild(btn);
    });
  }
  function dragCorner(e, index) {
    e.preventDefault();
    var stage = $('stage');
    try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
    function move(ev) {
      var r = stage.getBoundingClientRect();
      pages[active].corners[index] = {
        x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
        y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))
      };
      placeHandles();
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      refreshFlat();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  function refreshFlat() {
    var page = current();
    if (!page) return;
    try {
      var flat = warp(page.source, page.corners);
      page.flat = filterCanvas(flat, page.filter);
    } catch (err) {
      page.flat = page.source;
    }
    page.thumb = page.flat.toDataURL('image/jpeg', 0.7);
    renderList();
    scheduleSave();
  }
  function renderList() {
    var host = $('pages');
    host.innerHTML = '';
    pages.forEach(function (page, index) {
      var card = document.createElement('article');
      card.className = 'thumb' + (index === active ? ' on' : '');
      card.dataset.index = String(index);
      var img = document.createElement('img');
      img.alt = 'Page ' + (index + 1);
      img.src = page.thumb || '';
      var cap = document.createElement('span');
      cap.className = 'cap';
      cap.textContent = 'Page ' + (index + 1);
      var ops = document.createElement('div');
      ops.className = 'ops';
      var drag = document.createElement('button');
      drag.type = 'button';
      drag.className = 'drag';
      drag.textContent = '↕';
      drag.setAttribute('aria-label', 'Reorder');
      drag.addEventListener('pointerdown', function (e) { startDrag(e, index); });
      var del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Delete page');
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        pages.splice(index, 1);
        if (active >= pages.length) active = pages.length - 1;
        showActive();
        renderList();
        scheduleSave();
      });
      ops.append(drag, del);
      card.append(img, cap, ops);
      card.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        active = index;
        showActive();
        renderList();
      });
      host.appendChild(card);
    });
    $('downloadBtn').disabled = pages.length === 0;
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
        if (ev.clientY < r.top + r.height / 2) { target = i; break; }
        target = i;
      }
      if (target !== from) {
        var moved = pages.splice(from, 1)[0];
        pages.splice(target, 0, moved);
        if (active === from) active = target;
        else if (active === target) active = from;
        from = target;
        renderList();
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
  function showActive() {
    var page = current();
    $('adjust').hidden = !page;
    if (!page) return;
    $('detectNote').textContent = page.found
      ? 'Edges found. Drag a corner if the outline is off.'
      : 'Couldn’t find the page edges. Drag the four corners yourself.';
    document.querySelectorAll('.filters button').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.filter === page.filter ? 'true' : 'false');
    });
    redrawSource();
  }
  async function addCanvas(canvas, name) {
    var found = detectCorners(canvas);
    var page = {
      id: ++uid,
      name: name || 'scan',
      source: canvas,
      corners: found.corners,
      found: found.found,
      filter: 'clean',
      flat: null,
      thumb: ''
    };
    pages.push(page);
    active = pages.length - 1;
    refreshFlat();
    showActive();
    status(pages.length + ' page' + (pages.length === 1 ? '' : 's'), false);
  }
  async function addFile(file) {
    if (!DeskImages.isImage(file)) { toast('That file is not a photo.'); return; }
    status('Opening…', true);
    try {
      var canvas = await DeskImages.decode(file);
      await addCanvas(canvas, DeskImages.fileLabel(file));
    } catch (err) {
      toast(err && err.message ? err.message : 'Couldn’t read that photo.');
      status('', false);
    }
  }

  async function buildPdf() {
    var doc = await PDFLib.PDFDocument.create();
    for (var i = 0; i < pages.length; i++) {
      var jpg = await jpegBytes(pages[i].flat || pages[i].source, 0.92);
      var img = await doc.embedJpg(jpg);
      var pw = 595.28, ph = 841.89, margin = 28;
      var s = Math.min((pw - margin * 2) / img.width, (ph - margin * 2) / img.height);
      var w = img.width * s, h = img.height * s;
      var pdfPage = doc.addPage([pw, ph]);
      pdfPage.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
    return doc.save();
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var payload = {
        active: active,
        pages: pages.map(function (p) {
          return {
            id: p.id,
            name: p.name,
            corners: p.corners,
            found: p.found,
            filter: p.filter,
            image: p.source.toDataURL('image/jpeg', 0.85)
          };
        })
      };
      DeskDB.set(DB, 'session', payload).catch(function () {});
    }, 400);
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('This browser has no camera. Add a photo instead.');
      $('fileInput').click();
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      $('video').srcObject = stream;
      $('live').hidden = false;
    } catch (err) {
      toast('Camera permission was blocked. Add a photo instead.');
      $('fileInput').click();
    }
  }
  function stopCamera() {
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
    $('live').hidden = true;
  }

  $('addBtn').addEventListener('click', function () { $('fileInput').click(); });
  $('fileInput').addEventListener('change', async function () {
    var input = $('fileInput');
    var files = [];
    if (input.files) for (var i = 0; i < input.files.length; i++) files.push(input.files[i]);
    input.value = '';
    for (var n = 0; n < files.length; n++) await addFile(files[n]);
  });
  $('camBtn').addEventListener('click', startCamera);
  $('camOff').addEventListener('click', stopCamera);
  $('shutter').addEventListener('click', function () {
    var video = $('video');
    if (!video.videoWidth) return;
    var canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    addCanvas(canvas, 'camera');
  });
  $('redetect').addEventListener('click', function () {
    var page = current();
    if (!page) return;
    var found = detectCorners(page.source);
    page.corners = found.corners;
    page.found = found.found;
    showActive();
    refreshFlat();
  });
  document.querySelectorAll('.filters button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var page = current();
      if (!page) return;
      page.filter = btn.dataset.filter;
      showActive();
      refreshFlat();
    });
  });
  $('clearAll').addEventListener('click', function () {
    pages = [];
    active = -1;
    showActive();
    renderList();
    DeskDB.clear(DB).catch(function () {});
    status('', false);
  });
  $('downloadBtn').addEventListener('click', function () {
    if (!pages.length) return;
    $('downloadModal').hidden = false;
    PdfSizes.mount($('sizeOptions'), {
      usageKey: 'scan-to-pdf',
      nameFor: function (level) { return level === 100 ? 'scan.pdf' : 'scan-' + level + '.pdf'; },
      getBytes: buildPdf
    });
  });
  $('dlClose').addEventListener('click', function () { $('downloadModal').hidden = true; });
  $('downloadModal').addEventListener('click', function (e) { if (e.target.id === 'downloadModal') $('downloadModal').hidden = true; });

  DeskDB.get(DB, 'session').then(async function (session) {
    if (!session || !session.pages || !session.pages.length) return;
    status('Restoring…', true);
    for (var i = 0; i < session.pages.length; i++) {
      var rec = session.pages[i];
      var img = new Image();
      await new Promise(function (resolve) { img.onload = resolve; img.src = rec.image; });
      var canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      pages.push({
        id: rec.id,
        name: rec.name,
        source: canvas,
        corners: rec.corners,
        found: rec.found,
        filter: rec.filter || 'clean',
        flat: null,
        thumb: ''
      });
      uid = Math.max(uid, rec.id || 0);
      active = pages.length - 1;
      refreshFlat();
    }
    active = Math.min(session.active || 0, pages.length - 1);
    showActive();
    renderList();
    status('', false);
  }).catch(function () {});
})();
