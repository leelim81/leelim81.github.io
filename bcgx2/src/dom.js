// Small DOM helpers. No framework: views are functions that build elements.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "for") el.htmlFor = v;
      else if (k === "vars") for (const [name, val] of Object.entries(v)) el.style.setProperty(name, val);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k in el && !k.includes("-")) el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  add(el, kids);
  return el;
}

export function add(el, ...kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === "") continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const ICONS = {
  check: '<path d="M3.5 8.5l3 3 6-7"/>',
  cross: '<path d="M4 4l8 8M12 4l-8 8"/>',
  dot: '<circle cx="8" cy="8" r="3" fill="currentColor" stroke="none"/>',
  ring: '<circle cx="8" cy="8" r="4.5"/>',
  half: '<circle cx="8" cy="8" r="4.5"/><path d="M8 3.5a4.5 4.5 0 010 9z" fill="currentColor" stroke="none"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/>',
  play: '<path d="M5 3.5v9l7.5-4.5z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" stroke="none"/>',
  back: '<path d="M9.5 3.5L5 8l4.5 4.5"/>',
  next: '<path d="M6.5 3.5L11 8l-4.5 4.5"/>',
  file: '<path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3"/>',
  table: '<rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M2.5 6.5h11M6.5 3v10"/>',
  code: '<path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5"/>',
  sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/>',
  moon: '<path d="M13 9.5A5.5 5.5 0 016.5 3 5.5 5.5 0 1013 9.5z"/>',
  clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/>',
  hint: '<path d="M6 12h4M6.5 14h3M5.5 10a4 4 0 115 0c-.5.5-.5 1-.5 2h-4c0-1 0-1.5-.5-2z"/>',
  redo: '<path d="M12.5 8a4.5 4.5 0 11-1.3-3.2"/><path d="M12.5 3v2.5H10"/>',
  x: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
  calc: '<rect x="3.5" y="2" width="9" height="12" rx="1"/><path d="M5.5 5h5M5.5 8h1M9.5 8h1M5.5 11h1M9.5 11h1"/>',
};

export function icon(name, label) {
  const span = document.createElement("span");
  span.className = "ico ico-" + name;
  span.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>${ICONS[name] || ""}</svg>`;
  return span;
}

// 754 -> "12:34", 3725 -> "1:02:05"
export function clock(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  const ss = String(sec % 60).padStart(2, "0");
  return hh ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${String(mm).padStart(2, "0")}:${ss}`;
}

export const plural = (n, one, many = one + "s") => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

export function bytes(n) {
  if (n < 1000) return `${n} B`;
  if (n < 1e6) return `${Math.round(n / 1000)} KB`;
  return `${(n / 1e6).toFixed(1)} MB`;
}

export function dateLabel(iso, opts = { weekday: "short", day: "numeric", month: "short" }) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", opts);
}

// A modal dialog. Resolves with the value of the button that closed it, or null.
export function ask({ title, body, actions, wide }) {
  return new Promise((resolve) => {
    const dlg = h("dialog", { class: "dlg" + (wide ? " dlg-wide" : "") });
    const close = (value) => {
      dlg.close();
      dlg.remove();
      resolve(value);
    };
    add(
      dlg,
      h("h2", { class: "dlg-title" }, title),
      h("div", { class: "dlg-body" }, body),
      h(
        "div",
        { class: "dlg-actions" },
        actions.map((a) => h("button", { class: "btn " + (a.kind || ""), type: "button", autofocus: a.focus, onclick: () => close(a.value) }, a.label)),
      ),
    );
    dlg.addEventListener("cancel", (e) => {
      e.preventDefault();
      close(null);
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

let toastTimer = 0;
export function toast(text) {
  let el = document.getElementById("toast");
  if (!el) {
    el = h("div", { id: "toast", class: "toast", role: "status" });
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("on"), 2600);
}

// Seeded shuffle, so a question shows the same option order until it is answered.
export function shuffled(n, seed) {
  let x = 0;
  for (const ch of String(seed)) x = (Math.imul(x, 31) + ch.charCodeAt(0)) | 0;
  const rnd = () => {
    x = (Math.imul(x ^ (x >>> 15), 2246822507) + 0x9e3779b9) | 0;
    return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
  };
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
