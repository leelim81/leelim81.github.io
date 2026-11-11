// The build id is stamped in by dev/build.mjs. It versions every file the app fetches.
/* global __BUILD__ */
export const BUILD = typeof __BUILD__ === "string" ? __BUILD__ : "dev";
