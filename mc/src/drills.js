// The drills: recall cards, drawing from memory, pushbacks, arithmetic aloud, and a timed mock panel.
import { REFS } from "./content/aws.js";
import { CARDS, TOPICS } from "./content/cards.js";
import { CASES } from "./content/cases.js";
import { CURVES, PERSONAL, PHASES, RUBRIC, SUMS, UNSEEN } from "./content/drills.js";
import { diagram } from "./diagram.js";
import { add, clear, clock, h, icon, shuffled, toast } from "./dom.js";
import { notice, pageHead } from "./shell.js";
import { logDay, mark, S, save } from "./store.js";
import { say, timer } from "./ui.js";

// ---- shared data ---------------------------------------------------------------------------------
export const DIAGRAMS = [
  ...CASES.flatMap((c) => c.diagrams.map((d) => ({ id: d.spec.id, title: d.spec.title, from: `Case ${c.n}`, href: "#/case/" + c.id, spec: d.spec, notes: d.notes }))),
  ...REFS.map((r) => ({ id: r.id, title: r.spec.title, from: "AWS kit", href: "#/aws/d/" + r.id, spec: r.spec, notes: r.notes })),
];

const PUSH = [
  ...CASES.flatMap((c) => c.pushbacks.map((p, i) => ({ id: `${c.id}-${i}`, topic: `Case ${c.n}: ${c.title}`, q: p.q, a: p.a }))),
  ...PERSONAL.map((p) => ({ id: "you-" + p.id, topic: "About you", q: p.q, a: p.a })),
];

const mix = (list) => shuffled(list.length, String(Date.now())).map((i) => list[i]);

// Least practiced first: never tried, then missed last time, then the rest, oldest first.
function pick(pool, bucket, n) {
  const rank = (x) => {
    const r = S()[bucket][x.id];
    return !r ? 0 : r.last ? 2 : 1;
  };
  return mix(pool)
    .sort((a, b) => rank(a) - rank(b) || (S()[bucket][a.id]?.ts || 0) - (S()[bucket][b.id]?.ts || 0))
    .slice(0, n);
}

const tally = (pool, bucket) => pool.filter((x) => S()[bucket][x.id]?.last).length;

