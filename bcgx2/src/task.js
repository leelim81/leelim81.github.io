// One coding task in practice mode: the workspace, a clock against the module budget, and the pass moment.
import { ninetyBar } from "./bar.js";
import { X, moduleProgress, nextLink, sessionClosedBy, splitKey, unlocked } from "./content.js";
import { ask, clock, h, icon } from "./dom.js";
import { notice, runtimeChip, themeButton } from "./shell.js";
import { logDay, save, setCode, task } from "./store.js";
import { workspace } from "./workspace.js";

const IDLE_MS = 5 * 60 * 1000;

export function taskView(root, key) {
  const { id, pass } = splitKey(key);
  const ex = X.ex[id];
  if (!ex || pass > 2) return notice(root, "That task is not here", "The link may be old. The library lists every task.", "#/library", "Open the library");
  if (!unlocked(ex)) return notice(root, "This task is part of a mock test", `It opens for practice after you finish ${X.mock[ex.mock].title}, so the test stays unseen.`, `#/mock/${ex.mock}`, `Go to ${X.mock[ex.mock].title}`);

  document.body.classList.add("focus");
  const mod = X.mod[ex.module];
  const rec = task(key);
  if (!rec.started) {
    rec.started = Date.now();
    save();
  }

  const timer = h("span", { class: "ws-timer", role: "timer" });
  const redo = h("button", { class: "btn btn-small", type: "button", onclick: startOver }, icon("redo"), "Redo from a blank file");
  const chip = runtimeChip();
  let lastTouch = Date.now();
  let ticks = 0;

  function paintTimer() {
    redo.hidden = !rec.solved;
    if (rec.solved) {
      timer.replaceChildren(icon("check"), `Solved in ${clock(rec.seconds)}`);
      timer.title = `Your best time on this task is ${clock(rec.best)}.`;
      return;
    }
    const idle = Date.now() - lastTouch > IDLE_MS;
    timer.replaceChildren(icon("clock"), `${clock(rec.seconds)} of ${ex.minutes} min`, idle ? " (paused)" : "");
    timer.classList.toggle("is-over", rec.seconds > ex.minutes * 60);
    timer.title = `Time on this task. On the test, ${mod.name.toLowerCase()} gets about ${ex.minutes} minutes. The clock pauses when you leave the tab.`;
  }

  const ws = workspace({
    ex,
    key,
    mode: "practice",
    progress: rec,
    onProgress: (patch) => {
      Object.assign(rec, patch);
      save();
    },
    onSubmit: (res) => {
      if (rec.solved) {
        save();
        return;
      }
      rec.submits++;
      rec.checks = { passed: res.passed, total: res.total };
      if (res.error || res.passed !== res.total) {
        save();
        return;
      }
      const before = moduleProgress();
      const prevBest = rec.best;
      rec.solved = true;
      rec.passed ||= Date.now();
      rec.best = rec.best ? Math.min(rec.best, rec.seconds) : rec.seconds;
      logDay({ t: 1 });
      paintTimer();
      ws.refreshSide();
      celebrate(before, prevBest);
    },
  });

  async function celebrate(before, prevBest) {
    const after = moduleProgress();
    const bar = ninetyBar({ progress: before, size: "slim" });
    const spare = ex.minutes * 60 - rec.seconds;
    const lines = [
      spare >= 0
        ? `Your time: ${clock(rec.seconds)}. The budget is ${ex.minutes} minutes, so you had ${clock(spare)} in hand.`
        : `Your time: ${clock(rec.seconds)}. The budget is ${ex.minutes} minutes. Speed comes on the second pass, now that you know the steps.`,
      rec.submits === 1 ? "Every hidden check passed on your first submit." : `Solved on submit ${rec.submits}.`,
    ];
    if (prevBest && rec.seconds < prevBest) lines.push(`That is ${clock(prevBest - rec.seconds)} faster than your last run.`);
    if (rec.peeked) lines.push("You read the reference solution on the way. Plan one more pass from a blank file.");
    const closed = sessionClosedBy("code", key);
    if (closed) lines.push(closed);
    const p = after[ex.module];
    const next = nextLink();
    setTimeout(() => bar.update(after), 450);
    const pick = await ask({
      title: `All ${rec.checks.total} checks pass`,
      body: [
        h("ul", { class: "pass-lines" }, lines.map((t) => h("li", null, t))),
        bar,
        h("p", { class: "muted pass-mod" }, `${mod.name}: ${p.done} solved` + (p.done >= p.target ? ", target met." : `, aim for ${p.target}.`)),
      ],
      actions: [
        { label: "Stay here", value: "stay" },
        { label: "Compare with the reference", value: "compare" },
        { label: next.label, value: "next", kind: "btn-go", focus: true },
      ],
      wide: true,
    });
    if (pick === "next") location.hash = next.href;
    else if (pick === "compare") ws.showSolution();
  }

  async function startOver() {
    const yes = await ask({
      title: "Redo from a blank file?",
      body: h("p", null, `Your code is replaced with the starter file and the clock restarts. The task stays solved in your plan, and your best time of ${clock(rec.best)} is kept.`),
      actions: [{ label: "Keep my code", value: false, focus: true }, { label: "Start again", value: true, kind: "btn-go" }],
    });
    if (!yes) return;
    Object.assign(rec, { seconds: 0, submits: 0, hints: 0, peeked: false, solved: false, checks: null, started: Date.now() });
    setCode(key, ex.starter);
    save();
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  root.append(
    h(
      "div",
      { class: "ws-page" },
      h(
        "header",
        { class: "ws-bar" },
        h("a", { class: "back", href: "#/" }, icon("back"), "Plan"),
        h("div", { class: "ws-title" }, h("h1", null, ex.title), h("span", { class: "ws-mod" }, `Module ${mod.id}, ${mod.name}`), pass === 2 ? h("span", { class: "ws-pass" }, "Second pass") : null),
        h("div", { class: "ws-bar-end" }, redo, timer, chip.el, themeButton()),
      ),
      ws.el,
    ),
  );
  paintTimer();

  const touch = () => {
    lastTouch = Date.now();
  };
  window.addEventListener("keydown", touch, true);
  window.addEventListener("pointerdown", touch, true);
  window.addEventListener("pointermove", touch, { capture: true, passive: true });
  const iv = setInterval(() => {
    if (rec.solved) return;
    if (document.visibilityState === "visible" && Date.now() - lastTouch <= IDLE_MS) {
      rec.seconds++;
      if (++ticks % 5 === 0) logDay({ s: 5 });
    }
    paintTimer();
  }, 1000);

  return () => {
    clearInterval(iv);
    window.removeEventListener("keydown", touch, true);
    window.removeEventListener("pointerdown", touch, true);
    window.removeEventListener("pointermove", touch, { capture: true });
    ws.destroy();
    chip.destroy();
    save();
  };
}
