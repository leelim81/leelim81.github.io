import { createEditor } from "./editor.js";
import { renderMarkdown } from "./markdown.js";

const SUPABASE_URL = "https://iayjctfpriypqetkbbaz.supabase.co";
const SUPABASE_KEY = "sb_publishable_gv5yNi2f1lXhtZae86fv7w_ZL8OPyOW";
const DEFAULT_MODEL = "claude-sonnet-5-5";
const ANTHROPIC_VERSION = "2026-10-21";

const S = {
  bank: null,
  harness: "",
  progress: null,
  settings: null,
  sync: { state: "local", detail: "Saved on this device" },
  syncReady: false,
  run: emptyRun(),
  ai: { loading: false, text: "", error: "" },
  filter: { q: "", diff: "all", status: "all" },
  leftTab: "description",
  mobilePane: "task",
  bottomTab: "tests",
  gear: false,
  jump: false,
  scratch: null,
  mode: "practice",
  editor: null,
  editorKey: "",
  saveTimer: 0,
  syncTimer: 0,
  runSeq: 0,
  worker: null,
  sql: null,
  runtimeReady: false,
  runtimeStatus: "",
};

function emptyRun() {
  return { id: 0, running: false, status: "", tests: [], stdout: "", stderr: "", error: "", traceback: "", passed: null };
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadSettings() {
  const raw = localStorage.getItem("bcgx.settings");
  const base = { theme: "dark", fontSize: 16, tabSize: 4, autocomplete: true, model: DEFAULT_MODEL, showFix: false };
  try {
    return Object.assign(base, raw ? JSON.parse(raw) : {});
  } catch {
    return base;
  }
}

function saveSettings() {
  const { theme, fontSize, tabSize, autocomplete, model, showFix } = S.settings;
  localStorage.setItem("bcgx.settings", JSON.stringify({ theme, fontSize, tabSize, autocomplete, model, showFix }));
  document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
}

function apiKey() {
  return localStorage.getItem("bcgx.apiKey") || "";
}
function setApiKey(v) {
  if (v) localStorage.setItem("bcgx.apiKey", v);
  else localStorage.removeItem("bcgx.apiKey");
}
function passphrase() {
  return localStorage.getItem("bcgx.passphrase") || "";
}
function setPassphrase(v) {
  if (v) localStorage.setItem("bcgx.passphrase", v);
  else localStorage.removeItem("bcgx.passphrase");
}

function defaultProgress() {
  return { version: 1, questions: {}, mocks: [], testDate: null, lastOpenedId: null, lastOpenedAt: 0 };
}

function loadProgress() {
  try {
    const raw = localStorage.getItem("bcgx.progress");
    if (!raw) return defaultProgress();
    const p = JSON.parse(raw);
    p.questions = p.questions || {};
    p.mocks = p.mocks || [];
    return p;
  } catch {
    return defaultProgress();
  }
}

function persistLocal() {
  const copy = JSON.parse(JSON.stringify(S.progress));
  localStorage.setItem("bcgx.progress", JSON.stringify(copy));
}

function rec(id) {
  return S.progress.questions[id] || null;
}

function touch(id, patch) {
  const prev = S.progress.questions[id] || { status: "not_started", attempts: 0, history: [] };
  const next = Object.assign({}, prev, patch, { updatedAt: Date.now() });
  if (next.history && next.history.length > 8) next.history = next.history.slice(-8);
  S.progress.questions[id] = next;
  persistLocal();
  scheduleSync();
  return next;
}

function statusOf(id) {
  const q = byId(id);
  const r = rec(id);
  if (!q) return "not_started";
  if (q.type === "reading") return r && r.status === "read" ? "read" : "not_started";
  return (r && r.status) || "not_started";
}

function byId(id) {
  return S.bank && S.bank.questions.find((q) => q.id === id);
}

function flat() {
  const order = S.bank.groups.map((g) => g.id);
  return S.bank.questions.slice().sort((a, b) => {
    const d = order.indexOf(a.group) - order.indexOf(b.group);
    return d || a.order - b.order;
  });
}

function isDone(q) {
  const st = statusOf(q.id);
  return q.type === "reading" ? st === "read" : st === "solved";
}

function continueId() {
  const items = flat();
  const last = S.progress.lastOpenedId && byId(S.progress.lastOpenedId);
  if (last && !isDone(last)) return last.id;
  const next = items.find((q) => !isDone(q));
  return (next || items[0]).id;
}

function activeMock() {
  return (S.progress.mocks || []).find((m) => m.status === "active") || null;
}

function parseRoute() {
  const parts = (location.hash || "#/").replace(/^#/, "").split("/").filter(Boolean);
  if (!parts.length) return { name: "path" };
  if (parts[0] === "q" && parts[1]) return { name: "task", id: decodeURIComponent(parts[1]) };
  if (parts[0] === "sheet") return { name: "sheet", anchor: parts[1] || "" };
  if (parts[0] === "settings") return { name: "settings" };
  if (parts[0] === "mock" && parts[1] === "review" && parts[2]) return { name: "review", id: parts[2] };
  if (parts[0] === "mock") return { name: "mock" };
  if (parts[0] === "sandbox") return { name: "sandbox" };
  return { name: "path" };
}

function go(hash) {
  flushCode();
  if ((location.hash || "#/") === hash) render();
  else location.hash = hash;
}

function isNarrow() {
  return window.matchMedia("(max-width: 759px)").matches;
}

function layout() {
  try {
    return JSON.parse(localStorage.getItem("bcgx.layout") || "{}");
  } catch {
    return {};
  }
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function counts() {
  const qs = S.bank.questions.filter((q) => q.type !== "reading");
  const readings = S.bank.questions.filter((q) => q.type === "reading");
  let solved = 0, attempted = 0;
  qs.forEach((q) => {
    const st = statusOf(q.id);
    if (st === "solved") solved += 1;
    else if (st === "attempted") attempted += 1;
  });
  const read = readings.filter((q) => statusOf(q.id) === "read").length;
  return { solved, attempted, todo: qs.length - solved - attempted, total: qs.length, read, readings: readings.length };
}

function groupItems(gid) {
  return S.bank.questions.filter((q) => q.group === gid).sort((a, b) => a.order - b.order);
}

function openId(id, mode) {
  S.mode = mode || "practice";
  S.leftTab = "description";
  S.mobilePane = "task";
  S.bottomTab = "tests";
  S.gear = false;
  S.run = emptyRun();
  const r = rec(id);
  if (r && r.lastTests) {
    S.run.tests = r.lastTests;
    S.run.stdout = r.lastStdout || "";
    S.run.passed = r.lastTests.length ? r.lastTests.every((t) => t.passed) : null;
  }
  S.progress.lastOpenedId = id;
  S.progress.lastOpenedAt = Date.now();
  persistLocal();
  go("#/q/" + encodeURIComponent(id));
}

function currentTask() {
  const route = parseRoute();
  if (route.name === "sandbox") return null;
  if (route.name !== "task") return null;
  return byId(route.id);
}

function liveMockHidesSolution(q) {
  const m = activeMock();
  if (!m || !q) return false;
  if (S.mode === "review") return false;
  return m.questionIds.includes(q.id);
}

function autocompleteOn(q) {
  if (!S.settings.autocomplete) return false;
  if (S.mode === "mock") return false;
  if (q && liveMockHidesSolution(q) && S.mode === "mock") return false;
  return true;
}

function codeFor(q) {
  if (!q) return S.scratch ? S.scratch.code : "";
  if (S.mode === "mock" || S.mode === "review") {
    const m = S.mode === "review" ? S.progress.mocks.find((x) => x.id === S.reviewId) : activeMock();
    const ans = m && m.answers && m.answers[q.id];
    if (ans && ans.code != null) return ans.code;
  }
  const r = rec(q.id);
  if (r && r.code != null) return r.code;
  return q.starter || "";
}

function flushCode() {
  if (!S.editor) return;
  const code = S.editor.get();
  if (!S.editorFor) {
    if (S.scratch) S.scratch.code = code;
    return;
  }
  const q = byId(S.editorFor);
  if (!q || (q.type !== "python" && q.type !== "sql")) return;
  if (S.mode === "mock") {
    const m = activeMock();
    if (!m) return;
    m.answers = m.answers || {};
    m.answers[q.id] = Object.assign({}, m.answers[q.id], { code });
    m.updatedAt = Date.now();
    persistLocal();
    scheduleSync();
    return;
  }
  const prev = rec(q.id);
  if (prev && prev.code === code) return;
  touch(q.id, { code, status: statusOf(q.id) === "solved" ? "solved" : (prev && prev.status) || "not_started" });
}

function scheduleSync() {
  clearTimeout(S.syncTimer);
  if (!S.syncReady) return;
  S.syncTimer = setTimeout(() => pushProgress(), 1000);
}

async function rpc(name, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { message: text }; }
  if (!res.ok) {
    const msg = (payload && (payload.message || payload.error || payload.hint)) || text || res.statusText;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return payload;
}

function mergeProgress(a, b) {
  const questions = {};
  const ids = new Set([...Object.keys(a.questions || {}), ...Object.keys(b.questions || {})]);
  ids.forEach((id) => {
    const x = a.questions[id];
    const y = b.questions[id];
    if (!x) questions[id] = y;
    else if (!y) questions[id] = x;
    else questions[id] = (x.updatedAt || 0) >= (y.updatedAt || 0) ? x : y;
  });
  const mocks = new Map();
  [...(b.mocks || []), ...(a.mocks || [])].forEach((m) => {
    const prev = mocks.get(m.id);
    if (!prev || (m.updatedAt || 0) >= (prev.updatedAt || 0)) mocks.set(m.id, m);
  });
  let testDate = a.testDate || null;
  if (b.testDate && (!testDate || (b.testDate.updatedAt || 0) > (testDate.updatedAt || 0))) testDate = b.testDate;
  const lastOpenedId = (a.lastOpenedAt || 0) >= (b.lastOpenedAt || 0) ? a.lastOpenedId : b.lastOpenedId;
  return {
    version: 1,
    questions,
    mocks: [...mocks.values()],
    testDate,
    lastOpenedId,
    lastOpenedAt: Math.max(a.lastOpenedAt || 0, b.lastOpenedAt || 0),
  };
}

function payload() {
  return {
    version: 1,
    questions: S.progress.questions,
    mocks: S.progress.mocks,
    testDate: S.progress.testDate,
    lastOpenedId: S.progress.lastOpenedId,
    lastOpenedAt: S.progress.lastOpenedAt,
  };
}

function setSync(state, detail) {
  S.sync = { state, detail };
  const el = document.getElementById("sync-label");
  const dot = document.getElementById("sync-dot");
  if (el) el.textContent = detail;
  if (dot) dot.className = "syncdot " + (state === "synced" ? "ok" : state === "error" ? "bad" : state === "syncing" ? "wait" : "");
}

async function pullAndMerge() {
  const key = passphrase();
  if (key.length < 12) {
    S.syncReady = false;
    setSync("local", "Saved on this device");
    return;
  }
  setSync("syncing", "Syncing…");
  try {
    const remote = await rpc("bcgx_load_progress", { sync_key: key });
    if (remote && remote.status === "unclaimed") {
      await rpc("bcgx_save_progress", { sync_key: key, payload: payload() });
      S.syncReady = true;
      setSync("synced", "Synced · store claimed");
      return;
    }
    if (!remote || remote.status !== "ok") {
      S.syncReady = false;
      setSync("error", "Unexpected sync response");
      return;
    }
    const remoteData = typeof remote.data === "string" ? JSON.parse(remote.data) : (remote.data || {});
    const merged = mergeProgress(S.progress, remoteData);
    S.progress = merged;
    persistLocal();
    S.syncReady = true;
    if (JSON.stringify(merged) !== JSON.stringify(remoteData)) await rpc("bcgx_save_progress", { sync_key: key, payload: payload() });
    setSync("synced", "Synced");
    if (!S.run.running) render();
  } catch (err) {
    const msg = String(err.message || err);
    if (/wrong sync key/i.test(msg)) {
      S.syncReady = false;
      setSync("error", "This passphrase does not match the one that claimed the store.");
    } else {
      S.syncReady = false;
      setSync("offline", "Offline · saved on this device");
    }
  }
}

async function pushProgress() {
  if (!S.syncReady) return;
  const key = passphrase();
  if (key.length < 12) return;
  setSync("syncing", "Syncing…");
  try {
    await rpc("bcgx_save_progress", { sync_key: key, payload: payload() });
    setSync("synced", "Synced");
  } catch (err) {
    const msg = String(err.message || err);
    if (/wrong sync key/i.test(msg)) {
      S.syncReady = false;
      setSync("error", "Sync passphrase was rejected.");
    } else setSync("offline", "Offline · saved on this device");
  }
}

function mountEditor(q) {
  const host = document.getElementById("editor-host");
  if (!host) {
    if (S.editor) { S.editor.destroy(); S.editor = null; S.editorKey = ""; }
    return;
  }
  const lang = S.scratch ? (S.scratch.lang || "python") : (q && q.type === "sql" ? "sql" : "python");
  const key = (S.scratch ? "scratch" : q.id) + ":" + lang + ":" + S.mode;
  const value = S.scratch ? S.scratch.code : codeFor(q);
  if (S.editor && S.editorKey === key) return;
  if (S.editor) S.editor.destroy();
  S.editorKey = key;
  S.editorFor = q ? q.id : null;
  S.editor = createEditor(host, {
    value,
    lang,
    theme: S.settings.theme,
    fontSize: S.settings.fontSize,
    tabSize: S.settings.tabSize,
    autocomplete: S.scratch ? S.settings.autocomplete : autocompleteOn(q),
    wrap: isNarrow(),
    onChange(code) {
      if (S.scratch) S.scratch.code = code;
      else if (q && S.mode !== "review") {
        clearTimeout(S.saveTimer);
        S.saveTimer = setTimeout(() => flushCode(), 120);
      }
    },
  });
}

function applyPanes() {
  const narrow = isNarrow();
  document.body.classList.toggle("is-narrow", narrow);
  const root = document.getElementById("ide");
  if (!root) return;
  if (root.classList.contains("sandbox")) {
    root.querySelectorAll(".pane-off").forEach((el) => el.classList.remove("pane-off"));
    return;
  }
  root.querySelectorAll("[data-pane]").forEach((el) => {
    el.classList.toggle("pane-off", narrow && el.dataset.pane !== S.mobilePane && !(S.mobilePane === "code" && el.dataset.pane === "work"));
  });
  const work = root.querySelector(".work-col");
  if (work) work.classList.toggle("pane-off", narrow && S.mobilePane === "task");
  const code = root.querySelector("[data-pane=code]");
  const tests = root.querySelector("[data-pane=tests]");
  if (code) code.classList.toggle("pane-off", narrow && S.mobilePane !== "code");
  if (tests) tests.classList.toggle("pane-off", narrow && S.mobilePane !== "tests");
  document.querySelectorAll("[data-pane-btn]").forEach((btn) => btn.classList.toggle("on", btn.dataset.paneBtn === S.mobilePane));
  if (S.editor) S.editor.setWrap(narrow);
}

function splitHtml() {
  const lay = layout();
  const desc = lay.desc || "42%";
  const tests = lay.tests || "210px";
  return `--desc:${desc};--tests:${tests}`;
}

function isMac() {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || "") || /Mac OS/.test(navigator.userAgent || "");
}
function modName() {
  return isMac() ? "⌘" : "Ctrl";
}
function keyLabel(spec) {
  return spec.replaceAll("Ctrl", modName());
}
function tip(action, spec) {
  return `${action} (${keyLabel(spec)})`;
}
function face(label, spec) {
  return `${esc(label)}<kbd>${esc(keyLabel(spec))}</kbd>`;
}

function topbar(extra) {
  const dot = S.sync.state === "synced" ? "ok" : S.sync.state === "error" ? "bad" : S.sync.state === "syncing" ? "wait" : "";
  return `<header class="topbar">
    <button class="iconbtn" data-act="go" data-hash="#/" title="${esc(tip("Task list", "Ctrl+Alt+H"))}" aria-label="Questions">≡</button>
    <div class="brand">DSF<span>Desk</span></div>
    ${extra || ""}
    <span class="syncdot ${dot}" id="sync-dot" title="${esc(S.sync.detail)}"></span>
    <button class="iconbtn" data-act="help" title="${esc(tip("Keyboard shortcuts", "F1"))}" aria-label="Keyboard shortcuts">?</button>
    <button class="iconbtn" data-act="go" data-hash="#/settings" title="${esc(tip("Settings", "Ctrl+,"))}" aria-label="Settings">⚙</button>
  </header>`;
}

function renderPath() {
  const c = counts();
  const days = S.progress.testDate ? daysUntil(S.progress.testDate.date) : null;
  const dayText = days == null ? "Set a test date" : days === 0 ? "Test is today" : days > 0 ? `Test in ${days} day${days === 1 ? "" : "s"}` : `Test date was ${-days} day${days === -1 ? "" : "s"} ago`;
  const f = S.filter;
  const note = localStorage.getItem("bcgx.note") ? "" : `<div class="note"><div>Saved on this device. In Settings, paste an Anthropic key for Review and case grading, and a passphrase (12+ characters) if you want progress on your phone and laptop. The first passphrase claims the cloud store. The real DSF test has no AI and no autocomplete.</div><button class="btn small" data-act="dismiss-note">Dismiss</button></div>`;
  const groups = S.bank.groups.map((g) => {
    let items = groupItems(g.id).filter((q) => {
      if (f.q) {
        const hay = (q.code + " " + q.title + " " + (q.prompt || "")).toLowerCase();
        if (!hay.includes(f.q.toLowerCase())) return false;
      }
      if (q.type === "reading") return f.diff === "all" && (f.status === "all" || (f.status === "read" ? statusOf(q.id) === "read" : f.status === "not_started" ? statusOf(q.id) !== "read" : true));
      if (f.diff !== "all" && q.difficulty !== f.diff) return false;
      const st = statusOf(q.id);
      if (f.status !== "all" && f.status !== st) return false;
      return true;
    });
    if (!items.length) return "";
    const graded = groupItems(g.id).filter((q) => q.type !== "reading");
    const solved = graded.filter((q) => statusOf(q.id) === "solved").length;
    const rows = items.map((q) => {
      const st = statusOf(q.id);
      const label = q.type === "reading" ? (st === "read" ? "read" : "unread") : st.replace("_", " ");
      return `<button class="row" data-act="open" data-id="${esc(q.id)}">
        <span class="code">${esc(q.code)}</span>
        <span><span class="title">${esc(q.title)}</span></span>
        <span class="side"><span class="dot ${esc(st)}"></span><span class="pill">${q.type === "reading" ? "Read" : esc(q.difficulty)}</span><span class="pill">${esc(label)}</span></span>
      </button>`;
    }).join("");
    return `<section class="group"><h2>${esc(g.title)}</h2><div class="meta">${esc(g.blurb)} · ${solved}/${graded.length} solved</div><div class="meter"><i style="width:${graded.length ? (100 * solved / graded.length) : 0}%"></i></div>${rows}</section>`;
  }).join("");
  const mock = activeMock();
  return `${topbar("")}
  <main class="lobby">
    <div class="lobby-head">
      <div>
        <h1>Practice path</h1>
        <p class="sub">CodeSignal-style tasks for the BCG X Data Science Framework. Unofficial.</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn primary" data-act="continue">Continue</button>
        <button class="btn" data-act="go" data-hash="#/mock">${mock ? "Resume mock" : "Mock test"}</button>
        <button class="btn" data-act="go" data-hash="#/sheet" title="${esc(tip("Cheat sheet", "Ctrl+Alt+C"))}">${face("Cheat sheet", "Ctrl+Alt+C")}</button>
      </div>
    </div>
    ${note}
    <div class="stats">
      <div class="stat"><b>${c.solved}/${c.total}</b><span>solved</span></div>
      <div class="stat"><b>${c.attempted}</b><span>attempted</span></div>
      <div class="stat"><b>${c.todo}</b><span>not started</span></div>
      <div class="stat"><b>${c.read}/${c.readings}</b><span>readings</span></div>
      <div class="stat"><b>${esc(dayText)}</b><span>countdown</span></div>
    </div>
    <div class="meter"><i style="width:${c.total ? (100 * c.solved / c.total) : 0}%"></i></div>
    <div class="filters">
      <input class="search" placeholder="Filter tasks" value="${esc(f.q)}" data-act="filter-q">
      <select data-act="filter-diff">
        ${["all", "E", "M", "H"].map((d) => `<option value="${d}" ${f.diff === d ? "selected" : ""}>${d === "all" ? "All levels" : d}</option>`).join("")}
      </select>
      <select data-act="filter-status">
        ${[["all", "All statuses"], ["not_started", "Not started"], ["attempted", "Attempted"], ["solved", "Solved"], ["read", "Readings read"], ["not_started", ""]].slice(0, 5).map(([v, l]) => `<option value="${v}" ${f.status === v ? "selected" : ""}>${l}</option>`).join("")}
      </select>
    </div>
    ${groups || `<p class="empty">Nothing matches those filters.</p>`}
    <p class="foot" id="sync-label">${esc(S.sync.detail)}</p>
  </main>`;
}

function navPills(q) {
  let items, current = q && q.id;
  if (S.mode === "mock" || S.mode === "review") {
    const m = S.mode === "review" ? S.progress.mocks.find((x) => x.id === S.reviewId) : activeMock();
    items = (m ? m.questionIds : []).map((id, i) => ({ id, label: String(i + 1), q: byId(id) }));
  } else if (q) {
    items = groupItems(q.group).map((item) => ({ id: item.id, label: item.code, q: item }));
  } else items = [];
  return items.map((item) => {
    const st = item.q ? statusOf(item.q.id) : "";
    const cls = [item.id === current ? "on" : "", st === "solved" || st === "read" ? "solved" : "", st === "attempted" ? "attempted" : ""].filter(Boolean).join(" ");
    return `<button class="${cls}" data-act="nav" data-id="${esc(item.id)}">${esc(item.label)}</button>`;
  }).join("");
}

function leftBody(q) {
  if (S.leftTab === "solution") {
    if (q.type === "case") {
      return `<div class="prose"><h1>What a strong answer covers</h1>${renderMarkdown(q.outline || "")}</div>`;
    }
    const code = q.solution || q.answer || "";
    return `<div class="prose"><h1>Solution</h1><pre class="codeblock"><code>${esc(q.type === "numeric" ? String(q.answer) : q.type === "mcq" ? q.correct.join(", ") : code)}</code></pre>${q.explanation ? renderMarkdown(q.explanation) : ""}</div>`;
  }
  if (S.leftTab === "history") {
    const r = rec(q.id);
    const hist = (r && r.history) || [];
    if (!hist.length) return `<div class="prose"><p class="empty">Submit to keep a restore point. Run tests does not.</p></div>`;
    return `<div class="prose">${hist.slice().reverse().map((h, i) => `<div class="card"><div>${new Date(h.at).toLocaleString()} · ${h.passed ? "passed" : "not passed"}</div><button class="btn small" data-act="restore" data-i="${hist.length - 1 - i}">Restore</button></div>`).join("")}</div>`;
  }
  if (S.leftTab === "notes") {
    const notes = (rec(q.id) && rec(q.id).notes) || "";
    return `<textarea class="casebox" data-act="notes" placeholder="Notes stay with this task">${esc(notes)}</textarea>`;
  }
  if (S.leftTab === "rules") {
    return `<div class="prose"><h1>Rules</h1><p>Run tests checks your current code and does not by itself record a restore point. Submit does, and it is what counts in the mock test. This trainer grades coding tasks all-or-nothing: every test must pass. The real assessment may score differently. Numeric answers in this trainer are accepted within 0.001 of the three-decimal value. Select-all items must match exactly. Written cases are graded only by the reviewer.</p><p>Autocomplete is off during this trainer's mock.</p><p>This trainer preloads pandas and numpy as <code>pd</code> and <code>np</code>, and loads scikit-learn before a run so <code>import sklearn</code> does not wait on a download. The real platform may not. Import them yourself there.</p></div>`;
  }
  if (S.leftTab === "info") {
    const g = S.bank.groups.find((x) => x.id === q.group);
    const reading = groupItems(q.group).find((x) => x.type === "reading");
    return `<div class="prose"><h1>Info</h1><p>${esc(g ? g.blurb : "")}</p>
      ${reading ? `<p><button class="btn" data-act="open" data-id="${esc(reading.id)}">Open the ${esc(reading.code)} refresher</button></p>` : ""}
      <p><button class="btn" data-act="go" data-hash="#/sheet">Cheat sheet</button></p></div>`;
  }
  if (S.leftTab === "review") {
    return `<div class="prose"><h1>Review</h1>
      ${S.ai.loading ? `<p>Asking Claude…</p>` : ""}
      ${S.ai.error ? `<div class="banner bad">${esc(S.ai.error)}</div>` : ""}
      ${S.ai.text ? renderMarkdown(S.ai.text) : `<p class="empty">Review sends the task, your code, and the latest run to Anthropic. Hints come first. Tick “include a fix” in the gear menu if you want corrected code.</p><p><button class="btn" data-act="review">Ask AI / Review my code</button></p>`}
    </div>`;
  }
  const cheat = q.cheatsheet ? `<div class="cheat"><strong>Syntax</strong><pre class="codeblock"><code>${esc(q.cheatsheet)}</code></pre></div>` : "";
  return `<div class="prose"><h1>${esc(q.code)} · ${esc(q.title)}</h1><p class="sub">${esc(q.difficulty)} · ${esc(q.type)}</p>${renderMarkdown(q.prompt || "")}${examplesHtml(q)}${cheat}</div>`;
}

function examplesHtml(q) {
  const examples = q.examples || [];
  if (!examples.length || (q.type !== "python" && q.type !== "sql")) return "";
  const blocks = examples.map((ex, i) => `<section class="example">
      ${examples.length > 1 ? `<p class="sub">Example ${i + 1}</p>` : ""}
      <div class="ex-label">Input</div>
      <pre class="codeblock"><code>${esc(ex.input || "")}</code></pre>
      <div class="ex-label">Output</div>
      <pre class="codeblock"><code>${esc(ex.output || "")}</code></pre>
      ${ex.note ? `<p class="sub">${esc(ex.note)}</p>` : ""}
    </section>`).join("");
  return `<div class="examples"><strong>${examples.length > 1 ? "Examples" : "Example"}</strong>${blocks}</div>`;
}

function answerWidget(q) {
  const r = rec(q.id) || {};
  const mockAns = S.mode === "mock" || S.mode === "review" ? (((S.mode === "review" ? S.progress.mocks.find((m) => m.id === S.reviewId) : activeMock()) || {}).answers || {})[q.id] || {} : null;
  if (q.type === "numeric") {
    const val = mockAns ? (mockAns.answer || "") : (r.answer || "");
    return `<div class="prose"><h1>Your answer</h1><p>Round to 3 decimals.</p><input class="answerbox" inputmode="decimal" data-act="numeric" value="${esc(val)}" ${S.mode === "review" ? "readonly" : ""}></div>`;
  }
  if (q.type === "mcq") {
    const picked = new Set(mockAns ? (mockAns.mcq || []) : (r.mcq || []));
    return `<div class="prose"><h1>${q.multi ? "Select all that apply" : "Choose one"}</h1>
      ${q.choices.map((c) => `<label class="choice"><input type="${q.multi ? "checkbox" : "radio"}" name="mcq" data-act="mcq" value="${esc(c.id)}" ${picked.has(c.id) ? "checked" : ""} ${S.mode === "review" ? "disabled" : ""}><span>${esc(c.text)}</span></label>`).join("")}
    </div>`;
  }
  if (q.type === "case") {
    const val = mockAns ? (mockAns.caseText || "") : (r.caseText || "");
    return `<textarea class="casebox" data-act="case" placeholder="Write the case. Submit grades it when an API key is set." ${S.mode === "review" ? "readonly" : ""}>${esc(val)}</textarea>`;
  }
  return `<div id="editor-host" class="editor-host" data-pane="code"></div>`;
}

function consoleBlock() {
  const run = S.run;
  const out = [run.stdout, run.stderr].filter(Boolean).join("\n");
  const err = [run.error, run.traceback].filter(Boolean).join("\n\n");
  let html = "";
  if (run.running || run.status) html += `<div class="empty">${esc(run.status || "Starting Python…")}</div>`;
  if (out || err) {
    html += `<div class="console">${out ? esc(out) : ""}${err ? `<div class="err">${esc(err)}</div>` : ""}</div>`;
  } else if (!run.running && !run.status) {
    const loading = pythonSurface() && !S.runtimeReady;
    html += loading
      ? `<div class="empty">${esc(S.runtimeStatus || "Loading Python, pandas, NumPy, scikit-learn…")}</div>`
      : `<div class="empty">Console output appears here. pandas and numpy are already imported as pd and np. scikit-learn is loaded.</div>`;
  }
  return html;
}

function testsHtml() {
  const run = S.run;
  if (S.bottomTab === "console") return consoleBlock();
  if (run.running && !run.tests.length) return `<div class="empty">${esc(run.status || "Starting Python…")}</div>`;
  if (!run.tests.length && run.error) return `<div class="banner bad">${esc(run.error)}</div>${run.traceback ? `<pre class="console err">${esc(run.traceback)}</pre>` : ""}`;
  if (!run.tests.length && !run.error) return `<div class="empty">Run tests to see results. Submit records a restore point.</div>`;
  const head = run.passed == null ? "" : `<div class="banner ${run.passed ? "ok" : "bad"}">${run.passed ? "All tests passed" : "Some tests failed"}</div>`;
  const rows = run.tests.map((t, i) => {
    const parts = splitDiff(t.message || "");
    return `<article class="testrow ${t.passed ? "pass" : "fail"}">
      <header><span class="mark">${t.passed ? "✓" : "▲"}</span><span>Test ${i + 1}</span><span class="sub">${esc(t.name)}</span></header>
      ${!t.passed && parts ? `<div class="diff"><div><b>EXPECTED</b><pre>${esc(parts.expected)}</pre></div><div><b>ACTUAL</b><pre>${esc(parts.actual)}</pre></div></div>` : ""}
      ${!t.passed && !parts && t.message ? `<div class="diff"><pre>${esc(t.message)}</pre></div>` : ""}
    </article>`;
  }).join("");
  const printed = (run.stdout || run.stderr) ? `<p class="sub conlabel">Console</p>${consoleBlock()}` : "";
  return head + rows + printed;
}

function splitDiff(message) {
  const i = message.indexOf("EXPECTED");
  const j = message.indexOf("ACTUAL");
  if (i >= 0 && j > i) return { expected: message.slice(i + 8, j).trim(), actual: message.slice(j + 6).trim() };
  return null;
}

function renderIde(q) {
  const hideSolution = q.type === "reading" || (liveMockHidesSolution(q) && S.mode !== "review");
  const tabs = [
    ["description", "Description"],
    !hideSolution && ["solution", "Solution"],
    q.type !== "reading" && ["history", "History"],
    ["notes", "Notes"],
    ["rules", "Rules"],
    ["info", "Info"],
    S.mode !== "mock" && S.mode !== "review" && ["review", "Review"],
  ].filter(Boolean);
  if (!tabs.some((t) => t[0] === S.leftTab)) S.leftTab = "description";
  const coding = q.type === "python" || q.type === "sql";
  const m = S.mode === "mock" ? activeMock() : null;
  const remain = m ? m.endsAt - Date.now() : 0;
  const timer = m ? `<div class="timer ${remain < 60000 ? "late" : remain < 300000 ? "warn" : ""}" id="timer">${formatClock(remain)}</div>` : "";
  const passedN = S.run.tests.filter((t) => t.passed).length;
  const testLabel = S.run.tests.length ? `Tests ${passedN}/${S.run.tests.length}` : "Tests";
  return `${topbar(`<div class="qnav">${navPills(q)}</div><button class="iconbtn" data-act="jump" aria-label="Jump">#</button>${timer}`)}
  <div class="mobile-switch">
    <button data-pane-btn="task" data-act="pane" data-pane="task">Description</button>
    <button data-pane-btn="code" data-act="pane" data-pane="code">${coding ? "Code" : "Answer"}</button>
    <button data-pane-btn="tests" data-act="pane" data-pane="tests">Tests</button>
  </div>
  <div class="ide" id="ide" style="${splitHtml()}">
    <section class="task-col" data-pane="task">
      <div class="tabs">${tabs.map(([id, label]) => `<button data-act="left" data-tab="${id}" class="${S.leftTab === id ? "on" : ""}">${label}</button>`).join("")}</div>
      <div class="scroll" id="left-body">${leftBody(q)}</div>
    </section>
    <div class="vsplit" data-split="v"></div>
    <section class="work-col">
      <div data-pane="code" style="display:flex;flex-direction:column;flex:1;min-height:0">
        <div class="editor-tools">
          <span class="langpill" ${q.type === "python" ? "data-py-pill" : ""}>${q.type === "sql" ? "SQLite" : q.type === "python" ? esc(pyPill()) : q.type}</span>
          ${S.mode === "mock" ? `<span class="langpill">Autocomplete off</span>` : ""}
          <span class="run-status" id="run-status"></span>
          <span class="spacer"></span>
          ${coding ? `<button class="btn small" data-act="format" title="${esc(tip("Format", "Shift+Alt+F"))}">Format</button><button class="btn small" data-act="reset" title="${esc(tip("Reset to starter", "Ctrl+Alt+Backspace"))}">Reset</button>` : ""}
          <button class="btn small" data-act="gear" title="Editor settings">Gear</button>
          <button class="btn" data-act="run" title="${esc(tip("Run tests", "Ctrl+Enter"))}" ${S.run.running ? "disabled" : ""}>${S.run.running ? "Running" : face("Run tests", "Ctrl+Enter")}</button>
          ${S.mode === "practice" ? `<button class="btn small" data-act="review" title="${esc(tip("Ask Claude", "Ctrl+Alt+R"))}">Review</button>` : ""}
          ${S.run.running ? `<button class="btn" data-act="stop-run" title="${esc(tip("Stop", "Esc"))}">Stop</button>` : `<button class="btn primary" data-act="submit" title="${esc(tip("Submit", "Ctrl+Shift+Enter"))}">${face("Submit", "Ctrl+Shift+Enter")}</button>`}
        </div>
        ${answerWidget(q)}
      </div>
      <div class="hsplit" data-split="h"></div>
      <section class="tests" data-pane="tests">
        <div class="tabs">
          <button data-act="bottom" data-tab="tests" title="${esc(tip("Tests", "Ctrl+`"))}" class="${S.bottomTab === "tests" ? "on" : ""}">${testLabel}</button>
          <button data-act="bottom" data-tab="console" title="${esc(tip("Console", "Ctrl+`"))}" class="${S.bottomTab === "console" ? "on" : ""}">Console</button>
        </div>
        <div class="body" id="bottom-body">${testsHtml()}</div>
      </section>
    </section>
  </div>
  ${S.gear ? gearHtml() : ""}
  ${S.jump ? jumpHtml() : ""}
  <div class="helper" id="helper">
    ${["Tab", "(", ")", "[", "]", "{", "}", ":", "'", "\"", "_", "=", ".", ",", "df[]", "pd.", "np."].map((k) => `<button type="button" data-act="ins" data-key="${esc(k)}">${esc(k)}</button>`).join("")}
  </div>`;
}

function gearHtml() {
  const s = S.settings;
  return `<div class="gearpop">
    <div class="field"><label>Theme</label><select data-act="theme"><option value="dark" ${s.theme !== "light" ? "selected" : ""}>Dark</option><option value="light" ${s.theme === "light" ? "selected" : ""}>Light</option></select></div>
    <div class="field"><label>Font size ${s.fontSize}px</label><input type="range" min="12" max="22" value="${s.fontSize}" data-act="font"></div>
    <div class="field"><label>Tab size</label><select data-act="tabs"><option value="2" ${s.tabSize == 2 ? "selected" : ""}>2</option><option value="4" ${s.tabSize != 2 ? "selected" : ""}>4</option></select></div>
    <label class="choice"><input type="checkbox" data-act="ac" ${s.autocomplete ? "checked" : ""}><span>Autocomplete in practice. Always off in the mock.</span></label>
    <label class="choice"><input type="checkbox" data-act="fix" ${s.showFix ? "checked" : ""}><span>Review may include a corrected solution.</span></label>
    <button class="btn" data-act="go" data-hash="#/settings">API key, sync, test date</button>
  </div>`;
}

function jumpHtml() {
  const blocks = S.bank.groups.map((g) => `<h3>${esc(g.title)}</h3>` + groupItems(g.id).map((q) => `<button class="row" data-act="open" data-id="${esc(q.id)}"><span class="code">${esc(q.code)}</span><span>${esc(q.title)}</span><span class="pill">${esc(statusOf(q.id).replace("_", " "))}</span></button>`).join("")).join("");
  return `<div class="overlay" data-act="close-jump"><div class="drawer" data-act="noop">${blocks}</div></div>`;
}

function renderReading(q) {
  const items = flat();
  const idx = items.findIndex((x) => x.id === q.id);
  const prev = idx > 0 ? items[idx - 1] : null;
  const next = idx >= 0 && idx < items.length - 1 ? items[idx + 1] : null;
  const st = statusOf(q.id);
  return `${topbar(`<div class="qnav">${navPills(q)}</div>`)}
  <div class="reading-wrap"><article class="reading prose">
    <p class="sub">${esc(q.code)} · about ${q.minutes || 8} min · ${st === "read" ? "read" : "unread"}</p>
    <h1>${esc(q.title)}</h1>
    ${renderMarkdown(q.body || q.prompt || "", { tryIt: true })}
    <p><button class="btn primary" data-act="mark-read" data-id="${esc(q.id)}">${st === "read" ? "Read" : "Mark as read"}</button></p>
    <p style="display:flex;gap:8px;flex-wrap:wrap">
      ${prev ? `<button class="btn" data-act="open" data-id="${esc(prev.id)}">Prev ${esc(prev.code)}</button>` : ""}
      ${next ? `<button class="btn" data-act="open" data-id="${esc(next.id)}">Next ${esc(next.code)}</button>` : ""}
    </p>
  </article></div>`;
}

const PY_KW = new Set("import from as def return for in if else elif and or not lambda with True False None class try except while break continue pass yield".split(" "));
const SQL_KW = new Set("SELECT FROM WHERE GROUP BY HAVING JOIN LEFT RIGHT INNER OUTER ON AS WITH ORDER ASC DESC AND OR CASE WHEN THEN ELSE END NULL IS NOT OVER PARTITION ROWS BETWEEN UNBOUNDED PRECEDING CURRENT FOLLOWING ROW_NUMBER RANK DENSE_RANK LAG LEAD SUM COUNT ROUND COALESCE DISTINCT INSERT INTO VALUES CREATE TABLE".split(" "));

function highlight(code, lang) {
  const kw = lang === "sql" ? SQL_KW : PY_KW;
  let out = "";
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    if (lang !== "sql" && c === "#") {
      let j = i;
      while (j < n && code[j] !== "\n") j += 1;
      out += `<span class="cmt">${esc(code.slice(i, j))}</span>`;
      i = j;
      continue;
    }
    if (lang === "sql" && c === "-" && code[i + 1] === "-") {
      let j = i;
      while (j < n && code[j] !== "\n") j += 1;
      out += `<span class="cmt">${esc(code.slice(i, j))}</span>`;
      i = j;
      continue;
    }
    if (c === "'" || c === '"') {
      const q = c;
      let j = i + 1;
      while (j < n && code[j] !== q) j += code[j] === "\\" ? 2 : 1;
      if (j < n) j += 1;
      out += `<span class="str">${esc(code.slice(i, j))}</span>`;
      i = j;
      continue;
    }
    const prev = i ? code[i - 1] : "";
    if (c >= "0" && c <= "9" && !/[A-Za-z_]/.test(prev)) {
      let j = i;
      while (j < n && /[0-9.]/.test(code[j])) j += 1;
      out += `<span class="num">${esc(code.slice(i, j))}</span>`;
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(code[j])) j += 1;
      const word = code.slice(i, j);
      const key = lang === "sql" ? word.toUpperCase() : word;
      out += kw.has(key) ? `<span class="kw">${esc(word)}</span>` : esc(word);
      i = j;
      continue;
    }
    out += esc(c);
    i += 1;
  }
  return out;
}

function renderSheet() {
  const doc = S.sheet || { title: "Cheat sheet", intro: "", sections: [] };
  const q = (S._sheetQ || "").toLowerCase().trim();
  const sections = (doc.sections || []).map((sec) => ({
    ...sec,
    items: sec.items.filter((e) => !q || (sec.title + " " + e.title + " " + e.code).toLowerCase().includes(q)),
  })).filter((sec) => sec.items.length);
  const toc = sections.map((sec) => `<button type="button" data-act="sheet-jump" data-id="sec-${esc(sec.id)}">${esc(sec.title)}</button>`).join("");
  const body = sections.map((sec) => {
    const cards = sec.items.map((e) => {
      const block = e.lang === "text"
        ? `<p class="snip-text">${esc(e.code)}</p>`
        : `<pre class="codeblock"><code>${highlight(e.code, e.lang)}</code></pre>`;
      return `<article class="snip" id="${esc(e.id)}"><header><h3>${esc(e.title)}</h3><button type="button" class="btn small copybtn" data-act="copy-snip">Copy</button></header>${block}</article>`;
    }).join("");
    return `<section class="sheet-sec" id="sec-${esc(sec.id)}"><h2>${esc(sec.title)}</h2><div class="snip-grid">${cards}</div></section>`;
  }).join("") || `<p class="empty">No matches.</p>`;
  return `${topbar("")}<div class="sheet-screen">
    <div class="sheet-head">
      <h1>${esc(doc.title || "Cheat sheet")}</h1>
      <p class="sub">${esc(doc.intro || "")}</p>
      <div class="sheet-actions">
        <button class="btn primary" data-act="download-pdf">Download PDF</button>
        <button class="btn" data-act="print-sheet">Print</button>
        <button class="btn" data-act="download-md">Markdown</button>
      </div>
      <div class="filters sheet-search"><input placeholder="Filter snippets: qcut, ROC, LAG…" value="${esc(S._sheetQ || "")}" data-act="sheet-q" aria-label="Filter snippets"></div>
    </div>
    <div class="sheet-layout">
      <nav class="sheet-toc" aria-label="Sections">${toc}</nav>
      <div class="sheet-main">${body}</div>
    </div>
  </div>`;
}

function saveBlob(filename, blob) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function downloadPdf() {
  const res = await fetch("cheatsheet.pdf");
  if (!res.ok) throw new Error("PDF unavailable");
  saveBlob("BCGX-DS-cheatsheet.pdf", new Blob([await res.arrayBuffer()], { type: "application/pdf" }));
}

function downloadMarkdown() {
  const doc = S.sheet || { title: "Cheat sheet", intro: "", sections: [] };
  const lines = [`# ${doc.title}`, "", doc.intro || "", ""];
  for (const sec of doc.sections || []) {
    lines.push(`## ${sec.title}`, "");
    for (const item of sec.items) {
      lines.push(`### ${item.title}`, "");
      if (item.lang === "text") lines.push(item.code, "");
      else lines.push("```" + (item.lang === "sql" ? "sql" : "python"), item.code, "```", "");
    }
  }
  saveBlob("BCGX-DS-cheatsheet.md", new Blob([lines.join("\n")], { type: "text/markdown" }));
}

function copySnippet(btn) {
  const root = btn.closest(".snip");
  const node = root.querySelector("code") || root.querySelector(".snip-text");
  const text = node ? node.textContent : "";
  const done = () => {
    btn.textContent = "Copied";
    setTimeout(() => { btn.textContent = "Copy"; }, 1200);
  };
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    done();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(fallback);
  else fallback();
}

function renderSettings() {
  const s = S.settings;
  const date = (S.progress.testDate && S.progress.testDate.date) || "";
  const days = date ? daysUntil(date) : null;
  return `${topbar("")}<div class="settings-wrap">
    <h1>Settings</h1>
    <p class="sub" id="sync-label">${esc(S.sync.detail)}</p>
    <div class="field"><label>Test date</label><input type="date" value="${esc(date)}" data-act="testdate"><span class="sub">${days == null ? "Used only for the countdown on the path." : days >= 0 ? days + " days until the test." : "That date has passed."}</span></div>
    <div class="field"><label>Anthropic API key</label><input type="password" autocomplete="off" placeholder="sk-ant-…" data-act="apikey" value="${apiKey() ? "••••••••••••" : ""}"><span class="sub">Stored only in localStorage on this device. Sent only to api.anthropic.com. Never synced.</span></div>
    <div class="field"><label>Model id</label><input data-act="model" value="${esc(s.model || DEFAULT_MODEL)}"><span class="sub">Default is claude-sonnet-5-5. Edit if Anthropic renames it.</span></div>
    <div class="field"><label>Sync passphrase (12+ characters)</label><input type="password" autocomplete="off" data-act="pass" placeholder="Choose carefully" value="${passphrase() ? "••••••••••••" : ""}"><span class="sub">The first successful save claims the cloud store. Later devices must use the same passphrase. Progress only — not the API key.</span></div>
    <p style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn primary" data-act="save-settings">Save and sync</button>
      <button class="btn" data-act="sync-now">Sync now</button>
    </p>
    <p class="foot">Editor font, theme, and autocomplete are in the gear menu inside a task. They stay on this device.</p>
  </div>`;
}

function renderMockLobby() {
  const m = activeMock();
  if (m) {
    S.mode = "mock";
    const q = byId(m.cursor || m.questionIds[0]);
    return renderIde(q);
  }
  const past = (S.progress.mocks || []).filter((x) => x.status === "review");
  return `${topbar("")}<div class="mock-wrap">
    <h1>Mock test</h1>
    <p>90 minutes. 2 numeric statistics, 6 multiple choice, 3 coding tasks (data collection, data processing, model development). Score is an approximation of a 200–600 scale, not an official CodeSignal result.</p>
    <ul>
      <li>Submit each task. Run tests does not score it.</li>
      <li>No solution tab, no Review, autocomplete off.</li>
      <li>The clock does not pause.</li>
    </ul>
    <button class="btn primary" data-act="start-mock">Start</button>
    <h2>Past attempts</h2>
    ${past.length ? past.slice().reverse().map((x) => `<button class="row" data-act="go" data-hash="#/mock/review/${esc(x.id)}"><span>${new Date(x.finishedAt || x.startedAt).toLocaleString()}</span><span class="pill">${x.score}</span></button>`).join("") : `<p class="empty">None yet.</p>`}
  </div>`;
}

function renderReview(id) {
  const m = S.progress.mocks.find((x) => x.id === id);
  if (!m) return `${topbar("")}<div class="mock-wrap"><p>That attempt is not on this device.</p></div>`;
  S.reviewId = id;
  const rows = m.questionIds.map((qid, i) => {
    const q = byId(qid);
    const ans = (m.answers || {})[qid] || {};
    return `<button class="row" data-act="review-open" data-id="${esc(qid)}"><span class="code">${i + 1}</span><span>${esc(q ? q.title : qid)}</span><span class="pill">${ans.submitted ? (ans.passed ? "passed" : "not passed") : "not submitted"}</span></button>`;
  }).join("");
  return `${topbar("")}<div class="mock-wrap">
    <p class="sub">Approximate CodeSignal-style score</p>
    <div class="score">${m.score}</div>
    <p>${m.earned} / ${m.max} points before scaling. 200 + 400 × points/700.</p>
    ${rows}
    <p><button class="btn" data-act="go" data-hash="#/mock" title="${esc(tip("Back", "Ctrl+B"))}">Back</button></p>
  </div>`;
}

function renderSandbox() {
  if (!S.scratch) S.scratch = { code: "print('hello')\n", lang: "python", back: "#/" };
  S.bottomTab = "console";
  return `${topbar("")}
  <div class="ide sandbox" id="ide">
    <section class="work-col">
      <div class="editor-tools">
        <button class="btn small" data-act="back-scratch" title="${esc(tip("Back", "Ctrl+B"))}">Back</button>
        <span class="langpill" ${S.scratch.lang === "sql" ? "" : "data-py-pill"}>${S.scratch.lang === "sql" ? "SQLite" : esc(pyPill())}</span>
        <span class="run-status" id="run-status"></span>
        <span class="spacer"></span>
        <button class="btn small" data-act="format" title="${esc(tip("Format", "Shift+Alt+F"))}">Format</button>
        <button class="btn" data-act="run-scratch" title="${esc(tip("Run", "Ctrl+Enter"))}" ${S.run.running ? "disabled" : ""}>${S.run.running ? "Running" : face("Run", "Ctrl+Enter")}</button>
        ${S.run.running ? `<button class="btn" data-act="stop-run" title="${esc(tip("Stop", "Esc"))}">Stop</button>` : ""}
      </div>
      <div id="editor-host" class="editor-host" data-pane="code"></div>
      <section class="tests" data-pane="output">
        <div class="tabs"><button class="on" data-act="bottom" data-tab="console">Console</button></div>
        <div class="body" id="bottom-body">${testsHtml()}</div>
      </section>
    </section>
  </div>
  <div class="helper" id="helper">${["Tab", "(", ")", "[", "]", "{", "}", ":", "'", "\"", "=", ".", "pd.", "np."].map((k) => `<button type="button" data-act="ins" data-key="${esc(k)}">${esc(k)}</button>`).join("")}</div>`;
}

function render() {
  flushCode();
  if (S.editor) {
    S.editor.destroy();
    S.editor = null;
    S.editorKey = "";
    S.editorFor = null;
  }
  const root = document.getElementById("app");
  if (!S.bank) {
    root.innerHTML = `${topbar("")}<main class="lobby"><p>Loading tasks…</p></main>`;
    return;
  }
  const route = parseRoute();
  if (route.name === "path") {
    S.mode = "practice";
    root.innerHTML = renderPath();
    return;
  }
  if (route.name === "sheet") {
    if (route.anchor && route.anchor !== S._sheetAnchor) {
      S._sheetQ = "";
      S._sheetAnchor = route.anchor;
    }
    if (!route.anchor) S._sheetAnchor = "";
    root.innerHTML = renderSheet();
    if (route.anchor && !(S._sheetQ || "").trim()) document.getElementById(route.anchor)?.scrollIntoView({ block: "start" });
    return;
  }
  if (route.name === "settings") {
    root.innerHTML = renderSettings();
    return;
  }
  if (route.name === "mock") {
    root.innerHTML = renderMockLobby();
    mountEditor(S.mode === "mock" ? byId((activeMock() || {}).cursor || (activeMock() || {}).questionIds?.[0]) : null);
    applyPanes();
    startRuntime();
    return;
  }
  if (route.name === "review") {
    S.mode = "review";
    root.innerHTML = renderReview(route.id);
    return;
  }
  if (route.name === "sandbox") {
    root.innerHTML = renderSandbox();
    mountEditor(null);
    applyPanes();
    startRuntime();
    return;
  }
  const q = byId(route.id);
  if (!q) {
    root.innerHTML = `${topbar("")}<main class="lobby"><p>That task is not in the bank.</p></main>`;
    return;
  }
  if (q.type === "reading") {
    root.innerHTML = renderReading(q);
    return;
  }
  if (S.mode !== "mock" && S.mode !== "review") S.mode = "practice";
  root.innerHTML = renderIde(q);
  mountEditor(q);
  applyPanes();
  bindSplits();
  startRuntime();
}

function formatClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function paintBottom() {
  const el = document.getElementById("bottom-body");
  if (el) el.innerHTML = testsHtml();
  const tabs = document.querySelector(".tests .tabs");
  if (tabs) {
    const passedN = S.run.tests.filter((t) => t.passed).length;
    const label = S.run.tests.length ? `Tests ${passedN}/${S.run.tests.length}` : "Tests";
    const btn = tabs.querySelector('[data-tab="tests"]');
    if (btn) btn.textContent = label;
    tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.bottomTab));
  }
}

