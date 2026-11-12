// The question bank, the task files, and everything derived from them: plan state and module progress.
import { BUILD } from "./build.js";
import { clock, plural } from "./dom.js";
import { S, save } from "./store.js";

let bank = null;
export const X = { ex: {}, q: {}, set: {}, mock: {}, mod: {}, lesson: {} };
const payloads = new Map();

export async function loadBank() {
  const res = await fetch(`content/bank.json?v=${BUILD}`);
  if (!res.ok) throw new Error(`The question bank did not load (status ${res.status}).`);
  bank = await res.json();
  for (const e of bank.exercises) X.ex[e.id] = e;
  for (const q of bank.questions) X.q[q.id] = q;
  for (const s of bank.sets) X.set[s.id] = s;
  for (const m of bank.mocks) X.mock[m.id] = m;
  for (const m of bank.modules) X.mod[m.id] = m;
  for (const m of bank.mocks) for (const id of m.questions) (X.ex[id] || X.q[id]).mock = m.id;
  bank.course.lessons.forEach((les, i) => {
    les.n = i + 1;
    les.checks = les.blocks.filter((b) => b.kind === "check").map((b) => b.q);
    X.lesson[les.id] = les;
  });
  return bank;
}

export const B = () => bank;

// Input files and hidden check data for one task. Fetched once per visit.
export function payload(id) {
  if (!payloads.has(id)) {
    const p = fetch(`content/ex/${id}.json?v=${BUILD}`).then((r) => {
      if (!r.ok) throw new Error(`The task files did not load (status ${r.status}).`);
      return r.json();
    });
    p.catch(() => payloads.delete(id));
    payloads.set(id, p);
  }
  return payloads.get(id);
}

// "houses-collect@2" is the second pass at houses-collect: same task, separate draft and record.
export function splitKey(key) {
  const [id, pass] = key.split("@");
  return { id, pass: Number(pass || 1) };
}

export const setMinutes = (s) => s.questions.reduce((n, id) => n + X.q[id].minutes, 0);
export const missCount = () => Object.keys(S().misses).filter((id) => X.q[id]).length;
export const taskPassed = (id) => !!(S().tasks[id]?.passed || S().tasks[id + "@2"]?.passed);

// Tasks and questions inside a mock stay out of sight until that mock is finished.
export const unlocked = (thing) => !thing.mock || S().mocks[thing.mock]?.status === "done";

export function moduleProgress() {
  const st = S();
  const out = {};
  for (const m of bank.modules) {
    let done = 0;
    if (m.kind === "quiz") {
      for (const q of bank.questions) if (q.module === m.id && st.quiz[q.id]?.ok) done++;
    } else {
      for (const e of bank.exercises) if (e.module === m.id && taskPassed(e.id)) done++;
    }
    out[m.id] = { done, target: m.target, frac: Math.min(1, done / m.target) };
  }
  return out;
}

// ---- the refresher ------------------------------------------------------------------------
// A lesson is done once every check in it has had an answer, right or wrong. Trying a check again doesn't undo that.
export function lessonState(les) {
  const rec = S().course[les.id];
  const answered = les.checks.filter((q) => rec?.answers?.[q.id]).length;
  const right = les.checks.filter((q) => rec?.answers?.[q.id]?.correct).length;
  return { answered, right, total: les.checks.length, done: !!rec?.done, started: !!rec?.opened };
}

// The lessons behind a list of questions, in course order.
export function lessonsFor(ids) {
  const seen = new Set(ids.map((id) => X.q[id]?.see));
  return bank.course.lessons.filter((les) => seen.has(les.id));
}

export function courseProgress() {
  const lessons = bank.course.lessons;
  const done = lessons.filter((les) => lessonState(les).done).length;
  return { done, total: lessons.length, next: lessons.find((les) => !lessonState(les).done) || null };
}

// ---- the plan -----------------------------------------------------------------------------
const missesId = (sess) => `misses:${sess.id}`;

