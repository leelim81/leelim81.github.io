// The page header, the Python status chip, and the theme.
import { missCount } from "./content.js";
import { add, clear, h, icon } from "./dom.js";
import { onRuntime, rt, stopRuntime } from "./runtime.js";
import { S, save } from "./store.js";

const dark = window.matchMedia("(prefers-color-scheme: dark)");

export function applyTheme() {
  const pick = S().settings.theme;
  const theme = pick === "system" ? (dark.matches ? "dark" : "light") : pick;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty("--code-size", S().settings.fontSize + "px");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#14161a" : "#f3f4f1");
  return theme;
}
dark.addEventListener("change", () => S() && applyTheme());

export function themeButton() {
  const btn = h("button", { class: "icon-btn", type: "button" });
  const paint = () => {
    const now = applyTheme();
    btn.replaceChildren(icon(now === "dark" ? "sun" : "moon"));
    btn.setAttribute("aria-label", now === "dark" ? "Switch to the light theme" : "Switch to the dark theme");
    btn.title = btn.getAttribute("aria-label");
  };
  btn.addEventListener("click", () => {
    S().settings.theme = applyTheme() === "dark" ? "light" : "dark";
    save();
    paint();
  });
  paint();
  return btn;
}

const STEPS = 5;

// A chip that shows whether Python is ready, with details on click. Returns the element and a cleanup function.
export function runtimeChip() {
  const label = h("span", { class: "rt-label" });
  const body = h("div", { class: "rt-body" });
  const el = h("details", { class: "rt" }, h("summary", { class: "rt-chip" }, h("span", { class: "rt-dot" }), label), body);
  const paint = () => {
    el.dataset.state = rt.state;
    label.textContent = rt.state === "ready" ? "Python ready" : rt.state === "error" ? "Python stopped" : rt.state === "pandas" ? "Python: pandas ready" : "Python starting";
    clear(body);
    if (rt.state === "ready") {
      const v = rt.versions || {};
      add(
        body,
        h("p", null, `Python ${v.python} runs in this tab, with pandas ${v.pandas}, NumPy ${v.numpy}, and scikit-learn ${v.sklearn}. It stays loaded while you move between tasks.`),
        h("p", { class: "muted" }, `Started in ${(rt.ms / 1000).toFixed(1)} s. `, rt.kept ? `${rt.kept.have} of ${rt.kept.want} Python files are saved on this device, so later visits skip the download.` : rt.sw ? "The Python files are being saved on this device." : "Your browser keeps the Python files in its own cache."),
      );
    } else if (rt.state === "error") {
      add(body, h("p", null, rt.text + "."), h("p", { class: "muted" }, "Python loads from cdn.jsdelivr.net on the first visit. After that it starts from this device."), rt.detail ? h("p", { class: "muted rt-detail" }, rt.detail) : null);
    } else {
      add(
        body,
        h("p", null, rt.text + "."),
        h("div", { class: "rt-meter", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": STEPS, "aria-valuenow": rt.step }, h("span", { vars: { "--p": rt.step / STEPS } })),
        h("p", { class: "muted" }, rt.state === "pandas" ? "You can already run pandas code. scikit-learn follows in a few seconds." : "The first visit downloads about 40 MB. After that, Python starts from this device in a few seconds."),
      );
    }
    body.append(h("button", { class: "btn btn-small", type: "button", onclick: () => stopRuntime() }, icon("redo"), rt.state === "error" ? "Try again" : "Restart Python"));
  };
  const off = onRuntime(paint);
  const away = (e) => {
    if (el.open && !el.contains(e.target)) el.open = false;
  };
  document.addEventListener("pointerdown", away);
  paint();
  return {
    el,
    destroy() {
      off();
      document.removeEventListener("pointerdown", away);
    },
  };
}

let chip = null;

export function renderHeader(el) {
  chip?.destroy();
  chip = runtimeChip();
  const here = location.hash || "#/";
  const link = (href, text, extra) => h("a", { href, class: "nav-link", "aria-current": here === href || (href !== "#/" && here.startsWith(href + "/")) ? "page" : null }, text, extra);
  const misses = missCount();
  clear(el);
  add(
    el,
    h("a", { class: "brand", href: "#/", "aria-label": "Ninety, home" }, h("span", { class: "brand-mark" }, "Ninety")),
    h("nav", { class: "nav", "aria-label": "Main" }, link("#/", "Plan"), link("#/learn", "Refresher"), link("#/library", "Library"), link("#/review", "Review", misses ? h("span", { class: "nav-count" }, misses) : null), link("#/settings", "Settings")),
    h("div", { class: "top-end" }, chip.el, themeButton()),
  );
}

// A plain message page, for things that are missing or locked.
export function notice(root, title, text, href = "#/", label = "Back to the plan") {
  clear(root).append(h("div", { class: "notice" }, h("h1", { class: "display-2" }, title), h("p", null, text), h("a", { class: "btn btn-go", href }, label)));
  return () => {};
}
