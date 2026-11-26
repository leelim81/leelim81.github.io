// The primer: short lessons for the gaps, each with lines to keep and three checks.
import { LESSONS, lessonById } from "./content/primer.js";
import { add, clear, h, icon } from "./dom.js";
import { notice, pageHead } from "./shell.js";
import { lessonRec, logDay, S, save } from "./store.js";

export function lessonState(l) {
  const r = S().lessons[l.id];
  return r?.done ? "done" : r?.opened ? "open" : "new";
}

export function primerView(root) {
  clear(root).append(
    h(
      "div",
      { class: "page learn" },
      h(
        "div",
        { class: "hero" },
        h("div", null, h("h1", { class: "display" }, "The primer"), h("p", { class: "hero-sub" }, "Five short lessons for the ground you haven't stood on: payments, fraud models, and Spark at this scale. Plus two that put your own experience in order.")),
        h(
          "div",
          { class: "next" },
          h("span", { class: "next-where" }, "How to use a lesson"),
          h("ol", { class: "rules" }, h("li", null, "Read it once. It takes about ten minutes."), h("li", null, "Answer the three checks without scrolling up."), h("li", null, "Say the lines to keep aloud. They are written to be spoken.")),
        ),
      ),
      h(
        "ol",
        { class: "lessons" },
        LESSONS.map((l) => {
          const state = lessonState(l);
          return h(
            "li",
            { class: "les" + (state === "open" ? " is-current" : "") },
            h(
              "a",
              { class: "les-row", href: "#/primer/" + l.id },
              h("span", { class: "les-n" }, state === "done" ? icon("check", "Done") : l.n),
              h("span", null, h("span", { class: "les-title" }, l.title), h("span", { class: "les-meta" }, l.intro)),
              h("span", { class: "les-end" }, state === "done" ? "Done" : `${l.minutes} min`),
            ),
          );
        }),
      ),
      h(
        "div",
        { class: "note-box", style: "margin-top: 28px" },
        h("p", { class: "h-note" }, "Where the figures come from"),
        h(
          "p",
          null,
          "Service limits are AWS examples, and come from the AWS documentation. Spark defaults come from the Apache Spark documentation. The rules come from the Monetary Authority of Singapore and from the Reserve Bank of India's circular of 6 April 2018. Scam figures come from the Singapore Police Force. Payment volumes and timings are the published figures of one large card network. The other numbers in the cases and the drills are assumptions for practice.",
        ),
        h("p", { class: "note-proof" }, "Limits and rules change. Check any figure you plan to quote on the day."),
      ),
    ),
  );
  return () => {};
}

function block(b) {
  if (b.h) return h("h2", null, b.h);
  if (b.p) return h("p", null, b.p);
  if (b.ul) return h("ul", null, b.ul.map((t) => h("li", null, t)));
  if (b.ex) return h("div", { class: "ex" }, h("p", null, b.ex));
  if (b.trap) return h("div", { class: "trap" }, h("p", null, h("b", null, "Watch out. "), b.trap));
  return null;
}

export function lessonView(root, id) {
  const l = lessonById(id);
  if (!l) return notice(root, "That lesson is not here", "It may have been renamed.", "#/primer", "The primer");
  const rec = lessonRec(id);
  if (!rec.opened) {
    rec.opened = Date.now();
    save();
  }
  const next = LESSONS[LESSONS.indexOf(l) + 1];
  const foot = h("div", { class: "lesson-foot" });

  function paintFoot() {
    clear(foot).append(
      h(
        "div",
        { class: "btn-row" },
        h(
          "button",
          {
            class: "btn " + (rec.done ? "" : "btn-go"),
            type: "button",
            onclick: () => {
              rec.done = rec.done ? 0 : Date.now();
              logDay();
              paintFoot();
            },
          },
          icon(rec.done ? "redo" : "check"),
          rec.done ? "Mark as not done" : "Mark this lesson as done",
        ),
        next ? h("a", { class: "btn", href: "#/primer/" + next.id }, "Next lesson", icon("next")) : h("a", { class: "btn", href: "#/drills" }, "On to the drills", icon("next")),
      ),
    );
  }

  function check(c, i) {
    const box = h("div", { class: "lcheck" });
    const paint = () => {
      const picked = rec.answers[c.id];
      const answered = picked != null;
      const hit = picked === c.right;
      box.classList.toggle("is-open", !answered);
      clear(box);
      add(
        box,
        h("p", { class: "lcheck-label" }, `Check ${i + 1} of ${l.checks.length}`),
        h("p", { class: "q-stem" }, c.q),
        h(
          "fieldset",
          { class: "q-options q-form" },
          h("legend", null, answered ? "Your answer" : "Pick one"),
          c.options.map((text, k) =>
            h(
              "label",
              { class: "opt" + (answered && k === c.right ? " is-right" : "") + (answered && k === picked && !hit ? " is-wrong is-picked" : "") },
              h("input", {
                type: "radio",
                name: `${l.id}-${c.id}`,
                checked: picked === k,
                disabled: answered,
                onchange: () => {
                  rec.answers[c.id] = k;
                  if (l.checks.every((x) => rec.answers[x.id] === x.right) && !rec.done) rec.done = Date.now();
                  logDay();
                  paint();
                  paintFoot();
                },
              }),
              h("span", null, text),
              answered && k === c.right ? h("span", { class: "opt-mark" }, icon("check"), "Right") : null,
            ),
          ),
        ),
        answered
          ? h(
              "div",
              { class: "q-feedback" },
              h("p", { class: "verdict " + (hit ? "is-hit" : "is-miss") }, icon(hit ? "check" : "cross"), hit ? "Right." : "Not this one."),
              h("div", { class: "q-explain" }, h("p", null, c.why)),
              h(
                "button",
                {
                  class: "link-btn lcheck-again",
                  type: "button",
                  onclick: () => {
                    delete rec.answers[c.id];
                    save();
                    paint();
                  },
                },
                "Try this check again",
              ),
            )
          : null,
      );
    };
    paint();
    return box;
  }

  clear(root).append(
    h(
      "div",
      { class: "lesson" },
      pageHead("#/primer", "Primer", `Lesson ${l.n} of ${LESSONS.length}`),
      h("h1", { class: "display lesson-title" }, l.title),
      h("p", { class: "lesson-intro" }, l.intro),
      h("p", { class: "lesson-meta muted" }, `About ${l.minutes} minutes.`),
      h("div", { class: "lesson-body" }, h("div", { class: "lesson-text prose" }, l.body.map(block))),
      h("div", { class: "keys" }, h("h2", { class: "keys-title" }, "Lines to keep"), h("ul", null, l.keys.map((k) => h("li", null, k)))),
      h("h2", { class: "h-sec" }, "Three checks"),
      l.checks.map(check),
      foot,
    ),
  );
  paintFoot();
  return () => {};
}
