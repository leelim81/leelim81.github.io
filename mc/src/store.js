// Progress lives in this browser's localStorage, as one JSON record.

const KEY = "onetwenty.v1";

let state = null;
let timer = 0;
let frozen = false;
const subs = new Set();

// When One Twenty opens in a newer tab, this tab stops writing, so two tabs can't overwrite each other.
export function freeze() {
  frozen = true;
}

function defaults() {
  return {
    app: "onetwenty",
    v: 1,
    created: Date.now(),
    settings: { date: "2026-12-02", time: "16:00", theme: "system", tall: null },
    todos: {}, // plan item id -> time it was ticked
    cards: {}, // recall card id -> { seen, streak, misses, last }
    round: null, // the recall round in progress
    lastRound: null, // the round that finished most recently
    rounds: 0,
    cases: {}, // case id -> { opened, tried, revealed, done }
    draw: {}, // diagram id -> { n, hit, of, ts }
    push: {}, // pushback id -> { n, ok, ts }
    sums: {}, // estimation id -> { n, ok, ts }
    qa: {}, // question id -> { n, ok, ts }
    lessons: {}, // lesson id -> { opened, done, answers: { check id: option index } }
    mocks: [], // finished mock panels: { ts, prompt, scores, total, secs }
    watched: {}, // video id -> time it was marked
    days: {}, // yyyy-mm-dd -> actions that day
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
  state = raw && raw.app === "onetwenty" ? { ...base, ...raw, settings: { ...base.settings, ...raw.settings } } : base;
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

// One more practice action today.
export function logDay(n = 1) {
  state.days[dayKey()] = (state.days[dayKey()] || 0) + n;
  save();
}

// Days in a row with practice, ending today or yesterday.
export function streak() {
  const d = new Date();
  if (!state.days[dayKey(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (state.days[dayKey(d)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

// The panel starts at this moment. The date and time in Settings are Singapore time, wherever the device is.
export function panelTime() {
  const { date, time } = state.settings;
  const t = new Date(`${date}T${time}:00+08:00`);
  return Number.isNaN(t.getTime()) ? new Date("2026-12-02T16:00:00+08:00") : t;
}

// ---- small records ------------------------------------------------------------------------
export const caseRec = (id) => (state.cases[id] ||= { opened: 0, tried: 0, revealed: 0, done: 0 });
export const lessonRec = (id) => (state.lessons[id] ||= { opened: 0, done: 0, answers: {} });

// A self-marked attempt at a drill item: bucket is "push", "sums", "qa", or "draw".
export function mark(bucket, id, ok, extra) {
  const r = (state[bucket][id] ||= { n: 0, ok: 0, ts: 0 });
  r.n++;
  if (ok) r.ok++;
  r.last = !!ok;
  r.ts = Date.now();
  if (extra) Object.assign(r, extra);
  logDay();
}

// ---- backup -------------------------------------------------------------------------------
export function exportAll() {
  saveNow();
  return { ...state, exported: new Date().toISOString() };
}

export function importAll(data) {
  if (!data || data.app !== "onetwenty" || data.v !== 1) throw new Error("That file is not a One Twenty backup.");
  const { exported, ...rest } = data;
  localStorage.setItem(KEY, JSON.stringify(rest));
  load();
  save();
}

export function resetAll() {
  localStorage.removeItem(KEY);
  load();
  save();
}
