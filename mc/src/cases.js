// The cases: try each one cold against a clock, then open the worked answer.
import { CASES, caseById } from "./content/cases.js";
import { diagram, nodeList } from "./diagram.js";
import { add, clear, h, icon } from "./dom.js";
import { notice, pageHead } from "./shell.js";
import { caseRec, logDay, S, save } from "./store.js";
import { bullets, jump, say, sec, table, timer } from "./ui.js";

export function caseState(c) {
  const r = S().cases[c.id];
  if (!r) return "new";
  if (r.done) return "done";
  if (r.revealed) return "open";
  return "new";
}

export function casesView(root) {
  clear(root);
  add(
    root,
    h(
      "div",
      { class: "page learn" },
      h(
        "div",
        { class: "hero" },
        h("div", null, h("h1", { class: "display" }, "Four cases, worked in full"), h("p", { class: "hero-sub" }, "Try each one cold against the clock, out loud, with a pen. Then open the worked answer and compare. Every case has a diagram you can replay in draw order.")),
        h(
          "div",
          { class: "next" },
          h("span", { class: "next-where" }, "How to use a case"),
          h("ol", { class: "rules" }, h("li", null, "Read the prompt once, as the panel would say it."), h("li", null, "Talk for 20 minutes: questions first, then options, then the design."), h("li", null, "Open the answer. Mark what you missed, not what you got.")),
        ),
      ),
      h(
        "ol",
        { class: "lessons" },
        CASES.map((c) => {
          const state = caseState(c);
          return h(
            "li",
            { class: "les" + (state === "open" ? " is-current" : "") },
            h(
              "a",
              { class: "les-row", href: "#/case/" + c.id },
              h("span", { class: "les-n" }, state === "done" ? icon("check", "Done") : c.n),
              h("span", null, h("span", { class: "les-title" }, c.title), h("span", { class: "les-meta" }, c.kicker)),
              h("span", { class: "les-end" }, state === "done" ? "Done" : state === "open" ? "Answer opened" : `${c.minutes} min cold`),
            ),
          );
        }),
      ),
    ),
  );
  return () => {};
}

