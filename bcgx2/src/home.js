// The plan page: what is next, how ready each module is, and the eight sessions.
import { ninetyBar } from "./bar.js";
import { B, missCount, nextUp, sessionView, settlePlan } from "./content.js";
import { clear, clock, dateLabel, h, icon, plural } from "./dom.js";
import { S, dayKey, daysUntil, isPracticeDay, save, streak, subscribe } from "./store.js";

function headline(days) {
  if (days > 1) return `${days} days to your test`;
  if (days === 1) return "Your test is tomorrow";
  if (days === 0) return "Your test is today";
  return "Your test date has passed";
}

function pacing(days, left) {
  if (left === 0) return "You have finished the plan. The Library has every task and question set if you want another pass.";
  if (days < 0) return `${plural(left, "session")} of the plan are still open. If the test moved, set the new date in Settings.`;
  if (days === 0) return "Warm up for 15 minutes, then stop. You have done the work.";
  if (left < days) return `${plural(left, "session")} left. One a day gets you there with ${plural(days - left, "day")} to spare.`;
  if (left === days) return `${plural(left, "session")} left. One a day gets you there on time.`;
  return `${plural(left, "session")} left in ${plural(days, "day")}. Two shorter sessions on one day closes the gap.`;
}

function stateMark(state) {
  if (state === "done") return icon("check", "Done");
  if (state === "doing") return icon("half", "In progress");
  return icon("ring", "Not started");
}

function tick(id) {
  const st = S();
  if (st.todos[id]) delete st.todos[id];
  else st.todos[id] = Date.now();
  save();
}

function itemRow(v) {
  const main = [h("span", { class: "it-title" }, v.title), v.tag ? h("span", { class: "it-tag" }, v.tag) : null, v.meta ? h("span", { class: "it-meta" }, v.meta) : null];
  const end = h("span", { class: "it-end" }, v.detail);
  if (v.todo) {
    return h("li", { class: "it is-" + v.state }, h("label", { class: "it-row it-check" }, h("input", { type: "checkbox", checked: v.state === "done", onchange: () => tick(v.todo) }), h("span", { class: "it-main" }, main), end));
  }
  return h("li", { class: "it is-" + v.state }, h("a", { class: "it-row", href: v.href }, h("span", { class: "it-mark" }, stateMark(v.state)), h("span", { class: "it-main" }, main), end));
}

function nextCard(up, sessions) {
  const live = B().mocks.find((m) => S().mocks[m.id]?.status === "running");
  if (live) {
    return h(
      "section",
      { class: "next" },
      h("p", { class: "next-where" }, "In progress"),
      h("h2", { class: "next-title" }, live.title),
      h("p", { class: "next-meta" }, `The clock is stopped at ${clock(S().mocks[live.id].remaining)} left. It starts again when you go back in.`),
      h("a", { class: "btn btn-go", href: `#/mock/${live.id}` }, "Resume the test"),
    );
  }
  if (!up) {
    return h(
      "section",
      { class: "next" },
      h("p", { class: "next-where" }, "The plan is done"),
      h("h2", { class: "next-title" }, "Every session is ticked off"),
      h("p", { class: "next-meta" }, "Redo any task from a blank file, or retake a question set."),
      h("a", { class: "btn btn-go", href: "#/library" }, "Open the library"),
    );
  }
  const v = up.view;
  const where = `Next up, session ${up.index + 1} of ${sessions.length}: ${up.sess.title}`;
  const action = v.todo
    ? h("button", { class: "btn btn-go", type: "button", onclick: () => tick(v.todo) }, "Tick it off")
    : h("a", { class: "btn btn-go", href: v.href }, v.verb);
  return h(
    "section",
    { class: "next" },
    h("p", { class: "next-where" }, where),
    h("h2", { class: "next-title" }, v.title),
    h("p", { class: "next-meta" }, [v.tag, v.meta, v.detail].filter(Boolean).join(". ") || up.sess.goal),
    action,
  );
}

function practiceDays(st) {
  const today = new Date();
  const keys = Object.keys(st.days).filter((k) => isPracticeDay(st.days[k])).sort();
  const [ty, tm, td] = st.settings.testDate.split("-").map(Number);
  let end = new Date(ty, tm - 1, td);
  if (end < today) end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (keys.length) {
    const [y, m, d] = keys[0].split("-").map(Number);
    start = new Date(Math.min(start, new Date(y, m - 1, d)));
  }
  const span = Math.round((end - start) / 86400000) + 1;
  if (span > 16) start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 15);
  const dots = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = dayKey(d);
    const cls = "pd" + (isPracticeDay(st.days[k]) ? " is-on" : "") + (k === dayKey(today) ? " is-today" : "") + (k === st.settings.testDate ? " is-test" : "");
    dots.push(h("li", { class: cls, title: dateLabel(k) + (k === st.settings.testDate ? ", test day" : "") }, h("span", { class: "vh" }, `${dateLabel(k)}: ${isPracticeDay(st.days[k]) ? "practised" : "no practice"}`)));
  }
  return { dots, count: keys.length };
}

