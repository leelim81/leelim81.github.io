/* Line postprocess for the frozen RuleNet mask.
   Same steps as the archived segments_from_mask and page_mask:
   threshold is applied by the caller, opening length is max(15, width/40),
   8-connected components, then a collinear merge. No extra constants. */

function roundHalfEven(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return (f % 2 === 0) ? f : f + 1;
}

function resizeArea(src, sw, sh, dw, dh, channels) {
  const out = new Uint8Array(dw * dh * channels);
  const sx = sw / dw;
  const sy = sh / dh;
  const xw = [];
  const yw = [];
  function weights(nSrc, nDst, scale) {
    const rows = [];
    for (let i = 0; i < nDst; i++) {
      const a = i * scale;
      const b = (i + 1) * scale;
      const pairs = [];
      const i0 = Math.floor(a);
      const i1 = Math.min(nSrc, Math.max(Math.ceil(b - 1e-12), i0 + 1));
      for (let p = i0; p < i1; p++) {
        const left = Math.max(a, p);
        const right = Math.min(b, p + 1);
        if (right > left) pairs.push([p, right - left]);
      }
      rows.push(pairs);
    }
    return rows;
  }
  const wx = weights(sw, dw, sx);
  const wy = weights(sh, dh, sy);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const acc = [0, 0, 0];
      let norm = 0;
      for (let yi = 0; yi < wy[y].length; yi++) {
        const iy = wy[y][yi][0];
        const wyv = wy[y][yi][1];
        for (let xi = 0; xi < wx[x].length; xi++) {
          const ix = wx[x][xi][0];
          const wgt = wyv * wx[x][xi][1];
          const p = (iy * sw + ix) * channels;
          for (let c = 0; c < channels; c++) acc[c] += src[p + c] * wgt;
          norm += wgt;
        }
      }
      const o = (y * dw + x) * channels;
      for (let c = 0; c < channels; c++) out[o + c] = roundHalfEven(acc[c] / norm);
    }
  }
  return out;
}

function resizeLinear(src, sw, sh, dw, dh, channels) {
  const out = new Uint8Array(dw * dh * channels);
  const sx = sw / dw;
  const sy = sh / dh;
  for (let y = 0; y < dh; y++) {
    let fy = (y + 0.5) * sy - 0.5;
    let y0 = Math.floor(fy);
    let wy = fy - y0;
    if (y0 < 0) { y0 = 0; wy = 0; }
    let y1 = y0 + 1;
    if (y1 >= sh) { y1 = sh - 1; if (y0 >= sh) y0 = sh - 1; }
    for (let x = 0; x < dw; x++) {
      let fx = (x + 0.5) * sx - 0.5;
      let x0 = Math.floor(fx);
      let wx = fx - x0;
      if (x0 < 0) { x0 = 0; wx = 0; }
      let x1 = x0 + 1;
      if (x1 >= sw) { x1 = sw - 1; if (x0 >= sw) x0 = sw - 1; }
      const o = (y * dw + x) * channels;
      for (let c = 0; c < channels; c++) {
        const top = src[(y0 * sw + x0) * channels + c] * (1 - wx) + src[(y0 * sw + x1) * channels + c] * wx;
        const bot = src[(y1 * sw + x0) * channels + c] * (1 - wx) + src[(y1 * sw + x1) * channels + c] * wx;
        out[o + c] = roundHalfEven(top * (1 - wy) + bot * wy);
      }
    }
  }
  return out;
}

function median9(src, w, h) {
  const out = new Uint8Array(w * h);
  const hist = new Uint16Array(256);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      hist.fill(0);
      for (let dy = -4; dy <= 4; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -4; dx <= 4; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          hist[src[yy * w + xx]]++;
        }
      }
      let seen = 0;
      for (let v = 0; v < 256; v++) {
        seen += hist[v];
        if (seen >= 41) { out[y * w + x] = v; break; }
      }
    }
  }
  return out;
}

function dilate3(src, w, h, channels) {
  const out = new Uint8Array(w * h * channels);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < channels; c++) {
        let m = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const v = src[(yy * w + xx) * channels + c];
            if (v > m) m = v;
          }
        }
        out[(y * w + x) * channels + c] = m;
      }
    }
  }
  return out;
}