function paintChrome() {
  const running = !!S.run.running;
  document.querySelectorAll("[data-act=run], [data-act=run-scratch]").forEach((btn) => {
    btn.disabled = running;
    const name = btn.dataset.act === "run-scratch" ? "Run" : "Run tests";
    btn.innerHTML = running ? "Running" : face(name, "Ctrl+Enter");
    btn.title = tip(name, "Ctrl+Enter");
  });
  document.querySelectorAll("[data-act=submit]").forEach((btn) => {
    btn.disabled = running;
    btn.hidden = running;
  });
  const tools = document.querySelector(".editor-tools");
  if (tools) {
    let stop = tools.querySelector("[data-act=stop-run]");
    if (running && !stop) {
      stop = document.createElement("button");
      stop.type = "button";
      stop.className = "btn";
      stop.dataset.act = "stop-run";
      stop.title = tip("Stop", "Esc");
      stop.textContent = "Stop";
      const anchor = tools.querySelector("[data-act=run], [data-act=run-scratch]");
      if (anchor) anchor.after(stop);
      else tools.appendChild(stop);
    } else if (!running && stop) {
      stop.remove();
    }
  }
  const status = document.getElementById("run-status");
  if (status) status.textContent = running ? (S.run.status || "Starting Python…") : (S.run.status || runtimeLabel());
}