function build() {
  const st = S();
  const sessions = B().plan.map(sessionView);
  const up = nextUp();
  const days = daysUntil(st.settings.testDate);
  const left = sessions.filter((s) => !s.complete).length;
  const today = st.days[dayKey()];
  const pd = practiceDays(st);
  const run = streak();
  const misses = missCount();

  const list = h("ol", { class: "sessions" });
  for (const s of sessions) {
    const current = up && up.index === s.index;
    list.append(
      h(
        "li",
        { class: "sess" + (s.complete ? " is-done" : "") + (current ? " is-current" : "") },
        h(
          "details",
          { open: current },
          h(
            "summary",
            { class: "sess-head" },
            h("span", { class: "sess-n" }, s.complete ? icon("check", "Done") : s.index + 1),
            h("span", { class: "sess-main" }, h("span", { class: "sess-title" }, s.sess.title), h("span", { class: "sess-goal" }, s.sess.goal)),
            h("span", { class: "sess-count" }, `${s.done} of ${s.total}`),
            h("span", { class: "sess-min" }, s.minutes >= 60 ? `${Math.floor(s.minutes / 60)} h ${s.minutes % 60 ? (s.minutes % 60) + " min" : ""}` : `${s.minutes} min`),
          ),
          h("ul", { class: "items" }, s.items.map(itemRow)),
        ),
      ),
    );
  }

  const todayText = today && (today.t || today.a || today.s >= 60)
    ? [today.t ? plural(today.t, "task") + " solved" : null, today.a ? `${today.c} of ${plural(today.a, "answer")} right` : null, `${Math.max(1, Math.round(today.s / 60))} min of practice`].filter(Boolean).join(", ") + "."
    : "Nothing yet. One task is enough to count.";

  return h(
    "div",
    { class: "home" },
    h(
      "section",
      { class: "hero" },
      h("div", { class: "hero-when" }, h("h1", { class: "display" }, headline(days)), h("p", { class: "hero-sub" }, dateLabel(st.settings.testDate, { weekday: "long", day: "numeric", month: "long" }) + ". ", pacing(days, left), " ", h("a", { href: "#/settings" }, "Change the date"))),
      nextCard(up, sessions),
    ),
    h("section", { class: "minutes" }, h("h2", { class: "h-sec" }, "The test, minute by minute"), h("p", { class: "muted sec-note" }, "Each block is a module, as wide as its share of the 90 minutes. The yellow is your practice so far."), ninetyBar()),
    h(
      "div",
      { class: "home-cols" },
      h("section", { class: "plan" }, h("h2", { class: "h-sec" }, "Eight sessions"), h("p", { class: "muted sec-note" }, "Do them in order, one a day. Everything saves as you go, so you can stop anywhere and pick up later."), list),
      h(
        "aside",
        { class: "margin" },
        h("section", null, h("h2", { class: "h-note" }, "Today"), h("p", null, todayText)),
        h("section", null, h("h2", { class: "h-note" }, "Practice days"), h("ol", { class: "pds" }, pd.dots), h("p", null, pd.count ? `${plural(pd.count, "day")} so far.` + (run >= 2 ? ` ${run} in a row.` : "") : "Your first one starts with the next task.")),
        h("section", null, h("h2", { class: "h-note" }, "To review"), misses ? h("p", null, h("a", { href: "#/review" }, plural(misses, "question")), " you missed. Each one you clear is a point back.") : h("p", null, "Nothing waiting. Questions you miss land here.")),
        h("section", null, h("h2", { class: "h-note" }, "Cheatsheet"), h("p", null, h("a", { href: "cheatsheet.pdf", target: "_blank", rel: "noopener" }, "Open the 8-page PDF"), ". Keep it open in session 1, then close it.")),
        h(
          "section",
          null,
          h("h2", { class: "h-note" }, "How it works"),
          h("p", null, "Code runs in real Python inside this tab. The first visit downloads it once, then it starts from this device."),
          h("p", null, "Progress is saved in this browser only. Settings has a backup file if you switch devices."),
        ),
      ),
    ),
  );
}

export function homeView(root) {
  let queued = 0;
  const render = () => {
    queued = 0;
    settlePlan();
    const open = [...root.querySelectorAll(".sess details")].map((d) => d.open);
    clear(root).append(build());
    if (open.length) root.querySelectorAll(".sess details").forEach((d, i) => (d.open = d.open || open[i]));
  };
  const off = subscribe(() => {
    if (!queued) queued = requestAnimationFrame(render);
  });
  render();
  return () => {
    off();
    cancelAnimationFrame(queued);
  };
}
