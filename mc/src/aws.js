// The AWS kit: four reference pictures, the parts by layer, and a map to other stacks.
import { LAYERS, LINE, REFS, STACK, refById } from "./content/aws.js";
import { diagram, nodeList } from "./diagram.js";
import { add, clear, h, icon } from "./dom.js";
import { notice, pageHead } from "./shell.js";
import { S } from "./store.js";
import { jump, say, sec } from "./ui.js";

let coreOnly = false;

function card(c) {
  return h(
    "div",
    { class: "card" + (c.trap ? " trap" : c.core ? " is-core" : "") },
    h("div", { class: "kc-head" }, h("p", { class: "card-title" }, c.name), c.trap ? h("span", { class: "tag" }, "Avoid") : c.core ? h("span", { class: "tag tag-on" }, "Core") : null),
    h("p", { class: "card-text" }, c.job),
    h("dl", { class: "kv" }, h("dt", null, c.trap ? "At the board" : "Pick it when"), h("dd", null, c.pick), h("dt", null, "Say"), h("dd", null, c.say), h("dt", null, c.trap ? "What to use" : "Outside AWS"), h("dd", null, c.eq)),
    c.num ? h("p", { class: "kc-num" }, h("b", null, "Figure: "), c.num) : null,
  );
}

export function stackTable() {
  return h(
    "div",
    { class: "tbl-wrap" },
    h(
      "table",
      { class: "tbl tbl-3" },
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Job"), h("th", { scope: "col" }, "On AWS"), h("th", { scope: "col" }, "On a Hadoop, Spark, or Databricks stack"))),
      h(
        "tbody",
        null,
        STACK.map(([job, aws, other]) => h("tr", null, h("th", { scope: "row" }, job), h("td", { class: "v" }, aws), h("td", { class: "how" }, other))),
      ),
    ),
  );
}

export function awsView(root) {
  const page = h("div", { class: "page learn" });
  clear(root).append(page);
  const total = LAYERS.reduce((n, l) => n + l.cards.length, 0);
  const core = LAYERS.reduce((n, l) => n + l.cards.filter((c) => c.core).length, 0);
  const parts = h("div");

  function paintParts() {
    clear(parts);
    add(
      parts,
      h(
        "div",
        { class: "kit-tools" },
        h(
          "div",
          { class: "chips" },
          h("button", { class: "chip", type: "button", "aria-pressed": String(!coreOnly), onclick: () => ((coreOnly = false), paintParts()) }, `All ${total} parts`),
          h("button", { class: "chip", type: "button", "aria-pressed": String(coreOnly), onclick: () => ((coreOnly = true), paintParts()) }, `The ${core} core parts`),
        ),
        h("p", { class: "muted" }, "If time is short, learn the core parts. They cover every diagram on this site."),
      ),
      LAYERS.map((layer) => {
        const cards = layer.cards.filter((c) => !coreOnly || c.core || c.trap);
        if (!cards.length) return null;
        return h("div", { class: "kit-layer" }, h("h3", { class: "kit-layer-title" }, layer.title), h("p", { class: "kit-layer-note" }, layer.note), h("div", { class: "cards" }, cards.map(card)));
      }),
    );
  }

  add(
    page,
    h(
      "div",
      { class: "hero" },
      h(
        "div",
        null,
        h("h1", { class: "display" }, "The AWS kit"),
        h("p", { class: "hero-sub" }, "You know basic AWS. This page gives you the names to say at the board, when to pick each part, and what the same part is called on the stack the panel runs."),
      ),
      h("div", { class: "next" }, h("span", { class: "next-where" }, "Say this before you draw"), h("p", { class: "next-title", style: "font: 400 21px/1.4 var(--serif)" }, LINE)),
    ),
    jump([
      ["pictures", "Four pictures"],
      ["parts", "Parts by layer"],
      ["map", "Stack map"],
      ["rules", "Rules of thumb"],
    ]),
    sec(
      "pictures",
      "Start here",
      "Four reference pictures",
      h("p", { class: "body" }, "Most answers are one of these four, or two of them joined. Replay each in draw order, then practice it from memory in the drills."),
      h(
        "ol",
        { class: "lessons" },
        REFS.map((r, i) => {
          const rec = S().draw[r.id];
          return h(
            "li",
            { class: "les" },
            h(
              "a",
              { class: "les-row", href: "#/aws/d/" + r.id },
              h("span", { class: "les-n" }, i + 1),
              h("span", null, h("span", { class: "les-title" }, r.title), h("span", { class: "les-meta" }, r.use)),
              h("span", { class: "les-end" }, rec ? `Drawn ${rec.n} time${rec.n === 1 ? "" : "s"}` : "Not drawn yet"),
            ),
          );
        }),
      ),
    ),
    sec("parts", "Vocabulary", "The parts, by layer", parts),
    sec(
      "map",
      "When they say \"we don't use that\"",
      "The same jobs on another stack",
      h("p", { class: "body" }, "The jobs stay the same on every stack. Only the names change. If a panelist names their tool, repeat it once and keep using their word."),
      stackTable(),
    ),
    sec(
      "rules",
      "Judgment",
      "Rules of thumb to say aloud",
      h(
        "ul",
        { class: "plain" },
        [
          "Batch first. Real time has to earn its cost with a decision that is waiting.",
          "Managed first. Run it yourself only when you need control of latency, cost, or a company standard.",
          "One definition of a feature, served two ways. That removes the skew between training and serving.",
          "Every arrow needs a budget or a schedule. Say the milliseconds or the hour.",
          "Draw the security bar under everything: roles, keys, audit log, private network, and the Region.",
          "Raw data stays in its market. Approved aggregates and model artifacts travel.",
          "Nothing reaches production without a registry entry, an owner, and an alarm.",
          "For agents, put the controls outside the model: identity, policy on tool calls, guardrails, and evaluations.",
        ].map((t) => h("li", null, t)),
      ),
    ),
  );
  paintParts();
  return () => {};
}

export function refView(root, id) {
  const r = refById(id);
  if (!r) return notice(root, "That picture is not here", "It may have been renamed.", "#/aws", "The AWS kit");
  const i = REFS.indexOf(r);
  const next = REFS[i + 1];
  const dg = diagram(r.spec, { notes: r.notes });
  clear(root).append(
    h(
      "div",
      { class: "page has-head" },
      pageHead("#/aws", "AWS kit", `Picture ${i + 1} of ${REFS.length}`),
      h("h1", { class: "display lesson-title" }, r.title),
      h("p", { class: "lede" }, r.use),
      say("How to use it", r.intro, true),
      dg.el,
      h("h2", { class: "sub-title" }, "What to say while you draw"),
      h("ol", { class: "rows rows-n" }, r.spec.steps.map((s, k) => h("li", null, h("span", { class: "row-n" }, k + 1), h("p", { class: "row-sub", style: "color: var(--ink); font-size: 16px" }, s)))),
      h("h2", { class: "sub-title" }, "Every box"),
      nodeList(r.spec, r.notes),
      h(
        "div",
        { class: "lesson-foot" },
        h(
          "div",
          { class: "btn-row" },
          h("a", { class: "btn btn-go", href: "#/drills/draw/" + r.id }, icon("pen"), "Draw it from memory"),
          next ? h("a", { class: "btn", href: "#/aws/d/" + next.id }, "Next picture", icon("next")) : h("a", { class: "btn", href: "#/aws" }, "Back to the kit"),
        ),
      ),
    ),
  );
  return () => {};
}
