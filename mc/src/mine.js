// A case of your own: the method, and a workbook for each case from your record.
// What you type into a workbook is kept in this browser with the rest of your progress.
import { ALWAYS, ASKS, BEATS, LADDER, LENGTHS, MINE, mineById, RULES, TESTS } from "./content/mine.js";
import { diagram, nodeList } from "./diagram.js";
import { add, clear, clock, h, icon, toast } from "./dom.js";
import { pick, runDeck } from "./drills.js";
import { notice, pageHead } from "./shell.js";
import { logDay, mark, mineRec, S, save } from "./store.js";
import { bullets, gaps, jump, say, sec, timer } from "./ui.js";

const beatKeys = BEATS.map((b) => "beat-" + b.id);
const notesDone = (id) => beatKeys.filter((k) => S().mine[id]?.notes?.[k]).length;
const runsOf = (id, secs) => (S().mine[id]?.runs || []).filter((r) => r.len === secs);

// A box for your own words. It grows as you type, and saves as you go.
function noteBox(rec, key, label, placeholder) {
  const box = h("textarea", { class: "note-in", rows: 3, placeholder, value: rec.notes[key] || "" });
  const grow = () => {
    box.style.height = "auto";
    box.style.height = Math.max(84, box.scrollHeight + 2) + "px";
  };
  box.addEventListener("input", () => {
    if (box.value.trim()) rec.notes[key] = box.value;
    else delete rec.notes[key];
    save();
    grow();
  });
  requestAnimationFrame(grow);
  return h("label", { class: "note-field" }, h("span", { class: "note-label" }, label), box);
}

function beatBar() {
  const track = h("div", { class: "nb-track", "aria-hidden": "true" });
  BEATS.forEach((b, i) => track.append(h("div", { class: "nb-seg" + (b.id === "design" ? " is-mark" : "") + (i === BEATS.length - 1 ? " nb-end" : ""), vars: { "--w": b.secs } }, i + 1)));
  return h("div", { class: "nb arc" }, track);
}

