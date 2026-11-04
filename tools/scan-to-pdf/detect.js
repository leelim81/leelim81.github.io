/* Document quad detector.
   Primary: DocAligner LCNet-100 (Apache-2.0), 256 input, 128 heatmap.
   Then a local line fit on the full-resolution image.
   Fallback: OpenCV.js contours + Hough quads, then a small JS edge vote. */
(function (global) {
  var ORT_JS = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.wasm.min.js';
  var ORT_WASM = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
  var CV_JS = 'https://docs.opencv.org/4.8.0/opencv.js';
  var MODEL = 'models/docaligner-lcnet100.onnx';
  var sessionPromise = null;
  var cvPromise = null;
  var MEAN = [0.485, 0.456, 0.406];
  var STD = [0.229, 0.224, 0.225];

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('failed ' + src)); };
      document.head.appendChild(s);
    });
  }

  function ensureSession() {
    if (sessionPromise) return sessionPromise;
    sessionPromise = (async function () {
      if (!global.ort) await loadScript(ORT_JS);
      ort.env.wasm.wasmPaths = ORT_WASM;
      ort.env.wasm.numThreads = 1;
      return ort.InferenceSession.create(MODEL, { executionProviders: ['wasm'] });
    })();
    sessionPromise.catch(function () { sessionPromise = null; });
    return sessionPromise;
  }

  function legacyDetect(canvas) {
    var sw = 180;
    var sh = Math.max(1, Math.round(canvas.height * sw / Math.max(1, canvas.width)));
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
    if (count < sw * sh * 0.03 || maxX - minX < 12 || maxY - minY < 12) {
      return { found: false, corners: fullCorners(), source: 'legacy' };
    }
    return {
      found: true,
      source: 'legacy',
      corners: [
        { x: minX / sw, y: minY / sh },
        { x: maxX / sw, y: minY / sh },
        { x: maxX / sw, y: maxY / sh },
        { x: minX / sw, y: maxY / sh }
      ]
    };
  }

  function fullCorners() {
    return [{ x: 0.02, y: 0.02 }, { x: 0.98, y: 0.02 }, { x: 0.98, y: 0.98 }, { x: 0.02, y: 0.98 }];
  }

  function orderQuad(pts) {
    var tl = pts[0], br = pts[0];
    pts.forEach(function (p) {
      if (p.x + p.y < tl.x + tl.y) tl = p;
      if (p.x + p.y > br.x + br.y) br = p;
    });
    var rest = pts.filter(function (p) { return p !== tl && p !== br; });
    if (rest.length < 2) return pts.slice();
    var tr, bl;
    if (rest[0].x - rest[0].y > rest[1].x - rest[1].y) { tr = rest[0]; bl = rest[1]; }
    else { tr = rest[1]; bl = rest[0]; }
    return [tl, tr, br, bl];
  }

  function quadOk(cs) {
    if (!cs || cs.length !== 4) return false;
    var area = 0;
    var crossSign = 0;
    for (var i = 0; i < 4; i++) {
      var a = cs[i], b = cs[(i + 1) % 4], c = cs[(i + 2) % 4];
      area += a.x * b.y - b.x * a.y;
      var cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (crossSign === 0) crossSign = Math.sign(cross);
      else if (Math.sign(cross) !== 0 && Math.sign(cross) !== crossSign) return false;
      var len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 0.045) return false;
      var l1 = Math.hypot(b.x - a.x, b.y - a.y);
      var l2 = Math.hypot(c.x - b.x, c.y - b.y);
      var dot = ((a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)) / (l1 * l2);
      var ang = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
      if (ang < 35 || ang > 150) return false;
    }
    area = Math.abs(area) / 2;
    return area > 0.035 && area < 0.98;
  }

  function peak(channel, H, W) {
    var best = -1, bx = 0, by = 0;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var v = channel[y * W + x];
        if (v > best) { best = v; bx = x; by = y; }
      }
    }
    var sx = 0, sy = 0, sw = 0, r = 4;
    for (var yy = Math.max(0, by - r); yy <= Math.min(H - 1, by + r); yy++) {
      for (var xx = Math.max(0, bx - r); xx <= Math.min(W - 1, bx + r); xx++) {
        var w = Math.max(0, channel[yy * W + xx]);
        sx += (xx + 0.5) * w;
        sy += (yy + 0.5) * w;
        sw += w;
      }
    }
    return { x: (sx / sw) / W, y: (sy / sw) / H, score: best };
  }

  async function modelCorners(canvas) {
    var session = await ensureSession();
    var prep = document.createElement('canvas');
    prep.width = 256;
    prep.height = 256;
    var pctx = prep.getContext('2d', { willReadFrequently: true });
    pctx.drawImage(canvas, 0, 0, 256, 256);
    var img = pctx.getImageData(0, 0, 256, 256).data;
    var data = new Float32Array(3 * 256 * 256);
    for (var i = 0; i < 256 * 256; i++) {
      for (var c = 0; c < 3; c++) data[c * 256 * 256 + i] = (img[i * 4 + c] / 255 - MEAN[c]) / STD[c];
    }
    var tensor = new ort.Tensor('float32', data, [1, 3, 256, 256]);
    var out = await session.run({ img: tensor });
    var heat = out.heatmap;
    var dims = heat.dims;
    var H = dims[2], W = dims[3];
    var raw = heat.data;
    var pts = [];
    var score = 0;
    for (var ch = 0; ch < 4; ch++) {
      var channel = raw.subarray(ch * H * W, (ch + 1) * H * W);
      var pk = peak(channel, H, W);
      pts.push({ x: pk.x, y: pk.y });
      score += pk.score;
    }
    if (tensor.dispose) tensor.dispose();
    if (heat.dispose) heat.dispose();
    var corners = pts;
    var mean = score / 4;
    if (!quadOk(corners)) corners = orderQuad(pts);
    return { corners: corners, score: mean, found: quadOk(corners) && mean > 0.25, source: 'docaligner' };
  }

  function refine(canvas, corners) {
    var w = canvas.width, h = canvas.height;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    return corners.map(function (c) {
      var px = c.x * w, py = c.y * h;
      var rad = 16;
      var x0 = Math.max(1, Math.floor(px - rad));
      var y0 = Math.max(1, Math.floor(py - rad));
      var x1 = Math.min(w - 2, Math.ceil(px + rad));
      var y1 = Math.min(h - 2, Math.ceil(py + rad));
      if (x1 - x0 < 4 || y1 - y0 < 4) return c;
      var img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
      var d = img.data, ww = img.width, hh = img.height;
      function lum(x, y) {
        var i = (y * ww + x) * 4;
        return d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      }
      var best = 0, bx = px, by = py;
      for (var y = 1; y < hh - 1; y++) {
        for (var x = 1; x < ww - 1; x++) {
          var gx = lum(x + 1, y) - lum(x - 1, y);
          var gy = lum(x, y + 1) - lum(x, y - 1);
          var s = Math.abs(gx) * Math.abs(gy);
          if (s > best) { best = s; bx = x0 + x; by = y0 + y; }
        }
      }
      if (best < 400) return c;
      if (Math.hypot(bx - px, by - py) > 14) return c;
      return { x: bx / w, y: by / h };
    });
  }

  function ensureCv() {
    if (cvPromise) return cvPromise;
    cvPromise = new Promise(function (resolve, reject) {
      if (global.cv && cv.Mat) { resolve(cv); return; }
      var s = document.createElement('script');
      s.src = CV_JS;
      s.async = true;
      s.onload = function () {
        if (cv.Mat) resolve(cv);
        else cv.onRuntimeInitialized = function () { resolve(cv); };
      };
      s.onerror = function () { reject(new Error('opencv')); };
      document.head.appendChild(s);
    });
    cvPromise.catch(function () { cvPromise = null; });
    return cvPromise;
  }

  async function opencvDetect(canvas) {
    var cv = await ensureCv();
    var src = cv.imread(canvas);
    var small = new cv.Mat();
    var maxSide = 640;
    var scale = Math.min(1, maxSide / Math.max(src.cols, src.rows));
    cv.resize(src, small, new cv.Size(Math.round(src.cols * scale), Math.round(src.rows * scale)));
    var gray = new cv.Mat(), blur = new cv.Mat(), edges = new cv.Mat();
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
    cv.bilateralFilter(gray, blur, 7, 50, 50);
    var best = null;
    [[40, 120], [60, 180], [80, 220]].forEach(function (th) {
      cv.Canny(blur, edges, th[0], th[1]);
      var kernel = cv.Mat.ones(3, 3, cv.CV_8U);
      cv.dilate(edges, edges, kernel);
      kernel.delete();
      var contours = new cv.MatVector(), hierarchy = new cv.Mat();
      cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      for (var i = 0; i < contours.size(); i++) {
        var cnt = contours.get(i);
        var peri = cv.arcLength(cnt, true);
        var approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          var area = cv.contourArea(approx);
          if (area > small.rows * small.cols * 0.12 && (!best || area > best.area)) {
            var pts = [];
            for (var r = 0; r < 4; r++) {
              pts.push({ x: approx.intPtr(r, 0)[0] / small.cols, y: approx.intPtr(r, 0)[1] / small.rows });
            }
            best = { area: area, corners: orderQuad(pts) };
          }
        }
        approx.delete();
        cnt.delete();
      }
      contours.delete();
      hierarchy.delete();
    });
    src.delete(); small.delete(); gray.delete(); blur.delete(); edges.delete();
    if (!best || !quadOk(best.corners)) return { found: false, corners: fullCorners(), source: 'opencv' };
    return { found: true, corners: best.corners, source: 'opencv' };
  }

  function jsDetect(canvas) {
    var maxW = 360;
    var scale = Math.min(1, maxW / canvas.width);
    var sw = Math.max(40, Math.round(canvas.width * scale));
    var sh = Math.max(40, Math.round(canvas.height * scale));
    var small = document.createElement('canvas');
    small.width = sw;
    small.height = sh;
    var ctx = small.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, sw, sh);
    var data = ctx.getImageData(0, 0, sw, sh).data;
    var gray = new Float32Array(sw * sh);
    var sat = new Float32Array(sw * sh);
    for (var i = 0; i < sw * sh; i++) {
      var r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      gray[i] = r * 0.299 + g * 0.587 + b * 0.114;
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      sat[i] = mx - mn;
    }
    var rad = Math.max(6, Math.round(Math.min(sw, sh) / 16));
    function boxPass(src, horizontal) {
      var out = new Float32Array(sw * sh);
      var span = rad * 2 + 1;
      if (horizontal) {
        for (var y = 0; y < sh; y++) {
          var acc = 0;
          for (var k = -rad; k <= rad; k++) acc += src[y * sw + Math.min(sw - 1, Math.max(0, k))];
          for (var x = 0; x < sw; x++) {
            out[y * sw + x] = acc / span;
            acc += src[y * sw + Math.min(sw - 1, x + rad + 1)] - src[y * sw + Math.max(0, x - rad)];
          }
        }
      } else {
        for (var x2 = 0; x2 < sw; x2++) {
          var acc2 = 0;
          for (var k2 = -rad; k2 <= rad; k2++) acc2 += src[Math.min(sh - 1, Math.max(0, k2)) * sw + x2];
          for (var y2 = 0; y2 < sh; y2++) {
            out[y2 * sw + x2] = acc2 / span;
            acc2 += src[Math.min(sh - 1, y2 + rad + 1) * sw + x2] - src[Math.max(0, y2 - rad) * sw + x2];
          }
        }
      }
      return out;
    }
    var low = boxPass(boxPass(gray, true), false);
    var mag = new Float32Array(sw * sh);
    var mags = [];
    for (var y2 = 1; y2 < sh - 1; y2++) {
      for (var x2 = 1; x2 < sw - 1; x2++) {
        var i0 = y2 * sw + x2;
        var hpL = gray[i0 - 1] - low[i0 - 1];
        var hpR = gray[i0 + 1] - low[i0 + 1];
        var hpU = gray[i0 - sw] - low[i0 - sw];
        var hpD = gray[i0 + sw] - low[i0 + sw];
        var sgx = sat[i0 + 1] - sat[i0 - 1];
        var sgy = sat[i0 + sw] - sat[i0 - sw];
        var m = Math.hypot(hpR - hpL, hpD - hpU) + Math.hypot(sgx, sgy) * 0.45;
        mag[i0] = m;
        mags.push(m);
      }
    }
    mags.sort(function (a, b) { return a - b; });
    var cuts = [3, 8, 16].concat([0.92, 0.97].map(function (p) {
      return mags[Math.min(mags.length - 1, (mags.length * p) | 0)];
    }));
    var diag = Math.hypot(sw, sh);
    var best = null;
    cuts.forEach(function (cut) {
      if (cut < 4) cut = 4;
      var nTheta = 180;
      var nRho = Math.ceil(diag) * 2 + 2;
      var acc = new Uint16Array(nTheta * nRho);
      var cos = new Float32Array(nTheta), sin = new Float32Array(nTheta);
      for (var t = 0; t < nTheta; t++) {
        var th = t * Math.PI / nTheta;
        cos[t] = Math.cos(th); sin[t] = Math.sin(th);
      }
      for (var y3 = 1; y3 < sh - 1; y3++) {
        for (var x3 = 1; x3 < sw - 1; x3++) {
          if (mag[y3 * sw + x3] < cut) continue;
          for (var t2 = 0; t2 < nTheta; t2 += 1) {
            var rho = x3 * cos[t2] + y3 * sin[t2] + diag;
            var ri = rho | 0;
            if (ri >= 0 && ri < nRho) acc[t2 * nRho + ri]++;
          }
        }
      }
      var peaks = [];
      for (var t3 = 0; t3 < nTheta; t3++) {
        for (var r3 = 0; r3 < nRho; r3++) {
          var v = acc[t3 * nRho + r3];
          if (v < 25) continue;
          peaks.push({ t: t3, r: r3 - diag, v: v });
        }
      }
      peaks.sort(function (a, b) { return b.v - a.v; });
      var lines = [];
      for (var p = 0; p < peaks.length && lines.length < 12; p++) {
        var ok = true;
        for (var q = 0; q < lines.length; q++) {
          var dt = Math.abs(peaks[p].t - lines[q].t);
          dt = Math.min(dt, 180 - dt);
          if (dt < 8 && Math.abs(peaks[p].r - lines[q].r) < 10) { ok = false; break; }
        }
        if (ok) lines.push(peaks[p]);
      }
      if (lines.length < 4) return;
      var groups = [[], []];
      var seed = lines[0].t;
      lines.forEach(function (ln) {
        var dt = Math.abs(ln.t - seed);
        dt = Math.min(dt, 180 - dt);
        groups[dt < 40 ? 0 : 1].push(ln);
      });
      if (groups[0].length < 2 || groups[1].length < 2) return;
      function inter(a, b) {
        var c1 = Math.cos(a.t * Math.PI / 180), s1 = Math.sin(a.t * Math.PI / 180);
        var c2 = Math.cos(b.t * Math.PI / 180), s2 = Math.sin(b.t * Math.PI / 180);
        var det = c1 * s2 - s1 * c2;
        if (Math.abs(det) < 0.15) return null;
        return { x: (a.r * s2 - s1 * b.r) / det, y: (c1 * b.r - a.r * c2) / det };
      }
      function support(a, b) {
        var n = 24, hit = 0;
        for (var k = 1; k < n; k++) {
          var x = a.x + (b.x - a.x) * k / n;
          var y = a.y + (b.y - a.y) * k / n;
          var xi = x | 0, yi = y | 0;
          if (xi < 1 || yi < 1 || xi >= sw - 1 || yi >= sh - 1) continue;
          var local = 0;
          for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) local = Math.max(local, mag[(yi + dy) * sw + (xi + dx)]);
          }
          if (local >= cut * 0.65) hit++;
        }
        return hit / n;
      }
      for (var i0 = 0; i0 < groups[0].length; i0++) {
        for (var i1 = i0 + 1; i1 < groups[0].length; i1++) {
          for (var j0 = 0; j0 < groups[1].length; j0++) {
            for (var j1 = j0 + 1; j1 < groups[1].length; j1++) {
              var L0 = groups[0][i0], L1 = groups[0][i1], M0 = groups[1][j0], M1 = groups[1][j1];
              var pts = [inter(L0, M0), inter(L0, M1), inter(L1, M0), inter(L1, M1)];
              if (pts.some(function (pt) { return !pt; })) continue;
              var norm = pts.map(function (pt) { return { x: pt.x / sw, y: pt.y / sh }; });
              if (norm.some(function (pt) { return pt.x < -0.05 || pt.y < -0.05 || pt.x > 1.05 || pt.y > 1.05; })) continue;
              var ordered = orderQuad(norm);
              if (!quadOk(ordered)) continue;
              var pix = ordered.map(function (pt) { return { x: pt.x * sw, y: pt.y * sh }; });
              var sup = (support(pix[0], pix[1]) + support(pix[1], pix[2]) + support(pix[2], pix[3]) + support(pix[3], pix[0])) / 4;
              if (sup < 0.42) continue;
              var area = 0;
              for (var z = 0; z < 4; z++) {
                var n = ordered[(z + 1) % 4];
                area += ordered[z].x * n.y - n.x * ordered[z].y;
              }
              area = Math.abs(area) / 2;
              if (!best || area > best.area + 0.015 || (area > best.area - 0.015 && sup > best.sup)) {
                best = { score: sup + area, area: area, sup: sup, corners: ordered, source: 'hough' };
              }
            }
          }
        }
      }
    });
    if (!best) return { found: false, corners: fullCorners(), source: 'hough' };
    best.corners = growOut(best.corners, mag, sw, sh);
    return { found: true, corners: best.corners, source: 'hough', score: best.score };
  }

  function growOut(cs, mag, sw, sh) {
    var pix = cs.map(function (p) { return { x: p.x * sw, y: p.y * sh }; });
    function sideSupport(a, b, minMag) {
      var n = 28, hit = 0;
      for (var k = 1; k < n; k++) {
        var x = a.x + (b.x - a.x) * k / n;
        var y = a.y + (b.y - a.y) * k / n;
        var xi = x | 0, yi = y | 0;
        if (xi < 1 || yi < 1 || xi >= sw - 1 || yi >= sh - 1) continue;
        var local = 0;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) local = Math.max(local, mag[(yi + dy) * sw + (xi + dx)]);
        }
        if (local >= minMag) hit++;
      }
      return hit / n;
    }
    var lines = [];
    for (var i = 0; i < 4; i++) {
      var a = pix[i], b = pix[(i + 1) % 4];
      var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      var nx = dy / len, ny = -dx / len;
      var best = 0;
      if (sideSupport(a, b, 14) >= 0.5) {
        var crossed = false;
        for (var off = 6; off <= 72; off += 2) {
          var a2 = { x: a.x + nx * off, y: a.y + ny * off };
          var b2 = { x: b.x + nx * off, y: b.y + ny * off };
          if (a2.x < -8 || b2.x > sw + 8 || a2.y < -8 || b2.y > sh + 8) break;
          var s = sideSupport(a2, b2, 2.4);
          if (s < 0.18) crossed = true;
          if (crossed && s >= 0.36) { best = off; break; }
        }
      }
      lines.push({
        a: { x: a.x + nx * best, y: a.y + ny * best },
        b: { x: b.x + nx * best, y: b.y + ny * best }
      });
    }
    function cross(l1, l2) {
      var x1 = l1.a.x, y1 = l1.a.y, x2 = l1.b.x, y2 = l1.b.y;
      var x3 = l2.a.x, y3 = l2.a.y, x4 = l2.b.x, y4 = l2.b.y;
      var den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (Math.abs(den) < 1e-4) return null;
      return {
        x: ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den,
        y: ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den
      };
    }
    var out = [];
    for (var e = 0; e < 4; e++) {
      var pt = cross(lines[(e + 3) % 4], lines[e]);
      if (!pt) return cs;
      out.push({ x: pt.x / sw, y: pt.y / sh });
    }
    return quadOk(out) ? out : cs;
  }

  async function detect(canvas) {
    var result = null;
    try { result = await modelCorners(canvas); } catch (err) { result = null; }
    if (!result || !result.found) {
      var js = jsDetect(canvas);
      if (js && js.found) result = js;
    }
    if (!result || !result.found) {
      try {
        result = await Promise.race([
          opencvDetect(canvas),
          new Promise(function (_, reject) { setTimeout(function () { reject(new Error('opencv-timeout')); }, 8000); })
        ]);
      } catch (err) {
        result = result && result.corners ? result : legacyDetect(canvas);
      }
    }
    if (result && result.found && result.source === 'docaligner') {
      try { result.corners = refine(canvas, result.corners); } catch (err) {}
    } else if (result && result.found) {
      try { result.corners = orderQuad(refine(canvas, result.corners)); } catch (err) {}
    }
    if (!result) result = { found: false, corners: fullCorners(), source: 'none' };
    result.corners = result.corners.map(function (p) {
      return { x: Math.min(0.995, Math.max(0.005, p.x)), y: Math.min(0.995, Math.max(0.005, p.y)) };
    });
    return result;
  }

  global.ScanDetect = {
    detect: detect,
    legacy: legacyDetect,
    fullCorners: fullCorners,
    ready: ensureSession
  };
})(window);
