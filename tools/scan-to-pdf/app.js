/* Scan to PDF: learned corners, full-resolution warp, phone-reachable adjust. */
(function () {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var DB = 'tools-scan-pdf';
  var pages = [];
  var active = -1;
  var uid = 0;
  var stream = null;
  var saveTimer = 0;
  var flatTimer = 0;
  var liveTimer = 0;
  var stableSince = 0;
  var lastLive = null;
  var capturing = false;
  var handles = [];

  function $(id) { return document.getElementById(id); }
  function toast(msg) { if (window.ToolsUI) ToolsUI.toast(msg); }
  function status(msg, busy) {
    var el = $('readStatus');
    el.hidden = !msg;
    el.classList.toggle('busy', !!busy);
    el.textContent = msg || '';
  }
  function current() { return pages[active] || null; }
  function cloneCorners(cs) { return cs.map(function (p) { return { x: p.x, y: p.y }; }); }

  function renderList() {
    var host = $('pages');
    host.innerHTML = '';
    pages.forEach(function (page, index) {
      var card = document.createElement('article');
      card.className = 'thumb' + (index === active ? ' on' : '');
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
    $('dock').hidden = pages.length === 0 && $('live').hidden;
    $('intro').hidden = pages.length > 0;
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
        else if (from < active && target >= active) active--;
        else if (from > active && target <= active) active++;
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
    $('shutter').hidden = $('live').hidden;
    $('camOff').hidden = $('live').hidden;
    if (!page) { clearHandles(); return; }
    $('detectNote').textContent = page.found
      ? 'Outline locked. Drag a corner only if it misses — the loupe stays above your thumb.'
      : 'No clear page. Drag the corners, or use the full image.';
    document.querySelectorAll('.filters button').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.filter === page.filter ? 'true' : 'false');
    });
    drawSource(page);
    placeHandles(page);
    scheduleFlat();
  }

  function drawSource(page) {
    var view = $('source');
    view.width = page.source.width;
    view.height = page.source.height;
    view.getContext('2d').drawImage(page.source, 0, 0);
  }

  function clearHandles() {
    handles.forEach(function (h) { h.remove(); });
    handles = [];
    var old = $('stage').querySelector('svg');
    if (old) old.remove();
  }

  function placeHandles(page) {
    clearHandles();
    var stage = $('stage');
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'quad');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('fill', 'rgba(194,59,34,0.12)');
    poly.setAttribute('stroke', '#c23b22');
    poly.setAttribute('stroke-width', '3');
    poly.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(poly);
    stage.appendChild(svg);
    function add(kind, index) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'handle' + (kind === 'edge' ? ' edge' : '');
      b.dataset.kind = kind;
      b.dataset.index = String(index);
      b.setAttribute('aria-label', kind === 'edge' ? 'Edge' : 'Corner');
      b.addEventListener('pointerdown', onHandleDown);
      stage.appendChild(b);
      handles.push(b);
    }
    for (var i = 0; i < 4; i++) add('corner', i);
    for (var e = 0; e < 4; e++) add('edge', e);
    moveHandles(page);
  }

  function moveHandles(page) {
    var poly = $('stage').querySelector('polygon');
    if (poly) {
      poly.setAttribute('points', page.corners.map(function (p) {
        return (p.x * 100) + ',' + (p.y * 100);
      }).join(' '));
    }
    handles.forEach(function (b) {
      var i = Number(b.dataset.index);
      var p;
      if (b.dataset.kind === 'corner') p = page.corners[i];
      else {
        var a = page.corners[i], c = page.corners[(i + 1) % 4];
        p = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
      }
      b.style.left = (p.x * 100) + '%';
      b.style.top = (p.y * 100) + '%';
    });
  }

  function canvasPoint(page, nx, ny) {
    return { x: nx * page.source.width, y: ny * page.source.height };
  }

  function showLoupe(page, nx, ny, clientX, clientY) {
    var loupe = $('loupe');
    var zoom = 2.8;
    var size = loupe.width;
    var ctx = loupe.getContext('2d');
    var pt = canvasPoint(page, nx, ny);
    var sw = size / zoom;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(page.source, pt.x - sw / 2, pt.y - sw / 2, sw, sw, 0, 0, size, size);
    ctx.strokeStyle = '#c23b22';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(size / 2, 8);
    ctx.lineTo(size / 2, size - 8);
    ctx.moveTo(8, size / 2);
    ctx.lineTo(size - 8, size / 2);
    ctx.stroke();
    loupe.hidden = false;
    var x = clientX - size / 2;
    var y = clientY - size - 28;
    if (y < 8) y = clientY + 36;
    loupe.style.left = Math.max(8, Math.min(window.innerWidth - size - 8, x)) + 'px';
    loupe.style.top = y + 'px';
  }

  function hideLoupe() { $('loupe').hidden = true; }

  function onHandleDown(ev) {
    var page = current();
    if (!page) return;
    ev.preventDefault();
    var btn = ev.currentTarget;
    try { btn.setPointerCapture(ev.pointerId); } catch (err) {}
    var kind = btn.dataset.kind;
    var index = Number(btn.dataset.index);
    var origin = pointerNorm(ev);
    var start = cloneCorners(page.corners);
    function move(e) {
      var now = pointerNorm(e);
      var dx = now.x - origin.x, dy = now.y - origin.y;
      if (kind === 'corner') {
        page.corners[index] = clampPt(start[index].x + dx, start[index].y + dy);
      } else {
        var j = (index + 1) % 4;
        page.corners[index] = clampPt(start[index].x + dx, start[index].y + dy);
        page.corners[j] = clampPt(start[j].x + dx, start[j].y + dy);
      }
      moveHandles(page);
      var focus = kind === 'corner' ? page.corners[index] : {
        x: (page.corners[index].x + page.corners[(index + 1) % 4].x) / 2,
        y: (page.corners[index].y + page.corners[(index + 1) % 4].y) / 2
      };
      showLoupe(page, focus.x, focus.y, e.clientX, e.clientY);
    }
    function up() {
      btn.removeEventListener('pointermove', move);
      btn.removeEventListener('pointerup', up);
      hideLoupe();
      page.found = true;
      scheduleFlat();
      scheduleSave();
    }
    btn.addEventListener('pointermove', move);
    btn.addEventListener('pointerup', up);
    var focus0 = kind === 'corner' ? page.corners[index] : {
      x: (page.corners[index].x + page.corners[(index + 1) % 4].x) / 2,
      y: (page.corners[index].y + page.corners[(index + 1) % 4].y) / 2
    };
    showLoupe(page, focus0.x, focus0.y, ev.clientX, ev.clientY);
  }

  function pointerNorm(ev) {
    var rect = $('source').getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) / rect.width,
      y: (ev.clientY - rect.top) / rect.height
    };
  }
  function clampPt(x, y) {
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  }

  /* Grab a handle from a nearby touch, not only on the dot. */
  $('stage').addEventListener('pointerdown', function (ev) {
    if (ev.target.closest('.handle')) return;
    var page = current();
    if (!page) return;
    var rect = $('source').getBoundingClientRect();
    var best = null, bestD = 56;
    handles.forEach(function (b) {
      var r = b.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var d = Math.hypot(ev.clientX - cx, ev.clientY - cy);
      if (d < bestD) { bestD = d; best = b; }
    });
    if (!best) return;
    if (ev.clientX < rect.left - 48 || ev.clientY < rect.top - 48) return;
    best.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, clientX: ev.clientX, clientY: ev.clientY, pointerId: ev.pointerId
    }));
  });

  function scheduleFlat() {
    clearTimeout(flatTimer);
    flatTimer = setTimeout(refreshFlat, 80);
  }

  function refreshFlat() {
    var page = current();
    if (!page) return;
    var flat = ScanWarp.warp(page.source, page.corners);
    ScanWarp.enhance(flat, page.filter === 'original' ? 'original' : page.filter);
    page.flat = flat;
    var thumb = document.createElement('canvas');
    var tw = 240, th = Math.max(1, Math.round(flat.height * tw / flat.width));
    thumb.width = tw; thumb.height = th;
    thumb.getContext('2d').drawImage(flat, 0, 0, tw, th);
    page.thumb = thumb.toDataURL('image/jpeg', 0.8);
    renderList();
  }

  async function addCanvas(canvas, name, bytes) {
    status('Finding the page…', true);
    var found;
    try { found = await ScanDetect.detect(canvas); }
    catch (err) { found = ScanDetect.legacy(canvas); }
    var page = {
      id: ++uid,
      name: name || 'scan',
      source: canvas,
      bytes: bytes || null,
      corners: found.corners,
      autoCorners: cloneCorners(found.corners),
      found: !!found.found,
      filter: 'clean',
      flat: null,
      thumb: ''
    };
    pages.push(page);
    active = pages.length - 1;
    showActive();
    refreshFlat();
    scheduleSave();
    status(pages.length + ' page' + (pages.length === 1 ? '' : 's'), false);
  }

  async function canvasFromBlob(blob) {
    var bmp = await createImageBitmap(blob);
    var canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    canvas.getContext('2d').drawImage(bmp, 0, 0);
    bmp.close && bmp.close();
    var bytes = new Uint8Array(await blob.arrayBuffer());
    return { canvas: canvas, bytes: bytes };
  }

  async function addFile(file) {
    if (!DeskImages.isImage(file)) { toast('That file is not a photo.'); return; }
    status('Opening…', true);
    try {
      var canvas = await DeskImages.decode(file);
      var bytes = new Uint8Array(await file.arrayBuffer());
      await addCanvas(canvas, DeskImages.fileLabel(file), bytes);
    } catch (err) {
      toast(err && err.message ? err.message : 'Couldn’t read that photo.');
      status('', false);
    }
  }

  async function buildPdf() {
    var doc = await PDFLib.PDFDocument.create();
    for (var i = 0; i < pages.length; i++) {
      var page = pages[i];
      if (!page.flat) {
        page.flat = ScanWarp.warp(page.source, page.corners);
        ScanWarp.enhance(page.flat, page.filter);
      }
      var encoded = await ScanWarp.encode(page.flat, page.filter);
      var embedded = page.filter === 'bw'
        ? await doc.embedPng(encoded.bytes)
        : await doc.embedJpg(encoded.bytes);
      var pw = embedded.width * 72 / 300;
      var ph = embedded.height * 72 / 300;
      var pdfPage = doc.addPage([pw, ph]);
      pdfPage.drawImage(embedded, { x: 0, y: 0, width: pw, height: ph });
    }
    var saved = await doc.save();
    return new Uint8Array(saved);
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }
  async function saveNow() {
    var payloadPages = [];
    for (var i = 0; i < pages.length; i++) {
      var p = pages[i];
      var image = p.bytes;
      if (!image) {
        var blob = await new Promise(function (resolve) { p.source.toBlob(resolve, 'image/jpeg', 0.92); });
        image = new Uint8Array(await blob.arrayBuffer());
        p.bytes = image;
      }
      payloadPages.push({
        id: p.id,
        name: p.name,
        corners: p.corners,
        autoCorners: p.autoCorners,
        found: p.found,
        filter: p.filter,
        image: image
      });
    }
    DeskDB.set(DB, 'session', { active: active, pages: payloadPages }).catch(function () {});
  }

  function drawLiveQuad(corners) {
    var video = $('video');
    var overlay = $('liveOverlay');
    var rect = video.getBoundingClientRect();
    overlay.width = Math.max(2, Math.round(rect.width));
    overlay.height = Math.max(2, Math.round(rect.height));
    var ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (!corners) return;
    ctx.beginPath();
    corners.forEach(function (p, i) {
      var x = p.x * overlay.width, y = p.y * overlay.height;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(194,59,34,0.18)';
    ctx.strokeStyle = '#c23b22';
    ctx.lineWidth = 3;
    ctx.fill();
    ctx.stroke();
  }

  var liveBusy = false;
  async function liveTick() {
    if (!stream || liveBusy) return;
    liveBusy = true;
    try { await liveTickBody(); } catch (err) {}
    liveBusy = false;
  }
  async function liveTickBody() {
    if (!stream) return;
    var video = $('video');
    if (!video.videoWidth) return;
    var small = document.createElement('canvas');
    var sw = 480;
    var sh = Math.max(1, Math.round(video.videoHeight * sw / video.videoWidth));
    small.width = sw;
    small.height = sh;
    small.getContext('2d').drawImage(video, 0, 0, sw, sh);
    var found;
    try { found = await ScanDetect.detect(small); }
    catch (err) { found = null; }
    if (!found || !found.found) {
      stableSince = 0;
      lastLive = null;
      drawLiveQuad(null);
      $('liveNote').textContent = 'Looking for a page…';
      return;
    }
    drawLiveQuad(found.corners);
    var moved = 1;
    if (lastLive) {
      moved = 0;
      for (var i = 0; i < 4; i++) {
        moved = Math.max(moved, Math.hypot(found.corners[i].x - lastLive[i].x, found.corners[i].y - lastLive[i].y));
      }
    }
    lastLive = found.corners;
    if (moved < 0.012) {
      if (!stableSince) stableSince = performance.now();
      var held = performance.now() - stableSince;
      $('liveNote').textContent = held > 1000 ? 'Holding still — capturing' : 'Hold still…';
      if (held > 1000 && $('autoCap').checked && !capturing) captureFrame();
    } else {
      stableSince = 0;
      $('liveNote').textContent = 'Page found. Hold still to capture, or tap the shutter.';
    }
  }

  async function captureFrame() {
    if (capturing || !stream) return;
    capturing = true;
    status('Capturing…', true);
    try {
      var track = stream.getVideoTracks()[0];
      var blob = null;
      if (window.ImageCapture) {
        try { blob = await new ImageCapture(track).takePhoto(); } catch (err) { blob = null; }
      }
      var canvas, bytes;
      if (blob) {
        var decoded = await canvasFromBlob(blob);
        canvas = decoded.canvas;
        bytes = decoded.bytes;
      } else {
        var video = $('video');
        canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        bytes = null;
      }
      await addCanvas(canvas, 'camera', bytes);
      stopCamera();
    } catch (err) {
      toast('Couldn’t capture that frame.');
    }
    capturing = false;
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('This browser has no camera. Add a photo instead.');
      $('fileInput').click();
      return;
    }
    status('Loading the detector…', true);
    try { await ScanDetect.ready(); } catch (err) {}
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 3840 },
          height: { ideal: 2160 }
        }
      });
      $('video').srcObject = stream;
      $('live').hidden = false;
      $('dock').hidden = false;
      $('shutter').hidden = false;
      $('camOff').hidden = false;
      stableSince = 0;
      lastLive = null;
      clearInterval(liveTimer);
      liveTimer = setInterval(liveTick, 400);
      status('', false);
    } catch (err) {
      toast('Camera permission was blocked. Add a photo instead.');
      $('fileInput').click();
      status('', false);
    }
  }
  function stopCamera() {
    clearInterval(liveTimer);
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
    $('live').hidden = true;
    $('shutter').hidden = true;
    $('camOff').hidden = true;
    drawLiveQuad(null);
  }

  $('addBtn').addEventListener('click', function () { $('fileInput').click(); });
  $('addMore').addEventListener('click', function () { $('fileInput').click(); });
  $('camDock').addEventListener('click', startCamera);
  $('fileInput').addEventListener('change', async function () {
    var input = $('fileInput');
    var files = [];
    if (input.files) for (var i = 0; i < input.files.length; i++) files.push(input.files[i]);
    input.value = '';
    for (var n = 0; n < files.length; n++) await addFile(files[n]);
  });
  $('camBtn').addEventListener('click', startCamera);
  $('camOff').addEventListener('click', stopCamera);
  $('shutter').addEventListener('click', function () { captureFrame(); });
  $('redetect').addEventListener('click', async function () {
    var page = current();
    if (!page) return;
    status('Finding the page…', true);
    var found = await ScanDetect.detect(page.source);
    page.corners = found.corners;
    page.autoCorners = cloneCorners(found.corners);
    page.found = !!found.found;
    showActive();
    status('', false);
    scheduleSave();
  });
  $('resetCorners').addEventListener('click', function () {
    var page = current();
    if (!page || !page.autoCorners) return;
    page.corners = cloneCorners(page.autoCorners);
    moveHandles(page);
    scheduleFlat();
    scheduleSave();
  });
  $('fullImage').addEventListener('click', function () {
    var page = current();
    if (!page) return;
    page.corners = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    page.found = true;
    moveHandles(page);
    scheduleFlat();
    scheduleSave();
  });
  document.querySelectorAll('.filters button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var page = current();
      if (!page) return;
      page.filter = btn.dataset.filter;
      document.querySelectorAll('.filters button').forEach(function (b) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      scheduleFlat();
      scheduleSave();
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
      var blob = new Blob([rec.image]);
      var bmp = await createImageBitmap(blob);
      var canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      canvas.getContext('2d').drawImage(bmp, 0, 0);
      pages.push({
        id: rec.id,
        name: rec.name,
        source: canvas,
        bytes: rec.image,
        corners: rec.corners,
        autoCorners: rec.autoCorners || rec.corners,
        found: rec.found,
        filter: rec.filter || 'clean',
        flat: null,
        thumb: ''
      });
      uid = Math.max(uid, rec.id || 0);
    }
    active = Math.min(session.active || 0, pages.length - 1);
    showActive();
    renderList();
    status('', false);
  }).catch(function () {});
})();
