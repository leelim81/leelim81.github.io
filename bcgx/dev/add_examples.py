"""Attach a public example to every Python and SQL task, taken from the first test."""

from __future__ import annotations

import inspect
import math
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HARNESS = (ROOT / "py" / "harness.py").read_text()


def _is_nan(v) -> bool:
    return isinstance(v, float) and math.isnan(v)


def _fmt_float(v: float) -> str:
    if math.isnan(v):
        return "nan"
    r = round(v, 6)
    if abs(r - round(r)) < 1e-8:
        return str(int(round(r)))
    return format(r, ".6g")


def _py(v, depth=0) -> str:
    import numpy as np
    import pandas as pd

    if v is None or isinstance(v, (bool, int, str)):
        return repr(v)
    if isinstance(v, float):
        if math.isnan(v):
            return "float('nan')"
        return _fmt_float(v)
    if isinstance(v, pd.DataFrame):
        if len(v) > 12:
            cols = ", ".join(map(str, v.columns))
            head = v.head(4).to_string(index=False)
            return f"# {len(v)} rows, columns: {cols}\n# first rows:\n{head}"
        data = {}
        for col in v.columns:
            vals = []
            for item in v[col].tolist():
                if _is_nan(item):
                    vals.append(float("nan"))
                elif hasattr(item, "item") and not isinstance(item, (bytes, str)):
                    try:
                        vals.append(item.item())
                    except Exception:
                        vals.append(item)
                else:
                    vals.append(item)
            data[str(col)] = vals
        body = ", ".join(f"{k!r}: {_py(vals)}" for k, vals in data.items())
        return f"pd.DataFrame({{{body}}})"
    if isinstance(v, np.ndarray):
        if v.size > 24:
            flat = v.ravel()
            return f"# array shape {tuple(int(x) for x in v.shape)}\nnp.array({flat[:8].tolist()!r} + ...)  # first 8 values"
        return f"np.array({v.tolist()!r})"
    if isinstance(v, dict):
        inner = ", ".join(f"{_py(k)}: {_py(val)}" for k, val in v.items())
        return "{" + inner + "}"
    if isinstance(v, (list, tuple)):
        parts = [_py(x) for x in v]
        open_, close = ("[", "]") if isinstance(v, list) else ("(", ")")
        if len(v) == 1 and isinstance(v, tuple):
            return "(" + parts[0] + ",)"
        text = ", ".join(parts)
        if len(text) > 80:
            pad = "  " * (depth + 1)
            text = ",\n".join(pad + p for p in parts)
            return open_ + "\n" + text + "\n" + ("  " * depth) + close
        return open_ + text + close
    if isinstance(v, type):
        return f"class {v.__name__}"
    return repr(v)


def _small(v) -> bool:
    import numpy as np
    import pandas as pd

    if v is None or isinstance(v, (str, bool, int, float)):
        return True
    if isinstance(v, pd.DataFrame):
        return len(v) <= 12
    if isinstance(v, np.ndarray):
        return v.size <= 24
    if isinstance(v, type):
        return False
    if isinstance(v, (list, tuple)):
        return len(v) <= 12 and all(_small(x) for x in v) and len(_py(v)) < 700
    if isinstance(v, dict):
        return len(v) <= 12 and all(_small(x) for x in list(v.keys()) + list(v.values())) and len(_py(v)) < 700
    return False


