"""SQL practice: short drills on one bookstore database, and longer questions with their own tables.

The current data science test framework is Python only, so these tasks sit outside the plan and the mock tests.
Each task is one SELECT statement. The site loads every CSV file of the task as a table in an in-memory SQLite
database, runs the query, and saves its result as result.csv, which the checks then read.

Every task has a reference query, a second implementation in pandas (the oracle), and wrong queries that the
checks have to catch.
"""
import io
import json
import sqlite3
import textwrap

import numpy as np
import pandas as pd

from common import code, cols, csv_text, html, read_csv_text

# The Python that runs a query. The site swaps __QUERY__ for the text of query.sql as a string literal.
RUNNER = '''
import glob as _glob, os as _os, sqlite3 as _sqlite3, sys as _sys
import pandas as _pd

_QUERY = __QUERY__
if _os.path.exists("result.csv"):
    _os.remove("result.csv")
con = _sqlite3.connect(":memory:")
for _f in sorted(_glob.glob("*.csv")):
    _pd.read_csv(_f).to_sql(_os.path.splitext(_f)[0], con, index=False)
if not [_l for _l in _QUERY.splitlines() if _l.strip() and not _l.strip().startswith("--")]:
    print("query.sql has no statement yet. Write one SELECT statement.", file=_sys.stderr)
    raise SystemExit
try:
    result = _pd.read_sql_query(_QUERY, con)
except TypeError:
    print("SQL error: the statement returned no result. Write one SELECT statement.", file=_sys.stderr)
    raise SystemExit
except Exception as _e:
    _m = str(_e)
    print("SQL error: " + (_m.rsplit("': ", 1)[-1] if _m.startswith("Execution failed") else _m), file=_sys.stderr)
    raise SystemExit
result.to_csv("result.csv", index=False)
print(result.head(12).to_string(index=False) if len(result) else "(no rows)")
print(f"{len(result)} row{'' if len(result) == 1 else 's'}" + (", first 12 shown" if len(result) > 12 else ""))
'''.lstrip()


def wrap(sql):
    """The program that runs one query, as the site builds it."""
    return RUNNER.replace("__QUERY__", json.dumps(sql))


def run_sql(sql, frames):
    con = sqlite3.connect(":memory:")
    for name, df in frames.items():
        df.to_sql(name, con, index=False)
    out = pd.read_sql_query(sql, con)
    con.close()
    return pd.read_csv(io.StringIO(out.to_csv(index=False)))        # as the checks will read it


# ================================================================ data
FIRST = ["Aiko", "Bao", "Chen", "Dewi", "Elan", "Farah", "Gita", "Hana", "Imran", "Jia", "Kiri", "Linh", "Mei", "Nadia", "Omar",
         "Putri", "Quang", "Ravi", "Siti", "Tran", "Uma", "Vinh", "Wei", "Xin", "Yusuf", "Zara", "Arun", "Budi", "Cara", "Dao"]
LAST = "ABCDEFGHJKLMNPRSTW"


def _names(rng, n):
    seen, out = set(), []
    while len(out) < n:
        name = f"{rng.choice(FIRST)} {rng.choice(list(LAST))}."
        if name not in seen:
            seen.add(name)
            out.append(name)
    return out


def _dates(rng, start, end, n):
    days = (pd.Timestamp(end) - pd.Timestamp(start)).days
    return (pd.Timestamp(start) + pd.to_timedelta(rng.integers(0, days + 1, n), unit="D")).strftime("%Y-%m-%d")


def bookstore():
    """Order ids follow the order dates, so the items are built after the orders."""
    rng = np.random.default_rng(91001)
    n = 60
    customers = pd.DataFrame({
        "customer_id": np.arange(101, 101 + n), "name": _names(rng, n),
        "country": rng.choice(["Singapore", "Malaysia", "Vietnam", "Thailand", "Indonesia"], n, p=[.3, .22, .2, .15, .13]),
        "segment": rng.choice(["Retail", "School", "Library"], n, p=[.6, .25, .15]),
        "signup_date": _dates(rng, "2023-06-01", "2023-12-31", n)})
    adj = ["Quiet", "Hidden", "Last", "Paper", "Silver", "Distant", "Small", "Bright", "Salt", "Winter", "Open", "Slow"]
    noun = ["Harbor", "Atlas", "Orchard", "Signal", "Lantern", "Tide", "Garden", "Compass", "Bridge", "Archive", "Meadow", "Engine"]
    titles = [f"The {a} {b}" for a, b in zip(adj + adj, noun + noun[5:] + noun[:5])]
    assert len(set(titles)) == 24
    books = pd.DataFrame({"book_id": np.arange(1, 25), "title": titles, "genre": np.repeat(["Children", "Fiction", "History", "Science"], 6),
                          "price": np.round(rng.uniform(8, 45, 24), 2)})
    idle = set(rng.choice(customers["customer_id"], 6, replace=False).tolist())
    head = []
    for cid in customers["customer_id"]:
        if cid in idle:
            continue
        for d in _dates(rng, "2024-01-01", "2024-12-31", int(rng.poisson(rng.choice([3, 6, 11])))):
            head.append((int(cid), d, str(rng.choice(["completed", "cancelled", "returned"], p=[.82, .1, .08])), float(rng.random())))
    orders = pd.DataFrame(head, columns=["customer_id", "order_date", "status", "u"]).sort_values(["order_date", "u"]).reset_index(drop=True)
    orders.insert(0, "order_id", np.arange(5001, 5001 + len(orders)))
    price = dict(zip(books["book_id"], books["price"]))
    items, amounts = [], []
    for oid in orders["order_id"]:
        lines = rng.choice(books["book_id"], int(rng.integers(1, 4)), replace=False)
        qty = rng.integers(1, 4, len(lines))
        items += [(int(oid), int(b), int(q)) for b, q in zip(lines, qty)]
        amounts.append(round(float(sum(price[b] * q for b, q in zip(lines, qty))), 2))
    orders["amount"] = amounts
    items = pd.DataFrame(items, columns=["order_id", "book_id", "quantity"])
    return {"customers": customers, "books": books, "orders": orders.drop(columns="u"), "order_items": items}


def contracts():
    rng = np.random.default_rng(91002)
    n = 360
    start = pd.to_datetime(_dates(rng, "2023-07-01", "2024-12-31", n))
    length = rng.integers(20, 400, n)
    return {"contracts": pd.DataFrame({
        "contract_id": np.arange(7001, 7001 + n), "client_id": rng.integers(1, 61, n),
        "start_date": start.strftime("%Y-%m-%d"), "end_date": (start + pd.to_timedelta(length, unit="D")).strftime("%Y-%m-%d"),
        "value": (np.round(rng.lognormal(12.1, 0.7, n), -3)).astype(int)}).sort_values(["start_date", "contract_id"]).reset_index(drop=True)}


def daily_sales():
    rng = np.random.default_rng(91003)
    days = pd.date_range("2024-03-01", periods=120).strftime("%Y-%m-%d")
    rows = []
    for store in range(1, 13):
        base, x = rng.uniform(1500, 6000), 0.0
        for d in days:
            x = 0.8 * x + rng.normal(0, 0.12)
            rows.append((store, d, round(float(base * (1 + x)), 2)))
    df = pd.DataFrame(rows, columns=["store_id", "sale_date", "revenue"])
    return {"daily_sales": df.sample(frac=1, random_state=4).reset_index(drop=True)}


def purchases():
    rng = np.random.default_rng(91004)
    rows = []
    for user in range(1, 701):
        first = pd.Timestamp("2024-01-01") + pd.Timedelta(days=int(rng.integers(0, 366)))
        rows.append((user, first))
        keen = rng.beta(2, 4)
        if rng.random() < 0.15:                                                 # a second purchase in the first month
            last = first + pd.offsets.MonthEnd(0)
            rows.append((user, first + pd.Timedelta(days=int(rng.integers(0, (last - first).days + 1)))))
        month = first + pd.offsets.MonthBegin(1)
        while month <= pd.Timestamp("2024-12-01"):
            if rng.random() < keen:
                rows.append((user, month + pd.Timedelta(days=int(rng.integers(0, month.days_in_month)))))
            month += pd.offsets.MonthBegin(1)
    df = pd.DataFrame(rows, columns=["user_id", "purchase_date"]).sort_values(["purchase_date", "user_id"]).reset_index(drop=True)
    df.insert(0, "purchase_id", np.arange(30001, 30001 + len(df)))
    df["purchase_date"] = df["purchase_date"].dt.strftime("%Y-%m-%d")
    return {"purchases": df}


def employees():
    rng = np.random.default_rng(91005)
    n = 84
    return {"employees": pd.DataFrame({
        "employee_id": np.arange(1, n + 1), "name": _names(rng, n),
        "department": rng.choice(["Analytics", "Engineering", "Finance", "Marketing", "Operations", "Sales"], n),
        "salary": rng.choice(np.arange(3500, 12001, 500), n),
        "hire_date": _dates(rng, "2015-01-01", "2024-06-30", n)})}


