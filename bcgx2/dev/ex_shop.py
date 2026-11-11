"""Story 2: an online shop. Five short data collection drills."""
import csv
import io
import json
from collections import defaultdict
from datetime import datetime
from decimal import Decimal

import numpy as np
import pandas as pd

from common import code, csv_text, file_list, html, schema

CATS = ["Audio", "Cameras", "Laptops", "Phones", "Tablets", "Wearables"]
ACCESSORIES = [(43, "Travel adapter"), (44, "Screen protector"), (45, "USB-C cable"),
               (46, "Phone stand"), (47, "Laptop sleeve"), (48, "Cleaning kit")]
FIRST = ["Aisha", "Ben", "Chloe", "Daniel", "Elena", "Farid", "Grace", "Hiro", "Imani", "Jonas", "Kavya", "Liam",
         "Mei", "Noah", "Olga", "Pablo", "Quinn", "Rosa", "Sam", "Tara"]
LAST = ["Abbas", "Brown", "Costa", "Dubois", "Evans", "Fischer", "Garcia", "Hansen", "Ito", "Jensen", "Kim", "Lopez",
        "Meyer", "Novak", "Okafor", "Patel", "Rossi", "Silva", "Tanaka", "Weber"]
CITIES = ["Bristol", "Leeds", "Lyon", "Porto", "Turin", "Utrecht"]


def make_shop():
    rng = np.random.default_rng(31001)
    products, base = [], {}
    pid = 1
    for c in CATS:
        for k in range(1, 8):
            products.append((pid, f"{c} {k:02d}", c))
            base[pid] = float(rng.integers(40, 1400))
            pid += 1
    for apid, name in ACCESSORIES:
        products.append((apid, name, "Accessories"))
    products = pd.DataFrame(products, columns=["product_id", "product_name", "category"])

    n_cust = 320
    customers = pd.DataFrame({
        "customer_id": np.arange(1, n_cust + 1),
        "name": [f"{FIRST[i % 20]} {LAST[(i * 7 + i // 20) % 20]}" for i in range(n_cust)],
        "city": rng.choice(CITIES, n_cust),
        "signup_date": (pd.Timestamp("2021-06-01") + pd.to_timedelta(rng.integers(0, 570, n_cust), unit="D")).strftime("%Y-%m-%d"),
    })

    orders, items = [], []

    def add_order(oid, cust, when, status, lines=None):
        orders.append((oid, cust, when, status))
        if lines is None:
            k = int(rng.integers(1, 5))
            chosen = rng.choice(np.arange(1, 43), size=k, replace=False)
            lines = [(int(p), int(rng.integers(1, 4)), round(base[int(p)] * float(rng.uniform(0.9, 1.0)), 2)) for p in chosen]
        for p, q, price in lines:
            items.append((oid, p, q, f"{price:.2f}"))

    # random orders: customers 1 to 280, all of 2023 and 2024
    n_orders = 2600
    oids = rng.permutation(np.arange(10001, 10001 + n_orders))
    secs = rng.integers(0, 731 * 86400, n_orders)
    stamps = pd.Timestamp("2023-01-01") + pd.to_timedelta(secs, unit="s")
    for oid, ts in zip(oids, stamps):
        status = rng.choice(["completed", "cancelled", "returned"], p=[0.82, 0.10, 0.08])
        add_order(int(oid), int(rng.integers(1, 281)), ts.strftime("%Y-%m-%d %H:%M:%S"), str(status))

    # engineered customers 281 to 289 (customers 290 to 320 never order)
    e = 12601
    eng = [
        (281, "2023-06-10 10:00:00", "completed"), (281, "2024-03-05 14:20:00", "cancelled"),
        (282, "2023-12-31 23:59:59", "completed"),
        (283, "2024-01-01 00:00:00", "completed"),
        (284, "2024-12-31 23:30:00", "completed"),
        (285, "2024-04-11 09:15:00", "returned"), (285, "2024-09-02 18:40:00", "returned"),
        (286, "2023-02-01 12:00:00", "completed"), (286, "2023-11-20 08:00:00", "completed"), (286, "2024-02-02 16:00:00", "returned"),
        (287, "2024-05-03 23:10:00", "completed"), (287, "2024-05-04 00:20:00", "completed"), (287, "2024-05-10 12:00:00", "completed"),
    ]
    for cust, when, status in eng:
        add_order(e, cust, when, status)
        e += 1
    # 288: two completed orders at the same second, ids out of file order
    add_order(12650, 288, "2024-08-01 09:00:00", "completed")
    add_order(12641, 288, "2024-08-01 09:00:00", "completed")
    add_order(12655, 288, "2024-08-20 17:45:00", "completed")
    # 289: month boundary, and one order with two items from the same category
    add_order(12660, 289, "2024-01-31 23:59:59", "completed", [(22, 1, 610.00), (24, 2, 455.50)])     # two Phones lines
    add_order(12661, 289, "2024-02-01 00:00:00", "completed", [(23, 1, 389.99)])
    add_order(12662, 289, "2023-12-31 23:59:59", "completed", [(25, 1, 720.00)])

    # accessories: exact revenues, a tie for third place, and two orders that must not count
    acc = [
        (12700, 12, "2024-03-09 11:00:00", "completed", [(43, 10, 30.00), (45, 4, 20.00)]),
        (12701, 40, "2024-03-21 15:30:00", "completed", [(43, 5, 40.00), (44, 10, 20.00)]),
        (12702, 77, "2024-07-02 10:10:00", "completed", [(44, 6, 25.00), (46, 8, 25.00)]),
        (12703, 91, "2024-07-19 19:05:00", "completed", [(45, 6, 20.00), (47, 4, 30.00)]),
        (12704, 133, "2024-11-11 08:45:00", "completed", [(48, 4, 20.00)]),
        (12706, 201, "2024-07-25 12:00:00", "cancelled", [(47, 30, 30.00)]),
        (12707, 222, "2024-11-28 21:15:00", "returned", [(48, 30, 20.00)]),
    ]
    for oid, cust, when, status, lines in acc:
        add_order(oid, cust, when, status, lines)

    orders = pd.DataFrame(orders, columns=["order_id", "customer_id", "order_date", "status"]).sample(frac=1, random_state=5).reset_index(drop=True)
    items = pd.DataFrame(items, columns=["order_id", "product_id", "quantity", "unit_price"]).sample(frac=1, random_state=6).reset_index(drop=True)
    return {"customers.csv": csv_text(customers), "orders.csv": csv_text(orders),
            "order_items.csv": csv_text(items), "products.csv": csv_text(products)}


