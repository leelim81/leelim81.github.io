"""Mock 1 story: a telecom operator and customer churn. Three linked tasks (collect, process, model)."""
import csv
import io
import json
from collections import defaultdict
from datetime import date, datetime

import numpy as np
import pandas as pd

from common import code, csv_text, file_list, html, schema

PLANS = [(1, "Basic", 19.0, 5), (2, "Plus", 35.0, 20), (3, "Max", 59.0, 60), (4, "Family", 79.0, 100)]
FEE = {name: fee for _, name, fee, _ in PLANS}
REGIONS = ["East", "North", "South", "West"]
F1_BAR = 0.60
COLLECT_COLS = ["customer_id", "region", "plan_name", "monthly_fee", "tenure_days", "avg_data_gb",
                "tickets_90d", "unresolved_tickets", "churned"]


def _logit(plan, fee, tenure, data, t90, unres, b0=-2.0, s=1.7):
    plan_eff = pd.Series(plan).map({"Basic": 0.45, "Plus": 0.0, "Max": -0.1, "Family": -0.6, "Student": 0.2}).to_numpy()
    return b0 + s * (0.62 * (t90 - 0.9) + 0.95 * (unres - 0.33) - 0.0011 * (tenure - 1000) + 0.016 * (fee - 40)
                     - 0.035 * (data - 15) + plan_eff + 0.9 * ((t90 >= 2) & (tenure < 400)))


def _table(seed, n, start_id):
    """A customer-level table in the collected format, with a churn label."""
    rng = np.random.default_rng(seed)
    region = rng.choice(REGIONS, n, p=[.3, .25, .25, .2])
    plan = rng.choice(["Basic", "Plus", "Max", "Family"], n, p=[.35, .3, .2, .15])
    fee = np.round(pd.Series(plan).map(FEE).to_numpy() * rng.uniform(0.85, 1.1, n), 2)
    tenure = rng.integers(30, 2001, n)
    data = np.round(rng.gamma(2.4, 6.5, n), 2)
    t90 = rng.poisson(0.9, n)
    unres = rng.binomial(t90, 0.3) + rng.binomial(1, 0.06, n)
    y = (rng.random(n) < 1 / (1 + np.exp(-_logit(plan, fee, tenure, data, t90, unres)))).astype(int)
    return pd.DataFrame({"customer_id": np.arange(start_id, start_id + n), "region": region, "plan_name": plan,
                         "monthly_fee": fee, "tenure_days": tenure, "avg_data_gb": data, "tickets_90d": t90,
                         "unresolved_tickets": unres, "churned": y})


def make_collect():
    rng = np.random.default_rng(71001)
    n = 900
    ids = np.arange(1001, 1001 + n)
    signup = pd.Timestamp("2019-01-01") + pd.to_timedelta(rng.integers(0, 1993, n), unit="D")       # up to 2024-06-15
    plan_id = rng.choice([1, 2, 3, 4], n, p=[.35, .3, .2, .15])
    customers = pd.DataFrame({"customer_id": ids, "signup_date": signup.strftime("%Y-%m-%d"),
                              "region": rng.choice(REGIONS, n, p=[.3, .25, .25, .2]), "plan_id": plan_id})
    plans = pd.DataFrame(PLANS, columns=["plan_id", "plan_name", "monthly_fee", "data_gb"])

    quiet = set(rng.choice(ids, 25, replace=False).tolist())            # no usage rows from April to June
    rows = []
    for cid, start in zip(ids, signup):
        level = float(rng.gamma(2.4, 6.5))
        for m in ["2024-01", "2024-02", "2024-03", "2024-04", "2024-05", "2024-06"]:
            if pd.Period(m) < start.to_period("M"):
                continue
            if cid in quiet and m >= "2024-04":
                continue
            if rng.random() < 0.07:
                continue
            rows.append((int(cid), m, round(max(0.1, level * float(rng.uniform(0.6, 1.4))), 2), int(rng.integers(20, 900))))
    usage = pd.DataFrame(rows, columns=["customer_id", "month", "data_used_gb", "call_minutes"]).sample(frac=1, random_state=4).reset_index(drop=True)

    tickets = []
    span = int((pd.Timestamp("2024-07-01") - pd.Timestamp("2023-11-01")).total_seconds())
    owners = rng.choice(ids, 1700, replace=True)
    for i, cid in enumerate(owners):
        ts = pd.Timestamp("2023-11-01") + pd.Timedelta(seconds=int(rng.integers(0, span)))
        tickets.append({"ticket_id": 50001 + i, "customer_id": int(cid), "opened_at": ts.strftime("%Y-%m-%dT%H:%M:%S"),
                        "category": str(rng.choice(["billing", "network", "device", "account"])), "resolved": bool(rng.random() < 0.72)})
    edge = [(1001, "2024-04-01T23:59:59", True), (1001, "2024-04-02T00:00:00", True), (1001, "2024-06-30T23:59:59", False),
            (1002, "2024-04-02T00:00:00", False), (1003, "2024-04-01T23:59:59", False), (9999, "2024-05-05T10:00:00", False)]
    for j, (cid, when, res) in enumerate(edge):
        tickets.append({"ticket_id": 59001 + j, "customer_id": cid, "opened_at": when, "category": "billing", "resolved": res})
    order = rng.permutation(len(tickets))
    tickets_text = "\n".join(json.dumps(tickets[i]) for i in order) + "\n"

    # a churn label that is consistent with the collected features
    inputs = {"customers.csv": csv_text(customers), "plans.csv": csv_text(plans), "usage.csv": csv_text(usage), "tickets.jsonl": tickets_text}
    feat = oracle_collect({**inputs, "churn.csv": csv_text(pd.DataFrame({"customer_id": ids, "churned": 0}))})["collected.csv"]
    z = _logit(feat["plan_name"].to_numpy(), feat["monthly_fee"].to_numpy(), feat["tenure_days"].to_numpy(),
               feat["avg_data_gb"].to_numpy(), feat["tickets_90d"].to_numpy(), feat["unresolved_tickets"].to_numpy())
    churn = pd.DataFrame({"customer_id": ids, "churned": (rng.random(n) < 1 / (1 + np.exp(-z))).astype(int)}).sample(frac=1, random_state=8)
    inputs["churn.csv"] = csv_text(churn)
    return inputs


