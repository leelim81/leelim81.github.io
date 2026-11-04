#!/usr/bin/env python3
"""Build questions/bank.json and refuse to write it unless every reference solution passes."""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import (
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import GridSearchCV, cross_val_score, train_test_split
from sklearn.tree import DecisionTreeClassifier

sys.path.insert(0, str(Path(__file__).resolve().parent))
from readings import READINGS  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
HARNESS = (ROOT / "py" / "harness.py").read_text()
QS: list[dict] = []

GROUPS = [
    {"id": "phase0", "letter": "A", "title": "Phase 0 · Python warm-up", "blurb": "Syntax you will type under a timer: Python, then a few NumPy and pandas lines."},
    {"id": "pandas", "letter": "B", "title": "Pandas data collection", "blurb": "Combine files into an exact schema: filter, join, aggregate, reshape, time."},
    {"id": "processing", "letter": "C", "title": "Data processing", "blurb": "Impute, cap, bin, encode, scale, and keep leakage out of the features."},
    {"id": "modelling", "letter": "D", "title": "Modelling and evaluation", "blurb": "Splits, estimators, cross-validation, metrics, and a model that clears a bar."},
    {"id": "stats", "letter": "E", "title": "Probability and statistics", "blurb": "Numeric answers to three decimals. Bayes, counting, intervals, tests."},
    {"id": "ml", "letter": "F", "title": "ML theory", "blurb": "Bias and variance, regularisation, ensembles, metrics. Some items are select-all."},
    {"id": "numpy", "letter": "G", "title": "NumPy from scratch", "blurb": "Broadcasting, least squares, k-means, and a metric with no sklearn."},
    {"id": "sqlalgo", "letter": "H", "title": "SQL and algorithms", "blurb": "Joins, windows, and a few short algorithmic patterns."},
    {"id": "cases", "letter": "I", "title": "Senior cases", "blurb": "Written cases. Graded only by the AI reviewer, against a principal-level rubric."},
]


def imports_for(packages) -> str:
    pkgs = set(packages or [])
    lines = []
    if pkgs & {"numpy", "scikit-learn", "scipy"}:
        lines.append("import numpy as np")
    if pkgs & {"pandas", "scikit-learn"}:
        lines.append("import pandas as pd")
    return ("\n".join(lines) + "\n") if lines else ""


def run_py(q: dict) -> None:
    ns: dict = {}
    src = HARNESS + "\n" + q.get("prelude", "") + "\n" + q["solution"]
    exec(src, ns, ns)
    for t in q["tests"]:
        try:
            exec(t["code"], ns, ns)
        except Exception as exc:  # noqa: BLE001
            raise SystemExit(f"{q['id']} :: {t['name']}\n{exc}") from exc


def cells_equal(got, exp, tol=1e-6) -> bool:
    if got is None or exp is None:
        return got is None and exp is None
    if isinstance(got, (int, float)) and isinstance(exp, (int, float)) and not isinstance(got, bool):
        return abs(float(got) - float(exp)) <= tol
    return got == exp


def run_sql(q: dict) -> None:
    con = sqlite3.connect(":memory:")
    con.executescript(q["schema"])
    cur = con.execute(q["solution"])
    rows = [list(r) for r in cur.fetchall()]
    cols = [d[0] for d in cur.description]
    exp = q["expected"]
    if cols != exp["columns"]:
        raise SystemExit(f"{q['id']} columns {cols} != {exp['columns']}")
    got_rows, exp_rows = rows, exp["rows"]
    if not q.get("ordered", True):
        got_rows = sorted(got_rows, key=lambda r: tuple("" if c is None else str(c) for c in r))
        exp_rows = sorted(exp_rows, key=lambda r: tuple("" if c is None else str(c) for c in r))
    if len(got_rows) != len(exp_rows):
        raise SystemExit(f"{q['id']} row count {len(got_rows)} != {len(exp_rows)}\n{got_rows}")
    for i, (a, b) in enumerate(zip(got_rows, exp_rows)):
        if len(a) != len(b) or not all(cells_equal(x, y) for x, y in zip(a, b)):
            raise SystemExit(f"{q['id']} row {i}\nGOT {a}\nEXP {b}")
    con.close()


def add(q: dict) -> None:
    if q["type"] == "python":
        q["prelude"] = imports_for(q.get("packages")) + (q.get("prelude") or "")
        run_py(q)
    elif q["type"] == "sql":
        run_sql(q)
    elif q["type"] == "numeric":
        if abs(q["answer"] - round(q["answer"], 3)) > 1e-9:
            raise SystemExit(f"{q['id']} answer is not 3 decimals")
    elif q["type"] == "mcq":
        ids = {c["id"] for c in q["choices"]}
        if not set(q["correct"]) <= ids:
            raise SystemExit(f"{q['id']} bad correct ids")
        if not q.get("multi") and len(q["correct"]) != 1:
            raise SystemExit(f"{q['id']} single choice needs one answer")
    elif q["type"] == "case":
        if len(q["prompt"]) < 800 or len(q["rubric"]) < 200 or len(q["outline"]) < 200:
            raise SystemExit(f"{q['id']} case text too short prompt={len(q['prompt'])} rubric={len(q['rubric'])} outline={len(q['outline'])}")
    QS.append(q)


def py(code, group, order, diff, title, prompt, starter, solution, tests, prelude="", packages=None, explanation="", cheat="", mock=None, timeout=20000):
    add({
        "id": code, "code": code, "group": group, "order": order, "difficulty": diff, "type": "python",
        "title": title, "prompt": prompt.strip(), "starter": starter.strip() + "\n", "solution": solution.strip() + "\n",
        "tests": [{"name": n, "code": c.strip() + "\n"} for n, c in tests],
        "prelude": prelude.strip() + ("\n" if prelude.strip() else ""),
        "packages": packages or [], "explanation": explanation.strip(), "cheatsheet": cheat.strip(),
        "mockRole": mock, "timeoutMs": timeout,
    })


def numeric(code, order, diff, title, prompt, answer, explanation, mock="numeric"):
    add({
        "id": code, "code": code, "group": "stats", "order": order, "difficulty": diff, "type": "numeric",
        "title": title, "prompt": prompt.strip(), "answer": answer, "tolerance": 0.001,
        "starter": "", "solution": str(answer), "explanation": explanation.strip(), "mockRole": mock, "timeoutMs": 20000,
    })


def mcq(code, order, diff, title, prompt, choices, correct, explanation, multi=False):
    add({
        "id": code, "code": code, "group": "ml", "order": order, "difficulty": diff, "type": "mcq",
        "title": title, "prompt": prompt.strip(), "choices": [{"id": i, "text": t} for i, t in choices],
        "correct": correct, "multi": multi, "explanation": explanation.strip(), "mockRole": "mcq", "timeoutMs": 20000,
    })


def sql(code, order, diff, title, prompt, schema, starter, solution, columns, rows, explanation, ordered=True):
    add({
        "id": code, "code": code, "group": "sqlalgo", "order": order, "difficulty": diff, "type": "sql",
        "title": title, "prompt": prompt.strip(), "schema": schema.strip(), "starter": starter.strip() + "\n",
        "solution": solution.strip(), "expected": {"columns": columns, "rows": rows}, "ordered": ordered,
        "explanation": explanation.strip(), "mockRole": None, "timeoutMs": 20000,
    })


def case(code, order, title, prompt, outline, rubric_extra):
    rubric = f"""
Grade this as a written case for a principal-level BCG X data science interview. Be direct and specific.
Score 0-100. A 70 is a solid principal answer: a real decision, a metric tied to money or operations, leakage and validation, constraints, and what they would do next. An 85 adds quantification, a baseline, and a clear "what I would not build". Below 50 is generic algorithm tourism.
Also weigh: {rubric_extra}
The first line of your reply must be exactly `SCORE: N` with N an integer from 0 to 100.
Then, in markdown: the decision they made, what is already strong, the gaps, and what you would ask them in the room.
""".strip()
    add({
        "id": code, "code": code, "group": "cases", "order": order, "difficulty": "H", "type": "case",
        "title": title, "prompt": prompt.strip(), "outline": outline.strip(), "rubric": rubric,
        "explanation": outline.strip(), "mockRole": None, "timeoutMs": 20000,
    })


# ---------------------------------------------------------------------------
# Phase 0
# ---------------------------------------------------------------------------

py("A1", "phase0", 1, "E", "f-strings",
   "Write `solution(name, score)` returning the string `Name scored X.Y`, with the score rounded to one decimal.",
   "def solution(name, score):\n    raise NotImplementedError",
   "def solution(name, score):\n    return f'{name} scored {score:.1f}'",
   [("formats one decimal", "expect_equal(solution('Mina', 91.26), 'Mina scored 91.3')"),
    ("keeps a trailing zero", "expect_equal(solution('Jo', 80), 'Jo scored 80.0')")],
   explanation="`:.1f` rounds and always shows one decimal. An f-string does not change `name`.",
   cheat="f\"{name} scored {score:.1f}\"")

py("A2", "phase0", 2, "E", "Lists and slicing",
   "Write `solution(xs)` for a list of numbers. Return a tuple `(xs[1:4], xs[-2:], xs[::-1])`. End indexes are exclusive.",
   "def solution(xs):\n    raise NotImplementedError",
   "def solution(xs):\n    return xs[1:4], xs[-2:], xs[::-1]",
   [("middle, tail, reverse", "expect_equal(solution([10, 20, 30, 40, 50]), ([20, 30, 40], [40, 50], [50, 40, 30, 20, 10]))")],
   explanation="Slicing never mutates the original list. A negative step reverses.",
   cheat="xs[1:4], xs[-2:], xs[::-1]")

py("A3", "phase0", 3, "E", "Dict get",
   "Write `solution(d, key)` that returns `d[key] + 1` when the key exists and `1` when it does not. Do not mutate `d`.",
   "def solution(d, key):\n    raise NotImplementedError",
   "def solution(d, key):\n    return d.get(key, 0) + 1",
   [("missing key", "expect_equal(solution({'a': 2}, 'b'), 1)"),
    ("present key", "expect_equal(solution({'a': 2}, 'a'), 3)"),
    ("input unchanged", "d={'a': 2}\nsolution(d, 'b')\nexpect_equal(d, {'a': 2})")],
   explanation="`dict.get(key, 0)` avoids `KeyError`. Adding one to the default counts a first sighting.",
   cheat="d.get(key, 0) + 1")

py("A4", "phase0", 4, "E", "Comprehensions",
   "Write `solution(nums)` returning the squares of the even numbers, in the same order.",
   "def solution(nums):\n    raise NotImplementedError",
   "def solution(nums):\n    return [n * n for n in nums if n % 2 == 0]",
   [("evens only", "expect_equal(solution([1, 2, 3, 4, 5]), [4, 16])"),
    ("empty", "expect_equal(solution([1, 3]), [])")],
   explanation="The filter sits at the end of the comprehension. `% 2 == 0` is the even test.",
   cheat="[n * n for n in nums if n % 2 == 0]")

py("A5", "phase0", 5, "E", "enumerate and zip",
   "Write `solution(names, scores)` returning strings `i:name=score` for each pair, numbered from 1. Stop at the shorter list.",
   "def solution(names, scores):\n    raise NotImplementedError",
   "def solution(names, scores):\n    return [f'{i}:{n}={s}' for i, (n, s) in enumerate(zip(names, scores), start=1)]",
   [("pairs from 1", "expect_equal(solution(['Ada', 'Grace'], [88, 91]), ['1:Ada=88', '2:Grace=91'])"),
    ("truncates", "expect_equal(solution(['Ada'], [1, 2]), ['1:Ada=1'])")],
   explanation="`zip` stops early. `enumerate(..., start=1)` is the 1-based index.",
   cheat="for i, (n, s) in enumerate(zip(names, scores), start=1)")

py("A6", "phase0", 6, "E", "Defaults and lambda",
   "Write `solution(prices, discount=0.1)` returning each price after the discount, rounded to 2 decimals. Use a lambda for the arithmetic.",
   "def solution(prices, discount=0.1):\n    raise NotImplementedError",
   "def solution(prices, discount=0.1):\n    take = lambda p: round(p * (1 - discount), 2)\n    return [take(p) for p in prices]",
   [("default 10 percent", "expect_equal(solution([20, 40]), [18.0, 36.0])"),
    ("override", "expect_equal(solution([20], discount=0.25), [15.0])")],
   explanation="A default argument applies when the caller omits it. `round(..., 2)` is currency-style, not a format string.",
   cheat="def solution(prices, discount=0.1):")

py("A7", "phase0", 7, "E", "Sorting with a key",
   "Each row is a dict with `name` and `rev`. Return the rows sorted by revenue descending, then name ascending.",
   "def solution(rows):\n    raise NotImplementedError",
   "def solution(rows):\n    return sorted(rows, key=lambda r: (-r['rev'], r['name']))",
   [("tie broken by name", "rows=[{'name':'Bo','rev':10},{'name':'Ann','rev':10},{'name':'Cy','rev':4}]\nexpect_equal([r['name'] for r in solution(rows)], ['Ann', 'Bo', 'Cy'])")],
   explanation="A tuple key sorts left to right. Negate the number you want descending.",
   cheat="sorted(rows, key=lambda r: (-r['rev'], r['name']))")

py("A8", "phase0", 8, "E", "String methods",
   "Write `solution(text)` that strips ends, lowercases, removes commas, and returns the result.",
   "def solution(text):\n    raise NotImplementedError",
   "def solution(text):\n    return text.strip().lower().replace(',', '')",
   [("cleans a sku note", "expect_equal(solution('  AB-1029, extra '), 'ab-1029 extra')")],
   explanation="Each string method returns a new string, so the chain is safe.",
   cheat="text.strip().lower().replace(',', '')")

py("A9", "phase0", 9, "E", "Counter and defaultdict",
   "Write `solution(pairs)` where `pairs` is a list of `(key, value)`. Return a normal dict mapping each key to the list of its values, in the order seen.",
   "def solution(pairs):\n    raise NotImplementedError",
   "def solution(pairs):\n    from collections import defaultdict\n    groups = defaultdict(list)\n    for key, value in pairs:\n        groups[key].append(value)\n    return dict(groups)",
   [("groups in order", "expect_equal(solution([('east', 2), ('west', 5), ('east', 1)]), {'east': [2, 1], 'west': [5]})")],
   explanation="`defaultdict(list)` removes the 'create the list on first sight' branch. `dict(...)` makes a plain dict for the test.",
   cheat="from collections import defaultdict")

py("A10", "phase0", 10, "E", "try / except",
   "Write `solution(text)` that returns `int(text)`, or `None` if `text` is not an integer string or is `None`.",
   "def solution(text):\n    raise NotImplementedError",
   "def solution(text):\n    try:\n        return int(text)\n    except (ValueError, TypeError):\n        return None",
   [("parses", "expect_equal(solution('42'), 42)"),
    ("bad text", "expect_equal(solution('x'), None)"),
    ("none", "expect_equal(solution(None), None)")],
   explanation="`int(None)` raises `TypeError`. `int('x')` raises `ValueError`. Catch both, nothing wider.",
   cheat="try:\n    return int(text)\nexcept (ValueError, TypeError):\n    return None")

py("A11", "phase0", 11, "M", "A small class",
   "Write `solution()` returning a class `Ledger`. A new ledger starts at 0. `add(amount)` updates the balance and returns it. Instances do not share state.",
   "def solution():\n    raise NotImplementedError",
   "def solution():\n    class Ledger:\n        def __init__(self):\n            self.bal = 0\n        def add(self, amount):\n            self.bal += amount\n            return self.bal\n    return Ledger",
   [("independent ledgers", "Ledger = solution()\na, b = Ledger(), Ledger()\nexpect_equal(a.add(5), 5)\nexpect_equal(a.add(-2), 3)\nexpect_equal(b.add(1), 1)")],
   explanation="Instance state lives on `self`. Returning the class lets the tests construct as many ledgers as they need.",
   cheat="class Ledger:\n    def __init__(self):\n        self.bal = 0")

py("A12", "phase0", 12, "M", "NumPy shape and mean",
   "Write `solution()` returning `(array, shape tuple, overall mean as a float)`. The array is `np.arange(12)` reshaped to 3 rows and 4 columns.",
   "def solution():\n    raise NotImplementedError",
   "def solution():\n    import numpy as np\n    a = np.arange(12).reshape(3, 4)\n    return a, a.shape, float(a.mean())",
   [("shape and mean", "a, shape, mean = solution()\nexpect_equal(shape, (3, 4))\nexpect_close(mean, 5.5)\nexpect_equal(int(a[2, 3]), 11)")],
   packages=["numpy"],
   explanation="`reshape(3, 4)` requires 12 elements. The mean of 0 through 11 is 5.5.",
   cheat="np.arange(12).reshape(3, 4)")

py("A13", "phase0", 13, "M", "NumPy boolean mask",
   "Write `solution(values)` for a list of numbers. Return the mean of the strictly positive entries as a float. If none are positive, return `None`.",
   "def solution(values):\n    raise NotImplementedError",
   "def solution(values):\n    import numpy as np\n    a = np.asarray(values, dtype=float)\n    mask = a > 0\n    if not mask.any():\n        return None\n    return float(a[mask].mean())",
   [("positives", "expect_close(solution([0, -1, 4, 10]), 7.0)"),
    ("none", "expect_equal(solution([0, -2]), None)")],
   packages=["numpy"],
   explanation="`a[a > 0]` is the masked array. Check for an empty mask before calling `mean`.",
   cheat="a[a > 0].mean()")

py("A14", "phase0", 14, "M", "Create a DataFrame",
   "`rows` is a list of dicts with keys `region` and `revenue`. Return a DataFrame with those columns and one row per dict, in the same order.",
   "def solution(rows):\n    raise NotImplementedError",
   "def solution(rows):\n    import pandas as pd\n    return pd.DataFrame(rows, columns=['region', 'revenue'])",
   [("builds the frame", "got = solution([{'region': 'East', 'revenue': 3}, {'region': 'West', 'revenue': 5}])\nexp = pd.DataFrame({'region': ['East', 'West'], 'revenue': [3, 5]})\nexpect_frame(got, exp)")],
   packages=["pandas"],
   explanation="`pd.DataFrame(list_of_dicts)` uses the keys as columns. Passing `columns` locks the order.",
   cheat="pd.DataFrame(rows, columns=['region', 'revenue'])")

py("A15", "phase0", 15, "M", "loc, iloc, and a mask",
   "`df` has columns `region`, `revenue`, `cost` in that order. Return a tuple `(east_revenue_sum, first_revenue)` where `first_revenue` is the revenue in row position 0.",
   "def solution(df):\n    raise NotImplementedError",
   "def solution(df):\n    east = df.loc[df['region'].eq('East'), 'revenue'].sum()\n    first = df.iloc[0, 1]\n    return float(east), first",
   [("filters east", "df = pd.DataFrame({'region': ['East', 'West', 'East'], 'revenue': [10, 4, 6], 'cost': [1, 1, 1]})\nexpect_equal(solution(df), (16.0, 10))")],
   prelude="import pandas as pd",
   packages=["pandas"],
   explanation="`loc` plus a boolean Series filters rows. `iloc[0, 1]` is row position 0, column position 1, which is revenue.",
   cheat="df.loc[df['region'].eq('East'), 'revenue']\ndf.iloc[0, 1]")

py("A16", "phase0", 16, "M", "Assign a column",
   "`df` has `revenue` and `cost`. Return a copy with a `margin` column equal to revenue minus cost, and a boolean `flag` that is true when margin is positive.",
   "def solution(df):\n    raise NotImplementedError",
   "def solution(df):\n    out = df.copy()\n    out['margin'] = out['revenue'] - out['cost']\n    out['flag'] = out['margin'] > 0\n    return out",
   [("adds both columns", "df = pd.DataFrame({'revenue': [10, 3], 'cost': [4, 5]})\ngot = solution(df)\nexp = pd.DataFrame({'revenue': [10, 3], 'cost': [4, 5], 'margin': [6, -2], 'flag': [True, False]})\nexpect_frame(got, exp)")],
   prelude="import pandas as pd",
   packages=["pandas"],
   explanation="Assign with `out['col'] = ...` on a copy so the caller's frame stays put.",
   cheat="out['margin'] = out['revenue'] - out['cost']")

py("A17", "phase0", 17, "M", "groupby one-liner",
   "`df` has `region` and `revenue`. Return one row per region with columns `region` and `revenue`, where revenue is the sum. Keep `region` as a column.",
   "def solution(df):\n    raise NotImplementedError",
   "def solution(df):\n    return df.groupby('region', as_index=False)['revenue'].sum()",
   [("sums by region", "df = pd.DataFrame({'region': ['East', 'West', 'East'], 'revenue': [10, 4, 6]})\nexp = pd.DataFrame({'region': ['East', 'West'], 'revenue': [16, 4]})\nexpect_frame(solution(df), exp, sort_by=['region'])")],
   prelude="import pandas as pd",
   packages=["pandas"],
   explanation="`as_index=False` is the difference between a Series with an index and a frame the test can align.",
   cheat="df.groupby('region', as_index=False)['revenue'].sum()")

py("A18", "phase0", 18, "M", "merge one-liner",
   "Left-join `orders` to `customers` on `customer_id`. Keep every order. Return the merged frame.",
   "def solution(orders, customers):\n    raise NotImplementedError",
   "def solution(orders, customers):\n    return orders.merge(customers, on='customer_id', how='left')",
   [("keeps unmatched orders", "orders = pd.DataFrame({'order_id': [1, 2], 'customer_id': [10, 11], 'amount': [5, 7]})\ncustomers = pd.DataFrame({'customer_id': [10], 'name': ['Ann']})\nexp = pd.DataFrame({'order_id': [1, 2], 'customer_id': [10, 11], 'amount': [5, 7], 'name': ['Ann', None]})\nexpect_frame(solution(orders, customers), exp)")],
   prelude="import pandas as pd",
   packages=["pandas"],
   explanation="`how='left'` keeps the left table's rows. The unmatched name is null.",
   cheat="orders.merge(customers, on='customer_id', how='left')")

# ---------------------------------------------------------------------------
# Pandas collection
# ---------------------------------------------------------------------------

py("B1", "pandas", 1, "E", "Concat mismatched columns",
   """Two store extracts are loaded as `east` and `west`.

`east` columns: `date`, `sku`, `units`, `discount`.
`west` columns: `date`, `sku`, `units`, `tax`.

Return one frame with columns in this order: `date`, `sku`, `units`, `discount`, `tax`, `source`. `source` is `east` or `west`. Keep east rows first. Missing discount or tax stays null.""",
   "def solution(east, west):\n    raise NotImplementedError",
   """def solution(east, west):
    a = east.copy()
    b = west.copy()
    a['source'] = 'east'
    b['source'] = 'west'
    out = pd.concat([a, b], ignore_index=True)
    return out[['date', 'sku', 'units', 'discount', 'tax', 'source']]""",
   [("stacks and aligns", """
east = pd.read_csv(io.StringIO('date,sku,units,discount\\n2024-01-01,A,2,0.1\\n2024-01-03,C,1,0.0\\n'))
west = pd.read_csv(io.StringIO('date,sku,units,tax\\n2024-01-02,B,4,0.05\\n'))
got = solution(east, west)
exp = pd.DataFrame({
    'date': ['2024-01-01', '2024-01-03', '2024-01-02'],
    'sku': ['A', 'C', 'B'],
    'units': [2, 1, 4],
    'discount': [0.1, 0.0, float('nan')],
    'tax': [float('nan'), float('nan'), 0.05],
    'source': ['east', 'east', 'west'],
})
expect_frame(got, exp)
""")],
   prelude="import pandas as pd\nimport io",
   packages=["pandas"],
   explanation="`concat` unions the columns. You still set the column order and the source label yourself.",
   mock="collection")

py("B2", "pandas", 2, "E", "Named groupby aggregation",
   """`orders` has `order_id`, `region`, `amount`. Return one row per region with columns `region`, `revenue` (sum of amount), `orders` (row count), `aov` (mean amount).""",
   "def solution(orders):\n    raise NotImplementedError",
   """def solution(orders):
    return orders.groupby('region', as_index=False).agg(
        revenue=('amount', 'sum'),
        orders=('order_id', 'count'),
        aov=('amount', 'mean'),
    )""",
   [("east and west", """
orders = pd.DataFrame({
    'order_id': [1, 2, 3, 4],
    'region': ['East', 'East', 'West', 'West'],
    'amount': [10, 20, 5, 15],
})
exp = pd.DataFrame({'region': ['East', 'West'], 'revenue': [30, 20], 'orders': [2, 2], 'aov': [15.0, 10.0]})
expect_frame(solution(orders), exp, sort_by=['region'])
""")],
   prelude="import pandas as pd",
   packages=["pandas"],
   explanation="Named aggregation `revenue=('amount', 'sum')` is the readable form, and `as_index=False` keeps `region` as a column.")

py("B3", "pandas", 3, "M", "Dedup then left join",
   """`customers` may repeat `customer_id`. Keep the row with the latest `updated_at` (the timestamps are unique). Then left-join `orders` to that table on `customer_id`.

Return columns `order_id`, `customer_id`, `amount`, `name`, one row per order, original order preserved.""",
   "def solution(orders, customers):\n    raise NotImplementedError",
   """def solution(orders, customers):
    latest = customers.sort_values('updated_at').drop_duplicates('customer_id', keep='last')
    out = orders.merge(latest[['customer_id', 'name']], on='customer_id', how='left')
    return out[['order_id', 'customer_id', 'amount', 'name']]""",
   [("latest name, unmatched order kept", """
customers = pd.DataFrame({
    'customer_id': [1, 1, 2],
    'name': ['Ann', 'Anna', 'Bo'],
    'updated_at': ['2024-01-01', '2024-06-01', '2024-03-01'],
})
orders = pd.DataFrame({'order_id': [10, 11, 12], 'customer_id': [1, 2, 3], 'amount': [50, 20, 5]})
exp = pd.DataFrame({'order_id': [10, 11, 12], 'customer_id': [1, 2, 3], 'amount': [50, 20, 5], 'name': ['Anna', 'Bo', None]})
expect_frame(solution(orders, customers), exp)
""")],
   prelude="import pandas as pd",
   packages=["pandas"],
   explanation="Sort so the latest timestamp is last, `drop_duplicates(keep='last')`, then `how='left'` so order 12 survives with a null name.",
   mock="collection")

py("B4", "pandas", 4, "M", "Share and z-score within group",
   """`df` has `category`, `sku`, `revenue`. Add `share`, the row's revenue divided by its category total, and `z`, the within-category z-score using the sample standard deviation (`ddof=1`). Return all five columns. Categories here have at least two distinct revenues.""",
   "def solution(df):\n    raise NotImplementedError",
   """def solution(df):
    out = df.copy()
    g = out.groupby('category')['revenue']
    out['share'] = out['revenue'] / g.transform('sum')
    out['z'] = (out['revenue'] - g.transform('mean')) / g.transform('std')
    return out""",
   [("share and z", """
df = pd.DataFrame({
    'category': ['A', 'A', 'A', 'B', 'B'],
    'sku': ['a1', 'a2', 'a3', 'b1', 'b2'],
    'revenue': [10.0, 20.0, 30.0, 5.0, 15.0],
})
got = solution(df)
exp = pd.DataFrame({
    'category': ['A', 'A', 'A', 'B', 'B'],
    'sku': ['a1', 'a2', 'a3', 'b1', 'b2'],
    'revenue': [10.0, 20.0, 30.0, 5.0, 15.0],
    'share': [1/6, 2/6, 3/6, 0.25, 0.75],
    'z': [-1.0, 0.0, 1.0, -0.7071067811865475, 0.7071067811865475],
})
expect_frame(got, exp, sort_by=['sku'])
""")],
   prelude="import pandas as pd",
   packages=["pandas"],
   explanation="`transform` paints the group sum, mean, and sample std back onto each row. Group A is the textbook z-scores -1, 0, 1.")

py("B5", "pandas", 5, "M", "Pivot and melt",
   """`long_df` has `product`, `quarter`, `units` with quarters Q1, Q2, Q3. Return a wide frame, one row per product, columns `product`, `Q1`, `Q2`, `Q3`, missing combinations filled with 0, products sorted A to Z.

Also write the wide result only. A second check melts a small wide frame: implement `solution(long_df)` for the pivot. The melt is checked by `melt_wide(wide_df)`, which you should also define. `wide_df` has columns `id`, `a`, `b`. Return `id`, `metric`, `value` with metrics in column order a then b, and ids in their original order.""",
   "def solution(long_df):\n    raise NotImplementedError\n\ndef melt_wide(wide_df):\n    raise NotImplementedError",
   """def solution(long_df):
    wide = long_df.pivot_table(index='product', columns='quarter', values='units', aggfunc='sum', fill_value=0)
    wide = wide.reindex(columns=['Q1', 'Q2', 'Q3'], fill_value=0)
    wide = wide.reset_index().rename_axis(None, axis=1)
    return wide.sort_values('product').reset_index(drop=True)

def melt_wide(wide_df):
    return wide_df.melt(id_vars=['id'], value_vars=['a', 'b'], var_name='metric', value_name='value')""",
   [("pivot fills the gap", """
long_df = pd.DataFrame({
    'product': ['P1', 'P1', 'P2', 'P2'],
    'quarter': ['Q1', 'Q2', 'Q1', 'Q3'],
    'units': [2, 3, 4, 1],
})
exp = pd.DataFrame({'product': ['P1', 'P2'], 'Q1': [2, 4], 'Q2': [3, 0], 'Q3': [0, 1]})
expect_frame(solution(long_df), exp)
"""),
    ("melt keeps metric order", """
wide_df = pd.DataFrame({'id': [1, 2], 'a': [10, 12], 'b': [7, 8]})
exp = pd.DataFrame({'id': [1, 2, 1, 2], 'metric': ['a', 'a', 'b', 'b'], 'value': [10, 12, 7, 8]})
expect_frame(melt_wide(wide_df), exp)
""")],
   prelude="import pandas as pd",
   packages=["pandas"],
   explanation="`reindex` forces the quarter columns and fills what `pivot_table` never saw. `melt` walks `value_vars` in the order you give.")

py("B6", "pandas", 6, "M", "Monthly resample",
   """`df` has `date` (ISO string) and `amount`. Return `month` (`YYYY-MM`) and `amount`, one row per month from the first month through the last, summing amount. Months with no rows are 0. Use month-end buckets.""",
   "def solution(df):\n    raise NotImplementedError",
   """def solution(df):
    tmp = df.copy()
    tmp['date'] = pd.to_datetime(tmp['date'])
    monthly = tmp.set_index('date').resample('ME')['amount'].sum()
    out = monthly.rename('amount').reset_index()
    out['month'] = out['date'].dt.strftime('%Y-%m')
    return out[['month', 'amount']]""",
   [("fills february", """
df = pd.DataFrame({'date': ['2024-01-15', '2024-01-20', '2024-03-01'], 'amount': [10, 5, 7]})
exp = pd.DataFrame({'month': ['2024-01', '2024-02', '2024-03'], 'amount': [15, 0, 7]})
expect_frame(solution(df), exp)
""")],
   prelude="import pandas as pd",
   packages=["pandas"],
   explanation="`resample('ME')` is month-end. The range is inferred from the first and last timestamps, so the empty February appears.",
   mock="collection")

py("B7", "pandas", 7, "M", "Lag and rolling mean by store",
   """`df` has `store`, `date`, `sales`, already one row per store-day. Return the same rows sorted by store then date, plus `lag1` (previous day sales within store) and `roll3` (rolling mean of up to 3 days within store, using a shorter window at the start of each store).""",
   "def solution(df):\n    raise NotImplementedError",
   """def solution(df):
    out = df.sort_values(['store', 'date']).copy()
    g = out.groupby('store')['sales']
    out['lag1'] = g.shift(1)
    out['roll3'] = g.transform(lambda s: s.rolling(3, min_periods=1).mean())
    return out.reset_index(drop=True)""",
   [("lag and roll", """
df = pd.DataFrame({
    'store': ['S1', 'S1', 'S1', 'S2', 'S2'],
    'date': ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-01', '2024-01-02'],
    'sales': [10.0, 20.0, 30.0, 4.0, 6.0],
})
exp = pd.DataFrame({
    'store': ['S1', 'S1', 'S1', 'S2', 'S2'],
    'date': ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-01', '2024-01-02'],
    'sales': [10.0, 20.0, 30.0, 4.0, 6.0],
    'lag1': [float('nan'), 10.0, 20.0, float('nan'), 4.0],
    'roll3': [10.0, 15.0, 20.0, 4.0, 5.0],
})
expect_frame(solution(df), exp)
""")],
   prelude="import pandas as pd",
   packages=["pandas"],
   explanation="`shift` and `rolling` are per store because they are called on a groupby. `min_periods=1` keeps the first day.")

py("B8", "pandas", 8, "M", "Top 2 per category with ties",
   """`df` has `category`, `product_id`, `revenue`. Keep the top 2 products per category. Rank by revenue descending, break ties by smaller `product_id`. Return `category`, `product_id`, `revenue`, sorted by category, then revenue descending, then product_id ascending.""",
   "def solution(df):\n    raise NotImplementedError",
   """def solution(df):
    ordered = df.sort_values(['category', 'revenue', 'product_id'], ascending=[True, False, True])
    top = ordered.groupby('category', as_index=False).head(2)
    return top.sort_values(['category', 'revenue', 'product_id'], ascending=[True, False, True]).reset_index(drop=True)""",
   [("tie goes to the smaller id", """
df = pd.DataFrame({
    'category': ['A', 'A', 'A', 'B', 'B', 'B'],
    'product_id': [2, 1, 3, 9, 8, 7],
    'revenue': [10, 10, 5, 8, 7, 7],
})
exp = pd.DataFrame({
    'category': ['A', 'A', 'B', 'B'],
    'product_id': [1, 2, 9, 7],
    'revenue': [10, 10, 8, 7],
})
expect_frame(solution(df), exp)
""")],
   prelude="import pandas as pd",
   packages=["pandas"],
   explanation="Sort the tie-break into the frame, then `groupby.head(2)`. For B, product 7 beats product 8 at revenue 7 because the id is smaller.")

py("B9", "pandas", 9, "H", "Five-step collection pipeline",
   """Build the monthly segment extract.

`tx` columns: `id`, `customer_id`, `status`, `ts`, `amount`.
`customers` columns: `customer_id`, `segment`.

Steps, in spirit if not in this exact code shape:

1. Keep `status == 'paid'`.
2. Parse `ts` and take the calendar month as `YYYY-MM`.
3. Attach `segment` with a left join.
4. Aggregate to `month`, `segment`, `revenue` (sum of amount), `orders` (count of ids).
5. Sort by month, then segment.

Return exactly those four columns.""",
   "def solution(tx, customers):\n    raise NotImplementedError",
   """def solution(tx, customers):
    paid = tx.loc[tx['status'].eq('paid')].copy()
    paid['month'] = pd.to_datetime(paid['ts']).dt.strftime('%Y-%m')
    merged = paid.merge(customers, on='customer_id', how='left')
    out = merged.groupby(['month', 'segment'], as_index=False).agg(
        revenue=('amount', 'sum'),
        orders=('id', 'count'),
    )
    return out.sort_values(['month', 'segment']).reset_index(drop=True)""",
   [("exact schema", """
tx = pd.DataFrame({
    'id': [1, 2, 3, 4],
    'customer_id': [10, 10, 11, 12],
    'status': ['paid', 'void', 'paid', 'paid'],
    'ts': ['2024-01-05', '2024-01-06', '2024-02-01', '2024-02-10'],
    'amount': [100, 50, 40, 10],
})
customers = pd.DataFrame({'customer_id': [10, 11, 12], 'segment': ['Pro', 'Basic', 'Pro']})
exp = pd.DataFrame({
    'month': ['2024-01', '2024-02', '2024-02'],
    'segment': ['Pro', 'Basic', 'Pro'],
    'revenue': [100, 40, 10],
    'orders': [1, 1, 1],
})
expect_frame(solution(tx, customers), exp)
""")],
   prelude="import pandas as pd",
   packages=["pandas"],
   explanation="The void row has to die before the join, or January Pro is 150. The rest is a named aggregation and a stable sort.",
   mock="collection", timeout=30000)

# ---------------------------------------------------------------------------
# Processing
# ---------------------------------------------------------------------------

py("C1", "processing", 1, "E", "Group median imputation",
   """`df` has `segment` and `income`. Fill missing income with that segment's median. If a segment is entirely missing, use the median of the observed incomes in the whole table. Return the full frame.""",
   "def solution(df):\n    raise NotImplementedError",
   """def solution(df):
    out = df.copy()
    med = out.groupby('segment')['income'].transform('median')
    out['income'] = out['income'].fillna(med).fillna(out['income'].median())
    return out""",
   [("segment then global", """
df = pd.DataFrame({'segment': ['A', 'A', 'A', 'B', 'B'], 'income': [10.0, float('nan'), 30.0, float('nan'), float('nan')]})
exp = pd.DataFrame({'segment': ['A', 'A', 'A', 'B', 'B'], 'income': [10.0, 20.0, 30.0, 20.0, 20.0]})
expect_frame(solution(df), exp)
""")],
   prelude="import pandas as pd",
   packages=["pandas"],
   explanation="Group A median of 10 and 30 is 20. Group B has no observed income, so the second fill uses the global median, also 20.")

py("C2", "processing", 2, "E", "IQR cap within segment",
   """`df` has `segment` and `amount`. Within each segment, cap amount at the 1.5 IQR fences. Use pandas' linear quantile. Do not drop rows. Return the frame in the original row order.""",
   "def solution(df):\n    raise NotImplementedError",
   """def solution(df):
    out = df.copy()
    def cap(s):
        q1, q3 = s.quantile(0.25), s.quantile(0.75)
        iqr = q3 - q1
        return s.clip(q1 - 1.5 * iqr, q3 + 1.5 * iqr)
    out['amount'] = out.groupby('segment')['amount'].transform(cap)
    return out""",
   [("caps the spike only", """
df = pd.DataFrame({
    'segment': ['A'] * 5 + ['B'] * 5,
    'amount': [1.0, 2.0, 3.0, 4.0, 100.0, 10.0, 11.0, 12.0, 13.0, 14.0],
})
got = solution(df)
expect_close(float(got.loc[4, 'amount']), 7.0)
expect_close(float(got['amount'].iloc[-1]), 14.0)
expect_equal(len(got), 10)
""")],
   prelude="import pandas as pd",
   packages=["pandas"],
   explanation="For 1,2,3,4,100 the linear quartiles are 2 and 4, so the upper fence is 7. Group B sits inside its own fences and is unchanged.")

py("C3", "processing", 3, "E", "cut and qcut",
   """`df` has `age` and `spend`. Add `age_band` using bins `[0, 18, 35, 50, 120]`, right edge exclusive, labels `youth`, `adult`, `mid`, `senior`. Add `spend_q` as quartile labels `Q1`..`Q4` (four buckets, duplicates are not an issue in this data). Return the frame with those two new columns as strings.""",
   "def solution(df):\n    raise NotImplementedError",
   """def solution(df):
    out = df.copy()
    out['age_band'] = pd.cut(out['age'], [0, 18, 35, 50, 120], labels=['youth', 'adult', 'mid', 'senior'], right=False).astype(str)
    out['spend_q'] = pd.qcut(out['spend'], 4, labels=['Q1', 'Q2', 'Q3', 'Q4']).astype(str)
    return out""",
   [("bands and quartiles", """
df = pd.DataFrame({'age': [10, 18, 34, 35, 49, 50, 80, 20], 'spend': [1, 2, 3, 4, 5, 6, 7, 8]})
got = solution(df)
expect_equal(got['age_band'].tolist(), ['youth', 'adult', 'adult', 'mid', 'mid', 'senior', 'senior', 'adult'])
expect_equal(got['spend_q'].tolist(), ['Q1', 'Q1', 'Q2', 'Q2', 'Q3', 'Q3', 'Q4', 'Q4'])
""")],
   prelude="import pandas as pd",
   packages=["pandas"],
   explanation="`right=False` puts age 18 into `adult` and age 35 into `mid`. `qcut` on 1..8 splits into pairs.")

py("C4", "processing", 4, "E", "log1p",
   """`df` has `revenue`, which can be zero. Add `log_revenue` = log(1 + revenue). Round it to 4 decimals. Keep the other columns.""",
   "def solution(df):\n    raise NotImplementedError",
   """def solution(df):
    out = df.copy()
    out['log_revenue'] = np.log1p(out['revenue']).round(4)
    return out""",
   [("log1p of 0, 9, 99", """
df = pd.DataFrame({'revenue': [0.0, 9.0, 99.0]})
got = solution(df)
expect_close(float(got.loc[0, 'log_revenue']), 0.0)
expect_close(float(got.loc[1, 'log_revenue']), round(np.log(10), 4))
expect_close(float(got.loc[2, 'log_revenue']), round(np.log(100), 4))
""")],
   prelude="import pandas as pd\nimport numpy as np",
   packages=["numpy", "pandas"],
   explanation="`log1p(0)` is 0, so a structural zero does not become missing. This is the lambda-0 Box-Cox, shifted to allow zeros.")

py("C5", "processing", 5, "M", "Ordinal and one-hot",
   """`df` has `id`, `plan` (`Basic`, `Plus`, `Pro`), and `region` (`East` or `West`). Return `id`, `plan_ord`, `region_West`.

`plan_ord` is Basic 0, Plus 1, Pro 2. `region_West` is 1 when the region is West and 0 otherwise.""",
   "def solution(df):\n    raise NotImplementedError",
   """def solution(df):
    out = df.copy()
    out['plan_ord'] = out['plan'].map({'Basic': 0, 'Plus': 1, 'Pro': 2})
    dummies = pd.get_dummies(out['region'], dtype=int)
    out['region_West'] = dummies['West'] if 'West' in dummies.columns else 0
    return out[['id', 'plan_ord', 'region_West']]""",
   [("maps both encodings", """
df = pd.DataFrame({'id': [1, 2, 3], 'plan': ['Pro', 'Basic', 'Plus'], 'region': ['East', 'West', 'West']})
exp = pd.DataFrame({'id': [1, 2, 3], 'plan_ord': [2, 0, 1], 'region_West': [0, 1, 1]})
expect_frame(solution(df), exp)
""")],
   prelude="import pandas as pd",
   packages=["pandas"],
   explanation="Ordinal is a map you write down. The dummy keeps a single West column so East and West are not both in the model.")

py("C6", "processing", 6, "M", "Target encode on train only",
   """`train` has `city` and `y`. `test` has `city` only. Add `city_te` to both frames: the mean of train `y` for that city. A city that never appears in train gets the global train mean. Do not use anything from `test` to compute the means. Return `(train_out, test_out)`.""",
   "def solution(train, test):\n    raise NotImplementedError",
   """def solution(train, test):
    means = train.groupby('city')['y'].mean()
    global_mean = float(train['y'].mean())
    tr = train.copy()
    te = test.copy()
    tr['city_te'] = tr['city'].map(means)
    te['city_te'] = te['city'].map(means).fillna(global_mean)
    return tr, te""",
   [("unseen city gets the global mean", """
train = pd.DataFrame({'city': ['A', 'A', 'B'], 'y': [1.0, 0.0, 1.0]})
test = pd.DataFrame({'city': ['A', 'C']})
tr, te = solution(train, test)
expect_close(float(tr.loc[0, 'city_te']), 0.5)
expect_close(float(tr.loc[2, 'city_te']), 1.0)
expect_close(float(te.loc[0, 'city_te']), 0.5)
expect_close(float(te.loc[1, 'city_te']), 2.0 / 3.0)
""")],
   prelude="import pandas as pd",
   packages=["pandas"],
   explanation="Means come only from train. City C was never seen, so it falls back to (1+0+1)/3.",
   mock="processing")

py("C7", "processing", 7, "M", "Scaler fit on train only",
   """`train` and `test` both have `x1` and `x2`. Standard-scale both columns. Fit on train only. Return `(train_out, test_out)` with the same columns. A zero-variance training column stays defined (sklearn's behaviour: those training rows become 0).""",
   "def solution(train, test):\n    raise NotImplementedError",
   """def solution(train, test):
    from sklearn.preprocessing import StandardScaler
    cols = ['x1', 'x2']
    scaler = StandardScaler()
    tr = train.copy()
    te = test.copy()
    tr[cols] = scaler.fit_transform(train[cols])
    te[cols] = scaler.transform(test[cols])
    return tr, te""",
   [("does not use the test row in the mean", """
train = pd.DataFrame({'x1': [0.0, 2.0], 'x2': [1.0, 1.0]})
test = pd.DataFrame({'x1': [4.0], 'x2': [5.0]})
tr, te = solution(train, test)
expect_array(tr['x1'], [-1.0, 1.0])
expect_array(tr['x2'], [0.0, 0.0])
expect_close(float(te.loc[0, 'x1']), 3.0)
expect_close(float(te.loc[0, 'x2']), 4.0)
""")],
   prelude="import pandas as pd",
   packages=["pandas", "scikit-learn"],
   explanation="Train x1 has mean 1 and population std 1, so 4 maps to 3. x2 has no variance, so the test value is just the distance from the training mean.",
   mock="processing")

py("C8", "processing", 8, "M", "Regex extract",
   """`df` has `id`, `note`, `email`. Return `id`, `sku`, `domain`.

`sku` is the first match of two uppercase letters, a hyphen, and four digits inside `note` (null if absent). `domain` is the lowercase host after `@` in `email`.""",
   "def solution(df):\n    raise NotImplementedError",
   """def solution(df):
    out = df.copy()
    out['sku'] = out['note'].str.extract(r'([A-Z]{2}-\\d{4})', expand=False)
    out['domain'] = out['email'].str.extract(r'@([A-Za-z0-9.\\-]+)$', expand=False).str.lower()
    return out[['id', 'sku', 'domain']]""",
   [("extracts sku and host", """
df = pd.DataFrame({
    'id': [1, 2, 3],
    'note': ['order AB-1029 rushed', 'no code', 'see zx-1 then ZX-0007'],
    'email': ['Ann@Shop.COM', 'a@b.co', 'x@y.org'],
})
got = solution(df)
expect_equal(got['sku'].fillna('').tolist(), ['AB-1029', '', 'ZX-0007'])
expect_equal(got['domain'].tolist(), ['shop.com', 'b.co', 'y.org'])
""")],
   prelude="import pandas as pd",
   packages=["pandas"],
   explanation="`str.extract` returns null on no match. The pattern is case-sensitive, so `zx-1` does not qualify and `ZX-0007` does.")

py("C9", "processing", 9, "M", "ColumnTransformer pipeline",
   """Write `solution(train)` that fits a preprocessor and returns it.

Numeric columns `age` and `income`: median impute, then standard scale.
Categorical column `region`: most-frequent impute, then one-hot with unknown categories ignored and a dense matrix.

The tests call `transform` on train and on a row whose region was not in train.""",
   "def solution(train):\n    raise NotImplementedError",
   """def solution(train):
    from sklearn.compose import ColumnTransformer
    from sklearn.impute import SimpleImputer
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import OneHotEncoder, StandardScaler
    num = Pipeline([
        ('imp', SimpleImputer(strategy='median')),
        ('sc', StandardScaler()),
    ])
    cat = Pipeline([
        ('imp', SimpleImputer(strategy='most_frequent')),
        ('oh', OneHotEncoder(handle_unknown='ignore', sparse_output=False)),
    ])
    pre = ColumnTransformer([
        ('num', num, ['age', 'income']),
        ('cat', cat, ['region']),
    ])
    pre.fit(train)
    return pre""",
   [("scaled numerics and a new region", """
train = pd.DataFrame({'age': [20.0, 40.0], 'income': [0.0, 10.0], 'region': ['East', 'West']})
pre = solution(train)
got = pre.transform(train)
expect_array(got, [[-1, -1, 1, 0], [1, 1, 0, 1]], tol=1e-6)
new = pd.DataFrame({'age': [30.0], 'income': [5.0], 'region': ['South']})
expect_array(pre.transform(new), [[0, 0, 0, 0]], tol=1e-6)
""")],
   prelude="import pandas as pd",
   packages=["pandas", "scikit-learn"],
   explanation="Age 20 and 40 scale to -1 and 1. One-hot columns follow sorted categories, East then West. South becomes a row of zeros instead of an exception.",
   mock="processing", timeout=45000)

py("C10", "processing", 10, "H", "Drop leaked columns",
   """`df` was pulled from the warehouse for a churn model that will score customers at decision time. Columns:

- `customer_id`, `tenure_months`, `monthly_fee`, `contract`, `tickets`
- `refund_after_cancel` (only known after they leave)
- `churn_copy` (a copy of the label)

Return a modelling frame with columns, in order: `customer_id`, `tenure_months`, `tenure_years`, `monthly_fee`, `contract`, `tickets`. `tenure_years` is tenure in months divided by 12. Fill missing `tickets` with 0. The leaked columns must not appear.""",
   "def solution(df):\n    raise NotImplementedError",
   """def solution(df):
    out = df.copy()
    out['tenure_years'] = out['tenure_months'] / 12.0
    out['tickets'] = out['tickets'].fillna(0)
    keep = ['customer_id', 'tenure_months', 'tenure_years', 'monthly_fee', 'contract', 'tickets']
    return out[keep]""",
   [("leaks are gone and tenure is converted", """
df = pd.DataFrame({
    'customer_id': [1, 2],
    'tenure_months': [24, 6],
    'monthly_fee': [30.0, 40.0],
    'contract': ['annual', 'monthly'],
    'tickets': [1.0, float('nan')],
    'refund_after_cancel': [20.0, 0.0],
    'churn_copy': [1, 0],
})
got = solution(df)
expect_equal(list(got.columns), ['customer_id', 'tenure_months', 'tenure_years', 'monthly_fee', 'contract', 'tickets'])
expect_close(float(got.loc[0, 'tenure_years']), 2.0)
expect_close(float(got.loc[1, 'tickets']), 0.0)
expect_equal('refund_after_cancel' in got.columns, False)
expect_equal('churn_copy' in got.columns, False)
""")],
   prelude="import pandas as pd",
   packages=["pandas"],
   explanation="Anything known only after the event, and anything copied from the label, will make the offline metric look brilliant and the live model useless.",
   mock="processing")

print("processing ok", flush=True)

# Modelling, stats, theory, numpy, sql, cases, cheat sheet and write follow in the same process.
# The rest of the bank is appended by exec of the companion file if present.
companion = Path(__file__).with_name("build_bank_rest.py")
code = companion.read_text()
exec(compile(code, str(companion), "exec"), globals())
