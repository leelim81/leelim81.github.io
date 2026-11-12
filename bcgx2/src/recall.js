// Code recall: the imports, method names, and arguments the three coding tasks lean on, as fill-in cards.
// A round is 10 cards. A card you miss comes back before the round ends, and a line counts as known once
// two first tries in a row are right. Answers are judged here by comparing text: the build has already
// run every accepted answer in Python.
import { B, X, cardState, recallProgress } from "./content.js";
import { add, clear, h, icon, plural, toast } from "./dom.js";
import { tokenRanges } from "./editor.js";
import { logDay, recallRec, save } from "./store.js";

const ROUND = 10; // cards in a round
const SHOWINGS = 3; // a card appears at most this many times in one round
const MINUTES = 4; // about how long a round takes
const GAP = 12; // a gap is at least this many characters wide, so its size gives little away
const PLAIN = { spellcheck: "false", autocomplete: "off", autocapitalize: "none", autocorrect: "off", enterkeyhint: "done" };
const STATE = { known: ["check", "Known"], once: ["half", "Right once"], missed: ["cross", "Missed last time"], new: ["ring", "Not tried yet"] };

const group = (id) => B().recall.groups.find((g) => g.id === id);
const lower = (s) => s[0].toLowerCase() + s.slice(1);
const series = (items) => (items.length < 3 ? items.join(" and ") : `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`);
const ordinal = (n) => ["first", "second", "third"][n - 1] || `${n}th`;

// The saved rounds name cards by id. Drop any id the deck no longer has.
function record() {
  const rec = recallRec();
  const keep = (ids) => (ids || []).filter((id) => X.card[id]);
  const r = rec.round;
  if (r) {
    r.ids = keep(r.ids);
    r.queue = keep(r.queue);
    if (r.shown && !X.card[r.shown.id]) r.shown = null;
    if (!r.ids.length) rec.round = null;
  }
  if (rec.last) {
    rec.last.ids = keep(rec.last.ids);
    if (!rec.last.ids.length) rec.last = null;
  }
  return rec;
}

// ---- dealing a round -----------------------------------------------------------------------------
// Up to 5 cards you missed, then new cards in the order the deck deals them, then cards that were right
// once, then the rest. Within a kind, the card you saw longest ago comes first.
function deal(groupId) {
  const rec = recallRec();
  const pool = B().recall.cards.filter((c) => !groupId || c.group === groupId);
  const by = { missed: [], new: [], once: [], known: [] };
  for (const c of pool) by[cardState(c)].push(c);
  const seen = (c) => rec.cards[c.id]?.last || 0;
  for (const kind of Object.keys(by)) by[kind].sort((a, b) => seen(a) - seen(b) || a.deal - b.deal);
  const size = Math.min(ROUND, pool.length);
  const cards = [];
  const mix = { missed: 0, new: 0, once: 0, known: 0 };
  const take = (kind, most) => {
    while (most-- > 0 && cards.length < size && by[kind].length) {
      cards.push(by[kind].shift());
      mix[kind]++;
    }
  };
  take("missed", 5);
  take("new", size);
  take("once", size);
  take("missed", size);
  take("known", size);
  return { ids: cards.map((c) => c.id), mix };
}

function begin(groupId) {
  const rec = recallRec();
  const { ids } = deal(groupId);
  rec.round = { n: rec.rounds + 1, group: groupId || null, ids, queue: [...ids], first: {}, tries: {}, back: {}, shown: null, known0: recallProgress().known, started: Date.now() };
  save();
}

// What the next round holds, in words.
function mixText(mix, n) {
  const size = mix.missed + mix.new + mix.once + mix.known;
  if (mix.new === size) return n === 1 ? `The ${size} lines used most` : `${plural(size, "new line")}`;
  if (mix.missed === size) return `${plural(size, "line")} you missed`;
  if (mix.once === size) return `${plural(size, "line")} to confirm`;
  if (mix.known === size) return `${plural(size, "line")} you know, oldest first`;
  return series([mix.missed && `${mix.missed} you missed`, mix.new && `${mix.new} new`, mix.once && `${mix.once} to confirm`, mix.known && `${mix.known} you know`].filter(Boolean));
}

// The page title of a round. The back link beside it already says "Code recall", so that part is for the tab title.
const roundTitle = (r) => [h("span", { class: "vh" }, "Code recall: "), `Round ${r.n}` + (r.group ? `: ${lower(group(r.group).title)}` : "")];