def oracle_collect(inputs):
    """Plain-Python version of the collection task."""
    rd = lambda name: list(csv.DictReader(io.StringIO(inputs[name])))
    plans = {r["plan_id"]: (r["plan_name"], float(r["monthly_fee"])) for r in rd("plans.csv")}
    churn = {r["customer_id"]: int(r["churned"]) for r in rd("churn.csv")}
    used = defaultdict(list)
    for r in rd("usage.csv"):
        if r["month"] in ("2024-04", "2024-05", "2024-06"):
            used[r["customer_id"]].append(float(r["data_used_gb"]))
    t90, unres = defaultdict(int), defaultdict(int)
    lo, hi = date(2024, 4, 2), date(2024, 6, 30)
    for line in inputs["tickets.jsonl"].strip().split("\n"):
        t = json.loads(line)
        day = datetime.strptime(t["opened_at"], "%Y-%m-%dT%H:%M:%S").date()
        if lo <= day <= hi:
            t90[str(t["customer_id"])] += 1
        if not t["resolved"]:
            unres[str(t["customer_id"])] += 1
    rows = []
    for r in sorted(rd("customers.csv"), key=lambda r: int(r["customer_id"])):
        cid = r["customer_id"]
        vals = used.get(cid, [])
        rows.append({"customer_id": int(cid), "region": r["region"], "plan_name": plans[r["plan_id"]][0],
                     "monthly_fee": plans[r["plan_id"]][1],
                     "tenure_days": (date(2024, 6, 30) - datetime.strptime(r["signup_date"], "%Y-%m-%d").date()).days,
                     "avg_data_gb": round(sum(vals) / len(vals), 2) if vals else 0.0,
                     "tickets_90d": t90.get(cid, 0), "unresolved_tickets": unres.get(cid, 0), "churned": churn[cid]})
    return {"collected.csv": pd.DataFrame(rows, columns=COLLECT_COLS)}


COLLECT_DESC = html(f"""
<p>A mobile operator wants to predict which customers leave. You have its raw files, with data up to 30 June 2024. Build one table with a row for each customer.</p>
<h3>Files</h3>
<ul class="files">
  <li><code>customers.csv</code>: <code>customer_id</code>, <code>signup_date</code>, <code>region</code>, <code>plan_id</code>.</li>
  <li><code>plans.csv</code>: <code>plan_id</code>, <code>plan_name</code>, <code>monthly_fee</code>, <code>data_gb</code>.</li>
  <li><code>usage.csv</code>: <code>customer_id</code>, <code>month</code>, <code>data_used_gb</code>, <code>call_minutes</code>. One row per customer and month, with <code>month</code> as YYYY-MM. Some months are missing.</li>
  <li><code>tickets.jsonl</code>: support tickets, one JSON object per line, with <code>ticket_id</code>, <code>customer_id</code>, <code>opened_at</code> (a timestamp), <code>category</code>, and <code>resolved</code> (true or false).</li>
  <li><code>churn.csv</code>: <code>customer_id</code>, <code>churned</code>.</li>
</ul>
<h3>Your task</h3>
<p>Save <code>collected.csv</code> in the task folder. It has one row per customer in <code>customers.csv</code>, sorted by <code>customer_id</code>, with these columns in this order:</p>
{schema([
    ("customer_id", "int", "Customer identifier"),
    ("region", "str", "Customer region"),
    ("plan_name", "str", "Name of the customer's plan"),
    ("monthly_fee", "float", "Monthly fee of that plan"),
    ("tenure_days", "int", "Days from <code>signup_date</code> to 30 June 2024"),
    ("avg_data_gb", "float", "Mean <code>data_used_gb</code> over the customer's rows for April, May, and June 2024, rounded to 2 decimals. 0 if there are none"),
    ("tickets_90d", "int", "Tickets opened in the last 90 days of the data: 2 April 2024 to 30 June 2024, both days included"),
    ("unresolved_tickets", "int", "Tickets from any date that are not resolved"),
    ("churned", "int", "1 if the customer churned, otherwise 0")])}
<p>You can use pandas, NumPy, and scikit-learn.</p>
""")

