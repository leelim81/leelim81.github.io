// The page header and the theme.
import { add, clear, h, icon } from "./dom.js";
import { S, save } from "./store.js";

const dark = window.matchMedia("(prefers-color-scheme: dark)");

export function applyTheme() {
  const pick = S().settings.theme;
  const theme = pick === "system" ? (dark.matches ? "dark" : "light") : pick;
  document.documentElement.dataset.theme = theme;
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

const LINKS = [
  ["#/", "Plan"],
  ["#/playbook", "Playbook"],
  ["#/panel", "Panel"],
  ["#/cases", "Cases"],
  ["#/mine", "Your case"],
  ["#/kit", "Toolkit"],
  ["#/qa", "Q&A"],
  ["#/drills", "Drills"],
  ["#/primer", "Primer"],
  ["#/videos", "Videos"],
];

export function renderHeader(el) {
  const here = location.hash || "#/";
  const on = (href) => here === href || (href !== "#/" && here.startsWith(href + "/")) || (href === "#/cases" && here.startsWith("#/case/"));
  clear(el);
  add(
    el,
    h("a", { class: "brand", href: "#/", "aria-label": "One Twenty, home" }, h("span", { class: "brand-mark" }, "One Twenty")),
    h(
      "nav",
      { class: "nav nav-many", "aria-label": "Main" },
      LINKS.map(([href, text]) => h("a", { href, class: "nav-link", "aria-current": on(href) ? "page" : null }, text)),
    ),
    h("div", { class: "top-end" }, h("a", { class: "icon-btn", href: "#/settings", "aria-label": "Settings", title: "Settings", "aria-current": here === "#/settings" ? "page" : null }, icon("gear")), themeButton()),
  );
}

// A plain message page, for things that are missing.
export function notice(root, title, text, href = "#/", label = "Back to the plan") {
  clear(root).append(h("div", { class: "notice" }, h("h1", { class: "display-2" }, title), h("p", null, text), h("a", { class: "btn btn-go", href }, label)));
  return () => {};
}

// The bar at the top of a reading or drill page: a way back, a title, and room for a clock or steps.
export function pageHead(backHref, backLabel, title, ...end) {
  return h("div", { class: "quiz-head" }, h("a", { class: "back", href: backHref }, icon("back"), backLabel), h("span", { class: "quiz-title" }, title), end);
}