function pyPill() {
  return S.runtimeReady ? "Python 3 · pd, np, sklearn ready" : "Python 3";
}

function pythonSurface() {
  const route = parseRoute();
  if (route.name === "sandbox") return !S.scratch || S.scratch.lang !== "sql";
  if (route.name === "task") {
    const q = byId(route.id);
    return !!(q && q.type === "python");
  }
  if (route.name === "mock") {
    const m = activeMock();
    const q = m && byId(m.cursor || (m.questionIds || [])[0]);
    return !!(q && q.type === "python");
  }
  return false;
}

function startRuntime() {
  if (!pythonSurface()) return;
  ensureWorker();
  paintRuntime();
}

function runtimeLabel() {
  if (S.runtimeReady || !S.worker || !pythonSurface()) return "";
  return S.runtimeStatus || "Loading Python, pandas, NumPy, scikit-learn…";
}

function paintRuntime() {
  const label = pyPill();
  document.querySelectorAll("[data-py-pill]").forEach((el) => { el.textContent = label; });
  const status = document.getElementById("run-status");
  if (status && !S.run.running) status.textContent = S.run.status || runtimeLabel();
  if (!S.run.running && !S.run.stdout && !S.run.error && pythonSurface()) paintBottom();
}

function showOutput(kind) {
  S.bottomTab = kind === "console" ? "console" : "tests";
  const sandbox = document.getElementById("ide")?.classList.contains("sandbox");
  if (!sandbox && isNarrow()) S.mobilePane = "tests";
  applyPanes();
  paintBottom();
  paintChrome();
}

