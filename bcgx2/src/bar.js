// The 90-minute bar: the test's five modules drawn to scale, filled in as practice adds up.
import { B, moduleProgress } from "./content.js";
import { h, icon } from "./dom.js";

function progressText(m, p) {
  const what = m.kind === "quiz" ? "right" : "solved";
  return p.done >= p.target ? `${p.done} ${what}, target met` : `${p.done} ${what}, aim for ${p.target}`;
}

// size "full" has the legend. size "slim" is the track only. needle is a fraction of the 90 minutes.
export function ninetyBar({ progress = moduleProgress(), size = "full", needle = null } = {}) {
  const mods = B().modules;
  const segs = {};
  const texts = {};
  const track = h("div", { class: "nb-track", "aria-hidden": "true" });
  for (const m of mods) {
    segs[m.id] = h("div", { class: "nb-seg", vars: { "--w": m.minutes } }, h("span", { class: "nb-fill" }), h("span", { class: "nb-num" }, m.id));
    track.append(segs[m.id]);
  }
  track.append(h("div", { class: "nb-seg nb-rest", vars: { "--w": 5 } }));
  const pin = h("div", { class: "nb-needle", hidden: true });
  track.append(pin);

  const legend = h("ol", { class: "nb-legend" });
  for (const m of mods) {
    texts[m.id] = h("span", { class: "nb-got" });
    legend.append(
      h("li", { class: "nb-key", vars: { "--w": m.minutes } }, h("span", { class: "nb-name" }, h("span", { class: "nb-n" }, m.id), m.short), h("span", { class: "nb-min" }, `${m.minutes} min`), texts[m.id]),
    );
  }
  legend.append(h("li", { class: "nb-key nb-key-rest", vars: { "--w": 5 } }, h("span", { class: "nb-name" }, "Review"), h("span", { class: "nb-min" }, "5 min")));

  const el = h("div", { class: "nb nb-" + size }, track, size === "full" ? legend : null);
  el.update = (prog) => {
    for (const m of mods) {
      const p = prog[m.id];
      segs[m.id].style.setProperty("--fill", p.frac);
      segs[m.id].classList.toggle("is-full", p.frac >= 1);
      texts[m.id].replaceChildren(p.frac >= 1 ? icon("check") : "", progressText(m, p));
    }
  };
  el.setNeedle = (frac) => {
    pin.hidden = frac == null;
    if (frac != null) pin.style.setProperty("--at", Math.max(0, Math.min(1, frac)));
  };
  el.update(progress);
  el.setNeedle(needle);
  return el;
}

// Which module the clock says you should be in, for a given number of seconds into the test.
export function moduleAt(seconds) {
  let end = 0;
  for (const m of B().modules) {
    end += m.minutes * 60;
    if (seconds < end) return m;
  }
  return null;
}
