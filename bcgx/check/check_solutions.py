#!/usr/bin/env python3
"""Re-run every coding and SQL reference solution against the shipped bank.json."""

from __future__ import annotations

import json
import sqlite3
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / "questions" / "bank.json"
HARNESS = (ROOT / "py" / "harness.py").read_text()


def cells_equal(got, exp, tol=1e-6) -> bool:
    if got is None or exp is None:
        return got is None and exp is None
    if isinstance(got, (int, float)) and isinstance(exp, (int, float)) and not isinstance(got, bool):
        return abs(float(got) - float(exp)) <= tol + 1e-9
    return got == exp


def check_sql(q: dict) -> None:
    con = sqlite3.connect(":memory:")
    con.executescript(q["schema"])
    cur = con.execute(q["solution"])
    rows = [list(r) for r in cur.fetchall()]
    cols = [d[0] for d in cur.description]
    exp = q["expected"]
    if cols != exp["columns"]:
        raise AssertionError(f"columns {cols} != {exp['columns']}")
    got_rows, exp_rows = rows, [list(r) for r in exp["rows"]]
    if not q.get("ordered", True):
        key = lambda r: tuple("" if c is None else str(c) for c in r)
        got_rows, exp_rows = sorted(got_rows, key=key), sorted(exp_rows, key=key)
    if len(got_rows) != len(exp_rows):
        raise AssertionError(f"row count {len(got_rows)} != {len(exp_rows)}: {got_rows}")
    for i, (a, b) in enumerate(zip(got_rows, exp_rows)):
        if len(a) != len(b) or not all(cells_equal(x, y) for x, y in zip(a, b)):
            raise AssertionError(f"row {i}\nGOT {a}\nEXP {b}")
    con.close()


def main() -> int:
    bank = json.loads(BANK.read_text())
    failures = []
    n_py = n_sql = 0
    for q in bank["questions"]:
        try:
            if q["type"] == "python":
                n_py += 1
                examples = q.get("examples") or []
                if not examples or not examples[0].get("input") or not examples[0].get("output"):
                    raise AssertionError("missing example")
                ns: dict = {}
                exec(HARNESS + "\n" + q.get("prelude", "") + "\n" + q["solution"], ns, ns)
                for t in q["tests"]:
                    exec(t["code"], ns, ns)
            elif q["type"] == "sql":
                n_sql += 1
                examples = q.get("examples") or []
                if not examples or not examples[0].get("input") or not examples[0].get("output"):
                    raise AssertionError("missing example")
                check_sql(q)
            elif q["type"] == "numeric":
                if abs(float(q["answer"]) - round(float(q["answer"]), 3)) > 1e-9:
                    raise AssertionError("answer is not rounded to 3 decimals")
            elif q["type"] == "mcq":
                ids = {c["id"] for c in q["choices"]}
                if not set(q["correct"]) <= ids or not q["correct"]:
                    raise AssertionError("bad choices")
            elif q["type"] == "case":
                if len(q["prompt"]) < 700 or len(q["rubric"]) < 100:
                    raise AssertionError("case text missing")
            elif q["type"] == "reading":
                if "What you must memorise" not in q["body"] or "Pitfall" not in q["body"]:
                    raise AssertionError("reading sections missing")
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{q['id']} {q.get('title')}\n{exc}\n{traceback.format_exc(limit=4)}")
    groups = {g["id"] for g in bank["groups"]}
    for g in groups:
        items = [q for q in bank["questions"] if q["group"] == g]
        if not any(q["type"] == "reading" for q in items):
            failures.append(f"{g} has no reading")
    if failures:
        print(f"FAILED {len(failures)}")
        print("\n".join(failures))
        return 1
    print(f"OK python={n_py} sql={n_sql} total={len(bank['questions'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