function onRuntimeMessage(ev) {
  const d = ev.data || {};
  if (d.type === "runtime") {
    S.runtimeReady = !!d.ready;
    if (d.ready) S.runtimeStatus = "";
    else if (d.message) S.runtimeStatus = d.message;
    if (S.run.running && d.phase === "preload") S.run.status = S.runtimeStatus;
    paintRuntime();
    return;
  }
  if (d.phase === "preload") {
    S.runtimeStatus = d.text || "Loading Python, pandas, NumPy, scikit-learn…";
    if (S.run.running) {
      S.run.status = S.runtimeStatus;
      paintBottom();
      paintChrome();
    } else paintRuntime();
  }
}

function ensureWorker() {
  if (S.worker) return S.worker;
  S.runtimeReady = false;
  S.runtimeStatus = "Loading Python, pandas, NumPy, scikit-learn…";
  const url = new URL("pyodide-worker.js", document.baseURI);
  S.worker = new Worker(url, { type: "module" });
  S.worker.addEventListener("message", onRuntimeMessage);
  return S.worker;
}

function stopRun(message) {
  if (S.worker) {
    S.worker.terminate();
    S.worker = null;
  }
  S.runtimeReady = false;
  S.runtimeStatus = "";
  S.run.running = false;
  S.run.status = "";
  if (message) {
    S.run.error = message;
    S.bottomTab = "console";
  }
  paintBottom();
  paintChrome();
}