// ---- a deck: one prompt at a time, answer aloud, reveal, mark yourself -----------------------------
// cfg: { back: [href, label], title, items: [{ id, topic, q }], seconds, returnMissed, answer(item), onFirst(item, ok), again() }
function runDeck(root, cfg) {
  const queue = cfg.items.slice();
  const first = new Map();
  const returns = new Map();
  let pos = 0;
  let revealed = false;
  let t = null;
  const page = h("div", { class: "quiz rc-round" });
  clear(root).append(page);

  function steps() {
    const cur = queue[pos];
    return h(
      "ol",
      { class: "quiz-steps", "aria-label": "Progress" },
      cfg.items.map((x) => {
        const done = first.get(x.id);
        const now = cur && cur.id === x.id;
        return h("li", { class: now ? "is-now" : done === true ? "is-hit" : done === false ? "is-miss" : "" }, done === true && !now ? icon("check") : done === false && !now ? icon("cross") : null);
      }),
    );
  }

  function reveal() {
    if (revealed || pos >= queue.length) return;
    t?.stop();
    revealed = true;
    paint();
  }

  function grade(ok) {
    if (!revealed) return;
    const item = queue[pos];
    if (!first.has(item.id)) {
      first.set(item.id, ok);
      cfg.onFirst?.(item, ok);
    }
    if (!ok && cfg.returnMissed && (returns.get(item.id) || 0) < 2) {
      returns.set(item.id, (returns.get(item.id) || 0) + 1);
      queue.push(item);
    }
    pos++;
    revealed = false;
    paint();
    window.scrollTo(0, 0);
  }

  function paint() {
    t?.destroy();
    t = null;
    clear(page);
    if (pos >= queue.length) return results();
    const item = queue[pos];
    const again = first.has(item.id);
    if (!revealed && cfg.seconds) t = timer(cfg.seconds, { small: true, label: "Start the clock", note: `Answer aloud in ${cfg.seconds} seconds.` });
    add(
      page,
      pageHead(cfg.back[0], cfg.back[1], cfg.title, steps()),
      h(
        "div",
        { class: "fc" },
        h("p", { class: "fc-topic" }, item.topic, again ? " · again" : ""),
        h("p", { class: "fc-q" }, item.q),
        revealed ? cfg.answer(item) : null,
      ),
      !revealed && t ? h("div", { style: "margin-top: 16px" }, t.el) : null,
      revealed
        ? h(
            "div",
            { class: "fc-actions" },
            h("button", { class: "btn", type: "button", onclick: () => grade(false) }, icon("cross"), "Missed it"),
            h("button", { class: "btn btn-go", type: "button", onclick: () => grade(true) }, icon("check"), "Got it"),
          )
        : h("div", { class: "fc-actions" }, h("button", { class: "btn btn-go btn-wide", type: "button", onclick: reveal }, icon("eye"), "Show the answer")),
      h("p", { class: "muted rc-after" }, revealed ? "Keys: 1 for missed, 2 for got it." : "Say it aloud before you look. Key: space."),
    );
  }

  function results() {
    const n = cfg.items.length;
    const hits = cfg.items.filter((x) => first.get(x.id)).length;
    const missed = cfg.items.filter((x) => first.get(x.id) === false);
    add(
      page,
      pageHead(cfg.back[0], cfg.back[1], cfg.title),
      h("div", { class: "quiz-results" }, h("h1", { class: "display" }, hits === n ? "A clean round" : "Round done"), h("p", { class: "res-line" }, `You got ${hits} of ${n} on the first try.`), missed.length ? h("p", { class: "res-line muted" }, "The ones you missed come up first next time.") : null),
      h("div", { class: "res-actions" }, h("button", { class: "btn btn-go", type: "button", onclick: cfg.again }, icon("redo"), "Another round"), h("a", { class: "btn", href: cfg.back[0] }, cfg.back[1])),
      missed.length ? [h("h2", { class: "h-sec" }, "Read these once more"), h("ul", { class: "rows" }, missed.map((x) => h("li", null, h("p", { class: "row-main" }, x.q), h("div", { style: "margin-top: 8px" }, cfg.answer(x)))))] : null,
    );
  }

  const onKey = (e) => {
    if (e.target.closest("input, textarea, button, a, summary") && e.key !== "1" && e.key !== "2") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!revealed && (e.key === " " || e.key === "Enter")) {
      e.preventDefault();
      reveal();
    } else if (revealed && e.key === "1") grade(false);
    else if (revealed && e.key === "2") grade(true);
  };
  document.addEventListener("keydown", onKey);
  paint();
  return () => {
    t?.destroy();
    document.removeEventListener("keydown", onKey);
  };
}

const textAnswer = (a, note) => [Array.isArray(a) ? h("ul", { class: "fc-a", style: "list-style: none; padding-left: 0; display: grid; gap: 6px" }, a.map((x) => h("li", null, x))) : h("p", { class: "fc-a" }, a), note ? h("p", { class: "fc-note" }, note) : null];

// ---- the drills page -------------------------------------------------------------------------------
export function cardState(id) {
  const r = S().cards[id];
  if (!r) return "new";
  return r.streak >= 2 ? "known" : r.streak === 1 ? "once" : "missed";
}

export function drillsView(root) {
  const known = CARDS.filter((x) => cardState(x.id) === "known").length;
  const drawn = DIAGRAMS.filter((d) => S().draw[d.id]).length;
  const mocks = S().mocks;
  const best = mocks.reduce((m, x) => Math.max(m, x.total), 0);
  const tile = (href, name, what, stat) => h("a", { class: "drill", href }, h("span", { class: "drill-name" }, name), h("span", { class: "drill-what" }, what), h("span", { class: "drill-stat" }, stat));
  clear(root).append(
    h(
      "div",
      { class: "page learn" },
      h(
        "div",
        { class: "hero" },
        h("div", null, h("h1", { class: "display" }, "Drills"), h("p", { class: "hero-sub" }, "Short, repeatable, and out loud. Reading feels like progress, and recall is what holds under pressure. Ten minutes a day beats one long evening.")),
        h(
          "div",
          { class: "next" },
          h("span", { class: "next-where" }, "A ten-minute warm-up"),
          h("ol", { class: "rules" }, h("li", null, "One recall round."), h("li", null, "One diagram, drawn from memory."), h("li", null, "Three pushbacks, answered standing up.")),
          h("a", { class: "btn btn-go", href: "#/drills/recall" }, "Start with recall", icon("next")),
        ),
      ),
      h(
        "div",
        { class: "drill-grid" },
        tile("#/drills/recall", "Recall cards", "Your frameworks, the figures, and the vocabulary. Rounds of ten. Missed cards come back.", `${known} of ${CARDS.length} known`),
        tile("#/drills/draw", "Draw it", "Nine diagrams. Draw each from memory in five minutes, then compare box by box.", `${drawn} of ${DIAGRAMS.length} drawn`),
        tile("#/drills/pushback", "Pushbacks", "A panelist disagrees. You have 60 seconds: take the point, test it, and land a decision.", `${tally(PUSH, "push")} of ${PUSH.length} handled`),
        tile("#/drills/numbers", "Numbers aloud", "Arithmetic at the board: load, storage, alerts, and people. The method matters more than the figure.", `${tally(SUMS, "sums")} of ${SUMS.length} right`),
        tile("#/drills/mock", "Mock panel", "25 minutes, six phases, and two curveballs. Score yourself against the rubric.", mocks.length ? `${mocks.length} run${mocks.length === 1 ? "" : "s"}, best ${best} of ${RUBRIC.length * 3}` : "Not run yet"),
      ),
    ),
  );
  return () => {};
}

