/* Full-resolution perspective warp (WebGL bicubic) and page enhancement. */
(function (global) {
  var glCanvas, gl, program, buf;

  function homography(src, dst) {
    var A = [], b = [];
    for (var i = 0; i < 4; i++) {
      var x = src[i].x, y = src[i].y, u = dst[i].x, v = dst[i].y;
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
      b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
      b.push(v);
    }
    var n = 8;
    var M = A.map(function (row, r) { return row.concat([b[r]]); });
    for (var col = 0; col < n; col++) {
      var piv = col;
      for (var r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      var tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
      var div = M[col][col] || 1e-12;
      for (var c = col; c <= n; c++) M[col][c] /= div;
      for (var r2 = 0; r2 < n; r2++) {
        if (r2 === col) continue;
        var f = M[r2][col];
        for (var c2 = col; c2 <= n; c2++) M[r2][c2] -= f * M[col][c2];
      }
    }
    var h = M.map(function (row) { return row[n]; });
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }

  function outputSize(corners, srcW, srcH) {
    var p = corners.map(function (c) { return { x: c.x * srcW, y: c.y * srcH }; });
    var w = Math.max(dist(p[0], p[1]), dist(p[3], p[2]));
    var h = Math.max(dist(p[0], p[3]), dist(p[1], p[2]));
    var long = Math.max(w, h);
    if (long > 3508) {
      var s = 3508 / long;
      w *= s; h *= s;
    }
    return { w: Math.max(32, Math.round(w)), h: Math.max(32, Math.round(h)) };
  }

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function ensureGl() {
    if (gl) return true;
    glCanvas = document.createElement('canvas');
    gl = glCanvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true })
      || glCanvas.getContext('experimental-webgl');
    if (!gl) return false;
    var vs = 'attribute vec2 a; varying vec2 v; void main(){ v=a*0.5+0.5; gl_Position=vec4(a,0.0,1.0);}';
    var fs = [
      'precision highp float;',
      'varying vec2 v;',
      'uniform sampler2D uTex;',
      'uniform mat3 uH;',
      'uniform vec2 uSrc;',
      'uniform vec2 uOut;',
      'float cubic(float x){ x=abs(x); if(x<=1.0) return (1.5*x-2.5)*x*x+1.0; if(x<2.0) return ((-0.5*x+2.5)*x-4.0)*x+2.0; return 0.0; }',
      'vec4 sampleBicubic(vec2 uv){',
      '  vec2 p = uv * uSrc - 0.5;',
      '  vec2 f = fract(p); vec2 base = floor(p);',
      '  vec4 acc = vec4(0.0); float wsum = 0.0;',
      '  for(int j=-1;j<=2;j++){ for(int i=-1;i<=2;i++){',
      '    float w = cubic(float(i)-f.x) * cubic(float(j)-f.y);',
      '    vec2 sp = (base + vec2(float(i), float(j)) + 0.5) / uSrc;',
      '    acc += texture2D(uTex, clamp(sp, vec2(0.0), vec2(1.0))) * w;',
      '    wsum += w;',
      '  }}',
      '  return acc / max(wsum, 0.0001);',
      '}',
      'void main(){',
      '  vec2 pix = vec2(v.x, 1.0 - v.y) * max(uOut - 1.0, vec2(1.0));',
      '  vec3 q = uH * vec3(pix, 1.0);',
      '  vec2 uv = (q.xy / q.z) / uSrc;',
      '  if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0){ gl_FragColor=vec4(1.0); return; }',
      '  gl_FragColor = sampleBicubic(uv);',
      '}'
    ].join('\n');
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    program = gl.createProgram();
    gl.attachShader(program, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(program, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(program);
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    return true;
  }

  function warpWebGL(source, corners, dw, dh) {
    if (!ensureGl()) return null;
    var dst = [{ x: 0, y: 0 }, { x: dw - 1, y: 0 }, { x: dw - 1, y: dh - 1 }, { x: 0, y: dh - 1 }];
    var src = corners.map(function (c) { return { x: c.x * source.width, y: c.y * source.height }; });
    var H = homography(dst, src);
    if (!H) return null;
    /* column-major for uniformMatrix3fv (WebGL1 transpose must be false) */
    var m = [H[0], H[3], H[6], H[1], H[4], H[7], H[2], H[5], H[8]];
    glCanvas.width = dw;
    glCanvas.height = dh;
    gl.viewport(0, 0, dw, dh);
    gl.useProgram(program);
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    var loc = gl.getAttribLocation(program, 'a');
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix3fv(gl.getUniformLocation(program, 'uH'), false, new Float32Array(m));
    gl.uniform2f(gl.getUniformLocation(program, 'uSrc'), source.width, source.height);
    gl.uniform2f(gl.getUniformLocation(program, 'uOut'), dw, dh);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    var out = document.createElement('canvas');
    out.width = dw;
    out.height = dh;
    out.getContext('2d').drawImage(glCanvas, 0, 0);
    gl.deleteTexture(tex);
    return out;
  }

  function warpCpu(source, corners, dw, dh) {
    var dst = [{ x: 0, y: 0 }, { x: dw - 1, y: 0 }, { x: dw - 1, y: dh - 1 }, { x: 0, y: dh - 1 }];
    var srcPts = corners.map(function (c) { return { x: c.x * source.width, y: c.y * source.height }; });
    var H = homography(dst, srcPts);
    var sctx = source.getContext('2d', { willReadFrequently: true });
    var src = sctx.getImageData(0, 0, source.width, source.height);
    var out = document.createElement('canvas');
    out.width = dw; out.height = dh;
    var octx = out.getContext('2d');
    var img = octx.createImageData(dw, dh);
    var sw = source.width, sh = source.height, sd = src.data, od = img.data;
    for (var y = 0; y < dh; y++) {
      for (var x = 0; x < dw; x++) {
        var den = H[6] * x + H[7] * y + H[8];
        var sx = (H[0] * x + H[1] * y + H[2]) / den;
        var sy = (H[3] * x + H[4] * y + H[5]) / den;
        var x0 = Math.floor(sx), y0 = Math.floor(sy);
        var fx = sx - x0, fy = sy - y0;
        var o = (y * dw + x) * 4;
        for (var c = 0; c < 3; c++) {
          var acc = 0;
          for (var j = 0; j < 2; j++) {
            for (var i = 0; i < 2; i++) {
              var xx = Math.min(sw - 1, Math.max(0, x0 + i));
              var yy = Math.min(sh - 1, Math.max(0, y0 + j));
              var wgt = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
              acc += sd[(yy * sw + xx) * 4 + c] * wgt;
            }
          }
          od[o + c] = acc;
        }
        od[o + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    return out;
  }

  function warp(source, corners) {
    var size = outputSize(corners, source.width, source.height);
    var web = null;
    try { web = warpWebGL(source, corners, size.w, size.h); } catch (err) { web = null; }
    if (web) return web;
    return warpCpu(source, corners, size.w, size.h);
  }

  function shadowField(canvas) {
    var w = canvas.width, h = canvas.height;
    var factor = Math.max(24, Math.round(Math.min(w, h) / 18));
    var small = document.createElement('canvas');
    small.width = Math.max(8, Math.round(w / factor));
    small.height = Math.max(8, Math.round(h / factor));
    var sctx = small.getContext('2d');
    sctx.drawImage(canvas, 0, 0, small.width, small.height);
    var big = document.createElement('canvas');
    big.width = w;
    big.height = h;
    var bctx = big.getContext('2d');
    bctx.imageSmoothingEnabled = true;
    bctx.drawImage(small, 0, 0, w, h);
    var data = bctx.getImageData(0, 0, w, h).data;
    var out = new Float32Array(w * h * 3);
    for (var i = 0; i < w * h; i++) {
      out[i * 3] = data[i * 4];
      out[i * 3 + 1] = data[i * 4 + 1];
      out[i * 3 + 2] = data[i * 4 + 2];
    }
    return out;
  }

  function enhance(canvas, mode) {
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var w = canvas.width, h = canvas.height, d = img.data;
    if (mode === 'original') return canvas;
    var bg = shadowField(canvas);
    var gray = new Float32Array(w * h);
    for (var i = 0; i < w * h; i++) {
      var base = Math.max(8, (bg[i * 3] + bg[i * 3 + 1] + bg[i * 3 + 2]) / 3);
      for (var c = 0; c < 3; c++) {
        var v = d[i * 4 + c] / base * 230;
        d[i * 4 + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
      gray[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
    }
    if (mode === 'bw') {
      sauvola(d, gray, w, h);
    } else {
      stretch(d, w * h, mode === 'grey');
      unsharp(d, w, h, 0.55);
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  function stretch(d, n, grey) {
    var hist = new Uint32Array(256);
    for (var i = 0; i < n; i++) {
      var g = grey
        ? (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0
        : ((d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3) | 0;
      hist[g]++;
    }
    var lo = 0, hi = 255, seen = 0, cut = n * 0.02;
    for (var a = 0; a < 256; a++) { seen += hist[a]; if (seen >= cut) { lo = a; break; } }
    seen = 0;
    for (var b = 255; b >= 0; b--) { seen += hist[b]; if (seen >= cut) { hi = b; break; } }
    var black = hi - lo < 16 ? 0 : Math.min(lo, hi * 0.35);
    var white = Math.max(hi, black + 1);
    var span = white - black;
    for (var i2 = 0; i2 < n; i2++) {
      if (grey) {
        var g2 = d[i2 * 4] * 0.299 + d[i2 * 4 + 1] * 0.587 + d[i2 * 4 + 2] * 0.114;
        var o = (g2 - black) / span * 255;
        o = o < 0 ? 0 : o > 255 ? 255 : o;
        d[i2 * 4] = d[i2 * 4 + 1] = d[i2 * 4 + 2] = o;
      } else {
        for (var c = 0; c < 3; c++) {
          var o2 = (d[i2 * 4 + c] - black) / span * 255;
          d[i2 * 4 + c] = o2 < 0 ? 0 : o2 > 255 ? 255 : o2;
        }
      }
    }
  }

  function unsharp(d, w, h, amount) {
    var copy = new Uint8ClampedArray(d);
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var i = (y * w + x) * 4;
        for (var c = 0; c < 3; c++) {
          var blur = 0;
          for (var j = -1; j <= 1; j++) {
            for (var k = -1; k <= 1; k++) blur += copy[((y + j) * w + (x + k)) * 4 + c];
          }
          blur /= 9;
          var v = copy[i + c] + amount * (copy[i + c] - blur);
          d[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
        }
      }
    }
  }

  function sauvola(d, gray, w, h) {
    var win = 15, k = 0.28, R = 128;
    var ii = new Float64Array((w + 1) * (h + 1));
    var ii2 = new Float64Array((w + 1) * (h + 1));
    for (var y = 1; y <= h; y++) {
      var row = 0, row2 = 0;
      for (var x = 1; x <= w; x++) {
        var g = gray[(y - 1) * w + (x - 1)];
        row += g; row2 += g * g;
        ii[y * (w + 1) + x] = ii[(y - 1) * (w + 1) + x] + row;
        ii2[y * (w + 1) + x] = ii2[(y - 1) * (w + 1) + x] + row2;
      }
    }
    var r = (win / 2) | 0;
    for (var y2 = 0; y2 < h; y2++) {
      var yA = Math.max(0, y2 - r), yB = Math.min(h - 1, y2 + r);
      for (var x2 = 0; x2 < w; x2++) {
        var xA = Math.max(0, x2 - r), xB = Math.min(w - 1, x2 + r);
        var n = (yB - yA + 1) * (xB - xA + 1);
        var A = (yA) * (w + 1) + xA, B = (yA) * (w + 1) + (xB + 1);
        var C = (yB + 1) * (w + 1) + xA, D = (yB + 1) * (w + 1) + (xB + 1);
        var sum = ii[D] - ii[B] - ii[C] + ii[A];
        var sum2 = ii2[D] - ii2[B] - ii2[C] + ii2[A];
        var mean = sum / n;
        var variance = Math.max(0, sum2 / n - mean * mean);
        var std = Math.sqrt(variance);
        var t = mean * (1 + k * (std / R - 1));
        var bit = gray[y2 * w + x2] > t ? 255 : 0;
        var o = (y2 * w + x2) * 4;
        d[o] = d[o + 1] = d[o + 2] = bit;
      }
    }
  }

  function encode(canvas, mode) {
    return new Promise(function (resolve) {
      var mime = mode === 'bw' ? 'image/png' : 'image/jpeg';
      var quality = mode === 'bw' ? undefined : 0.92;
      canvas.toBlob(function (blob) {
        blob.arrayBuffer().then(function (buf) {
          resolve({ bytes: new Uint8Array(buf), mime: mime });
        });
      }, mime, quality);
    });
  }

  global.ScanWarp = { warp: warp, enhance: enhance, encode: encode, outputSize: outputSize };
})(window);
