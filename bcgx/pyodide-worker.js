/* Pyodide runtime. numpy, pandas, and scikit-learn load at startup, outside the run timer. */
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs";

let pyodide = null;
let booting = null;
let warming = null;
let runtimeReady = false;
const loaded = new Set();
const INDEX = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";
const LOADING = "Loading Python, pandas, NumPy, scikit-learn…";

const PREIMPORT =
  "import numpy as np\n" +
  "import pandas as pd\n" +
  "import sklearn\n" +
  "import sklearn.preprocessing\n" +
  "import sklearn.model_selection\n" +
  "import sklearn.linear_model\n" +
  "import sklearn.ensemble\n" +
  "import sklearn.metrics\n" +
  "import sklearn.pipeline\n" +
  "import sklearn.compose\n" +
  "import sklearn.impute\n" +
  "import sklearn.cluster\n";

function preload(text) {
  postMessage({ id: 0, type: "status", phase: "preload", text });
}

function canonical(raw) {
  const map = {
    sklearn: "scikit-learn",
    "scikit-learn": "scikit-learn",
    numpy: "numpy",
    pandas: "pandas",
    scipy: "scipy",
    micropip: "micropip",
    joblib: "joblib",
    threadpoolctl: "threadpoolctl",
  };
  return map[raw] || raw;
}

async function boot() {
  if (pyodide) return pyodide;
  if (booting) return booting;
  booting = (async () => {
    preload(LOADING);
    pyodide = await loadPyodide({ indexURL: INDEX });
    return pyodide;
  })();
  try {
    return await booting;
  } finally {
    booting = null;
  }
}

async function ensure(packages) {
  const py = await boot();
  const need = [];
  for (const raw of packages || []) {
    const name = canonical(raw);
    if (!loaded.has(name)) need.push(name);
  }
  if (need.length) {
    await py.loadPackage(need);
    need.forEach((name) => loaded.add(name));
  }
  return py;
}

async function warm() {
  if (runtimeReady) return pyodide;
  if (warming) return warming;
  warming = (async () => {
    preload(LOADING);
    const py = await boot();
    preload(LOADING);
    await py.loadPackage(["numpy", "pandas"]);
    loaded.add("numpy");
    loaded.add("pandas");
    await py.loadPackage(["scikit-learn"]);
    loaded.add("scikit-learn");
    await py.runPythonAsync(PREIMPORT, { dedent: false });
    runtimeReady = true;
    postMessage({ type: "runtime", ready: true });
    return py;
  })();
  try {
    return await warming;
  } catch (err) {
    warming = null;
    runtimeReady = false;
    throw err;
  }
}

let blackReady = null;
async function ensureBlack() {
  const py = await ensure(["micropip"]);
  if (blackReady) return blackReady;
  blackReady = (async () => {
    await py.runPythonAsync("import micropip\nawait micropip.install('black')\nimport black\n", { dedent: false });
    return true;
  })();
  try {
    return await blackReady;
  } catch (err) {
    blackReady = null;
    throw err;
  }
}

function infer(packages, source) {
  const set = new Set(packages || []);
  if (/\b(pandas|pd)\b/.test(source)) set.add("pandas");
  if (/\b(numpy|np)\b/.test(source)) set.add("numpy");
  if (/\bsklearn\b/.test(source)) set.add("scikit-learn");
  if (/\bscipy\b/.test(source)) set.add("scipy");
  return [...set];
}

async function loadImports(id, code) {
  const py = await warm();
  let announced = false;
  try {
    await py.loadPackagesFromImports(code, {
      messageCallback(message) {
        announced = true;
        postMessage({ id, type: "status", phase: "preload", text: String(message) });
      },
    });
  } catch {
    /* An unknown import fails again inside the user's own code. */
  }
  return announced;
}

async function runUser(id, payload) {
  const source = String(payload.source || "");
  const tests = payload.tests || [];
  const py = await warm();
  const extra = infer(payload.packages, source).filter((name) => !loaded.has(canonical(name)));
  if (extra.length) {
    postMessage({ id, type: "status", phase: "preload", text: "Loading " + extra.join(", ") + "…" });
    await ensure(extra);
  }
  const joined = [source].concat(tests.map((test) => test.code || "")).join("\n");
  await loadImports(id, joined);
  postMessage({ id, type: "executing" });
  const driver =
    "import sys, io, json, traceback\n" +
    "import numpy as np\n" +
    "import pandas as pd\n" +
    "_out, _err = io.StringIO(), io.StringIO()\n" +
    "_old_out, _old_err = sys.stdout, sys.stderr\n" +
    "sys.stdout, sys.stderr = _out, _err\n" +
    "_payload = {'ok': True, 'error': None, 'traceback': None, 'tests': []}\n" +
    "_ns = {'__name__': '__main__', 'np': np, 'pd': pd}\n" +
    "_user = " + JSON.stringify(source) + "\n" +
    "_tests = json.loads(" + JSON.stringify(JSON.stringify(tests)) + ")\n" +
    "try:\n" +
    "    exec(compile(_user, '<user>', 'exec'), _ns)\n" +
    "    for _t in _tests:\n" +
    "        try:\n" +
    "            exec(compile(_t['code'], '<test>', 'exec'), _ns)\n" +
    "            _payload['tests'].append({'name': _t['name'], 'passed': True})\n" +
    "        except Exception as _e:\n" +
    "            _payload['tests'].append({'name': _t['name'], 'passed': False, 'message': str(_e), 'traceback': traceback.format_exc()[-5000:]})\n" +
    "except Exception as _e:\n" +
    "    _payload['ok'] = False\n" +
    "    _payload['error'] = str(_e)\n" +
    "    _payload['traceback'] = traceback.format_exc()[-5000:]\n" +
    "finally:\n" +
    "    sys.stdout, sys.stderr = _old_out, _old_err\n" +
    "_payload['stdout'] = _out.getvalue()[-30000:]\n" +
    "_payload['stderr'] = _err.getvalue()[-8000:]\n" +
    "json.dumps(_payload)\n";
  const produced = py.runPython(driver, { dedent: false });
  const raw = typeof produced === "string" ? produced : String(produced);
  const result = JSON.parse(raw);
  postMessage({ id, type: "result", result });
}

async function formatCode(id, code) {
  await boot();
  await ensureBlack();
  const raw = pyodide.runPython(
    "import black\nblack.format_str(" + JSON.stringify(code) + ", mode=black.Mode(line_length=88))\n",
    { dedent: false }
  );
  postMessage({ id, type: "formatted", code: raw });
}

warm().catch((err) => {
  postMessage({ type: "runtime", ready: false, message: String(err && err.message ? err.message : err) });
});

self.onmessage = async (event) => {
  const msg = event.data || {};
  const id = msg.id;
  try {
    if (msg.cmd === "run") await runUser(id, msg);
    else if (msg.cmd === "format") await formatCode(id, msg.code || "");
    else postMessage({ id, type: "error", message: "Unknown command" });
  } catch (err) {
    postMessage({ id, type: "error", message: String(err && err.message ? err.message : err) });
  }
};