COLLECT_SOLUTION = code("""
    import pandas as pd

    customers = pd.read_csv('customers.csv', parse_dates=['signup_date'])
    plans = pd.read_csv('plans.csv')
    usage = pd.read_csv('usage.csv')
    churn = pd.read_csv('churn.csv')
    tickets = pd.read_json('tickets.jsonl', lines=True)
    tickets['opened_at'] = pd.to_datetime(tickets['opened_at'])

    # One row per customer for each aggregate
    recent = usage[usage['month'].isin(['2024-04', '2024-05', '2024-06'])]
    avg = recent.groupby('customer_id')['data_used_gb'].mean().round(2).rename('avg_data_gb').reset_index()

    t = tickets['opened_at']
    t90 = (tickets[(t >= '2024-04-02') & (t < '2024-07-01')]
           .groupby('customer_id').size().rename('tickets_90d').reset_index())
    unres = (tickets[~tickets['resolved']]
             .groupby('customer_id').size().rename('unresolved_tickets').reset_index())

    # Left-join everything onto customers
    out = (customers
           .merge(plans[['plan_id', 'plan_name', 'monthly_fee']], on='plan_id', how='left')
           .merge(avg, on='customer_id', how='left')
           .merge(t90, on='customer_id', how='left')
           .merge(unres, on='customer_id', how='left')
           .merge(churn, on='customer_id', how='left'))
    assert len(out) == len(customers)

    out['tenure_days'] = (pd.Timestamp('2024-06-30') - out['signup_date']).dt.days
    out['avg_data_gb'] = out['avg_data_gb'].fillna(0)
    for col in ['tickets_90d', 'unresolved_tickets']:
        out[col] = out[col].fillna(0).astype(int)

    cols = ['customer_id', 'region', 'plan_name', 'monthly_fee', 'tenure_days', 'avg_data_gb',
            'tickets_90d', 'unresolved_tickets', 'churned']
    out.sort_values('customer_id')[cols].to_csv('collected.csv', index=False)
""")

COLLECT_GRADER = code("""
    import numpy as np
    import pandas as pd

    COLS = ['customer_id', 'region', 'plan_name', 'monthly_fee', 'tenure_days', 'avg_data_gb',
            'tickets_90d', 'unresolved_tickets', 'churned']
    T90 = 'tickets_90d counts 2 April to 30 June 2024, both days included'
    AVG = 'avg_data_gb is the April to June mean, rounded to 2 decimals'


    def grade(c):
        c.plan('collected.csv is saved in the task folder',
               'collected.csv has no index column',
               'Columns match the spec, in order',
               'One row per customer',
               'Count and ID columns are whole numbers',
               ('region, plan_name, and monthly_fee come from the customer and plan tables', True),
               ('tenure_days counts the days up to 30 June 2024', True),
               (AVG, True),
               (T90, True),
               ('unresolved_tickets counts every unresolved ticket', True),
               ('churned comes from churn.csv', True),
               'Rows are sorted by customer_id')
        raw = c.output('collected.csv')
        if raw is None:
            return
        if not c.columns('Columns match the spec, in order', raw, COLS):
            return
        exp = c.expected('collected.csv')
        got = c.rows('One row per customer', raw, exp, 'customer_id', what='customer',
                     fewer='An inner join drops customers with no recent usage or no tickets. Left-join onto customers.',
                     more='Aggregate usage and tickets to one row per customer before you join.')
        if got is None:
            return
        c.integers('Count and ID columns are whole numbers', got,
                   ['customer_id', 'tenure_days', 'tickets_90d', 'unresolved_tickets', 'churned'])
        pairs = [('collected.csv', got, exp)]
        k = 'customer_id'
        c.values('region, plan_name, and monthly_fee come from the customer and plan tables', pairs,
                 ['region', 'plan_name', 'monthly_fee'], key=k, hint='Join plans.csv on plan_id.')
        c.values('tenure_days counts the days up to 30 June 2024', pairs, ['tenure_days'], key=k,
                 hint="(pd.Timestamp('2024-06-30') - signup_date).dt.days")
        c.values(AVG, pairs, ['avg_data_gb'], key=k, decimals={'avg_data_gb': 2},
                 hint='Keep the rows for 2024-04, 2024-05, and 2024-06, then take the mean per customer. Customers with no rows get 0.')
        c.values(T90, pairs, ['tickets_90d'], key=k,
                 hint='Count the tickets opened from 2 April to 30 June 2024. Customers with none get 0.')
        c.values('unresolved_tickets counts every unresolved ticket', pairs, ['unresolved_tickets'], key=k,
                 hint='Count the tickets where resolved is false, on any date.')
        c.values('churned comes from churn.csv', pairs, ['churned'], key=k)
        c.order('Rows are sorted by customer_id', raw, exp, 'customer_id', hint='Sort by customer_id before you save.')
""")


