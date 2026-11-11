// Bundle the app and stamp a build id into every URL the page loads.
//
//   npm run build
//
// The id is a hash of the sources and the content, so browsers and the service worker
// fetch new files exactly when something changed.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const list = (dir, ext) => readdirSync(root + dir).filter((f) => f.endsWith(ext)).sort().map((f) => `${dir}/${f}`);

const hash = createHash("sha256");
for (const file of [...list("src", ".js"), "css/app.css", "py-worker.js", "py/ninety_check.py", "content/bank.json", ...list("content/ex", ".json")]) {
  hash.update(file);
  hash.update(readFileSync(root + file));
}
const id = hash.digest("hex").slice(0, 10);

await build({
  entryPoints: [root + "src/main.js"],
  outfile: root + "js/app.js",
  bundle: true,
  format: "esm",
  minify: true,
  target: "es2022",
  legalComments: "none",
  define: { __BUILD__: JSON.stringify(id) },
});

const page = root + "index.html";
writeFileSync(page, readFileSync(page, "utf8").replace(/\?v=[\w.-]+/g, `?v=${id}`));
console.log(`build ${id}: js/app.js ${(readFileSync(root + "js/app.js").length / 1024).toFixed(0)} KB`);
