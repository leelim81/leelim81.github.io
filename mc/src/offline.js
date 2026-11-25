// An offline copy of the whole site.
//
// The service worker saves every file it serves. The files of a first visit load before the service
// worker is in control, so this module fetches the list again once it is, and the copy is complete.
import { FILES } from "./build.js";

const SITE = "onetwenty-site-v1";

let state = "checking"; // checking, saving, saved, partial, none
let have = 0;
const subs = new Set();

export const offlineState = () => state;
export const offlineCount = () => ({ have, want: FILES.site.length });

export function onOffline(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

function set(next) {
  state = next;
  for (const fn of subs) fn(state);
}

export async function startOffline() {
  if (!("serviceWorker" in navigator) || !("caches" in window) || !FILES.site.length) return set("none");
  try {
    await navigator.serviceWorker.register("sw.js");
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
        setTimeout(resolve, 3000);
      });
    }
    set("saving");
    const cache = await caches.open(SITE);
    have = 0;
    for (const url of FILES.site) {
      const abs = new URL(url, location.href.split("#")[0]).href;
      if (await cache.match(abs, { ignoreVary: true })) {
        have++;
        continue;
      }
      try {
        const res = await fetch(abs, { cache: "reload" });
        if (res.ok) {
          // The service worker saves it too when it is in control. This covers the visit where it is not yet.
          await cache.put(abs, res.clone()).catch(() => {});
          have++;
        }
      } catch {
        // try again on the next visit
      }
    }
    set(have === FILES.site.length ? "saved" : "partial");
  } catch {
    set("none");
  }
}
