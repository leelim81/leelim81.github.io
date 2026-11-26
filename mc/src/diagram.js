// Architecture diagrams, drawn from a small spec so that every diagram can be replayed in draw order.
//
// spec = {
//   id, title,
//   layers: [{ label, nodes: [id, ...] }],          rows when the diagram is tall, columns when it is wide
//   nodes:  { id: { t, s, k, at } },                 title, second line, kind (svc, ext, store, human), step it appears in
//   edges:  [{ a, b, at, n, dash, via }],            from, to, step, flow number, dashed, lane side for long hops
//   base:   [{ t, at }],                             full-width bars under the diagram, for cross-cutting layers
//   steps:  [caption, ...]                           what to say while drawing each step
// }
import { add, clear, h, icon } from "./dom.js";
import { S, save } from "./store.js";

const NS = "http://www.w3.org/2000/svg";

function el(tag, attrs, ...kids) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) node.setAttribute(k, v);
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return node;
}

function wrap(text, max) {
  const lines = [];
  let cur = "";
  for (const word of String(text).split(/\s+/)) {
    if (!cur) cur = word;
    else if ((cur + " " + word).length <= max) cur += " " + word;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

const TITLE_H = 14.5;
const SUB_H = 12;
const boxHeight = (n) => 9 + n.tl.length * TITLE_H + (n.sl.length ? 2 + n.sl.length * SUB_H : 0) + 7;

// Edges that hop over a layer, or run backwards, travel along a lane at the side.
function lanes(spec, layerOf) {
  const sides = { left: [], right: [] };
  for (const e of spec.edges) {
    const d = layerOf[e.b] - layerOf[e.a];
    if (e.via || Math.abs(d) > 1) {
      e._lane = e.via || "left";
      e._k = sides[e._lane].length;
      sides[e._lane].push(e);
    } else {
      e._lane = null;
    }
  }
  return sides;
}

function layout(spec, wide, extra = []) {
  const layerOf = {};
  spec.layers.forEach((layer, i) => layer.nodes.forEach((id) => (layerOf[id] = i)));
  const side = lanes(spec, layerOf);
  // Neighbors in one layer sit close together. A flow number between them needs more room, and every
  // layer with the same number of boxes gets the same room, so that the boxes still line up.
  const wideGap = new Set(spec.edges.filter((e) => e.n != null && layerOf[e.a] === layerOf[e.b]).map((e) => spec.layers[layerOf[e.a]].nodes.length));
  const roomy = (i) => wideGap.has(spec.layers[i].nodes.length);
  const nodes = {};
  const layers = [];
  const labels = [];
  const bases = [];
  let W, H;

  if (!wide) {
    W = 360;
    const padL = side.left.length ? 12 + 10 * side.left.length : 10;
    const padR = side.right.length ? 12 + 10 * side.right.length : 10;
    const mainW = W - padL - padR;
    const GX = 10;
    const GY = 38;
    let y = 6;
    spec.layers.forEach((layer, i) => {
      const pre = layer.label ? 17 : 0;
      if (layer.label) {
        labels.push({ x: padL, y: y + 9, text: layer.label });
        y += pre;
      }
      const m = layer.nodes.length;
      const gx = roomy(i) ? 32 : GX;
      const w = Math.min((mainW - (m - 1) * gx) / m, m === 1 ? 200 : 172);
      let x = padL + (mainW - (m * w + (m - 1) * gx)) / 2;
      const row = layer.nodes.map((id, idx) => {
        const n = { id, ...spec.nodes[id], layer: i, idx, w };
        n.tl = wrap(n.t, Math.floor((w - 14) / 6.5));
        n.sl = n.s ? wrap(n.s, Math.floor((w - 14) / 5.4)) : [];
        return n;
      });
      const hh = Math.max(...row.map(boxHeight));
      for (const n of row) {
        n.x = x;
        n.y = y;
        n.h = hh;
        x += w + gx;
        nodes[n.id] = n;
      }
      layers.push({ y, h: hh, pre });
      y += hh + GY + (extra[i] || 0);
    });
    y = y - GY - (extra[spec.layers.length - 1] || 0) + 12;
    for (const b of spec.base || []) {
      const lines = wrap(b.t, Math.floor((W - 20 - 16) / 4.8));
      const hh = 12 + lines.length * 12.5;
      bases.push({ ...b, x: 10, y, w: W - 20, h: hh, lines });
      y += hh + 6;
    }
    H = y + 2;
    return { W, H, nodes, layers, labels, bases, layerOf, wide, gap: GY, lane: { left: (k) => 10 + 10 * k, right: (k) => W - 10 - 10 * k } };
  }

  const NW = 138;
  const GX = 46;
  const GY = 12;
  const padT = 26 + 10 * side.left.length;
  const cols = spec.layers.map((layer, i) => {
    const col = layer.nodes.map((id, idx) => {
      const n = { id, ...spec.nodes[id], layer: i, idx, w: NW };
      n.tl = wrap(n.t, Math.floor((NW - 14) / 6.5));
      n.sl = n.s ? wrap(n.s, Math.floor((NW - 14) / 5.4)) : [];
      n.h = boxHeight(n);
      return n;
    });
    return { col, gy: roomy(i) ? 32 : GY };
  });
  // Columns with the same number of boxes share their box heights, so that the boxes line up in rows
  // and the arrows between them run straight.
  const tallest = {};
  for (const { col } of cols) col.forEach((n, k) => (tallest[col.length + ":" + k] = Math.max(tallest[col.length + ":" + k] || 0, n.h)));
  for (const c of cols) {
    c.col.forEach((n, k) => (n.h = tallest[c.col.length + ":" + k]));
    c.height = c.col.reduce((sum, n) => sum + n.h, 0) + (c.col.length - 1) * c.gy;
  }
  const maxCol = Math.max(...cols.map((c) => c.height));
  let x = 12;
  cols.forEach(({ col, gy, height }, i) => {
    let y = padT + (maxCol - height) / 2;
    if (spec.layers[i].label) labels.push({ x, y: 12, text: spec.layers[i].label });
    for (const n of col) {
      n.x = x;
      n.y = y;
      y += n.h + gy;
      nodes[n.id] = n;
    }
    layers.push({ x, w: NW, pre: 0 });
    x += NW + GX + (extra[i] || 0);
  });
  W = x - GX - (extra[cols.length - 1] || 0) + 12;
  let y = padT + maxCol + 12 + 10 * side.right.length;
  for (const b of spec.base || []) {
    const lines = wrap(b.t, Math.floor((W - 24 - 16) / 4.8));
    const hh = 12 + lines.length * 12.5;
    bases.push({ ...b, x: 12, y, w: W - 24, h: hh, lines });
    y += hh + 6;
  }
  H = y + 2;
  return { W, H, nodes, layers, labels, bases, layerOf, wide, gap: GX, lane: { left: (k) => 22 + 10 * k, right: (k) => padT + maxCol + 8 + 10 * k } };
}

// Everything below works along a main axis (the direction of flow) and a cross axis.
// A tall diagram flows down, so main is y. A wide one flows right, so main is x.
function axes(L) {
  return L.wide
    ? { m0: (n) => n.x, m1: (n) => n.x + n.w, c0: (n) => n.y, c1: (n) => n.y + n.h, cc: (n) => n.y + n.h / 2, mm: (n) => n.x + n.w / 2, cs: (n) => n.h, ls: (l) => l.x, le: (l) => l.x + l.w, gs: (l) => l.x, pt: (m, c) => [m, c] }
    : { m0: (n) => n.y, m1: (n) => n.y + n.h, c0: (n) => n.x, c1: (n) => n.x + n.w, cc: (n) => n.x + n.w / 2, mm: (n) => n.y + n.h / 2, cs: (n) => n.w, ls: (l) => l.y, le: (l) => l.y + l.h, gs: (l) => l.y - l.pre, pt: (m, c) => [c, m] };
}

function routes(spec, L) {
  const A = axes(L);
  const N = L.nodes;
  // 1. Which side of each box an edge leaves from and arrives at.
  for (const e of spec.edges) {
    const a = N[e.a];
    const b = N[e.b];
    const d = b.layer - a.layer;
    e._same = d === 0;
    if (e._same) continue;
    e._fwd = d > 0;
    e._sa = e._fwd ? "end" : "start";
    e._sb = e._fwd ? "start" : "end";
  }
  // 2. Spread the edges that share a side, in the order of where they come from.
  const groups = {};
  for (const e of spec.edges) {
    if (e._same) continue;
    const far = (other) => (e._lane === "left" ? -1e6 : e._lane === "right" ? 1e6 : A.cc(N[other]));
    (groups[e.a + "|" + e._sa] ||= []).push({ e, end: "a", key: far(e.b) });
    (groups[e.b + "|" + e._sb] ||= []).push({ e, end: "b", key: far(e.a) });
  }
  for (const [key, list] of Object.entries(groups)) {
    const node = N[key.split("|")[0]];
    list.sort((p, q) => p.key - q.key);
    const step = Math.min(18, (A.cs(node) - 18) / list.length);
    list.forEach((item, i) => (item.e["_o" + item.end] = (i - (list.length - 1) / 2) * step));
  }
  // 3. Give every run across a gap a track. Runs that leave one box, or arrive at one box, share a
  //    track and read as a bus. Unrelated runs that would overlap get tracks of their own, and the
  //    tracks are put in the order that makes the fewest crossings.
  const gaps = {};
  const put = (g, item) => (gaps[g] ||= []).push(item);
  for (const e of spec.edges) {
    if (e._same) continue;
    const a = N[e.a];
    const b = N[e.b];
    const ac = (e._ac = A.cc(a) + (e._oa || 0));
    const bc = (e._bc = A.cc(b) + (e._ob || 0));
    e._t = null;
    if (e._lane) {
      const lc = L.lane[e._lane](e._k);
      // the stub that leaves the box, and the stub that arrives at the other one
      if (e._fwd) {
        put(a.layer, { e, part: "ga", low: ac, high: lc, src: e.a });
        put(b.layer - 1, { e, part: "gb", low: lc, high: bc, dst: e.b });
      } else {
        put(a.layer - 1, { e, part: "ga", low: lc, high: ac, src: e.a });
        put(b.layer, { e, part: "gb", low: bc, high: lc, dst: e.b });
      }
    } else if (Math.abs(ac - bc) >= 0.5) {
      put(Math.min(a.layer, b.layer), { e, part: "t", low: e._fwd ? ac : bc, high: e._fwd ? bc : ac, src: e.a, dst: e.b });
    }
  }
  const counts = spec.layers.map(() => 1);
  for (const [g, items] of Object.entries(gaps)) {
    const by = {};
    for (const it of items) {
      if (it.src) (by["a" + it.src] ||= []).push(it);
      if (it.dst) (by["b" + it.dst] ||= []).push(it);
    }
    const fan = (it, k) => (it[k] ? by[(k === "src" ? "a" : "b") + it[k]] : []);
    const taken = new Set();
    const groups = [];
    for (const it of items) {
      if (taken.has(it)) continue;
      let members = [it];
      if (fan(it, "src").length > 1) members = fan(it, "src").filter((x) => !taken.has(x));
      else if (fan(it, "dst").length > 1) members = fan(it, "dst").filter((x) => !taken.has(x) && fan(x, "src").length < 2);
      for (const x of members) taken.add(x);
      const ends = members.flatMap((x) => [x.low, x.high]);
      groups.push({ members, lo: Math.min(...ends), hi: Math.max(...ends) });
    }
    // Groups whose runs do not overlap can share a track. If that packing leaves a crossing, or two
    // arrows on one line, try a track for every group and keep whichever reads cleaner.
    groups.sort((p, q) => p.lo - q.lo);
    const arrange = (share) => {
      const tracks = [];
      for (const grp of groups) {
        let t = share ? tracks.findIndex((list) => list.every((o) => o.hi + 8 < grp.lo || grp.hi + 8 < o.lo)) : -1;
        if (t < 0) t = tracks.push([]) - 1;
        tracks[t].push(grp);
      }
      const n = tracks.length;
      const track = new Map();
      tracks.forEach((list, t) => list.forEach((grp) => grp.members.forEach((x) => track.set(x, t))));
      const crossings = (pos) => {
        let c = 0;
        for (const p of items) {
          const lo = Math.min(p.low, p.high) + 0.5;
          const hi = Math.max(p.low, p.high) - 0.5;
          const pp = pos[track.get(p)];
          for (const q of items) {
            if (q === p || track.get(q) === track.get(p)) continue;
            const qp = pos[track.get(q)];
            if (q.low > lo && q.low < hi && qp > pp) c++;
            if (q.high > lo && q.high < hi && qp < pp) c++;
            // p drops to the next layer where q drops from the layer before: one line would hide the other
            if (Math.abs(q.low - p.high) < 6 && qp > pp) c += 2;
          }
        }
        return c;
      };
      let best = tracks.map((_, i) => i);
      let bestC = crossings(best);
      if (n > 1 && n <= 6) {
        const walk = (pos, left) => {
          if (!left.length) {
            const c = crossings(pos);
            if (c < bestC) [best, bestC] = [pos.slice(), c];
            return;
          }
          for (const t of left) {
            pos[t] = n - left.length;
            walk(pos, left.filter((x) => x !== t));
          }
        };
        walk([], best.slice());
      }
      return { n, track, best, c: bestC };
    };
    let plan = arrange(true);
    if (plan.c > 0 && groups.length > plan.n && groups.length <= 6) {
      const loose = arrange(false);
      if (loose.c < plan.c) plan = loose;
    }
    for (const it of items) {
      const where = [+g, plan.best[plan.track.get(it)], plan.n];
      if (it.part === "t") it.e._t = where;
      else it.e["_" + it.part] = where;
    }
    counts[+g] = plan.n;
  }
  // Where a track sits in its gap. The gap ends where the next layer's label begins.
  const at = ([g, i, n]) => {
    const lo = A.le(L.layers[g]);
    const hi = A.gs(L.layers[g + 1]);
    const step = n > 1 ? Math.min(11, (hi - lo - 16) / (n - 1)) : 0;
    return (lo + hi) / 2 - 1 + (i - (n - 1) / 2) * step;
  };
  // 4. The paths.
  const paths = spec.edges.map((e) => {
    const a = N[e.a];
    const b = N[e.b];
    let pts;
    let badge;
    if (e._same) {
      const right = A.cc(b) > A.cc(a);
      const p = [A.mm(a), right ? A.c1(a) : A.c0(a)];
      const q = [A.mm(b), right ? A.c0(b) : A.c1(b)];
      pts = [p, q];
      badge = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    } else {
      const ac = e._ac;
      const bc = e._bc;
      const from = e._fwd ? A.m1(a) : A.m0(a);
      const to = e._fwd ? A.m0(b) : A.m1(b);
      if (e._lane) {
        const lane = L.lane[e._lane](e._k);
        const ga = at(e._ga);
        const gb = at(e._gb);
        pts = [[from, ac], [ga, ac], [ga, lane], [gb, lane], [gb, bc], [to, bc]];
        badge = [(ga + gb) / 2, lane];
      } else {
        const mid = e._t ? at(e._t) : (from + to) / 2;
        pts = [[from, ac], [mid, ac], [mid, bc], [to, bc]];
        badge = Math.abs(bc - ac) >= 22 ? [mid, (ac + bc) / 2] : [(from + mid) / 2, ac];
      }
    }
    const xy = pts.map(([m, c]) => A.pt(m, c));
    return { e, pts: xy, badge: A.pt(badge[0], badge[1]) };
  });
  return { paths, counts };
}

function arrowHead([x1, y1], [x2, y2]) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const bx = x2 - ux * 7;
  const by = y2 - uy * 7;
  return `${x2},${y2} ${bx - uy * 3.6},${by + ux * 3.6} ${bx + uy * 3.6},${by - ux * 3.6}`;
}

function draw(spec, wide, cur, picked, onPick) {
  // Lay it out once to count the tracks in each gap, then again with room for them.
  let L = layout(spec, wide);
  const need = routes(spec, L).counts.map((n) => (n - 1) * (wide ? 10 : 9));
  if (need.some((x) => x > 0)) L = layout(spec, wide, need);
  const { paths } = routes(spec, L);
  const vis = (at) => (cur === 0 ? "" : (at || 1) > cur ? " is-later" : (at || 1) === cur ? " is-now" : "");
  const svg = el("svg", { viewBox: `0 0 ${L.W} ${L.H}`, role: "img", "aria-label": spec.title, class: "dg-svg" });

  for (const b of L.bases) {
    svg.append(
      el(
        "g",
        { class: "dg-base" + vis(b.at) },
        el("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx: 3 }),
        el("text", { x: b.x + 8, y: b.y + 6 }, b.lines.map((line, i) => el("tspan", { x: b.x + 8, dy: i === 0 ? 10.5 : 12.5 }, line))),
      ),
    );
  }

  // Lines first, then the layer labels, then the arrowheads. A label masks the line behind it, and the
  // arrowhead is drawn over the label, so a long label never hides where an arrow lands.
  const heads = [];
  for (const { e, pts } of paths) {
    const end = pts.length - 1;
    const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const cls = "dg-edge" + (e.dash ? " is-dash" : "") + vis(e.at);
    svg.append(el("g", { class: cls }, el("path", { d })));
    heads.push(el("g", { class: cls }, el("polygon", { points: arrowHead(pts[end - 1], pts[end]) })));
  }

  for (const lab of L.labels) svg.append(el("text", { x: lab.x, y: lab.y, class: "dg-lab" }, lab.text));
  for (const head of heads) svg.append(head);

  for (const n of Object.values(L.nodes)) {
    const kind = n.k || "svc";
    const g = el("g", {
      class: `dg-node k-${kind}` + vis(n.at) + (picked === n.id ? " is-picked" : ""),
      tabindex: onPick ? 0 : null,
      role: onPick ? "button" : null,
      "aria-label": onPick ? `${n.t}${n.s ? ", " + n.s : ""}. Show the notes.` : null,
      "data-id": n.id,
    });
    g.append(el("rect", { x: n.x, y: n.y, width: n.w, height: n.h, rx: kind === "human" ? Math.min(n.h / 2, 22) : 4 }));
    if (kind === "store") g.append(el("path", { d: `M${n.x + 5} ${n.y + n.h - 4.5}H${n.x + n.w - 5}`, class: "dg-shelf" }));
    const cx = n.x + n.w / 2;
    let ty = n.y + 9 - 3.5;
    for (const line of n.tl) {
      ty += TITLE_H;
      g.append(el("text", { x: cx, y: ty, class: "t" }, line));
    }
    if (n.sl.length) ty += 2;
    for (const line of n.sl) {
      ty += SUB_H;
      g.append(el("text", { x: cx, y: ty - 1.5, class: "s" }, line));
    }
    if (onPick) {
      g.addEventListener("click", () => onPick(n.id));
      g.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onPick(n.id);
        }
      });
    }
    svg.append(g);
  }

  for (const { e, badge } of paths) {
    if (e.n == null) continue;
    svg.append(el("g", { class: "dg-badge" + vis(e.at) }, el("circle", { cx: badge[0], cy: badge[1], r: 7.5 }), el("text", { x: badge[0], y: badge[1] + 3.4 }, e.n)));
  }
  return svg;
}