def _collect_variant(months="['2024-04', '2024-05', '2024-06']", hi="(t < '2024-07-01')", lo="(t >= '2024-04-02')",
                     how="left", fill=True, unres="~tickets['resolved']"):
    return code(f"""
import pandas as pd
customers = pd.read_csv('customers.csv', parse_dates=['signup_date']); plans = pd.read_csv('plans.csv')
usage = pd.read_csv('usage.csv'); churn = pd.read_csv('churn.csv')
tickets = pd.read_json('tickets.jsonl', lines=True); tickets['opened_at'] = pd.to_datetime(tickets['opened_at'])
recent = usage[usage['month'].isin({months})]
avg = recent.groupby('customer_id')['data_used_gb'].mean().round(2).rename('avg_data_gb').reset_index()
t = tickets['opened_at']
t90 = tickets[{lo} & {hi}].groupby('customer_id').size().rename('tickets_90d').reset_index()
unres = tickets[{unres}].groupby('customer_id').size().rename('unresolved_tickets').reset_index()
out = (customers.merge(plans[['plan_id', 'plan_name', 'monthly_fee']], on='plan_id', how='left')
       .merge(avg, on='customer_id', how='{how}').merge(t90, on='customer_id', how='left')
       .merge(unres, on='customer_id', how='left').merge(churn, on='customer_id', how='left'))
out['tenure_days'] = (pd.Timestamp('2024-06-30') - out['signup_date']).dt.days
{"out['avg_data_gb'] = out['avg_data_gb'].fillna(0)" if fill else ""}
for col in ['tickets_90d', 'unresolved_tickets']:
    out[col] = out[col]{".fillna(0).astype(int)" if fill else ""}
cols = ['customer_id', 'region', 'plan_name', 'monthly_fee', 'tenure_days', 'avg_data_gb', 'tickets_90d', 'unresolved_tickets', 'churned']
out.sort_values('customer_id')[cols].to_csv('collected.csv', index=False)
""")


T90 = "tickets_90d counts 2 April to 30 June 2024, both days included"
AVG = "avg_data_gb is the April to June mean, rounded to 2 decimals"
COLLECT_VARIANTS = [
    dict(name="le_timestamp",
         hint="opened_at holds a time of day. Comparing with <= '2024-06-30' stops at midnight and drops the rest of 30 June. Use < '2024-07-01', or compare dates.",
         code=_collect_variant(hi="(t <= '2024-06-30')"), fails=[T90]),
    dict(name="late_start", hint="The window starts on 2 April. A ticket opened at 00:00 that day counts.",
         code=_collect_variant(lo="(t > '2024-04-02')"), fails=[T90]),
    dict(name="all_months", hint="You averaged every month. Keep April, May, and June 2024 only.",
         code=_collect_variant(months="['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06']"), fails=[AVG]),
    dict(name="no_fill", hint="Customers with no match after the left join have missing values. Fill them with 0, and cast the counts to int.",
         code=_collect_variant(fill=False), fails=["Count and ID columns are whole numbers", AVG, T90, "unresolved_tickets counts every unresolved ticket"]),
    dict(name="inner_join", hint="", code=_collect_variant(how="inner"), fails=["One row per customer"]),
    dict(name="resolved_count", hint="You counted the resolved tickets. The column wants the ones where resolved is false.",
         code=_collect_variant(unres="tickets['resolved']"), fails=["unresolved_tickets counts every unresolved ticket"]),
]

# ---------------------------------------------------------------- process
PROCESS_COLS = ["customer_id", "monthly_fee", "tenure_days", "avg_data_gb", "tickets_90d", "unresolved_tickets", "churned",
                "region_East", "region_North", "region_South", "region_West",
                "plan_name_Basic", "plan_name_Family", "plan_name_Max", "plan_name_Plus"]


