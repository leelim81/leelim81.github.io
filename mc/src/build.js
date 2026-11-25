// The build id is stamped in by dev/build.mjs. It versions every file the app fetches.
/* global __BUILD__, __FILES__ */
export const BUILD = typeof __BUILD__ === "string" ? __BUILD__ : "dev";

// What the site needs to run without a connection, also from dev/build.mjs.
export const FILES = typeof __BUILD__ === "string" ? __FILES__ : { site: [] };
