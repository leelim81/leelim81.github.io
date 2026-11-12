#!/usr/bin/env python3
"""Build and verify the practice content.

    python dev/build.py            build content/ and verify every task and question
    python dev/build.py houses     build only the tasks whose id contains "houses" (quick loop)

For every coding task this script:
  1. writes the input files to a fresh folder and runs the reference solution,
  2. compares the result with an independent re-implementation (the oracle) when there is one,
  3. runs the checks on the reference output and requires every check to pass,
  4. runs each known-wrong variant and requires the named checks to fail with the right hint,
  5. runs the checks on an empty folder to make sure they fail cleanly.
"""
import contextlib
import importlib
import io
import json
import os
import shutil
import sys
import tempfile
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

DEV = Path(__file__).resolve().parent
ROOT = DEV.parent
sys.path.insert(0, str(DEV))
sys.path.insert(0, str(ROOT / "py"))
import ninety_check  # noqa: E402

EX_MODULES = ["ex_houses", "ex_shop", "ex_cars", "ex_models", "ex_mock1", "ex_mock2"]


def write_files(folder, files):
    for rel, text in files.items():
        p = Path(folder) / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)


def run_code(source, folder, label):
    """Run a script inside folder, the way the site does. Returns stdout."""
    old = os.getcwd()
    buf = io.StringIO()
    os.chdir(folder)
    try:
        with contextlib.redirect_stdout(buf), warnings.catch_warnings():
            warnings.simplefilter("error")          # a warning in a reference solution is a bug
            warnings.filterwarnings("ignore", category=ResourceWarning)
            exec(compile(source, label, "exec"), {"__name__": "__main__"})
    finally:
        os.chdir(old)
    return buf.getvalue()


def grade(ex, work, hidden):
    return json.loads(ninety_check.run_grader(ex["grader"], str(work), str(hidden)))


def frames_equal(a, b, what, decimals=None):
    """decimals: {column: places} for columns where a half may round either way."""
    a = a.reset_index(drop=True)
    b = b.reset_index(drop=True)
    assert list(a.columns) == list(b.columns), f"{what}: columns {list(a.columns)} != {list(b.columns)}"
    assert len(a) == len(b), f"{what}: {len(a)} rows != {len(b)}"
    for col in a.columns:
        same = ninety_check.Checker._same(a[col], b[col], tol=1e-7, decimals=(decimals or {}).get(col))
        assert same.all(), f"{what}: column {col} differs in {int((~same).sum())} rows, first at {int(np.argmax(~same))}: {a[col].iloc[int(np.argmax(~same))]!r} vs {b[col].iloc[int(np.argmax(~same))]!r}"