def make_formats():
    rng = np.random.default_rng(31002)
    regions = [("North", [(101, "Harbour"), (102, "Old Mill"), (103, "Ridgeway"), (104, "Lakeside")]),
               ("Central", [(201, "Market Square"), (202, "Station Road"), (203, "Riverside"), (204, "Parkview")]),
               ("South", [(301, "Seafront"), (302, "Castle Gate"), (303, "Meadow Lane"), (304, "Quarry Hill")])]
    managers = ["A. Tan", "B. Okoye", "C. Rossi", "D. Novak", "E. Silva", "F. Meyer", "G. Patel", "H. Kim", "I. Costa", "J. Evans", "K. Ito", "L. Weber"]
    doc, k = [], 0
    for region, stores in regions:
        entry = {"region": region, "stores": []}
        for sid, name in stores:
            opened = "2024-07-01" if sid == 304 else f"{2015 + (sid * 3) % 8}-0{1 + sid % 9}-01"
            entry["stores"].append({"id": sid, "name": name, "opened": opened,
                                    "manager": {"name": managers[k], "since": f"{2019 + k % 5}-0{1 + k % 9}-15"}})
            k += 1
        doc.append(entry)
    store_ids = [s for _, stores in regions for s, _ in stores]

    rows = []
    days = pd.date_range("2023-10-02", "2024-12-30", freq="D")
    for sid in store_ids:
        scale = float(rng.uniform(6000, 14000))
        for week_start in days[::7]:
            day = week_start + pd.Timedelta(days=int(rng.integers(0, 7)))
            if day > pd.Timestamp("2024-12-31"):
                continue
            if sid == 304 and day < pd.Timestamp("2024-07-01"):
                continue                                           # not open yet
            if sid == 203 and pd.Timestamp("2024-01-01") <= day <= pd.Timestamp("2024-03-31"):
                continue                                           # closed for a refit in Q1
            rows.append((sid, day, round(scale * float(rng.uniform(0.6, 1.4)), 2)))
    # a few fixed rows on quarter edges with day and month both at most 12
    rows += [(101, pd.Timestamp("2024-04-01"), 9100.25), (101, pd.Timestamp("2024-03-31"), 8800.75),
             (202, pd.Timestamp("2024-07-01"), 12040.10), (302, pd.Timestamp("2024-10-01"), 7650.00),
             (302, pd.Timestamp("2024-09-30"), 7010.40), (103, pd.Timestamp("2024-01-12"), 5020.55),
             (103, pd.Timestamp("2024-12-01"), 6111.11)]
    sales = pd.DataFrame(rows, columns=["store_id", "date", "net_sales"]).sample(frac=1, random_state=3).reset_index(drop=True)
    lines = ["store_id;date;net_sales"]
    for sid, day, val in sales.itertuples(index=False):
        lines.append(f"{sid};{day.strftime('%d/%m/%Y')};{val:.2f}".replace(".", ","))
    sales_text = "\n".join(lines) + "\n"

    targets = []
    for sid in store_ids:
        for q in ["2024Q1", "2024Q2", "2024Q3", "2024Q4"]:
            if sid == 304 and q in ("2024Q1", "2024Q2"):
                continue
            targets.append({"store_id": sid, "quarter": q, "target": int(rng.integers(90, 190)) * 1000})
    rng.shuffle(targets)
    targets_text = "\n".join(json.dumps(t) for t in targets) + "\n"
    return {"stores.json": json.dumps(doc, indent=2) + "\n", "sales_eu.csv": sales_text, "targets.jsonl": targets_text}


def _rd(inputs, name):
    return list(csv.DictReader(io.StringIO(inputs[name])))


# ================================================================ D1 top 3 per category
TOP_COLS = ["category", "rank", "product_id", "product_name", "revenue"]
TOP_DESC = html(f"""
<p>The shop wants its best sellers. Find the three products with the highest revenue in each category.</p>
<h3>Files</h3>
{file_list(
    ("orders.csv", ["order_id", "customer_id", "order_date", "status"], "The status is <code>completed</code>, <code>cancelled</code>, or <code>returned</code>."),
    ("order_items.csv", ["order_id", "product_id", "quantity", "unit_price"]),
    ("products.csv", ["product_id", "product_name", "category"]))}
<h3>Your task</h3>
<p>Revenue is <code>quantity</code> times <code>unit_price</code>, summed over the items of completed orders. Rank the products in each category by revenue, highest first. Break ties by <code>product_name</code>, A to Z.</p>
<p>Save <code>top_products.csv</code> with the top 3 products of every category, sorted by category and then rank:</p>
{schema([
    ("category", "str", "Product category"),
    ("rank", "int", "1, 2, or 3 within the category"),
    ("product_id", "int", "Product identifier"),
    ("product_name", "str", "Product name"),
    ("revenue", "float", "Revenue from completed orders, rounded to 2 decimals")])}
""")

TOP_SOLUTION = code("""
    import pandas as pd

    orders = pd.read_csv('orders.csv')
    items = pd.read_csv('order_items.csv')
    products = pd.read_csv('products.csv')

    done = orders.loc[orders['status'] == 'completed', ['order_id']]
    x = items.merge(done, on='order_id').merge(products, on='product_id')
    x['revenue'] = x['quantity'] * x['unit_price']

    rev = x.groupby(['category', 'product_id', 'product_name'], as_index=False)['revenue'].sum()
    rev['revenue'] = rev['revenue'].round(2)
    rev = rev.sort_values(['category', 'revenue', 'product_name'], ascending=[True, False, True])
    rev['rank'] = rev.groupby('category').cumcount() + 1

    top = rev[rev['rank'] <= 3]
    top[['category', 'rank', 'product_id', 'product_name', 'revenue']].to_csv('top_products.csv', index=False)
""")

TOP_GRADER = code("""
    import numpy as np
    import pandas as pd

    COLS = ['category', 'rank', 'product_id', 'product_name', 'revenue']
    REV = 'revenue is the completed-order total, rounded to 2 decimals'


    def grade(c):
        c.plan('top_products.csv is saved in the task folder',
               'top_products.csv has no index column',
               'Columns match the spec, in order',
               'Three rows per category, ranked 1 to 3',
               'rank and product_id are whole numbers',
               ('The right product at each rank', True),
               (REV, True),
               'Rows are sorted by category, then rank')
        raw = c.output('top_products.csv')
        if raw is None:
            return
        if not c.columns('Columns match the spec, in order', raw, COLS):
            return
        exp = c.expected('top_products.csv')
        got = c.rows('Three rows per category, ranked 1 to 3', raw, exp, ['category', 'rank'], what='category and rank pair',
                     fewer='Every category needs ranks 1, 2, and 3.',
                     more='Keep only ranks 1 to 3 in each category. Number the ranks with groupby().cumcount() + 1 after sorting.')
        if got is None:
            return
        c.integers('rank and product_id are whole numbers', got, ['rank', 'product_id'])
        pairs = [('top_products.csv', got, exp)]
        key = ['category', 'rank']
        c.values('The right product at each rank', pairs, ['product_id', 'product_name'], key=key,
                 hint='Rank by revenue, highest first, and break ties by product_name. Only completed orders count.')
        c.values(REV, pairs, ['revenue'], key=key, decimals={'revenue': 2},
                 hint='Revenue is quantity times unit_price, summed over the items of completed orders.')
        c.order('Rows are sorted by category, then rank', raw, exp, key, hint='Sort by category, then rank, before you save.')
""")


