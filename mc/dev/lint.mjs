// Checks the words and the content before a build is published.
//   node dev/lint.mjs
// Style: no long dashes, no currency symbols, no exclamation marks in prose, no filler words, and
// American spelling. Content: ids are unique, every diagram refers to boxes that exist, a diagram has
// nine boxes or fewer, and a box is named for its job, with any product name in brackets underneath.
// Names that must never appear on the site are read from dev/banned.local.txt, one per line.
// That file is not committed, because the list itself would put the names in the repository.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const say = (file, line, text) => problems.push(`${relative(root, file)}:${line}  ${text}`);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "js" || name === "fonts" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|mjs|html|css|md|json)$/.test(name) && name !== "package-lock.json") out.push(p);
  }
  return out;
}

// The text inside string literals of a JavaScript file, with the line each one starts on.
function strings(src) {
  const out = [];
  let i = 0;
  let line = 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\n") line++;
    if (ch === "/" && src[i + 1] === "/") {
      const end = src.indexOf("\n", i);
      i = end < 0 ? src.length : end;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      line += src.slice(i, stop).split("\n").length - 1;
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const start = line;
      let j = i + 1;
      let text = "";
      while (j < src.length && src[j] !== ch) {
        if (src[j] === "\\") {
          text += src[j + 1] === "n" ? " " : src[j + 1];
          j += 2;
          continue;
        }
        if (src[j] === "\n") line++;
        text += src[j++];
      }
      out.push({ text, line: start });
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

const FILLER = /\b(simply|just|easily|obviously|of course|please|at this time|it should be noted|let's|leverage[sd]?|seamless(ly)?|cutting-edge|robust|game-changing|tl;dr|click here)\b/i;
const BRITISH = /\b(behaviour|colour|favour|honour|labour|neighbour|organis|authoris|prioritis|optimis|recognis|summaris|standardis|centralis|minimis|maximis|realis|specialis|utilis|analys(e|ed|ing)\b|modell(ed|ing)|labell(ed|ing)|travell(ed|ing)|cancell(ed|ing)|centre|programme|catalogue|defence|licence|judgement|learnt|whilst|amongst)/i;
// The characters are built from their codes, so that this file passes its own check.
const DASH = new RegExp("[" + String.fromCharCode(8210, 8211, 8212, 8213) + "]");
const MONEY = new RegExp("(?:US|S)?[$" + String.fromCharCode(8364, 163, 165) + "]\\s?\\d");
const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Names match as whole words. Short names must also match in their own capitals.
const banned = existsSync(join(root, "dev/banned.local.txt"))
  ? readFileSync(join(root, "dev/banned.local.txt"), "utf8")
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((name) => [name, new RegExp("\\b" + escape(name) + "\\b", name.length <= 4 ? "" : "i")])
  : [];

for (const file of walk(root)) {
  const src = readFileSync(file, "utf8");
  const isLint = file.endsWith("lint.mjs");
  src.split("\n").forEach((text, i) => {
    if (DASH.test(text)) say(file, i + 1, "long dash");
    if (MONEY.test(text)) say(file, i + 1, "currency symbol");
    if (!isLint) for (const [name, re] of banned) if (re.test(text)) say(file, i + 1, `a name that must not appear: ${name}`);
  });
  if (isLint) continue;
  const prose = /\.(js|mjs)$/.test(file) ? strings(src) : src.split("\n").map((text, i) => ({ text, line: i + 1 }));
  for (const { text, line } of prose) {
    if (/[A-Za-z0-9)]!(\s|$)/.test(text)) say(file, line, "exclamation mark");
    const filler = text.match(FILLER);
    if (filler && /\s/.test(text.trim())) say(file, line, `filler word: ${filler[0]}`);
    const brit = text.match(BRITISH);
    if (brit && /\s/.test(text.trim())) say(file, line, `spelling: ${brit[0]}`);
    if (/\b(e\.g\.|i\.e\.)/.test(text)) say(file, line, "write \"for example\" or \"that is\"");
  }
}

// ---- content ---------------------------------------------------------------------------------------
const load = (p) => import(pathToFileURL(join(root, p)).href);
const { CASES } = await load("src/content/cases.js");
const { REFS, LAYERS } = await load("src/content/kit.js");
const { CARDS, TOPICS } = await load("src/content/cards.js");
const { QA } = await load("src/content/qa.js");
const { SUMS, PERSONAL, UNSEEN, PHASES } = await load("src/content/drills.js");
const { LESSONS } = await load("src/content/primer.js");
const { VIDEOS } = await load("src/content/videos.js");
const { SESSIONS } = await load("src/content/plan.js");
const { MINE, BEATS } = await load("src/content/mine.js");

function unique(what, ids) {
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) problems.push(`content  ${what}: "${id}" appears twice`);
    seen.add(id);
  }
}
unique("case", CASES.map((c) => c.id));
unique("card", CARDS.map((c) => c.id));
unique("question", QA.map((q) => q.id));
unique("sum", SUMS.map((s) => s.id));
unique("pushback", PERSONAL.map((p) => p.id));
unique("prompt", [...UNSEEN.map((u) => u.id), ...CASES.map((c) => c.id)]);
unique("lesson", LESSONS.map((l) => l.id));
unique("video", VIDEOS.map((v) => v.id));
unique("kit card", LAYERS.flatMap((l) => l.cards.map((c) => c.id)));
// A component has a plain name. The product is an example, kept apart from the name.
for (const c of LAYERS.flatMap((l) => l.cards)) {
  if (!c.name || !c.aws || !c.eq) problems.push(`content  kit card ${c.id}: needs a plain name, an AWS example, and other examples`);
  if (/\b(AWS|Amazon|SageMaker|Bedrock|Kinesis)\b/.test(c.name || "")) problems.push(`content  kit card ${c.id}: the name is a product. Name the component, and put the product in the example`);
}
for (const c of CARDS) if (!TOPICS.some((t) => t.id === c.topic)) problems.push(`content  card ${c.id}: no topic "${c.topic}"`);
for (const l of LESSONS) for (const c of l.checks) if (!(c.right >= 0 && c.right < c.options.length)) problems.push(`content  lesson ${l.id}, check ${c.id}: the right answer is out of range`);
if (PHASES.reduce((n, p) => n + p.minutes, 0) !== 25) problems.push("content  the mock phases do not add up to 25 minutes");
if (BEATS.reduce((n, b) => n + b.secs, 0) !== 600) problems.push("content  the beats of your own case do not add up to ten minutes");
unique("own case", MINE.map((m) => m.id));
unique("probe", MINE.flatMap((m) => m.probes.map((p) => p.id)));
for (const m of MINE) for (const b of BEATS) if (!m.beats[b.id]?.say || !m.beats[b.id]?.ask?.length) problems.push(`content  own case ${m.id}: the beat "${b.id}" is missing a line or its questions`);