// One line about code recall, for the list of lessons.
export function recallTeaser() {
  const rec = record();
  const prog = recallProgress();
  const n = rec.rounds + 1;
  let title;
  if (rec.round) title = `Round ${rec.round.n} is in progress`;
  else if (prog.known === prog.total) title = "Every line is known";
  else title = `Round ${n}: ${lower(mixText(deal().mix, n))}`;
  return { total: prog.total, title, meta: `${ROUND} cards, about ${MINUTES} minutes`, end: standing(prog), current: !!rec.round };
}

// ---- the code on a card ----------------------------------------------------------------------------
// A card's code as lines of pieces. A piece is [text, syntax class], or a gap: { gap, pre, post }.
// pre and post are the punctuation marks that touch the gap (the dot before it, the bracket after it),
// kept with it so that a narrow screen never wraps between them.
// The syntax colors come from the complete line, so a gap inside a string leaves the quotes colored.
function layout(card) {
  if (card.lines) return card.lines;
  let full = "";
  const owner = []; // for each character: the gap whose answer it belongs to, or -1
  let g = 0;
  for (const p of card.parts) {
    const text = typeof p === "string" ? p : p.a[0];
    const who = typeof p === "string" ? -1 : g++;
    for (let i = 0; i < text.length; i++) owner.push(who);
    full += text;
  }
  const cls = new Array(full.length).fill("");
  for (const [from, to, name] of tokenRanges(full)) cls.fill(name, from, to);
  const lines = [[]];
  let at = 0;
  while (at < full.length) {
    if (full[at] === "\n") {
      lines.push([]);
      at++;
      continue;
    }
    let end = at + 1;
    while (end < full.length && full[end] !== "\n" && owner[end] === owner[at] && (owner[at] >= 0 || cls[end] === cls[at])) end++;
    lines.at(-1).push(owner[at] >= 0 ? { gap: owner[at], pre: null, post: null } : [full.slice(at, end), cls[at]]);
    at = end;
  }
  const mark = /[^\w\s]/; // punctuation
  for (const line of lines) {
    line.forEach((piece, i) => {
      if (Array.isArray(piece)) return;
      const prev = line[i - 1];
      const next = line[i + 1];
      if (Array.isArray(prev) && mark.test(prev[0].at(-1) || "")) {
        piece.pre = [prev[0].at(-1), prev[1]];
        prev[0] = prev[0].slice(0, -1);
      }
      if (Array.isArray(next) && mark.test(next[0][0] || "")) {
        piece.post = [next[0][0], next[1]];
        next[0] = next[0].slice(1);
      }
    });
  }
  return (card.lines = lines.map((line) => line.filter((piece) => !Array.isArray(piece) || piece[0])));
}

// Where a line of code may wrap on a narrow screen: before a dot, and after an opening bracket.
function breakable(text) {
  const out = [];
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const cut = text[i] === "." ? i : text[i] === "(" || text[i] === "[" ? i + 1 : 0;
    if (cut > from) {
      out.push(text.slice(from, cut), document.createElement("wbr"));
      from = cut;
    }
  }
  if (from < text.length) out.push(text.slice(from));
  return out;
}

const SOLID = /tok-(string|number|comment)/; // these stay in one piece when a line wraps

// fill(n) returns what goes in gap n: a text box while you answer, the marked answer afterwards.
function codeBlock(card, fill, extra = "") {
  const el = h("div", { class: "rc-code " + extra });
  for (const line of layout(card)) {
    const row = h("div", { class: "rc-ln" });
    line.forEach((piece, i) => {
      if (!Array.isArray(piece)) {
        const side = (x) => (x ? (x[1] ? h("span", { class: x[1] }, x[0]) : x[0]) : null);
        const filled = fill(piece.gap);
        // the line may wrap before the gap and what is attached to it, but not inside that group
        if (row.childNodes.length && (!piece.pre || piece.pre[0] === ".")) row.append(document.createElement("wbr"));
        if (Array.isArray(filled)) add(row, side(piece.pre), filled, side(piece.post));
        else row.append(h("span", { class: "rc-keep" }, side(piece.pre), filled, side(piece.post)));
        if (piece.post && "([".includes(piece.post[0])) row.append(document.createElement("wbr"));
        return;
      }
      let [text, cls] = piece;
      if (i === 0) {
        // the indent is its own element: a wrapped line continues past it, and a phone draws it at half width
        const indent = text.length - text.trimStart().length;
        row.style.setProperty("--in", indent);
        if (indent) row.append(h("span", { class: "rc-indent" }, text.slice(0, indent)));
        text = text.slice(indent);
        if (!text) return;
      }
      const soft = !SOLID.test(cls);
      if (soft && text[0] === "." && row.childNodes.length) row.append(document.createElement("wbr"));
      const kids = soft ? breakable(text) : [text];
      add(row, cls ? h("span", { class: cls }, kids) : kids);
    });
    el.append(row);
  }
  return el;
}