def _top_variant(status_filter=True, tie="product_name", rounded=True, keep="rev['rank'] <= 3"):
    return code(f"""
import pandas as pd
orders = pd.read_csv('orders.csv'); items = pd.read_csv('order_items.csv'); products = pd.read_csv('products.csv')
done = orders{".loc[orders['status'] == 'completed']" if status_filter else ""}[['order_id']]
x = items.merge(done, on='order_id').merge(products, on='product_id')
x['revenue'] = x['quantity'] * x['unit_price']
rev = x.groupby(['category', 'product_id', 'product_name'], as_index=False)['revenue'].sum()
{"rev['revenue'] = rev['revenue'].round(2)" if rounded else "rev['key'] = rev['revenue'].round(2)"}
rev = rev.sort_values(['category', '{"revenue" if rounded else "key"}', '{tie}'], ascending=[True, False, True])
rev['rank'] = rev.groupby('category').cumcount() + 1
top = rev[{keep}]
top[['category', 'rank', 'product_id', 'product_name', 'revenue']].to_csv('top_products.csv', index=False)
""")


TOP_REV = "revenue is the completed-order total, rounded to 2 decimals"
TOP_VARIANTS = [
    dict(name="all_statuses", hint="Cancelled and returned orders earn no revenue. Keep only orders whose status is completed.",
         code=_top_variant(status_filter=False), fails=["The right product at each rank", TOP_REV]),
    dict(name="tie_by_id", hint="Two products tie on revenue. The task breaks ties by product_name, A to Z, not by product_id.",
         code=_top_variant(tie="product_id"), fails=["The right product at each rank"]),
    dict(name="unrounded", hint="The numbers are right. Round revenue to 2 decimals.", code=_top_variant(rounded=False), fails=[TOP_REV]),
    dict(name="top4", hint="", code=_top_variant(keep="rev['rank'] <= 4"), fails=["Three rows per category, ranked 1 to 3"]),
]


def oracle_top(inputs):
    status = {r["order_id"]: r["status"] for r in _rd(inputs, "orders.csv")}
    prods = {r["product_id"]: r for r in _rd(inputs, "products.csv")}
    rev = defaultdict(Decimal)
    for it in _rd(inputs, "order_items.csv"):
        if status[it["order_id"]] == "completed":
            rev[it["product_id"]] += Decimal(it["unit_price"]) * int(it["quantity"])
    by_cat = defaultdict(list)
    for pid, v in rev.items():
        by_cat[prods[pid]["category"]].append((-v, prods[pid]["product_name"], int(pid)))
    rows = []
    for cat in sorted(by_cat):
        for rank, (neg, name, pid) in enumerate(sorted(by_cat[cat])[:3], 1):
            rows.append({"category": cat, "rank": rank, "product_id": pid, "product_name": name, "revenue": float(-neg)})
    return {"top_products.csv": pd.DataFrame(rows, columns=TOP_COLS)}


# ================================================================ D2 inactive customers
INACTIVE_DESC = html(f"""
<p>Marketing wants to win back customers who went quiet. List every customer with no completed order in 2024.</p>
<h3>Files</h3>
{file_list(
    ("customers.csv", ["customer_id", "name", "city", "signup_date"]),
    ("orders.csv", ["order_id", "customer_id", "order_date", "status"], "<code>order_date</code> has a date and a time. The status is <code>completed</code>, <code>cancelled</code>, or <code>returned</code>."))}
<h3>Your task</h3>
<p>A customer is inactive if they have no order with status <code>completed</code> dated from 1 January 2024 to 31 December 2024. Cancelled and returned orders don't make a customer active.</p>
<p>Save <code>inactive.csv</code> with one row per inactive customer, sorted by <code>customer_id</code>:</p>
{schema([
    ("customer_id", "int", "Customer identifier"),
    ("name", "str", "Customer name"),
    ("city", "str", "Customer city"),
    ("last_order_date", "str", "Date of the customer's most recent completed order, as YYYY-MM-DD. Empty if the customer has never completed an order")])}
""")

INACTIVE_SOLUTION = code("""
    import pandas as pd

    customers = pd.read_csv('customers.csv')
    orders = pd.read_csv('orders.csv', parse_dates=['order_date'])

    done = orders[orders['status'] == 'completed']
    d = done['order_date']
    active = done.loc[(d >= '2024-01-01') & (d < '2025-01-01'), 'customer_id'].unique()

    # Start from customers, so people who never ordered are kept
    out = customers[~customers['customer_id'].isin(active)].copy()
    last = done.groupby('customer_id')['order_date'].max().dt.strftime('%Y-%m-%d')
    out['last_order_date'] = out['customer_id'].map(last)

    out = out.sort_values('customer_id')
    out[['customer_id', 'name', 'city', 'last_order_date']].to_csv('inactive.csv', index=False)
""")

INACTIVE_GRADER = code("""
    import numpy as np
    import pandas as pd

    COLS = ['customer_id', 'name', 'city', 'last_order_date']


    def grade(c):
        c.plan('inactive.csv is saved in the task folder',
               'inactive.csv has no index column',
               'Columns match the spec, in order',
               ('The list holds exactly the inactive customers', True),
               ('name and city come from customers.csv', True),
               ('last_order_date is the latest completed order', True),
               'Rows are sorted by customer_id')
        raw = c.output('inactive.csv')
        if raw is None:
            return
        if not c.columns('Columns match the spec, in order', raw, COLS):
            return
        exp = c.expected('inactive.csv')
        name = 'The list holds exactly the inactive customers'
        ids = pd.to_numeric(raw['customer_id'], errors='coerce')
        want = set(exp['customer_id'])
        have = set(ids.dropna().astype(int))
        missing, extra = sorted(want - have), sorted(have - want)
        if raw.duplicated('customer_id').any():
            c.check(name, False, 'Some customers appear more than once.', 'Keep one row per customer.')
            return
        if missing or extra:
            bits = []
            if missing:
                bits.append(f'{len(missing)} inactive customers are missing (for example customer_id {missing[0]})')
            if extra:
                bits.append(f'{len(extra)} listed customers are active (for example customer_id {extra[0]})')
            hints = []
            if missing:
                hints.append('Two groups are easy to miss: customers with no orders at all, and customers whose only 2024 orders were cancelled or returned. Start from customers.csv.')
            if extra:
                hints.append('A completed order on any day of 2024 makes a customer active, including 1 January at 00:00 and 31 December late at night.')
            c.check(name, False, '; '.join(bits) + '.', ' '.join(hints))
            return
        c.check(name, True)
        got = raw.assign(customer_id=ids.astype(int)).set_index('customer_id').loc[exp['customer_id']].reset_index()
        pairs = [('inactive.csv', got, exp)]
        c.values('name and city come from customers.csv', pairs, ['name', 'city'], key='customer_id')
        c.values('last_order_date is the latest completed order', pairs, ['last_order_date'], key='customer_id',
                 hint='Take the max order_date over the customer\\'s completed orders and format it as YYYY-MM-DD. Leave it empty when there is none.')
        c.order('Rows are sorted by customer_id', raw, exp, 'customer_id', hint='Sort by customer_id before you save.')
""")