def make_process():
    rng = np.random.default_rng(71002)
    t = _table(71012, 1300, 20001)
    idx = rng.permutation(len(t))
    cut = int(0.7 * len(t))
    train, test = t.iloc[idx[:cut]].copy(), t.iloc[idx[cut:]].copy()
    for part, k1, k2 in ((train, 64, 36), (test, 28, 16)):
        part.iloc[rng.choice(len(part), k1, replace=False), part.columns.get_loc("avg_data_gb")] = np.nan
        part.iloc[rng.choice(len(part), k2, replace=False), part.columns.get_loc("region")] = None
    test.iloc[rng.choice(len(test), 7, replace=False), test.columns.get_loc("plan_name")] = "Student"
    return {"data/train.csv": csv_text(train), "data/test.csv": csv_text(test)}


PROCESS_DESC = html(f"""
<p>This dataset has the format of the table you built in the collection task. The values are different, so you can't reuse your earlier answer. It is split into a train set (70%) and a test set (30%).</p>
<h3>Files</h3>
{file_list(("data/train.csv", COLLECT_COLS), ("data/test.csv", ["the same columns"]))}
<h3>Your task</h3>
<ol>
  <li>Fill the missing values in <code>avg_data_gb</code> with the median of the train set.</li>
  <li>Fill the missing values in <code>region</code> with the most frequent region in the train set.</li>
  <li>One-hot encode <code>region</code> and <code>plan_name</code>. Learn the levels from the train set. Name the new columns <code>region_&lt;level&gt;</code> and <code>plan_name_&lt;level&gt;</code>, with levels in alphabetical order, holding the integers 0 and 1. A level that the train set never saw gets 0 in every column of that feature. Drop the original two columns.</li>
  <li>Min-max scale <code>tenure_days</code> and <code>monthly_fee</code> with the train set: subtract the train minimum, then divide by the train maximum minus the train minimum.</li>
</ol>
<p>The saved files have these columns, in this order: {", ".join(f"<code>{c}</code>" for c in PROCESS_COLS)}.</p>
<p>Don't let information from the test set leak into the train set. Keep every row and the row order. Save the results in the task folder as <code>processed_train.csv</code> and <code>processed_test.csv</code>.</p>
""")

PROCESS_SOLUTION = code("""
    import pandas as pd
    from sklearn.preprocessing import MinMaxScaler, OneHotEncoder

    train = pd.read_csv('data/train.csv')
    test = pd.read_csv('data/test.csv')

    # 1 and 2: impute with train statistics
    med = train['avg_data_gb'].median()
    top_region = train['region'].mode()[0]
    for df in (train, test):
        df['avg_data_gb'] = df['avg_data_gb'].fillna(med)
        df['region'] = df['region'].fillna(top_region)

    # 4: min-max scale, fitted on train
    num = ['tenure_days', 'monthly_fee']
    mm = MinMaxScaler().fit(train[num])
    train[num] = mm.transform(train[num])
    test[num] = mm.transform(test[num])

    # 3: one-hot, fitted on train. Unseen levels become all zeros
    cat = ['region', 'plan_name']
    oh = OneHotEncoder(handle_unknown='ignore', sparse_output=False).fit(train[cat])
    names = oh.get_feature_names_out(cat)

    def encode(df):
        hot = pd.DataFrame(oh.transform(df[cat]).astype(int), columns=names, index=df.index)
        return df.drop(columns=cat).join(hot)

    encode(train).to_csv('processed_train.csv', index=False)
    encode(test).to_csv('processed_test.csv', index=False)
""")

