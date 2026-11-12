// Question sets and the review list: one question at a time, with the answer and the reasoning right away.
import { X, lessonsFor, missCount, nextLink, reviewDone, sessionClosedBy } from "./content.js";
import { add, clear, clock, h, icon, plural } from "./dom.js";
import { lessonPills } from "./learn.js";
import { answerText, calculator, questionCard } from "./question.js";
import { notice } from "./shell.js";
import { S, logDay, recordAnswer, save } from "./store.js";

// cur: { ids, i, answers: { id: { value, correct } }, seconds, started }. It is saved, so a run can be resumed.
function runQuiz(root, { title, cur, finish }) {
  cur.ids = cur.ids.filter((id) => X.q[id]);
  cur.i = Math.max(0, Math.min(cur.i, cur.ids.length - 1));
  const time = h("span", { class: "quiz-time", role: "timer", title: "Time in this set" });
  const steps = h("ol", { class: "quiz-steps" });
  const stage = h("div", { class: "quiz-stage" });
  const calc = calculator();

  function paintSteps() {
    clear(steps);
    cur.ids.forEach((id, i) => {
      const a = cur.answers[id];
      const cls = a ? (a.correct ? "is-hit" : "is-miss") : i === cur.i ? "is-now" : "";
      steps.append(h("li", { class: cls }, a ? icon(a.correct ? "check" : "cross", `Question ${i + 1}: ${a.correct ? "right" : "missed"}`) : h("span", { class: "vh" }, `Question ${i + 1}`)));
    });
  }

  function show() {
    const id = cur.ids[cur.i];
    const q = X.q[id];
    const done = cur.answers[id];
    const last = cur.i === cur.ids.length - 1;
    const nextBtn = h("button", { class: "btn btn-go", type: "button", onclick: advance }, last ? "See your results" : "Next question");
    const nextRow = h("div", { class: "quiz-next", hidden: !done }, nextBtn);
    const card = questionCard({
      q,
      mode: done ? "shown" : "ask",
      value: done?.value,
      seed: String(cur.started),
      onSubmit: (res) => {
        cur.answers[id] = { value: res.value, correct: res.correct };
        recordAnswer(id, res.correct);
        paintSteps();
        nextRow.hidden = false;
        nextBtn.focus({ preventScroll: true });
      },
    });
    clear(stage);
    add(stage, h("p", { class: "q-count" }, `Question ${cur.i + 1} of ${cur.ids.length}`, h("span", { class: "q-budget" }, `about ${q.minutes} min on the test`)), h("h2", { class: "q-title" }, q.title), card.el, nextRow);
    paintSteps();
    if (!done) card.focus();
  }

  function advance() {
    if (cur.i < cur.ids.length - 1) {
      cur.i++;
      save();
      show();
      window.scrollTo(0, 0);
    } else {
      clearInterval(iv);
      finish();
    }
  }

  const iv = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    cur.seconds++;
    if (cur.seconds % 5 === 0) logDay({ s: 5 });
    time.textContent = clock(cur.seconds);
  }, 1000);
  time.textContent = clock(cur.seconds);
  clear(root).append(h("div", { class: "quiz" }, h("header", { class: "quiz-head" }, h("a", { class: "back", href: "#/" }, icon("back"), "Plan"), h("h1", { class: "quiz-title" }, title), steps, time), stage, calc));
  show();
  return () => clearInterval(iv);
}

function results(root, { title, headline, lines, cur, actions }) {
  const reread = lessonsFor(cur.ids.filter((id) => !cur.answers[id]?.correct));
  const list = h("ol", { class: "res-list" });
  for (const id of cur.ids) {
    const q = X.q[id];
    const a = cur.answers[id];
    list.append(
      h(
        "li",
        { class: a?.correct ? "is-hit" : "is-miss" },
        h(
          "details",
          null,
          h("summary", null, h("span", { class: "res-mark" }, icon(a?.correct ? "check" : "cross", a?.correct ? "Right" : "Missed")), h("span", { class: "res-title" }, q.title), h("span", { class: "res-ans muted" }, answerText(q, a?.value))),
          questionCard({ q, mode: "shown", value: a?.value, seed: String(cur.started) }).el,
        ),
      ),
    );
  }
  clear(root).append(
    h(
      "div",
      { class: "quiz quiz-results" },
      h("header", { class: "quiz-head" }, h("a", { class: "back", href: "#/" }, icon("back"), "Plan"), h("h1", { class: "quiz-title" }, title)),
      h("h2", { class: "display" }, headline),
      lines.map((t) => h("p", { class: "res-line" }, t)),
      reread.length ? h("p", { class: "res-line" }, `Refresher ${reread.length === 1 ? "lesson" : "lessons"} `, lessonPills(reread), ` ${reread.length === 1 ? "covers" : "cover"} what you missed.`) : null,
      h("div", { class: "res-actions" }, actions),
      h("h3", { class: "h-sec" }, "Question by question"),
      h("p", { class: "muted sec-note" }, "Open a row to read the reasoning again."),
      list,
    ),
  );
  window.scrollTo(0, 0);
}