def build_exercise(ex, tmp):
    eid = ex["id"]
    t0 = time.time()
    base = Path(tmp) / eid
    work = base / "work"
    hidden = base / "hidden"
    work.mkdir(parents=True)
    hidden.mkdir()
    write_files(work, ex["inputs"])
    write_files(hidden, ex.get("hidden", {}))

    # 1. reference solution
    out = run_code(ex["solution"], work, f"{eid}/solution")
    for rel in ex["outputs"]:
        assert (work / rel).is_file(), f"{eid}: the solution did not write {rel}"
    hidden_files = dict(ex.get("hidden", {}))
    for rel in ex.get("expect", []):
        hidden_files[f"expected/{rel}"] = (work / rel).read_text()
    for rel, text in (ex.get("expected_override") or {}).items():
        hidden_files[f"expected/{rel}"] = text
    write_files(hidden, hidden_files)

    # 2. oracle
    if ex.get("oracle"):
        for rel, frame in ex["oracle"](ex["inputs"]).items():
            got = pd.read_csv(hidden / "expected" / rel)
            want = pd.read_csv(io.StringIO(frame.to_csv(index=False)))
            frames_equal(got, want, f"{eid}: oracle vs expected {rel}", ex.get("oracle_decimals"))

    # 3. variants: run each, keep the columns that differ so the checks can recognize the mistake
    variant_meta, variant_runs = [], []
    for v in ex.get("variants", []):
        vwork = base / f"variant-{v['name']}"
        vwork.mkdir()
        write_files(vwork, ex["inputs"])
        try:
            run_code(v["code"], vwork, f"{eid}/variant-{v['name']}")
        except Warning:
            pass
        variant_runs.append((v, vwork))
        if not v.get("hint"):
            continue
        files = {}
        for rel in ex.get("expect", []):
            if not (vwork / rel).is_file():
                continue
            vdf = pd.read_csv(vwork / rel)
            exp = pd.read_csv(hidden / "expected" / rel)
            vdf = vdf[[c for c in vdf.columns if not str(c).startswith("Unnamed")]]
            key = ex.get("align")
            if key:
                keys = [key] if isinstance(key, str) else list(key)
                if not set(keys) <= set(vdf.columns) or vdf.duplicated(keys).any() or len(vdf) != len(exp):
                    continue
                a, b = vdf.set_index(keys), exp.set_index(keys)
                if set(a.index) != set(b.index):
                    continue
                vdf = a.loc[b.index].reset_index()
            elif len(vdf) != len(exp):
                continue
            keep = [c for c in exp.columns if c in vdf.columns
                    and not ninety_check.Checker._same(vdf[c], exp[c], tol=1e-7).all()]
            if keep:
                path = f"variants/{v['name']}/{rel}"
                hidden_files[path] = vdf[keep].to_csv(index=False)
                files[rel] = path
        if files:
            variant_meta.append({"name": v["name"], "hint": v["hint"], "files": files})
    if variant_meta:
        hidden_files["variants.json"] = json.dumps(variant_meta)
    shutil.rmtree(hidden)
    hidden.mkdir()
    write_files(hidden, hidden_files)

    # 4. the reference output passes every check
    res = grade(ex, work, hidden)
    names = [i["name"] for i in res["items"]]
    assert len(names) == len(set(names)), f"{eid}: duplicate check names"
    bad = [i for i in res["items"] if i["status"] != "pass"]
    assert not bad, f"{eid}: the reference solution fails: {json.dumps(bad, indent=1)}"

    # 5. each variant fails where it should, with its hint
    for v, vwork in variant_runs:
        r = grade(ex, vwork, hidden)
        assert [i["name"] for i in r["items"]] == names, f"{eid}/{v['name']}: the check list changed"
        status = {i["name"]: i for i in r["items"]}
        for name in v["fails"]:
            assert name in status, f"{eid}/{v['name']}: no check named {name!r}"
            assert status[name]["status"] == "fail", f"{eid}/{v['name']}: {name!r} is {status[name]['status']}, expected fail"
            assert status[name]["msg"], f"{eid}/{v['name']}: {name!r} failed without a message"
        if v.get("hint") and not v.get("hint_optional"):
            hit = [n for n in v["fails"] if v["hint"] in status[n]["hint"]]
            assert hit, f"{eid}/{v['name']}: hint not shown. Got: {[status[n]['hint'] for n in v['fails']]}"
        others = [n for n, i in status.items() if i["status"] == "fail" and n not in v["fails"]]
        allowed = set(v.get("also", []))
        assert set(others) <= allowed, f"{eid}/{v['name']}: unexpected failures {others}"

    # 6. an empty folder fails cleanly
    empty = base / "empty"
    empty.mkdir()
    write_files(empty, ex["inputs"])
    r = grade(ex, empty, hidden)
    assert [i["name"] for i in r["items"]] == names, f"{eid}: the check list changed on an empty folder"
    assert all(i["status"] in ("fail", "skip") for i in r["items"]) and r["items"][0]["status"] == "fail", f"{eid}: empty folder passed something"

    payload = {"inputs": ex["inputs"], "hidden": hidden_files}
    (ROOT / "content" / "ex").mkdir(parents=True, exist_ok=True)
    (ROOT / "content" / "ex" / f"{eid}.json").write_text(json.dumps(payload, separators=(",", ":")))
    meta = {k: ex[k] for k in ("id", "module", "title", "story", "minutes", "desc", "starter", "solution", "hints", "grader", "outputs")}
    meta["files"] = [{"path": rel, "bytes": len(text.encode())} for rel, text in ex["inputs"].items()]
    meta["checks"] = [{"name": i["name"], "hidden": i["hidden"]} for i in res["items"]]
    meta["notes"] = ex.get("notes", "")
    size = len(json.dumps(payload)) / 1024
    print(f"  ok  {eid:24s} {len(names):2d} checks, {len(ex.get('variants', [])):2d} variants, {size:7.0f} KB, {time.time() - t0:5.1f}s"
          + (f"   stdout: {out.strip()[:70]!r}" if out.strip() else ""))
    for note in res["notes"]:
        print(f"        note: {note}")
    return meta, res


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    print(f"python {sys.version.split()[0]}, pandas {pd.__version__}, numpy {np.__version__}")
    metas = []
    tmp = tempfile.mkdtemp(prefix="ninety-build-")
    try:
        for modname in EX_MODULES:
            if not (DEV / f"{modname}.py").is_file():
                continue
            mod = importlib.import_module(modname)
            for ex in mod.exercises():
                if only and only not in ex["id"]:
                    continue
                meta, _ = build_exercise(ex, tmp)
                metas.append(meta)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if only:
        print(f"built {len(metas)} task(s) (partial build: bank.json not written)")
        return
    import bank  # noqa: E402  (quiz, sets, plan, mocks, and the refresher course)
    data = bank.assemble(metas)
    # every snippet in the refresher runs cleanly, prints something, and is quick
    labs = 0
    for les in data["course"]["lessons"]:
        for block in les["blocks"]:
            if block["kind"] != "lab":
                continue
            folder = tempfile.mkdtemp(prefix="ninety-lab-")
            t0 = time.time()
            try:
                out = run_code(block["code"], folder, f"lesson {les['id']}")
            finally:
                shutil.rmtree(folder, ignore_errors=True)
            took = time.time() - t0
            assert out.strip(), f"{les['id']}: the snippet prints nothing"
            assert took < 20, f"{les['id']}: the snippet took {took:.0f} s"
            labs += 1
            if os.environ.get("SHOW_LABS"):
                print(f"--- {les['id']} ({took:.1f}s)\n{out.rstrip()}")
    checks = sum(1 for les in data["course"]["lessons"] for b in les["blocks"] if b["kind"] == "check")
    print(f"refresher: {len(data['course']['lessons'])} lessons, {checks} checks, {labs} snippets run")
    # every code recall card runs with its answers filled in, every accepted spelling works, and the listed wrong answers fail
    import recall  # noqa: E402
    ran = 0
    for label, source, should_pass in recall.cases():
        folder = tempfile.mkdtemp(prefix="ninety-card-")
        try:
            run_code(source, folder, f"card {label}")
            passed, why = True, ""
        except Exception as err:  # noqa: BLE001  (any failure counts)
            passed, why = False, f"{type(err).__name__}: {err}"
        finally:
            shutil.rmtree(folder, ignore_errors=True)
        assert passed == should_pass, f"card {label}: " + (why or "a wrong answer passed")
        ran += 1
        if os.environ.get("SHOW_CARDS"):
            print(f"  {'pass' if passed else 'fail'}  {label}  {why[:110]}")
    print(f"code recall: {len(data['recall']['cards'])} cards, {ran} programs run")
    (ROOT / "content" / "bank.json").write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
    print(f"bank.json: {len(metas)} coding tasks, {len(data['questions'])} quiz questions, "
          f"{(ROOT / 'content' / 'bank.json').stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
