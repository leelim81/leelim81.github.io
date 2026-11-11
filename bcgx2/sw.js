// Ninety: service worker.
//
// Python files from the CDN are large and never change for a given version, so they are served from
// the cache first. After the first visit, Python starts without downloading anything.
// The site's own files come from the network first, so an update shows up on the next load,
// with the cached copy as the fallback when you are offline or the network is slow.

const PY_BASE = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";
const PY = "ninety-python-314.0.7";
const SHELL = "ninety-site-v1";
const SLOW_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("ninety-") && name !== PY && name !== SHELL) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.url.startsWith(PY_BASE)) event.respondWith(cacheFirst(req));
  else if (req.url.startsWith(self.registration.scope)) event.respondWith(networkFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(PY);
  const hit = await cache.match(req.url, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type !== "opaque") cache.put(req.url, res.clone()).catch(() => {});
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req.url, { ignoreVary: true });
  const net = fetch(req).then((res) => {
    if (res.ok) cache.put(req.url, res.clone()).then(() => prune(cache, req.url)).catch(() => {});
    else if (hit && res.status >= 500) return hit; // the host is having a bad moment: use the saved copy
    return res;
  });
  if (!hit) return net;
  let timer;
  const slow = new Promise((resolve) => {
    timer = setTimeout(() => resolve(hit), SLOW_MS);
  });
  return Promise.race([net.catch(() => hit), slow]).finally(() => clearTimeout(timer));
}

// Files carry ?v=<build>. Keep only the newest copy of each path.
async function prune(cache, url) {
  const fresh = new URL(url);
  if (!fresh.search) return;
  for (const key of await cache.keys()) {
    const old = new URL(key.url);
    if (old.pathname === fresh.pathname && old.search !== fresh.search) await cache.delete(key);
  }
}

// The page sends the list of Python files it used. Fetch any that are not in the cache yet
// (for example, files that were downloaded before this worker took control of the page).
self.addEventListener("message", (event) => {
  const m = event.data || {};
  if (m.type === "keep" && Array.isArray(m.urls)) event.waitUntil(keep(m.urls, event.source));
});

async function keep(urls, client) {
  const cache = await caches.open(PY);
  let have = 0;
  for (const url of urls) {
    if (!url.startsWith(PY_BASE)) continue;
    try {
      if (!(await cache.match(url, { ignoreVary: true }))) {
        const res = await fetch(url, { mode: "cors", credentials: "omit" });
        if (!res.ok) continue;
        await cache.put(url, res);
      }
      have++;
    } catch {
      // try again on the next visit
    }
  }
  if (client) client.postMessage({ type: "kept", have, want: urls.length });
}