function runSource({ source, tests, packages, timeoutMs, consoleOnly }) {
  const id = ++S.runSeq;
  const waiting = !S.runtimeReady;
  S.run = {
    id, running: true,
    status: waiting ? (S.runtimeStatus || "Loading Python, pandas, NumPy, scikit-learn…") : "Starting Python…",
    tests: [], stdout: "", stderr: "", error: "", traceback: "", passed: null,
  };
  const showConsole = consoleOnly || !(tests && tests.length);
  showOutput(showConsole ? "console" : "tests");
  const worker = ensureWorker();
  let timer = 0;
  let clockOn = false;
  const arm = () => {
    if (clockOn || S.run.id !== id) return;
    clockOn = true;
    timer = setTimeout(() => {
      if (S.run.id === id) stopRun("Timed out. The runtime was stopped. Run tests starts a fresh session.");
    }, timeoutMs || 20000);
  };
  const onMsg = (ev) => {
    if (!ev.data || ev.data.id !== id) return;
    const d = ev.data;
    if (d.type === "status") {
      S.run.status = d.text;
      paintBottom();
      paintChrome();
    } else if (d.type === "executing") {
      S.run.status = "Running…";
      arm();
      paintBottom();
      paintChrome();
    } else if (d.type === "result") {
      clearTimeout(timer);
      worker.removeEventListener("message", onMsg);
      const r = d.result || {};
      S.run.running = false;
      S.run.stdout = r.stdout || "";
      S.run.stderr = r.stderr || "";
      S.run.error = r.ok ? "" : (r.error || "Error");
      S.run.traceback = r.ok ? "" : (r.traceback || "");
      S.run.tests = r.tests || [];
      S.run.passed = !!(r.ok && S.run.tests.length && S.run.tests.every((t) => t.passed));
      S.run.status = "";
      if (!S.run.tests.length) S.bottomTab = "console";
      paintBottom();
      paintChrome();
      afterGrade(!!S._submitted);
      S._submitted = false;
    } else if (d.type === "error") {
      clearTimeout(timer);
      worker.removeEventListener("message", onMsg);
      S.run.running = false;
      S.run.error = d.message || "Runtime error";
      S.bottomTab = "console";
      paintBottom();
      paintChrome();
    }
  };
  worker.addEventListener("message", onMsg);
  worker.postMessage({ id, cmd: "run", source, tests: tests || [], packages: packages || [] });
}

function fullSource(q, code) {
  return `${S.harness}\n${q && q.prelude ? q.prelude : ""}\n${code}`;
}

function afterGrade(submitted) {
  const q = currentTask();
  if (!q) return;
  const passed = !!S.run.passed;
  if (S.mode === "mock") {
    const m = activeMock();
    if (!m) return;
    m.answers = m.answers || {};
    const prev = m.answers[q.id] || {};
    const ans = Object.assign({}, prev, {
      code: S.editor ? S.editor.get() : prev.code,
      answer: prev.answer,
      mcq: prev.mcq,
      caseText: prev.caseText,
      tests: S.run.tests.map((t) => ({ name: t.name, passed: t.passed, message: (t.message || "").slice(0, 500) })),
    });
    if (submitted) {
      ans.submitted = true;
      ans.passed = passed;
    }
    m.answers[q.id] = ans;
    m.updatedAt = Date.now();
    persistLocal();
    scheduleSync();
    return;
  }
  const patch = {
    code: S.editor ? S.editor.get() : (rec(q.id) || {}).code,
    lastTests: S.run.tests.map((t) => ({ name: t.name, passed: t.passed, message: (t.message || "").slice(0, 500) })),
    lastStdout: (S.run.stdout || "").slice(0, 2000),
    attempts: ((rec(q.id) || {}).attempts || 0) + 1,
  };
  if (q.type === "python" || q.type === "sql") {
    const prev = statusOf(q.id);
    patch.status = passed ? "solved" : (prev === "solved" ? "solved" : "attempted");
  }
  if (submitted) {
    const history = ((rec(q.id) || {}).history || []).concat([{ at: Date.now(), code: patch.code, passed }]);
    patch.history = history;
  }
  touch(q.id, patch);
  refreshPills();
}

