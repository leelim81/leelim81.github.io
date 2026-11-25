// Pieces that several pages share: sections, lines to say aloud, clocks, and the row of jump links.
import { clock as fmt, h, icon } from "./dom.js";

export function sec(id, kicker, title, ...kids) {
  return h("section", { class: "sec", id: "s-" + id }, kicker ? h("p", { class: "sec-kicker" }, kicker) : null, h("h2", { class: "sec-title" }, title), kids);
}

// A line to say aloud.
export function say(label, text, quiet) {
  return h("blockquote", { class: "say" + (quiet ? " say-quiet" : "") }, label ? h("span", { class: "say-label" }, label) : null, text);
}

export const bullets = (items, cls = "plain") => h("ul", { class: cls }, items.map((t) => h("li", null, t)));

// A sticky row of links to the sections of a long page. The router owns the hash, so these scroll.
export function jump(items) {
  return h(
    "nav",
    { class: "jump", "aria-label": "On this page" },
    h(
      "div",
      { class: "chips" },
      items.map(([id, label]) =>
        h(
          "button",
          {
            class: "chip",
            type: "button",
            onclick: () => document.getElementById("s-" + id)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }),
          },
          label,
        ),
      ),
    ),
  );
}

// A clock. mode "down" counts down from the given seconds and stops at zero. mode "up" counts up and
// turns yellow once it passes them. Returns the element and the controls; call destroy when the page goes.
export function timer(seconds, opts = {}) {
  const mode = opts.mode || "down";
  let started = 0;
  let banked = 0;
  let tick = 0;
  let done = false;
  const face = h("span", { class: "clock-face num", role: "timer" });
  const btn = h("button", { class: "btn btn-small", type: "button" });
  const again = h("button", { class: "link-btn", type: "button" }, "Reset");
  const el = h("div", { class: "clock" + (opts.small ? " is-small" : "") }, face, btn, again, opts.note ? h("span", { class: "clock-note" }, opts.note) : null);

  const ms = () => banked + (started ? Date.now() - started : 0);
  function paint() {
    const sec = ms() / 1000;
    const left = seconds - sec;
    face.textContent = mode === "down" ? fmt(Math.max(0, Math.ceil(left))) : fmt(sec);
    el.classList.toggle("is-over", left <= 0);
    btn.replaceChildren(icon(started ? "stop" : "play"), started ? "Pause" : banked ? "Resume" : opts.label || "Start");
    if (mode === "down" && left <= 0 && !done) {
      done = true;
      stop();
      opts.onDone?.();
    }
  }
  function start() {
    if (started || (mode === "down" && done)) return;
    started = Date.now();
    tick = setInterval(paint, 250);
    paint();
  }
  function stop() {
    if (!started) return;
    banked += Date.now() - started;
    started = 0;
    clearInterval(tick);
    paint();
  }
  function reset() {
    clearInterval(tick);
    started = 0;
    banked = 0;
    done = false;
    paint();
  }
  btn.addEventListener("click", () => (started ? stop() : start()));
  again.addEventListener("click", reset);
  paint();
  return { el, start, stop, reset, seconds: () => Math.round(ms() / 1000), destroy: () => clearInterval(tick) };
}

// A table that becomes stacked rows on a phone. rows: [[name, value, how]].
export function table(head, rows) {
  return h(
    "div",
    { class: "tbl-wrap" },
    h(
      "table",
      { class: "tbl" },
      h("thead", null, h("tr", null, head.map((t) => h("th", { scope: "col" }, t)))),
      h(
        "tbody",
        null,
        rows.map(([name, value, how]) => h("tr", null, h("th", { scope: "row" }, name), h("td", { class: "v" }, value), h("td", { class: "how" }, how))),
      ),
    ),
  );
}

// Two buttons to mark your own attempt. onMark gets true or false.
export function grade(onMark, labels = ["Missed it", "Got it"]) {
  const wrap = h("div", { class: "grade" });
  const paint = (picked) => {
    wrap.replaceChildren(
      h("span", { class: "grade-label" }, picked == null ? "How did it go?" : picked ? "Marked as got it." : "Marked to come back to."),
      h("button", { class: "btn btn-small", type: "button", "aria-pressed": picked === false ? "true" : "false", onclick: () => (onMark(false), paint(false)) }, icon("cross"), labels[0]),
      h("button", { class: "btn btn-small", type: "button", "aria-pressed": picked === true ? "true" : "false", onclick: () => (onMark(true), paint(true)) }, icon("check"), labels[1]),
    );
  };
  paint(null);
  return wrap;
}
