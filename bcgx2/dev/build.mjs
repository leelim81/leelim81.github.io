// Bundle the app and stamp a build id into every URL the page loads.
//
//   npm run build
//
// The id is a hash of the sources and the content, so browsers and the service worker
// fetch new files exactly when something changed.
//
// The build also lists every file the site needs to run without a connection. The app saves
// those files on the first visit (src/offline.js). Task data and the PDF carry a hash of their
// own, so a new build fetches only the ones that changed.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const list = (dir, ext) => readdirSync(root + dir).filter((f) => f.endsWith(ext)).sort().map((f) => `${dir}/${f}`);

// The app writes its offline copy into the caches that the service worker reads from, so the names have to agree.
const text = (file) => readFileSync(root + file, "utf8");
const siteCache = /const SHELL = "([^"]+)"/.exec(text("sw.js"))?.[1];
const pyVersion = /pyodide\/v([\d.]+)\/full/.exec(text("py-worker.js"))?.[1];
if (!siteCache || !text("src/offline.js").includes(`const SITE = "${siteCache}"`)) throw new Error("sw.js and src/offline.js disagree on the name of the site cache");
if (!pyVersion || !text("sw.js").includes(`const PY = "ninety-python-${pyVersion}"`) || !text("sw.js").includes(`/pyodide/v${pyVersion}/full/`)) throw new Error("sw.js and py-worker.js disagree on the Python version");

const sha = (file) => createHash("sha256").update(readFileSync(root + file)).digest("hex").slice(0, 10);
const tasks = list("content/ex", ".json");
const fonts = list("fonts", ".woff2");

const hash = createHash("sha256");
for (const file of [...list("src", ".js"), "css/app.css", "py-worker.js", "py/ninety_check.py", "content/bank.json", ...tasks, ...fonts, "cheatsheet.pdf"]) {
  hash.update(file);
  hash.update(readFileSync(root + file));
}
const id = hash.digest("hex").slice(0, 10);

const files = {
  // the page, its code and styles, the Python worker and its checks, the question bank, the fonts, and the PDF
  site: ["./", `css/app.css?v=${id}`, `js/app.js?v=${id}`, `py-worker.js?v=${id}`, `py/ninety_check.py?v=${id}`, `content/bank.json?v=${id}`, ...fonts, `cheatsheet.pdf?v=${sha("cheatsheet.pdf")}`],
  // task id -> hash of content/ex/<id>.json
  data: Object.fromEntries(tasks.map((f) => [f.slice("content/ex/".length, -".json".length), sha(f)])),
  pdf: `cheatsheet.pdf?v=${sha("cheatsheet.pdf")}`,
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
console.log(`build ${id}: js/app.js ${(readFileSync(root + "js/app.js").length / 1024).toFixed(0)} KB, ${files.site.length} site files and ${tasks.length} task data files to keep offline`);