function refreshPills() {
  const nav = document.querySelector(".qnav");
  const q = currentTask();
  if (nav && q) nav.innerHTML = navPills(q);
}

async function runCurrent(submitted) {
  flushCode();
  const q = currentTask();
  if (!q) return;
  if (q.type === "python" || q.type === "sql") {
    const code = S.editor ? S.editor.get() : codeFor(q);
    if (q.type === "sql") {
      await runSql(q, code, submitted);
      return;
    }
    runSource({ source: fullSource(q, code), tests: q.tests || [], packages: q.packages || [], timeoutMs: q.timeoutMs || 20000 });
    S._submitted = submitted;
    return;
  }
  gradeStructured(q, submitted);
}

const _origAfter = afterGrade;
function afterGradeWrapped(submitted) {
  _origAfter(submitted || S._submitted);
  S._submitted = false;
}

function gradeStructured(q, submitted) {
  const r = rec(q.id) || {};
  let passed = false;
  let message = "";
  if (q.type === "numeric") {
    const raw = (document.querySelector("[data-act=numeric]") || {}).value || r.answer || "";
    const x = Number(String(raw).trim());
    passed = Number.isFinite(x) && Math.abs(x - Number(q.answer)) <= (q.tolerance || 0.001) + 1e-9;
    message = passed ? "" : `EXPECTED ${Number(q.answer).toFixed(3)}\nACTUAL ${raw || "(blank)"}`;
    if (S.mode !== "mock") touch(q.id, { answer: raw, status: passed ? "solved" : "attempted" });
    else storeMockField(q, { answer: raw });
  } else if (q.type === "mcq") {
    const picked = [...document.querySelectorAll("[data-act=mcq]:checked")].map((el) => el.value);
    const a = picked.slice().sort().join(",");
    const b = q.correct.slice().sort().join(",");
    passed = a === b && picked.length > 0;
    message = passed ? "" : `EXPECTED ${q.correct.join(", ")}\nACTUAL ${picked.join(", ") || "(none)"}`;
    if (S.mode !== "mock") touch(q.id, { mcq: picked, status: passed ? "solved" : "attempted" });
    else storeMockField(q, { mcq: picked });
  } else if (q.type === "case") {
    const text = (document.querySelector("[data-act=case]") || {}).value || "";
    if (S.mode !== "mock") touch(q.id, { caseText: text, status: text.trim() ? "attempted" : "not_started" });
    if (submitted) gradeCase(q, text);
    S.run = { id: 0, running: false, status: "", tests: [], stdout: text ? "Draft saved." : "", stderr: "", error: "", traceback: "", passed: null };
    showOutput("console");
    return;
  }
  S.run = {
    id: 0, running: false, status: "", stdout: "", stderr: "", traceback: "",
    tests: [{ name: q.type === "mcq" ? "selection" : "value", passed, message }],
    error: "", passed,
  };
  if (submitted && S.mode === "mock") {
    const m = activeMock();
    if (m) {
      m.answers[q.id] = Object.assign({}, m.answers[q.id], { submitted: true, passed });
      m.updatedAt = Date.now();
      persistLocal();
      scheduleSync();
    }
  }
  showOutput("tests");
  refreshPills();
}

function storeMockField(q, patch) {
  const m = activeMock();
  if (!m) return;
  m.answers = m.answers || {};
  m.answers[q.id] = Object.assign({ code: "", answer: "", mcq: [], caseText: "" }, m.answers[q.id], patch);
  m.updatedAt = Date.now();
  persistLocal();
}

async function runSql(q, code, submitted) {
  S.run = { id: 0, running: true, status: "Loading SQL…", tests: [], stdout: "", stderr: "", error: "", traceback: "", passed: null };
  showOutput(q.scratch ? "console" : "tests");
  try {
    const SQL = await loadSql();
    const db = new SQL.Database();
    if (q.schema) db.run(q.schema);
    const res = db.exec(code);
    const table = res[res.length - 1] || { columns: [], values: [] };
    if (q.scratch) {
      S.run = {
        running: false, status: "", error: "", traceback: "", stderr: "", passed: null, tests: [],
        stdout: table.columns.length ? table.columns.join(" | ") + "\n" + table.values.map((r) => r.join(" | ")).join("\n") : "(no rows)",
      };
      db.close();
      S.bottomTab = "console";
      paintBottom();
      paintChrome();
      return;
    }
    const exp = q.expected;
    const colsOk = JSON.stringify(table.columns) === JSON.stringify(exp.columns);
    let rowsOk = colsOk && table.values.length === exp.rows.length;
    const bad = [];
    if (colsOk) {
      const gotRows = q.ordered === false ? table.values.slice().sort() : table.values;
      const expRows = q.ordered === false ? exp.rows.slice().sort() : exp.rows;
      rowsOk = gotRows.length === expRows.length;
      gotRows.forEach((row, i) => {
        const e = expRows[i] || [];
        const same = row.length === e.length && row.every((cell, k) => cellEqual(cell, e[k]));
        if (!same) {
          rowsOk = false;
          bad.push(`row ${i + 1}\nEXPECTED ${JSON.stringify(e)}\nACTUAL ${JSON.stringify(row)}`);
        }
      });
    }
    const passed = colsOk && rowsOk;
    const message = !colsOk
      ? `EXPECTED columns ${JSON.stringify(exp.columns)}\nACTUAL columns ${JSON.stringify(table.columns)}`
      : bad.join("\n");
    S.run = {
      running: false, status: "", error: "", traceback: "", stderr: "",
      stdout: table.columns.length ? table.columns.join(" | ") + "\n" + table.values.map((r) => r.join(" | ")).join("\n") : "(no rows)",
      tests: [{ name: "result table", passed, message }],
      passed,
    };
    db.close();
    afterGrade(submitted);
    paintBottom();
    paintChrome();
  } catch (err) {
    S.run = { running: false, status: "", tests: [], stdout: "", stderr: "", error: String(err.message || err), traceback: "", passed: false };
    S.bottomTab = "console";
    paintBottom();
    paintChrome();
  }
}

function cellEqual(a, b) {
  if (a == null || b == null) return a == null && b == null;
  if (typeof b === "number" || typeof a === "number") return Math.abs(Number(a) - Number(b)) <= 1e-6;
  return a === b;
}