def events():
    rng = np.random.default_rng(91006)
    rate = {"Email": (.42, .50), "Search": (.35, .42), "Social": (.22, .30), "Referral": (.48, .58), "Display": (.15, .25)}
    rows = []
    for user in range(1, 1201):
        channel = str(rng.choice(list(rate)))
        cart, buy = rate[channel]
        t = pd.Timestamp("2024-09-01") + pd.Timedelta(minutes=int(rng.integers(0, 60 * 24 * 30)))
        kinds = ["visit"] * int(rng.integers(1, 4))
        if rng.random() < cart:
            kinds += ["cart"] * int(rng.integers(1, 3))
            if rng.random() < buy:
                kinds += ["purchase"] * int(rng.choice([1, 1, 1, 2]))
        for k in kinds:
            t += pd.Timedelta(minutes=int(rng.integers(1, 600)))
            rows.append((user, channel, k, t))
    df = pd.DataFrame(rows, columns=["user_id", "channel", "event_type", "event_time"]).sort_values(["event_time", "user_id"]).reset_index(drop=True)
    df.insert(0, "event_id", np.arange(1, len(df) + 1))
    df["event_time"] = df["event_time"].dt.strftime("%Y-%m-%d %H:%M:%S")
    return {"events": df}


def ticket_updates():
    rng = np.random.default_rng(91007)
    rows = []
    for ticket in range(1, 421):
        priority = str(rng.choice(["low", "medium", "high", "urgent"], p=[.35, .35, .2, .1]))
        t = pd.Timestamp("2024-10-01") + pd.Timedelta(minutes=int(rng.integers(0, 60 * 24 * 40)))
        status = "open"
        rows.append((ticket, priority, status, t))
        for _ in range(int(rng.integers(0, 5))):
            t += pd.Timedelta(minutes=int(rng.choice([0, 30, 240, 1440, 4000])))      # 0 minutes: two updates in one moment
            status = str(rng.choice({"open": ["in_progress", "waiting", "closed"], "in_progress": ["waiting", "closed", "closed"],
                                     "waiting": ["in_progress", "closed"], "closed": ["open", "closed"]}[status]))
            rows.append((ticket, priority, status, t))
    df = pd.DataFrame(rows, columns=["ticket_id", "priority", "status", "updated_at"])
    order = df.sort_values("updated_at", kind="stable").index
    df.loc[order, "update_id"] = np.arange(1, len(df) + 1)
    df["update_id"] = df["update_id"].astype(int)
    df["updated_at"] = df["updated_at"].dt.strftime("%Y-%m-%d %H:%M:%S")
    return {"ticket_updates": df[["update_id", "ticket_id", "priority", "status", "updated_at"]].sample(frac=1, random_state=2).reset_index(drop=True)}


SHOP = bookstore()
NOTES = {
    "customers": "One row per customer. <code>segment</code> is <code>Retail</code>, <code>School</code>, or <code>Library</code>.",
    "orders": "One row per order in 2024. <code>status</code> is <code>completed</code>, <code>cancelled</code>, or <code>returned</code>. Dates are text in the form <code>2024-03-15</code>.",
    "order_items": "One row per book title in an order.",
    "books": "One row per book.",
}


def tables(frames, notes=NOTES):
    items = "".join(f"<li><code>{name}</code>: {cols(*df.columns)}. {notes.get(name, '')}</li>" for name, df in frames.items())
    return f'<h3>Tables</h3><ul class="files">{items}</ul>'


def result_spec(columns, order):
    return (f"<h3>Result</h3><p>Columns, in this order: {cols(*columns)}.</p><p>{order}</p>")


# ================================================================ the checks, shared by every task
RUNS = "The query runs and returns a result"
COLS = "The columns match the spec, in order"
ROWS = "The number of rows is right"
VALUES = "Every value is right"
ORDER = "The rows are in the requested order"

GRADER = code('''
    import numpy as np
    import pandas as pd

    COLUMNS = __COLUMNS__
    KEY = __KEY__
    ORDERED = __ORDERED__
    OPEN = __OPEN__
    ROWS_HINT = __ROWS_HINT__
    VALUES_HINT = __VALUES_HINT__
    RUNS, COLS, ROWS, VALUES, ORDER = __NAMES__


    def _text(s):
        return s.astype(str).str.strip()


    def _key(df):
        return df[KEY].astype(str).apply(lambda s: s.str.strip()).agg('|'.join, axis=1)


    def grade(c):
        hide = lambda name: name if OPEN else (name, True)
        c.plan(RUNS, COLS, hide(ROWS), hide(VALUES), *([hide(ORDER)] if ORDERED else []))
        path = c.work / 'result.csv'
        if not c.check(RUNS, path.is_file(), 'There is no result yet.',
                       'Run the query first. The console shows the error if the query did not run.'):
            return
        got = pd.read_csv(path)
        if not c.columns(COLS, got, COLUMNS, hint='Name each column with AS, and list the columns in the order of the spec: ' + ', '.join(COLUMNS) + '.'):
            return
        exp = c.expected('result.csv')
        if not c.check(ROWS, len(got) == len(exp), f'Your result has {len(got):,} rows.',
                       (ROWS_HINT + ' ' if ROWS_HINT else '') + ('Too many rows often means a join that multiplies rows or a missing filter.' if len(got) > len(exp)
                                                                 else 'Too few rows often means a filter or an inner join that drops rows.')):
            return
        a = got.assign(_k=_key(got)).sort_values('_k', kind='stable').reset_index(drop=True)
        b = exp.assign(_k=_key(exp)).sort_values('_k', kind='stable').reset_index(drop=True)
        bad = None
        for col in ['_k'] + [x for x in COLUMNS if x not in KEY]:
            if col != '_k' and pd.api.types.is_numeric_dtype(exp[col]):
                x, y = pd.to_numeric(a[col], errors='coerce'), b[col].astype(float)
                tol = 0.006 if pd.api.types.is_float_dtype(exp[col]) else 1e-9
                same = ((x - y).abs() <= tol) | (x.isna() & y.isna())
            else:
                same = (_text(a[col]) == _text(b[col])) | (a[col].isna() & b[col].isna())
            if not same.all():
                i = int(np.argmax(~same.to_numpy()))
                where = ', '.join(f'{k} = {b[k].iloc[i]}' for k in KEY)
                bad = (f'{int((~same).sum()):,} of {len(b):,} rows are not in the expected result. Compare your {" and ".join(KEY)} values with the task.' if col == '_k'
                       else f'{col} is wrong in {int((~same).sum()):,} of {len(b):,} rows. For example, where {where}, your value is {a[col].iloc[i]}.')
                break
        if not c.check(VALUES, bad is None, bad or '', VALUES_HINT):
            return
        if ORDERED:
            same = list(_key(got)) == list(_key(exp))
            c.check(ORDER, same, 'The rows are right, but their order is not.', 'Add an ORDER BY that matches the spec, with the tie-break if the task names one.')
''')

TASKS = []


def task(id, group, title, minutes, frames, ask, columns, order, sql, oracle, key, sort_on=None, hints=(), wrong=(), notes="",
         rows_hint="", values_hint="", table_notes=NOTES):
    sql = textwrap.dedent(sql).strip() + "\n"
    exp = run_sql(sql, frames)
    assert list(exp.columns) == columns, (id, list(exp.columns))
    assert len(exp) >= 2 and not exp.duplicated(key).any(), (id, "the key is not unique", len(exp))
    if sort_on:
        assert not exp.duplicated(sort_on).any(), (id, "the sort order has ties")

    def verdict(q):
        got = run_sql(q, frames)
        if list(got.columns) != columns:
            return COLS
        if len(got) != len(exp):
            return ROWS
        a, b = (d.sort_values(key, kind="stable").reset_index(drop=True) for d in (got, exp))
        for col in columns:
            if pd.api.types.is_numeric_dtype(b[col]):
                same = np.isclose(pd.to_numeric(a[col], errors="coerce").astype(float), b[col].astype(float), atol=0.006, equal_nan=True)
            else:
                same = a[col].astype(str) == b[col].astype(str)
            if not np.all(same):
                return VALUES
        if sort_on and got[key].astype(str).agg("|".join, axis=1).tolist() != exp[key].astype(str).agg("|".join, axis=1).tolist():
            return ORDER
        raise AssertionError(f"{id}: a wrong query gives the right answer:\n{q}")

    variants = [dict(name=name, hint="", code=wrap(textwrap.dedent(q).strip() + "\n"), fails=[verdict(q)]) for name, q in wrong]
    grader = GRADER
    for k, v in (("__COLUMNS__", columns), ("__KEY__", key), ("__ORDERED__", bool(sort_on)), ("__OPEN__", group == "drills"),
                 ("__ROWS_HINT__", rows_hint), ("__VALUES_HINT__", values_hint), ("__NAMES__", (RUNS, COLS, ROWS, VALUES, ORDER))):
        grader = grader.replace(k, repr(v))
    floats = {c: 2 for c in columns if pd.api.types.is_float_dtype(exp[c])}
    desc = html(f"{ask}{tables(frames, table_notes)}{result_spec(columns, order)}")
    assert len(hints) == 3, id
    TASKS.append(dict(
        id=id, module=0, lang="sql", group=group, title=title, story="SQL", minutes=minutes,
        inputs={f"{name}.csv": csv_text(df) for name, df in frames.items()}, outputs=["result.csv"], hidden={}, expect=["result.csv"], align=None,
        desc=desc, starter="-- One SELECT statement. Each CSV file in the Files tab is a table.\n\nSELECT\n", solution=sql, solution_run=wrap(sql),
        grader=grader, hints=list(hints), variants=variants, oracle=lambda inputs, f=oracle: {"result.csv": f({k[:-4]: read_csv_text(v) for k, v in inputs.items()})},
        oracle_decimals=floats, notes=notes))


def pick(*names):
    return {n: SHOP[n] for n in names}


def done(d):
    return d["orders"][d["orders"]["status"] == "completed"]


def _bands(a):
    g = pd.Series(np.where(a < 30, "small", np.where(a < 80, "medium", "large"))).value_counts().rename_axis("band").rename("n_orders").reset_index()
    return g.assign(share_pct=(100 * g["n_orders"] / g["n_orders"].sum()).round(1)).sort_values("n_orders", ascending=False)


