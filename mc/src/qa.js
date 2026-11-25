// Questions outside the case. Say your answer first, then open the draft.
import { QA, QA_GROUPS } from "./content/qa.js";
import { add, clear, h, icon } from "./dom.js";
import { mark, S } from "./store.js";
import { grade, say, timer } from "./ui.js";

const status = (id) => {
  const r = S().qa[id];
  if (!r) return "";
  return r.last ? "Got it" : "Come back to it";
};

export function qaView(root) {
  const clocks = [];
  const page = h("div", { class: "page learn" });
  clear(root).append(page);
  const tally = h("p", { class: "muted" });
  const paintTally = () => {
    const got = QA.filter((x) => S().qa[x.id]?.last).length;
    tally.textContent = `${got} of ${QA.length} marked as got it.`;
  };

  function item(x, n) {
    const meta = h("span", { class: "qa-meta" }, status(x.id));
    const body = h("div", { class: "qa-body" });
    let built = false;
    const details = h("details", { class: "qa-item" }, h("summary", null, h("span", { class: "row-n" }, n), h("span", { class: "qa-q" }, x.q), meta), body);
    details.addEventListener("toggle", () => {
      if (!details.open || built) return;
      built = true;
      const t = timer(90, { small: true, label: "Say yours first", note: "Aim for 60 to 90 seconds." });
      clocks.push(t);
      const draft = h("div", { hidden: true, style: "display: grid; gap: 12px; justify-items: start" });
      const show = h(
        "button",
        {
          class: "btn btn-go",
          type: "button",
          onclick: () => {
            t.stop();
            show.hidden = true;
            draft.hidden = false;
          },
        },
        icon("eye"),
        "Show the draft answer",
      );
      add(
        draft,
        say("A draft, in your voice", x.a),
        x.add ? h("p", { class: "qa-why" }, h("b", null, "Make it yours. "), x.add) : null,
        x.more ? h("p", { class: "qa-why" }, h("a", { href: x.more[0] }, x.more[1])) : null,
        h("p", { class: "qa-why" }, h("b", null, "What they listen for. "), x.why),
        grade((ok) => {
          mark("qa", x.id, ok);
          meta.textContent = status(x.id);
          paintTally();
        }),
      );
      add(body, t.el, show, draft);
    });
    return h("li", null, details);
  }

  let n = 0;
  add(
    page,
    h(
      "div",
      { class: "hero" },
      h("div", null, h("h1", { class: "display" }, "Questions outside the case"), h("p", { class: "hero-sub" }, "A two-hour session leaves room for questions about you. These are the ones a team asks the person who may become its boss. Say your answer aloud first, then open the draft."), tally),
      h(
        "div",
        { class: "next" },
        h("span", { class: "next-where" }, "The shape of a 75-second answer"),
        h("ol", { class: "rules" }, h("li", null, "The headline, in one sentence."), h("li", null, "One story, with one number."), h("li", null, "What you learned, or what you'd do differently."), h("li", null, "A link to their world. Then stop.")),
      ),
    ),
    h(
      "div",
      { class: "note-box" },
      h("p", { class: "h-note" }, "These are drafts"),
      h("p", null, "Each answer is built from your record, with employers and clients left unnamed. Name them in the room. Change any detail that is not exactly true, and add the specifics that only you know."),
    ),
    QA_GROUPS.map((g) => [h("h2", { class: "group-title" }, g.title), h("p", { class: "group-note" }, g.note), h("ul", { class: "qa-list" }, g.items.map((x) => item(x, ++n)))]),
    h("div", { class: "lesson-foot" }, h("div", { class: "btn-row" }, h("a", { class: "btn btn-go", href: "#/drills/pushback" }, "Practice pushbacks next", icon("next")))),
  );
  paintTally();
  return () => clocks.forEach((t) => t.destroy());
}
