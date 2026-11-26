// The toolkit: four reference pictures, the components by layer, and a map of product names.
// Every component has a plain name. A product name is only ever an example.
import { LAYERS, LINE, REFS, STACK, refById } from "./content/kit.js";
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
    h("div", { class: "kc-head" }, h("p", { class: "card-title" }, c.name, " ", h("span", { class: "kc-aws" }, `(${c.aws})`)), c.trap ? h("span", { class: "tag" }, "Avoid") : c.core ? h("span", { class: "tag tag-on" }, "Core") : null),
    h("p", { class: "card-text" }, c.job),
    h("dl", { class: "kv" }, h("dt", null, c.trap ? "At the board" : "Pick it when"), h("dd", null, c.pick), h("dt", null, "Say"), h("dd", null, c.say), h("dt", null, c.trap ? "What to use" : "Other examples"), h("dd", null, c.eq)),
    c.num ? h("p", { class: "kc-num" }, h("b", null, "On AWS. "), c.num) : null,
  );
}

export function stackTable() {
  return h(
    "div",
    { class: "tbl-wrap" },
    h(
      "table",
      { class: "tbl tbl-3 tbl-names" },
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Component"), h("th", { scope: "col" }, "AWS example"), h("th", { scope: "col" }, "Other examples"))),
      h(
        "tbody",
        null,
        STACK.map(([job, aws, other]) => h("tr", null, h("th", { scope: "row" }, job), h("td", { class: "v", "data-l": "AWS example" }, aws), h("td", { class: "how", "data-l": "Others" }, other))),
      ),
    ),
  );
}

export function kitView(root) {
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
          h("button", { class: "chip", type: "button", "aria-pressed": String(!coreOnly), onclick: () => ((coreOnly = false), paintParts()) }, `All ${total} components`),
          h("button", { class: "chip", type: "button", "aria-pressed": String(coreOnly), onclick: () => ((coreOnly = true), paintParts()) }, `The ${core} core components`),
        ),
        h("p", { class: "muted" }, "If time is short, learn the core components. They cover every diagram on this site. The name in brackets is an AWS example."),
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
        h("h1", { class: "display" }, "The toolkit"),
        h("p", { class: "hero-sub" }, "Draw components, not products. This page gives each component a plain name, its job, and when to pick it. A product name is only an example: one from AWS in brackets, and others beside it."),
      ),
      h("div", { class: "next" }, h("span", { class: "next-where" }, "Say this before you draw"), h("p", { class: "next-title", style: "font: 400 21px/1.4 var(--serif)" }, LINE)),
    ),
    jump([
      ["pictures", "Four pictures"],
      ["parts", "Components by layer"],
      ["map", "Name map"],
      ["rules", "Rules of thumb"],
    ]),
    sec(
      "pictures",
      "Start here",
      "Four reference pictures",
      h("p", { class: "body" }, "Most answers are one of these four, or two of them joined. Each has nine boxes or fewer. Replay each in draw order, then practice it from memory in the drills."),
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
              { class: "les-row", href: "#/kit/d/" + r.id },
              h("span", { class: "les-n" }, i + 1),
              h("span", null, h("span", { class: "les-title" }, r.title), h("span", { class: "les-meta" }, r.use)),
              h("span", { class: "les-end" }, rec ? `Drawn ${rec.n} time${rec.n === 1 ? "" : "s"}` : "Not drawn yet"),
            ),
          );
        }),
      ),
    ),
    sec("parts", "Vocabulary", "The components, by layer", parts),
    sec(
      "map",
      "When they say \"we don't use that\"",
      "One component, many product names",
      h("p", { class: "body" }, "The component stays the same on every stack. Only the product name changes. If a panelist names their tool, repeat it once and keep using their word."),
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
          "Name the component first, and a product only as an example. A box that says \"event stream\" survives any stack.",
          "Nine boxes or fewer. If a box does not change the answer, move it to the bar underneath.",
          "Draw the security bar under everything: roles, keys, audit log, private network, and where the data lives.",
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
  if (!r) return notice(root, "That picture is not here", "It may have been renamed.", "#/kit", "The toolkit");
  const i = REFS.indexOf(r);
  const next = REFS[i + 1];
  const dg = diagram(r.spec, { notes: r.notes });
  clear(root).append(
    h(
      "div",
      { class: "page has-head" },
      pageHead("#/kit", "Toolkit", `Picture ${i + 1} of ${REFS.length}`),
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
          next ? h("a", { class: "btn", href: "#/kit/d/" + next.id }, "Next picture", icon("next")) : h("a", { class: "btn", href: "#/kit" }, "Back to the toolkit"),
        ),
      ),
    ),
  );
  return () => {};
}