PROCESS_GRADER = code("""
    import numpy as np
    import pandas as pd

    FILES = ['processed_train.csv', 'processed_test.csv']
    HOT = ['region_East', 'region_North', 'region_South', 'region_West',
           'plan_name_Basic', 'plan_name_Family', 'plan_name_Max', 'plan_name_Plus']
    COLS = ['customer_id', 'monthly_fee', 'tenure_days', 'avg_data_gb', 'tickets_90d', 'unresolved_tickets', 'churned'] + HOT
    SCALE = 'tenure_days and monthly_fee are min-max scaled with train statistics'


    def grade(c):
        c.plan('processed_train.csv is saved in the task folder',
               'processed_train.csv has no index column',
               'processed_test.csv is saved in the task folder',
               'processed_test.csv has no index column',
               'Columns match the spec, in order',
               'Rows and row order are unchanged',
               'The one-hot columns hold whole numbers',
               ('avg_data_gb is filled with the train median', True),
               ('region and plan_name are one-hot encoded with the train levels', True),
               (SCALE, True),
               ('The other columns are untouched', True))
        pairs = c.frames(FILES, 'Columns match the spec, in order', 'Rows and row order are unchanged', 'customer_id',
                         cols_hint='Expected, in order: ' + ', '.join(COLS) + '. An extra column such as plan_name_Student means test was encoded on its own. Learn the levels on train.')
        if pairs is None:
            return
        both = pd.concat([got for _, got, _ in pairs])
        c.integers('The one-hot columns hold whole numbers', both, HOT, hint='Cast the one-hot output to int before you save.')
        k = 'customer_id'
        c.values('avg_data_gb is filled with the train median', pairs, ['avg_data_gb'], key=k,
                 hint='Compute the median on train, then fill train and test with that one number.')
        c.values('region and plan_name are one-hot encoded with the train levels', pairs, HOT, key=k,
                 hint='Fill region with the train mode first. Then fit the encoder on train and transform both sets.')
        c.values(SCALE, pairs, ['tenure_days', 'monthly_fee'], key=k, hint='Use the train minimum and maximum for both sets.')
        c.values('The other columns are untouched', pairs, ['customer_id', 'tickets_90d', 'unresolved_tickets', 'churned'], key=k,
                 hint='Transform only the columns the task names.')
""")


def _process_variant(med_te="med", mm="train", dummies=False, mode_te="top"):
    body = f"""
import pandas as pd
train = pd.read_csv('data/train.csv'); test = pd.read_csv('data/test.csv')
med = train['avg_data_gb'].median(); med_test = test['avg_data_gb'].median()
top = train['region'].mode()[0]; top_test = test['region'].mode()[0]
lo = {{c: train[c].min() for c in ['tenure_days', 'monthly_fee']}}; hi = {{c: train[c].max() for c in ['tenure_days', 'monthly_fee']}}
for df, m, t in ((train, med, top), (test, {med_te}, {mode_te})):
    df['avg_data_gb'] = df['avg_data_gb'].fillna(m)
    df['region'] = df['region'].fillna(t)
    for c in ['tenure_days', 'monthly_fee']:
        a, b = (lo[c], hi[c]) if '{mm}' == 'train' else (df[c].min(), df[c].max())
        df[c] = (df[c] - a) / (b - a)
"""
    if dummies:
        body += """
pd.get_dummies(train, columns=['region', 'plan_name'], dtype=int).to_csv('processed_train.csv', index=False)
pd.get_dummies(test, columns=['region', 'plan_name'], dtype=int).to_csv('processed_test.csv', index=False)
"""
    else:
        body += """
tr = pd.get_dummies(train, columns=['region', 'plan_name'], dtype=int)
te = pd.get_dummies(test, columns=['region', 'plan_name'], dtype=int).reindex(columns=tr.columns, fill_value=0)
tr.to_csv('processed_train.csv', index=False); te.to_csv('processed_test.csv', index=False)
"""
    return code(body)


P_SCALE = "tenure_days and monthly_fee are min-max scaled with train statistics"
PROCESS_VARIANTS = [
    dict(name="test_median", hint="The test set is filled with its own median. Use the train median for both sets.",
         code=_process_variant(med_te="med_test"), fails=["avg_data_gb is filled with the train median"]),
    dict(name="test_minmax", hint="The test set is scaled with its own minimum and maximum. Use the train values for both sets.",
         code=_process_variant(mm="each"), fails=[P_SCALE]),
    dict(name="dummies_each", hint="", code=_process_variant(dummies=True), fails=["Columns match the spec, in order"]),
]


def oracle_process(inputs):
    tr = pd.read_csv(io.StringIO(inputs["data/train.csv"]))
    te = pd.read_csv(io.StringIO(inputs["data/test.csv"]))
    med = float(np.nanmedian(tr["avg_data_gb"].to_numpy()))
    top = tr["region"].value_counts().idxmax()
    levels = {"region": sorted(tr["region"].dropna().unique()), "plan_name": sorted(tr["plan_name"].dropna().unique())}
    rng_ = {c: (float(tr[c].min()), float(tr[c].max())) for c in ("tenure_days", "monthly_fee")}
    out = {}
    for name, df in (("processed_train.csv", tr), ("processed_test.csv", te)):
        d = df.copy()
        d["avg_data_gb"] = d["avg_data_gb"].where(d["avg_data_gb"].notna(), med)
        region = d["region"].where(d["region"].notna(), top)
        for c, (a, b) in rng_.items():
            d[c] = (d[c].to_numpy(dtype=float) - a) / (b - a)
        for col, series in (("region", region), ("plan_name", d["plan_name"])):
            for lv in levels[col]:
                d[f"{col}_{lv}"] = (series == lv).astype(int)
        out[name] = d.drop(columns=["region", "plan_name"])[PROCESS_COLS]
    return out