export function pageMask(rgba, w, h) {
  const sw = Math.floor(w / 4);
  const sh = Math.floor(h / 4);
  const small = resizeArea(rgba, w, h, sw, sh, 4);
  const med = new Uint8Array(sw * sh * 4);
  for (let c = 0; c < 3; c++) {
    const plane = new Uint8Array(sw * sh);
    for (let i = 0; i < sw * sh; i++) plane[i] = small[i * 4 + c];
    const blurred = median9(plane, sw, sh);
    for (let i = 0; i < sw * sh; i++) med[i * 4 + c] = blurred[i];
  }
  const wide = dilate3(med, sw, sh, 4);
  const bg = resizeLinear(wide, sw, sh, w, h, 4);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = bg[i * 4];
    const g = bg[i * 4 + 1];
    const b = bg[i * 4 + 2];
    if (0.299 * r + 0.587 * g + 0.114 * b >= 89.25) mask[i] = 1;
  }
  const eroded = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ok = 1;
      for (let dy = -4; dy <= 4 && ok; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -4; dx <= 4; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          if (!mask[yy * w + xx]) { ok = 0; break; }
        }
      }
      eroded[y * w + x] = ok;
    }
  }
  return eroded;
}

export function openHorizontal(mask, w, h, k) {
  /* OpenCV's rect element anchors at k/2. Dilate reflects that element.
     Out-of-range taps are ignored, matching the default morphology border. */
  const anchor = Math.floor(k / 2);
  const er0 = -anchor;
  const er1 = k - 1 - anchor;
  const di0 = er0;
  const di1 = er1;
  const eroded = new Uint8Array(w * h);
  const opened = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let ok = 1;
      for (let t = er0; t <= er1; t++) {
        const xx = x + t;
        if (xx >= 0 && xx < w && !mask[row + xx]) { ok = 0; break; }
      }
      eroded[row + x] = ok;
    }
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let t = di0; t <= di1; t++) {
        const xx = x + t;
        if (xx >= 0 && xx < w && eroded[row + xx]) { on = 1; break; }
      }
      opened[row + x] = on;
    }
  }
  return opened;
}

function components(mask, w, h) {
  const n = w * h;
  const parent = new Int32Array(n);
  const lab = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  function find(a) {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  }
  function unite(a, b) {
    a = find(a); b = find(b);
    if (a === b) return;
    if (a < b) parent[b] = a;
    else parent[a] = b;
  }
  let count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      count++;
      lab[i] = i;
      for (let dy = -1; dy <= 0; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 0 && dx >= 0) continue;
          const yy = y + dy;
          const xx = x + dx;
          if (yy < 0 || xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (mask[j]) unite(i, j);
        }
      }
    }
  }
  const roots = new Map();
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    const r = find(i);
    let box = roots.get(r);
    if (!box) {
      box = { x0: i % w, y0: Math.floor(i / w), x1: i % w, y1: Math.floor(i / w), sumY: 0, n: 0, first: i };
      roots.set(r, box);
    }
    const x = i % w;
    const y = Math.floor(i / w);
    if (x < box.x0) box.x0 = x;
    if (x > box.x1) box.x1 = x;
    if (y < box.y0) box.y0 = y;
    if (y > box.y1) box.y1 = y;
    box.sumY += y;
    box.n++;
  }
  return Array.from(roots.values()).sort(function (a, b) { return a.first - b.first; });
}

export function segmentsFromMask(mask, pmask, w) {
  const h = mask.length / w;
  const k = Math.max(15, Math.floor(w / 40));
  let opened = openHorizontal(mask, w, h, k);
  if (pmask) {
    for (let i = 0; i < opened.length; i++) if (!pmask[i]) opened[i] = 0;
  }
  const boxes = components(opened, w, h);
  const segs = [];
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const ww = b.x1 - b.x0 + 1;
    const hh = b.y1 - b.y0 + 1;
    if (ww < 40 || hh > Math.max(12, ww / 6)) continue;
    segs.push([b.x0, b.x1 + 1, b.sumY / b.n]);
  }
  segs.sort(function (a, b) {
    const dy = roundHalfEven(a[2]) - roundHalfEven(b[2]);
    if (dy) return dy;
    return a[0] - b[0];
  });
  const merged = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    let hit = false;
    for (let j = 0; j < merged.length; j++) {
      const m = merged[j];
      if (Math.abs(m[2] - s[2]) <= 4 && s[0] - m[1] <= 12 && m[0] - s[1] <= 12) {
        const L1 = m[1] - m[0];
        const L2 = s[1] - s[0];
        m[2] = (m[2] * L1 + s[2] * L2) / (L1 + L2);
        m[0] = Math.min(m[0], s[0]);
        m[1] = Math.max(m[1], s[1]);
        hit = true;
        break;
      }
    }
    if (!hit) merged.push([s[0], s[1], s[2]]);
  }
  return merged;
}

export function maskFromProb(prob) {
  const mask = new Uint8Array(prob.length);
  for (let i = 0; i < prob.length; i++) if (prob[i] > 0.5) mask[i] = 1;
  return mask;
}

export function segmentsFromProb(prob, rgba, w, h) {
  return segmentsFromMask(maskFromProb(prob), pageMask(rgba, w, h), w);
}