const gapWidth = (gap) => Math.max(gap.w || GAP, ...gap.a.map((a) => a.length + 1));
// Typed text and code, made comparable: no spaces, one kind of quote, and a plain hyphen.
// A phone keyboard may turn quotes into curly ones and a hyphen into a dash as you type.
const squash = (s) =>
  String(s ?? "")
    .replace(/\s+/g, "")
    .replace(/['\u2018\u2019\u201c\u201d]/g, '"')
    .replace(/[\u2212\u2013\u2014]/g, "-");

// Which accepted answer the typed text is: its position in gap.a, or -1 for none.
// Typing the neighbors again still counts: ".fillna(" for the gap in x.____(0), "left" with its quotes,
// or "sklearn.impute" for the gap in from sklearn.____ import. The answer itself has to be exact.
const NEAR = 30; // how many characters on each side may be typed again
function match(gap, typed) {
  const t = squash(typed);
  if (!t) return -1;
  const fold = (s) => (gap.ci ? s.toLowerCase() : s);
  const pre = squash(gap.before);
  const post = squash(gap.after);
  for (const [i, answer] of gap.a.entries()) {
    for (let b = 0; b <= Math.min(NEAR, pre.length); b++) {
      for (let e = 0; e <= Math.min(NEAR, post.length); e++) {
        if (fold(t) === fold((b ? pre.slice(-b) : "") + squash(answer) + post.slice(0, e))) return i;
      }
    }
  }
  return -1;
}

const onlyCaps = (gap, typed) => gap.a.some((a) => squash(typed) !== squash(a) && squash(typed).toLowerCase() === squash(a).toLowerCase());

// A gap after the check: the answer, marked. If you missed it, what you typed comes first, struck through.
// An empty gap gets a dashed box when the other gaps were filled in, so you can see which one you skipped.
function answerMark(gap, typed, hit, flagEmpty) {
  const mark = h("mark", { class: "rc-ans" }, gap.a[hit >= 0 ? hit : 0]);
  if (hit >= 0) return mark;
  const was = String(typed ?? "").trim();
  if (!was && !flagEmpty) return mark;
  return [
    h("span", { class: "vh" }, was ? " You typed " : " You left this gap empty. "),
    was ? h("del", { class: "rc-was" }, was) : h("span", { class: "rc-was is-empty", "aria-hidden": "true" }),
    h("span", { class: "vh" }, " The answer is "),
    mark,
  ];
}

// How far along the deck is, in a few words.
function standing(prog) {
  if (prog.known) return `${prog.known} of ${prog.total} known`;
  return prog.new < prog.total ? `${prog.total - prog.new} of ${prog.total} tried` : "";
}

const fullLine = (card, extra) => codeBlock(card, (n) => h("mark", { class: "rc-ans" }, card.gaps[n].a[0]), extra);
const groupTag = (card) => h("span", { class: "q-budget" }, h("span", { class: "nb-n" }, card.group), group(card.group).title);

// ---- the page that lists the deck --------------------------------------------------------------
function dots(cards) {
  const n = { known: 0, once: 0, missed: 0, new: 0 };
  const el = h("span", { class: "rc-dots", role: "img" });
  for (const c of cards) {
    const st = cardState(c);
    n[st]++;
    el.append(h("i", { class: "rc-dot is-" + st }));
  }
  el.setAttribute("aria-label", `${n.known} known, ${n.once} right once, ${n.missed} missed last time, ${n.new} not tried yet`);
  return el;
}

function refItem(card) {
  const [name, label] = STATE[cardState(card)];
  return h(
    "li",
    { class: "rc-item" },
    h("span", { class: "rc-item-mark" }, icon(name, label)),
    h("div", { class: "rc-item-main" }, h("p", { class: "rc-item-prompt" }, card.prompt), fullLine(card, "is-quiet"), h("p", { class: "rc-item-note muted" }, card.note)),
  );
}

export function recallView(root) {
  const data = B().recall;

  const go = (groupId) => {
    begin(groupId);
    location.hash = "#/learn/recall/round";
  };

  function nextCard(rec, prog) {
    const r = rec.round;
    if (r) {
      const left = r.queue.length;
      return h(
        "section",
        { class: "next" },
        h("p", { class: "next-where" }, `Round ${r.n} is in progress`),
        h("h2", { class: "next-title" }, left ? `${plural(left, "card")} to go` : "Every card is answered"),
        h("p", { class: "next-meta" }, r.group ? `${group(r.group).title} only. Your answers so far are saved.` : "Your answers so far are saved."),
        h("a", { class: "btn btn-go", href: "#/learn/recall/round" }, left ? "Continue the round" : "See your results"),
        h(
          "button",
          {
            class: "link-btn rc-drop",
            type: "button",
            onclick: () => {
              rec.round = null;
              save();
              draw();
              root.querySelector(".next .btn-go")?.focus({ preventScroll: true });
            },
          },
          "Drop this round",
        ),
      );
    }
    const n = rec.rounds + 1;
    const allKnown = prog.known === prog.total;
    const last = rec.last;
    return h(
      "section",
      { class: "next" },
      h("p", { class: "next-where" }, allKnown ? "Every line is known" : n === 1 ? "Start here, round 1" : `Next, round ${n}`),
      h("h2", { class: "next-title" }, allKnown ? `All ${prog.total} lines, twice in a row` : mixText(deal().mix, n)),
      h("p", { class: "next-meta" }, allKnown ? "A round now and then keeps them warm until the test." : `${ROUND} cards, about ${MINUTES} minutes.`),
      h("button", { class: "btn btn-go", type: "button", onclick: () => go() }, `Start round ${n}`),
      last
        ? h("p", { class: "next-hint" }, `Round ${last.n}: ${last.ids.filter((id) => last.first[id]).length} of ${last.ids.length} right on the first try. `, h("a", { href: "#/learn/recall/round" }, "See it again"))
        : null,
    );
  }

  function draw() {
    const rec = record();
    const prog = recallProgress();
    const page = h(
      "div",
      { class: "learn recall" },
      h(
        "section",
        { class: "hero" },
        h(
          "div",
          null,
          h("a", { class: "back", href: "#/learn" }, icon("back"), "Refresher"),
          h("h1", { class: "display" }, "Code recall"),
          h("p", { class: "hero-sub" }, `${prog.total} lines that the three coding tasks lean on. Each card shows a line with a gap, and you type the missing import, method, or argument.`),
          h("p", { class: "hero-sub" }, "Autocomplete can finish a name that you have started. It can't tell you which module or which argument, so that part has to come from memory."),
        ),
        nextCard(rec, prog),
      ),
      h(
        "section",
        { class: "rc-deck" },
        h("h2", { class: "h-sec" }, "The deck"),
        h(
          "p",
          { class: "muted sec-note" },
          `${prog.known} of ${prog.total} lines known${prog.once ? `, and ${prog.once} right once` : ""}. Each dot is a card, and only the first try at a card in a round counts. Pages 6 to 8 of `,
          h("a", { href: "cheatsheet.pdf", target: "_blank", rel: "noopener" }, "the cheatsheet"),
          " cover the same three tasks.",
        ),
        h(
          "p",
          { class: "rc-legend" },
          h("span", null, h("i", { class: "rc-dot is-known" }), "Known: two first tries in a row"),
          h("span", null, h("i", { class: "rc-dot is-once" }), "Right once"),
          h("span", null, h("i", { class: "rc-dot is-missed" }), "Missed last time"),
          h("span", null, h("i", { class: "rc-dot is-new" }), "Not tried yet"),
        ),
      ),
    );
    for (const g of data.groups) {
      const cards = data.cards.filter((c) => c.group === g.id);
      const n = recallProgress(g.id);
      const list = h("ol", { class: "rc-list" });
      const ref = h("details", { class: "ref rc-ref" }, h("summary", null, `Read the ${cards.length} lines`), list);
      ref.addEventListener("toggle", () => {
        if (ref.open && !list.childElementCount) for (const c of cards) list.append(refItem(c));
      });
      add(
        page,
        h(
          "section",
          { class: "rc-group" },
          h("h3", { class: "rc-group-title" }, h("span", { class: "nb-n" }, g.id), g.title),
          h("p", { class: "muted rc-group-note" }, g.blurb),
          h(
            "div",
            { class: "rc-row" },
            dots(cards),
            h("span", { class: "rc-count" }, `${n.known} of ${n.total} known`),
            rec.round ? null : h("button", { class: "btn btn-small", type: "button", onclick: () => go(g.id) }, `Drill ${lower(g.title)}`),
          ),
          ref,
        ),
      );
    }
    clear(root).append(page);
  }

  draw();
  return () => {};
}

// ---- a round ---------------------------------------------------------------------------------------
export function roundView(root) {
  const rec = record();
  if (!rec.round && !rec.last) {
    location.replace("#/learn/recall");
    return () => {};
  }
  const title = h("h1", { class: "quiz-title" });
  const steps = h("ol", { class: "quiz-steps" });
  const stage = h("div", { class: "quiz-stage" });
  const live = h("p", { class: "vh", role: "status" });
  const back = () => h("a", { class: "back", href: "#/learn/recall" }, icon("back"), "Code recall");

  function paintSteps(r) {
    const now = r.shown ? r.shown.id : r.queue[0];
    clear(steps);
    r.ids.forEach((id, i) => {
      const first = r.first[id];
      if (first == null) steps.append(h("li", { class: id === now ? "is-now" : "" }, h("span", { class: "vh" }, `Card ${i + 1}`)));
      else steps.append(h("li", { class: (first ? "is-hit" : "is-miss") + (id === now && !r.shown ? " is-back" : "") }, icon(first ? "check" : "cross", `Card ${i + 1}: ${first ? "right" : "missed"} on the first try`)));
    });
  }

  const countLine = (r, card, nth) => h("p", { class: "q-count" }, nth === 1 ? `Card ${r.ids.indexOf(card.id) + 1} of ${r.ids.length}` : `${ordinal(nth).replace(/^./, (c) => c.toUpperCase())} try at a card you missed`, groupTag(card));

  // ---- a card, waiting for an answer ---------------------------------------------------------------
  function ask(r, focus) {
    const card = X.card[r.queue[0]];
    const nth = (r.tries[card.id] || 0) + 1;
    const boxes = [];
    let warned = false;
    const problem = h("p", { class: "q-problem", role: "alert", hidden: true });
    const values = () => boxes.map((box) => box.value);
    const say = (text, box) => {
      problem.textContent = text;
      problem.hidden = false;
      box.focus();
    };
    const code = codeBlock(card, (n) => {
      const box = h("input", { class: "rc-gap", type: "text", "aria-label": card.gaps.length > 1 ? `Gap ${n + 1} of ${card.gaps.length}` : "The missing piece", vars: { "--w": gapWidth(card.gaps[n]) } });
      for (const [k, v] of Object.entries(PLAIN)) box.setAttribute(k, v);
      // Enter in a filled gap moves to the next empty one. With nothing left to fill, it checks.
      box.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || e.isComposing) return;
        const open = boxes.find((x) => !x.value.trim());
        if (box.value.trim() && open) {
          e.preventDefault();
          open.focus();
        }
      });
      box.addEventListener("input", () => {
        problem.hidden = true;
        warned = false;
      });
      boxes.push(box);
      return box;
    });
    const many = boxes.length > 1;
    const form = h(
      "form",
      {
        class: "rc-form",
        onsubmit: (e) => {
          e.preventDefault();
          const open = boxes.filter((box) => !box.value.trim());
          if (open.length === boxes.length) return say(`Type what goes in the ${many ? "gaps" : "gap"}. If nothing comes to mind, use "Show the line".`, boxes[0]);
          // a stray Enter should not cost a first try: ask once before checking with a gap left empty
          if (open.length && !warned) {
            warned = true;
            return say(`${open.length === 1 ? "One gap is" : `${open.length} gaps are`} still empty. Fill ${open.length === 1 ? "it" : "them"} in, or check again to go on without.`, open[0]);
          }
          check(values());
        },
      },
      code,
      problem,
      h(
        "div",
        { class: "q-actions" },
        h("button", { class: "btn btn-go", type: "submit" }, "Check"),
        h("button", { class: "link-btn", type: "button", onclick: () => check(values()) }, "Show the line"),
        h("span", { class: "rc-keys muted" }, many ? "Enter moves to the next gap, then checks." : "Enter checks."),
      ),
    );
    clear(stage);
    add(stage, countLine(r, card, nth), h("h2", { class: "rc-prompt" }, card.prompt), form);
    if (focus) boxes[0].focus({ preventScroll: true });
  }

  function check(values) {
    const r = rec.round;
    if (!r || r.shown || !r.queue.length) return;
    const card = X.card[r.queue[0]];
    const hits = card.gaps.map((gap, i) => match(gap, values[i]));
    const ok = hits.every((x) => x >= 0);
    const n = (r.tries[card.id] = (r.tries[card.id] || 0) + 1);
    let known = false;
    if (n === 1) {
      // only the first try at a card in a round goes on its record
      r.first[card.id] = ok;
      const c = (rec.cards[card.id] ||= { seen: 0, streak: 0, misses: 0, last: 0 });
      c.seen++;
      c.last = Date.now();
      if (ok) c.streak++;
      else {
        c.streak = 0;
        c.misses++;
      }
      known = ok && c.streak === 2;
      logDay({ a: 1, c: ok ? 1 : 0 });
    } else if (ok) r.back[card.id] = n;
    // the queue moves on now, so reloading the page can't count this answer twice
    r.queue.shift();
    const again = !ok && n < SHOWINGS;
    if (again) r.queue.push(card.id);
    r.shown = { id: card.id, values: values.map((v) => String(v).trim().slice(0, 60)), hits, ok, n, again, known, answered: values.some((v) => String(v).trim()), caps: card.gaps.some((gap, i) => hits[i] < 0 && !gap.ci && onlyCaps(gap, values[i])) };
    save();
    show();
    live.textContent = ok ? "Correct." : r.shown.answered ? "Not this time. The line is shown with the answer marked." : "No answer. The line is shown with the answer marked.";
  }

  // ---- the same card, with the answer ---------------------------------------------------------------
  function feedback(r, focus) {
    const s = r.shown;
    const card = X.card[s.id];
    const right = s.hits.filter((x) => x >= 0).length;
    let head;
    if (s.ok) head = h("p", { class: "verdict is-hit" }, icon("check"), s.n === 1 ? "Correct." : `Correct on the ${ordinal(s.n)} try.`);
    else if (!s.answered) head = h("p", { class: "verdict is-miss" }, icon("ring"), "No answer. This is the line.");
    else head = h("p", { class: "verdict is-miss" }, icon("cross"), card.gaps.length > 1 ? `Not this time. ${right} of ${card.gaps.length} gaps right.` : "Not this time.");
    const after = [];
    if (s.caps) after.push("Check the capitals: case matters in Python.");
    if (s.known) after.push("That is two first tries in a row, so this line now counts as known.");
    if (!s.ok) after.push(s.again ? (r.queue.length === 1 ? "This card comes back next." : "This card comes back before the round ends.") : "That was its last showing in this round. It opens the next one.");
    const nextBtn = h("button", { class: "btn btn-go", type: "button", onclick: next }, r.queue.length ? "Next card" : "See your results");
    clear(stage);
    add(
      stage,
      countLine(r, card, s.n),
      h("h2", { class: "rc-prompt" }, card.prompt),
      codeBlock(card, (n) => answerMark(card.gaps[n], s.values[n], s.hits[n], s.answered)),
      h("div", { class: "q-feedback" }, head, h("p", { class: "rc-note" }, card.note), after.map((t) => h("p", { class: "rc-after muted" }, t))),
      h("div", { class: "quiz-next" }, nextBtn),
    );
    if (focus) nextBtn.focus({ preventScroll: true });
  }

  function next() {
    rec.round.shown = null;
    save();
    show();
    window.scrollTo(0, 0);
  }

  function finish() {
    const r = rec.round;
    rec.rounds = Math.max(rec.rounds, r.n);
    const prog = recallProgress();
    rec.last = { n: r.n, group: r.group, ids: r.ids, first: r.first, back: r.back, known0: r.known0, known1: prog.known, once1: prog.once, ended: Date.now() };
    rec.round = null;
    save();
    toast(`Round ${r.n} done`);
    results();
  }

  // ---- the round, card by card --------------------------------------------------------------------
  function results() {
    const L = rec.last;
    // the deck as it stood when this round ended
    const prog = { total: recallProgress().total, known: L.known1, once: L.once1 || 0 };
    const right = L.ids.filter((id) => L.first[id]).length;
    const missed = L.ids.length - right;
    const fixed = L.ids.filter((id) => !L.first[id] && L.back[id]).length;
    const gained = L.known1 - L.known0;
    const lines = [];
    if (!missed) lines.push("A clean round: every line was right on the first try.");
    else if (missed === 1) lines.push(fixed ? "The line you missed came right when it came back." : "One line stayed out of reach this time.");
    else if (fixed === missed) lines.push(`All ${missed} lines you missed came right when they came back.`);
    else if (fixed) lines.push(`${fixed} of the ${missed} lines you missed came right when they came back.`);
    else lines.push(`${missed} lines stayed out of reach this time.`);
    if (missed) lines.push(`Missed lines come back first, so the next round opens with ${missed === 1 ? "it" : "them"}.`);
    const one = prog.once === 1;
    if (prog.known === prog.total) lines.push(`You know all ${prog.total} lines. A round now and then keeps them warm until the test.`);
    else {
      if (prog.known) lines.push(`You know ${prog.known} of ${prog.total} lines` + (gained > 0 ? `, ${gained} more than before this round.` : ".") + (gained < 0 ? ` ${plural(-gained, "line")} you knew slipped this time.` : ""));
      if (prog.once) lines.push(prog.known ? `${plural(prog.once, "more line")} ${one ? "is" : "are"} right once, one first try away from known.` : `${plural(prog.once, "line")} ${one ? "is" : "are"} right once. One more right first try and ${one ? "it counts" : "they count"} as known.`);
    }

    const list = h("ol", { class: "res-list" });
    for (const id of L.ids) {
      const card = X.card[id];
      const ok = !!L.first[id];
      list.append(
        h(
          "li",
          { class: ok ? "is-hit" : "is-miss" },
          h(
            "details",
            null,
            h("summary", null, h("span", { class: "res-mark" }, icon(ok ? "check" : "cross", ok ? "Right on the first try" : "Missed on the first try")), h("span", { class: "res-title" }, card.prompt), h("span", { class: "res-ans muted" }, ok ? "" : L.back[id] ? `right on the ${ordinal(L.back[id])} try` : "")),
            h("div", { class: "res-code" }, fullLine(card, "is-quiet"), h("p", { class: "rc-item-note muted" }, card.note)),
          ),
        ),
      );
    }
    const againLabel = L.group ? `Another ${lower(group(L.group).title)} round` : "Another round";
    clear(root).append(
      h(
        "div",
        { class: "quiz quiz-results" },
        h("header", { class: "quiz-head" }, back(), h("h1", { class: "quiz-title" }, roundTitle(L))),
        h("h2", { class: "display" }, `${right} of ${L.ids.length} right`),
        lines.map((t) => h("p", { class: "res-line" }, t)),
        h("p", { class: "muted rc-rule" }, "The score counts the first try at each card. A line is known when two first tries in a row are right."),
        h(
          "div",
          { class: "res-actions" },
          h(
            "button",
            {
              class: "btn btn-go",
              type: "button",
              onclick: () => {
                begin(L.group);
                mount();
                show();
                window.scrollTo(0, 0);
              },
            },
            againLabel,
          ),
          h("a", { class: "btn", href: "#/learn/recall" }, "Back to code recall"),
        ),
        h("h3", { class: "h-sec" }, "Card by card"),
        h("p", { class: "muted sec-note" }, "Open a row to read the line again."),
        list,
      ),
    );
    // the button that led here is gone, so the keyboard starts again from the top of the page
    root.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  function mount() {
    clear(root).append(h("div", { class: "quiz rc-round" }, h("header", { class: "quiz-head" }, back(), title, steps), stage, live));
  }

  function show(focus = true) {
    const r = rec.round;
    if (!r) return results();
    add(clear(title), roundTitle(r));
    paintSteps(r);
    if (r.shown) feedback(r, focus);
    else if (r.queue.length) ask(r, focus);
    else finish();
  }

  let seconds = 0;
  const iv = setInterval(() => {
    if (document.visibilityState !== "visible" || !rec.round) return;
    if (++seconds % 5 === 0) logDay({ s: 5 });
  }, 1000);

  if (rec.round) mount();
  show();
  return () => clearInterval(iv);
}
