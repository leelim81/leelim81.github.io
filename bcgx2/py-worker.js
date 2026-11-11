// Ninety: the Python runtime.
//
// One worker serves the whole visit. It loads Pyodide once, keeps pandas and scikit-learn in memory,
// and then runs code, checks, and console lines for every task. Nothing is reloaded between tasks.
// The page can't interrupt Python, so "Stop" ends this worker and starts a new one.

const CDN = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";
const HERE = new URL(".", self.location.href);
const QS = self.location.search; // ?v=<build>, passed on to same-origin files

// scikit-learn parts to import ahead of time, one group at a time so a waiting pandas-only run can go first
const WARM = [
  "sklearn",
  "sklearn.preprocessing, sklearn.impute",
  "sklearn.compose, sklearn.pipeline",
  "sklearn.model_selection",
  "sklearn.linear_model",
  "sklearn.tree, sklearn.ensemble",
  "sklearn.metrics",
];

const BOOT = String.raw`
import builtins, json, linecache, os, shutil, sys, time, traceback
sys.path.insert(0, "/ninety")
import numpy as np
import pandas as pd

pd.set_option("display.width", 160)
pd.set_option("display.max_columns", 30)

_HEAVY = ("sklearn", "scipy", "joblib", "threadpoolctl")
_NS = {}


def _ninety_needs(code):
    import importlib.util
    from pyodide.code import find_imports
    try:
        names = list(find_imports(code))
    except Exception:
        names = []
    missing = []
    for n in names:
        if n in sys.stdlib_module_names or n in _HEAVY:
            continue
        try:
            if importlib.util.find_spec(n) is None:
                missing.append(n)
        except Exception:
            missing.append(n)
    return json.dumps({"heavy": any(n in _HEAVY for n in names), "missing": missing})


def _ninety_clean(folder):
    os.chdir("/")
    shutil.rmtree(folder, ignore_errors=True)
    os.makedirs(folder, exist_ok=True)


def _ninety_files(folder):
    out = []
    for root, dirs, names in os.walk(folder):
        dirs[:] = sorted(d for d in dirs if d != "__pycache__")
        for n in sorted(names):
            p = os.path.join(root, n)
            out.append({"path": os.path.relpath(p, folder), "bytes": os.path.getsize(p)})
    return out


def _ninety_error(e, path, folder):
    tb = e.__traceback__
    while tb is not None and tb.tb_frame.f_code.co_filename != path:
        tb = tb.tb_next
    line = None
    if tb is None:
        text = "".join(traceback.format_exception_only(type(e), e))
        if isinstance(e, SyntaxError) and e.filename == path:
            line = e.lineno
    else:
        text = "".join(traceback.format_exception(type(e), e, tb))
        t = tb
        while t is not None:
            if t.tb_frame.f_code.co_filename == path:
                line = t.tb_lineno
            t = t.tb_next
    last = "".join(traceback.format_exception_only(type(e), e)).strip().splitlines()
    return {"text": text.replace(folder + "/", ""), "line": line, "summary": (last[-1] if last else type(e).__name__)[:400]}


def _ninety_run(slot, folder, code):
    path = folder + "/solution.py"
    with open(path, "w", encoding="utf-8") as f:
        f.write(code)
    linecache.cache.pop(path, None)
    os.chdir(folder)
    ns = {"__name__": "__main__", "__file__": path}
    _NS[slot] = ns
    sys.path.insert(0, folder)
    err = None
    t0 = time.perf_counter()
    try:
        exec(compile(code, path, "exec"), ns)
    except SystemExit:
        pass
    except BaseException as e:
        err = _ninety_error(e, path, folder)
    finally:
        try:
            sys.stdout.flush()
            sys.stderr.flush()
        except Exception:
            pass
        if folder in sys.path:
            sys.path.remove(folder)
    return json.dumps({"error": err, "seconds": round(time.perf_counter() - t0, 3), "files": _ninety_files(folder)})


def _ninety_grade(source, folder, hidden):
    import ninety_check
    os.chdir(folder)
    t0 = time.perf_counter()
    out = json.loads(ninety_check.run_grader(source, folder, hidden))
    out["seconds"] = round(time.perf_counter() - t0, 3)
    return json.dumps(out)


def _ninety_console(slot, folder, src):
    ns = _NS.get(slot)
    if ns is None:
        ns = _NS[slot] = {"__name__": "__console__"}
        if slot == "calc":
            exec("from math import *\nfrom statistics import NormalDist", ns)
    os.makedirs(folder, exist_ok=True)
    os.chdir(folder)
    err = None
    try:
        try:
            code = compile(src, "<console>", "single")
        except SyntaxError:
            code = compile(src, "<console>", "exec")
        exec(code, ns)
    except SystemExit:
        pass
    except BaseException as e:
        tb = e.__traceback__.tb_next if e.__traceback__ is not None else None
        if tb is None:
            err = "".join(traceback.format_exception_only(type(e), e))
        else:
            err = "".join(traceback.format_exception(type(e), e, tb))
    finally:
        try:
            sys.stdout.flush()
            sys.stderr.flush()
        except Exception:
            pass
    return json.dumps({"error": err})


def _ninety_versions():
    import scipy, sklearn
    return json.dumps({"python": sys.version.split()[0], "numpy": np.__version__, "pandas": pd.__version__,
                       "sklearn": sklearn.__version__, "scipy": scipy.__version__})
`;

