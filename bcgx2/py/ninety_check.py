"""Checks for the coding tasks.

The same file runs in the browser (Pyodide) and in CPython (dev/build.py).
A grader is Python source that defines grade(c), where c is a Checker.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

SKIPPED = "Not checked yet. Fix the earlier checks first."


def _show(v):
    """Short text for a value inside a message."""
    if v is None:
        return "missing"
    if isinstance(v, (float, np.floating)):
        if np.isnan(v):
            return "missing"
        if float(v).is_integer() and abs(v) < 1e15:
            return str(int(v))
        return f"{float(v):.6g}"
    if isinstance(v, (np.integer,)):
        return str(int(v))
    if isinstance(v, (np.bool_, bool)):
        return str(bool(v))
    return str(v)


def _count(n, total):
    return f"{n:,} of {total:,}"


class Checker:
    def __init__(self, work, hidden):
        self.work = Path(work)
        self.hidden = Path(hidden)
        self.items = []
        self.notes = []
        self._plan = []
        self._hidden = {}
        self._variants = None
        self._cache = {}

    # ---- recording -------------------------------------------------------
    def plan(self, *names):
        """Declare every check, in display order. Pass (name, True) for a hidden check."""
        for n in names:
            name, hid = (n, False) if isinstance(n, str) else (n[0], bool(n[1]))
            self._plan.append(name)
            self._hidden[name] = hid

    def check(self, name, ok, msg="", hint=""):
        ok = bool(ok)
        self.items.append({
            "name": name,
            "status": "pass" if ok else "fail",
            "msg": "" if ok else str(msg),
            "hint": "" if ok else str(hint),
            "hidden": self._hidden.get(name, False),
        })
        return ok

    def note(self, text):
        self.notes.append(str(text))

    def finish(self):
        done = {}
        for it in self.items:
            done.setdefault(it["name"], it)
        out = []
        for name in self._plan:
            out.append(done.pop(name, None) or {
                "name": name, "status": "skip", "msg": SKIPPED, "hint": "",
                "hidden": self._hidden.get(name, False),
            })
        out.extend(done.values())
        return out

    # ---- files -----------------------------------------------------------
    def output(self, rel, saved=None, no_index=None):
        """Read a CSV the task asked for. Records the 'is saved' and 'no index column' checks."""
        saved = saved or f"{rel} is saved in the task folder"
        no_index = no_index or f"{rel} has no index column"
        path = self.work / rel
        if not path.is_file():
            others = sorted(p.name for p in self.work.glob("*.csv"))
            self.check(saved, False, f"There is no file named {rel}.",
                       "Check the file name and the folder. " + (f"CSV files here: {', '.join(others)}." if others else ""))
            return None
        try:
            df = pd.read_csv(path, float_precision="round_trip")
        except Exception as e:  # noqa: BLE001
            self.check(saved, False, f"{rel} can't be read as a CSV: {type(e).__name__}: {e}")
            return None
        if df.shape[1] == 0:
            self.check(saved, False, f"{rel} is empty.")
            return None
        self.check(saved, True)
        bad = [str(c) for c in df.columns if str(c).startswith("Unnamed")]
        if not self.check(no_index, not bad, f"{rel} starts with an unnamed column ({', '.join(bad)}).",
                          "Save with index=False."):
            df = df.drop(columns=[c for c in df.columns if str(c).startswith("Unnamed")])
        return df

    def expected(self, rel):
        return self._read(self.hidden / "expected" / rel)

    def secret(self, rel):
        return self._read(self.hidden / rel)

    def given(self, rel, **kw):
        return pd.read_csv(self.work / rel, **kw)

    def _read(self, path):
        key = str(path)
        if key not in self._cache:
            self._cache[key] = pd.read_csv(path, float_precision="round_trip")
        return self._cache[key].copy()

    # ---- structure -------------------------------------------------------
    def columns(self, name, df, cols, hint=""):
        got = [str(c) for c in df.columns]
        cols = list(cols)
        if got == cols:
            return self.check(name, True)
        missing = [c for c in cols if c not in got]
        extra = [c for c in got if c not in cols]
        if missing or extra:
            parts = []
            if missing:
                parts.append("missing: " + ", ".join(missing))
            if extra:
                parts.append("not expected: " + ", ".join(extra))
            msg = "The columns don't match (" + "; ".join(parts) + ")."
        else:
            msg = "The columns are right but the order is wrong."
        return self.check(name, False, msg, hint or "Expected, in order: " + ", ".join(cols) + ".")

    def rows(self, name, df, exp, key, fewer="", more="", what="row"):
        """Same set of keys, each once. Returns df reordered to match exp, or None."""
        keys = [key] if isinstance(key, str) else list(key)
        if df.duplicated(keys).any():
            n = int(df.duplicated(keys).sum())
            self.check(name, False, f"{n:,} {what}s appear more than once.",
                       more or "Duplicate keys on the right side of a join multiply rows.")
            return None
        if len(df) != len(exp):
            few = len(df) < len(exp)
            self.check(name, False, f"Expected {len(exp):,} {what}s, found {len(df):,}.", fewer if few else more)
            return None
        a = df.set_index(keys)
        b = exp.set_index(keys)
        try:
            same = set(a.index) == set(b.index)
        except TypeError:
            same = False
        if not same:
            self.check(name, False, f"The {' and '.join(keys)} values don't match the expected {what}s.",
                       "Check the key column's values and type.")
            return None
        self.check(name, True)
        return a.loc[b.index].reset_index()

    def order(self, name, df, exp, key, hint=""):
        keys = [key] if isinstance(key, str) else list(key)
        try:
            ok = len(df) == len(exp) and all(
                self._same(df[k].reset_index(drop=True), exp[k].reset_index(drop=True)).all() for k in keys)
        except Exception:  # noqa: BLE001
            ok = False
        return self.check(name, ok, "The rows are not in the order the task asks for.", hint)

    def frames(self, rels, cols_name, rows_name, key, cols_hint=""):
        """Outputs that must keep the columns, rows, and row order of their expected files.

        Records the saved and index checks for each file, then cols_name and rows_name.
        Returns [(rel, got, exp)] or None.
        """
        loaded = [(rel, self.output(rel)) for rel in rels]
        if any(df is None for _, df in loaded):
            return None
        pairs = [(rel, df, self.expected(rel)) for rel, df in loaded]
        probs, want = [], []
        for rel, df, exp in pairs:
            got = [str(x) for x in df.columns]
            want = list(exp.columns)
            if got == want:
                continue
            missing = [x for x in want if x not in got]
            extra = [x for x in got if x not in want]
            if missing or extra:
                bits = []
                if missing:
                    bits.append("missing: " + ", ".join(missing))
                if extra:
                    bits.append("not expected: " + ", ".join(extra))
                probs.append(f"{rel}: columns don't match ({'; '.join(bits)}).")
            else:
                probs.append(f"{rel}: the columns are right but the order is wrong.")
        if not self.check(cols_name, not probs, " ".join(probs),
                          cols_hint or "Expected, in order: " + ", ".join(want) + "."):
            return None
        probs = []
        for rel, df, exp in pairs:
            if len(df) != len(exp):
                probs.append(f"{rel} should have {len(exp):,} rows, found {len(df):,}.")
            elif not self._same(df[key], exp[key]).all():
                probs.append(f"{rel}: the rows are not in their original order.")
        if not self.check(rows_name, not probs, " ".join(probs),
                          "A processing step never drops, sorts, or shuffles rows, least of all in the test set."):
            return None
        return pairs

    def integers(self, name, df, cols, hint=""):
        bad = [c for c in cols if c in df.columns and not pd.api.types.is_integer_dtype(df[c])]
        detail = ", ".join(f"{c} is {df[c].dtype}" for c in bad)
        return self.check(name, not bad, f"These columns should hold whole numbers: {detail}.",
                          hint or "A missing value turns an integer column into floats, so 3 is saved as 3.0. Fill it, then cast to int.")

    # ---- values ----------------------------------------------------------
    @staticmethod
    def _same(got, exp, tol=1e-6, decimals=None):
        """Row-wise equality of two aligned Series. Returns a boolean array."""
        if pd.api.types.is_numeric_dtype(exp) and not pd.api.types.is_bool_dtype(exp):
            g = pd.to_numeric(got, errors="coerce").to_numpy(dtype=float)
            e = pd.to_numeric(exp, errors="coerce").to_numpy(dtype=float)
            if decimals is None:
                return np.isclose(g, e, rtol=1e-9, atol=tol, equal_nan=True)
            scale = 10.0 ** decimals
            near = np.abs(g - e) <= 1.0 / scale + 1e-9   # either way of rounding a half is accepted
            rounded = np.round(g, decimals) == g          # 12.340000000000002 is not rounded
            both_nan = np.isnan(g) & np.isnan(e)
            return (near & rounded) | both_nan
        g = got.astype("object").where(got.notna(), None)
        e = exp.astype("object").where(exp.notna(), None)
        return np.array([(a is None and b is None) or (a is not None and b is not None and str(a) == str(b))
                         for a, b in zip(g, e)], dtype=bool)

    def values(self, name, pairs, cols, key=None, tol=1e-6, decimals=None, hint=""):
        """Compare columns of aligned frames. pairs is a list of (rel, got, exp)."""
        decimals = decimals or {}
        problems, hints = [], []
        for rel, got, exp in pairs:
            label = "" if len(pairs) == 1 else f"{rel}: "
            for col in cols:
                if col not in got.columns:
                    problems.append(f"{label}{col} is missing.")
                    continue
                dec = decimals.get(col)
                same = self._same(got[col], exp[col], tol, dec)
                if same.all():
                    continue
                n = int((~same).sum())
                i = int(np.argmax(~same))
                keys = [key] if isinstance(key, str) else list(key or [])
                if keys and all(k in exp.columns for k in keys):
                    where = ", ".join(f"{k} {_show(exp[k].iloc[i])}" for k in keys) + ": "
                else:
                    where = f"row {i + 1}: "
                want = exp[col].iloc[i]
                if dec is not None and isinstance(want, (float, np.floating)) and not np.isnan(want):
                    want = round(float(want), dec)
                problems.append(f"{label}{col} is wrong in {_count(n, len(exp))} rows. "
                                f"First difference, {where}expected {_show(want)}, found {_show(got[col].iloc[i])}.")
                if dec is not None:
                    g = pd.to_numeric(got[col], errors="coerce").to_numpy(dtype=float)
                    e = pd.to_numeric(exp[col], errors="coerce").to_numpy(dtype=float)
                    if np.allclose(g, e, rtol=1e-9, atol=1e-6, equal_nan=True) or np.allclose(
                            np.round(g, dec), np.round(e, dec), atol=1e-9, equal_nan=True):
                        hints.append(f"The numbers are right. Round {col} to {dec} decimals.")
                        continue
                h = self._variant_hint(rel, col, got[col], tol, dec)
                if h:
                    hints.append(h)
        if not problems:
            return self.check(name, True)
        seen, uniq = set(), []
        for h in hints or ([hint] if hint else []):
            if h not in seen:
                seen.add(h)
                uniq.append(h)
        return self.check(name, False, " ".join(problems[:3]), " ".join(uniq[:2]))

    def _variant_hint(self, rel, col, got_col, tol, dec):
        if self._variants is None:
            p = self.hidden / "variants.json"
            self._variants = json.loads(p.read_text()) if p.is_file() else []
        for v in self._variants:
            path = v.get("files", {}).get(rel)
            if not path:
                continue
            try:
                vdf = self._read(self.hidden / path)
            except Exception:  # noqa: BLE001
                continue
            if col in vdf.columns and len(vdf) == len(got_col):
                try:
                    if self._same(got_col.reset_index(drop=True), vdf[col], tol, dec).all():
                        return v["hint"]
                except Exception:  # noqa: BLE001
                    continue
        return ""


def run_grader(source, work, hidden):
    """Run grader source against a task folder. Returns a JSON string."""
    c = Checker(work, hidden)
    try:
        ns = {"__name__": "grader"}
        exec(compile(source, "<checks>", "exec"), ns)
        ns["grade"](c)
    except Exception as e:  # noqa: BLE001
        c.items.append({
            "name": "The checks ran to the end",
            "status": "fail",
            "msg": f"A check stopped early: {type(e).__name__}: {e}",
            "hint": "This usually means an output file has an unexpected shape or type. Compare it with the spec.",
            "hidden": False,
        })
    return json.dumps({"items": c.finish(), "notes": c.notes})