# ================================================================ drills
task("sql-filter", "drills", "Filter, sort, and limit", 3, pick("orders"),
     "<p>Return the 10 largest completed orders placed on or after 1 July 2024.</p>",
     ["order_id", "customer_id", "order_date", "amount"], "Sort by <code>amount</code>, largest first. Break ties by <code>order_id</code>, smallest first.",
     """
     SELECT order_id, customer_id, order_date, amount
     FROM orders
     WHERE status = 'completed'
       AND order_date >= '2024-07-01'
     ORDER BY amount DESC, order_id
     LIMIT 10;
     """,
     lambda d: done(d)[done(d)["order_date"] >= "2024-07-01"].sort_values(["amount", "order_id"], ascending=[False, True]).head(10)[["order_id", "customer_id", "order_date", "amount"]],
     key=["order_id"], sort_on=["order_id"],
     hints=["The clauses go in this order: SELECT, FROM, WHERE, ORDER BY, LIMIT.",
            "Dates in the form 2024-07-01 compare correctly as text, so order_date >= '2024-07-01' works.",
            "ORDER BY amount DESC, order_id sorts the largest first and breaks ties by the id. LIMIT 10 keeps the first ten."],
     wrong=[("any_status", "SELECT order_id, customer_id, order_date, amount FROM orders WHERE order_date >= '2024-07-01' ORDER BY amount DESC, order_id LIMIT 10"),
            ("whole_year", "SELECT order_id, customer_id, order_date, amount FROM orders WHERE status = 'completed' ORDER BY amount DESC, order_id LIMIT 10"),
            ("smallest", "SELECT order_id, customer_id, order_date, amount FROM orders WHERE status = 'completed' AND order_date >= '2024-07-01' ORDER BY amount, order_id LIMIT 10")],
     notes="<p>MS SQL Server has no LIMIT. It uses <code>SELECT TOP 10 ...</code> or <code>OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY</code>.</p>")

task("sql-group", "drills", "Group and aggregate", 3, pick("orders"),
     "<p>Summarize the orders by status.</p>",
     ["status", "n_orders", "total_amount", "avg_amount"],
     "<code>n_orders</code> is the number of orders, <code>total_amount</code> the sum of <code>amount</code>, and <code>avg_amount</code> its mean. Round both amounts to 2 decimals. Sort by <code>status</code>.",
     """
     SELECT status,
            COUNT(*) AS n_orders,
            ROUND(SUM(amount), 2) AS total_amount,
            ROUND(AVG(amount), 2) AS avg_amount
     FROM orders
     GROUP BY status
     ORDER BY status;
     """,
     lambda d: d["orders"].groupby("status").agg(n_orders=("order_id", "size"), total_amount=("amount", "sum"), avg_amount=("amount", "mean")).round(2).reset_index(),
     key=["status"], sort_on=["status"],
     hints=["Every column in SELECT is either in GROUP BY or inside an aggregate function.",
            "COUNT(*) counts rows. SUM(amount) and AVG(amount) work on the rows of each group.",
            "Wrap each amount in ROUND(..., 2) and give it a name with AS."],
     wrong=[("customers", "SELECT status, COUNT(DISTINCT customer_id) AS n_orders, ROUND(SUM(amount), 2) AS total_amount, ROUND(AVG(amount), 2) AS avg_amount FROM orders GROUP BY status ORDER BY status"),
            ("no_alias", "SELECT status, COUNT(*), ROUND(SUM(amount), 2), ROUND(AVG(amount), 2) FROM orders GROUP BY status ORDER BY status")])

task("sql-having", "drills", "Filter groups with HAVING", 3, pick("orders"),
     "<p>List the customers who have at least 8 completed orders.</p>",
     ["customer_id", "n_orders"], "Sort by <code>n_orders</code>, largest first, then by <code>customer_id</code>.",
     """
     SELECT customer_id, COUNT(*) AS n_orders
     FROM orders
     WHERE status = 'completed'
     GROUP BY customer_id
     HAVING COUNT(*) >= 8
     ORDER BY n_orders DESC, customer_id;
     """,
     lambda d: (lambda g: g[g["n_orders"] >= 8].sort_values(["n_orders", "customer_id"], ascending=[False, True]))(
         done(d).groupby("customer_id").size().rename("n_orders").reset_index()),
     key=["customer_id"], sort_on=["customer_id"],
     hints=["WHERE filters rows before the grouping. HAVING filters groups after it.",
            "Keep the completed orders with WHERE, group by customer_id, then keep the groups with HAVING COUNT(*) >= 8.",
            "The order of the clauses is WHERE, GROUP BY, HAVING, ORDER BY."],
     wrong=[("all_statuses", "SELECT customer_id, COUNT(*) AS n_orders FROM orders GROUP BY customer_id HAVING COUNT(*) >= 8 ORDER BY n_orders DESC, customer_id"),
            ("more_than", "SELECT customer_id, COUNT(*) AS n_orders FROM orders WHERE status = 'completed' GROUP BY customer_id HAVING COUNT(*) > 8 ORDER BY n_orders DESC, customer_id"),
            ("unsorted", "SELECT customer_id, COUNT(*) AS n_orders FROM orders WHERE status = 'completed' GROUP BY customer_id HAVING COUNT(*) >= 8 ORDER BY customer_id")])

task("sql-join", "drills", "Join, then aggregate", 4, pick("customers", "orders"),
     "<p>Report the revenue from completed orders for each country.</p>",
     ["country", "n_customers", "revenue"],
     "<code>n_customers</code> is the number of different customers with a completed order, and <code>revenue</code> is the sum of <code>amount</code>, rounded to 2 decimals. Sort by <code>revenue</code>, largest first.",
     """
     SELECT c.country,
            COUNT(DISTINCT o.customer_id) AS n_customers,
            ROUND(SUM(o.amount), 2) AS revenue
     FROM orders AS o
     JOIN customers AS c ON c.customer_id = o.customer_id
     WHERE o.status = 'completed'
     GROUP BY c.country
     ORDER BY revenue DESC;
     """,
     lambda d: done(d).merge(d["customers"], on="customer_id").groupby("country").agg(n_customers=("customer_id", "nunique"), revenue=("amount", "sum")).round(2)
         .reset_index().sort_values("revenue", ascending=False),
     key=["country"], sort_on=["revenue"],
     hints=["Join orders to customers on customer_id, so that each order row carries its customer's country.",
            "After the join, one customer appears once per order. COUNT(DISTINCT o.customer_id) counts each customer once.",
            "Filter with WHERE o.status = 'completed', group by c.country, and sort by the revenue alias."],
     wrong=[("count_rows", "SELECT c.country, COUNT(*) AS n_customers, ROUND(SUM(o.amount), 2) AS revenue FROM orders o JOIN customers c ON c.customer_id = o.customer_id WHERE o.status = 'completed' GROUP BY c.country ORDER BY revenue DESC"),
            ("all_statuses", "SELECT c.country, COUNT(DISTINCT o.customer_id) AS n_customers, ROUND(SUM(o.amount), 2) AS revenue FROM orders o JOIN customers c ON c.customer_id = o.customer_id GROUP BY c.country ORDER BY revenue DESC")])

task("sql-left", "drills", "Left join and keep the zeros", 4, pick("customers", "orders"),
     "<p>For every customer, count the completed orders. A customer with no completed order must still appear, with a count of 0.</p>",
     ["customer_id", "name", "n_completed"], "Sort by <code>n_completed</code>, largest first, then by <code>customer_id</code>.",
     """
     SELECT c.customer_id, c.name, COUNT(o.order_id) AS n_completed
     FROM customers AS c
     LEFT JOIN orders AS o
            ON o.customer_id = c.customer_id
           AND o.status = 'completed'
     GROUP BY c.customer_id, c.name
     ORDER BY n_completed DESC, c.customer_id;
     """,
     lambda d: d["customers"][["customer_id", "name"]].assign(n_completed=d["customers"]["customer_id"].map(done(d).groupby("customer_id").size()).fillna(0).astype(int))
         .sort_values(["n_completed", "customer_id"], ascending=[False, True]),
     key=["customer_id"], sort_on=["customer_id"],
     rows_hint="A condition on the right table in WHERE turns a left join into an inner join. Put it in the ON clause.",
     values_hint="COUNT(*) counts the row that a left join keeps for a customer with no match. COUNT(o.order_id) skips its NULL.",
     hints=["Start from customers and LEFT JOIN orders, so that every customer survives the join.",
            "Put the status condition in the ON clause. In WHERE it would remove the customers who have no completed order.",
            "COUNT(o.order_id) counts only the rows where an order matched, so customers without one get 0."],
     wrong=[("where_filter", "SELECT c.customer_id, c.name, COUNT(o.order_id) AS n_completed FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id WHERE o.status = 'completed' GROUP BY c.customer_id, c.name ORDER BY n_completed DESC, c.customer_id"),
            ("count_star", "SELECT c.customer_id, c.name, COUNT(*) AS n_completed FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id AND o.status = 'completed' GROUP BY c.customer_id, c.name ORDER BY n_completed DESC, c.customer_id"),
            ("inner", "SELECT c.customer_id, c.name, COUNT(o.order_id) AS n_completed FROM customers c JOIN orders o ON o.customer_id = c.customer_id AND o.status = 'completed' GROUP BY c.customer_id, c.name ORDER BY n_completed DESC, c.customer_id")])