// ---- recall ------------------------------------------------------------------------------------------
let roundTopic = null;

const topicCards = (id) => CARDS.filter((x) => !id || x.topic === id);

export function recallView(root) {
  const dots = (cards) => h("div", { class: "rc-dots", "aria-hidden": "true" }, cards.map((x) => h("span", { class: "rc-dot is-" + cardState(x.id) })));
  const start = (topic) => {
    roundTopic = topic;
    location.hash = "#/drills/recall/round";
  };
  const known = CARDS.filter((x) => cardState(x.id) === "known").length;
  clear(root).append(
    h(
      "div",
      { class: "page has-head" },
      pageHead("#/drills", "Drills", "Recall cards"),
      h("h1", { class: "display lesson-title" }, "What you can say without notes"),
      h("p", { class: "lede" }, `${CARDS.length} cards in seven topics. A card counts as known after you get it on the first try in two rounds running. ${known} known so far.`),
      h("div", { class: "btn-row", style: "margin-top: 18px" }, h("button", { class: "btn btn-go btn-big", type: "button", onclick: () => start(null) }, icon("play"), "Start a mixed round of ten")),
      h(
        "p",
        { class: "rc-legend", style: "margin-top: 22px" },
        h("span", null, h("i", { class: "rc-dot is-known" }), "Known"),
        h("span", null, h("i", { class: "rc-dot is-once" }), "Right once"),
        h("span", null, h("i", { class: "rc-dot is-missed" }), "Missed last time"),
        h("span", null, h("i", { class: "rc-dot" }), "Not seen"),
      ),
      TOPICS.map((t) => {
        const cards = topicCards(t.id);
        const k = cards.filter((x) => cardState(x.id) === "known").length;
        return h(
          "section",
          { class: "rc-group" },
          h("h2", { class: "rc-group-title" }, t.name),
          h("p", { class: "rc-group-note muted" }, t.note),
          h("div", { class: "rc-row" }, dots(cards), h("span", { class: "rc-count" }, `${k} of ${cards.length} known`), h("button", { class: "btn btn-small", type: "button", onclick: () => start(t.id) }, "Practice this topic")),
        );
      }),
    ),
  );
  return () => {};
}

export function roundView(root) {
  const topic = roundTopic;
  const names = Object.fromEntries(TOPICS.map((t) => [t.id, t.name]));
  const rank = { missed: 0, new: 1, once: 2, known: 3 };
  const pool = mix(topicCards(topic)).sort((a, b) => rank[cardState(a.id)] - rank[cardState(b.id)] || (S().cards[a.id]?.last || 0) - (S().cards[b.id]?.last || 0));
  const items = pool.slice(0, 10).map((x) => ({ ...x, topic: names[x.topic] }));
  let stop = () => {};
  const go = () => {
    stop();
    stop = roundView(root);
  };
  S().rounds++;
  save();
  stop = runDeck(root, {
    back: ["#/drills/recall", "Recall cards"],
    title: topic ? names[topic] : "Mixed round",
    items,
    returnMissed: true,
    answer: (x) => textAnswer(x.a, x.note),
    onFirst: (x, ok) => {
      const r = (S().cards[x.id] ||= { seen: 0, streak: 0, misses: 0, last: 0 });
      r.seen++;
      r.streak = ok ? r.streak + 1 : 0;
      if (!ok) r.misses++;
      r.last = Date.now();
      logDay();
    },
    again: go,
  });
  return () => stop();
}

