// SQL practice: drills and practice questions that sit outside the plan, because the current test framework is Python only.
import { B, X } from "./content.js";
import { add, clear, clock, h, icon, plural } from "./dom.js";
import { S } from "./store.js";

function row({ href, state, title, meta, detail }) {
  const mark = state === "done" ? icon("check", "Done") : state === "doing" ? icon("half", "In progress") : icon("ring", "Not started");
  const inner = [h("span", { class: "it-mark" }, mark), h("span", { class: "it-main" }, h("span", { class: "it-title" }, title), h("span", { class: "it-meta" }, meta)), h("span", { class: "it-end" }, detail)];
  return h("li", { class: `it is-${state}` }, h("a", { class: "it-row", href }, inner));
}

export function sqlView(root) {
  const st = S();
  const sql = B().sql;
  const page = h("div", { class: "library sql-page" }, h("h1", { class: "display" }, "SQL"), h("div", { class: "prose sql-intro", html: sql.intro }));

  for (const g of sql.groups) {
    const list = h("ul", { class: "items" });
    let done = 0;
    for (const id of g.tasks) {
      const e = X.ex[id];
      const t = st.tasks[id];
      if (t?.passed) done++;
      list.append(
        row({
          href: `#/task/${id}`,
          state: t?.passed ? "done" : t?.started ? "doing" : "todo",
          title: e.title,
          meta: `${plural(e.files.length, "table")}, ${e.minutes} min`,
          detail: t?.passed ? `Best ${clock(t.best)}` : t?.started ? `${clock(t.seconds)} so far` : "",
        }),
      );
    }
    add(page, h("section", { class: "lib-mod" }, h("h2", { class: "h-sec" }, g.title, h("span", { class: "sql-count muted" }, `${done} of ${g.tasks.length} solved`)), h("p", { class: "muted sec-note" }, g.blurb), list));
  }

  add(page, h("section", { class: "lib-mod sql-ref" }, h("h2", { class: "h-sec" }, "Syntax to keep in your head"), h("div", { class: "prose", html: sql.reference })));
  clear(root).append(page);
  return () => {};
}
