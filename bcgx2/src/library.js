// Everything in one list, grouped by module, for practice outside the plan.
import { ninetyBar } from "./bar.js";
import { B, X, moduleProgress, setMinutes, unlocked } from "./content.js";
import { add, clear, clock, h, icon, plural } from "./dom.js";
import { S } from "./store.js";

function row({ href, state, title, meta, detail, locked }) {
  const mark = locked ? icon("lock", "Locked") : state === "done" ? icon("check", "Done") : state === "doing" ? icon("half", "In progress") : icon("ring", "Not started");
  const inner = [h("span", { class: "it-mark" }, mark), h("span", { class: "it-main" }, h("span", { class: "it-title" }, title), h("span", { class: "it-meta" }, meta)), h("span", { class: "it-end" }, detail)];
  return h("li", { class: `it is-${locked ? "locked" : state}` }, locked ? h("span", { class: "it-row" }, inner) : h("a", { class: "it-row", href }, inner));
}

export function libraryView(root) {
  const st = S();
  const prog = moduleProgress();
  const page = h("div", { class: "library" }, h("h1", { class: "display" }, "Library"), h("p", { class: "hero-sub" }, "Every task and question set, grouped the way the test is. Use it to repeat anything outside the plan. The theory behind the quiz questions is in the ", h("a", { href: "#/learn" }, "refresher"), ", and the lines the coding tasks lean on are in ", h("a", { href: "#/learn/recall" }, "code recall"), "."), ninetyBar({ progress: prog }));

  for (const m of B().modules) {
    const list = h("ul", { class: "items" });
    if (m.kind === "quiz") {
      for (const s of B().sets.filter((x) => x.module === m.id)) {
        const rec = st.sets[s.id];
        const last = rec?.runs?.at(-1);
        list.append(row({ href: `#/set/${s.id}`, state: last ? "done" : rec?.cur ? "doing" : "todo", title: s.title, meta: `${plural(s.questions.length, "question")}, about ${setMinutes(s)} min`, detail: last ? `${last.correct} of ${last.total} right` : "" }));
      }
    } else {
      for (const e of B().exercises.filter((x) => x.module === m.id)) {
        const t = st.tasks[e.id];
        const open = unlocked(e);
        list.append(
          row({
            href: `#/task/${e.id}`,
            locked: !open,
            state: t?.passed ? "done" : t?.started ? "doing" : "todo",
            title: open ? e.title : `A task from ${X.mock[e.mock].title}`,
            meta: open ? `${e.story}, ${e.minutes} min` : "It opens for practice after you take the test",
            detail: t?.passed ? `Best ${clock(t.best)}` : t?.started ? `${clock(t.seconds)} so far` : "",
          }),
        );
      }
    }
    add(page, h("section", { class: "lib-mod" }, h("h2", { class: "h-sec" }, h("span", { class: "nb-n" }, m.id), m.name), h("p", { class: "muted sec-note" }, `${m.blurb} About ${m.minutes} of the 90 minutes.`), list));
  }

  const mocks = h("ul", { class: "items" });
  for (const m of B().mocks) {
    const rec = st.mocks[m.id];
    mocks.append(row({ href: `#/mock/${m.id}`, state: rec?.status === "done" ? "done" : rec?.status === "running" ? "doing" : "todo", title: m.title, meta: `${m.story}, ${m.questions.length} questions, ${m.minutes} min`, detail: rec?.status === "done" ? `${rec.report.points} of 100 points` : rec?.status === "running" ? `${clock(rec.remaining)} left` : "" }));
  }
  add(page, h("section", { class: "lib-mod" }, h("h2", { class: "h-sec" }, "Mock tests"), h("p", { class: "muted sec-note" }, "Full 90-minute runs with new data. Their questions stay hidden until you have taken the test."), mocks));
  clear(root).append(page);
  return () => {};
}