LIST = "The list holds exactly the inactive customers"
INACTIVE_VARIANTS = [
    dict(name="any_status", hint="", fails=[LIST], code=code("""
        import pandas as pd
        customers = pd.read_csv('customers.csv'); orders = pd.read_csv('orders.csv', parse_dates=['order_date'])
        d = orders['order_date']
        active = orders.loc[(d >= '2024-01-01') & (d < '2025-01-01'), 'customer_id'].unique()
        out = customers[~customers['customer_id'].isin(active)].copy()
        done = orders[orders['status'] == 'completed']
        out['last_order_date'] = out['customer_id'].map(done.groupby('customer_id')['order_date'].max().dt.strftime('%Y-%m-%d'))
        out.sort_values('customer_id')[['customer_id', 'name', 'city', 'last_order_date']].to_csv('inactive.csv', index=False)
    """)),
    dict(name="from_orders", hint="", fails=[LIST], code=code("""
        import pandas as pd
        customers = pd.read_csv('customers.csv'); orders = pd.read_csv('orders.csv', parse_dates=['order_date'])
        done = orders[orders['status'] == 'completed']
        last = done.groupby('customer_id', as_index=False)['order_date'].max()
        out = last[last['order_date'] < '2024-01-01'].merge(customers, on='customer_id')
        out['last_order_date'] = out['order_date'].dt.strftime('%Y-%m-%d')
        out.sort_values('customer_id')[['customer_id', 'name', 'city', 'last_order_date']].to_csv('inactive.csv', index=False)
    """)),
    dict(name="late_start", hint="", fails=[LIST], code=code("""
        import pandas as pd
        customers = pd.read_csv('customers.csv'); orders = pd.read_csv('orders.csv', parse_dates=['order_date'])
        done = orders[orders['status'] == 'completed']
        active = done.loc[done['order_date'] > '2024-01-01', 'customer_id'].unique()
        out = customers[~customers['customer_id'].isin(active)].copy()
        out['last_order_date'] = out['customer_id'].map(done.groupby('customer_id')['order_date'].max().dt.strftime('%Y-%m-%d'))
        out.sort_values('customer_id')[['customer_id', 'name', 'city', 'last_order_date']].to_csv('inactive.csv', index=False)
    """)),
    dict(name="last_any_status",
         hint="last_order_date counts completed orders only. A cancelled or returned order doesn't move it.",
         fails=["last_order_date is the latest completed order"], code=code("""
        import pandas as pd
        customers = pd.read_csv('customers.csv'); orders = pd.read_csv('orders.csv', parse_dates=['order_date'])
        done = orders[orders['status'] == 'completed']
        d = done['order_date']
        active = done.loc[(d >= '2024-01-01') & (d < '2025-01-01'), 'customer_id'].unique()
        out = customers[~customers['customer_id'].isin(active)].copy()
        out['last_order_date'] = out['customer_id'].map(orders.groupby('customer_id')['order_date'].max().dt.strftime('%Y-%m-%d'))
        out.sort_values('customer_id')[['customer_id', 'name', 'city', 'last_order_date']].to_csv('inactive.csv', index=False)
    """)),
]


def oracle_inactive(inputs):
    active, last = set(), {}
    for r in _rd(inputs, "orders.csv"):
        if r["status"] != "completed":
            continue
        ts = datetime.strptime(r["order_date"], "%Y-%m-%d %H:%M:%S")
        if ts.year == 2024:
            active.add(r["customer_id"])
        if r["customer_id"] not in last or ts > last[r["customer_id"]]:
            last[r["customer_id"]] = ts
    rows = []
    for r in sorted(_rd(inputs, "customers.csv"), key=lambda r: int(r["customer_id"])):
        if r["customer_id"] in active:
            continue
        ts = last.get(r["customer_id"])
        rows.append({"customer_id": int(r["customer_id"]), "name": r["name"], "city": r["city"],
                     "last_order_date": ts.strftime("%Y-%m-%d") if ts else None})
    return {"inactive.csv": pd.DataFrame(rows, columns=["customer_id", "name", "city", "last_order_date"])}


# ================================================================ D3 monthly revenue grid
MONTHLY_DESC = html(f"""
<p>Finance wants a month by category revenue table for 2024, with no gaps.</p>
<h3>Files</h3>
{file_list(
    ("orders.csv", ["order_id", "customer_id", "order_date", "status"], "<code>order_date</code> has a date and a time."),
    ("order_items.csv", ["order_id", "product_id", "quantity", "unit_price"]),
    ("products.csv", ["product_id", "product_name", "category"]))}
<h3>Your task</h3>
<p>Use completed orders dated in 2024. Save <code>monthly_revenue.csv</code> with one row for every month of 2024 and every category in <code>products.csv</code>, sorted by month and then category. A month with no sales in a category still gets a row, with zeros.</p>
{schema([
    ("month", "str", "Month of the order date, as YYYY-MM"),
    ("category", "str", "Product category"),
    ("revenue", "float", "Sum of <code>quantity</code> times <code>unit_price</code>, rounded to 2 decimals"),
    ("orders", "int", "Number of distinct orders with at least one item in the category")])}
""")

