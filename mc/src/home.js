// The plan page: the countdown, what to do next, five sessions, and the checklist for the day.
import { caseById } from "./content/cases.js";
import { DAY, SESSIONS, WARMUP } from "./content/plan.js";
import { lessonById } from "./content/primer.js";
import { VIDEOS } from "./content/videos.js";
import { add, clear, h, icon } from "./dom.js";
import { dayKey, logDay, panelTime, S, save, streak } from "./store.js";

// Every plan item in one shape: { key, title, meta, href, done, manual }.
function resolve(it) {
  if (it.kind === "case") {
    const c = caseById(it.ref);
    return { key: "case-" + it.ref, title: `Case ${c.n}: ${c.title}`, meta: `${c.minutes} min cold, then the worked answer`, href: "#/case/" + c.id, done: !!S().cases[c.id]?.done };
  }
  if (it.kind === "lesson") {
    const l = lessonById(it.ref);
    return { key: "lesson-" + it.ref, title: `Primer: ${l.title}`, meta: `${l.minutes} min`, href: "#/primer/" + l.id, done: !!S().lessons[l.id]?.done };
  }
  if (it.kind === "video") {
    const v = VIDEOS.find((x) => x.id === it.ref);
    return { key: "video-" + it.ref, title: `Watch: ${v.title}`, meta: v.channel, href: "#/videos", done: !!S().watched[v.id] };
  }
  return { key: it.id, title: it.title, meta: it.meta, href: it.href, done: !!S().todos[it.id], manual: true };
}

function countdown() {
  const ms = panelTime().getTime() - Date.now();
  const when = panelTime().toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Singapore" });
  if (ms <= 0) return { n: "0", unit: "The panel has started, or it is behind you.", when };
  const hours = ms / 3.6e6;
  if (hours < 48) return { n: String(Math.max(1, Math.round(hours))), unit: `hour${Math.round(hours) === 1 ? "" : "s"} to the panel`, when };
  const days = Math.ceil(hours / 24);
  return { n: String(days), unit: "days to the panel", when };
}

// One dot for each day from the first visit to the day of the panel.
function dots() {
  const out = [];
  const end = dayKey(panelTime());
  const d = new Date(S().created);
  const today = dayKey();
  for (let i = 0; i < 28; i++) {
    const key = dayKey(d);
    out.push(h("li", { class: "pd" + (S().days[key] ? " is-on" : "") + (key === today ? " is-today" : "") + (key === end ? " is-test" : ""), title: key }));
    if (key >= end) break;
    d.setDate(d.getDate() + 1);
  }
  return h("ul", { class: "pds", "aria-hidden": "true" }, out);
}

