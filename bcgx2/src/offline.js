// An offline copy of the whole site.
//
// The service worker (sw.js) saves each file that passes through it. That leaves two gaps: the files of a
// first visit, which load before the service worker is in control, and the data of tasks that were never
// opened. This module closes both. It fetches what is missing and writes it into the caches that the
// service worker reads from. It runs in the page, so it does not depend on which service worker is active.
import { FILES } from "./build.js";
import { taskUrl } from "./content.js";
import { toast } from "./dom.js";

const SITE = "ninety-site-v1"; // the name in sw.js; dev/build.mjs checks that the two agree
const AT_ONCE = 3;
const GIVE_UP_MS = 60000;
const WORKER_MS = 10000;

const part = (want) => ({ have: 0, want });

export const offline = {
  able: null, // can this browser keep a copy? null until it is known
  busy: false, // a pass is running
  waiting: true, // task data waits until Python has finished loading, so the two downloads don't compete
  site: part(FILES.site.length),
  data: part(Object.keys(FILES.data).length),
  python: part(0), // the list comes from the Python worker once it is ready
};

const listeners = new Set();
let pythonUrls = [];
let running = null;
let again = false;
let fresh = 0; // files downloaded since the page last said that the copy is complete

export function onOffline(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function tell() {
  for (const fn of listeners) fn(offline);
}

const abs = (url) => new URL(url, document.baseURI).href;
const siteUrls = () => FILES.site.map(abs);
const dataUrls = () => Object.keys(FILES.data).map((id) => abs(taskUrl(id)));
// The service worker names the Python cache after the Pyodide version, which is part of every Python URL.
const pythonCache = () => "ninety-python-" + (/\/v(\d[\d.]*)\//.exec(pythonUrls[0] || "")?.[1] || "");

const full = (p) => p.want > 0 && p.have >= p.want;

// "checking", "none" (this browser keeps no copy), "saved", "saving", "waiting" (for Python), or "partial".
export function offlineState() {
  if (offline.able === null) return "checking";
  if (!offline.able) return "none";
  if (full(offline.site) && full(offline.data) && full(offline.python)) return "saved";
  if (offline.busy) return "saving";
  return offline.waiting ? "waiting" : "partial";
}

async function count(cache, urls) {
  let n = 0;
  for (const url of urls) if (await cache.match(url, { ignoreVary: true })) n++;
  return n;
}

// Fetch one file. A server that never answers counts as a miss after a minute, so a pass always ends.
// "no-cache" asks the server each time, so an error page that the browser kept can't stand in for the file.
// A file that the browser already has costs one short question, not a second download.
async function get(url, init) {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), GIVE_UP_MS);
  try {
    const res = await fetch(url, { cache: "no-cache", ...init, signal: stop.signal });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// Files carry ?v=<version>. Once a new version is saved, drop the older copies of the same path, as sw.js does.
async function dropOlder(cache, url) {
  const kept = new URL(url);
  if (!kept.search) return;
  for (const key of await cache.keys()) {
    const old = new URL(key.url);
    if (old.origin === kept.origin && old.pathname === kept.pathname && old.search !== kept.search) await cache.delete(key);
  }
}

// Make sure every URL is in the cache. Files that are already there cost no download, and a file that
// does not arrive stays missing until the next pass. state.have is the number in the cache at every moment.
async function fill(cache, urls, state, init) {
  const missing = [];
  for (const url of urls) if (!(await cache.match(url, { ignoreVary: true }))) missing.push(url);
  state.have = urls.length - missing.length;
  tell();
  const lane = async () => {
    for (let url = missing.shift(); url; url = missing.shift()) {
      try {
        await cache.put(url, await get(url, init));
        state.have++;
        fresh++;
        await dropOlder(cache, url).catch(() => {});
      } catch {
        // offline, a server error, or no room left: the count shows that the file is missing
      }
      tell();
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, lane));
}

async function pass() {
  offline.busy = true;
  tell();
  let site;
  try {
    site = await caches.open(SITE);
  } catch {
    offline.able = false; // the cache store is out of reach, as in some private windows
    offline.busy = false;
    tell();
    return;
  }
  try {
    await fill(site, siteUrls(), offline.site);
    if (offline.waiting) {
      offline.data.have = await count(site, dataUrls()); // nothing downloads yet, but an earlier visit may have saved it all
    } else {
      await fill(site, dataUrls(), offline.data);
      // Python files never change under their URL, so the browser's own copy is as good as a new download
      if (pythonUrls.length) await fill(await caches.open(pythonCache()), pythonUrls, offline.python, { mode: "cors", credentials: "omit", cache: "default" });
    }
  } catch {
    // the counts show what is missing
  }
  offline.busy = false;
  tell();
  // Say so once the copy is complete, on the visit that completed it. A task or a timed test is left alone.
  if (fresh && offlineState() === "saved") {
    fresh = 0;
    if (!document.body.classList.contains("focus")) toast("Saved on this device. The site now works without a connection.");
  }
}

// Run a pass now, or once more after the pass that is running.
export function saveOffline() {
  if (!offline.able) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = pass().finally(() => {
    running = null;
    if (again) {
      again = false;
      saveOffline();
    }
  });
  return running;
}

let started = false;

// Call once at start-up, after the service worker has been registered.
// A saved copy is only ever used if the service worker is active for this page, so saving starts when it is.
// On a first visit that takes a moment. A browser that blocks service workers never gets there, so after a
// while the page says that no copy is kept.
export function startOffline() {
  if (started) return;
  started = true;
  const none = () => {
    if (offline.able !== null) return;
    offline.able = false;
    tell();
  };
  if (!("serviceWorker" in navigator) || !("caches" in window)) return none();
  setTimeout(none, WORKER_MS);
  navigator.serviceWorker.ready
    .then((reg) => {
      if (!reg?.active || offline.able) return;
      offline.able = true;
      tell();
      window.addEventListener("online", () => saveOffline());
      saveOffline();
    })
    .catch(() => {});
}

// Python has finished loading (urls: the files it used), or it has failed. Either way the task data can follow.
export function pythonLoaded(urls) {
  if (urls?.length) {
    pythonUrls = urls;
    offline.python.want = urls.length;
  }
  offline.waiting = false;
  tell();
  saveOffline();
}