const specs = [...CASES.flatMap((c) => c.diagrams.map((d) => [d.spec, d.notes || {}])), ...REFS.map((r) => [r.spec, r.notes || {}]), ...MINE.flatMap((m) => m.diagrams.map((d) => [d.spec, d.notes || {}]))];
unique("diagram", specs.map(([s]) => s.id));
for (const [s, notes] of specs) {
  const where = `content  diagram ${s.id}:`;
  const placed = s.layers.flatMap((l) => l.nodes);
  const layerOf = Object.fromEntries(s.layers.flatMap((l, i) => l.nodes.map((n) => [n, i])));
  unique(`box in ${s.id}`, placed);
  for (const id of placed) if (!s.nodes[id]) problems.push(`${where} box "${id}" is in a layer and is not defined`);
  for (const id of Object.keys(s.nodes)) if (!placed.includes(id)) problems.push(`${where} box "${id}" is defined and is not in a layer`);
  for (const id of Object.keys(notes)) if (!s.nodes[id]) problems.push(`${where} a note is written for "${id}", which is not a box`);
  const steps = s.steps.length;
  for (const e of s.edges) {
    if (!s.nodes[e.a] || !s.nodes[e.b]) {
      problems.push(`${where} an arrow joins "${e.a}" to "${e.b}", and one of them is missing`);
      continue;
    }
    if ((e.at || 1) > steps) problems.push(`${where} arrow ${e.a} to ${e.b} appears at step ${e.at}, past the last step`);
    if ((e.at || 1) < Math.max(s.nodes[e.a].at || 1, s.nodes[e.b].at || 1)) problems.push(`${where} arrow ${e.a} to ${e.b} appears before one of its boxes`);
    if (layerOf[e.a] === layerOf[e.b]) {
      const row = s.layers[layerOf[e.a]].nodes;
      if (Math.abs(row.indexOf(e.a) - row.indexOf(e.b)) !== 1) problems.push(`${where} arrow ${e.a} to ${e.b} joins boxes in one layer that are not neighbors`);
    }
  }
  for (const n of Object.values(s.nodes)) if ((n.at || 1) > steps) problems.push(`${where} box "${n.t}" appears past the last step`);
  for (const b of s.base || []) if ((b.at || 1) > steps) problems.push(`${where} a bar appears past the last step`);
  for (let k = 1; k <= steps; k++) {
    const any = Object.values(s.nodes).some((n) => (n.at || 1) === k) || s.edges.some((e) => (e.at || 1) === k) || (s.base || []).some((b) => (b.at || 1) === k);
    if (!any) problems.push(`${where} step ${k} draws nothing`);
  }
  // Keep a diagram small enough to draw from memory, and keep products out of the box names.
  if (placed.length > 9) problems.push(`${where} has ${placed.length} boxes. Nine is the most a person redraws from memory`);
  for (const n of Object.values(s.nodes)) {
    if (/\b(AWS|Amazon|SageMaker|Bedrock|Kinesis|AgentCore|DynamoDB|EMR|EKS|S3)\b/.test(n.t)) problems.push(`${where} box "${n.t}" is named after a product. Put the product in brackets on the second line`);
    if (n.s && n.s.startsWith("(") !== n.s.endsWith(")")) problems.push(`${where} box "${n.t}" has an example with one bracket missing`);
    if (n.s && /\b(AWS|Amazon|SageMaker|Bedrock|Kinesis|AgentCore|DynamoDB|EMR|EKS|S3|Lake Formation|Athena|Glue)\b/.test(n.s) && !n.s.startsWith("(")) problems.push(`${where} box "${n.t}" names a product outside brackets`);
  }
  const nums = s.edges.filter((e) => e.n != null).map((e) => e.n);
  unique(`flow number in ${s.id}`, nums);
}
for (const s of SESSIONS)
  for (const it of s.items) {
    const ok = it.kind === "todo" ? !!it.id : it.kind === "case" ? CASES.some((c) => c.id === it.ref) : it.kind === "lesson" ? LESSONS.some((l) => l.id === it.ref) : it.kind === "video" ? VIDEOS.some((v) => v.id === it.ref) : false;
    if (!ok) problems.push(`content  plan ${s.id}: an item points at something that is not there (${it.ref || it.id})`);
  }

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"}.`);
  process.exit(1);
}
console.log(`lint: clean. ${banned.length ? banned.length + " banned names checked." : "No banned-name list found, so names were not checked."}`);
