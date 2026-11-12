// The refresher: twelve short lessons on the theory behind the two quiz modules.
// A lesson is text, a few checks with the reasoning, one Python snippet to run, and the lines to keep.
import { B, X, courseProgress, lessonState } from "./content.js";
import { add, clear, h, icon, plural, toast } from "./dom.js";
import { createEditor } from "./editor.js";
import { calculator, questionCard } from "./question.js";
import { rt, runCode, stopRuntime } from "./runtime.js";
import { notice } from "./shell.js";
import { S, daysUntil, dropCode, getCode, lessonRec, logDay, save, setCode } from "./store.js";

const MOD = /Mac|iPhone|iPad/.test(navigator.platform || "") ? "Cmd" : "Ctrl";

// Numbered links to lessons, for pages that point into the refresher. Lesson titles have commas, so a list of titles reads badly.
export function lessonPills(lessons) {
  return h(
    "span",
    { class: "les-pills" },
    lessons.map((les) => h("a", { class: "les-pill", href: `#/learn/${les.id}`, title: `Lesson ${les.n}: ${les.title}`, "aria-label": `Lesson ${les.n}: ${les.title}` }, les.n)),
  );
}

const lessonMeta = (les) => `${les.minutes} min, ${plural(les.checks.length, "check")}, 1 snippet`;

function lessonDetail(st) {
  if (st.done) return `${st.right} of ${st.total} right`;
  if (st.answered) return `${st.answered} of ${st.total} checks answered`;
  return st.started ? "Opened" : "";
}

// How many lessons a day finish the refresher with at least one day in hand before the test.
function pacing(left, days) {
  if (!left || days < 0) return "";
  const perDay = days > 1 ? Math.ceil(left / (days - 1)) : 99;
  if (perDay > 4) return `${plural(left, "lesson")} left and the test is close, so start with the lessons behind the questions you miss.`;
  const spare = days - Math.ceil(left / perDay);
  return `${plural(left, "lesson")} left and ${days} days to your test: ${perDay === 1 ? "one" : perDay} a day finishes the refresher with ${plural(spare, "day")} to spare.`;
}

// ---- the list of lessons ---------------------------------------------------------------------
export function learnView(root) {
  const course = B().course;
  const prog = courseProgress();
  const minutes = course.lessons.reduce((n, les) => n + les.minutes, 0);
  const pace = pacing(prog.total - prog.done, daysUntil(S().settings.testDate));

  let card;
  if (prog.next) {
    const les = prog.next;
    const going = lessonState(les).started;
    card = h(
      "section",
      { class: "next" },
      h("p", { class: "next-where" }, `${going ? "Pick up where you stopped" : prog.done ? "Next lesson" : "Start here"}, lesson ${les.n} of ${prog.total}`),
      h("h2", { class: "next-title" }, les.title),
      h("p", { class: "next-meta" }, `About ${les.minutes} minutes: ${plural(les.checks.length, "check")} and a snippet to run.`),
      h("a", { class: "btn btn-go", href: `#/learn/${les.id}` }, going ? "Continue the lesson" : "Start the lesson"),
    );
  } else {
    card = h(
      "section",
      { class: "next" },
      h("p", { class: "next-where" }, "The refresher is done"),
      h("h2", { class: "next-title" }, `All ${prog.total} lessons are checked off`),
      h("p", { class: "next-meta" }, "Reread any lesson below, or put the theory to work in the question sets."),
      h("a", { class: "btn btn-go", href: "#/" }, "Back to the plan"),
    );
  }

  const page = h(
    "div",
    { class: "learn" },
    h(
      "section",
      { class: "hero" },
      h(
        "div",
        null,
        h("h1", { class: "display" }, "Refresher"),
        h("p", { class: "hero-sub" }, `${prog.total} short lessons on the theory behind the quiz questions, about ${Math.round(minutes / 10) * 10} minutes in all. Read a lesson before the question set that tests it. When you miss a question later, its feedback links back to the lesson.`),
        pace ? h("p", { class: "hero-sub" }, pace) : null,
      ),
      card,
    ),
  );

  for (const part of course.parts) {
    const mine = course.lessons.filter((les) => les.part === part.id);
    const list = h("ol", { class: "lessons" });
    for (const les of mine) {
      const st = lessonState(les);
      list.append(
        h(
          "li",
          { class: "les" + (st.done ? " is-done" : "") + (prog.next === les ? " is-current" : "") },
          h(
            "a",
            { class: "les-row", href: `#/learn/${les.id}` },
            h("span", { class: "les-n" }, st.done ? icon("check", `Lesson ${les.n}, done`) : les.n),
            h("span", { class: "les-main" }, h("span", { class: "les-title" }, les.title), h("span", { class: "les-meta" }, lessonMeta(les))),
            h("span", { class: "les-end" }, lessonDetail(st)),
          ),
        ),
      );
    }
    const sets = B().sets.filter((s) => s.module === part.id);
    add(
      page,
      h(
        "section",
        { class: "learn-part" },
        h("h2", { class: "h-sec" }, h("span", { class: "nb-n" }, part.id), part.title),
        h("p", { class: "muted sec-note" }, `${part.blurb} About ${mine.reduce((n, les) => n + les.minutes, 0)} minutes.`),
        list,
        h("p", { class: "muted les-then" }, "Then practice with the question sets:"),
        h("ul", { class: "link-row" }, sets.map((s) => h("li", null, h("a", { href: `#/set/${s.id}` }, s.title)))),
      ),
    );
  }
  clear(root).append(page);
  return () => {};
}