task("sql-case", "drills", "Buckets with CASE", 4, pick("orders"),
     "<p>Put each completed order in a size band: <code>small</code> for an amount under 30, <code>medium</code> for 30 to under 80, and <code>large</code> for 80 or more. Count the orders in each band.</p>",
     ["band", "n_orders", "share_pct"],
     "<code>share_pct</code> is the band's share of all completed orders, as a percentage rounded to 1 decimal. Sort by <code>n_orders</code>, largest first.",
     """
     SELECT CASE WHEN amount < 30 THEN 'small'
                 WHEN amount < 80 THEN 'medium'
                 ELSE 'large' END AS band,
            COUNT(*) AS n_orders,
            ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS share_pct
     FROM orders
     WHERE status = 'completed'
     GROUP BY band
     ORDER BY n_orders DESC;
     """,
     lambda d: _bands(done(d)["amount"].to_numpy()),
     key=["band"], sort_on=["n_orders"],
     values_hint="Dividing one whole number by another drops the decimals in SQLite, PostgreSQL, and SQL Server. Multiply by 100.0 first.",
     hints=["CASE checks its WHEN branches from the top and stops at the first true one, so the second branch needs no lower bound.",
            "Group by the band. For the share, divide COUNT(*) by the count of all completed orders: a scalar subquery, or SUM(COUNT(*)) OVER ().",
            "Write 100.0 * COUNT(*) / ..., not 100 * COUNT(*) / ..., so that the division keeps its decimals."],
     wrong=[("integer_division", "SELECT CASE WHEN amount < 30 THEN 'small' WHEN amount < 80 THEN 'medium' ELSE 'large' END AS band, COUNT(*) AS n_orders, ROUND(100 * COUNT(*) / (SELECT COUNT(*) FROM orders WHERE status = 'completed'), 1) AS share_pct FROM orders WHERE status = 'completed' GROUP BY band ORDER BY n_orders DESC"),
            ("share_of_all", "SELECT CASE WHEN amount < 30 THEN 'small' WHEN amount < 80 THEN 'medium' ELSE 'large' END AS band, COUNT(*) AS n_orders, ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM orders), 1) AS share_pct FROM orders WHERE status = 'completed' GROUP BY band ORDER BY n_orders DESC")],
     notes="<p>Grouping by the alias <code>band</code> works in SQLite, PostgreSQL, and MySQL. SQL Server wants the whole CASE expression repeated in GROUP BY.</p>")

task("sql-month", "drills", "Months and distinct counts", 4, pick("orders"),
     "<p>For each month of 2024, count the completed orders and the customers who placed them.</p>",
     ["month", "n_orders", "active_customers"],
     "<code>month</code> is text in the form <code>2024-03</code>. <code>active_customers</code> counts each customer once per month. Sort by <code>month</code>.",
     """
     SELECT strftime('%Y-%m', order_date) AS month,
            COUNT(*) AS n_orders,
            COUNT(DISTINCT customer_id) AS active_customers
     FROM orders
     WHERE status = 'completed'
     GROUP BY month
     ORDER BY month;
     """,
     lambda d: done(d).assign(month=done(d)["order_date"].str[:7]).groupby("month").agg(n_orders=("order_id", "size"), active_customers=("customer_id", "nunique")).reset_index(),
     key=["month"], sort_on=["month"],
     hints=["In SQLite, strftime('%Y-%m', order_date) turns 2024-03-15 into 2024-03. substr(order_date, 1, 7) does the same for text dates.",
            "Group by the month expression or its alias.",
            "COUNT(DISTINCT customer_id) counts each customer once within the group."],
     wrong=[("count_rows", "SELECT strftime('%Y-%m', order_date) AS month, COUNT(*) AS n_orders, COUNT(customer_id) AS active_customers FROM orders WHERE status = 'completed' GROUP BY month ORDER BY month"),
            ("month_only", "SELECT strftime('%m', order_date) AS month, COUNT(*) AS n_orders, COUNT(DISTINCT customer_id) AS active_customers FROM orders WHERE status = 'completed' GROUP BY month ORDER BY month")],
     notes="<p>The month expression is the part that changes between databases. PostgreSQL: <code>TO_CHAR(order_date, 'YYYY-MM')</code> or <code>DATE_TRUNC('month', order_date)</code>. MySQL: <code>DATE_FORMAT(order_date, '%Y-%m')</code>. SQL Server: <code>FORMAT(order_date, 'yyyy-MM')</code>.</p>")

task("sql-anti", "drills", "Rows with no match", 3, pick("customers", "orders"),
     "<p>List the customers who have never placed an order, of any status.</p>",
     ["customer_id", "name", "signup_date"], "Sort by <code>signup_date</code>, then by <code>customer_id</code>.",
     """
     SELECT c.customer_id, c.name, c.signup_date
     FROM customers AS c
     LEFT JOIN orders AS o ON o.customer_id = c.customer_id
     WHERE o.order_id IS NULL
     ORDER BY c.signup_date, c.customer_id;
     """,
     lambda d: d["customers"][~d["customers"]["customer_id"].isin(d["orders"]["customer_id"])].sort_values(["signup_date", "customer_id"])[["customer_id", "name", "signup_date"]],
     key=["customer_id"], sort_on=["customer_id"],
     hints=["This is an anti-join: keep the rows of one table that have no partner in the other.",
            "LEFT JOIN orders, then keep the rows where the order side is missing: WHERE o.order_id IS NULL.",
            "NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id) gives the same rows. Test for NULL with IS NULL, never with = NULL."],
     wrong=[("no_cancelled", "SELECT c.customer_id, c.name, c.signup_date FROM customers c WHERE c.customer_id NOT IN (SELECT customer_id FROM orders WHERE status = 'cancelled') ORDER BY c.signup_date, c.customer_id"),
            ("unsorted", "SELECT c.customer_id, c.name, c.signup_date FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id WHERE o.order_id IS NULL ORDER BY c.customer_id")],
     notes="<p><code>NOT IN (subquery)</code> returns no rows at all if the subquery yields a single NULL. <code>NOT EXISTS</code> and the left join with <code>IS NULL</code> don't have that trap.</p>")

task("sql-cte", "drills", "Two steps with a CTE", 5, pick("customers", "orders"),
     "<p>First total the completed spend of each customer. Then, for each segment, report how many customers have completed spend and what they spent on average.</p>",
     ["segment", "n_customers", "avg_spend"], "<code>avg_spend</code> is the mean of the customers' totals, rounded to 2 decimals. Sort by <code>segment</code>.",
     """
     WITH spend AS (
         SELECT customer_id, SUM(amount) AS total
         FROM orders
         WHERE status = 'completed'
         GROUP BY customer_id
     )
     SELECT c.segment,
            COUNT(*) AS n_customers,
            ROUND(AVG(s.total), 2) AS avg_spend
     FROM spend AS s
     JOIN customers AS c ON c.customer_id = s.customer_id
     GROUP BY c.segment
     ORDER BY c.segment;
     """,
     lambda d: done(d).groupby("customer_id")["amount"].sum().rename("total").reset_index().merge(d["customers"], on="customer_id")
         .groupby("segment").agg(n_customers=("customer_id", "size"), avg_spend=("total", "mean")).round(2).reset_index(),
     key=["segment"], sort_on=["segment"],
     values_hint="The average is over customers, so total each customer first. AVG(amount) on the order rows is the average order, which is a different number.",
     hints=["WITH name AS (SELECT ...) defines a named result that the main query can use like a table.",
            "In the CTE, group the completed orders by customer_id and sum the amount.",
            "In the main query, join the CTE to customers, group by segment, and take COUNT(*) and AVG of the totals."],
     wrong=[("avg_order", "SELECT c.segment, COUNT(DISTINCT c.customer_id) AS n_customers, ROUND(AVG(o.amount), 2) AS avg_spend FROM orders o JOIN customers c ON c.customer_id = o.customer_id WHERE o.status = 'completed' GROUP BY c.segment ORDER BY c.segment"),
            ("all_customers", "WITH spend AS (SELECT customer_id, SUM(amount) AS total FROM orders WHERE status = 'completed' GROUP BY customer_id) SELECT c.segment, COUNT(*) AS n_customers, ROUND(AVG(COALESCE(s.total, 0)), 2) AS avg_spend FROM customers c LEFT JOIN spend s ON s.customer_id = c.customer_id GROUP BY c.segment ORDER BY c.segment")])

task("sql-first", "drills", "First row per group", 5, pick("orders"),
     "<p>Return each customer's first order, of any status: the one with the earliest <code>order_date</code>. If a customer has two orders on that date, take the smaller <code>order_id</code>.</p>",
     ["customer_id", "order_id", "order_date"], "Sort by <code>customer_id</code>.",
     """
     WITH ranked AS (
         SELECT customer_id, order_id, order_date,
                ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS rn
         FROM orders
     )
     SELECT customer_id, order_id, order_date
     FROM ranked
     WHERE rn = 1
     ORDER BY customer_id;
     """,
     lambda d: d["orders"].sort_values(["customer_id", "order_date", "order_id"]).groupby("customer_id").head(1)[["customer_id", "order_id", "order_date"]],
     key=["customer_id"], sort_on=["customer_id"],
     hints=["ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id) numbers each customer's orders from the earliest.",
            "A window function can't be used in WHERE. Compute it in a CTE or a subquery, then filter on it outside.",
            "Keep the rows where the row number is 1."],
     wrong=[("latest", "WITH r AS (SELECT customer_id, order_id, order_date, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC, order_id) AS rn FROM orders) SELECT customer_id, order_id, order_date FROM r WHERE rn = 1 ORDER BY customer_id"),
            ("completed_only", "WITH r AS (SELECT customer_id, order_id, order_date, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS rn FROM orders WHERE status = 'completed') SELECT customer_id, order_id, order_date FROM r WHERE rn = 1 ORDER BY customer_id"),
            ("min_both", "SELECT customer_id, MIN(order_id) AS order_id, MAX(order_date) AS order_date FROM orders GROUP BY customer_id ORDER BY customer_id")])

