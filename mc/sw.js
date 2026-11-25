// One Twenty: service worker.
//
// The site's own files come from the network first, so an update shows up on the next load.
// The saved copy is the fallback when you are offline or the network is slow.

const SHELL = "onetwenty-site-v1";
const SLOW_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("onetwenty-") && name !== SHELL) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.url.startsWith(self.registration.scope)) event.respondWith(networkFirst(req));
});

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