const lastStep = (spec) => Math.max(1, (spec.steps || []).length);

// The second line of a box, as it reads after the title: " (an example)" or " · a note".
const sub = (text) => (text.startsWith("(") ? " " + text : " · " + text);

// A diagram with its controls. opts.notes maps a box id to its notes, shown when the box is tapped.
// opts.build starts in draw order. opts.onDone runs when the last step is reached. opts.hint replaces
// the line that says what a tap on a box shows.
export function diagram(spec, opts = {}) {
  const notes = opts.notes || {};
  const hasNotes = Object.keys(notes).length > 0;
  const hasAws = Object.values(spec.nodes).some((n) => (n.s || "").startsWith("("));
  const total = lastStep(spec);
  let cur = opts.build ? 1 : 0;
  let picked = null;
  let wide = S().settings.tall === true ? false : S().settings.tall === false ? true : window.innerWidth >= 900;

  const stage = h("div", { class: "dg-stage" });
  const cap = h("div", { class: "dg-cap", "aria-live": "polite" });
  const bar = h("div", { class: "dg-bar" });
  const note = h("div", { class: "dg-note", hidden: true });
  const root = h("figure", { class: "dg" }, bar, cap, stage, note);

  function showNote(id) {
    picked = picked === id ? null : id;
    paint();
  }

  function paintNote() {
    clear(note);
    const n = picked && notes[picked];
    note.hidden = !n;
    if (!n) return;
    const meta = spec.nodes[picked];
    add(
      note,
      h("p", { class: "dg-note-title" }, meta.t, meta.s ? h("span", { class: "muted" }, sub(meta.s)) : null),
      typeof n === "string"
        ? h("p", null, n)
        : h(
            "dl",
            { class: "kv" },
            n.what ? [h("dt", null, "What it does"), h("dd", null, n.what)] : null,
            n.why ? [h("dt", null, "Why this one"), h("dd", null, n.why)] : null,
            n.alt ? [h("dt", null, "What you passed on"), h("dd", null, n.alt)] : null,
            n.eq ? [h("dt", null, "Other examples"), h("dd", null, n.eq)] : null,
          ),
    );
  }

  function paint() {
    clear(bar);
    clear(cap);
    const flip = h("button", { class: "btn btn-small", type: "button", onclick: () => ((wide = !wide), (S().settings.tall = !wide), save(), paint()) }, icon("swap"), wide ? "Tall view" : "Wide view");
    if (cur === 0) {
      add(bar, h("button", { class: "btn btn-small btn-go", type: "button", onclick: () => ((cur = 1), paint()) }, icon("pen"), "Build it in draw order"), flip);
      const legend = hasAws ? "A name in brackets is an AWS example." : "";
      const hint = hasNotes ? opts.hint || "Tap a box for what it does, why it is there, and other examples." : "";
      if (hint || legend) cap.append(h("p", { class: "muted dg-hint" }, [hint, legend].filter(Boolean).join(" ")));
    } else {
      add(
        bar,
        h("button", { class: "btn btn-small", type: "button", disabled: cur <= 1, onclick: () => (cur--, paint()) }, icon("back"), "Back"),
        h("span", { class: "dg-count num" }, `Step ${cur} of ${total}`),
        cur < total
          ? h("button", { class: "btn btn-small btn-go", type: "button", onclick: () => (cur++, paint(), cur === total && opts.onDone?.()) }, "Next", icon("next"))
          : h("button", { class: "btn btn-small btn-go", type: "button", onclick: () => ((cur = 0), paint()) }, "Show it all"),
        flip,
      );
      const say = (spec.steps || [])[cur - 1];
      if (say) cap.append(h("p", { class: "dg-say" }, h("span", { class: "dg-say-n" }, cur), say));
    }
    stage.classList.toggle("is-wide", wide);
    stage.replaceChildren(draw(spec, wide, cur, picked, hasNotes ? showNote : null));
    paintNote();
  }

  paint();
  return {
    el: root,
    reveal() {
      cur = 0;
      paint();
    },
  };
}

// Every box of a diagram as a plain list, for the reference under it.
export function nodeList(spec, notes) {
  const order = spec.layers.flatMap((layer) => layer.nodes);
  return h(
    "ul",
    { class: "dg-list" },
    order
      .filter((id) => notes[id])
      .map((id) => {
        const meta = spec.nodes[id];
        const n = notes[id];
        return h(
          "li",
          null,
          h("p", { class: "dg-list-title" }, meta.t, meta.s ? h("span", { class: "muted" }, sub(meta.s)) : null),
          typeof n === "string"
            ? h("p", null, n)
            : [n.what ? h("p", null, n.what) : null, n.why ? h("p", null, h("b", null, "Why this one. "), n.why) : null, n.alt ? h("p", null, h("b", null, "What you passed on. "), n.alt) : null, n.eq ? h("p", null, h("b", null, "Other examples. "), n.eq) : null],
        );
      }),
  );
}