async function loadSql() {
  if (S.sql) return S.sql;
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.js");
  S.sql = await window.initSqlJs({ locateFile: (f) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${f}` });
  return S.sql;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.initSqlJs && src.includes("sql")) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load " + src));
    document.head.appendChild(s);
  });
}

async function formatCode() {
  if (!S.editor) return;
  const code = S.editor.get();
  const id = ++S.runSeq;
  S.run.status = "Formatting…";
  paintBottom();
  paintChrome();
  const worker = ensureWorker();
  const onMsg = (ev) => {
    if (!ev.data || ev.data.id !== id) return;
    worker.removeEventListener("message", onMsg);
    if (ev.data.type === "formatted") {
      if (S.editor) S.editor.set(ev.data.code);
      S.run.status = "";
      paintBottom();
      paintChrome();
    }
    else if (ev.data.type === "error") {
      S.run.error = "Formatter: " + ev.data.message;
      S.run.status = "";
      S.bottomTab = "console";
      paintBottom();
      paintChrome();
    }
  };
  worker.addEventListener("message", onMsg);
  worker.postMessage({ id, cmd: "format", code });
}

function aiError(res, data) {
  const msg = (data && data.error && data.error.message) || "";
  if (res.status === 401) return "That API key was rejected. Check it in Settings.";
  if (res.status === 403) return msg || "Anthropic refused the browser request. Some organisations disable CORS.";
  if (res.status === 404) return "That model id was not found. Change it in Settings.";
  if (res.status === 429) return "Rate limited. Wait a moment and try again.";
  return msg || `Request failed (${res.status}).`;
}

async function callClaude(prompt) {
  const key = apiKey();
  if (!key) return { error: "Add your Anthropic API key in Settings. It stays in this browser and is not synced." };
  const model = (S.settings.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const body = { model, max_tokens: 2000, messages: [{ role: "user", content: prompt }] };
  const headers = {
    "content-type": "application/json",
    "x-api-key": key,
    "anthropic-version": ANTHROPIC_VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
  };
  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify(Object.assign({}, body, { output_config: { effort: "low" } })),
    });
  } catch {
    return { error: "Could not reach api.anthropic.com." };
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok && /output_config|effort/i.test(JSON.stringify(data || {}))) {
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(body) });
      data = await res.json();
    } catch {
      return { error: "Could not reach api.anthropic.com." };
    }
  }
  if (!res.ok) return { error: aiError(res, data) };
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n\n");
  if (!text) return { error: "The model returned no text. If a thinking block used the whole budget, try again." };
  return { text };
}

async function askReview() {
  const q = currentTask();
  if (!q || S.mode === "mock") return;
  S.leftTab = "review";
  S.ai = { loading: true, text: "", error: "" };
  document.getElementById("left-body").innerHTML = leftBody(q);
  const code = S.editor ? S.editor.get() : (rec(q.id) || {}).code || "";
  const tests = (S.run.tests || []).map((t) => `${t.passed ? "PASS" : "FAIL"} ${t.name} ${t.message || ""}`).join("\n").slice(0, 6000);
  const prompt = `You are a concise tutor for a principal-level data scientist practising the BCG X / CodeSignal Data Science Framework test (Python, pandas, numpy, scikit-learn).
Give hints first: what is wrong and the smallest next step. ${S.settings.showFix ? "The user asked for a corrected solution after the hints." : "Do not dump a full corrected solution."}
Keep it short.

Task ${q.code} — ${q.title}
${q.prompt || ""}

User code:
${code.slice(0, 8000)}

Latest run:
${S.run.error || ""}
${S.run.traceback || ""}
${tests}
stdout:
${(S.run.stdout || "").slice(0, 2000)}`;
  const out = await callClaude(prompt);
  S.ai = { loading: false, text: out.text || "", error: out.error || "" };
  const body = document.getElementById("left-body");
  if (body) body.innerHTML = leftBody(q);
}

async function gradeCase(q, text) {
  S.ai = { loading: true, text: "", error: "" };
  S.leftTab = "review";
  S.run = { running: true, status: "Grading…", tests: [], stdout: "", stderr: "", error: "", traceback: "", passed: null };
  showOutput("tests");
  const prompt = `${q.rubric}\n\nCase: ${q.title}\n${q.prompt}\n\nCandidate answer:\n${text.slice(0, 12000)}`;
  const out = await callClaude(prompt);
  S.ai = { loading: false, text: out.text || "", error: out.error || "" };
  const score = out.text ? Number((out.text.match(/SCORE:\s*(\d{1,3})/i) || [])[1]) : NaN;
  const passed = Number.isFinite(score) && score >= 70;
  if (out.text) {
    touch(q.id, { caseText: text, status: passed ? "solved" : "attempted", caseScore: score });
  }
  S.run = { running: false, status: "", tests: out.text ? [{ name: Number.isFinite(score) ? `score ${score}` : "review", passed, message: "" }] : [], stdout: "", stderr: "", error: out.error || "", traceback: "", passed: out.text ? passed : null };
  const body = document.getElementById("left-body");
  if (body) body.innerHTML = leftBody(q);
  showOutput(out.text ? "tests" : "console");
  refreshPills();
}

function insertKey(key) {
  if (!S.editor) return;
  const pairs = { "(": ["()", 1], "[": ["[]", 1], "{": ["{}", 1], "'": ["''", 1], "\"": ['""', 1] };
  if (key === "Tab") S.editor.insert(" ".repeat(S.settings.tabSize || 4), 0);
  else if (key === "df[]") S.editor.insert('df[""]', 2);
  else if (pairs[key]) S.editor.insert(pairs[key][0], pairs[key][1]);
  else S.editor.insert(key, 0);
}

function bindSplits() {
  document.querySelectorAll("[data-split]").forEach((el) => {
    el.onpointerdown = (ev) => {
      if (isNarrow()) return;
      ev.preventDefault();
      const ide = document.getElementById("ide");
      const vertical = el.dataset.split === "v";
      const move = (e) => {
        const rect = ide.getBoundingClientRect();
        if (vertical) {
          const pct = Math.min(70, Math.max(22, ((e.clientX - rect.left) / rect.width) * 100));
          ide.style.setProperty("--desc", pct + "%");
          localStorage.setItem("bcgx.layout", JSON.stringify(Object.assign(layout(), { desc: pct + "%" })));
        } else {
          const fromBottom = rect.bottom - e.clientY;
          const h = Math.min(rect.height * 0.7, Math.max(96, fromBottom));
          ide.style.setProperty("--tests", h + "px");
          localStorage.setItem("bcgx.layout", JSON.stringify(Object.assign(layout(), { tests: h + "px" })));
        }
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };
  });
}

function startMock() {
  const pool = (role) => S.bank.questions.filter((q) => q.mockRole === role);
  const pick = (arr, n) => arr.slice().sort(() => Math.random() - 0.5).slice(0, n);
  const ids = [
    ...pick(pool("numeric"), 2),
    ...pick(pool("mcq"), 6),
    ...pick(pool("collection"), 1),
    ...pick(pool("processing"), 1),
    ...pick(pool("model"), 1),
  ].map((q) => q.id);
  const now = Date.now();
  const mock = {
    id: "m" + now.toString(36),
    startedAt: now,
    endsAt: now + 90 * 60 * 1000,
    status: "active",
    questionIds: ids,
    cursor: ids[0],
    answers: {},
    updatedAt: now,
  };
  S.progress.mocks.push(mock);
  persistLocal();
  scheduleSync();
  S.mode = "mock";
  openId(ids[0], "mock");
}

function finishMock(m) {
  if (!m || m.status !== "active") return;
  let earned = 0;
  const points = { numeric: 50, mcq: 25, python: 150, sql: 150 };
  m.questionIds.forEach((id) => {
    const q = byId(id);
    const ans = (m.answers || {})[id];
    if (ans && ans.submitted && ans.passed) earned += points[q.type] || 0;
  });
  m.earned = earned;
  m.max = 700;
  m.score = 200 + Math.round(400 * (earned / 700));
  m.status = "review";
  m.finishedAt = Date.now();
  m.updatedAt = Date.now();
  persistLocal();
  scheduleSync();
}

function tickTimer() {
  const m = activeMock();
  const el = document.getElementById("timer");
  if (!m) return;
  const remain = m.endsAt - Date.now();
  if (el) {
    el.textContent = formatClock(remain);
    el.classList.toggle("late", remain < 60000);
    el.classList.toggle("warn", remain >= 60000 && remain < 300000);
  }
  if (remain <= 0) {
    finishMock(m);
    S.mode = "review";
    go("#/mock/review/" + m.id);
  }
}

function onClick(ev) {
  const btn = ev.target.closest("[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === "noop") { ev.stopPropagation(); return; }
  if (act === "go") go(btn.dataset.hash);
  else if (act === "continue") openId(continueId(), "practice");
  else if (act === "open") openId(btn.dataset.id, "practice");
  else if (act === "nav") {
    const id = btn.dataset.id;
    const mode = S.mode === "mock" || S.mode === "review" ? S.mode : "practice";
    if (mode === "mock") {
      const m = activeMock();
      if (m) { m.cursor = id; persistLocal(); }
    }
    openId(id, mode);
  }
  else if (act === "pane") { S.mobilePane = btn.dataset.pane; applyPanes(); }
  else if (act === "left") {
    S.leftTab = btn.dataset.tab;
    const q = currentTask();
    document.getElementById("left-body").innerHTML = leftBody(q);
    document.querySelectorAll(".task-col .tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.leftTab));
  }
  else if (act === "bottom") {
    S.bottomTab = btn.dataset.tab;
    document.querySelectorAll(".tests .tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.bottomTab));
    paintBottom();
  }
  else if (act === "run") runCurrent(false);
  else if (act === "submit") runCurrent(true);
  else if (act === "stop-run") stopRun("Stopped.");
  else if (act === "review") askReview();
  else if (act === "format") formatCode();
  else if (act === "reset") {
    const q = currentTask();
    if (q && S.editor && confirm("Reset this editor to the starter code?")) {
      S.editor.set(q.starter || "");
      flushCode();
    }
  }
  else if (act === "gear") { S.gear = !S.gear; render(); }
  else if (act === "jump") { S.jump = true; render(); }
  else if (act === "close-jump") { S.jump = false; render(); }
  else if (act === "ins") insertKey(btn.dataset.key);
  else if (act === "try") {
    S.scratch = { code: decodeURIComponent(btn.dataset.code || ""), lang: btn.dataset.lang === "sql" ? "sql" : "python", back: location.hash };
    S.run = emptyRun();
    go("#/sandbox");
  }
  else if (act === "back-scratch") go(S.scratch && S.scratch.back ? S.scratch.back : "#/");
  else if (act === "run-scratch") runScratch();
  else if (act === "copy-snip") copySnippet(btn);
  else if (act === "download-pdf") downloadPdf().catch(() => { btn.textContent = "PDF unavailable"; });
  else if (act === "download-md") downloadMarkdown();
  else if (act === "print-sheet") window.print();
  else if (act === "sheet-jump") document.getElementById(btn.dataset.id)?.scrollIntoView({ block: "start" });
  else if (act === "help") setHelp(!document.getElementById("help-overlay"));
  else if (act === "close-help") setHelp(false);
  else if (act === "mark-read") {
    touch(btn.dataset.id, { status: "read" });
    render();
  }
  else if (act === "dismiss-note") { localStorage.setItem("bcgx.note", "1"); render(); }
  else if (act === "restore") {
    const q = currentTask();
    const h = ((rec(q.id) || {}).history || [])[Number(btn.dataset.i)];
    if (h && S.editor) S.editor.set(h.code || "");
  }
  else if (act === "start-mock") startMock();
  else if (act === "review-open") {
    S.mode = "review";
    S.reviewId = parseRoute().id;
    openId(btn.dataset.id, "review");
  }
  else if (act === "save-settings") saveSettingsFromForm(true);
  else if (act === "sync-now") { S.syncReady = passphrase().length >= 12; pullAndMerge(); }
  else if (act === "left" ) { /* already */ }
  if (act === "submit" && currentTask() && currentTask().type !== "case") {
    /* graded in runCurrent */
  }
  }

function saveSettingsFromForm(sync) {
  const model = document.querySelector("[data-act=model]");
  const date = document.querySelector("[data-act=testdate]");
  const key = document.querySelector("[data-act=apikey]");
  const pass = document.querySelector("[data-act=pass]");
  if (model) S.settings.model = model.value.trim() || DEFAULT_MODEL;
  saveSettings();
  if (key && key.value && !key.value.includes("•")) setApiKey(key.value.trim());
  if (pass && pass.value && !pass.value.includes("•")) {
    if (pass.value.trim().length < 12) {
      setSync("error", "Passphrase must be at least 12 characters.");
      return;
    }
    setPassphrase(pass.value.trim());
  }
  if (date) {
    S.progress.testDate = date.value ? { date: date.value, updatedAt: Date.now() } : null;
    persistLocal();
  }
  if (sync) {
    S.syncReady = passphrase().length >= 12;
    pullAndMerge();
  }
}

function onInput(ev) {
  const el = ev.target;
  const act = el.dataset.act;
  if (act === "filter-q") {
    S.filter.q = el.value;
    const pos = el.selectionStart;
    render();
    const again = document.querySelector("[data-act=filter-q]");
    if (again) { again.focus(); again.selectionStart = again.selectionEnd = pos; }
  } else if (act === "sheet-q") {
    S._sheetQ = el.value;
    const pos = el.selectionStart;
    render();
    const again = document.querySelector("[data-act=sheet-q]");
    if (again) { again.focus(); again.selectionStart = again.selectionEnd = pos; }
  } else if (act === "numeric") {
    const q = currentTask();
    if (!q) return;
    if (S.mode === "mock") storeMockField(q, { answer: el.value });
    else touch(q.id, { answer: el.value, status: statusOf(q.id) });
  } else if (act === "case" || act === "notes") {
    const q = currentTask();
    if (!q) return;
    if (act === "notes") touch(q.id, { notes: el.value, status: statusOf(q.id) });
    else if (S.mode === "mock") storeMockField(q, { caseText: el.value });
    else touch(q.id, { caseText: el.value, status: el.value.trim() ? (statusOf(q.id) === "solved" ? "solved" : "attempted") : statusOf(q.id) });
  } else if (act === "font") {
    S.settings.fontSize = Number(el.value);
    saveSettings();
    if (S.editor) S.editor.setFontSize(S.settings.fontSize, S.settings.tabSize);
  } else if (act === "mcq") {
    const q = currentTask();
    if (!q) return;
    const picked = [...document.querySelectorAll("[data-act=mcq]:checked")].map((n) => n.value);
    if (S.mode === "mock") storeMockField(q, { mcq: picked });
    else touch(q.id, { mcq: picked, status: statusOf(q.id) === "not_started" ? "attempted" : statusOf(q.id) });
  }
}

function onChange(ev) {
  const el = ev.target;
  const act = el.dataset.act;
  if (act === "filter-diff") { S.filter.diff = el.value; render(); }
  else if (act === "filter-status") { S.filter.status = el.value; render(); }
  else if (act === "theme") {
    S.settings.theme = el.value;
    saveSettings();
    if (S.editor) S.editor.setTheme(S.settings.theme);
  } else if (act === "tabs") {
    S.settings.tabSize = Number(el.value);
    saveSettings();
    if (S.editor) S.editor.setFontSize(S.settings.fontSize, S.settings.tabSize);
  } else if (act === "ac") {
    S.settings.autocomplete = el.checked;
    saveSettings();
    const q = currentTask();
    if (S.editor) S.editor.setAutocomplete(autocompleteOn(q), q && q.type === "sql" ? "sql" : "python");
  } else if (act === "fix") {
    S.settings.showFix = el.checked;
    saveSettings();
  } else if (act === "testdate") {
    S.progress.testDate = el.value ? { date: el.value, updatedAt: Date.now() } : null;
    persistLocal();
    scheduleSync();
  }
}

function bindViewport() {
  const apply = () => {
    const vv = window.visualViewport;
    const h = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty("--app-h", h + "px");
    const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    document.body.classList.toggle("kb", kb > 80);
  };
  apply();
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", apply);
    window.visualViewport.addEventListener("scroll", apply);
  }
  window.addEventListener("resize", () => { apply(); applyPanes(); });
}

function bindHelper() {
  const update = () => {
    const ae = document.activeElement;
    const editing = ae && (ae.classList.contains("cm-content") || ae.closest?.(".cm-editor"));
    const coarse = window.matchMedia("(pointer: coarse)").matches || isNarrow();
    document.body.classList.toggle("show-helper", !!(editing && coarse));
  };
  document.addEventListener("focusin", update);
  document.addEventListener("focusout", () => setTimeout(update, 50));
}

function runScratch() {
  if (S.run.running) return;
  const code = S.editor ? S.editor.get() : (S.scratch && S.scratch.code) || "";
  if (S.scratch && S.scratch.lang === "sql") runSql({ schema: "", scratch: true, type: "sql" }, code, false);
  else runSource({ source: code, tests: [], packages: [], timeoutMs: 20000, consoleOnly: true });
}

function doRun() {
  if (S.run.running) return;
  if (parseRoute().name === "sandbox") {
    runScratch();
    return;
  }
  if (currentTask()) runCurrent(false);
}

function doSubmit() {
  if (S.run.running) return;
  if (parseRoute().name === "sandbox") return;
  if (currentTask()) runCurrent(true);
}

function taskSequence() {
  const route = parseRoute();
  if (S.mode === "mock" || S.mode === "review") {
    const m = S.mode === "review" ? S.progress.mocks.find((x) => x.id === S.reviewId) : activeMock();
    if (!m) return [];
    return m.questionIds;
  }
  if (route.name === "task") return flat().map((q) => q.id);
  return [];
}

function moveTask(dir) {
  const route = parseRoute();
  if (route.name === "sandbox") return;
  if (route.name === "path") {
    if (dir > 0) openId(continueId(), "practice");
    return;
  }
  const ids = taskSequence();
  const cur = route.name === "task" ? route.id : null;
  const idx = ids.indexOf(cur);
  if (idx < 0) return;
  const next = ids[idx + dir];
  if (!next) return;
  const mode = S.mode === "mock" || S.mode === "review" ? S.mode : "practice";
  if (mode === "mock") {
    const m = activeMock();
    if (m) { m.cursor = next; persistLocal(); }
  }
  openId(next, mode);
}

function refreshLeftTab(q) {
  const body = document.getElementById("left-body");
  if (!body || !q) return;
  body.innerHTML = leftBody(q);
  document.querySelectorAll(".task-col .tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.leftTab));
}

function toggleSolution() {
  const q = currentTask();
  if (!q || q.type === "reading") return;
  if (liveMockHidesSolution(q) && S.mode !== "review") return;
  S.leftTab = S.leftTab === "solution" ? "description" : "solution";
  if (isNarrow()) {
    S.mobilePane = "task";
    applyPanes();
  }
  refreshLeftTab(q);
}

function focusEditor() {
  if (isNarrow()) {
    S.mobilePane = "code";
    applyPanes();
  }
  if (S.editor) S.editor.focus();
  else document.querySelector("[data-act=numeric], [data-act=case], .cm-content")?.focus();
}

function focusPane(which) {
  const sandbox = document.getElementById("ide")?.classList.contains("sandbox");
  if (sandbox && which === "task") return;
  if (isNarrow() && !sandbox) {
    S.mobilePane = which === "task" ? "task" : which === "code" ? "code" : "tests";
    applyPanes();
  }
  if (which === "code") focusEditor();
  else if (which === "task") document.querySelector(".task-col .scroll")?.focus();
  else {
    const el = document.getElementById("bottom-body");
    if (el) {
      el.tabIndex = -1;
      el.focus();
    }
  }
}

function toggleOutputTab() {
  S.bottomTab = S.bottomTab === "console" ? "tests" : "console";
  const sandbox = document.getElementById("ide")?.classList.contains("sandbox");
  if (isNarrow() && !sandbox) S.mobilePane = "tests";
  applyPanes();
  paintBottom();
}

function goBack() {
  const route = parseRoute();
  if (route.name === "sandbox") go((S.scratch && S.scratch.back) || "#/");
  else if (route.name === "review") go("#/mock");
  else if (route.name !== "path") go("#/");
}

function doReset() {
  const q = currentTask();
  if (!q || !S.editor || q.type === "reading") return;
  if (confirm("Reset this editor to the starter code?")) {
    S.editor.set(q.starter || "");
    flushCode();
  }
}

function toggleAutocomplete() {
  S.settings.autocomplete = !S.settings.autocomplete;
  saveSettings();
  const q = currentTask();
  const lang = (q && q.type === "sql") || (S.scratch && S.scratch.lang === "sql") ? "sql" : "python";
  if (S.editor) S.editor.setAutocomplete(S.scratch ? S.settings.autocomplete : autocompleteOn(q), lang);
}

function pickChoice(n) {
  const q = currentTask();
  if (!q || q.type !== "mcq" || S.mode === "review") return false;
  const inputs = [...document.querySelectorAll("[data-act=mcq]")];
  const el = inputs[n - 1];
  if (!el || el.disabled) return false;
  if (q.multi) el.checked = !el.checked;
  else el.checked = true;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function endMockNow() {
  const m = activeMock();
  if (!m) return;
  if (confirm("Submit the mock now? Tasks you have not submitted score zero.")) {
    finishMock(m);
    S.mode = "review";
    go("#/mock/review/" + m.id);
  }
}

function shortcutRows() {
  return [
    ["Run tests, sandbox Run, or check a numeric / multiple-choice answer", "Ctrl+Enter"],
    ["Submit", "Ctrl+Shift+Enter"],
    ["Format code", "Shift+Alt+F"],
    ["Stop the run, or close this sheet", "Esc"],
    ["Next task", "Alt+J"],
    ["Previous task", "Alt+K"],
    ["Toggle Description / Solution", "Ctrl+\\"],
    ["Toggle Tests / Console", "Ctrl+`"],
    ["Description, code, or output pane", "Ctrl+Alt+1 / 2 / 3"],
    ["Focus the editor", "Ctrl+Alt+E"],
    ["Task list", "Ctrl+Alt+H"],
    ["Cheat sheet", "Ctrl+Alt+C"],
    ["Back", "Ctrl+B or Alt+B"],
    ["Settings", "Ctrl+,"],
    ["Ask Claude (practice only)", "Ctrl+Alt+R"],
    ["Reset code to the starter", "Ctrl+Alt+Backspace"],
    ["Toggle autocomplete", "Ctrl+Alt+Space"],
    ["Pick multiple-choice option 1–4 (when not typing)", "1 2 3 4"],
    ["End the mock (asks first)", "Ctrl+Alt+Shift+Enter"],
    ["This sheet", "F1, or ? when not typing"],
    ["Autocomplete, comment, indent (editor)", "Ctrl+Space, Ctrl+/, Tab"],
  ];
}

function setHelp(open) {
  document.getElementById("help-overlay")?.remove();
  if (!open) return;
  const rows = shortcutRows().map(([what, keys]) => `<tr><td><kbd>${esc(keyLabel(keys))}</kbd></td><td>${esc(what)}</td></tr>`).join("");
  document.getElementById("app").insertAdjacentHTML("beforeend", `<div class="overlay" id="help-overlay" data-act="close-help"><div class="drawer help-sheet" data-act="noop" role="dialog" aria-label="Keyboard shortcuts"><h2>Keyboard shortcuts</h2><p class="sub">On a Mac, Ctrl means Command. These work while the editor is focused. A phone without a keyboard is unchanged.</p><table class="help-table">${rows}</table><p><button class="btn" data-act="close-help">Close</button></p></div></div>`);
}

function isTypingTarget(el) {
  if (!el || !el.closest) return false;
  if (el.closest(".cm-editor")) return true;
  const tag = (el.tagName || "").toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag === "input") {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    return type !== "checkbox" && type !== "radio" && type !== "button" && type !== "range";
  }
  return !!el.isContentEditable;
}