task("sql-topn", "drills", "Top N per group", 6, pick("books", "orders", "order_items"),
     "<p>In each genre, find the 2 books with the most units sold in completed orders. Units are the sum of <code>quantity</code>. Break ties by <code>title</code>, in alphabetical order.</p>",
     ["genre", "title", "units", "rnk"], "<code>rnk</code> is 1 for the best seller of the genre and 2 for the next. Sort by <code>genre</code>, then <code>rnk</code>.",
     """
     WITH sold AS (
         SELECT b.genre, b.title, SUM(i.quantity) AS units
         FROM order_items AS i
         JOIN orders AS o ON o.order_id = i.order_id
         JOIN books AS b ON b.book_id = i.book_id
         WHERE o.status = 'completed'
         GROUP BY b.genre, b.title
     ),
     ranked AS (
         SELECT genre, title, units,
                ROW_NUMBER() OVER (PARTITION BY genre ORDER BY units DESC, title) AS rnk
         FROM sold
     )
     SELECT genre, title, units, rnk
     FROM ranked
     WHERE rnk <= 2
     ORDER BY genre, rnk;
     """,
     lambda d: (lambda s: s.assign(rnk=s.groupby("genre").cumcount() + 1).query("rnk <= 2"))(
         d["order_items"].merge(done(d)[["order_id"]], on="order_id").merge(d["books"], on="book_id").groupby(["genre", "title"])["quantity"].sum().rename("units").reset_index()
         .sort_values(["genre", "units", "title"], ascending=[True, False, True])),
     key=["genre", "rnk"], sort_on=["genre", "rnk"],
     hints=["Work in three steps: units per book, a rank within each genre, then a filter on the rank.",
            "Join order_items to orders for the status and to books for the genre and the title. Group by genre and title.",
            "ROW_NUMBER() OVER (PARTITION BY genre ORDER BY units DESC, title) gives the rank. Filter on it in an outer query."],
     wrong=[("all_statuses", "WITH sold AS (SELECT b.genre, b.title, SUM(i.quantity) AS units FROM order_items i JOIN books b ON b.book_id = i.book_id GROUP BY b.genre, b.title), r AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY genre ORDER BY units DESC, title) AS rnk FROM sold) SELECT genre, title, units, rnk FROM r WHERE rnk <= 2 ORDER BY genre, rnk"),
            ("count_lines", "WITH sold AS (SELECT b.genre, b.title, COUNT(*) AS units FROM order_items i JOIN orders o ON o.order_id = i.order_id JOIN books b ON b.book_id = i.book_id WHERE o.status = 'completed' GROUP BY b.genre, b.title), r AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY genre ORDER BY units DESC, title) AS rnk FROM sold) SELECT genre, title, units, rnk FROM r WHERE rnk <= 2 ORDER BY genre, rnk"),
            ("no_partition", "WITH sold AS (SELECT b.genre, b.title, SUM(i.quantity) AS units FROM order_items i JOIN orders o ON o.order_id = i.order_id JOIN books b ON b.book_id = i.book_id WHERE o.status = 'completed' GROUP BY b.genre, b.title), r AS (SELECT *, ROW_NUMBER() OVER (ORDER BY units DESC, title) AS rnk FROM sold) SELECT genre, title, units, rnk FROM r WHERE rnk <= 8 ORDER BY genre, rnk")],
     notes="<p>ROW_NUMBER gives 1, 2, 3 with no ties. RANK gives 1, 1, 3 for a tie, and DENSE_RANK gives 1, 1, 2. Pick by how the task treats ties.</p>")

task("sql-running", "drills", "Running total", 5, pick("orders"),
     "<p>Report the revenue from completed orders for each month of 2024, with a running total from January.</p>",
     ["month", "revenue", "running_revenue"], "<code>month</code> has the form <code>2024-03</code>. Round both amounts to 2 decimals. Sort by <code>month</code>.",
     """
     WITH monthly AS (
         SELECT strftime('%Y-%m', order_date) AS month, SUM(amount) AS revenue
         FROM orders
         WHERE status = 'completed'
         GROUP BY month
     )
     SELECT month,
            ROUND(revenue, 2) AS revenue,
            ROUND(SUM(revenue) OVER (ORDER BY month), 2) AS running_revenue
     FROM monthly
     ORDER BY month;
     """,
     lambda d: (lambda m: m.assign(running_revenue=m["revenue"].cumsum().round(2), revenue=m["revenue"].round(2))[["month", "revenue", "running_revenue"]])(
         done(d).assign(month=done(d)["order_date"].str[:7]).groupby("month")["amount"].sum().rename("revenue").reset_index()),
     key=["month"], sort_on=["month"],
     hints=["Compute the monthly revenue in a CTE first.",
            "SUM(revenue) OVER (ORDER BY month) adds up the rows from the first month to the current one.",
            "An ORDER BY inside OVER makes the sum a running one. With an empty OVER () it is the grand total on every row."],
     wrong=[("grand_total", "WITH m AS (SELECT strftime('%Y-%m', order_date) AS month, SUM(amount) AS revenue FROM orders WHERE status = 'completed' GROUP BY month) SELECT month, ROUND(revenue, 2) AS revenue, ROUND(SUM(revenue) OVER (), 2) AS running_revenue FROM m ORDER BY month"),
            ("all_statuses", "WITH m AS (SELECT strftime('%Y-%m', order_date) AS month, SUM(amount) AS revenue FROM orders GROUP BY month) SELECT month, ROUND(revenue, 2) AS revenue, ROUND(SUM(revenue) OVER (ORDER BY month), 2) AS running_revenue FROM m ORDER BY month")])

task("sql-lag", "drills", "Change from the previous row", 5, pick("orders"),
     "<p>For each month of 2024, report the revenue from completed orders, the revenue of the month before, and the change between them.</p>",
     ["month", "revenue", "prev_revenue", "change"],
     "Round the three amounts to 2 decimals. January has no month before it, so its <code>prev_revenue</code> and <code>change</code> are NULL. Sort by <code>month</code>.",
     """
     WITH monthly AS (
         SELECT strftime('%Y-%m', order_date) AS month, SUM(amount) AS revenue
         FROM orders
         WHERE status = 'completed'
         GROUP BY month
     )
     SELECT month,
            ROUND(revenue, 2) AS revenue,
            ROUND(LAG(revenue) OVER (ORDER BY month), 2) AS prev_revenue,
            ROUND(revenue - LAG(revenue) OVER (ORDER BY month), 2) AS change
     FROM monthly
     ORDER BY month;
     """,
     lambda d: (lambda m: m.assign(prev_revenue=m["revenue"].shift().round(2), change=(m["revenue"] - m["revenue"].shift()).round(2), revenue=m["revenue"].round(2))[
         ["month", "revenue", "prev_revenue", "change"]])(done(d).assign(month=done(d)["order_date"].str[:7]).groupby("month")["amount"].sum().rename("revenue").reset_index()),
     key=["month"], sort_on=["month"],
     hints=["LAG(revenue) OVER (ORDER BY month) reads the revenue of the row before. LEAD reads the row after.",
            "Compute the monthly revenue in a CTE, then use LAG in the main query.",
            "The first month has no earlier row, so LAG returns NULL there, and a subtraction with NULL is NULL."],
     wrong=[("lead", "WITH m AS (SELECT strftime('%Y-%m', order_date) AS month, SUM(amount) AS revenue FROM orders WHERE status = 'completed' GROUP BY month) SELECT month, ROUND(revenue, 2) AS revenue, ROUND(LEAD(revenue) OVER (ORDER BY month), 2) AS prev_revenue, ROUND(revenue - LEAD(revenue) OVER (ORDER BY month), 2) AS change FROM m ORDER BY month"),
            ("zero_fill", "WITH m AS (SELECT strftime('%Y-%m', order_date) AS month, SUM(amount) AS revenue FROM orders WHERE status = 'completed' GROUP BY month) SELECT month, ROUND(revenue, 2) AS revenue, ROUND(LAG(revenue, 1, 0) OVER (ORDER BY month), 2) AS prev_revenue, ROUND(revenue - LAG(revenue, 1, 0) OVER (ORDER BY month), 2) AS change FROM m ORDER BY month")])

task("sql-share", "drills", "Share of a total", 4, pick("customers", "orders"),
     "<p>Report each country's revenue from completed orders and its share of the total.</p>",
     ["country", "revenue", "share_pct"], "Round <code>revenue</code> to 2 decimals and <code>share_pct</code>, a percentage, to 1 decimal. Sort by <code>revenue</code>, largest first.",
     """
     SELECT c.country,
            ROUND(SUM(o.amount), 2) AS revenue,
            ROUND(100.0 * SUM(o.amount) / SUM(SUM(o.amount)) OVER (), 1) AS share_pct
     FROM orders AS o
     JOIN customers AS c ON c.customer_id = o.customer_id
     WHERE o.status = 'completed'
     GROUP BY c.country
     ORDER BY revenue DESC;
     """,
     lambda d: (lambda g: g.assign(share_pct=(100 * g["revenue"] / g["revenue"].sum()).round(1), revenue=g["revenue"].round(2)).sort_values("revenue", ascending=False))(
         done(d).merge(d["customers"], on="customer_id").groupby("country")["amount"].sum().rename("revenue").reset_index()),
     key=["country"], sort_on=["revenue"],
     hints=["The total is the sum over all groups. A window function can read it while the rows stay grouped.",
            "SUM(SUM(o.amount)) OVER () is the inner group sum, added up over every group.",
            "A scalar subquery works too: divide by (SELECT SUM(amount) FROM orders WHERE status = 'completed')."],
     wrong=[("total_of_all", "SELECT c.country, ROUND(SUM(o.amount), 2) AS revenue, ROUND(100.0 * SUM(o.amount) / (SELECT SUM(amount) FROM orders), 1) AS share_pct FROM orders o JOIN customers c ON c.customer_id = o.customer_id WHERE o.status = 'completed' GROUP BY c.country ORDER BY revenue DESC"),
            ("fraction", "SELECT c.country, ROUND(SUM(o.amount), 2) AS revenue, ROUND(SUM(o.amount) / SUM(SUM(o.amount)) OVER (), 1) AS share_pct FROM orders o JOIN customers c ON c.customer_id = o.customer_id WHERE o.status = 'completed' GROUP BY c.country ORDER BY revenue DESC")])