# ---------------------------------------------------------------- model
def make_model():
    t = _table(71003, 5000, 40001)
    rng = np.random.default_rng(71013)
    idx = rng.permutation(len(t))
    a, b = 3000, 3800
    tr, va, te = t.iloc[idx[:a]].copy(), t.iloc[idx[a:b]].copy(), t.iloc[idx[b:]].copy()
    lo = {c: tr[c].min() for c in ("tenure_days", "monthly_fee")}
    hi = {c: tr[c].max() for c in ("tenure_days", "monthly_fee")}
    out = []
    for part in (tr, va, te):
        d = part.copy()
        for c in lo:
            d[c] = (d[c] - lo[c]) / (hi[c] - lo[c])
        for col, levels in (("region", REGIONS), ("plan_name", ["Basic", "Family", "Max", "Plus"])):
            for lv in levels:
                d[f"{col}_{lv}"] = (d[col] == lv).astype(int)
        out.append(d.drop(columns=["region", "plan_name"])[PROCESS_COLS])
    tr, va, te = out
    inputs = {"train.csv": csv_text(tr), "val.csv": csv_text(va), "test.csv": csv_text(te.drop(columns="churned"))}
    hidden = {"truth.csv": csv_text(te[["customer_id", "churned"]])}
    return inputs, hidden


MODEL_DESC = html(f"""
<p>This dataset has the format of the files you saved in the processing task. The values are different.</p>
<p>It is split three ways: train (60%), validation (16%), and test (24%). The test set has no <code>churned</code> column. About one customer in five churns.</p>
<h3>Files</h3>
{file_list(("train.csv", PROCESS_COLS), ("val.csv", ["the same columns"]), ("test.csv", ["the same columns without <code>churned</code>"]))}
<h3>Your task</h3>
<p>Predict <code>churned</code> for every customer in <code>test.csv</code>. This is a free-form task: use any model.</p>
<p>The metric is the F1 score of the churn class. The bar is an F1 of at least {F1_BAR:.2f} on the test set.</p>
<p>Save <code>predictions.csv</code> in the task folder with one column named <code>churned</code> that holds 0 or 1, one row per test row, in the same order.</p>
""")

MODEL_SOLUTION = code("""
    import numpy as np
    import pandas as pd
    from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import f1_score

    train = pd.read_csv('train.csv')
    val = pd.read_csv('val.csv')
    test = pd.read_csv('test.csv')
    target = 'churned'
    feats = list(test.columns.drop('customer_id'))

    # 1 Compare model families, each at its best F1 threshold on validation
    models = {
        'logreg': LogisticRegression(max_iter=1000),
        'rf': RandomForestClassifier(n_estimators=200, min_samples_leaf=5, random_state=42, n_jobs=-1),
        'hgb': HistGradientBoostingClassifier(random_state=42)}
    grid = np.arange(0.20, 0.61, 0.05)
    best = (None, 0.5, -1.0)
    for name, m in models.items():
        m.fit(train[feats], train[target])
        p = m.predict_proba(val[feats])[:, 1]
        f1s = [f1_score(val[target], p >= t) for t in grid]
        i = int(np.argmax(f1s))
        print(name, round(float(grid[i]), 2), round(f1s[i], 3))
        if f1s[i] > best[2]:
            best = (name, float(grid[i]), f1s[i])

    # 2 Refit the winner on train + val, predict test at the chosen threshold
    name, t, _ = best
    full = pd.concat([train, val], ignore_index=True)
    model = models[name].fit(full[feats], full[target])
    pred = (model.predict_proba(test[feats])[:, 1] >= t).astype(int)
    pd.DataFrame({target: pred}).to_csv('predictions.csv', index=False)
""")

MODEL_GRADER = code(f"""
    import numpy as np
    import pandas as pd

    BAR = {F1_BAR}
    METRIC = f'F1 on the hidden test labels is at least {{BAR:.2f}}'


    def grade(c):
        c.plan('predictions.csv is saved in the task folder',
               'predictions.csv has no index column',
               'One column, named churned',
               'One prediction per test row',
               'Every prediction is 0 or 1',
               (METRIC, True))
        got = c.output('predictions.csv')
        if got is None:
            return
        if not c.check('One column, named churned', list(got.columns) == ['churned'],
                       'Found these columns: ' + ', '.join(map(str, got.columns)) + '.',
                       'Save a DataFrame that holds only the churned column.'):
            return
        truth = c.secret('truth.csv')
        if not c.check('One prediction per test row', len(got) == len(truth),
                       f'test.csv has {{len(truth):,}} rows and predictions.csv has {{len(got):,}}.',
                       'Predict on test.csv and keep its row order.'):
            return
        p = pd.to_numeric(got['churned'], errors='coerce')
        if not c.check('Every prediction is 0 or 1', bool(p.isin([0, 1]).all()), 'Some values are not 0 or 1.',
                       'Save labels, not probabilities: (proba >= threshold).astype(int).'):
            return
        y = truth['churned'].to_numpy()
        pred = p.to_numpy().astype(int)
        tp = int(((pred == 1) & (y == 1)).sum())
        flagged, actual = int(pred.sum()), int(y.sum())
        precision = tp / flagged if flagged else 0.0
        recall = tp / actual
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        c.note(f'F1 {{f1:.3f}} (bar {{BAR:.2f}}). Precision {{precision:.3f}}, recall {{recall:.3f}}.')
        c.check(METRIC, f1 >= BAR, f'Your F1 is {{f1:.3f}}, with precision {{precision:.3f}} and recall {{recall:.3f}}.',
                'With one churner in five, a 0.5 threshold is rarely the best for F1. Scan thresholds on val.csv, and compare a linear model with tree ensembles.')
""")

