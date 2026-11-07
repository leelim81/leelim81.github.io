/* Pyodide runtime. Loads numpy, pandas, and scikit-learn on demand and keeps them. */
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs";

let pyodide = null;
let loading = null;
const loaded = new Set();
const INDEX = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";

function say(id, text) {
  postMessage({ id, type: "status", text });
}

async function boot(id) {
  if (pyodide) return pyodide;
  if (loading) return loading;
  loading = (async () => {
    say(id, "Loading Python runtime…");
    pyodide = await loadPyodide({ indexURL: INDEX });
    say(id, "Python is ready");
    return pyodide;
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

async function ensure(id, packages) {
  const py = await boot(id);
  const map = { sklearn: "scikit-learn", "scikit-learn": "scikit-learn", numpy: "numpy", pandas: "pandas", scipy: "scipy", micropip: "micropip" };
  const need = [];
  for (const raw of packages || []) {
    const name = map[raw] || raw;
    if (!loaded.has(name)) need.push(name);
  }
  if (need.length) {
    say(id, "Loading " + need.join(", ") + "…");
    await py.loadPackage(need);
    need.forEach((n) => loaded.add(n));
  }
  return py;
}

let blackReady = null;
async function ensureBlack(id) {
  const py = await ensure(id, ["micropip"]);
  if (blackReady) return blackReady;
  blackReady = (async () => {
    say(id, "Loading formatter…");
    await py.runPythonAsync(
      "import micropip\nawait micropip.install('black')\nimport black\n",
      { dedent: false }
    );
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

async function runUser(id, payload) {
  const source = String(payload.source || "");
  const tests = payload.tests || [];
  const py = await ensure(id, infer(["numpy", "pandas"].concat(payload.packages || []), source));
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
  const raw = await py.runPythonAsync(driver, { dedent: false });
  const result = JSON.parse(raw);
  postMessage({ id, type: "result", result });
}

async function formatCode(id, code) {
  const py = await boot(id);
  await ensureBlack(id);
  const raw = await py.runPythonAsync(
    "import black\nblack.format_str(" + JSON.stringify(code) + ", mode=black.Mode(line_length=88))\n",
    { dedent: false }
  );
  postMessage({ id, type: "formatted", code: raw });
}

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