MONTHLY_SOLUTION = code("""
    import pandas as pd

    orders = pd.read_csv('orders.csv', parse_dates=['order_date'])
    items = pd.read_csv('order_items.csv')
    products = pd.read_csv('products.csv')

    d = orders['order_date']
    done = orders[(orders['status'] == 'completed') & (d >= '2024-01-01') & (d < '2025-01-01')].copy()
    done['month'] = done['order_date'].dt.strftime('%Y-%m')

    x = (items.merge(done[['order_id', 'month']], on='order_id')
              .merge(products[['product_id', 'category']], on='product_id'))
    x['revenue'] = x['quantity'] * x['unit_price']
    g = x.groupby(['month', 'category']).agg(revenue=('revenue', 'sum'), orders=('order_id', 'nunique'))

    # Every month by every category, zeros where there were no sales
    months = pd.period_range('2024-01', '2024-12', freq='M').strftime('%Y-%m')
    grid = pd.MultiIndex.from_product([months, sorted(products['category'].unique())], names=['month', 'category'])
    out = g.reindex(grid, fill_value=0).reset_index()
    out['revenue'] = out['revenue'].round(2)
    out['orders'] = out['orders'].astype(int)
    out.to_csv('monthly_revenue.csv', index=False)
""")

MONTHLY_GRADER = code("""
    import numpy as np
    import pandas as pd

    COLS = ['month', 'category', 'revenue', 'orders']
    GRID = 'One row for every month and category of 2024'
    REV = 'revenue is the monthly total, rounded to 2 decimals'


    def grade(c):
        c.plan('monthly_revenue.csv is saved in the task folder',
               'monthly_revenue.csv has no index column',
               'Columns match the spec, in order',
               GRID,
               'orders is a whole number',
               (REV, True),
               ('orders counts distinct completed orders', True),
               'Rows are sorted by month, then category')
        raw = c.output('monthly_revenue.csv')
        if raw is None:
            return
        if not c.columns('Columns match the spec, in order', raw, COLS):
            return
        exp = c.expected('monthly_revenue.csv')
        got = c.rows(GRID, raw, exp, ['month', 'category'], what='month and category pair',
                     fewer='Months with no sales in a category are missing. Reindex against the full grid of 12 months by every category in products.csv, and fill with 0.',
                     more='Keep orders dated in 2024 only, and write month as YYYY-MM.')
        if got is None:
            return
        c.integers('orders is a whole number', got, ['orders'])
        pairs = [('monthly_revenue.csv', got, exp)]
        key = ['month', 'category']
        c.values(REV, pairs, ['revenue'], key=key, decimals={'revenue': 2},
                 hint='Use completed orders dated in 2024. The month comes from order_date.')
        c.values('orders counts distinct completed orders', pairs, ['orders'], key=key,
                 hint='Count each order once per month and category.')
        c.order('Rows are sorted by month, then category', raw, exp, key, hint='Sort by month, then category, before you save.')
""")


def _monthly_variant(status=True, count="nunique", grid=True, hi="'2025-01-01'"):
    return code(f"""
import pandas as pd
orders = pd.read_csv('orders.csv', parse_dates=['order_date']); items = pd.read_csv('order_items.csv'); products = pd.read_csv('products.csv')
d = orders['order_date']
done = orders[{"(orders['status'] == 'completed') & " if status else ""}(d >= '2024-01-01') & (d < {hi})].copy()
done['month'] = done['order_date'].dt.strftime('%Y-%m')
x = items.merge(done[['order_id', 'month']], on='order_id').merge(products[['product_id', 'category']], on='product_id')
x['revenue'] = x['quantity'] * x['unit_price']
g = x.groupby(['month', 'category']).agg(revenue=('revenue', 'sum'), orders=('order_id', '{count}'))
months = pd.period_range('2024-01', '2024-12', freq='M').strftime('%Y-%m')
grid = pd.MultiIndex.from_product([months, sorted(products['category'].unique())], names=['month', 'category'])
out = {"g.reindex(grid, fill_value=0).reset_index()" if grid else "g.reset_index()"}
out['revenue'] = out['revenue'].round(2); out['orders'] = out['orders'].astype(int)
out.to_csv('monthly_revenue.csv', index=False)
""")


M_REV = "revenue is the monthly total, rounded to 2 decimals"
MONTHLY_VARIANTS = [
    dict(name="count_rows", hint="An order with two items in one category counts once. Use nunique on order_id, not count.",
         code=_monthly_variant(count="count"), fails=["orders counts distinct completed orders"]),
    dict(name="all_statuses", hint="Cancelled and returned orders don't count. Keep only orders whose status is completed.",
         code=_monthly_variant(status=False), fails=[M_REV, "orders counts distinct completed orders"]),
    dict(name="no_grid", hint="", code=_monthly_variant(grid=False), fails=["One row for every month and category of 2024"]),
    dict(name="early_stop", hint="order_date has a time of day. Comparing with <= '2024-12-31' stops at midnight and drops the rest of 31 December.",
         code=_monthly_variant(hi="'2024-12-31'").replace("(d < '2024-12-31')", "(d <= '2024-12-31')"),
         fails=[M_REV, "orders counts distinct completed orders"]),
]


def oracle_monthly(inputs):
    cat = {r["product_id"]: r["category"] for r in _rd(inputs, "products.csv")}
    month = {}
    for r in _rd(inputs, "orders.csv"):
        if r["status"] == "completed" and r["order_date"].startswith("2024-"):
            month[r["order_id"]] = r["order_date"][:7]
    rev, seen = defaultdict(Decimal), defaultdict(set)
    for it in _rd(inputs, "order_items.csv"):
        if it["order_id"] in month:
            k = (month[it["order_id"]], cat[it["product_id"]])
            rev[k] += Decimal(it["unit_price"]) * int(it["quantity"])
            seen[k].add(it["order_id"])
    rows = []
    for m in [f"2024-{i:02d}" for i in range(1, 13)]:
        for c in sorted(set(cat.values())):
            rows.append({"month": m, "category": c, "revenue": float(rev.get((m, c), Decimal(0))), "orders": len(seen.get((m, c), ()))})
    return {"monthly_revenue.csv": pd.DataFrame(rows, columns=["month", "category", "revenue", "orders"])}


# ================================================================ D4 running totals
HISTORY_COLS = ["customer_id", "order_number", "order_id", "order_date", "order_total", "running_total", "days_since_prev"]
HISTORY_DESC = html(f"""
<p>The loyalty team wants each customer's order history with running totals.</p>
<h3>Files</h3>
{file_list(
    ("orders.csv", ["order_id", "customer_id", "order_date", "status"], "<code>order_date</code> has a date and a time."),
    ("order_items.csv", ["order_id", "product_id", "quantity", "unit_price"]))}
<h3>Your task</h3>
<p>Use completed orders only. Order each customer's orders by <code>order_date</code>, and break ties by <code>order_id</code>.</p>
<p>Save <code>order_history.csv</code> with one row per completed order, sorted by <code>customer_id</code> and then <code>order_number</code>:</p>
{schema([
    ("customer_id", "int", "Customer identifier"),
    ("order_number", "int", "1 for the customer's first completed order, 2 for the next, and so on"),
    ("order_id", "int", "Order identifier"),
    ("order_date", "str", "The timestamp exactly as it appears in <code>orders.csv</code>"),
    ("order_total", "float", "Sum of <code>quantity</code> times <code>unit_price</code> over the order's items, rounded to 2 decimals"),
    ("running_total", "float", "Sum of the customer's <code>order_total</code> values up to and including this order, rounded to 2 decimals"),
    ("days_since_prev", "int", "Whole calendar days since the customer's previous completed order, ignoring the time of day. Empty for a first order")])}
<p>Calendar days ignore the time of day: an order at 23:00 on 3 May and the next at 01:00 on 4 May are 1 day apart.</p>
""")