function onShortcut(e) {
  if (e.repeat) return;
  const helpOpen = !!document.getElementById("help-overlay");
  const mod = e.ctrlKey || e.metaKey;
  const typing = isTypingTarget(e.target);
  if (e.key === "Escape") {
    if (helpOpen) { e.preventDefault(); setHelp(false); return; }
    if (S.jump) { e.preventDefault(); S.jump = false; render(); return; }
    if (S.gear) { e.preventDefault(); S.gear = false; render(); return; }
    if (S.run.running) { e.preventDefault(); stopRun("Stopped."); return; }
    return;
  }
  if (helpOpen && e.key !== "F1") { e.preventDefault(); return; }
  if (e.key === "F1" || (mod && e.altKey && !e.shiftKey && e.code === "Slash")) {
    e.preventDefault();
    setHelp(!helpOpen);
    return;
  }
  if (!typing && !mod && !e.altKey && e.key === "?") {
    e.preventDefault();
    setHelp(true);
    return;
  }
  if (mod && e.altKey && e.shiftKey && e.key === "Enter") {
    e.preventDefault();
    endMockNow();
    return;
  }
  if (mod && !e.altKey && e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey) doSubmit();
    else doRun();
    return;
  }
  if (!mod && e.altKey && e.shiftKey && e.code === "KeyF") {
    e.preventDefault();
    if (S.editor) formatCode();
    return;
  }
  if (!mod && e.altKey && !e.shiftKey && e.code === "KeyJ") { e.preventDefault(); moveTask(1); return; }
  if (!mod && e.altKey && !e.shiftKey && e.code === "KeyK") { e.preventDefault(); moveTask(-1); return; }
  if (mod && !e.altKey && !e.shiftKey && e.key === "\\") { e.preventDefault(); toggleSolution(); return; }
  if (mod && !e.altKey && !e.shiftKey && e.key === "`") { e.preventDefault(); toggleOutputTab(); return; }
  if (mod && e.altKey && !e.shiftKey && e.code === "Digit1") { e.preventDefault(); focusPane("task"); return; }
  if (mod && e.altKey && !e.shiftKey && e.code === "Digit2") { e.preventDefault(); focusPane("code"); return; }
  if (mod && e.altKey && !e.shiftKey && e.code === "Digit3") { e.preventDefault(); focusPane("tests"); return; }
  if (mod && e.altKey && !e.shiftKey && e.code === "KeyE") { e.preventDefault(); focusEditor(); return; }
  if (mod && e.altKey && !e.shiftKey && e.code === "KeyH") { e.preventDefault(); go("#/"); return; }
  if (mod && e.altKey && !e.shiftKey && e.code === "KeyC") {
    e.preventDefault();
    e.stopPropagation();
    if (parseRoute().name !== "sheet") go("#/sheet");
    return;
  }
  if ((mod || e.altKey) && !e.shiftKey && !(mod && e.altKey) && e.code === "KeyB") {
    e.preventDefault();
    e.stopPropagation();
    goBack();
    return;
  }
  if (mod && !e.altKey && !e.shiftKey && e.key === ",") { e.preventDefault(); go("#/settings"); return; }
  if (mod && e.altKey && !e.shiftKey && e.code === "KeyR") { e.preventDefault(); if (S.mode !== "mock" && currentTask()) askReview(); return; }
  if (mod && e.altKey && !e.shiftKey && e.key === "Backspace") { e.preventDefault(); doReset(); return; }
  if (mod && e.altKey && e.code === "Space") { e.preventDefault(); toggleAutocomplete(); return; }
  if (!typing && !mod && !e.altKey && !e.shiftKey && /^[1-4]$/.test(e.key)) {
    if (pickChoice(Number(e.key))) e.preventDefault();
  }
}

async function boot() {
  S.settings = loadSettings();
  S.progress = loadProgress();
  saveSettings();
  document.getElementById("app").addEventListener("click", onClick);
  document.getElementById("app").addEventListener("input", onInput);
  document.getElementById("app").addEventListener("change", onChange);
  window.addEventListener("hashchange", () => { flushCode(); render(); });
  bindViewport();
  bindHelper();
  setInterval(tickTimer, 1000);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushCode(); });
  window.addEventListener("keydown", onShortcut, true);
  render();
  try {
    const [bank, harness, sheet] = await Promise.all([
      fetch("questions/bank.json").then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }),
      fetch("py/harness.py").then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.text(); }),
      fetch("cheatsheet.json").then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }).catch(() => ({ title: "Cheat sheet", intro: "Could not load the cheat sheet.", sections: [] })),
    ]);
    S.bank = bank;
    S.harness = harness;
    S.sheet = sheet;
  } catch (err) {
    document.getElementById("app").innerHTML = `${topbar("")}<main class="lobby"><div class="banner bad">Could not load the question bank (${esc(err.message)}).</div></main>`;
    return;
  }
  const expired = activeMock();
  if (expired && expired.endsAt <= Date.now()) finishMock(expired);
  render();
  if (passphrase().length >= 12) pullAndMerge();
  else setSync("local", "Saved on this device");
}

boot();
