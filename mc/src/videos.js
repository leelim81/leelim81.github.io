// Reference videos, with what to look for in each.
import { HOW_TO_WATCH, VIDEO_GROUPS, VIDEOS } from "./content/videos.js";
import { add, clear, h, icon } from "./dom.js";
import { logDay, S, save } from "./store.js";

export function videosView(root) {
  const page = h("div", { class: "page learn" });
  clear(root).append(page);
  const tally = h("p", { class: "muted" });
  const paintTally = () => (tally.textContent = `${VIDEOS.filter((v) => S().watched[v.id]).length} of ${VIDEOS.length} watched.`);

  function row(v, n) {
    const btn = h("button", { class: "btn btn-small", type: "button" });
    const paint = () => {
      const on = !!S().watched[v.id];
      btn.replaceChildren(icon(on ? "check" : "ring"), on ? "Watched" : "Mark as watched");
      btn.setAttribute("aria-pressed", String(on));
    };
    btn.addEventListener("click", () => {
      if (S().watched[v.id]) {
        delete S().watched[v.id];
        save();
      } else {
        S().watched[v.id] = Date.now();
        logDay();
      }
      paint();
      paintTally();
    });
    paint();
    return h(
      "li",
      { class: "vid" },
      h("span", { class: "vid-n" }, n),
      h(
        "div",
        null,
        h("p", { class: "vid-title" }, v.title),
        h("p", { class: "vid-meta" }, `${v.channel} · ${v.date}`),
        h("p", { class: "vid-why" }, v.why),
        h("p", { class: "vid-watch" }, h("b", null, "Watch for: ")),
        h("ul", { class: "plain", style: "font-size: 15px" }, v.watch.map((w) => h("li", null, w))),
        h("div", { class: "vid-actions" }, h("a", { class: "btn btn-small btn-go", href: "https://www.youtube.com/watch?v=" + v.id, target: "_blank", rel: "noopener noreferrer" }, icon("out"), "Open on YouTube"), btn),
      ),
    );
  }

  let n = 0;
  add(
    page,
    h(
      "div",
      { class: "hero" },
      h("div", null, h("h1", { class: "display" }, "Watch how others talk it through"), h("p", { class: "hero-sub" }, "Seven videos that show a case or a design being reasoned aloud. Use them for the rhythm and the phrases. The content of your session will differ."), tally),
      h("div", { class: "next" }, h("span", { class: "next-where" }, "How to watch"), h("ol", { class: "rules" }, HOW_TO_WATCH.map((t) => h("li", null, t)))),
    ),
    h(
      "div",
      { class: "note-box" },
      h("p", { class: "h-note" }, "How these were chosen"),
      h("p", null, "From each video's title, description, and channel. Nobody has watched them for you, so skim the first minutes and drop any that don't help."),
    ),
    VIDEO_GROUPS.map((g) => [h("h2", { class: "group-title" }, g.title), h("p", { class: "group-note" }, g.note), h("ol", { class: "vids" }, g.items.map((v) => row(v, ++n)))]),
  );
  paintTally();
  return () => {};
}