HISTORY_SOLUTION = code("""
    import pandas as pd

    orders = pd.read_csv('orders.csv')
    items = pd.read_csv('order_items.csv')

    items['amount'] = items['quantity'] * items['unit_price']
    totals = items.groupby('order_id')['amount'].sum().round(2).rename('order_total').reset_index()

    h = orders[orders['status'] == 'completed'].merge(totals, on='order_id', how='left')
    h['ts'] = pd.to_datetime(h['order_date'])
    h = h.sort_values(['customer_id', 'ts', 'order_id'])

    by = h.groupby('customer_id')
    h['order_number'] = by.cumcount() + 1
    h['running_total'] = by['order_total'].cumsum().round(2)
    day = h['ts'].dt.normalize()                     # drop the time of day
    h['days_since_prev'] = (day - day.groupby(h['customer_id']).shift(1)).dt.days

    cols = ['customer_id', 'order_number', 'order_id', 'order_date', 'order_total', 'running_total', 'days_since_prev']
    h[cols].to_csv('order_history.csv', index=False)
""")

HISTORY_GRADER = code("""
    import numpy as np
    import pandas as pd

    COLS = ['customer_id', 'order_number', 'order_id', 'order_date', 'order_total', 'running_total', 'days_since_prev']
    NUM = 'order_number follows order_date, then order_id'
    DAYS = 'days_since_prev counts calendar days'


    def grade(c):
        c.plan('order_history.csv is saved in the task folder',
               'order_history.csv has no index column',
               'Columns match the spec, in order',
               'One row per completed order',
               'customer_id, order_number, and order_id are whole numbers',
               ('customer_id and order_date match orders.csv', True),
               ('order_total is the sum of the order\\'s items, rounded to 2 decimals', True),
               (NUM, True),
               ('running_total accumulates within each customer', True),
               (DAYS, True),
               'Rows are sorted by customer_id, then order_number')
        raw = c.output('order_history.csv')
        if raw is None:
            return
        if not c.columns('Columns match the spec, in order', raw, COLS):
            return
        exp = c.expected('order_history.csv')
        got = c.rows('One row per completed order', raw, exp, 'order_id', what='order',
                     fewer='Every completed order belongs in the history.',
                     more='Cancelled and returned orders don\\'t belong in the history.')
        if got is None:
            return
        c.integers('customer_id, order_number, and order_id are whole numbers', got, ['customer_id', 'order_number', 'order_id'])
        pairs = [('order_history.csv', got, exp)]
        c.values('customer_id and order_date match orders.csv', pairs, ['customer_id', 'order_date'], key='order_id',
                 hint='Keep order_date as the original text, for example 2024-05-03 23:10:00.')
        c.values('order_total is the sum of the order\\'s items, rounded to 2 decimals', pairs, ['order_total'], key='order_id',
                 decimals={'order_total': 2})
        c.values(NUM, pairs, ['order_number'], key='order_id',
                 hint='Sort by customer_id, order_date, and order_id, then number the rows with groupby().cumcount() + 1.')
        c.values('running_total accumulates within each customer', pairs, ['running_total'], key='order_id',
                 decimals={'running_total': 2}, hint='After sorting, use groupby(customer_id)[order_total].cumsum().')
        c.values(DAYS, pairs, ['days_since_prev'], key='order_id',
                 hint='Subtract the previous order\\'s date within each customer, and leave first orders empty.')
        c.order('Rows are sorted by customer_id, then order_number', raw, exp, 'order_id',
                hint='Sort by customer_id, then order_number, before you save.')
""")


def _history_variant(status=True, start=1, day="h['ts'].dt.normalize()", sort="['customer_id', 'ts', 'order_id']"):
    return code(f"""
import pandas as pd
orders = pd.read_csv('orders.csv'); items = pd.read_csv('order_items.csv')
items['amount'] = items['quantity'] * items['unit_price']
totals = items.groupby('order_id')['amount'].sum().round(2).rename('order_total').reset_index()
h = orders{"[orders['status'] == 'completed']" if status else ""}.merge(totals, on='order_id', how='left')
h['ts'] = pd.to_datetime(h['order_date'])
h = h.sort_values({sort})
by = h.groupby('customer_id')
h['order_number'] = by.cumcount() + {start}
h['running_total'] = by['order_total'].cumsum().round(2)
day = {day}
h['days_since_prev'] = (day - day.groupby(h['customer_id']).shift(1)).dt.days
h = h.sort_values(['customer_id', 'order_number'])
h[['customer_id', 'order_number', 'order_id', 'order_date', 'order_total', 'running_total', 'days_since_prev']].to_csv('order_history.csv', index=False)
""")


H_NUM = "order_number follows order_date, then order_id"
H_DAYS = "days_since_prev counts calendar days"
HISTORY_VARIANTS = [
    dict(name="timestamp_days",
         hint="Subtracting timestamps floors partial days, so 23:10 to 00:20 the next day gives 0. Drop the time first with .dt.normalize(), then subtract.",
         code=_history_variant(day="h['ts']"), fails=[H_DAYS]),
    dict(name="zero_based", hint="order_number starts at 1. cumcount() starts at 0, so add 1.",
         code=_history_variant(start=0), fails=[H_NUM]),
    dict(name="all_statuses", hint="", code=_history_variant(status=False), fails=["One row per completed order"]),
    dict(name="tie_by_id_desc", hint="Two orders share a timestamp. Break the tie by order_id, smallest first.",
         code=_history_variant(sort="['customer_id', 'ts', 'order_id'], ascending=[True, True, False]"),
         fails=[H_NUM, "running_total accumulates within each customer"],
         also=["Rows are sorted by customer_id, then order_number", H_DAYS]),
]