export function setView(root, id) {
  const set = X.set[id];
  if (!set) return notice(root, "That question set is not here", "The link may be old. The library lists every set.", "#/library", "Open the library");
  const rec = (S().sets[id] ||= { runs: [], cur: null, last: null });
  let stop = null;

  function start() {
    rec.cur ||= { ids: [...set.questions], i: 0, answers: {}, seconds: 0, started: Date.now() };
    save();
    stop = runQuiz(root, {
      title: set.title,
      cur: rec.cur,
      finish: () => {
        const c = rec.cur;
        rec.runs.push({ ts: Date.now(), correct: c.ids.filter((q) => c.answers[q]?.correct).length, total: c.ids.length, seconds: c.seconds });
        rec.last = c;
        rec.cur = null;
        save();
        done(true);
      },
    });
  }

  function done(fresh) {
    const c = rec.last;
    const run = rec.runs.at(-1);
    const missed = run.total - run.correct;
    const prev = rec.runs.at(-2);
    const budget = c.ids.reduce((n, q) => n + X.q[q].minutes, 0);
    const lines = [`You took ${clock(run.seconds)}. On the test, these questions get about ${budget} minutes.`];
    if (missed) lines.push(`${plural(missed, "question")} went to your review list. Clearing ${missed === 1 ? "it" : "them"} later is how the score moves.`);
    else lines.push("A clean set. Nothing was added to your review list.");
    if (prev && run.correct > prev.correct) lines.push(`Up from ${prev.correct} of ${prev.total} last time.`);
    const closed = fresh ? sessionClosedBy("set", id) : "";
    if (closed) lines.push(closed);
    const next = nextLink();
    results(root, {
      title: set.title,
      headline: `${run.correct} of ${run.total} right`,
      lines,
      cur: c,
      actions: [
        h("a", { class: "btn btn-go", href: next.href }, next.label),
        missed ? h("a", { class: "btn", href: "#/review" }, "Review the misses now") : null,
        h("button", { class: "btn", type: "button", onclick: () => { stop?.(); start(); } }, "Take this set again"),
      ],
    });
  }

  if (rec.cur || !rec.last) start();
  else done(false);
  return () => stop?.();
}

export function reviewView(root) {
  const st = S();
  let stop = null;

  function start() {
    if (!st.review) {
      const ids = Object.keys(st.misses).filter((id) => X.q[id]).sort((a, b) => st.misses[a] - st.misses[b]);
      if (!ids.length) {
        notice(root, "Nothing to review", "Questions you miss in a set or a mock test land here. Answer one correctly and it leaves the list.");
        return;
      }
      st.review = { ids, i: 0, answers: {}, seconds: 0, started: Date.now() };
      save();
    }
    stop = runQuiz(root, {
      title: "Review your misses",
      cur: st.review,
      finish: () => {
        const c = st.review;
        st.review = null;
        reviewDone();
        const cleared = c.ids.filter((q) => c.answers[q]?.correct).length;
        const left = missCount();
        const next = nextLink();
        results(root, {
          title: "Review your misses",
          headline: `${cleared} of ${c.ids.length} cleared`,
          lines: [left ? `${plural(left, "question")} ${left === 1 ? "stays" : "stay"} on the list. A day's gap before the next try helps it stick.` : "Your review list is empty."],
          cur: c,
          actions: [h("a", { class: "btn btn-go", href: next.href }, next.label), left ? h("button", { class: "btn", type: "button", onclick: () => { stop?.(); start(); } }, "Go again") : null],
        });
      },
    });
  }

  start();
  return () => stop?.();
}