let py = null;
let fn = {}; // Python helpers, by short name
const slots = new Map(); // slot -> input files of the task
let chain = Promise.resolve(); // runs, checks, and console lines go one at a time

const post = (m) => self.postMessage(m);
const status = (state, text, extra = {}) => post({ type: "status", state, text, ...extra });
const tick = () => new Promise((r) => setTimeout(r, 0));

// ---- output: batched, capped, and silent while the checks run -----------------------------
let outRun = 0;
let outBuf = [];
let outChars = 0;
let outCapped = false;
let outFlushed = 0;
let muted = false;
const OUT_LIMIT = 400000;

function flush() {
  if (outBuf.length && outRun) post({ type: "out", run: outRun, lines: outBuf });
  outBuf = [];
  outFlushed = performance.now();
}

function out(kind, line) {
  if (!outRun || muted || outCapped) return;
  outChars += line.length + 1;
  if (outChars > OUT_LIMIT) {
    outCapped = true;
    outBuf.push(["note", "Output cut off here. Print less to see the rest."]);
    flush();
    return;
  }
  outBuf.push([kind, line]);
  if (outBuf.length >= 200 || performance.now() - outFlushed > 120) flush();
}

function beginOutput(run) {
  flush();
  outRun = run;
  outChars = 0;
  outCapped = false;
  muted = false;
}

function endOutput() {
  flush();
  outRun = 0;
}

// ---- start-up ---------------------------------------------------------------------------
const t0 = performance.now();

async function bootA() {
  status("loading", "Starting Python", { step: 1 });
  const { loadPyodide } = await import(CDN + "pyodide.mjs");
  py = await loadPyodide({ indexURL: CDN, stdout: (s) => out("out", s), stderr: (s) => out("err", s) });
  status("loading", "Loading pandas", { step: 2 });
  await py.loadPackage(["numpy", "pandas"], { messageCallback: () => {}, errorCallback: (m) => console.warn(m) });
  const res = await fetch(new URL("py/ninety_check.py" + QS, HERE));
  if (!res.ok) throw new Error("The checks file did not load.");
  py.FS.mkdirTree("/ninety");
  py.FS.writeFile("/ninety/ninety_check.py", await res.text());
  py.FS.mkdirTree("/work");
  py.FS.mkdirTree("/hidden");
  py.runPython(BOOT);
  for (const name of ["needs", "clean", "run", "grade", "console", "versions"]) fn[name] = py.globals.get("_ninety_" + name);
  status("pandas", "pandas is ready. Loading scikit-learn", { step: 3, ms: Math.round(performance.now() - t0) });
}

