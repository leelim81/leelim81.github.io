// The page's side of the Python worker: one worker for the whole visit, started as soon as the site opens.
import { BUILD } from "./build.js";

export const rt = { state: "idle", text: "", detail: "", step: 0, versions: null, ms: 0, kept: null, sw: false };

const listeners = new Set();
const pending = new Map();
const sinks = new Map();
let worker = null;
let prepared = new Set();
let seq = 0;
let runSeq = 0;

export function onRuntime(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(patch) {
  Object.assign(rt, patch);
  for (const fn of listeners) fn(rt);
}

function failAll(error) {
  for (const p of pending.values()) p.reject(error);
  pending.clear();
  sinks.clear();
}

export function startRuntime() {
  if (worker) return;
  prepared = new Set();
  set({ state: "loading", text: "Starting Python", step: 0 });
  worker = new Worker(new URL(`py-worker.js?v=${BUILD}`, document.baseURI), { type: "module" });
  const mine = worker;
  worker.onmessage = (ev) => {
    if (worker !== mine) return;
    const m = ev.data;
    if (m.type === "reply") {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (!p) return;
      if (m.ok) p.resolve(m.data);
      else p.reject(Object.assign(new Error(m.error), { fatal: m.fatal }));
      if (m.fatal) restart("Python ran out of memory and restarted.");
    } else if (m.type === "out" || m.type === "started" || m.type === "checking" || m.type === "waiting") {
      sinks.get(m.run)?.(m);
    } else if (m.type === "status") {
      set({ state: m.state, text: m.text, detail: m.detail || "", step: m.step || rt.step, versions: m.versions || rt.versions, ms: m.ms || rt.ms });
      if (m.state === "ready" && m.files?.length) keepOffline(m.files);
      if (m.state === "error") failAll(new Error(m.text + "."));
    }
  };
  worker.onerror = (ev) => {
    if (worker !== mine) return;
    ev.preventDefault?.();
    set({ state: "error", text: "Python did not start. Check your connection, then try again", detail: "" });
    failAll(new Error("Python did not start. Check your connection, then try again."));
  };
}

function restart(text) {
  if (worker) worker.terminate();
  worker = null;
  failAll(Object.assign(new Error(text || "Stopped."), { stopped: true }));
  startRuntime();
}

// The page can't interrupt Python, so stopping means a new worker. Files are cached, so it is back in seconds.
export const stopRuntime = () => restart("Stopped.");

function call(op, args) {
  if (worker && rt.state === "error") {
    worker.terminate();
    worker = null;
  }
  startRuntime();
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, op, ...args });
  });
}

// Run code in a fresh copy of a task folder. Pass grader source to run the checks too.
export async function runCode({ slot, files, hidden, code, grader, onEvent }) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!prepared.has(slot)) {
      const gen = prepared;
      await call("prepare", { slot, files, hidden });
      gen.add(slot);
    }
    const run = ++runSeq;
    if (onEvent) sinks.set(run, onEvent);
    try {
      const res = await call("run", { slot, code, grader: grader || null, run });
      if (!res.missing) return res;
      prepared.delete(slot);
    } finally {
      sinks.delete(run);
    }
  }
  throw new Error("The task files did not reach Python. Reload the page and try again.");
}

export async function consoleLine({ slot, src, onEvent }) {
  const run = ++runSeq;
  if (onEvent) sinks.set(run, onEvent);
  try {
    return await call("console", { slot, src, run });
  } finally {
    sinks.delete(run);
  }
}

export const readOutput = (slot, path) => call("read", { slot, path });

// ---- offline copy -------------------------------------------------------------------------
// The service worker caches Python files as they pass through it. This asks it to fetch any it missed.
function keepOffline(urls) {
  const sw = navigator.serviceWorker?.controller;
  if (sw) sw.postMessage({ type: "keep", urls });
}

export async function startServiceWorker() {
  if (!("serviceWorker" in navigator)) return false;
  try {
    navigator.serviceWorker.addEventListener("message", (ev) => {
      if (ev.data?.type === "kept") set({ kept: ev.data });
    });
    await navigator.serviceWorker.register("sw.js");
    if (!navigator.serviceWorker.controller) {
      await Promise.race([
        new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true })),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    }
    set({ sw: !!navigator.serviceWorker.controller });
    navigator.storage?.persist?.().catch(() => {});
    return rt.sw;
  } catch {
    return false;
  }
}
