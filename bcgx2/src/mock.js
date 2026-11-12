// A mock test: 11 questions, one 90-minute clock, nothing marked until the end.
import { moduleAt, ninetyBar } from "./bar.js";
import { B, X, lessonsFor, nextLink, payload } from "./content.js";
import { add, ask, clear, clock, h, icon, plural } from "./dom.js";
import { highlight } from "./editor.js";
import { lessonPills } from "./learn.js";
import { answerText, calculator, judge, questionCard } from "./question.js";
import { runCode, startRuntime } from "./runtime.js";
import { notice, runtimeChip, themeButton } from "./shell.js";
import { S, dropCode, getCode, logDay, recordAnswer, save, saveNow, setCode, task } from "./store.js";
import { workspace } from "./workspace.js";

const draftKey = (mockId, exId) => `mock:${mockId}:${exId}`;
const slotOf = (key) => key.replace(/[^\w-]/g, "_");
const GAP = 90; // a gap this long between clock ticks means the computer slept, so it is not counted

export function mockView(root, id) {
  const mock = X.mock[id];
  if (!mock) return notice(root, "That mock test is not here", "The link may be old.");
  const rec = (S().mocks[id] ||= { status: "new" });
  const total = mock.minutes * 60;
  const items = mock.questions.map((qid) => (X.q[qid] ? { kind: "quiz", id: qid, q: X.q[qid], module: X.q[qid].module } : { kind: "code", id: qid, ex: X.ex[qid], module: X.ex[qid].module }));
  let cleanup = null;
  let here = true; // false once you leave this page: scoring may still finish, but it must not draw

  function show() {
    if (!here) return;
    cleanup?.();
    cleanup = null;
    clear(root);
    document.body.classList.toggle("focus", rec.status === "running");
    if (rec.status === "running") cleanup = running();
    else if (rec.status === "done") report();
    else intro();
    window.scrollTo(0, 0);
  }

  // ---- before -------------------------------------------------------------------------------
  function intro() {
    startRuntime();
    items.forEach((it) => it.kind === "code" && payload(it.id).catch(() => {}));
    const empty = Object.fromEntries(B().modules.map((m) => [m.id, { done: 0, target: m.target, frac: 0 }]));
    const bar = ninetyBar({ progress: empty });
    bar.querySelectorAll(".nb-got").forEach((el) => el.remove());
    root.append(
      h(
        "div",
        { class: "mock-intro" },
        h("a", { class: "back", href: "#/" }, icon("back"), "Plan"),
        h("h1", { class: "display" }, mock.title),
        h("p", { class: "hero-sub" }, `${mock.story}. ${items.length} questions, ${mock.minutes} minutes, one sitting.`),
        bar,
        h(
          "ul",
          { class: "rules" },
          h("li", null, "2 probability questions and 6 machine learning questions come first, then 3 coding tasks on one data set."),
          h("li", null, "Closed book. There are no hints and no solutions, and nothing is marked until you finish."),
          h("li", null, "You can move between questions in any order. Answers and code save as you type."),
          h("li", null, "Hidden checks decide the coding score, as on the real test. Test your output before you move on."),
          h("li", null, "The clock stops if you close this page, so a dropped connection costs nothing. The real test does not stop."),
        ),
        h("p", { class: "muted" }, "A good order: quiz first, capped at 25 minutes. Then collection, processing, and the model. Save a working file before you improve it."),
        h(
          "button",
          {
            class: "btn btn-go btn-big",
            type: "button",
            onclick: () => {
              Object.assign(rec, { status: "running", started: Date.now(), remaining: total, at: 0, answers: {}, time: {}, submitted: {} });
              save();
              show();
            },
          },
          `Start the ${mock.minutes} minutes`,
        ),
      ),
    );
  }

  // ---- during -------------------------------------------------------------------------------
  function running() {
    startRuntime();
    items.forEach((it) => it.kind === "code" && payload(it.id).catch(() => {}));
    let child = null;
    let last = Date.now();
    let ticks = 0;
    let finishing = false;
    const chip = runtimeChip();
    const count = h("span", { class: "mock-clock", role: "timer" });
    const pace = h("span", { class: "mock-pace" });
    const nav = h("ol", { class: "mock-nav" });
    const stage = h("div", { class: "mock-stage" });
    const calc = calculator();
    const bar = ninetyBar({ progress: Object.fromEntries(B().modules.map((m) => [m.id, { done: 0, target: m.target, frac: 0 }])), size: "slim" });

    const answered = (it) => (it.kind === "quiz" ? judge(it.q, rec.answers[it.id]).answered : !!rec.submitted[it.id]);

    function paintNav() {
      clear(nav);
      items.forEach((it, i) => {
        const first = i === 0 || items[i - 1].module !== it.module;
        const state = answered(it) ? "answered" : it.kind === "code" && (getCode(draftKey(id, it.id)) ?? it.ex.starter) !== it.ex.starter ? "started" : "open";
        nav.append(
          h(
            "li",
            { class: first ? "is-first" : "" },
            h(
              "button",
              {
                class: `mock-pill is-${state}`,
                type: "button",
                "aria-current": i === rec.at ? "true" : null,
                title: `${it.kind === "quiz" ? it.q.title : it.ex.title} (${X.mod[it.module].short}): ${state === "answered" ? (it.kind === "quiz" ? "answered" : "submitted") : state === "started" ? "started, not submitted" : "no answer yet"}`,
                onclick: () => open(i),
              },
              i + 1,
            ),
          ),
        );
      });
    }

    function paintClock() {
      const left = Math.ceil(rec.remaining);
      count.textContent = `${clock(left)} left`;
      count.classList.toggle("is-late", left <= 300);
      bar.setNeedle((total - rec.remaining) / total);
      const m = moduleAt(total - rec.remaining);
      pace.textContent = m ? `By the clock, you would be in module ${m.id}: ${m.name.toLowerCase()}.` : "By the clock, this is review time.";
    }

    function open(i) {
      child?.destroy();
      child = null;
      rec.at = i;
      save();
      clear(stage);
      const it = items[i];
      stage.className = "mock-stage is-" + it.kind;
      if (it.kind === "quiz") {
        const card = questionCard({
          q: it.q,
          mode: "mock",
          value: rec.answers[it.id],
          seed: String(rec.started),
          onChange: (v) => {
            rec.answers[it.id] = v;
            save();
            paintNav();
          },
        });
        add(
          stage,
          h(
            "div",
            { class: "quiz-stage" },
            h("p", { class: "q-count" }, `Question ${i + 1} of ${items.length}`, h("span", { class: "q-budget" }, X.mod[it.module].name)),
            h("h2", { class: "q-title" }, it.q.title),
            card.el,
            h(
              "div",
              { class: "quiz-next" },
              i > 0 ? h("button", { class: "btn", type: "button", onclick: () => open(i - 1) }, "Previous") : null,
              i < items.length - 1 ? h("button", { class: "btn btn-go", type: "button", onclick: () => open(i + 1) }, "Next question") : null,
            ),
          ),
          calc,
        );
      } else {
        child = workspace({
          ex: it.ex,
          key: draftKey(id, it.id),
          mode: "mock",
          heading: `${i + 1}. ${it.ex.title}`,
          progress: { hints: 0, peeked: false, solved: false },
          onProgress() {},
          onSubmit: () => {
            rec.submitted[it.id] = Date.now();
            save();
            paintNav();
          },
        });
        stage.append(child.el);
      }
      paintNav();
    }

    async function confirmFinish() {
      const open = items.filter((it) => !answered(it)).length;
      const yes = await ask({
        title: "Finish the test?",
        body: h("p", null, open ? `${plural(open, "question")} ${open === 1 ? "has" : "have"} no answer or no submitted code. ` : "", `You have ${clock(rec.remaining)} left, and you can't change anything after this.`),
        actions: [{ label: "Keep working", value: false, focus: true }, { label: "Finish and see my results", value: true, kind: "btn-go" }],
      });
      if (yes) finish(false);
    }

    async function finish(timeUp) {
      if (finishing) return;
      finishing = true;
      clearInterval(iv);
      child?.destroy();
      child = null;
      document.querySelectorAll("dialog.dlg:not(.dlg-lock)").forEach((d) => {
        d.close();
        d.remove();
      });
      clear(stage);
      stage.className = "mock-stage is-scoring";
      nav.querySelectorAll("button").forEach((b) => (b.disabled = true));
      finishBtn.disabled = true;
      const log = h("ul", { class: "scoring" }, h("li", null, icon("check"), "Quiz answers marked"));
      stage.append(h("div", { class: "notice" }, h("h2", { class: "display-2" }, timeUp ? "Time is up" : "Scoring your test"), h("p", null, "Each coding task now runs in a fresh folder against every check, hidden ones included."), log));
      const rep = { ts: Date.now(), used: Math.round(total - rec.remaining), timeUp, quiz: {}, code: {}, modules: {}, points: 0, outOf: 100 };
      for (const it of items) {
        if (it.kind !== "quiz") continue;
        const res = judge(it.q, rec.answers[it.id]);
        rep.quiz[it.id] = { value: rec.answers[it.id] ?? null, answered: res.answered, correct: res.correct };
      }
      for (const it of items) {
        if (it.kind !== "code") continue;
        const row = h("li", null, icon("ring"), `${it.ex.title}: running your code`);
        log.append(row);
        rep.code[it.id] = await score(it);
        const r = rep.code[it.id];
        row.replaceChildren(icon(r.ok ? "check" : "cross"), `${it.ex.title}: ${r.unscored ? "not scored" : `${r.passed} of ${r.total} checks pass`}`);
      }
      tally(rep);
      Object.assign(rec, { status: "done", report: rep });
      for (const [qid, r] of Object.entries(rep.quiz)) recordAnswer(qid, r.correct);
      credit(rep);
      saveNow();
      show();
    }

    const finishBtn = h("button", { class: "btn btn-small", type: "button", onclick: confirmFinish }, "Finish test");
    root.append(
      h(
        "div",
        { class: "mock-page" },
        h("header", { class: "mock-bar" }, h("div", { class: "mock-bar-row" }, h("strong", { class: "mock-name" }, mock.title), nav, h("div", { class: "ws-bar-end" }, count, finishBtn, chip.el, themeButton())), h("div", { class: "mock-pacing" }, bar, pace)),
        stage,
      ),
    );

    const iv = setInterval(() => {
      const now = Date.now();
      const dt = (now - last) / 1000;
      last = now;
      if (finishing) return;
      if (dt > 0 && dt < GAP) {
        rec.remaining = Math.max(0, rec.remaining - dt);
        const cur = items[rec.at].id;
        rec.time[cur] = (rec.time[cur] || 0) + dt;
      }
      paintClock();
      if (++ticks % 5 === 0) logDay({ s: 5 });
      if (rec.remaining <= 0) finish(true);
    }, 1000);

    paintClock();
    open(Math.min(rec.at || 0, items.length - 1));
    return () => {
      clearInterval(iv);
      child?.destroy();
      chip.destroy();
      save();
    };
  }

  // ---- scoring ------------------------------------------------------------------------------
  async function score(it) {
    const key = draftKey(id, it.id);
    const code = getCode(key) ?? it.ex.starter;
    let out;
    try {
      const data = await payload(it.id);
      const res = await runCode({ slot: slotOf(key), files: data.inputs, hidden: data.hidden, code, grader: it.ex.grader });
      const list = res.result?.items || [];
      out = { passed: list.filter((x) => x.status === "pass").length, total: list.length || it.ex.checks.length, error: res.error?.summary || null, items: list, notes: res.result?.notes || [] };
    } catch (err) {
      out = { passed: 0, total: it.ex.checks.length, error: null, items: [], notes: [], unscored: err.message || "Python did not run" };
    }
    out.ok = !out.error && !out.unscored && out.passed === out.total;
    out.submitted = !!rec.submitted?.[it.id];
    return out;
  }

  // Points weight each module by its share of the test's minutes.
  function tally(rep) {
    let sum = 0;
    let weight = 0;
    for (const m of B().modules) {
      const mine = items.filter((it) => it.module === m.id);
      let got = 0;
      let of = 0;
      for (const it of mine) {
        if (it.kind === "quiz") {
          of += 1;
          got += rep.quiz[it.id].correct ? 1 : 0;
        } else {
          of += rep.code[it.id].total;
          got += rep.code[it.id].passed;
        }
      }
      const frac = of ? got / of : 0;
      rep.modules[m.id] = { got, of, frac, seconds: Math.round(mine.reduce((n, it) => n + (rec.time[it.id] || 0), 0)) };
      sum += frac * m.minutes;
      weight += m.minutes;
    }
    rep.points = Math.round((sum / weight) * 100);
  }

  // A coding task that passes in the mock counts as solved everywhere else too.
  function credit(rep) {
    let solved = 0;
    for (const [exId, r] of Object.entries(rep.code)) {
      if (!r.ok) continue;
      const t = task(exId);
      if (!t.passed) solved++;
      t.started ||= rec.started;
      t.passed ||= Date.now();
      t.solved = true;
      t.seconds = Math.round(rec.time[exId] || 0);
      t.best = t.best ? Math.min(t.best, t.seconds) : t.seconds;
      t.submits ||= 1;
      t.checks = { passed: r.passed, total: r.total };
      if (getCode(exId) == null) setCode(exId, getCode(draftKey(id, exId)) ?? X.ex[exId].starter);
    }
    if (solved) logDay({ t: solved });
  }

  // ---- after --------------------------------------------------------------------------------
  function report() {
    const rep = rec.report;
    const quiz = items.filter((it) => it.kind === "quiz");
    const code = items.filter((it) => it.kind === "code");
    const right = quiz.filter((it) => rep.quiz[it.id].correct).length;
    const clean = code.filter((it) => rep.code[it.id].ok).length;
    const unscored = code.filter((it) => rep.code[it.id].unscored);
    const longest = Math.max(...B().modules.map((m) => Math.max(m.minutes * 60, rep.modules[m.id].seconds)));

    const rows = B().modules.map((m) => {
      const r = rep.modules[m.id];
      const over = r.seconds - m.minutes * 60;
      return h(
        "tr",
        null,
        h("th", { scope: "row" }, h("span", { class: "nb-n" }, m.id), m.name),
        h("td", null, m.kind === "quiz" ? `${r.got} of ${r.of} right` : `${r.got} of ${r.of} checks`),
        h("td", { class: "num" }, `${clock(r.seconds)} of ${m.minutes} min`),
        h("td", { class: "mod-time" }, h("span", { class: "tbar", "aria-hidden": "true" }, h("span", { class: "tbar-budget", vars: { "--w": (m.minutes * 60) / longest } }), h("span", { class: "tbar-used", vars: { "--w": r.seconds / longest } })), over > 60 ? h("span", { class: "muted" }, `${Math.round(over / 60)} min over`) : null),
      );
    });

    const weak = B()
      .modules.filter((m) => rep.modules[m.id].frac < 1)
      .sort((a, b) => rep.modules[a.id].frac - rep.modules[b.id].frac)
      .slice(0, 2);
    const advice = weak.map((m) => {
      if (m.kind === "quiz") {
        const sets = B().sets.filter((s) => s.module === m.id);
        const reread = lessonsFor(quiz.filter((it) => it.q.module === m.id && !rep.quiz[it.id].correct).map((it) => it.id));
        return h(
          "li",
          null,
          `${m.name}: read the reasoning for each miss below`,
          reread.length ? [`, work through refresher ${reread.length === 1 ? "lesson" : "lessons"} `, lessonPills(reread)] : null,
          ", then retake ",
          sets.flatMap((s, i) => [i ? ", " : "", h("a", { href: `#/set/${s.id}` }, s.title)]),
          ".",
        );
      }
      const drills = B().exercises.filter((e) => e.module === m.id && !e.mock).slice(0, 3);
      return h("li", null, `${m.name}: open the failed checks below, then redo `, drills.flatMap((e, i) => [i ? ", " : "", h("a", { href: `#/task/${e.id}` }, e.title)]), " from a blank file. If the syntax held you up, a round of ", h("a", { href: "#/learn/recall" }, "code recall"), " takes 4 minutes.");
    });

    const list = h("ol", { class: "res-list" });
    items.forEach((it) => {
      if (it.kind === "quiz") {
        const r = rep.quiz[it.id];
        list.append(
          h(
            "li",
            { class: r.correct ? "is-hit" : "is-miss" },
            h(
              "details",
              null,
              h("summary", null, h("span", { class: "res-mark" }, icon(r.correct ? "check" : "cross", r.correct ? "Right" : "Missed")), h("span", { class: "res-title" }, it.q.title), h("span", { class: "res-ans muted" }, answerText(it.q, r.value))),
              questionCard({ q: it.q, mode: "shown", value: r.value ?? undefined, seed: String(rec.started) }).el,
            ),
          ),
        );
        return;
      }
      const r = rep.code[it.id];
      const checks = h("ul", { class: "chk-list" });
      r.items.forEach((c) =>
        checks.append(
          h(
            "li",
            { class: "chk is-" + c.status },
            h("span", { class: "chk-mark" }, icon(c.status === "pass" ? "check" : c.status === "fail" ? "cross" : "ring")),
            h("div", { class: "chk-body" }, h("div", { class: "chk-name" }, c.name, c.hidden ? h("span", { class: "muted" }, " (hidden)") : null), c.status !== "pass" && c.msg ? h("div", { class: "chk-msg" }, c.msg) : null, c.status === "fail" && c.hint ? h("div", { class: "chk-hint" }, h("b", null, "Try this: "), c.hint) : null),
          ),
        ),
      );
      list.append(
        h(
          "li",
          { class: r.ok ? "is-hit" : "is-miss" },
          h(
            "details",
            null,
            h("summary", null, h("span", { class: "res-mark" }, icon(r.ok ? "check" : "cross", r.ok ? "Every check passes" : "Some checks fail")), h("span", { class: "res-title" }, it.ex.title), h("span", { class: "res-ans muted" }, r.unscored ? "not scored" : r.error ? "stopped with an error" : `${r.passed} of ${r.total} checks`)),
            h(
              "div",
              { class: "res-code" },
              r.unscored ? h("p", null, `Python did not run this task (${r.unscored}). Use "Score the coding tasks again" above.`) : null,
              r.error ? h("p", null, "Your code stopped with an error, so no check could pass: ", h("code", null, r.error)) : null,
              !r.submitted && !r.unscored ? h("p", { class: "muted" }, "You had not pressed Submit, so this is scored from the code that was in the editor.") : null,
              r.notes.map((n) => h("p", { class: "chk-note" }, n)),
              checks,
              h("p", null, h("a", { href: `#/task/${it.id}` }, "Open this task in practice mode"), " to fix it with hints and all checks visible."),
              h("details", { class: "ref" }, h("summary", null, "Reference solution"), h("pre", { class: "code" }, h("code", { html: highlight(it.ex.solution) }))),
            ),
          ),
        ),
      );
    });

    const next = nextLink();
    root.append(
      h(
        "div",
        { class: "quiz quiz-results mock-report" },
        h("header", { class: "quiz-head" }, h("a", { class: "back", href: "#/" }, icon("back"), "Plan"), h("h1", { class: "quiz-title" }, `${mock.title}: results`)),
        h("h2", { class: "display" }, `${rep.points} of 100 points`),
        h("p", { class: "res-line" }, `Quiz: ${right} of ${quiz.length} right. Coding: ${clean} of ${code.length} tasks pass every check. Time used: ${clock(rep.used)} of ${mock.minutes} minutes.`),
        h("p", { class: "muted" }, "Points weight each module by its share of the 90 minutes. The real test reports a score from 200 to 600 and does not publish its formula, so read this as a trend between your mocks, not a prediction."),
        h(
          "div",
          { class: "res-actions" },
          h("a", { class: "btn btn-go", href: next.href }, next.label),
          unscored.length
            ? h(
                "button",
                {
                  class: "btn",
                  type: "button",
                  onclick: async (e) => {
                    e.target.disabled = true;
                    e.target.textContent = "Scoring";
                    for (const it of unscored) rep.code[it.id] = await score(it);
                    tally(rep);
                    credit(rep);
                    save();
                    show();
                  },
                },
                "Score the coding tasks again",
              )
            : null,
          h(
            "button",
            {
              class: "btn",
              type: "button",
              onclick: async () => {
                const yes = await ask({
                  title: "Take this mock again?",
                  body: h("p", null, "Your answers, code, and results for this mock are cleared. Everything else stays."),
                  actions: [{ label: "Keep my results", value: false, focus: true }, { label: "Clear and restart", value: true, kind: "btn-danger" }],
                });
                if (!yes) return;
                code.forEach((it) => dropCode(draftKey(id, it.id)));
                for (const k of Object.keys(rec)) delete rec[k];
                rec.status = "new";
                save();
                show();
              },
            },
            "Take this mock again",
          ),
        ),
        h("h3", { class: "h-sec" }, "By module"),
        h("table", { class: "mods" }, h("thead", null, h("tr", null, h("th", null, "Module"), h("th", null, "Result"), h("th", null, "Time"), h("th", null, h("span", { class: "vh" }, "Time against budget")))), h("tbody", null, rows)),
        advice.length ? [h("h3", { class: "h-sec" }, "Where the next points are"), h("ul", { class: "advice" }, advice)] : h("p", { class: "res-line" }, "A full score. Keep the routine and rest before the test."),
        h("h3", { class: "h-sec" }, "Question by question"),
        h("p", { class: "muted sec-note" }, "Open a row for the reasoning, the failed checks, and the reference solution."),
        list,
      ),
    );
  }

  show();
  return () => {
    here = false;
    cleanup?.();
  };
}
