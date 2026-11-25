// Bundle the app and stamp a build id into every URL the page loads.
//
//   npm run build
//
// The id is a hash of the sources, the styles, and the fonts, so browsers and the service worker
// fetch new files exactly when something changed. The build also lists every file the site needs
// to run without a connection. The app saves those files on the first visit (src/offline.js).
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));

function walk(dir, ext) {
  const out = [];
  for (const name of readdirSync(root + dir).sort()) {
    const path = `${dir}/${name}`;
    if (statSync(root + path).isDirectory()) out.push(...walk(path, ext));
    else if (name.endsWith(ext)) out.push(path);
  }
  return out;
}

const text = (file) => readFileSync(root + file, "utf8");
const siteCache = /const SHELL = "([^"]+)"/.exec(text("sw.js"))?.[1];
if (!siteCache || !text("src/offline.js").includes(`const SITE = "${siteCache}"`)) throw new Error("sw.js and src/offline.js disagree on the name of the site cache");

const fonts = walk("fonts", ".woff2");
const hash = createHash("sha256");
for (const file of [...walk("src", ".js"), "css/app.css", "css/one-twenty.css", ...fonts]) {
  hash.update(file);
  hash.update(readFileSync(root + file));
}
const id = hash.digest("hex").slice(0, 10);

const files = {
  site: ["./", `css/app.css?v=${id}`, `css/one-twenty.css?v=${id}`, `js/app.js?v=${id}`, ...fonts],
};

await build({
  entryPoints: [root + "src/main.js"],
  outfile: root + "js/app.js",
  bundle: true,
  format: "esm",
  minify: true,
  target: "es2022",
  legalComments: "none",
  define: { __BUILD__: JSON.stringify(id), __FILES__: JSON.stringify(files) },
});

const page = root + "index.html";
writeFileSync(page, readFileSync(page, "utf8").replace(/\?v=[\w.-]+/g, `?v=${id}`));
console.log(`build ${id}: js/app.js ${(readFileSync(root + "js/app.js").length / 1024).toFixed(0)} KB, ${files.site.length} site files to keep offline`);