// ---- the method ------------------------------------------------------------------------------------
export function mineView(root) {
  const page = h("div", { class: "page learn" });
  clear(root).append(page);
  const cards = h("div", { class: "cards" });

  function paintCards() {
    clear(cards);
    add(
      cards,
      MINE.map((m) => {
        const lead = S().lead === m.id;
        const n = notesDone(m.id);
        const runs = (S().mine[m.id]?.runs || []).length;
        return h(
          "div",
          { class: "card" + (lead ? " is-pick" : "") },
          h("p", { class: "card-title" }, m.title, lead ? [" ", h("span", { class: "tag tag-on" }, "Your lead")] : null),
          h("p", { class: "card-text muted" }, m.when + ". " + m.role),
          h("dl", { class: "kv" }, h("dt", null, "Why it fits"), h("dd", null, m.fit), h("dt", null, "Where it is weak"), h("dd", null, m.weak), h("dt", null, "Lead with it when"), h("dd", null, m.leadWhen)),
          h("p", { class: "kc-num" }, `${n} of ${BEATS.length} beats have your notes. ${runs} timed run${runs === 1 ? "" : "s"}.`),
          h(
            "div",
            { class: "btn-row", style: "margin-top: 6px" },
            h("a", { class: "btn btn-small btn-go", href: "#/mine/" + m.id }, "Open the workbook", icon("next")),
            lead
              ? null
              : h(
                  "button",
                  {
                    class: "btn btn-small",
                    type: "button",
                    onclick: () => {
                      S().lead = m.id;
                      save();
                      paintCards();
                    },
                  },
                  "Make this my lead",
                ),
          ),
        );
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
        h("h1", { class: "display" }, "A case of your own"),
        h("p", { class: "hero-sub" }, "The panel may ask you to present something you built, and walk them through it. You need one case that you can tell in 30 seconds, in three minutes, or in ten, with a picture you can draw from memory."),
      ),
      h("div", { class: "next" }, h("span", { class: "next-where" }, "Open with a choice"), h("p", { class: "next-title", style: "font: 400 20px/1.4 var(--serif)" }, "I can walk you through a machine learning pipeline on bank transaction data, or a recent AI system that I led for a fund. Which is more useful to you?")),
    ),
    jump([
      ["asks", "How it is asked"],
      ["pick", "Pick your lead"],
      ["shape", "Ten minutes"],
      ["rules", "Rules"],
      ["depth", "Three levels down"],
    ]),

    sec(
      "asks",
      "Recognize it",
      "How the ask may come",
      bullets(ASKS.map((a) => "\"" + a + "\"")),
      h("h3", { class: "sub-title" }, "What they score when the case is yours"),
      h("ul", { class: "rows" }, TESTS.map(([name, what]) => h("li", null, h("p", { class: "row-main" }, name), h("p", { class: "row-sub" }, what)))),
    ),

    sec(
      "pick",
      "Three cases from your record",
      "Pick your lead, and keep a second",
      h("p", { class: "body" }, "For this panel, the bank pipeline is the nearest to their work, so make it your lead if you pass the depth test on it. Keep the fund project as the recent case that you led. Use the unit when they ask how you would run a team. Better still, offer the choice and let them pick."),
      h(
        "div",
        { class: "note-box" },
        h("p", { class: "h-note" }, "The depth test"),
        h("p", null, "Take the picture for a case. For each box, can you say what it was, why you chose it, and what broke, from memory? If you can't for more than two boxes, lead with another case. A recent case you know cold beats a relevant case you half remember."),
      ),
      cards,
    ),

    sec(
      "shape",
      "The shape",
      "Ten minutes, in nine beats",
      h("p", { class: "body" }, "The long beat is the design, because the picture is where the principals join in. Reach it by minute four."),
      beatBar(),
      h(
        "ol",
        { class: "arc-rows" },
        BEATS.map((b, i) => h("li", null, h("span", { class: "arc-l" }, i + 1), h("span", { class: "arc-when" }, clock(b.secs)), h("div", null, h("p", { class: "arc-name" }, b.name), h("p", { class: "arc-do" }, b.what)))),
      ),
      h("h3", { class: "sub-title" }, "One case, three lengths"),
      h("ul", { class: "rows" }, LENGTHS.map((l) => h("li", null, h("p", { class: "row-main" }, l.name), h("p", { class: "row-sub" }, l.use)))),
    ),

    sec("rules", "Telling it", "Rules for the room", bullets(RULES)),

    sec(
      "depth",
      "Expect this",
      "Three levels down, on any box",
      h("p", { class: "body" }, "A principal will pick one box in your picture and keep asking. Prepare three levels for every box. When you reach the edge of what you know, say so, and say how you would find out."),
      h("ol", { class: "rows rows-n", style: "margin-top: 12px" }, LADDER.map(([name, what], i) => h("li", null, h("span", { class: "row-n" }, i + 1), h("div", null, h("p", { class: "row-main" }, name), h("p", { class: "row-sub" }, what))))),
      h("h3", { class: "sub-title" }, "Five questions that almost always come"),
      bullets(ALWAYS),
      h("div", { class: "lesson-foot" }, h("div", { class: "btn-row" }, h("a", { class: "btn btn-go", href: "#/mine/" + (S().lead || MINE[0].id) }, "Open your lead case", icon("next")), h("a", { class: "btn", href: "#/drills/draw" }, "Draw your pictures from memory"))),
    ),
  );
  paintCards();
  return () => {};
}

// ---- a workbook ------------------------------------------------------------------------------------
export function mineCaseView(root, id) {
  const m = mineById(id);
  if (!m) return notice(root, "That case is not here", "It may have been renamed.", "#/mine", "Your case");
  const rec = mineRec(id);
  const clocks = [];
  const next = MINE[MINE.indexOf(m) + 1];
  const runsBox = h("ul", { class: "hist" });

  function paintRuns() {
    clear(runsBox);
    add(
      runsBox,
      LENGTHS.map((l) => {
        const runs = runsOf(id, l.secs);
        const last = runs[runs.length - 1];
        return h("li", null, h("span", null, l.name), h("span", { class: "num" }, runs.length ? `${runs.length} run${runs.length === 1 ? "" : "s"}, last ${clock(last.secs)}` : "Not run yet"));
      }),
    );
  }

  // A clock that counts up past its target, and a button to keep the run.
  function rehearse(len) {
    const t = timer(len.secs, { mode: "up", small: true, label: "Say it against the clock", note: `Aim for ${len.name}.` });
    clocks.push(t);
    return h(
      "div",
      { class: "rehearse" },
      t.el,
      h(
        "button",
        {
          class: "btn btn-small",
          type: "button",
          onclick: () => {
            const secs = t.seconds();
            if (secs < 5) return toast("Run the clock first.");
            t.stop();
            rec.runs.push({ ts: Date.now(), len: len.secs, secs });
            logDay();
            t.reset();
            paintRuns();
            toast(secs > len.secs * 1.15 ? `Logged at ${clock(secs)}. Cut something.` : `Logged at ${clock(secs)}.`);
          },
        },
        icon("check"),
        "Log this run",
      ),
    );
  }

  const probeMeta = (p) => {
    const r = S().probe[p.id];
    return !r ? "" : r.last ? "Got it" : "Come back to it";
  };
  const lenses = [...new Set(m.probes.map((p) => p.lens))];
  let n = 0;

  clear(root).append(
    h(
      "div",
      { class: "page has-head" },
      pageHead("#/mine", "Your case", `Case ${m.n} of ${MINE.length}`),
      h("h1", { class: "display lesson-title" }, m.title),
      h("p", { class: "lede" }, m.when + ". " + m.role),
      h(
        "div",
        { class: "note-box" },
        h("p", { class: "h-note" }, "How this workbook was built"),
        h("p", null, "From your CV and what you have told me before. The lines to say use those facts and nothing else. Words marked in yellow are gaps that only you can fill. Type your own detail into the boxes. It stays in this browser, and it is part of your backup."),
      ),
      jump([
        ["record", "The record"],
        ["short", "30 seconds"],
        ["three", "3 minutes"],
        ["ten", "10 minutes"],
        ["picture", "The picture"],
        ["numbers", "Numbers"],
        ["probes", "Probes"],
        ["bridge", "The bridge"],
        ["runs", "Your runs"],
      ]),

      sec("record", "Start from facts", "What your record says", bullets(m.facts), h("h3", { class: "sub-title" }, "Check before the day"), bullets(m.check)),

      sec("short", "One breath", "The 30-second version", h("blockquote", { class: "say" }, h("span", { class: "say-label" }, "Say"), gaps(m.s30)), rehearse(LENGTHS[0])),

      sec(
        "three",
        "When the case is one of several",
        "The three-minute version",
        h("blockquote", { class: "say" }, h("span", { class: "say-label" }, "Say"), m.s180.map((p) => h("p", { class: "say-p" }, gaps(p)))),
        rehearse(LENGTHS[1]),
      ),

      sec(
        "ten",
        "When they say \"present it\"",
        "Ten minutes, beat by beat",
        h("p", { class: "body" }, "Each beat has a line built from your record, the questions only you can answer, and a box for your notes. Fill the boxes first. Then say all nine beats against the clock, with the picture."),
        rehearse(LENGTHS[2]),
        h(
          "ol",
          { class: "beat-list" },
          BEATS.map((b, i) => {
            const mine = m.beats[b.id];
            return h(
              "li",
              { class: "beat" },
              h("p", { class: "beat-head" }, h("span", { class: "row-n" }, i + 1), h("span", { class: "beat-name" }, b.name), h("span", { class: "beat-time num" }, clock(b.secs))),
              h("blockquote", { class: "say say-quiet" }, h("span", { class: "say-label" }, "Say"), gaps(mine.say)),
              h("p", { class: "h-note", style: "margin-top: 10px" }, "Only you know"),
              bullets(mine.ask),
              noteBox(rec, "beat-" + b.id, "Your notes for this beat", "Your own detail, in the words you would say."),
            );
          }),
        ),
      ),

      sec(
        "picture",
        "Draw it",
        m.diagrams.length > 1 ? "The pictures" : "The picture",
        m.diagrams.map((d) => {
          const dg = diagram(d.spec, { notes: d.notes, hint: d.hint });
          return [
            h("h3", { class: "sub-title" }, d.heading),
            h("p", { class: "body" }, d.intro),
            dg.el,
            h("details", { class: "fold" }, h("summary", null, "Every box, in one list"), nodeList(d.spec, d.notes)),
            h("div", { class: "btn-row", style: "margin: 8px 0 18px" }, h("a", { class: "btn btn-small", href: "#/drills/draw/" + d.spec.id }, icon("pen"), "Draw it from memory")),
          ];
        }),
        m.branch ? say(m.branch.title, m.branch.say) : null,
        noteBox(rec, "picture", "Your picture, in words", "The real names of your boxes, in draw order."),
      ),

      sec(
        "numbers",
        "Have them ready",
        "Numbers they may ask for",
        h(
          "div",
          { class: "tbl-wrap" },
          h(
            "table",
            { class: "tbl tbl-3" },
            h("thead", null, h("tr", null, h("th", { scope: "col" }, "Number"), h("th", { scope: "col" }, "What you have"), h("th", { scope: "col" }, "Be ready for"))),
            h("tbody", null, m.numbers.map(([k, v, note]) => h("tr", null, h("th", { scope: "row" }, k), h("td", { class: "v" }, v.startsWith("Yours") ? h("mark", { class: "gap" }, v) : v), h("td", { class: "how" }, note)))),
          ),
        ),
        noteBox(rec, "numbers", "Your numbers", "Each figure, the way you will say it, with how it was measured."),
      ),

      sec(
        "probes",
        "Three levels down",
        "The probes to expect",
        h("p", { class: "body" }, "Each probe says what a strong answer contains. It does not give you the answer, because the answer is yours. Write a few words for each, then drill them against a clock."),
        h("div", { class: "btn-row", style: "margin-top: 14px" }, h("a", { class: "btn btn-go", href: `#/mine/${m.id}/probes` }, icon("play"), "Drill six probes, 60 seconds each")),
        lenses.map((lens) => [
          h("h3", { class: "group-title" }, lens),
          h(
            "ul",
            { class: "qa-list" },
            m.probes
              .filter((p) => p.lens === lens)
              .map((p) =>
                h(
                  "li",
                  null,
                  h(
                    "details",
                    { class: "qa-item" },
                    h("summary", null, h("span", { class: "row-n" }, ++n), h("span", { class: "qa-q" }, p.q), h("span", { class: "qa-meta" }, probeMeta(p))),
                    h("div", { class: "qa-body" }, h("p", { class: "qa-why" }, h("b", null, "A strong answer has: "), p.guide), noteBox(rec, "probe-" + p.id, "Your answer, in a few words", "What you will say.")),
                  ),
                ),
              ),
          ),
        ]),
      ),

      sec(
        "bridge",
        "Close the loop",
        "Link it to their work",
        bullets(m.bridge),
        h("h3", { class: "sub-title" }, "Traps"),
        h("div", { class: "warn-box" }, bullets(m.traps)),
        noteBox(rec, "bridge", "Your bridge, in one sentence", "The part of this case that maps to their work, and the question you will end on."),
      ),

      sec(
        "runs",
        "Rehearsal",
        "Your timed runs",
        h("p", { class: "body" }, "Say each length aloud at least twice before the day. Use the clocks in the sections above, and log each run."),
        runsBox,
        h(
          "div",
          { class: "lesson-foot" },
          h(
            "div",
            { class: "btn-row" },
            h(
              "button",
              {
                class: "btn " + (S().lead === m.id ? "" : "btn-go"),
                type: "button",
                onclick: (e) => {
                  S().lead = m.id;
                  save();
                  e.currentTarget.replaceChildren(icon("check"), "This is your lead");
                  e.currentTarget.classList.remove("btn-go");
                },
              },
              icon("check"),
              S().lead === m.id ? "This is your lead" : "Make this my lead",
            ),
            next ? h("a", { class: "btn", href: "#/mine/" + next.id }, "Next case", icon("next")) : h("a", { class: "btn", href: "#/mine" }, "Back to the method"),
          ),
        ),
      ),
    ),
  );
  paintRuns();
  return () => clocks.forEach((t) => t.destroy());
}

// ---- probes against a clock -----------------------------------------------------------------------
export function mineProbesView(root, id) {
  const m = mineById(id);
  if (!m) return notice(root, "That case is not here", "It may have been renamed.", "#/mine", "Your case");
  const rec = mineRec(id);
  let stop = () => {};
  const run = () => {
    stop();
    stop = runDeck(root, {
      back: ["#/mine/" + id, m.short],
      title: "Probes",
      items: pick(m.probes, "probe", 6).map((p) => ({ ...p, topic: p.lens })),
      seconds: 60,
      answer: (p) => [h("p", { class: "fc-a" }, h("b", null, "A strong answer has: "), p.guide), rec.notes["probe-" + p.id] ? h("p", { class: "fc-note" }, h("b", null, "Your notes: "), rec.notes["probe-" + p.id]) : h("p", { class: "fc-note" }, "You have no notes for this one yet. Add them in the workbook.")],
      onFirst: (p, ok) => mark("probe", p.id, ok),
      again: run,
    });
    window.scrollTo(0, 0);
  };
  run();
  return () => stop();
}