// ---- pushbacks and numbers -----------------------------------------------------------------------------
function deckDrill(root, opts) {
  let stop = () => {};
  function intro() {
    stop();
    stop = () => {};
    const done = tally(opts.pool, opts.bucket);
    clear(root).append(
      h(
        "div",
        { class: "page has-head" },
        pageHead("#/drills", "Drills", opts.title),
        h("h1", { class: "display lesson-title" }, opts.head),
        h("p", { class: "lede" }, opts.lede),
        opts.pattern,
        h("p", { class: "muted", style: "margin-top: 14px" }, `${done} of ${opts.pool.length} ${opts.doneWord} so far.`),
        h("div", { class: "btn-row", style: "margin-top: 16px" }, h("button", { class: "btn btn-go btn-big", type: "button", onclick: run }, icon("play"), `Start a round of ${opts.n}`)),
      ),
    );
  }
  function run() {
    stop();
    stop = runDeck(root, {
      back: ["#/drills", "Drills"],
      title: opts.title,
      items: pick(opts.pool, opts.bucket, opts.n),
      seconds: opts.seconds,
      answer: opts.answer,
      onFirst: (x, ok) => mark(opts.bucket, x.id, ok),
      again: run,
    });
    window.scrollTo(0, 0);
  }
  intro();
  return () => stop();
}

export function pushbackView(root) {
  return deckDrill(root, {
    title: "Pushbacks",
    head: "A panelist disagrees",
    lede: "Some of these people have built what you are describing, and one of them will test you. How you take a challenge tells them what you'd be like as a boss.",
    pattern: h(
      "ol",
      { class: "rows rows-n", style: "margin-top: 18px" },
      [
        ["Take the point", "Say what is right about it, in their words. No \"but\"."],
        ["Test it", "Ask one question, or put one number on it."],
        ["Land a decision", "Keep your call, change it, or say what evidence would decide. Then move on."],
      ].map(([a, b], i) => h("li", null, h("span", { class: "row-n" }, i + 1), h("div", null, h("p", { class: "row-main" }, a), h("p", { class: "row-sub" }, b)))),
    ),
    pool: PUSH,
    bucket: "push",
    doneWord: "handled",
    n: 6,
    seconds: 60,
    answer: (x) => say("One way to answer", x.a),
  });
}

export function numbersView(root) {
  const pool = SUMS.map((x) => ({ ...x, topic: "Do it aloud" }));
  return deckDrill(root, {
    title: "Numbers aloud",
    head: "Arithmetic at the board",
    lede: "Say the inputs, round hard, and show the method. A figure that is roughly right and explained beats an exact one that appears from nowhere.",
    pattern: h(
      "ul",
      { class: "plain", style: "margin-top: 18px" },
      ["A year is about 31.5 million seconds.", "A day is 86,400 seconds. Call it 100,000 when you only need the size.", "1,000 bytes a row, a billion rows: 1 TB.", "State each assumption, and ask them to correct it."].map((t) => h("li", null, t)),
    ),
    pool,
    bucket: "sums",
    doneWord: "right",
    n: 6,
    seconds: 0,
    answer: (x) => [h("p", { class: "fc-a" }, h("mark", null, x.a)), h("p", { class: "fc-note" }, x.how)],
  });
}

// ---- draw it ---------------------------------------------------------------------------------------------
export function drawListView(root) {
  clear(root).append(
    h(
      "div",
      { class: "page has-head" },
      pageHead("#/drills", "Drills", "Draw it"),
      h("h1", { class: "display lesson-title" }, "Nine diagrams, from memory"),
      h("p", { class: "lede" }, "Use paper or a whiteboard. Give yourself five minutes, number the flow, and say each step aloud as you draw. Then compare box by box."),
      h(
        "ol",
        { class: "lessons", style: "margin-top: 22px" },
        DIAGRAMS.map((d, i) => {
          const r = S().draw[d.id];
          return h(
            "li",
            { class: "les" },
            h(
              "a",
              { class: "les-row", href: "#/drills/draw/" + d.id },
              h("span", { class: "les-n" }, r?.last ? icon("check", "Drawn well") : i + 1),
              h("span", null, h("span", { class: "les-title" }, d.title), h("span", { class: "les-meta" }, d.from)),
              h("span", { class: "les-end" }, r ? `${r.hit} of ${r.of} boxes` : "Not drawn yet"),
            ),
          );
        }),
      ),
    ),
  );
  return () => {};
}