// Lesson text. Its headings sit one level below the page title, and a wide table scrolls sideways inside its own box.
function textBlock(html) {
  const el = h("div", { class: "prose lesson-text", html: html.replaceAll("<h3>", "<h2>").replaceAll("</h3>", "</h2>") });
  for (const table of el.querySelectorAll("table")) {
    const wrap = h("div", { class: "table-scroll" + (table.rows[0]?.cells.length > 3 ? " is-wide" : "") });
    table.replaceWith(wrap);
    wrap.append(table);
  }
  return el;
}

// ---- one lesson --------------------------------------------------------------------------------
export function lessonView(root, id) {
  const les = X.lesson[id];
  if (!les) return notice(root, "That lesson is not here", "The link may be old. The refresher lists every lesson.", "#/learn", "Open the refresher");
  const lessons = B().course.lessons;
  const rec = lessonRec(id);
  if (!rec.opened) {
    rec.opened = Date.now();
    save();
  }
  let alive = true;
  const cards = [];
  const flushers = [];
  const closers = [];
  const steps = h("ol", { class: "quiz-steps" });
  const foot = h("footer", { class: "lesson-foot" });

  // ---- a check: one question, answered in place ------------------------------------------------
  function checkCard(q, i) {
    const el = h("section", { class: "lcheck", "aria-label": `Check ${i + 1} of ${les.checks.length}` });
    const draw = (focus) => {
      const done = rec.answers[q.id];
      const calc = q.type === "numeric" && !done ? calculator() : null;
      const again = h(
        "button",
        {
          class: "link-btn lcheck-again",
          type: "button",
          hidden: !done,
          onclick: () => {
            delete rec.answers[q.id];
            rec.tries++;
            save();
            draw(true);
            paint();
          },
        },
        "Try this check again",
      );
      const card = questionCard({
        q,
        mode: done ? "shown" : "ask",
        value: done?.value,
        seed: String(rec.tries),
        onSubmit: (res) => {
          rec.answers[q.id] = { value: res.value, correct: res.correct };
          const finished = !rec.done && les.checks.every((c) => rec.answers[c.id]);
          if (finished) rec.done = Date.now();
          logDay({ a: 1, c: res.correct ? 1 : 0 });
          if (calc) calc.hidden = true;
          again.hidden = false;
          paint();
          if (finished) toast(courseProgress().next ? `Lesson ${les.n} of ${lessons.length} done` : `All ${lessons.length} lessons done`);
        },
      });
      clear(el);
      add(el, h("p", { class: "lcheck-label" }, `Check ${i + 1} of ${les.checks.length}`), card.el, calc, again);
      if (focus) card.focus();
    };
    draw(false);
    cards.push(el);
    return el;
  }

  // ---- the snippet: real Python, with the output underneath ------------------------------------
  function labCard(lab) {
    const key = "lab:" + les.id;
    let busy = false;
    let timer = 0;
    const out = h("div", { class: "lab-out", role: "log", "aria-label": "Snippet output", tabIndex: 0 }, h("div", { class: "ln ln-note" }, "The output appears here."));
    const status = h("span", { class: "run-status muted", role: "status" });
    const runBtn = h("button", { class: "btn btn-small btn-go", type: "button", title: `Run the snippet (${MOD}+Enter)`, onclick: () => run() }, icon("play"), "Run");
    const stopBtn = h("button", { class: "btn btn-small", type: "button", hidden: true, onclick: () => stopRuntime() }, icon("stop"), "Stop");
    const resetBtn = h("button", { class: "link-btn", type: "button", onclick: () => editor.set(lab.code) }, "Reset the snippet");
    const host = h("div", { class: "lab-editor" });

    const flush = () => {
      clearTimeout(timer);
      if (!alive) return;
      if (editor.value === lab.code) dropCode(key);
      else setCode(key, editor.value);
    };
    const editor = createEditor({
      parent: host,
      doc: getCode(key) ?? lab.code,
      label: "Python snippet, code editor. To leave it with the keyboard, press Escape, then Tab.",
      autocomplete: S().settings.autocomplete,
      onChange: (text) => {
        resetBtn.hidden = text === lab.code;
        clearTimeout(timer);
        timer = setTimeout(flush, 600);
      },
      onRun: () => run(),
      onTest: () => run(),
      onSave: flush,
    });
    resetBtn.hidden = editor.value === lab.code;

    function line(cls, text) {
      const el = h("div", { class: "ln ln-" + cls }, text);
      out.append(el);
      out.scrollTop = out.scrollHeight;
      return el;
    }

    async function run() {
      if (busy || !alive) return;
      flush();
      busy = true;
      runBtn.disabled = true;
      stopBtn.hidden = false;
      clear(out);
      editor.markError(0);
      let began = 0;
      let waiting = rt.state === "ready" ? null : line("note", "Python is still starting. The snippet runs as soon as it is ready.");
      status.textContent = rt.state === "ready" ? "Running" : "Waiting for Python";
      const ticker = setInterval(() => {
        if (began) status.textContent = `Running, ${Math.round((performance.now() - began) / 1000)} s`;
      }, 500);
      try {
        const res = await runCode({
          slot: "lab",
          files: {},
          hidden: {},
          code: editor.value,
          onEvent: (m) => {
            if (!alive) return;
            if (m.type === "out") m.lines.forEach(([cls, text]) => line(cls, text));
            else if (m.type === "waiting") waiting ||= line("note", m.text + ".");
            else if (m.type === "started") {
              waiting?.remove();
              began = performance.now();
              status.textContent = "Running";
            }
          },
        });
        if (!alive) return;
        if (res.error) {
          line("err", res.error.text.trimEnd().replaceAll("solution.py", "snippet.py"));
          const where = res.error.line ? h("button", { class: "link-btn", type: "button", onclick: () => editor.goTo(res.error.line) }, `Go to line ${res.error.line}`) : null;
          add(line("fail", ""), res.error.summary, where ? " " : "", where);
          editor.markError(res.error.line);
        } else {
          line("note", `Finished in ${res.seconds < 10 ? res.seconds.toFixed(1) : Math.round(res.seconds)} s.`);
          if (!rec.ran) {
            rec.ran = Date.now();
            save();
          }
        }
      } catch (err) {
        if (alive) {
          waiting?.remove();
          line(err.stopped ? "note" : "err", err.stopped ? "Stopped. Python restarts in a few seconds." : err.message);
        }
      } finally {
        clearInterval(ticker);
        if (alive) {
          busy = false;
          runBtn.disabled = false;
          stopBtn.hidden = true;
          status.textContent = "";
        }
      }
    }

    flushers.push(flush);
    closers.push(() => editor.destroy());
    return h(
      "section",
      { class: "lab" },
      h("div", { class: "lab-head" }, h("h2", { class: "lab-title" }, "Run it: ", lab.title), resetBtn),
      host,
      h("div", { class: "lab-bar" }, runBtn, stopBtn, status, h("span", { class: "lab-keys muted" }, `${MOD}+Enter runs it. Esc, then Tab, leaves the editor.`)),
      out,
      h("p", { class: "lab-note" }, lab.note),
    );
  }

  // ---- the page ----------------------------------------------------------------------------------
  function paint() {
    const st = lessonState(les);
    const open = les.checks.findIndex((q) => !rec.answers[q.id]);
    clear(steps);
    les.checks.forEach((q, i) => {
      const a = rec.answers[q.id];
      steps.append(
        h("li", { class: a ? (a.correct ? "is-hit" : "is-miss") : i === open ? "is-now" : "" }, a ? icon(a.correct ? "check" : "cross", `Check ${i + 1}: ${a.correct ? "right" : "missed"}`) : h("span", { class: "vh" }, `Check ${i + 1}: not answered`)),
      );
      cards[i].classList.toggle("is-open", i === open);
    });

    let line;
    const missed = st.answered - st.right;
    if (st.done && st.answered < st.total) line = `Lesson done. ${st.total - st.answered === 1 ? "One check is" : `${st.total - st.answered} checks are`} open for another try.`;
    else if (st.done && missed) line = `Lesson done. ${st.right} of ${st.total} checks right. Use "Try this check again" on the ${missed === 1 ? "one" : "ones"} you missed.`;
    else if (st.done) line = `Lesson done. ${st.right} of ${st.total} checks right.`;
    else if (st.answered) line = `${st.answered} of ${st.total} checks answered. Answer the rest to finish the lesson.`;
    else line = `Answer the ${st.total} checks to finish the lesson.`;

    const next = lessons.slice(les.n).find((x) => !lessonState(x).done) || lessons.find((x) => x !== les && !lessonState(x).done);
    const sets = B().sets.filter((s) => s.questions.some((qid) => X.q[qid]?.see === les.id));
    clear(foot);
    add(
      foot,
      h("p", { class: "res-line" }, line),
      h(
        "div",
        { class: "res-actions" },
        next ? h("a", { class: "btn" + (st.done ? " btn-go" : ""), href: `#/learn/${next.id}` }, `Next lesson: ${next.title}`) : h("a", { class: "btn btn-go", href: "#/" }, "Back to the plan"),
        h("a", { class: "btn", href: "#/learn" }, "All lessons"),
      ),
      sets.length ? [h("p", { class: "muted les-then" }, "Question sets that test this lesson:"), h("ul", { class: "link-row" }, sets.map((s) => h("li", null, h("a", { href: `#/set/${s.id}` }, s.title))))] : null,
    );
  }

  const body = h("div", { class: "lesson-body" });
  let n = 0;
  for (const b of les.blocks) {
    if (b.kind === "text") body.append(textBlock(b.html));
    else if (b.kind === "check") body.append(checkCard(b.q, n++));
    else if (b.kind === "lab") body.append(labCard(b));
    else body.append(h("section", { class: "keys" }, h("h2", { class: "keys-title" }, "Keep these lines"), h("ul", null, b.items.map((t) => h("li", null, t)))));
  }
  paint();

  let seconds = 0;
  const iv = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    if (++seconds % 5 === 0) logDay({ s: 5 });
  }, 1000);
  const onHide = () => flushers.forEach((fn) => fn());
  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", onHide);

  clear(root).append(
    h(
      "article",
      { class: "lesson" },
      h("header", { class: "quiz-head" }, h("a", { class: "back", href: "#/learn" }, icon("back"), "Refresher"), h("p", { class: "quiz-title" }, `Lesson ${les.n} of ${lessons.length}`), steps),
      h("h1", { class: "display-2 lesson-title" }, les.title),
      h("p", { class: "lesson-intro" }, les.intro),
      h("p", { class: "muted lesson-meta" }, `About ${les.minutes} minutes: ${plural(les.checks.length, "check")} and a Python snippet to run. Your answers are saved as you go.`),
      body,
      foot,
    ),
  );
  // a table that scrolls sideways has to be reachable from the keyboard
  requestAnimationFrame(() => {
    for (const wrap of root.querySelectorAll(".table-scroll")) {
      if (wrap.scrollWidth <= wrap.clientWidth + 1) continue;
      wrap.tabIndex = 0;
      wrap.setAttribute("role", "region");
      wrap.setAttribute("aria-label", "Table, scrolls sideways");
    }
  });
  return () => {
    clearInterval(iv);
    window.removeEventListener("pagehide", onHide);
    document.removeEventListener("visibilitychange", onHide);
    onHide();
    closers.forEach((fn) => fn());
    alive = false;
  };
}