async function bootB() {
  await py.loadPackage(["scipy", "scikit-learn"], { messageCallback: () => {}, errorCallback: (m) => console.warn(m) });
  status("pandas", "pandas is ready. Warming up scikit-learn", { step: 4 });
  for (const group of WARM) {
    await tick();
    py.runPython("import " + group);
  }
  let files = [];
  try {
    const lock = await (await fetch(CDN + "pyodide-lock.json")).json();
    const wheels = Object.keys(py.loadedPackages).map((n) => lock.packages[n]?.file_name).filter(Boolean);
    files = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json", ...wheels].map((f) => CDN + f);
  } catch {
    // the list only feeds the offline copy, so a miss here is harmless
  }
  status("ready", "Python is ready", { step: 5, ms: Math.round(performance.now() - t0), versions: JSON.parse(fn.versions()), files });
}

const readyA = bootA();
const readyB = readyA.then(bootB);
readyB.catch((err) => {
  const detail = String(err?.message || err);
  const text = /fetch|import|network|load/i.test(detail) ? "Python did not download. Check your connection, then try again" : "Python did not start";
  status("error", text, { detail });
});

// ---- files ------------------------------------------------------------------------------
function writeTree(root, files) {
  for (const [rel, text] of Object.entries(files)) {
    const full = root + "/" + rel;
    py.FS.mkdirTree(full.slice(0, full.lastIndexOf("/")));
    py.FS.writeFile(full, text);
  }
}

const folderOf = (slot) => "/work/" + slot;

// ---- operations -------------------------------------------------------------------------
const ops = {
  // Keep a task's input files, and write its hidden check data once.
  async prepare({ slot, files, hidden }) {
    await readyA;
    slots.set(slot, files);
    fn.clean("/hidden/" + slot);
    writeTree("/hidden/" + slot, hidden || {});
    return {};
  },

  // Run code in a fresh copy of the task folder. With a grader, run the checks afterwards.
  async run({ slot, code, grader, run }) {
    await readyA;
    const files = slots.get(slot);
    if (!files) return { missing: true };
    const needs = JSON.parse(fn.needs(code));
    const heavy = needs.heavy || (grader ? JSON.parse(fn.needs(grader)).heavy : false);
    if (heavy) {
      post({ type: "waiting", run, text: "Waiting for scikit-learn to finish loading" });
      await readyB;
    }
    if (needs.missing.length) {
      try {
        await py.loadPackagesFromImports(code, { messageCallback: () => {}, errorCallback: () => {} });
      } catch {
        // an import that can't be loaded fails in the run, with a normal Python error
      }
    }
    const folder = folderOf(slot);
    fn.clean(folder);
    writeTree(folder, files);
    beginOutput(run);
    post({ type: "started", run });
    let res;
    let result = null;
    try {
      res = JSON.parse(fn.run(slot, folder, code));
      flush();
      if (grader && !res.error) {
        post({ type: "checking", run });
        muted = true;
        result = JSON.parse(fn.grade(grader, folder, "/hidden/" + slot));
      }
    } finally {
      endOutput();
    }
    const inputs = new Set(Object.keys(files));
    res.files = res.files.filter((f) => f.path !== "solution.py").map((f) => ({ ...f, input: inputs.has(f.path) }));
    return { ...res, result };
  },

  // One console line, in the namespace of the last run.
  async console({ slot, src, run }) {
    await readyA;
    const needs = JSON.parse(fn.needs(src));
    if (needs.heavy) await readyB;
    beginOutput(run);
    try {
      return JSON.parse(fn.console(slot, folderOf(slot), src));
    } finally {
      endOutput();
    }
  },

  // Read a file from a task folder, for the preview.
  async read({ slot, path, max = 400000 }) {
    await readyA;
    if (path.split("/").includes("..")) throw new Error("That path is outside the task folder.");
    const data = py.FS.readFile(folderOf(slot) + "/" + path);
    const head = data.subarray(0, max);
    const binary = head.subarray(0, 2000).includes(0);
    return { text: binary ? "" : new TextDecoder().decode(head), bytes: data.length, truncated: data.length > max, binary };
  },
};

self.onmessage = (ev) => {
  const m = ev.data;
  chain = chain.then(async () => {
    try {
      const data = await ops[m.op](m);
      post({ type: "reply", id: m.id, ok: true, data });
    } catch (err) {
      const text = String(err?.message || err);
      post({ type: "reply", id: m.id, ok: false, error: text, fatal: /fatal|out of memory/i.test(text) });
    }
  });
};
