// Progress lives in this browser's localStorage: one JSON record, plus one entry per code draft.

const KEY = "ninety.v1";
const CODE = "ninety.v1.code:";

let state = null;
let timer = 0;
let frozen = false;
const subs = new Set();

// When Ninety opens in a newer tab, this tab stops writing, so two tabs can't overwrite each other.
export function freeze() {
  frozen = true;
}

function defaults() {
  return {
    app: "ninety",
    v: 1,
    created: Date.now(),
    settings: { testDate: "2026-11-19", theme: "system", fontSize: 14, autocomplete: true, left: 40, bottom: 36 },
    tasks: {}, // task key -> record, see task()
    quiz: {}, // question id -> { n, ok, last, ts }
    sets: {}, // set id -> { runs: [{ ts, correct, total, seconds }], cur }
    mocks: {}, // mock id -> see mock.js
    todos: {}, // plan item id -> time it was ticked
    days: {}, // yyyy-mm-dd -> { s: seconds, t: tasks solved, a: answers, c: correct answers }
    misses: {}, // question id -> time it was missed
    review: null, // a review run in progress
    course: {}, // refresher lesson id -> see lessonRec()
    recall: { cards: {}, round: null, last: null, rounds: 0 }, // code recall, see recallRec()
  };
}

export function load() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY));
  } catch {
    raw = null;
  }
  const base = defaults();
  state = raw && raw.app === "ninety" ? { ...base, ...raw, settings: { ...base.settings, ...raw.settings } } : base;
  return state;
}

export const S = () => state;

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function saveNow() {
  clearTimeout(timer);
  timer = 0;
  if (frozen) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// Call after any change. Writes are batched; listeners hear about the change right away.
export function save() {
  if (!timer) timer = setTimeout(saveNow, 300);
  for (const fn of subs) fn(state);
}

export function storageWorks() {
  try {
    localStorage.setItem(KEY + ".probe", "1");
    localStorage.removeItem(KEY + ".probe");
    return true;
  } catch {
    return false;
  }
}

window.addEventListener("pagehide", () => {
  if (state) saveNow();
});
document.addEventListener("visibilitychange", () => {
  if (state && document.visibilityState === "hidden") saveNow();
});

// ---- days ---------------------------------------------------------------------------------
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function logDay(patch) {
  const day = (state.days[dayKey()] ||= { s: 0, t: 0, a: 0, c: 0 });
  for (const [k, n] of Object.entries(patch)) day[k] = (day[k] || 0) + n;
  save();
}

export const isPracticeDay = (d) => !!d && (d.a > 0 || d.t > 0 || d.s >= 120);

// Days in a row with practice, ending today or yesterday.
export function streak() {
  const d = new Date();
  if (!isPracticeDay(state.days[dayKey(d)])) d.setDate(d.getDate() - 1);
  let n = 0;
  while (isPracticeDay(state.days[dayKey(d)])) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function daysUntil(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const now = new Date();
  return Math.round((new Date(y, m - 1, d) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

// ---- tasks --------------------------------------------------------------------------------
// seconds, submits, hints, peeked, and solved describe the current attempt. passed and best are for good.
export function task(key) {
  return (state.tasks[key] ||= { started: 0, seconds: 0, submits: 0, hints: 0, peeked: false, solved: false, passed: 0, best: 0, checks: null });
}

// answers: check id -> { value, correct }. done is the time every check had an answer. tries reshuffles a retried check.
export function lessonRec(id) {
  return (state.course[id] ||= { opened: 0, done: 0, answers: {}, tries: 0, ran: 0 });
}

// cards: card id -> { seen, streak, misses, last }, counted on the first try of each round only.
// round is the round in progress, last is the one that finished most recently, rounds is how many have finished.
export function recallRec() {
  const r = (state.recall ||= {});
  r.cards ||= {};
  r.round ||= null;
  r.last ||= null;
  r.rounds ||= 0;
  return r;
}

export function getCode(key) {
  try {
    return localStorage.getItem(CODE + key);
  } catch {
    return null;
  }
}

export function setCode(key, text) {
  if (frozen) return false;
  try {
    localStorage.setItem(CODE + key, text);
    return true;
  } catch {
    return false;
  }
}

export function dropCode(key) {
  try {
    localStorage.removeItem(CODE + key);
  } catch {
    // nothing to remove
  }
}

// ---- quiz ---------------------------------------------------------------------------------
export function recordAnswer(qid, correct) {
  const r = (state.quiz[qid] ||= { n: 0, ok: false, last: false, ts: 0 });
  r.n++;
  r.last = correct;
  r.ts = Date.now();
  if (correct) {
    r.ok = true;
    delete state.misses[qid];
  } else {
    state.misses[qid] = Date.now();
  }
  logDay({ a: 1, c: correct ? 1 : 0 });
}

// ---- backup -------------------------------------------------------------------------------
function codeKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(CODE)) keys.push(k);
  }
  return keys;
}

export function exportAll() {
  saveNow();
  const code = {};
  for (const k of codeKeys()) code[k.slice(CODE.length)] = localStorage.getItem(k);
  return { ...state, code, exported: new Date().toISOString() };
}

export function importAll(data) {
  if (!data || data.app !== "ninety" || data.v !== 1) throw new Error("That file is not a Ninety backup.");
  const { code = {}, exported, ...rest } = data;
  for (const k of codeKeys()) localStorage.removeItem(k);
  for (const [k, text] of Object.entries(code)) if (typeof text === "string") localStorage.setItem(CODE + k, text);
  localStorage.setItem(KEY, JSON.stringify(rest));
  load();
  save();
}

export function resetAll() {
  for (const k of codeKeys()) localStorage.removeItem(k);
  localStorage.removeItem(KEY);
  load();
  save();
}