# ================================================================ questions
QN = {"contracts": "One row per contract. A client can have several. Dates are text in the form <code>2024-03-15</code>.",
      "daily_sales": "One row per store per day, for 12 stores and 120 days in a row. No day is missing. The rows are in no particular order.",
      "purchases": "One row per purchase in 2024. A user can buy several times, also within one month.",
      "employees": "One row per employee.",
      "events": "One row per event. <code>event_type</code> is <code>visit</code>, <code>cart</code>, or <code>purchase</code>. A user can have several events of one type. Each user belongs to one channel.",
      "ticket_updates": "One row per status change of a support ticket. <code>status</code> is <code>open</code>, <code>in_progress</code>, <code>waiting</code>, or <code>closed</code>. A ticket keeps one priority. Two updates of a ticket can share a timestamp, and then the larger <code>update_id</code> is the later one."}

C = contracts()
task("sql-quarters", "questions", "Large contracts by quarter", 10, C,
     "<p>A consulting firm wants to know how many clients started a large, long contract in each quarter of 2024.</p>"
     "<p>Count, for each quarter of 2024, the different clients with at least one contract that starts in that quarter, is worth 250,000 or more, and runs for more than 90 days from <code>start_date</code> to <code>end_date</code>.</p>",
     ["quarter", "n_clients"], "<code>quarter</code> is a number from 1 to 4. Sort by <code>quarter</code>.",
     """
     SELECT (CAST(strftime('%m', start_date) AS INTEGER) + 2) / 3 AS quarter,
            COUNT(DISTINCT client_id) AS n_clients
     FROM contracts
     WHERE start_date >= '2024-01-01'
       AND start_date < '2025-01-01'
       AND value >= 250000
       AND julianday(end_date) - julianday(start_date) > 90
     GROUP BY quarter
     ORDER BY quarter;
     """,
     lambda d: (lambda c, s, e: c[(s.dt.year == 2024) & (c["value"] >= 250000) & ((e - s).dt.days > 90)].assign(quarter=s.dt.quarter).groupby("quarter")["client_id"].nunique()
                .rename("n_clients").reset_index())(d["contracts"], pd.to_datetime(d["contracts"]["start_date"]), pd.to_datetime(d["contracts"]["end_date"])),
     key=["quarter"], sort_on=["quarter"], table_notes=QN,
     values_hint="Check three things: only contracts that start in 2024, each client counted once per quarter, and a length of more than 90 days.",
     hints=["Filter first: the start year, the value, and the length. Then group by the quarter.",
            "In SQLite, the month number is CAST(strftime('%m', start_date) AS INTEGER), and (month + 2) / 3 is the quarter, because the division drops the remainder.",
            "The length in days is julianday(end_date) - julianday(start_date). COUNT(DISTINCT client_id) counts a client once even with two such contracts in a quarter."],
     wrong=[("count_contracts", "SELECT (CAST(strftime('%m', start_date) AS INTEGER) + 2) / 3 AS quarter, COUNT(*) AS n_clients FROM contracts WHERE start_date >= '2024-01-01' AND start_date < '2025-01-01' AND value >= 250000 AND julianday(end_date) - julianday(start_date) > 90 GROUP BY quarter ORDER BY quarter"),
            ("both_years", "SELECT (CAST(strftime('%m', start_date) AS INTEGER) + 2) / 3 AS quarter, COUNT(DISTINCT client_id) AS n_clients FROM contracts WHERE value >= 250000 AND julianday(end_date) - julianday(start_date) > 90 GROUP BY quarter ORDER BY quarter"),
            ("no_length", "SELECT (CAST(strftime('%m', start_date) AS INTEGER) + 2) / 3 AS quarter, COUNT(DISTINCT client_id) AS n_clients FROM contracts WHERE start_date >= '2024-01-01' AND start_date < '2025-01-01' AND value >= 250000 GROUP BY quarter ORDER BY quarter")],
     notes="<p>Date functions differ the most between databases. PostgreSQL: <code>EXTRACT(QUARTER FROM start_date)</code> and <code>end_date - start_date &gt; 90</code>. "
           "MySQL: <code>QUARTER(start_date)</code> and <code>DATEDIFF(end_date, start_date) &gt; 90</code>. SQL Server: <code>DATEPART(quarter, start_date)</code> and <code>DATEDIFF(day, start_date, end_date) &gt; 90</code>.</p>")

DS = daily_sales()


def _streaks(d):
    s = d["daily_sales"].sort_values(["store_id", "sale_date"]).reset_index(drop=True)
    s["above"] = s["revenue"] > s.groupby("store_id")["revenue"].transform("mean")
    s["run"] = (s["above"] != s.groupby("store_id")["above"].shift()).cumsum()
    g = s[s["above"]].groupby(["store_id", "run"]).agg(run_start=("sale_date", "min"), run_end=("sale_date", "max"), days=("sale_date", "size")).reset_index()
    return g[g["days"] >= 5].sort_values(["store_id", "run_start"])[["store_id", "run_start", "run_end", "days"]]


task("sql-streak", "questions", "Five days above average", 15, DS,
     "<p>A retailer looks for hot streaks. A store has a good day when its revenue is above that store's own average over the whole period.</p>"
     "<p>Find every run of 5 or more good days in a row, for every store. A store can have several runs.</p>",
     ["store_id", "run_start", "run_end", "days"], "<code>run_start</code> and <code>run_end</code> are the first and the last date of the run, and <code>days</code> is its length. Sort by <code>store_id</code>, then <code>run_start</code>.",
     """
     WITH flagged AS (
         SELECT store_id, sale_date,
                revenue > AVG(revenue) OVER (PARTITION BY store_id) AS good
         FROM daily_sales
     ),
     islands AS (
         SELECT store_id, sale_date,
                julianday(sale_date) - ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY sale_date) AS island
         FROM flagged
         WHERE good = 1
     )
     SELECT store_id,
            MIN(sale_date) AS run_start,
            MAX(sale_date) AS run_end,
            COUNT(*) AS days
     FROM islands
     GROUP BY store_id, island
     HAVING COUNT(*) >= 5
     ORDER BY store_id, run_start;
     """,
     _streaks, key=["store_id", "run_start"], sort_on=["store_id", "run_start"], table_notes=QN,
     rows_hint="Compare each day with the average of its own store, and group the good days into runs of dates that follow each other.",
     hints=["Step 1: mark the good days. AVG(revenue) OVER (PARTITION BY store_id) puts the store's average on every row.",
            "Step 2, the key idea: among the good days of one store, number the rows by date. In a run of days in a row, the date minus the row number stays the same.",
            "Step 3: group by store and by that difference. Each group is one run, so MIN and MAX of the date and COUNT(*) describe it, and HAVING COUNT(*) >= 5 keeps the long ones."],
     wrong=[("overall_average", "WITH f AS (SELECT store_id, sale_date, revenue > (SELECT AVG(revenue) FROM daily_sales) AS good FROM daily_sales), i AS (SELECT store_id, sale_date, julianday(sale_date) - ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY sale_date) AS island FROM f WHERE good = 1) SELECT store_id, MIN(sale_date) AS run_start, MAX(sale_date) AS run_end, COUNT(*) AS days FROM i GROUP BY store_id, island HAVING COUNT(*) >= 5 ORDER BY store_id, run_start"),
            ("total_good_days", "WITH f AS (SELECT store_id, sale_date, revenue > AVG(revenue) OVER (PARTITION BY store_id) AS good FROM daily_sales) SELECT store_id, MIN(sale_date) AS run_start, MAX(sale_date) AS run_end, COUNT(*) AS days FROM f WHERE good = 1 GROUP BY store_id HAVING COUNT(*) >= 5 ORDER BY store_id, run_start"),
            ("more_than_five", "WITH f AS (SELECT store_id, sale_date, revenue > AVG(revenue) OVER (PARTITION BY store_id) AS good FROM daily_sales), i AS (SELECT store_id, sale_date, julianday(sale_date) - ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY sale_date) AS island FROM f WHERE good = 1) SELECT store_id, MIN(sale_date) AS run_start, MAX(sale_date) AS run_end, COUNT(*) AS days FROM i GROUP BY store_id, island HAVING COUNT(*) > 5 ORDER BY store_id, run_start")],
     notes="<p>This pattern is called gaps and islands. It works for any run of consecutive values: days in a row, login streaks, or sequence numbers.</p>"
           "<p>In PostgreSQL, write the island as <code>sale_date - (ROW_NUMBER() OVER (...))::int</code>. In MySQL, use <code>DATE_SUB(sale_date, INTERVAL ROW_NUMBER() OVER (...) DAY)</code>.</p>")