M_METRIC = f"F1 on the hidden test labels is at least {F1_BAR:.2f}"
MODEL_VARIANTS = [
    dict(name="all_ones", hint="", fails=[M_METRIC], code=code("""
        import pandas as pd
        test = pd.read_csv('test.csv')
        pd.DataFrame({'churned': [1] * len(test)}).to_csv('predictions.csv', index=False)
    """)),
    dict(name="one_rule", hint="", fails=[M_METRIC], code=code("""
        import pandas as pd
        test = pd.read_csv('test.csv')
        pd.DataFrame({'churned': (test['unresolved_tickets'] >= 1).astype(int)}).to_csv('predictions.csv', index=False)
    """)),
    dict(name="probabilities", hint="", fails=["Every prediction is 0 or 1"], code=code("""
        import pandas as pd
        from sklearn.linear_model import LogisticRegression
        train = pd.read_csv('train.csv'); test = pd.read_csv('test.csv'); f = list(test.columns.drop('customer_id'))
        m = LogisticRegression(max_iter=1000).fit(train[f], train['churned'])
        pd.DataFrame({'churned': m.predict_proba(test[f])[:, 1]}).to_csv('predictions.csv', index=False)
    """)),
]


def exercises():
    collect_inputs = make_collect()
    model_inputs, model_hidden = make_model()
    return [
        dict(id="m1-collect", module=3, title="Collect the customer data", story="Telecom", minutes=22,
             inputs=collect_inputs, outputs=["collected.csv"], hidden={}, expect=["collected.csv"], align="customer_id",
             desc=COLLECT_DESC, starter="import pandas as pd\n\n", solution=COLLECT_SOLUTION, grader=COLLECT_GRADER,
             hints=["Build each aggregate as its own one-row-per-customer table, then left-join them all onto customers.",
                    "pd.read_json('tickets.jsonl', lines=True) reads JSON lines. The 90-day window is >= '2024-04-02' and < '2024-07-01'.",
                    "After the joins, fill avg_data_gb and both ticket counts with 0, and cast the counts to int."],
             variants=COLLECT_VARIANTS, oracle=oracle_collect, oracle_decimals={"avg_data_gb": 2}),
        dict(id="m1-process", module=4, title="Process without leakage", story="Telecom", minutes=15,
             inputs=make_process(), outputs=["processed_train.csv", "processed_test.csv"], hidden={},
             expect=["processed_train.csv", "processed_test.csv"], align=None,
             desc=PROCESS_DESC, starter="import pandas as pd\n\n", solution=PROCESS_SOLUTION, grader=PROCESS_GRADER,
             hints=["The median, the most frequent region, the minimum and maximum, and the one-hot levels all come from train.",
                    "Fill region before you encode it, so the filled rows get a 1 in the right column.",
                    "OneHotEncoder(handle_unknown='ignore', sparse_output=False) fitted on train gives zeros for unseen levels. In pandas, reindex test's dummies to train's columns with fill_value=0."],
             variants=PROCESS_VARIANTS, oracle=oracle_process),
        dict(id="m1-model", module=5, title="Predict churn", story="Telecom", minutes=23,
             inputs=model_inputs, outputs=["predictions.csv"], hidden=model_hidden, expect=[], align=None,
             desc=MODEL_DESC, starter="import pandas as pd\n\n", solution=MODEL_SOLUTION, grader=MODEL_GRADER,
             hints=["Save a valid predictions.csv from a quick model first. Then measure F1 on val.csv.",
                    "F1 depends on the threshold. Take predict_proba(X)[:, 1] and scan thresholds from 0.2 to 0.6 on val.csv.",
                    "Compare logistic regression, a random forest, and gradient boosting, each at its best threshold. Refit the winner on train plus val."],
             variants=MODEL_VARIANTS, oracle=None),
    ]