def oracle_history(inputs):
    total = defaultdict(Decimal)
    for it in _rd(inputs, "order_items.csv"):
        total[it["order_id"]] += Decimal(it["unit_price"]) * int(it["quantity"])
    per = defaultdict(list)
    for r in _rd(inputs, "orders.csv"):
        if r["status"] == "completed":
            per[int(r["customer_id"])].append((datetime.strptime(r["order_date"], "%Y-%m-%d %H:%M:%S"), int(r["order_id"]), r["order_date"]))
    rows = []
    for cust in sorted(per):
        run, prev = Decimal(0), None
        for n, (ts, oid, text) in enumerate(sorted(per[cust]), 1):
            run += total[str(oid)]
            gap = None if prev is None else (ts.date() - prev.date()).days
            rows.append({"customer_id": cust, "order_number": n, "order_id": oid, "order_date": text,
                         "order_total": float(total[str(oid)]), "running_total": float(run), "days_since_prev": gap})
            prev = ts
    return {"order_history.csv": pd.DataFrame(rows, columns=HISTORY_COLS)}


# ================================================================ D5 mixed formats
ATT_COLS = ["store_id", "store_name", "region", "quarter", "net_sales", "target", "attainment"]
FORMATS_DESC = html(f"""
<p>A retailer keeps store data in three formats. Combine them into one table of quarterly target attainment.</p>
<h3>Files</h3>
<ul class="files">
  <li><code>stores.json</code>: a list of regions. Each region has a <code>region</code> name and a <code>stores</code> list. Each store has <code>id</code>, <code>name</code>, <code>opened</code>, and a nested <code>manager</code>.</li>
  <li><code>sales_eu.csv</code>: <code>store_id</code>, <code>date</code>, <code>net_sales</code>. A European export: fields are separated by semicolons, decimals use a comma, and dates are day first (DD/MM/YYYY).</li>
  <li><code>targets.jsonl</code>: one JSON object per line with <code>store_id</code>, <code>quarter</code> (for example <code>2024Q1</code>), and <code>target</code>.</li>
</ul>
<h3>Your task</h3>
<p>Save <code>attainment.csv</code> with one row for every store and quarter in <code>targets.jsonl</code>, sorted by <code>store_id</code> and then <code>quarter</code>. A store with a target and no sales in that quarter still gets a row.</p>
{schema([
    ("store_id", "int", "Store identifier"),
    ("store_name", "str", "Store name from <code>stores.json</code>"),
    ("region", "str", "Region the store belongs to"),
    ("quarter", "str", "Quarter, for example <code>2024Q1</code>"),
    ("net_sales", "float", "Sum of the store's sales dated in the quarter, rounded to 2 decimals. 0 if there are none"),
    ("target", "int", "Target for the store and quarter"),
    ("attainment", "float", "<code>net_sales</code> divided by <code>target</code>, rounded to 3 decimals")])}
""")

FORMATS_SOLUTION = code("""
    import json
    import pandas as pd

    # Nested JSON: one row per store, with the region carried down
    with open('stores.json') as f:
        regions = json.load(f)
    stores = pd.json_normalize(regions, record_path='stores', meta=['region'])
    stores = stores.rename(columns={'id': 'store_id', 'name': 'store_name'})[['store_id', 'store_name', 'region']]

    # European CSV: semicolons, decimal commas, day-first dates
    sales = pd.read_csv('sales_eu.csv', sep=';', decimal=',')
    sales['date'] = pd.to_datetime(sales['date'], format='%d/%m/%Y')
    sales['quarter'] = sales['date'].dt.to_period('Q').astype(str)
    q = sales.groupby(['store_id', 'quarter'], as_index=False)['net_sales'].sum()

    # JSON lines
    targets = pd.read_json('targets.jsonl', lines=True)

    out = (targets.merge(q, on=['store_id', 'quarter'], how='left')
                  .merge(stores, on='store_id', how='left'))
    out['net_sales'] = out['net_sales'].fillna(0).round(2)
    out['attainment'] = (out['net_sales'] / out['target']).round(3)
    out = out.sort_values(['store_id', 'quarter'])
    cols = ['store_id', 'store_name', 'region', 'quarter', 'net_sales', 'target', 'attainment']
    out[cols].to_csv('attainment.csv', index=False)
""")

FORMATS_GRADER = code("""
    import numpy as np
    import pandas as pd

    COLS = ['store_id', 'store_name', 'region', 'quarter', 'net_sales', 'target', 'attainment']
    SALES = 'net_sales is the quarter total, rounded to 2 decimals'
    ATT = 'attainment is net_sales divided by target, rounded to 3 decimals'


    def grade(c):
        c.plan('attainment.csv is saved in the task folder',
               'attainment.csv has no index column',
               'Columns match the spec, in order',
               'One row per store and quarter in targets.jsonl',
               'store_id and target are whole numbers',
               ('store_name and region come from stores.json', True),
               (SALES, True),
               (ATT, True),
               'Rows are sorted by store_id, then quarter')
        raw = c.output('attainment.csv')
        if raw is None:
            return
        if not c.columns('Columns match the spec, in order', raw, COLS):
            return
        exp = c.expected('attainment.csv')
        key = ['store_id', 'quarter']
        got = c.rows('One row per store and quarter in targets.jsonl', raw, exp, key, what='store and quarter pair',
                     fewer='Start from the targets and left-join the sales. A store with a target and no sales still needs a row.',
                     more='Keep only the store and quarter pairs that have a target.')
        if got is None:
            return
        c.integers('store_id and target are whole numbers', got, ['store_id', 'target'])
        pairs = [('attainment.csv', got, exp)]
        c.values('store_name and region come from stores.json', pairs, ['store_name', 'region', 'target'], key=key,
                 hint="pd.json_normalize(regions, record_path='stores', meta=['region']) gives one row per store.")
        c.values(SALES, pairs, ['net_sales'], key=key, decimals={'net_sales': 2},
                 hint="Read the file with sep=';' and decimal=',', parse the dates day first, and sum per store and quarter.")
        c.values(ATT, pairs, ['attainment'], key=key, decimals={'attainment': 3})
        c.order('Rows are sorted by store_id, then quarter', raw, exp, key, hint='Sort by store_id, then quarter, before you save.')
""")


def _formats_variant(date="pd.to_datetime(sales['date'], format='%d/%m/%Y')", how="left", att="(out['net_sales'] / out['target']).round(3)"):
    return code(f"""
import json
import pandas as pd
with open('stores.json') as f:
    regions = json.load(f)
stores = pd.json_normalize(regions, record_path='stores', meta=['region']).rename(columns={{'id': 'store_id', 'name': 'store_name'}})[['store_id', 'store_name', 'region']]
sales = pd.read_csv('sales_eu.csv', sep=';', decimal=',')
sales['date'] = {date}
sales = sales.dropna(subset=['date'])
sales['quarter'] = sales['date'].dt.to_period('Q').astype(str)
q = sales.groupby(['store_id', 'quarter'], as_index=False)['net_sales'].sum()
targets = pd.read_json('targets.jsonl', lines=True)
out = targets.merge(q, on=['store_id', 'quarter'], how='{how}').merge(stores, on='store_id', how='left')
out['net_sales'] = out['net_sales'].fillna(0).round(2)
out['attainment'] = {att}
out = out.sort_values(['store_id', 'quarter'])
out[['store_id', 'store_name', 'region', 'quarter', 'net_sales', 'target', 'attainment']].to_csv('attainment.csv', index=False)
""")