export function homeView(root) {
  const page = h("div", { class: "page-home" });
  clear(root).append(page);
  let openId = null;

  function paint() {
    const sessions = SESSIONS.map((s) => ({ ...s, rows: s.items.map(resolve) }));
    const current = sessions.find((s) => s.rows.some((r) => !r.done));
    const next = current?.rows.find((r) => !r.done);
    if (openId == null) openId = current?.id || "none";
    const cd = countdown();
    const all = sessions.flatMap((s) => s.rows);
    const doneCount = all.filter((r) => r.done).length;
    const run = streak();
    clear(page);
    add(
      page,
      h(
        "div",
        { class: "hero" },
        h(
          "div",
          null,
          h("h1", { class: "display" }, "Two hours with the team you would lead"),
          h("p", { class: "hero-sub" }, "A practice room for a panel case. Four worked scenarios with diagrams, a workbook for a case of your own, the AWS vocabulary, and drills to make all of it stick."),
          h("div", { class: "count", style: "margin-top: 22px" }, h("span", { class: "count-n" }, cd.n), h("span", { class: "count-u" }, cd.unit)),
          h("p", { class: "muted", style: "font-size: 14.5px" }, `${cd.when}, Singapore time. `, h("a", { href: "#/settings" }, "Change")),
        ),
        next
          ? h(
              "div",
              { class: "next" },
              h("span", { class: "next-where" }, `Next up · Session ${sessions.indexOf(current) + 1} of ${sessions.length}`),
              h("p", { class: "next-title" }, next.title),
              h("p", { class: "next-meta" }, next.meta),
              h("a", { class: "btn btn-go btn-big", href: next.href }, "Open it", icon("next")),
              h("p", { class: "next-hint" }, `${doneCount} of ${all.length} steps done.`),
            )
          : h("div", { class: "next" }, h("span", { class: "next-where" }, "The plan is done"), h("p", { class: "next-title" }, "Keep warm with one drill a day"), h("p", { class: "next-meta" }, "Short, and out loud."), h("a", { class: "btn btn-go btn-big", href: "#/drills" }, "Open the drills", icon("next"))),
      ),
      h(
        "div",
        { class: "home-cols" },
        h(
          "div",
          null,
          h("h2", { class: "h-sec" }, "Five sessions"),
          h("p", { class: "muted", style: "margin: 2px 0 12px; font-size: 14.5px" }, "About seven hours in all. One session a day leaves two days spare before the panel."),
          h(
            "ol",
            { class: "sessions" },
            sessions.map((s, i) => {
              const done = s.rows.filter((r) => r.done).length;
              const complete = done === s.rows.length;
              const det = h(
                "details",
                { open: openId === s.id },
                h("summary", { class: "sess-head" }, h("span", { class: "sess-n" }, complete ? icon("check", "Done") : i + 1), h("span", null, h("span", { class: "sess-title" }, s.title), h("span", { class: "sess-goal" }, s.goal)), h("span", { class: "sess-count" }, `${done} of ${s.rows.length}`), h("span", { class: "sess-min" }, `${s.minutes} min`)),
                h(
                  "ul",
                  { class: "items" },
                  s.rows.map((r) =>
                    r.manual
                      ? h(
                          "li",
                          null,
                          h(
                            "div",
                            { class: "it-row" },
                            h(
                              "label",
                              { class: "it-check" },
                              h("input", {
                                type: "checkbox",
                                checked: r.done,
                                "aria-label": "Done: " + r.title,
                                onchange: (e) => {
                                  if (e.target.checked) {
                                    S().todos[r.key] = Date.now();
                                    logDay();
                                  } else {
                                    delete S().todos[r.key];
                                    save();
                                  }
                                  paint();
                                },
                              }),
                            ),
                            h("span", null, h("a", { class: "it-title", href: r.href }, r.title), h("span", { class: "it-meta" }, r.meta)),
                            h("span", { class: "it-end" }, r.done ? "Done" : ""),
                          ),
                        )
                      : h("li", null, h("a", { class: "it-row", href: r.href }, r.done ? icon("check", "Done") : icon("ring", "Not done"), h("span", null, h("span", { class: "it-title" }, r.title), h("span", { class: "it-meta" }, r.meta)), h("span", { class: "it-end" }, r.done ? "Done" : ""))),
                  ),
                ),
              );
              det.addEventListener("toggle", () => {
                if (det.open) openId = s.id;
                else if (openId === s.id) openId = "none";
              });
              return h("li", { class: "sess" + (current && s.id === current.id ? " is-current" : "") }, det);
            }),
          ),
        ),
        h(
          "aside",
          { class: "margin" },
          h("section", null, h("p", { class: "h-note" }, "Days of practice"), dots(), h("p", { class: "muted" }, run ? `${run} day${run === 1 ? "" : "s"} in a row. The square is the day of the panel.` : "A dot fills on each day you practice. The square is the day of the panel.")),
          h("section", null, h("p", { class: "h-note" }, "A ten-minute warm-up"), h("ul", { style: "list-style: none; padding: 0; display: grid; gap: 6px" }, WARMUP.map(([href, text]) => h("li", null, h("a", { href }, text))))),
          h(
            "section",
            null,
            h("p", { class: "h-note" }, "On the day"),
            h(
              "ul",
              { class: "check-list" },
              DAY.map((d) =>
                h(
                  "li",
                  null,
                  h(
                    "label",
                    null,
                    h("input", {
                      type: "checkbox",
                      checked: !!S().todos[d.id],
                      onchange: (e) => {
                        if (e.target.checked) S().todos[d.id] = Date.now();
                        else delete S().todos[d.id];
                        save();
                      },
                    }),
                    h("span", null, d.text),
                  ),
                ),
              ),
            ),
          ),
          h("section", null, h("p", { class: "h-note" }, "Private by design"), h("p", { class: "muted" }, "Progress stays in this browser. The site does not name the company you are meeting, or any person, and search engines are asked not to list it.")),
        ),
      ),
    );
  }

  paint();
  return () => {};
}