def _split_args(src: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    depth = 0
    for ch in src:
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
    tail = "".join(buf).strip()
    if tail:
        parts.append(tail)
    return parts


def _property_output(test: str) -> str:
    got_name = "got"
    for raw in test.splitlines():
        match = re.match(r"\s*got\s*=\s*(.+)$", raw)
        if match:
            got_name = match.group(1).strip()
    lines = []
    for raw in test.splitlines():
        stripped = raw.strip()
        match = re.match(r"(expect_equal|expect_close|expect_frame|expect_array)\((.*)\)\s*$", stripped)
        if not match:
            continue
        kind, inner = match.group(1), match.group(2)
        args = _split_args(inner)
        if len(args) < 2:
            continue
        left = got_name if args[0] == "got" else args[0]
        right = args[1]
        if kind == "expect_equal":
            lines.append(left if right == "True" else f"{left} == {right}")
        elif kind == "expect_close":
            lines.append(f"{left} ≈ {right}")
        else:
            lines.append(f"{left} =\n{right}")
    extra = ""
    if re.search(r"auc\s*<\s*0\.85", test):
        extra = "ROC-AUC >= 0.85"
    return ("\n".join(lines + ([extra] if extra else []))).strip()


def _assignments(test: str, names: set[str]) -> list[str]:
    kept: list[str] = []
    active = False
    for raw in test.strip().splitlines():
        line = raw.rstrip()
        stripped = line.strip()
        if not stripped:
            if active:
                kept.append(line)
            continue
        if stripped.startswith(("expect_", "from ", "import ", "if ", "raise ", "got ", "got=", "exp ", "exp=")):
            active = False
            continue
        match = re.match(r"([A-Za-z_]\w*)\s*=", stripped)
        if match and match.group(1) in names and "solution(" not in stripped:
            kept.append(line)
            active = True
            continue
        if active and (raw.startswith(" ") or raw.startswith("\t")):
            kept.append(line)
            continue
        active = False
    return kept


def _output_from_return(value) -> str | None:
    import pandas as pd

    if isinstance(value, pd.DataFrame):
        if len(value) <= 12:
            return value.to_string(index=False)
        return None
    if not _small(value):
        return None
    if isinstance(value, float):
        return _fmt_float(value)
    return _py(value)


def python_example(q: dict) -> dict:
    ns: dict = {"__name__": "__main__"}
    exec(HARNESS + "\n" + (q.get("prelude") or "") + "\n" + q["solution"], ns, ns)
    real = ns["solution"]
    calls = []

    def wrapped(*args, **kwargs):
        out = real(*args, **kwargs)
        calls.append((args, kwargs, out))
        return out

    ns["solution"] = wrapped
    test = q["tests"][0]["code"]
    exec(test, ns, ns)
    if not calls:
        raise RuntimeError(f"{q['id']} first test never called solution()")
    args, kwargs, out = calls[0]
    bound = inspect.signature(real).bind(*args, **kwargs)
    names = set(bound.arguments)
    chunks = []
    huge = False
    for name, val in bound.arguments.items():
        shown = _py(val)
        if shown.startswith("#"):
            huge = True
        chunks.append(f"{name} =\n{shown}" if "\n" in shown else f"{name} = {shown}")
    assigned = _assignments(test, names)
    assigned_names = {re.match(r"\s*([A-Za-z_]\w*)\s*=", ln).group(1) for ln in assigned if re.match(r"\s*([A-Za-z_]\w*)\s*=", ln)}
    if huge and assigned and names <= assigned_names:
        input_text = "\n".join(assigned).strip()
    else:
        input_text = "\n".join(chunks)
    if not input_text.strip():
        setup = []
        for raw in test.splitlines():
            stripped = raw.strip()
            if not stripped or stripped.startswith(("expect_", "from ", "import ")):
                continue
            setup.append(raw.rstrip())
        input_text = "\n".join(setup).strip() or "solution()"
    output = _output_from_return(out)
    note = ""
    if output is None:
        output = _property_output(test)
        if not output:
            output = _py(out)
        note = "The first graded test checks these results on the input above."
    if isinstance(out, type):
        props = _property_output(test)
        if props:
            output = props
            note = "solution() returns the class. The first test uses it like this."
    return {"input": input_text.strip() + "\n", "output": output.strip() + "\n", "note": note}


def _sql_table(cols, rows) -> str:
    vals = [["" if c is None else str(c) for c in row] for row in rows]
    widths = [len(str(c)) for c in cols]
    for row in vals:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(cell))
    def line(cells):
        return "  ".join(cell.ljust(widths[i]) for i, cell in enumerate(cells))
    body = [line([str(c) for c in cols]), line(["-" * w for w in widths])]
    body.extend(line(row) for row in vals)
    return "\n".join(body)


def sql_example(q: dict) -> dict:
    con = sqlite3.connect(":memory:")
    con.executescript(q["schema"])
    names = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    blocks = []
    for name in names:
        info = list(con.execute(f"PRAGMA table_info({name})"))
        cols = [row[1] for row in info]
        rows = con.execute(f"SELECT * FROM {name}").fetchall()
        blocks.append(name + "\n" + _sql_table(cols, rows))
    con.close()
    exp = q["expected"]
    return {
        "input": "\n\n".join(blocks) + "\n",
        "output": _sql_table(exp["columns"], exp["rows"]) + "\n",
        "note": "These tables are already loaded. Return one SELECT.",
    }


def add_examples(questions: list[dict]) -> int:
    n = 0
    for q in questions:
        if q.get("type") == "python":
            q["examples"] = [python_example(q)]
            n += 1
        elif q.get("type") == "sql":
            q["examples"] = [sql_example(q)]
            n += 1
    return n


if __name__ == "__main__":
    import json
    import sys

    path = ROOT / "questions" / "bank.json"
    bank = json.loads(path.read_text())
    count = add_examples(bank["questions"])
    path.write_text(json.dumps(bank, ensure_ascii=False))
    print(f"examples attached: {count}")
    want = sys.argv[1:] or ["A1", "A7", "A14", "B1", "D2", "D9", "H4", "H5", "H6"]
    for q in bank["questions"]:
        if q["id"] in want and q.get("examples"):
            ex = q["examples"][0]
            print("\n====", q["id"], "====")
            print("INPUT\n" + ex["input"])
            print("OUTPUT\n" + ex["output"])
            if ex.get("note"):
                print("NOTE", ex["note"])