F_SALES = "net_sales is the quarter total, rounded to 2 decimals"
F_ATT = "attainment is net_sales divided by target, rounded to 3 decimals"
FORMATS_VARIANTS = [
    dict(name="month_first",
         hint="The dates are day first: 03/04/2024 is 3 April. Parse them with format='%d/%m/%Y'. Month-first parsing moves or drops rows.",
         code=_formats_variant(date="pd.to_datetime(sales['date'], format='%m/%d/%Y', errors='coerce')"), fails=[F_SALES, F_ATT]),
    dict(name="inner_join", hint="", code=_formats_variant(how="inner"), fails=["One row per store and quarter in targets.jsonl"]),
    dict(name="attainment_unrounded", hint="The numbers are right. Round attainment to 3 decimals.",
         code=_formats_variant(att="out['net_sales'] / out['target']"), fails=[F_ATT]),
]


def oracle_formats(inputs):
    info = {}
    for region in json.loads(inputs["stores.json"]):
        for s in region["stores"]:
            info[s["id"]] = (s["name"], region["region"])
    tot = defaultdict(Decimal)
    for line in inputs["sales_eu.csv"].strip().split("\n")[1:]:
        sid, day, val = line.split(";")
        dt = datetime.strptime(day, "%d/%m/%Y")
        tot[(int(sid), f"{dt.year}Q{(dt.month - 1) // 3 + 1}")] += Decimal(val.replace(",", "."))
    rows = []
    for line in inputs["targets.jsonl"].strip().split("\n"):
        t = json.loads(line)
        sales = float(tot.get((t["store_id"], t["quarter"]), Decimal(0)))
        rows.append({"store_id": t["store_id"], "store_name": info[t["store_id"]][0], "region": info[t["store_id"]][1],
                     "quarter": t["quarter"], "net_sales": sales, "target": t["target"], "attainment": round(sales / t["target"], 3)})
    rows.sort(key=lambda r: (r["store_id"], r["quarter"]))
    return {"attainment.csv": pd.DataFrame(rows, columns=ATT_COLS)}


def exercises():
    shop = make_shop()
    pick = lambda *names: {n: shop[n] for n in names}
    return [
        dict(id="shop-top3", module=3, title="Top 3 products per category", story="Shop", minutes=10,
             inputs=pick("orders.csv", "order_items.csv", "products.csv"), outputs=["top_products.csv"], hidden={},
             expect=["top_products.csv"], align=["category", "rank"],
             desc=TOP_DESC, starter="import pandas as pd\n\n", solution=TOP_SOLUTION, grader=TOP_GRADER,
             hints=["Join the items to the completed orders and to the products, then sum quantity times unit_price per product.",
                    "Sort by category, revenue descending, and product_name. Then groupby('category').cumcount() + 1 numbers the ranks.",
                    "Round revenue to 2 decimals before you sort, so that equal totals compare as equal."],
             variants=TOP_VARIANTS, oracle=oracle_top),
        dict(id="shop-inactive", module=3, title="Customers with no order in 2024", story="Shop", minutes=10,
             inputs=pick("customers.csv", "orders.csv"), outputs=["inactive.csv"], hidden={},
             expect=["inactive.csv"], align="customer_id",
             desc=INACTIVE_DESC, starter="import pandas as pd\n\n", solution=INACTIVE_SOLUTION, grader=INACTIVE_GRADER,
             hints=["Find the customer_id values with a completed order in 2024. Everyone else in customers.csv is inactive.",
                    "Filter customers with ~customers['customer_id'].isin(active). Starting from customers keeps people who never ordered.",
                    "For last_order_date, group the completed orders by customer_id, take the max order_date, and map it onto the result."],
             variants=INACTIVE_VARIANTS, oracle=oracle_inactive),
        dict(id="shop-monthly", module=3, title="Monthly revenue with no gaps", story="Shop", minutes=12,
             inputs=pick("orders.csv", "order_items.csv", "products.csv"), outputs=["monthly_revenue.csv"], hidden={},
             expect=["monthly_revenue.csv"], align=["month", "category"],
             desc=MONTHLY_DESC, starter="import pandas as pd\n\n", solution=MONTHLY_SOLUTION, grader=MONTHLY_GRADER,
             hints=["Filter to completed orders in 2024, add a month column with .dt.strftime('%Y-%m'), then join items and products.",
                    "Aggregate with groupby(['month', 'category']).agg(revenue=('revenue', 'sum'), orders=('order_id', 'nunique')).",
                    "Build the full grid with pd.MultiIndex.from_product([months, categories]) and reindex(grid, fill_value=0)."],
             variants=MONTHLY_VARIANTS, oracle=oracle_monthly),
        dict(id="shop-running", module=3, title="Order history with running totals", story="Shop", minutes=12,
             inputs=pick("orders.csv", "order_items.csv"), outputs=["order_history.csv"], hidden={},
             expect=["order_history.csv"], align="order_id",
             desc=HISTORY_DESC, starter="import pandas as pd\n\n", solution=HISTORY_SOLUTION, grader=HISTORY_GRADER,
             hints=["Sum the items to one order_total per order, join it to the completed orders, then sort by customer_id, order_date, and order_id.",
                    "After sorting, groupby('customer_id') gives cumcount() + 1 for order_number and cumsum() for running_total.",
                    "For calendar days, drop the time with .dt.normalize(), then subtract the previous value with groupby().shift(1)."],
             variants=HISTORY_VARIANTS, oracle=oracle_history),
        dict(id="shop-formats", module=3, title="Three file formats, one table", story="Stores", minutes=15,
             inputs=make_formats(), outputs=["attainment.csv"], hidden={},
             expect=["attainment.csv"], align=["store_id", "quarter"],
             desc=FORMATS_DESC, starter="import json\nimport pandas as pd\n\n", solution=FORMATS_SOLUTION, grader=FORMATS_GRADER,
             hints=["Open each file in the Files panel first. The separators and date format decide how you read them.",
                    "pd.read_csv('sales_eu.csv', sep=';', decimal=',') handles the European numbers. pd.read_json('targets.jsonl', lines=True) reads JSON lines.",
                    "Get the quarter with .dt.to_period('Q').astype(str) after parsing the dates with format='%d/%m/%Y'. Left-join sales onto the targets."],
             variants=FORMATS_VARIANTS, oracle=oracle_formats),
    ]