export function drawView(root, id) {
  const d = DIAGRAMS.find((x) => x.id === id);
  if (!d) return notice(root, "That diagram is not here", "It may have been renamed.", "#/drills/draw", "All diagrams");
  const next = DIAGRAMS[DIAGRAMS.indexOf(d) + 1];
  const boxes = [...d.spec.layers.flatMap((l) => l.nodes).map((n) => d.spec.nodes[n].t), ...(d.spec.base || []).map((b) => "The bar underneath: " + b.t.split(/[.:]/)[0])];
  const t = timer(300, { label: "Start drawing", note: "Five minutes." });
  const page = h("div", { class: "page has-head" });
  clear(root).append(page);
  let shown = false;

  function paint() {
    clear(page);
    add(page, pageHead("#/drills/draw", "Draw it", d.from), h("h1", { class: "display lesson-title" }, d.title));
    if (!shown) {
      add(
        page,
        h(
          "div",
          { class: "try" },
          h("p", { class: "try-title" }, "Draw it before you look"),
          h("ol", null, h("li", null, "Start where the request or the data starts."), h("li", null, "Number the main flow as you go."), h("li", null, "Say one sentence for each step, aloud."), h("li", null, "Finish with the bar underneath: security, catalog, or evals.")),
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
                  t.stop();
                  shown = true;
                  paint();
                  window.scrollTo(0, 0);
                },
              },
              icon("eye"),
              "Show the diagram",
            ),
          ),
        ),
      );
      return;
    }
    const ticks = boxes.map(() => false);
    const count = h("span", { class: "muted num" });
    const paintCount = () => (count.textContent = `${ticks.filter(Boolean).length} of ${boxes.length} ticked`);
    paintCount();
    const dg = diagram(d.spec, { notes: d.notes });
    add(
      page,
      h("p", { class: "lede" }, "Compare your drawing with this one. The names can differ. The jobs and the order should match."),
      dg.el,
      h("h2", { class: "sub-title" }, "Tick each part you drew"),
      h(
        "ul",
        { class: "check-list" },
        boxes.map((b, i) => h("li", null, h("label", null, h("input", { type: "checkbox", onchange: (e) => ((ticks[i] = e.target.checked), paintCount()) }), h("span", null, b)))),
      ),
      h(
        "div",
        { class: "btn-row", style: "margin-top: 16px; align-items: center" },
        h(
          "button",
          {
            class: "btn btn-go",
            type: "button",
            onclick: () => {
              const hit = ticks.filter(Boolean).length;
              mark("draw", d.id, hit >= Math.ceil(boxes.length * 0.8), { hit, of: boxes.length });
              toast(hit >= Math.ceil(boxes.length * 0.8) ? "Saved. That one is solid." : "Saved. Replay it in draw order, then try again tomorrow.");
            },
          },
          icon("check"),
          "Save this attempt",
        ),
        count,
      ),
      h(
        "div",
        { class: "lesson-foot" },
        h(
          "div",
          { class: "btn-row" },
          h("a", { class: "btn", href: d.href }, "Open the full notes"),
          h(
            "button",
            {
              class: "btn",
              type: "button",
              onclick: () => {
                shown = false;
                t.reset();
                paint();
                window.scrollTo(0, 0);
              },
            },
            icon("redo"),
            "Hide it and draw again",
          ),
          next ? h("a", { class: "btn", href: "#/drills/draw/" + next.id }, "Next diagram", icon("next")) : h("a", { class: "btn", href: "#/drills" }, "Back to the drills"),
        ),
      ),
    );
  }
  paint();
  return () => t.destroy();
}