P = purchases()


def _retention(d):
    p = d["purchases"].assign(month=pd.to_datetime(d["purchases"]["purchase_date"]).dt.to_period("M"))
    first = p.groupby("user_id")["month"].min().rename("cohort")
    p = p.join(first, on="user_id")
    back = set(p.loc[p["month"] == p["cohort"] + 1, "user_id"])
    f = first.reset_index()
    f = f[f["cohort"] < pd.Period("2024-12")]
    g = f.assign(kept=f["user_id"].isin(back)).groupby("cohort").agg(n_users=("user_id", "size"), n_retained=("kept", "sum")).reset_index()
    return g.assign(cohort_month=g["cohort"].astype(str), retention_pct=(100 * g["n_retained"] / g["n_users"]).round(1))[["cohort_month", "n_users", "n_retained", "retention_pct"]]


task("sql-retention", "questions", "Back the next month", 12, P,
     "<p>A shop measures retention by cohort. A user's cohort is the month of their first purchase. A user is retained if they buy again in the calendar month right after it.</p>"
     "<p>Report the cohorts from January to November 2024. December is left out, because the month after it is not in the data.</p>",
     ["cohort_month", "n_users", "n_retained", "retention_pct"],
     "<code>cohort_month</code> has the form <code>2024-03</code>. <code>retention_pct</code> is the retained share of the cohort as a percentage, rounded to 1 decimal. Sort by <code>cohort_month</code>.",
     """
     WITH first AS (
         SELECT user_id, MIN(purchase_date) AS first_date
         FROM purchases
         GROUP BY user_id
     ),
     back AS (
         SELECT DISTINCT f.user_id
         FROM first AS f
         JOIN purchases AS p
           ON p.user_id = f.user_id
          AND strftime('%Y-%m', p.purchase_date) = strftime('%Y-%m', date(f.first_date, 'start of month', '+1 month'))
     )
     SELECT strftime('%Y-%m', f.first_date) AS cohort_month,
            COUNT(*) AS n_users,
            COUNT(b.user_id) AS n_retained,
            ROUND(100.0 * COUNT(b.user_id) / COUNT(*), 1) AS retention_pct
     FROM first AS f
     LEFT JOIN back AS b ON b.user_id = f.user_id
     WHERE f.first_date < '2024-12-01'
     GROUP BY cohort_month
     ORDER BY cohort_month;
     """,
     _retention, key=["cohort_month"], sort_on=["cohort_month"], table_notes=QN,
     values_hint="Count each user once, even with several purchases in the next month. A second purchase in the first month does not count as retained.",
     hints=["Step 1: one row per user with the date of the first purchase, from MIN(purchase_date).",
            "Step 2: the set of users with a purchase in the month after the first one. In SQLite, date(first_date, 'start of month', '+1 month') is the first day of that month. Use DISTINCT, so that a user counts once.",
            "Step 3: left-join that set to the first-purchase rows and group by the cohort month. COUNT(*) is the cohort size, and COUNT of the joined user id is the number retained."],
     wrong=[("any_later", "WITH f AS (SELECT user_id, MIN(purchase_date) AS first_date FROM purchases GROUP BY user_id), b AS (SELECT DISTINCT f.user_id FROM f JOIN purchases p ON p.user_id = f.user_id AND strftime('%Y-%m', p.purchase_date) > strftime('%Y-%m', f.first_date)) SELECT strftime('%Y-%m', f.first_date) AS cohort_month, COUNT(*) AS n_users, COUNT(b.user_id) AS n_retained, ROUND(100.0 * COUNT(b.user_id) / COUNT(*), 1) AS retention_pct FROM f LEFT JOIN b ON b.user_id = f.user_id WHERE f.first_date < '2024-12-01' GROUP BY cohort_month ORDER BY cohort_month"),
            ("same_month_counts", "WITH f AS (SELECT user_id, MIN(purchase_date) AS first_date FROM purchases GROUP BY user_id), b AS (SELECT f.user_id FROM f JOIN purchases p ON p.user_id = f.user_id AND p.purchase_date > f.first_date) SELECT strftime('%Y-%m', f.first_date) AS cohort_month, COUNT(DISTINCT f.user_id) AS n_users, COUNT(DISTINCT b.user_id) AS n_retained, ROUND(100.0 * COUNT(DISTINCT b.user_id) / COUNT(DISTINCT f.user_id), 1) AS retention_pct FROM f LEFT JOIN b ON b.user_id = f.user_id WHERE f.first_date < '2024-12-01' GROUP BY cohort_month ORDER BY cohort_month"),
            ("with_december", "WITH f AS (SELECT user_id, MIN(purchase_date) AS first_date FROM purchases GROUP BY user_id), b AS (SELECT DISTINCT f.user_id FROM f JOIN purchases p ON p.user_id = f.user_id AND strftime('%Y-%m', p.purchase_date) = strftime('%Y-%m', date(f.first_date, 'start of month', '+1 month'))) SELECT strftime('%Y-%m', f.first_date) AS cohort_month, COUNT(*) AS n_users, COUNT(b.user_id) AS n_retained, ROUND(100.0 * COUNT(b.user_id) / COUNT(*), 1) AS retention_pct FROM f LEFT JOIN b ON b.user_id = f.user_id GROUP BY cohort_month ORDER BY cohort_month")],
     notes="<p>PostgreSQL: <code>DATE_TRUNC('month', first_date) + INTERVAL '1 month'</code>. MySQL: <code>DATE_ADD(DATE_FORMAT(first_date, '%Y-%m-01'), INTERVAL 1 MONTH)</code>.</p>")

E = employees()
task("sql-salary", "questions", "Top three salary levels", 8, E,
     "<p>For each department, list the employees who earn one of the three highest salary levels of that department. Employees with the same salary share a rank, and the next lower salary gets the next rank, with no gap.</p>",
     ["department", "name", "salary", "salary_rank"], "Sort by <code>department</code>, then <code>salary_rank</code>, then <code>name</code>.",
     """
     WITH ranked AS (
         SELECT department, name, salary,
                DENSE_RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS salary_rank
         FROM employees
     )
     SELECT department, name, salary, salary_rank
     FROM ranked
     WHERE salary_rank <= 3
     ORDER BY department, salary_rank, name;
     """,
     lambda d: (lambda e: e[e["salary_rank"] <= 3].sort_values(["department", "salary_rank", "name"])[["department", "name", "salary", "salary_rank"]])(
         d["employees"].assign(salary_rank=d["employees"].groupby("department")["salary"].rank(method="dense", ascending=False).astype(int))),
     key=["department", "name"], sort_on=["department", "name"], table_notes=QN,
     rows_hint="Ties matter here. ROW_NUMBER keeps exactly three people per department, and RANK leaves gaps after a tie.",
     hints=["You need a rank that restarts in each department: a window function with PARTITION BY department.",
            "Ties share a rank and the next level follows with no gap. That is DENSE_RANK, not RANK or ROW_NUMBER.",
            "Compute the rank in a CTE, keep salary_rank <= 3 outside, and sort by the three columns."],
     wrong=[("row_number", "WITH r AS (SELECT department, name, salary, ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC, name) AS salary_rank FROM employees) SELECT department, name, salary, salary_rank FROM r WHERE salary_rank <= 3 ORDER BY department, salary_rank, name"),
            ("rank", "WITH r AS (SELECT department, name, salary, RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS salary_rank FROM employees) SELECT department, name, salary, salary_rank FROM r WHERE salary_rank <= 3 ORDER BY department, salary_rank, name"),
            ("company_wide", "WITH r AS (SELECT department, name, salary, DENSE_RANK() OVER (ORDER BY salary DESC) AS salary_rank FROM employees) SELECT department, name, salary, salary_rank FROM r WHERE salary_rank <= 3 ORDER BY department, salary_rank, name")])

EV = events()


def _funnel(d):
    e = d["events"]
    v = e[e["event_type"] == "visit"].groupby("channel")["user_id"].nunique().rename("visitors")
    b = e[e["event_type"] == "purchase"].groupby("channel")["user_id"].nunique().rename("buyers")
    g = pd.concat([v, b], axis=1).fillna(0).astype(int).reset_index()
    return g.assign(conversion_pct=(100 * g["buyers"] / g["visitors"]).round(1)).sort_values(["conversion_pct", "channel"], ascending=[False, True])