export function caseView(root, id) {
  const c = caseById(id);
  if (!c) return notice(root, "That case is not here", "It may have been renamed.", "#/cases", "All cases");
  const rec = caseRec(id);
  if (!rec.opened) {
    rec.opened = Date.now();
    save();
  }
  const clocks = [];
  const page = h("div", { class: "page has-head" });
  clear(root).append(page);

  function paint() {
    for (const t of clocks.splice(0)) t.destroy();
    clear(page);
    add(
      page,
      pageHead("#/cases", "Cases", `Case ${c.n} of ${CASES.length}`),
      h("h1", { class: "display lesson-title" }, c.title),
      h("p", { class: "lede" }, c.kicker),
      h("div", { class: "case-prompt" }, say("The panel says", c.prompt)),
      c.brief ? h("details", { class: "fold", open: true }, h("summary", null, c.brief.title), table(c.brief.head, c.brief.rows)) : null,
    );
    if (!rec.revealed) paintTry();
    else paintAnswer();
  }

  function paintTry() {
    const t = timer(c.minutes * 60, { mode: "up", note: `Aim for ${c.minutes} minutes.` });
    clocks.push(t);
    add(
      page,
      h(
        "div",
        { class: "try" },
        h("p", { class: "try-title" }, "Try it cold first"),
        h(
          "ol",
          null,
          h("li", null, "Say your opening line and your plan for the session."),
          h("li", null, "Ask at least five clarifying questions. State an assumption for each one."),
          h("li", null, "Offer two or three approaches, and pick one."),
          h("li", null, "Draw the design on paper and talk through it."),
          h("li", null, "Add the leader's layer: team, phases, risks, and the gate."),
          h("li", null, "Close in two minutes."),
        ),
        t.el,
        h(
          "div",
          { class: "btn-row" },
          h(
            "button",
            {
              class: "btn btn-go",
              type: "button",
              onclick: () => {
                rec.tried = rec.tried || (t.seconds() >= 60 ? Date.now() : 0);
                rec.revealed = Date.now();
                logDay();
                paint();
                window.scrollTo(0, 0);
              },
            },
            icon("eye"),
            "Show the worked answer",
          ),
        ),
        h("p", { class: "muted" }, "The attempt is what you will remember. The answer is there to check it against."),
      ),
    );
  }

  function paintAnswer() {
    const sections = [
      ["open", "Open"],
      ["clarify", "Clarify"],
      ["options", "Options"],
      ["design", "Design"],
      ["talk", "Talk track"],
      ["numbers", "Numbers"],
      ["calls", "Trade-offs"],
      ["lead", "Lead"],
      ["push", "Pushbacks"],
      ["close", "Two minutes"],
    ];
    const two = timer(120, { small: true, label: "Say it against the clock" });
    clocks.push(two);
    add(
      page,
      jump(sections),

      sec(
        "open",
        "Set the contract",
        "Your first line",
        say("Say this before anything else", c.first),
        h("div", { class: "note-box" }, h("p", { class: "h-note" }, c.insight.title), h("p", null, c.insight.text), c.insight.proof ? h("p", { class: "note-proof" }, c.insight.proof) : null),
      ),

      sec(
        "clarify",
        "Clarify",
        "Questions to ask first",
        h("p", { class: "body" }, "Ask one or two at a time, and play back what you hear. Each question earns its place by changing the design."),
        h(
          "ol",
          { class: "rows rows-n" },
          c.clarify.map((x, i) => h("li", null, h("span", { class: "row-n" }, i + 1), h("div", null, h("p", { class: "row-main" }, x.q), h("p", { class: "row-sub" }, x.why)))),
        ),
        h("h3", { class: "sub-title" }, "If they say \"you decide\", state these and move on"),
        bullets(c.assume),
      ),

      sec(
        "options",
        "Present options",
        "Two or three ways to do it",
        h(
          "div",
          { class: "cards" },
          c.options.map((o) => h("div", { class: "card" + (o.pick ? " is-pick" : "") }, h("p", { class: "card-title" }, o.name, o.pick ? [" ", h("span", { class: "tag tag-on" }, "Your pick")] : null), h("p", { class: "card-text" }, o.text))),
        ),
        say("Then recommend", c.recommend, true),
      ),

      sec(
        "design",
        "Execute",
        c.diagrams.length > 1 ? "The design, in two drawings" : "The design",
        c.diagrams.map((d) => {
          const dg = diagram(d.spec, { notes: d.notes });
          return [
            d.heading ? h("h3", { class: "sub-title" }, d.heading) : null,
            h("p", { class: "body" }, d.intro),
            dg.el,
            Object.keys(d.notes || {}).length ? h("details", { class: "fold" }, h("summary", null, "Every box, in one list"), nodeList(d.spec, d.notes)) : null,
          ];
        }),
      ),

      sec(
        "talk",
        "Execute",
        "What to say while you draw",
        c.talk.map((t) => [h("h3", { class: "sub-title" }, t.h), bullets(t.points)]),
      ),

      sec("numbers", "Execute", "Numbers to do aloud", h("p", { class: "body" }, "Do the arithmetic on the board. The method matters more than the figure, and every input is an assumption you can ask them to correct."), table(["What", "Figure", "How you get it"], c.numbers.map((n) => [n.k, n.v, n.how]))),

      sec(
        "calls",
        "Execute",
        "The calls you make, and what would change them",
        h(
          "ul",
          { class: "rows" },
          c.tradeoffs.map((t) => h("li", null, h("p", { class: "row-main" }, t.call), h("p", { class: "row-sub" }, h("b", null, "Because: "), t.because), h("p", { class: "row-sub" }, h("b", null, "You change your mind if: "), t.flip))),
        ),
      ),

      sec(
        "lead",
        "Drive",
        "The layer only you add",
        h("h3", { class: "sub-title" }, "Team"),
        h("p", { class: "body" }, c.lead.team),
        h("h3", { class: "sub-title" }, "Phases"),
        h(
          "ul",
          { class: "rows" },
          c.lead.phases.map((p) => h("li", null, h("p", { class: "row-main" }, p.name, h("span", { class: "muted" }, " · " + p.when)), h("p", { class: "row-sub" }, p.text))),
        ),
        h("h3", { class: "sub-title" }, "Metrics, each with a bodyguard"),
        bullets(c.lead.metrics),
        h("h3", { class: "sub-title" }, "Risks, by DRIFTS"),
        h(
          "ul",
          { class: "rows rows-n" },
          c.lead.risks.map((r) => h("li", null, h("span", { class: "row-n" }, r.l), h("div", null, h("p", { class: "row-main" }, r.name), h("p", { class: "row-sub" }, r.text)))),
        ),
        h("h3", { class: "sub-title" }, "Gates before go-live"),
        bullets(c.lead.gates),
      ),

      sec(
        "push",
        "Expect this",
        "Pushbacks, and how you take them",
        h("p", { class: "body" }, "Cover the answer, say yours aloud, then open it. The pattern is the same each time: take the point, test it with a question or a number, then land a decision."),
        h(
          "ul",
          { class: "qa-list" },
          c.pushbacks.map((p, i) => h("li", null, h("details", { class: "qa-item" }, h("summary", null, h("span", { class: "row-n" }, i + 1), h("span", { class: "qa-q" }, p.q)), h("div", { class: "qa-body" }, say("One way to answer", p.a))))),
        ),
      ),

      sec("close", "Close", "The whole case in two minutes", h("p", { class: "body" }, "Problem, play, pilot, proof, and one ask. Read it once, then say it without looking."), say("Your close", c.summary), two.el),

      h(
        "div",
        { class: "lesson-foot" },
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
                paint();
              },
            },
            icon(rec.done ? "redo" : "check"),
            rec.done ? "Mark as not done" : "Mark this case as done",
          ),
          h(
            "button",
            {
              class: "btn",
              type: "button",
              onclick: () => {
                rec.revealed = 0;
                save();
                paint();
                window.scrollTo(0, 0);
              },
            },
            "Hide the answer and try again",
          ),
          nextCase(c),
        ),
      ),
    );
  }

  paint();
  return () => clocks.forEach((t) => t.destroy());
}

function nextCase(c) {
  const next = CASES[CASES.indexOf(c) + 1];
  return next ? h("a", { class: "btn", href: "#/case/" + next.id }, "Next case", icon("next")) : h("a", { class: "btn", href: "#/drills" }, "On to the drills", icon("next"));
}