// What the plan shows for one item: where it leads and how far along it is.
export function itemView(item, sess) {
  const st = S();
  if (item.kind === "code") {
    const e = X.ex[item.id];
    const key = item.again ? item.id + "@2" : item.id;
    const t = st.tasks[key];
    return {
      title: e.title,
      tag: item.again ? "Second pass, from a blank file" : "",
      meta: `${X.mod[e.module].short}, ${e.minutes} min`,
      minutes: e.minutes,
      href: `#/task/${key}`,
      state: t?.passed ? "done" : t?.started ? "doing" : "todo",
      detail: t?.passed ? `Solved in ${clock(t.best)}` : t?.started ? `${clock(t.seconds)} so far` : "",
      verb: t?.started && !t?.passed ? "Resume" : "Start",
    };
  }
  if (item.kind === "set") {
    const s = X.set[item.id];
    const rec = st.sets[item.id];
    const last = rec?.runs?.at(-1);
    return {
      title: s.title,
      tag: "",
      meta: `${plural(s.questions.length, "question")} on ${X.mod[s.module].topic}, about ${setMinutes(s)} min`,
      minutes: setMinutes(s),
      href: `#/set/${s.id}`,
      state: last ? "done" : rec?.cur ? "doing" : "todo",
      detail: last ? `${last.correct} of ${last.total} right` : rec?.cur ? `Question ${rec.cur.i + 1} of ${s.questions.length}` : "",
      verb: rec?.cur && !last ? "Resume" : "Start",
    };
  }
  if (item.kind === "mock") {
    const m = X.mock[item.id];
    const rec = st.mocks[item.id];
    return {
      title: m.title,
      tag: "",
      meta: `${m.questions.length} questions, ${m.minutes} min, closed book`,
      minutes: m.minutes,
      href: `#/mock/${m.id}`,
      state: rec?.status === "done" ? "done" : rec?.status === "running" ? "doing" : "todo",
      detail: rec?.status === "done" ? `${rec.report.points} of ${rec.report.outOf} points` : rec?.status === "running" ? `${clock(rec.remaining)} left on the clock` : "",
      verb: rec?.status === "running" ? "Resume" : "Start",
    };
  }
  if (item.kind === "misses") {
    const n = missCount();
    const done = !!st.todos[missesId(sess)];
    return {
      title: "Review your misses",
      tag: "",
      meta: done ? "" : n ? `${plural(n, "question")} waiting` : "Nothing waiting",
      minutes: Math.min(20, n * 3),
      href: "#/review",
      state: done ? "done" : "todo",
      detail: done ? "Done" : "",
      verb: "Start",
    };
  }
  return {
    title: item.text,
    tag: "",
    meta: "",
    minutes: item.minutes || 0,
    todo: item.id,
    state: st.todos[item.id] ? "done" : "todo",
    detail: "",
    verb: "Tick off",
  };
}

// A "review your misses" step with nothing to review is done as soon as you reach it.
export function settlePlan() {
  const st = S();
  let changed = false;
  for (const sess of bank.plan) {
    let reached = true;
    for (const item of sess.items) {
      if (item.kind === "misses" && reached && !st.todos[missesId(sess)] && missCount() === 0) {
        st.todos[missesId(sess)] = Date.now();
        changed = true;
      }
      if (itemView(item, sess).state !== "done") reached = false;
    }
  }
  if (changed) save();
}

// After a review run: tick the review step of the session you are in, and of any earlier one.
export function reviewDone() {
  const st = S();
  const at = nextUp();
  for (const [i, sess] of bank.plan.entries()) {
    if (at && i > at.index) break;
    if (sess.items.some((it) => it.kind === "misses")) st.todos[missesId(sess)] ||= Date.now();
  }
  save();
}

export function sessionView(sess, index) {
  const items = sess.items.map((item) => ({ item, ...itemView(item, sess) }));
  const done = items.filter((v) => v.state === "done").length;
  return { sess, index, items, done, total: items.length, minutes: items.reduce((n, v) => n + v.minutes, 0), complete: done === items.length };
}

// If finishing this item completed its session, say which one. kind is "code", "set", or "mock".
export function sessionClosedBy(kind, id) {
  settlePlan();
  for (const [index, sess] of bank.plan.entries()) {
    const mine = sess.items.some((it) => it.kind === kind && (kind === "code" ? it.id + (it.again ? "@2" : "") : it.id) === id);
    if (mine && sessionView(sess, index).complete) return `That completes session ${index + 1} of ${bank.plan.length}: ${sess.title.toLowerCase()}.`;
  }
  return "";
}

// The first thing in the plan that is not done yet.
export function nextUp() {
  for (const [index, sess] of bank.plan.entries()) {
    for (const item of sess.items) {
      const view = itemView(item, sess);
      if (view.state !== "done") return { sess, index, item, view };
    }
  }
  return null;
}

// Where to go after finishing something: the next plan step, or home when the plan is done.
export function nextLink() {
  settlePlan();
  const up = nextUp();
  if (!up) return { href: "#/", label: "Back to the plan" };
  if (up.view.todo) return { href: "#/", label: "Back to the plan" };
  return { href: up.view.href, label: `Next: ${up.view.title}` };
}