task("sql-funnel", "questions", "Conversion by channel", 10, EV,
     "<p>A web shop logs every visit, every cart, and every purchase. Compare the marketing channels by conversion: the share of visiting users who made at least one purchase.</p>",
     ["channel", "visitors", "buyers", "conversion_pct"],
     "<code>visitors</code> and <code>buyers</code> count users, not events. <code>conversion_pct</code> is buyers per 100 visitors, rounded to 1 decimal. Sort by <code>conversion_pct</code>, largest first.",
     """
     SELECT channel,
            COUNT(DISTINCT CASE WHEN event_type = 'visit' THEN user_id END) AS visitors,
            COUNT(DISTINCT CASE WHEN event_type = 'purchase' THEN user_id END) AS buyers,
            ROUND(100.0 * COUNT(DISTINCT CASE WHEN event_type = 'purchase' THEN user_id END)
                        / COUNT(DISTINCT CASE WHEN event_type = 'visit' THEN user_id END), 1) AS conversion_pct
     FROM events
     GROUP BY channel
     ORDER BY conversion_pct DESC;
     """,
     _funnel, key=["channel"], sort_on=["conversion_pct"], table_notes=QN,
     values_hint="A user can have several events of one type. Count users with COUNT(DISTINCT ...), and multiply by 100.0 so that the division keeps its decimals.",
     hints=["One pass over the table is enough: group by channel and count two different things in each group.",
            "CASE WHEN event_type = 'visit' THEN user_id END gives the user id for a visit and NULL otherwise, and COUNT skips NULL.",
            "Wrap the CASE in COUNT(DISTINCT ...) so that a user with three visits counts once. Then divide the two counts, with 100.0 first."],
     wrong=[("count_events", "SELECT channel, SUM(CASE WHEN event_type = 'visit' THEN 1 ELSE 0 END) AS visitors, SUM(CASE WHEN event_type = 'purchase' THEN 1 ELSE 0 END) AS buyers, ROUND(100.0 * SUM(CASE WHEN event_type = 'purchase' THEN 1 ELSE 0 END) / SUM(CASE WHEN event_type = 'visit' THEN 1 ELSE 0 END), 1) AS conversion_pct FROM events GROUP BY channel ORDER BY conversion_pct DESC"),
            ("integer_division", "SELECT channel, COUNT(DISTINCT CASE WHEN event_type = 'visit' THEN user_id END) AS visitors, COUNT(DISTINCT CASE WHEN event_type = 'purchase' THEN user_id END) AS buyers, ROUND(100 * COUNT(DISTINCT CASE WHEN event_type = 'purchase' THEN user_id END) / COUNT(DISTINCT CASE WHEN event_type = 'visit' THEN user_id END), 1) AS conversion_pct FROM events GROUP BY channel ORDER BY conversion_pct DESC, channel"),
            ("cart_rate", "SELECT channel, COUNT(DISTINCT CASE WHEN event_type = 'visit' THEN user_id END) AS visitors, COUNT(DISTINCT CASE WHEN event_type = 'cart' THEN user_id END) AS buyers, ROUND(100.0 * COUNT(DISTINCT CASE WHEN event_type = 'cart' THEN user_id END) / COUNT(DISTINCT CASE WHEN event_type = 'visit' THEN user_id END), 1) AS conversion_pct FROM events GROUP BY channel ORDER BY conversion_pct DESC")],
     notes="<p>PostgreSQL also has <code>COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'visit')</code>. The CASE form works in every database.</p>")

T = ticket_updates()
task("sql-latest", "questions", "Tickets that are still open", 10, T,
     "<p>A support team logs every status change of a ticket. The current status of a ticket is the status of its latest update.</p>"
     "<p>Count the tickets whose current status is not <code>closed</code>, for each priority.</p>",
     ["priority", "open_tickets"], "Sort by <code>open_tickets</code>, largest first, then by <code>priority</code>.",
     """
     WITH latest AS (
         SELECT ticket_id, priority, status,
                ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY updated_at DESC, update_id DESC) AS rn
         FROM ticket_updates
     )
     SELECT priority, COUNT(*) AS open_tickets
     FROM latest
     WHERE rn = 1
       AND status <> 'closed'
     GROUP BY priority
     ORDER BY open_tickets DESC, priority;
     """,
     lambda d: (lambda last: last[last["status"] != "closed"].groupby("priority").size().rename("open_tickets").reset_index().sort_values(["open_tickets", "priority"], ascending=[False, True]))(
         d["ticket_updates"].sort_values(["ticket_id", "updated_at", "update_id"]).groupby("ticket_id").tail(1)),
     key=["priority"], sort_on=["priority"], table_notes=QN,
     values_hint="Reduce the table to one row per ticket first: its latest update, with update_id as the tie-break. A ticket that was open once and is closed now does not count.",
     hints=["The table has many rows per ticket. Get the latest row of each ticket before you count anything.",
            "ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY updated_at DESC, update_id DESC) is 1 on the latest update.",
            "Keep rn = 1 and status <> 'closed', then group by priority."],
     wrong=[("ever_open", "SELECT priority, COUNT(DISTINCT ticket_id) AS open_tickets FROM ticket_updates WHERE status <> 'closed' GROUP BY priority ORDER BY open_tickets DESC, priority"),
            ("first_update", "WITH l AS (SELECT ticket_id, priority, status, ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY updated_at, update_id) AS rn FROM ticket_updates) SELECT priority, COUNT(*) AS open_tickets FROM l WHERE rn = 1 AND status <> 'closed' GROUP BY priority ORDER BY open_tickets DESC, priority"),
            ("no_tie_break", "WITH l AS (SELECT ticket_id, priority, status, ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY updated_at DESC, update_id) AS rn FROM ticket_updates) SELECT priority, COUNT(*) AS open_tickets FROM l WHERE rn = 1 AND status <> 'closed' GROUP BY priority ORDER BY open_tickets DESC, priority")],
     notes="<p>Latest row per key is the most common use of ROW_NUMBER. The same query answers \"current address of each customer\" or \"last login of each user\".</p>")


# ================================================================ the page
GROUPS = [
    dict(id="drills", title="Drills", blurb="One clause or one pattern each, all on the same bookstore tables. Aim for the minutes shown, then redo any that took longer.",
         tasks=[t["id"] for t in TASKS if t["group"] == "drills"]),
    dict(id="questions", title="Practice questions", blurb="Test-style questions with their own tables. Each needs two or three steps, and the last checks stay hidden until you submit.",
         tasks=[t["id"] for t in TASKS if t["group"] == "questions"]),
]

INTRO = html("""
<p>The current test framework for data scientists is Python only, and it has no SQL module. An older version of the test had one SQL task of about 10 minutes, built around window functions, and some candidates still report SQL questions. Treat this page as insurance, and keep the plan as your main work.</p>
<p>Each task is one SELECT statement. Run shows the first rows of your result, and Test checks it. The queries run on SQLite. Where PostgreSQL, MySQL, or SQL Server differ, the reference solution says so.</p>
""")

REFERENCE = html("""
<h3>The order you write, and the order it runs</h3>
<pre class="code"><code>SELECT   columns, aggregates, window functions     -- 5
FROM     table JOIN other ON ...                    -- 1
WHERE    conditions on rows                         -- 2
GROUP BY columns                                    -- 3
HAVING   conditions on groups                       -- 4
ORDER BY columns                                    -- 6
LIMIT    n                                          -- 7</code></pre>
<p>WHERE runs before the grouping, so it can't see an aggregate. HAVING runs after it. Window functions run after HAVING, so filter on them in an outer query.</p>
<h3>Joins and NULL</h3>
<ul>
<li>An inner join keeps the rows with a match on both sides. A left join keeps every row of the left table.</li>
<li>A condition on the right table belongs in ON. In WHERE, it removes the unmatched rows and the left join becomes an inner join.</li>
<li>COUNT(*) counts rows. COUNT(column) skips NULL. COUNT(DISTINCT column) counts each value once.</li>
<li>Test with IS NULL and IS NOT NULL. A comparison with NULL is never true. COALESCE(x, 0) replaces a NULL.</li>
</ul>
<h3>Window functions</h3>
<pre class="code"><code>function() OVER (PARTITION BY group_columns ORDER BY sort_columns)

ROW_NUMBER()   1, 2, 3, 4     no ties
RANK()         1, 1, 3, 4     ties share a rank, then a gap
DENSE_RANK()   1, 1, 2, 3     ties share a rank, no gap
LAG(x), LEAD(x)               the row before, the row after
SUM(x) OVER (ORDER BY d)      running total
SUM(x) OVER ()                grand total on every row</code></pre>
<h3>Patterns worth knowing cold</h3>
<ul>
<li>Top N per group: rank in a CTE, then filter on the rank outside.</li>
<li>Latest row per key: ROW_NUMBER with a descending sort, then keep 1.</li>
<li>Conditional count: COUNT(DISTINCT CASE WHEN condition THEN id END).</li>
<li>Share of a total: 100.0 * SUM(x) / SUM(SUM(x)) OVER ().</li>
<li>Rows with no match: LEFT JOIN, then WHERE right.id IS NULL.</li>
<li>Days in a row: the date minus a row number is constant within a run. Group by it.</li>
</ul>
<h3>What changes between databases</h3>
<table class="schema"><thead><tr><th>Need</th><th>SQLite, used here</th><th>PostgreSQL</th><th>MySQL</th></tr></thead><tbody>
<tr><td>Month as text</td><td><code>strftime('%Y-%m', d)</code></td><td><code>TO_CHAR(d, 'YYYY-MM')</code></td><td><code>DATE_FORMAT(d, '%Y-%m')</code></td></tr>
<tr><td>Quarter</td><td><code>(CAST(strftime('%m', d) AS INTEGER) + 2) / 3</code></td><td><code>EXTRACT(QUARTER FROM d)</code></td><td><code>QUARTER(d)</code></td></tr>
<tr><td>Days between</td><td><code>julianday(b) - julianday(a)</code></td><td><code>b - a</code></td><td><code>DATEDIFF(b, a)</code></td></tr>
<tr><td>Add a month</td><td><code>date(d, '+1 month')</code></td><td><code>d + INTERVAL '1 month'</code></td><td><code>DATE_ADD(d, INTERVAL 1 MONTH)</code></td></tr>
<tr><td>7 / 2</td><td>3</td><td>3</td><td>3.5</td></tr>
</tbody></table>
<p>SQL Server uses <code>SELECT TOP 10</code> in place of LIMIT, <code>DATEPART</code> and <code>DATEDIFF(day, a, b)</code> for dates, and it does not accept a column alias in GROUP BY.</p>
""")


def page():
    return dict(runner=RUNNER, intro=INTRO, reference=REFERENCE, groups=GROUPS)


def exercises():
    return TASKS