// ---- mock panel ----------------------------------------------------------------------------------------------
const TOTAL = PHASES.reduce((n, p) => n + p.minutes, 0) * 60;
const PROMPTS = [...UNSEEN.map((u) => ({ id: u.id, title: u.title, prompt: u.prompt, pointers: u.pointers, unseen: true })), ...CASES.map((c) => ({ id: c.id, title: `Case ${c.n}: ${c.title}`, prompt: c.prompt, href: "#/case/" + c.id }))];
const ADVICE = {
  frame: ["Reread the opening and the clarifying questions in the playbook.", "#/playbook"],
  options: ["Reread the options section of two cases, and say the recommendation line aloud.", "#/cases"],
  design: ["Do two draw-it drills, and one round of numbers aloud.", "#/drills/draw"],
  govern: ["Read the primer lesson on residency, and recall the DRIFTS cards.", "#/primer/residency"],
  lead: ["Run a round of pushbacks, standing up.", "#/drills/pushback"],
  close: ["Say the two-minute close of each case against the clock.", "#/cases"],
};

export function mockView(root) {
  let tick = 0;
  let picked = "surprise";
  const stopClock = () => clearInterval(tick);

  function bar(withLegend = true) {
    const track = h("div", { class: "nb-track", "aria-hidden": "true" });
    const segs = PHASES.map((p, i) => {
      const seg = h("div", { class: "nb-seg" + (i === PHASES.length - 1 ? " nb-end" : ""), vars: { "--w": p.minutes } }, h("span", { class: "nb-fill" }), h("span", { class: "nb-num" }, i + 1));
      track.append(seg);
      return seg;
    });
    const needle = h("div", { class: "nb-needle", hidden: true });
    track.append(needle);
    const legend = h("ol", { class: "nb-legend" }, PHASES.map((p, i) => h("li", { class: "nb-key", vars: { "--w": p.minutes } }, h("span", { class: "nb-name" }, p.name), h("span", { class: "nb-min" }, `${p.minutes} min`))));
    const el = h("div", { class: "nb" }, track, withLegend ? legend : null);
    const set = (secs) => {
      let start = 0;
      PHASES.forEach((p, i) => {
        const len = p.minutes * 60;
        const fill = Math.max(0, Math.min(1, (secs - start) / len));
        segs[i].style.setProperty("--fill", fill);
        segs[i].classList.toggle("is-full", fill >= 1);
        start += len;
      });
      needle.hidden = secs <= 0;
      needle.style.setProperty("--at", Math.min(1, secs / TOTAL));
    };
    return { el, set };
  }

  function intro() {
    stopClock();
    document.body.classList.remove("focus");
    const b = bar();
    const chips = h("div", { class: "chips" });
    const paintChips = () => {
      clear(chips);
      add(
        chips,
        h("button", { class: "chip", type: "button", "aria-pressed": String(picked === "surprise"), onclick: () => ((picked = "surprise"), paintChips()) }, "Surprise me"),
        PROMPTS.map((p) => h("button", { class: "chip", type: "button", "aria-pressed": String(picked === p.id), onclick: () => ((picked = p.id), paintChips()) }, p.unseen ? "Unseen: " + p.title : p.title)),
      );
    };
    paintChips();
    const mocks = S().mocks.slice().reverse();
    clear(root).append(
      h(
        "div",
        { class: "page has-head" },
        pageHead("#/drills", "Drills", "Mock panel"),
        h(
          "div",
          { class: "mock-intro" },
          h("h1", { class: "display" }, "25 minutes, as if they were in the room"),
          h("p", { class: "mock-note" }, "The real session is two hours of discussion. This is the core of it at speed: one prompt, six phases, and two curveballs that arrive when you don't expect them."),
          b.el,
          h(
            "ol",
            { class: "rules" },
            h("li", null, "Stand up. Use a whiteboard or paper, and speak aloud for the whole run."),
            h("li", null, "Follow the phase on the screen. When the phase changes, move on."),
            h("li", null, "When a curveball appears, answer it in under a minute with your pushback pattern, then return to your plan."),
            h("li", null, "Don't pause. The panel won't."),
            h("li", null, "Score yourself straight after, while you still remember what you skipped."),
          ),
          h("div", null, h("p", { class: "h-note" }, "Pick a prompt"), chips, h("p", { class: "muted", style: "margin-top: 8px; font-size: 14px" }, "\"Surprise me\" prefers a prompt you haven't run. The unseen prompts have no worked answer, only pointers to check against afterwards.")),
          h("button", { class: "btn btn-go btn-big", type: "button", onclick: run }, icon("play"), "Start the clock"),
          mocks.length ? h("div", { style: "width: 100%" }, h("h2", { class: "h-sec", style: "margin-top: 12px" }, "Your runs"), h("ul", { class: "hist" }, mocks.map((m) => h("li", null, h("span", null, new Date(m.ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), " · ", m.title), h("span", { class: "num" }, `${m.total} of ${RUBRIC.length * 3} · ${clock(m.secs)}`))))) : null,
        ),
      ),
    );
  }

  function choose() {
    if (picked !== "surprise") return PROMPTS.find((p) => p.id === picked);
    const done = new Set(S().mocks.map((m) => m.prompt));
    const fresh = PROMPTS.filter((p) => !done.has(p.id));
    const pool = fresh.filter((p) => p.unseen).length ? fresh.filter((p) => p.unseen) : fresh.length ? fresh : PROMPTS;
    return mix(pool)[0];
  }

  function run() {
    const prompt = choose();
    const curves = mix(CURVES).slice(0, 2);
    const at = [9 * 60, 17 * 60]; // two minutes into Design, and two minutes into Operate and govern
    const started = Date.now();
    const b = bar(false);
    const face = h("span", { class: "clock-face num", role: "timer" });
    const phaseName = h("p", { class: "phase-now" });
    const phaseLeft = h("p", { class: "muted num" });
    const phaseDo = h("p", { class: "phase-do" });
    const curveBox = h("div", { "aria-live": "assertive" });
    const top = h("div", { class: "mk-top" }, h("div", { class: "clock" }, face, h("span", { class: "clock-note" }, `of ${clock(TOTAL)}`)), b.el);
    let shownCurve = -1;
    let lastPhase = -1;
    document.body.classList.add("focus");

    const secs = () => Math.floor((Date.now() - started) / 1000);
    function paint() {
      const s = secs();
      face.textContent = clock(s);
      top.classList.toggle("is-over", s >= TOTAL);
      b.set(s);
      let start = 0;
      let idx = PHASES.length - 1;
      for (let i = 0; i < PHASES.length; i++) {
        if (s < start + PHASES[i].minutes * 60) {
          idx = i;
          break;
        }
        start += PHASES[i].minutes * 60;
      }
      const end = start + PHASES[idx].minutes * 60;
      if (idx !== lastPhase) {
        lastPhase = idx;
        phaseName.textContent = `${idx + 1}. ${PHASES[idx].name}`;
        phaseDo.textContent = PHASES[idx].todo;
      }
      phaseLeft.textContent = s >= TOTAL ? "Time. Close now, in two sentences." : `${clock(end - s)} left in this phase`;
      let due = -1;
      at.forEach((x, i) => {
        if (s >= x) due = i;
      });
      if (due > shownCurve) {
        shownCurve = due;
        clear(curveBox).append(
          h(
            "div",
            { class: "curve" },
            h("p", { class: "curve-label" }, `Curveball ${due + 1} of 2`),
            h("p", { class: "curve-text" }, curves[due]),
            h("button", { class: "btn btn-small", type: "button", style: "margin-top: 10px", onclick: () => clear(curveBox) }, "Answered. Back to my plan"),
          ),
        );
      }
    }

    clear(root).append(
      h(
        "div",
        { class: "page mk" },
        top,
        phaseName,
        phaseLeft,
        phaseDo,
        curveBox,
        say("The panel says", prompt.prompt),
        h(
          "div",
          { class: "btn-row", style: "margin-top: 22px" },
          h("button", { class: "btn btn-go", type: "button", onclick: () => score(prompt, secs(), curves.slice(0, shownCurve + 1)) }, icon("stop"), "Finish and score"),
          h(
            "button",
            {
              class: "btn",
              type: "button",
              onclick: () => {
                stopClock();
                intro();
              },
            },
            "Abandon this run",
          ),
        ),
      ),
    );
    paint();
    tick = setInterval(paint, 500);
    window.scrollTo(0, 0);
  }

  function score(prompt, secsUsed, curves) {
    stopClock();
    document.body.classList.remove("focus");
    const scores = Object.fromEntries(RUBRIC.map((r) => [r.id, null]));
    const total = h("span", { class: "num" });
    const saveBtn = h("button", { class: "btn btn-go btn-big", type: "button", disabled: true }, icon("check"), "Save the score");
    const paintTotal = () => {
      const vals = Object.values(scores);
      total.textContent = `${vals.reduce((n, v) => n + (v || 0), 0)} of ${RUBRIC.length * 3}`;
      saveBtn.disabled = vals.some((v) => v == null);
    };
    saveBtn.addEventListener("click", () => {
      const sum = Object.values(scores).reduce((n, v) => n + v, 0);
      S().mocks.push({ ts: Date.now(), prompt: prompt.id, title: prompt.title, scores: { ...scores }, total: sum, secs: secsUsed });
      logDay(3);
      result(prompt, scores, sum, secsUsed);
    });
    paintTotal();
    clear(root).append(
      h(
        "div",
        { class: "page has-head" },
        pageHead("#/drills", "Drills", "Mock panel"),
        h("h1", { class: "display lesson-title" }, "Score it while it is fresh"),
        h("p", { class: "lede" }, `You used ${clock(secsUsed)} of ${clock(TOTAL)}. Be strict. 0 means you skipped it, 1 means you touched it, 2 means solid, and 3 means a panelist would have nodded.`),
        h(
          "ul",
          { class: "rubric", style: "margin-top: 20px" },
          RUBRIC.map((r) =>
            h(
              "li",
              null,
              h("div", null, h("p", { class: "rubric-name" }, r.name), h("p", { class: "rubric-what" }, r.what)),
              h(
                "div",
                { class: "seg", role: "radiogroup", "aria-label": r.name },
                [0, 1, 2, 3].map((v) => h("label", null, h("input", { type: "radio", name: "rub-" + r.id, onchange: () => ((scores[r.id] = v), paintTotal()) }), h("span", null, v))),
              ),
            ),
          ),
        ),
        curves.length ? [h("h2", { class: "sub-title" }, "The curveballs you faced"), h("ul", { class: "plain" }, curves.map((c) => h("li", null, c))), h("p", { class: "muted", style: "margin-top: 6px" }, "Count them under \"Led like the boss\". Did you take the point, test it, and land a decision?")] : null,
        prompt.pointers ? [h("h2", { class: "sub-title" }, "What a strong answer covered"), h("ul", { class: "check-list" }, prompt.pointers.map((p) => h("li", null, h("label", null, h("input", { type: "checkbox" }), h("span", null, p)))))] : h("p", { class: "body", style: "margin-top: 18px" }, "This prompt has a worked answer. ", h("a", { href: prompt.href }, "Compare your run with it"), " after you score."),
        h("div", { class: "btn-row", style: "margin-top: 24px; align-items: center" }, saveBtn, h("span", { class: "muted" }, "Total: ", total)),
      ),
    );
    window.scrollTo(0, 0);
  }

  function result(prompt, scores, sum, secsUsed) {
    const max = RUBRIC.length * 3;
    const weakest = RUBRIC.slice().sort((a, b) => scores[a.id] - scores[b.id])[0];
    const [tip, href] = ADVICE[weakest.id];
    const line = sum >= 15 ? "That would hold up in the room. Run a different prompt tomorrow." : sum >= 10 ? "A solid base. One more run on the weakest part will lift it." : "Useful. Now you know which part to work on.";
    clear(root).append(
      h(
        "div",
        { class: "page has-head" },
        pageHead("#/drills", "Drills", "Mock panel"),
        h("div", { class: "quiz-results" }, h("h1", { class: "display" }, `${sum} of ${max}`), h("p", { class: "res-line" }, line), h("p", { class: "res-line muted" }, `${prompt.title} · ${clock(secsUsed)}`)),
        h("h2", { class: "h-sec" }, "Work on this next"),
        h("p", { class: "body", style: "margin-top: 8px" }, h("b", null, weakest.name + ". "), tip),
        h("div", { class: "res-actions" }, h("a", { class: "btn btn-go", href }, "Go there", icon("next")), h("button", { class: "btn", type: "button", onclick: intro }, icon("redo"), "Run another"), prompt.href ? h("a", { class: "btn", href: prompt.href }, "Open the worked answer") : null),
        h("ul", { class: "hist", style: "margin-top: 22px" }, RUBRIC.map((r) => h("li", null, h("span", null, r.name), h("span", { class: "num" }, `${scores[r.id]} of 3`)))),
      ),
    );
    window.scrollTo(0, 0);
  }

  intro();
  return () => {
    stopClock();
    document.body.classList.remove("focus");
  };
}
