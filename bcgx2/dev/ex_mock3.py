"""Coding run story: a delivery company and its couriers. Four linked coding tasks and no quiz.

The shape follows the four-question version of the test that candidates describe: a short analysis saved as a
small table, then collection from several files, processing, and a classifier that has to reach a recall bar
while precision stays above a floor. The story, the data, and the wording are this site's own.
"""
import csv
import io
import json
from datetime import date, datetime

import numpy as np
import pandas as pd

from common import code, cols, csv_text, file_list, html, read_csv_text, schema

TODAY = "2024-06-30"
MODELS = ["Honda PCX", "Honda Wave", "Suzuki Address", "Toyota Hiace", "Yamaha Aerox", "Yamaha NMAX"]
LANGS = ["no", "hindi", "malay", "mandarin", "tamil"]
LANG_P = [0.46, 0.07, 0.17, 0.2, 0.1]
DELIVERED, DECLINED, CANCELLED = "Delivered", "Declined by the courier", "Cancelled by the customer"
TIERS = {"Standard": 0, "Priority": 1}
COLLECT_COLS = ["courier_id", "vehicle_model", "vehicle_made_year", "days_since_service", "age", "experience",
                "second_language", "rating", "tips_total", "number_of_declined", "number_of_kudos",
                "number_of_complaints", "tier"]
P_BAR, R_BAR = 0.75, 0.85
MODEL_SEED = 83040


# ================================================================ data
def _table(seed, n, start_id, k=7.0, rate=0.25, langs=LANGS, lang_p=LANG_P):
    """A courier-level table in the collected format. The tier is drawn from a score, so no model is perfect."""
    rng = np.random.default_rng(seed)
    age = rng.integers(21, 61, n)
    exp = np.minimum(rng.integers(0, 31, n), age - 18)
    rating = np.round(np.clip(rng.normal(4.3, 0.35, n), 3.0, 5.0), 2)
    declined = rng.poisson(2.0, n)
    kudos = rng.poisson(np.clip(6 + 10 * (rating - 3.5), 1, None))
    complaints = rng.poisson(0.8, n)
    tips = np.round(rng.gamma(3.0, 60, n) * (0.6 + 0.4 * (rating - 3.0)) + 4 * exp, 2)
    days = np.round(rng.gamma(2.0, 60, n)).astype(int)
    z = (1.1 * (rating - 4.3) / 0.35 + 0.9 * (kudos - 14) / 5 - 0.8 * (complaints - 0.8) - 0.6 * (declined - 2) / 1.4
         + 0.5 * (exp - 8) / 6 + 0.4 * (tips - tips.mean()) / tips.std() + 0.9 * ((complaints == 0) & (declined <= 1)))
    z = (z - z.mean()) / z.std()
    lo, hi = -20.0, 20.0                                             # the offset that gives the wanted share of Priority
    for _ in range(60):
        c = (lo + hi) / 2
        if (1 / (1 + np.exp(-(k * z - c)))).mean() > rate:
            lo = c
        else:
            hi = c
    y = rng.random(n) < 1 / (1 + np.exp(-(k * z - c)))
    return pd.DataFrame({
        "courier_id": np.arange(start_id, start_id + n),
        "vehicle_model": rng.choice(MODELS, n, p=[.2, .25, .15, .1, .12, .18]),
        "vehicle_made_year": rng.integers(2012, 2024, n),
        "days_since_service": days, "age": age, "experience": exp,
        "second_language": rng.choice(langs, n, p=lang_p),
        "rating": rating, "tips_total": tips, "number_of_declined": declined, "number_of_kudos": kudos,
        "number_of_complaints": complaints, "tier": np.where(y, "Priority", "Standard")})


def _raw(seed, n, start_id, full):
    """Couriers, their vehicles, and four monthly delivery files.

    full adds the feedback columns and the deliveries of couriers who are no longer listed.
    """
    rng = np.random.default_rng(seed)
    ids = np.arange(start_id, start_id + n)
    age = rng.integers(21, 61, n)
    started = 2024 - np.minimum(rng.integers(0, 31, n), age - 18)
    rating = np.round(np.clip(rng.normal(4.3, 0.35, n), 3.0, 5.0), 2)
    couriers = pd.DataFrame({
        "courier_id": ids, "vehicle_id": rng.permutation(np.arange(9001, 9001 + n)), "age": age, "started_year": started,
        "second_language": rng.choice(LANGS, n, p=LANG_P), "rating": rating,
        "tips_total": np.round(rng.gamma(3.0, 60, n) * (0.6 + 0.4 * (rating - 3.0)), 2),
        "tier": rng.choice(["Standard", "Priority"], n, p=[.75, .25])})
    nv = n + 15                                                       # 15 spare vehicles belong to no courier
    service = pd.Timestamp(TODAY) - pd.to_timedelta(np.round(rng.gamma(2.0, 60, nv)).astype(int), unit="D")
    vehicles = pd.DataFrame({
        "vehicle_id": np.arange(9001, 9001 + nv), "model": rng.choice(MODELS, nv, p=[.2, .25, .15, .1, .12, .18]),
        "made_year": rng.integers(2012, 2024, nv), "last_service_date": service.strftime("%Y-%m-%d")})
    vehicles.loc[[3, 40, 77], "last_service_date"] = TODAY           # serviced today: 0 days
    vehicles = vehicles.sample(frac=1, random_state=3).reset_index(drop=True)

    idle = set(rng.choice(ids, 12, replace=False).tolist())          # couriers with no deliveries at all
    busy = dict(zip(ids.tolist(), np.clip(4.0 + 6.0 * (rating - 4.3), 0.5, None)))   # better-rated couriers get more jobs
    former = list(range(start_id - 40, start_id - 20)) if full else []                # couriers who left: not in couriers.csv
    months = [("2024-03", 31, .78), ("2024-04", 30, .82), ("2024-05", 31, .86), ("2024-06", 30, .89)]
    rows = []
    for cid in ids.tolist() + former:
        if cid in idle:
            continue
        for mi, (month, ndays, p_ok) in enumerate(months):
            for _ in range(rng.poisson(busy.get(cid, 3.0))):
                u = rng.random()
                status = DELIVERED if u < p_ok else DECLINED if u < p_ok + (1 - p_ok) * 0.45 else CANCELLED
                ok = status == DELIVERED
                rows.append((mi, cid, int(rng.integers(50001, 53000)), f"{month}-{int(rng.integers(1, ndays + 1)):02d}", status,
                             int(ok and rng.random() < .35), int(ok and rng.random() < .22), int(ok and rng.random() < .3),
                             int(rng.random() < (.05 if ok else .02))))
    d = pd.DataFrame(rows, columns=["file", "courier_id", "customer_id", "date", "status",
                                    "kudos_speed", "kudos_care", "kudos_friendly", "complaint"])
    d = d.sample(frac=1, random_state=5).sort_values("file", kind="stable").reset_index(drop=True)
    d.insert(0, "delivery_id", np.arange(700001, 700001 + len(d)))
    keep = list(d.columns.drop("file")) if full else ["delivery_id", "courier_id", "customer_id", "date", "status"]
    files = {f"deliveries_{i + 1}.csv": csv_text(d.loc[d.file == i, keep]) for i in range(4)}
    return couriers, vehicles, files


def make_analyze():
    couriers, _, files = _raw(81001, 420, 3001, full=False)
    return {"couriers.csv": csv_text(couriers[["courier_id", "age", "second_language", "rating"]]), **files}


def make_collect():
    couriers, vehicles, files = _raw(81002, 400, 4001, full=True)
    return {"couriers.csv": csv_text(couriers), "vehicles.csv": csv_text(vehicles), **files}


def make_process():
    """70/30 split. Ages have gaps, and the test set holds one language that train never saw."""
    for seed in range(82001, 82400):
        rng = np.random.default_rng(seed)
        t = _table(seed, 1000, 6001, langs=["no", "malay", "mandarin", "tamil"], lang_p=[.5, .18, .21, .11])
        t["age"] = t["age"].astype(float)
        t.loc[rng.choice(len(t), 90, replace=False), "age"] = np.nan
        idx = rng.permutation(len(t))
        tr, te = t.iloc[idx[:700]].copy(), t.iloc[idx[700:]].copy()
        te.loc[te.index[rng.choice(len(te), 14, replace=False)], "second_language"] = "hindi"
        m_tr, m_te, m_all = tr["age"].mean(), te["age"].mean(), pd.concat([tr, te])["age"].mean()
        clear = all(abs(m - np.floor(m) - 0.5) > 0.12 for m in (m_tr, m_te, m_all))    # no mean sits near a half
        if clear and round(m_tr) != round(m_all) and round(m_tr) != round(m_te) and te["age"].isna().sum() >= 20:
            return {"data/train.csv": csv_text(tr), "data/test.csv": csv_text(te)}
    raise AssertionError("no seed gives a train mean age that differs from the others after rounding")


def processed(tr, parts):
    """The processing of the third task, in pandas only, applied to frames in the collected format."""
    out = []
    fill = round(tr["age"].mean())
    codes = {c: {v: i for i, v in enumerate(sorted(tr[c].unique()))} for c in ("vehicle_model", "second_language")}
    mu, sd = tr["tips_total"].mean(), tr["tips_total"].std(ddof=0)
    for df in parts:
        d = df.copy()
        d["age"] = d["age"].fillna(fill).astype(int)
        for c, m in codes.items():
            d[c] = d[c].map(m).fillna(-1).astype(int)
        d["tips_total"] = ((d["tips_total"] - mu) / sd).round(5)
        d["tier"] = d["tier"].map(TIERS)
        out.append(d)
    return out


def make_model(seed=MODEL_SEED, n=10000):
    t = _table(seed, n, 20001)
    a, b = int(.70 * n), int(.85 * n)
    tr, va, te = processed(t.iloc[:a], [t.iloc[:a], t.iloc[a:b], t.iloc[b:]])
    inputs = {"data/train.csv": csv_text(tr), "data/val.csv": csv_text(va), "data/test.csv": csv_text(te.drop(columns="tier"))}
    hidden = {"truth.csv": csv_text(te[["courier_id", "tier"]])}
    return inputs, hidden


def _deliveries_item(columns, note):
    return (f"<li><code>deliveries_1.csv</code> to <code>deliveries_4.csv</code>: {cols(*columns)}. {note}</li>")


# ================================================================ task 1: a short analysis
INSIGHTS = ["average_rating", "second_language_share", "delivered_share", "busiest_courier_deliveries"]
A_LABEL = {
    "average_rating": "average_rating is the mean rating of the couriers",
    "second_language_share": "second_language_share is the percentage of couriers with a second language",
    "delivered_share": "delivered_share is the percentage of all deliveries that were delivered",
    "busiest_courier_deliveries": "busiest_courier_deliveries is the largest number of delivered deliveries for one courier",
}
A_DEFAULT = {
    "average_rating": "Take the mean of the rating column in couriers.csv.",
    "second_language_share": "Mark the couriers whose second_language is not no, take the mean of that column, and multiply by 100.",
    "delivered_share": "Stack the four delivery files, divide the number of Delivered rows by the number of all rows, and multiply by 100.",
    "busiest_courier_deliveries": "Keep the Delivered rows of all four files, count them per courier_id, and take the largest count.",
}
H_ONE_FILE = "That is the number for one delivery file. Read all four and stack them with pd.concat before you count."
H_FRACTION = "That is a fraction. The task asks for a percentage, so multiply by 100."
H_NO = "Every courier has a value in second_language. The value no means that the courier has none."
H_WITHOUT = "That is the share of couriers without a second language."
H_WEIGHTED = "You averaged the rating over deliveries, so a courier with many deliveries counts many times. Average over the rows of couriers.csv."
H_ANY_STATUS = "You counted deliveries of every status. Keep the rows where status is Delivered before you count."


def analyze_known(inputs):
    """The exact answers, and the answers that common mistakes give, each with the hint to show for it."""
    c = read_csv_text(inputs["couriers.csv"])
    files = [read_csv_text(inputs[f"deliveries_{i}.csv"]) for i in range(1, 5)]
    d = pd.concat(files, ignore_index=True)
    ok = d[d["status"] == DELIVERED]
    exact = {"average_rating": float(c["rating"].mean()),
             "second_language_share": float(100 * (c["second_language"] != "no").mean()),
             "delivered_share": 100 * len(ok) / len(d),
             "busiest_courier_deliveries": int(ok.groupby("courier_id").size().max())}
    per_file = [f[f["status"] == DELIVERED] for f in files]
    wrong = {
        "average_rating": [(float(d.merge(c, on="courier_id")["rating"].mean()), H_WEIGHTED)],
        "second_language_share": [(exact["second_language_share"] / 100, H_FRACTION), (100.0, H_NO),
                                  (100 - exact["second_language_share"], H_WITHOUT)],
        "delivered_share": [(exact["delivered_share"] / 100, H_FRACTION)]
                           + [(100 * len(p) / len(f), H_ONE_FILE) for p, f in zip(per_file, files)],
        "busiest_courier_deliveries": [(int(d.groupby("courier_id").size().max()), H_ANY_STATUS)]
                                      + [(int(p.groupby("courier_id").size().max()), H_ONE_FILE) for p in per_file],
    }
    for name, value in exact.items():
        assert abs((value * 100) % 1 - 0.5) > 0.05 or float(value).is_integer(), f"{name} sits on a rounding tie: {value}"
        for w, _ in wrong[name]:
            assert abs(w - value) > 0.02, f"{name}: a known mistake gives the right answer ({w} vs {value})"
    return {"exact": exact, "wrong": {k: [[w, hint] for w, hint in v] for k, v in wrong.items()}, "hint": A_DEFAULT}


def oracle_analyze(inputs):
    """Plain-Python version of task 1."""
    rd = lambda name: list(csv.DictReader(io.StringIO(inputs[name])))
    couriers = rd("couriers.csv")
    rows = [r for i in range(1, 5) for r in rd(f"deliveries_{i}.csv")]
    done = {}
    for r in rows:
        if r["status"] == DELIVERED:
            done[r["courier_id"]] = done.get(r["courier_id"], 0) + 1
    values = [sum(float(c["rating"]) for c in couriers) / len(couriers),
              100 * sum(c["second_language"] != "no" for c in couriers) / len(couriers),
              100 * sum(done.values()) / len(rows),
              max(done.values())]
    return {"analysis_results.csv": pd.DataFrame({"insight_type": INSIGHTS, "value": [round(float(v), 2) for v in values]})}


ANALYZE_DESC = html(f"""
<p>A delivery company keeps one file of couriers and one file of deliveries for each of the last four months. Run a short analysis and save the results as a small table.</p>
<h3>Files</h3>
<ul class="files">
<li><code>couriers.csv</code>: {cols("courier_id", "age", "second_language", "rating")}. <code>second_language</code> is <code>no</code> for a courier who has none.</li>
{_deliveries_item(["delivery_id", "courier_id", "customer_id", "date", "status"],
                  "The four files have the same columns. <code>status</code> is <code>Delivered</code>, <code>Declined by the courier</code>, or <code>Cancelled by the customer</code>.")}
</ul>
<h3>Your task</h3>
<p>Save <code>analysis_results.csv</code> in the task folder. It has two columns, <code>insight_type</code> and <code>value</code>, and one row for each of these insights:</p>
<table class="schema"><thead><tr><th>insight_type</th><th>value</th></tr></thead><tbody>
<tr><td><code>average_rating</code></td><td>The mean <code>rating</code> of the couriers</td></tr>
<tr><td><code>second_language_share</code></td><td>The percentage of couriers who have a second language</td></tr>
<tr><td><code>delivered_share</code></td><td>The percentage of deliveries, in all four files together, with the status <code>Delivered</code></td></tr>
<tr><td><code>busiest_courier_deliveries</code></td><td>The largest number of <code>Delivered</code> deliveries that a single courier has, in all four files together</td></tr>
</tbody></table>
<p>Round every value to 2 decimals. The rows can be in any order. The file looks like this, with your own numbers:</p>
<pre class="sample">insight_type,value
average_rating,3.87
second_language_share,61.25
delivered_share,70.4
busiest_courier_deliveries,19.0</pre>
""")

ANALYZE_SOLUTION = code("""
    import pandas as pd

    couriers = pd.read_csv('couriers.csv')
    deliveries = pd.concat([pd.read_csv(f'deliveries_{i}.csv') for i in range(1, 5)], ignore_index=True)
    delivered = deliveries[deliveries['status'] == 'Delivered']

    # One entry per insight. A share is the mean of a true-or-false column.
    results = {
        'average_rating': couriers['rating'].mean(),
        'second_language_share': (couriers['second_language'] != 'no').mean() * 100,
        'delivered_share': len(delivered) / len(deliveries) * 100,
        'busiest_courier_deliveries': delivered.groupby('courier_id').size().max(),
    }

    out = pd.DataFrame({'insight_type': list(results), 'value': list(results.values())})
    out['value'] = out['value'].round(2)
    out.to_csv('analysis_results.csv', index=False)
""")

ANALYZE_GRADER = code(f"""
    import json

    import numpy as np
    import pandas as pd

    NAMES = {INSIGHTS!r}
    LABEL = {A_LABEL!r}
    COLS = 'Columns are insight_type and value, in that order'
    ROWS = 'One row for each of the four insights'
    ROUND = 'Every value is a number with at most 2 decimals'
    PLAIN = 'Save plain numbers, with no percent sign and no text. A test that compares numbers fails on text that only looks like one.'


    def grade(c):
        c.plan('analysis_results.csv is saved in the task folder',
               'analysis_results.csv has no index column',
               COLS, ROWS, ROUND,
               *[(LABEL[n], True) for n in NAMES])
        got = c.output('analysis_results.csv')
        if got is None:
            return
        if not c.columns(COLS, got, ['insight_type', 'value'],
                         hint='Save a long table: the name of each insight in insight_type and its number in value.'):
            return
        names = [str(x) for x in got['insight_type']]
        parts = []
        missing = [n for n in NAMES if n not in names]
        extra = sorted(set(n for n in names if n not in NAMES))
        twice = sorted(set(n for n in names if n in NAMES and names.count(n) > 1))
        if missing:
            parts.append('missing: ' + ', '.join(missing))
        if extra:
            parts.append('not expected: ' + ', '.join(extra))
        if twice:
            parts.append('more than once: ' + ', '.join(twice))
        if not c.check(ROWS, not parts, "The insight_type values don't match (" + '; '.join(parts) + ').',
                       'Use these names, spelled the same way: ' + ', '.join(NAMES) + '.'):
            return
        raw = dict(zip(names, got['value']))
        value = {{n: float(pd.to_numeric(pd.Series([raw[n]]), errors='coerce').iloc[0]) for n in NAMES}}
        text = [n for n in NAMES if np.isnan(value[n])]
        loose = [n for n in NAMES if n not in text and round(value[n], 2) != value[n]]
        c.check(ROUND, not (text or loose),
                ' '.join([f'{{n}} is saved as {{raw[n]}}, which is not a number.' for n in text] + [f'{{n}} is saved as {{raw[n]}}.' for n in loose]),
                PLAIN if text else 'Round each number to 2 decimals before you save, for example with round(x, 2).')
        known = json.loads((c.hidden / 'known.json').read_text())
        for n in NAMES:
            v = value[n]
            if np.isnan(v):
                c.check(LABEL[n], False, f'{{n}} is not a number, so there is no value to check.', PLAIN)
                continue
            close = lambda w: abs(v - w) <= 0.005 + 1e-9
            hint = next((h for w, h in known['wrong'][n] if close(w)), known['hint'][n])
            c.check(LABEL[n], close(known['exact'][n]), f'{{n}} is {{raw[n]}}, which is not the right value.', hint)
""")

_ANALYZE_ALL = "pd.concat([pd.read_csv(f'deliveries_{i}.csv') for i in range(1, 5)], ignore_index=True)"
_ANALYZE_SAVE = "out = pd.DataFrame({'insight_type': list(results), 'value': list(results.values())})"


def _analyze_variant(deliveries=_ANALYZE_ALL, rating="couriers['rating'].mean()",
                     lang="(couriers['second_language'] != 'no').mean() * 100",
                     share="len(delivered) / len(deliveries) * 100",
                     busiest="delivered.groupby('courier_id').size().max()",
                     frame=_ANALYZE_SAVE, rounding="out['value'] = out['value'].round(2)", index=", index=False",
                     names=INSIGHTS):
    return "\n".join([
        "import pandas as pd",
        "couriers = pd.read_csv('couriers.csv')",
        f"deliveries = {deliveries}",
        "delivered = deliveries[deliveries['status'] == 'Delivered']",
        f"results = {{'{names[0]}': {rating}, '{names[1]}': {lang}, '{names[2]}': {share}, '{names[3]}': {busiest}}}",
        frame, rounding,
        f"out.to_csv('analysis_results.csv'{index})", ""])


ANALYZE_VARIANTS = [
    dict(name="one_file", hint=H_ONE_FILE, code=_analyze_variant(deliveries="pd.read_csv('deliveries_1.csv')"),
         fails=[A_LABEL["delivered_share"], A_LABEL["busiest_courier_deliveries"]]),
    dict(name="last_file", hint=H_ONE_FILE, code=_analyze_variant(deliveries="pd.read_csv('deliveries_4.csv')"),
         fails=[A_LABEL["delivered_share"], A_LABEL["busiest_courier_deliveries"]]),
    dict(name="fraction", hint=H_FRACTION,
         code=_analyze_variant(lang="(couriers['second_language'] != 'no').mean()", share="len(delivered) / len(deliveries)"),
         fails=[A_LABEL["second_language_share"], A_LABEL["delivered_share"]]),
    dict(name="counts_no", hint=H_NO, code=_analyze_variant(lang="couriers['second_language'].notna().mean() * 100"),
         fails=[A_LABEL["second_language_share"]]),
    dict(name="share_without", hint=H_WITHOUT, code=_analyze_variant(lang="(couriers['second_language'] == 'no').mean() * 100"),
         fails=[A_LABEL["second_language_share"]]),
    dict(name="weighted_rating", hint=H_WEIGHTED,
         code=_analyze_variant(rating="deliveries.merge(couriers, on='courier_id')['rating'].mean()"),
         fails=[A_LABEL["average_rating"]]),
    dict(name="any_status", hint=H_ANY_STATUS, code=_analyze_variant(busiest="deliveries.groupby('courier_id').size().max()"),
         fails=[A_LABEL["busiest_courier_deliveries"]]),
    dict(name="no_round", hint="", code=_analyze_variant(rounding=""), fails=["Every value is a number with at most 2 decimals"]),
    dict(name="index_saved", hint="", code=_analyze_variant(index=""), fails=["analysis_results.csv has no index column"]),
    dict(name="percent_text", hint="",
         code=_analyze_variant(rounding="out['value'] = [f'{v:.2f}%' if 'share' in k else round(float(v), 2) for k, v in results.items()]"),
         fails=["Every value is a number with at most 2 decimals", A_LABEL["second_language_share"], A_LABEL["delivered_share"]]),
    dict(name="wide_table", hint="", code=_analyze_variant(frame="out = pd.DataFrame([results]).round(2)", rounding=""),
         fails=["Columns are insight_type and value, in that order"]),
    dict(name="short_names", hint="",
         code=_analyze_variant(names=["avg_rating", "second_language_share", "delivered_share", "busiest_courier_deliveries"]),
         fails=["One row for each of the four insights"]),
]


# ================================================================ task 2: collection
def oracle_collect(inputs):
    """Plain-Python version of task 2: no pandas joins or datetime parsing."""
    rd = lambda name: list(csv.DictReader(io.StringIO(inputs[name])))
    vehicles = {r["vehicle_id"]: r for r in rd("vehicles.csv")}
    today = date(2024, 6, 30)
    declined, kudos, complaints = {}, {}, {}
    for i in range(1, 5):
        for r in rd(f"deliveries_{i}.csv"):
            k = r["courier_id"]
            declined[k] = declined.get(k, 0) + int(r["status"] == DECLINED)
            kudos[k] = kudos.get(k, 0) + int(r["kudos_speed"]) + int(r["kudos_care"]) + int(r["kudos_friendly"])
            complaints[k] = complaints.get(k, 0) + int(r["complaint"])
    rows = []
    for r in rd("couriers.csv"):
        v, k = vehicles[r["vehicle_id"]], r["courier_id"]
        rows.append({"courier_id": int(k), "vehicle_model": v["model"], "vehicle_made_year": int(v["made_year"]),
                     "days_since_service": (today - datetime.strptime(v["last_service_date"], "%Y-%m-%d").date()).days,
                     "age": int(r["age"]), "experience": 2024 - int(r["started_year"]),
                     "second_language": r["second_language"], "rating": float(r["rating"]), "tips_total": float(r["tips_total"]),
                     "number_of_declined": declined.get(k, 0), "number_of_kudos": kudos.get(k, 0),
                     "number_of_complaints": complaints.get(k, 0), "tier": r["tier"]})
    return {"collected.csv": pd.DataFrame(rows, columns=COLLECT_COLS)}


COLLECT_DESC = html(f"""
<p>The company wants one table with a row for each courier, built from six files. The data was collected up to 30 June 2024. Treat 30 June 2024 as today when you compute a time feature.</p>
<h3>Files</h3>
<ul class="files">
<li><code>couriers.csv</code>: {cols("courier_id", "vehicle_id", "age", "started_year", "second_language", "rating", "tips_total", "tier")}. <code>tier</code> is <code>Standard</code> or <code>Priority</code>.</li>
<li><code>vehicles.csv</code>: {cols("vehicle_id", "model", "made_year", "last_service_date")}.</li>
{_deliveries_item(["delivery_id", "courier_id", "customer_id", "date", "status", "kudos_speed", "kudos_care", "kudos_friendly", "complaint"],
                  "The three kudos columns and <code>complaint</code> hold 0 or 1.")}
</ul>
<h3>Your task</h3>
<p>Save <code>collected.csv</code> in the task folder. It has one row for each courier in <code>couriers.csv</code>, in the same order, and these columns, in this order:</p>
{schema([
    ("courier_id", "int", "Courier identifier"),
    ("vehicle_model", "str", "Model of the courier's vehicle"),
    ("vehicle_made_year", "int", "Year the vehicle was made"),
    ("days_since_service", "int", "Days from the vehicle's last service to today"),
    ("age", "int", "Age of the courier"),
    ("experience", "int", "Years since the courier started: this year minus <code>started_year</code>"),
    ("second_language", "str", "Second language, or <code>no</code>"),
    ("rating", "float", "Average rating"),
    ("tips_total", "float", "Total tips received"),
    ("number_of_declined", "int", "Deliveries with the status <code>Declined by the courier</code>"),
    ("number_of_kudos", "int", "All kudos the courier received, of any kind"),
    ("number_of_complaints", "int", "Complaints the courier received"),
    ("tier", "str", "<code>Standard</code> or <code>Priority</code>")])}
<p>The three counts cover all four delivery files. A courier with no deliveries gets 0.</p>
""")

COLLECT_SOLUTION = code("""
    import pandas as pd

    couriers = pd.read_csv('couriers.csv')
    vehicles = pd.read_csv('vehicles.csv', parse_dates=['last_service_date'])
    deliveries = pd.concat([pd.read_csv(f'deliveries_{i}.csv') for i in range(1, 5)], ignore_index=True)
    today = pd.Timestamp('2024-06-30')

    # 1 Aggregate the deliveries to one row per courier
    deliveries['declined'] = (deliveries['status'] == 'Declined by the courier').astype(int)
    deliveries['kudos'] = deliveries[['kudos_speed', 'kudos_care', 'kudos_friendly']].sum(axis=1)
    agg = (deliveries.groupby('courier_id')
           .agg(number_of_declined=('declined', 'sum'),
                number_of_kudos=('kudos', 'sum'),
                number_of_complaints=('complaint', 'sum'))
           .reset_index())

    # 2 Time features, with 30 June 2024 as today
    vehicles['days_since_service'] = (today - vehicles['last_service_date']).dt.days
    couriers['experience'] = today.year - couriers['started_year']

    # 3 Left-join everything onto couriers, which keeps its rows and its order
    out = (couriers
           .merge(vehicles, on='vehicle_id', how='left')
           .merge(agg, on='courier_id', how='left'))
    assert len(out) == len(couriers)   # no rows lost or doubled

    # 4 Fix nulls, names, types, and column order
    counts = ['number_of_declined', 'number_of_kudos', 'number_of_complaints']
    out[counts] = out[counts].fillna(0).astype(int)
    out = out.rename(columns={'model': 'vehicle_model', 'made_year': 'vehicle_made_year'})
    cols = ['courier_id', 'vehicle_model', 'vehicle_made_year', 'days_since_service', 'age', 'experience',
            'second_language', 'rating', 'tips_total', 'number_of_declined', 'number_of_kudos',
            'number_of_complaints', 'tier']
    out[cols].to_csv('collected.csv', index=False)
""")

C_INT = "Count, year, and ID columns are whole numbers"
C_DAYS = "days_since_service counts the days up to 30 June 2024"
C_EXP = "experience is 2024 minus started_year"
C_DECL = "number_of_declined counts the deliveries the courier declined, in all four files"
C_KUDOS = "number_of_kudos adds the three kudos columns, in all four files"
C_COMPL = "number_of_complaints adds the complaints, in all four files"
C_ORDER = "Rows are in the order of couriers.csv"

COLLECT_GRADER = code(f"""
    import numpy as np
    import pandas as pd

    COLS = {COLLECT_COLS!r}
    INT, DAYS, EXP = {C_INT!r}, {C_DAYS!r}, {C_EXP!r}
    DECL, KUDOS, COMPL, ORDER = {C_DECL!r}, {C_KUDOS!r}, {C_COMPL!r}, {C_ORDER!r}


    def grade(c):
        c.plan('collected.csv is saved in the task folder',
               'collected.csv has no index column',
               'Columns match the spec, in order',
               'One row per courier',
               INT,
               ('vehicle_model and vehicle_made_year come from vehicles.csv', True),
               (DAYS, True),
               (EXP, True),
               (DECL, True),
               (KUDOS, True),
               (COMPL, True),
               ('The courier columns are unchanged', True),
               ORDER)
        raw = c.output('collected.csv')
        if raw is None:
            return
        if not c.columns('Columns match the spec, in order', raw, COLS):
            return
        exp = c.expected('collected.csv')
        got = c.rows('One row per courier', raw, exp, 'courier_id', what='courier',
                     fewer='An inner join drops couriers who have no deliveries. Left-join onto couriers.',
                     more='Aggregate the deliveries to one row per courier, then left-join onto couriers. Some deliveries belong to couriers who are no longer listed.')
        if got is None:
            return
        c.integers(INT, got, ['courier_id', 'vehicle_made_year', 'days_since_service', 'age', 'experience',
                              'number_of_declined', 'number_of_kudos', 'number_of_complaints'])
        pairs = [('collected.csv', got, exp)]
        k = 'courier_id'
        c.values('vehicle_model and vehicle_made_year come from vehicles.csv', pairs, ['vehicle_model', 'vehicle_made_year'], key=k,
                 hint='Join vehicles.csv on vehicle_id, then rename model and made_year.')
        c.values(DAYS, pairs, ['days_since_service'], key=k,
                 hint="(pd.Timestamp('2024-06-30') - last_service_date).dt.days")
        c.values(EXP, pairs, ['experience'], key=k, hint='Today is 30 June 2024, so this year is 2024.')
        c.values(DECL, pairs, ['number_of_declined'], key=k,
                 hint='Count the rows where status is Declined by the courier. Couriers with none get 0.')
        c.values(KUDOS, pairs, ['number_of_kudos'], key=k,
                 hint='Add kudos_speed, kudos_care, and kudos_friendly over every delivery of the courier.')
        c.values(COMPL, pairs, ['number_of_complaints'], key=k, hint='Sum the complaint column per courier.')
        c.values('The courier columns are unchanged', pairs, ['age', 'second_language', 'rating', 'tips_total', 'tier'], key=k)
        c.order(ORDER, raw, exp, 'courier_id', hint='Left joins onto couriers.csv keep its order. Leave the result unsorted.')
""")


def _collect_variant(files="range(1, 5)", declined="deliveries['status'] == 'Declined by the courier'",
                     kudos="deliveries[['kudos_speed', 'kudos_care', 'kudos_friendly']].sum(axis=1)", how="left", fill=True,
                     today="pd.Timestamp('2024-06-30')", index=", index=False", order=""):
    return code(f"""
import pandas as pd
couriers = pd.read_csv('couriers.csv'); vehicles = pd.read_csv('vehicles.csv', parse_dates=['last_service_date'])
deliveries = pd.concat([pd.read_csv(f'deliveries_{{i}}.csv') for i in {files}], ignore_index=True)
today = {today}
deliveries['declined'] = ({declined}).astype(int)
deliveries['kudos'] = {kudos}
agg = deliveries.groupby('courier_id').agg(number_of_declined=('declined', 'sum'), number_of_kudos=('kudos', 'sum'), number_of_complaints=('complaint', 'sum')).reset_index()
vehicles['days_since_service'] = (today - vehicles['last_service_date']).dt.days
couriers['experience'] = today.year - couriers['started_year']
out = couriers.merge(vehicles, on='vehicle_id', how='left').merge(agg, on='courier_id', how='{how}')
counts = ['number_of_declined', 'number_of_kudos', 'number_of_complaints']
{"out[counts] = out[counts].fillna(0).astype(int)" if fill else ""}
out = out.rename(columns={{'model': 'vehicle_model', 'made_year': 'vehicle_made_year'}}){order}
cols = ['courier_id', 'vehicle_model', 'vehicle_made_year', 'days_since_service', 'age', 'experience', 'second_language',
        'rating', 'tips_total', 'number_of_declined', 'number_of_kudos', 'number_of_complaints', 'tier']
out[cols].to_csv('collected.csv'{index})
""")


H_KUDOS = "A delivery can get up to three kudos, one in each kudos column. Add all three columns."
COLLECT_VARIANTS = [
    dict(name="one_file", hint="You read one of the four delivery files. Stack all four with pd.concat before you aggregate.",
         code=_collect_variant(files="range(1, 2)"), fails=[C_DECL, C_KUDOS, C_COMPL]),
    dict(name="no_fill", hint="A courier with no deliveries has no match after the left join. Fill the three counts with 0, then cast them to int.",
         code=_collect_variant(fill=False), fails=[C_INT, C_DECL, C_KUDOS, C_COMPL]),
    dict(name="all_not_delivered", hint="You counted every delivery that was not delivered. A cancellation by the customer is not a decline.",
         code=_collect_variant(declined="deliveries['status'] != 'Delivered'"), fails=[C_DECL]),
    dict(name="kudos_one_column", hint=H_KUDOS, code=_collect_variant(kudos="deliveries['kudos_speed']"), fails=[C_KUDOS]),
    dict(name="kudos_any", hint=H_KUDOS,
         code=_collect_variant(kudos="(deliveries[['kudos_speed', 'kudos_care', 'kudos_friendly']].sum(axis=1) > 0).astype(int)"),
         fails=[C_KUDOS]),
    dict(name="inner_join", hint="", code=_collect_variant(how="inner"), fails=["One row per courier"]),
    dict(name="outer_join", hint="", code=_collect_variant(how="outer"), fails=["One row per courier"]),
    dict(name="clock_today", hint="", code=_collect_variant(today="pd.Timestamp.now().normalize()"), fails=[C_DAYS, C_EXP]),
    dict(name="index_saved", hint="", code=_collect_variant(index=""), fails=["collected.csv has no index column"]),
    dict(name="reordered", hint="", code=_collect_variant(order=".sort_values('rating', kind='stable')"), fails=[C_ORDER]),
]


# ================================================================ task 3: processing
def oracle_process(inputs):
    tr, te = read_csv_text(inputs["data/train.csv"]), read_csv_text(inputs["data/test.csv"])
    a, b = processed(tr, [tr, te])
    return {"processed_train.csv": a, "processed_test.csv": b}


PROCESS_DESC = html(f"""
<p>This dataset has the format of the table you built in the collection task. The values are different, so you can't reuse your earlier answer. It is split into a train set (70%) and a test set (30%).</p>
<h3>Files</h3>
{file_list(("data/train.csv", COLLECT_COLS), ("data/test.csv", ["the same columns"]))}
<h3>Your task</h3>
<ol>
  <li>Fill the missing values in <code>age</code> with the mean age of the train set, rounded to a whole number, so that <code>age</code> stays an integer column.</li>
  <li>Replace <code>vehicle_model</code> and <code>second_language</code> with integer codes. Sort the values found in the train set alphabetically and number them from 0. A value that the train set never saw gets -1.</li>
  <li>Standardize <code>tips_total</code>: subtract the train mean, then divide by the train standard deviation in its population form, as <code>StandardScaler</code> does. Round the result to 5 decimals.</li>
  <li>Replace <code>tier</code> with a number: <code>Standard</code> becomes 0 and <code>Priority</code> becomes 1.</li>
</ol>
<p>Don't let information from the test set leak into the train set. Keep every row, the row order, and the column order. Save the results in the task folder as <code>processed_train.csv</code> and <code>processed_test.csv</code>.</p>
""")

PROCESS_SOLUTION = code("""
    import pandas as pd
    from sklearn.preprocessing import OrdinalEncoder, StandardScaler

    train = pd.read_csv('data/train.csv')
    test = pd.read_csv('data/test.csv')

    # 1 Impute: one number, learned on train, used for both files
    age_fill = round(train['age'].mean())
    for df in (train, test):
        df['age'] = df['age'].fillna(age_fill).astype(int)

    # 2 Integer codes: fit on train, transform both, -1 for a value train never saw
    cat = ['vehicle_model', 'second_language']
    enc = OrdinalEncoder(handle_unknown='use_encoded_value', unknown_value=-1)
    train[cat] = enc.fit_transform(train[cat]).astype(int)
    test[cat] = enc.transform(test[cat]).astype(int)

    # 3 Standard scale: fit on train, transform both
    num = ['tips_total']
    sc = StandardScaler()
    train[num] = sc.fit_transform(train[num]).round(5)
    test[num] = sc.transform(test[num]).round(5)

    # 4 Map the target by hand: an alphabetical encoder would put Priority first
    for df in (train, test):
        df['tier'] = df['tier'].map({'Standard': 0, 'Priority': 1})

    train.to_csv('processed_train.csv', index=False)
    test.to_csv('processed_test.csv', index=False)
""")

P_INT = "age, vehicle_model, second_language, and tier hold whole numbers"
P_AGE = "age is filled with the rounded train mean"
P_ENC = "vehicle_model and second_language are coded in the alphabetical order of train, with -1 for unseen values"
P_TIPS = "tips_total is standardized with train statistics and rounded to 5 decimals"
P_TIER = "tier is 0 for Standard and 1 for Priority"

PROCESS_GRADER = code(f"""
    import numpy as np
    import pandas as pd

    FILES = ['processed_train.csv', 'processed_test.csv']
    INT, AGE, ENC = {P_INT!r}, {P_AGE!r}, {P_ENC!r}
    TIPS, TIER = {P_TIPS!r}, {P_TIER!r}


    def grade(c):
        c.plan('processed_train.csv is saved in the task folder',
               'processed_train.csv has no index column',
               'processed_test.csv is saved in the task folder',
               'processed_test.csv has no index column',
               'Columns are unchanged, in order',
               'Rows and row order are unchanged',
               INT,
               (AGE, True),
               (ENC, True),
               (TIPS, True),
               (TIER, True),
               ('The other columns are untouched', True))
        pairs = c.frames(FILES, 'Columns are unchanged, in order', 'Rows and row order are unchanged', 'courier_id')
        if pairs is None:
            return
        bad = [f'{{rel}}: {{col}} is {{got[col].dtype}}' for rel, got, _ in pairs
               for col in ['age', 'vehicle_model', 'second_language', 'tier'] if not pd.api.types.is_integer_dtype(got[col])]
        c.check(INT, not bad, 'These columns should hold whole numbers. ' + '. '.join(bad) + '.',
                'A float column is saved as 41.0 or 2.0, and a missing value turns a column into floats. Fill or map first, then cast with astype(int).')
        k = 'courier_id'
        c.values(AGE, pairs, ['age'], key=k,
                 hint='Take the mean age of train, round it to a whole number, and fill train and test with that one number.')
        c.values(ENC, pairs, ['vehicle_model', 'second_language'], key=k,
                 hint='Sort the values found in train, number them from 0, and map both files with that one table. A value that train never saw gets -1.')
        c.values(TIPS, pairs, ['tips_total'], key=k, decimals={{'tips_total': 5}},
                 hint='Subtract the train mean, divide by the train standard deviation with ddof=0, then round to 5 decimals.')
        c.values(TIER, pairs, ['tier'], key=k, hint='Map the two names by hand: Standard to 0 and Priority to 1.')
        c.values('The other columns are untouched', pairs,
                 ['courier_id', 'vehicle_made_year', 'days_since_service', 'experience', 'rating',
                  'number_of_declined', 'number_of_kudos', 'number_of_complaints'], key=k,
                 hint='Transform only the columns the task names.')
""")


def _process_variant(age_tr="round(train['age'].mean())", age_te="round(train['age'].mean())", src_tr="train", src_te="train",
                     ddof=0, unknown=".fillna(-1)", cast_age=".astype(int)", cast_codes=".astype(int)",
                     tier="{'Standard': 0, 'Priority': 1}", rounding=".round(5)"):
    return code(f"""
import pandas as pd
train = pd.read_csv('data/train.csv'); test = pd.read_csv('data/test.csv')
both = pd.concat([train, test])
fill_tr = {age_tr}; fill_te = {age_te}
def codes(df, col):
    return {{v: i for i, v in enumerate(sorted(df[col].unique()))}}
def scaled(df, src):
    return ((df['tips_total'] - src['tips_total'].mean()) / src['tips_total'].std(ddof={ddof})){rounding}
maps_tr = {{c: codes({src_tr}, c) for c in ['vehicle_model', 'second_language']}}
maps_te = {{c: codes({src_te}, c) for c in ['vehicle_model', 'second_language']}}
tips_tr = scaled(train, {src_tr}); tips_te = scaled(test, {src_te})
for df, fill, maps, tips in ((train, fill_tr, maps_tr, tips_tr), (test, fill_te, maps_te, tips_te)):
    df['age'] = df['age'].fillna(fill){cast_age}
    for c, m in maps.items():
        df[c] = df[c].map(m){unknown}{cast_codes}
    df['tips_total'] = tips
    df['tier'] = df['tier'].map({tier})
train.to_csv('processed_train.csv', index=False); test.to_csv('processed_test.csv', index=False)
""")


PROCESS_VARIANTS = [
    dict(name="leak_test_stats",
         hint="The test set is transformed with its own statistics. Learn each statistic on train and apply that same number to test.",
         code=_process_variant(age_te="round(test['age'].mean())", src_te="test"), fails=[P_AGE, P_ENC, P_TIPS]),
    dict(name="fit_on_all",
         hint="The statistic comes from train and test together, which leaks test data. Fit on train only.",
         code=_process_variant(age_tr="round(both['age'].mean())", age_te="round(both['age'].mean())", src_tr="both", src_te="both"),
         fails=[P_AGE, P_ENC, P_TIPS]),
    dict(name="pandas_std",
         hint="You divided by the sample standard deviation. pandas .std() uses ddof=1; StandardScaler uses ddof=0.",
         code=_process_variant(ddof=1), fails=[P_TIPS]),
    dict(name="raw_mean",
         hint="You filled with the exact mean. Round it to a whole number first, so that age stays an integer column.",
         code=_process_variant(age_tr="train['age'].mean()", age_te="train['age'].mean()", cast_age=""), fails=[P_INT, P_AGE]),
    dict(name="unknown_missing",
         hint="A value that train never saw has no code after the mapping, so it is missing. Give it -1, then cast to int.",
         code=_process_variant(unknown="", cast_codes=""), fails=[P_INT, P_ENC]),
    dict(name="tier_alphabetical",
         hint="tier is coded the other way round. An alphabetical encoder puts Priority first; the task wants Standard as 0 and Priority as 1.",
         code=_process_variant(tier="{'Priority': 0, 'Standard': 1}"), fails=[P_TIER]),
    dict(name="no_round", hint="The numbers are right. Round tips_total to 5 decimals.",
         code=_process_variant(rounding=""), fails=[P_TIPS]),
    dict(name="float_codes", hint="", code=_process_variant(cast_codes=".astype(float)"), fails=[P_INT]),
]


# ================================================================ task 4: the model
M_PREC = f"Precision on the hidden test labels is at least {P_BAR:.2f}"
M_REC = f"Recall on the hidden test labels is at least {R_BAR:.2f}"

MODEL_DESC = html(f"""
<p>This dataset has the format of the files you saved in the processing task. The values are different.</p>
<p>The data is split three ways: a train set with 70% of the rows, a validation set with 15%, and a test set with 15%. The test set has no <code>tier</code> column. It is used to score your model on unseen data.</p>
<h3>Files</h3>
{file_list(("data/train.csv", COLLECT_COLS), ("data/val.csv", ["the same columns"]),
           ("data/test.csv", ["the same columns without <code>tier</code>"]))}
<h3>Your task</h3>
<p>Predict <code>tier</code> for every courier in <code>data/test.csv</code>: 0 for Standard and 1 for Priority. This is a free-form task: use any model and any of pandas, NumPy, and scikit-learn.</p>
<p>Priority is the positive class. The company would rather look at a few Standard couriers by mistake than miss a Priority one, so your goal is to maximize recall while precision stays reasonably high. The bar on the test set is a recall of at least {R_BAR:.2f} with a precision of at least {P_BAR:.2f}.</p>
<p>Save your predictions in the task folder as <code>predictions.csv</code>, one row per test row in the same order, with this format:</p>
<pre class="sample">tier
0
1
1
0</pre>
""")

MODEL_SOLUTION = code(f"""
    import numpy as np
    import pandas as pd
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import precision_score, recall_score
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    # 1 Load, name the target, list the features
    train = pd.read_csv('data/train.csv')
    val = pd.read_csv('data/val.csv')
    test = pd.read_csv('data/test.csv')
    target = 'tier'
    feats = [c for c in test.columns if c != 'courier_id']
    FLOOR, MARGIN = {P_BAR}, 0.04      # the precision bar, and a cushion for the gap between validation and test


    def lowest_threshold(y, proba, floor):
        \"\"\"Recall falls as the threshold rises, so the lowest threshold that clears the floor gives the best recall.\"\"\"
        for t in np.arange(0.05, 0.95, 0.01):
            pred = (proba >= t).astype(int)
            if precision_score(y, pred, zero_division=0) >= floor:
                return t, recall_score(y, pred)
        return 0.5, 0.0


    # 2 Two model families, each with its own threshold, compared by recall on validation
    models = {{
        'logit': make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)),
        'boost': HistGradientBoostingClassifier(random_state=42)}}
    best = None
    for name, model in models.items():
        model.fit(train[feats], train[target])
        t, rec = lowest_threshold(val[target], model.predict_proba(val[feats])[:, 1], FLOOR + MARGIN)
        print(f'{{name}}: threshold {{t:.2f}}, validation recall {{rec:.3f}}')
        if best is None or rec > best[2]:
            best = (model, t, rec)

    # 3 Predict test with the winner and its threshold. No refit: the threshold belongs to this fitted model.
    model, t, _ = best
    pred = (model.predict_proba(test[feats])[:, 1] >= t).astype(int)
    pd.DataFrame({{'tier': pred}}).to_csv('predictions.csv', index=False)
""")

MODEL_GRADER = code(f"""
    import numpy as np
    import pandas as pd

    P_BAR, R_BAR = {P_BAR}, {R_BAR}
    PREC, REC = {M_PREC!r}, {M_REC!r}


    def grade(c):
        c.plan('predictions.csv is saved in the task folder',
               'predictions.csv has no index column',
               'One column, named tier',
               'One prediction per test row',
               'Every prediction is 0 or 1',
               (PREC, True),
               (REC, True))
        got = c.output('predictions.csv')
        if got is None:
            return
        if not c.check('One column, named tier', list(got.columns) == ['tier'],
                       'Found these columns: ' + ', '.join(map(str, got.columns)) + '.',
                       'Save a DataFrame that holds only the tier column.'):
            return
        truth = c.secret('truth.csv')
        if not c.check('One prediction per test row', len(got) == len(truth),
                       f'test.csv has {{len(truth):,}} rows and predictions.csv has {{len(got):,}}.',
                       'Predict on data/test.csv and keep its row order.'):
            return
        p = pd.to_numeric(got['tier'], errors='coerce')
        if not c.check('Every prediction is 0 or 1', bool(p.isin([0, 1]).all()),
                       'Some values are not 0 or 1.',
                       'Save labels, not probabilities or names: (proba >= threshold).astype(int).'):
            return
        y = truth['tier'].to_numpy()
        pred = p.to_numpy().astype(int)
        tp = int(((pred == 1) & (y == 1)).sum())
        marked = int(pred.sum())
        precision = tp / marked if marked else 0.0
        recall = tp / int(y.sum())
        c.note(f'Precision {{precision:.3f}} (bar {{P_BAR:.2f}}). Recall {{recall:.3f}} (bar {{R_BAR:.2f}}). You marked {{marked:,}} of {{len(y):,}} couriers as Priority.')
        c.check(PREC, precision >= P_BAR,
                f'Precision is {{precision:.3f}}.' if marked else 'No courier is marked as Priority, so precision is 0.',
                'The threshold is too low, or the model is too weak. Raise the threshold until precision on val.csv is a few points above the bar.')
        c.check(REC, recall >= R_BAR, f'Recall is {{recall:.3f}}.',
                'Lower the decision threshold. Scan thresholds on val.csv and keep the lowest one whose precision stays a few points above the bar.')
""")

_MODEL_HEAD = """
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
train = pd.read_csv('data/train.csv'); val = pd.read_csv('data/val.csv'); test = pd.read_csv('data/test.csv')
f = [c for c in test.columns if c != 'courier_id']
m = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)).fit(train[f], train['tier'])
proba = m.predict_proba(test[f])[:, 1]
"""
MODEL_VARIANTS = [
    dict(name="default_threshold", hint="", fails=[M_REC],
         code=code(_MODEL_HEAD + "pd.DataFrame({'tier': m.predict(test[f])}).to_csv('predictions.csv', index=False)\n")),
    dict(name="forest_default", hint="", fails=[M_REC], code=code("""
        import pandas as pd
        from sklearn.ensemble import RandomForestClassifier
        train = pd.read_csv('data/train.csv'); test = pd.read_csv('data/test.csv')
        f = [c for c in test.columns if c != 'courier_id']
        m = RandomForestClassifier(n_estimators=100, random_state=0).fit(train[f], train['tier'])
        pd.DataFrame({'tier': m.predict(test[f])}).to_csv('predictions.csv', index=False)
    """)),
    dict(name="too_low", hint="", fails=[M_PREC],
         code=code(_MODEL_HEAD + "pd.DataFrame({'tier': (proba >= 0.08).astype(int)}).to_csv('predictions.csv', index=False)\n")),
    dict(name="all_ones", hint="", fails=[M_PREC], code=code("""
        import pandas as pd
        test = pd.read_csv('data/test.csv')
        pd.DataFrame({'tier': [1] * len(test)}).to_csv('predictions.csv', index=False)
    """)),
    dict(name="probabilities", hint="", fails=["Every prediction is 0 or 1"],
         code=code(_MODEL_HEAD + "pd.DataFrame({'tier': proba}).to_csv('predictions.csv', index=False)\n")),
    dict(name="names", hint="", fails=["Every prediction is 0 or 1"],
         code=code(_MODEL_HEAD + "pd.DataFrame({'tier': ['Priority' if p >= 0.3 else 'Standard' for p in proba]}).to_csv('predictions.csv', index=False)\n")),
    dict(name="wrong_column", hint="", fails=["One column, named tier"],
         code=code(_MODEL_HEAD + "pd.DataFrame({'courier_id': test['courier_id'], 'tier': (proba >= 0.3).astype(int)}).to_csv('predictions.csv', index=False)\n")),
    dict(name="val_rows", hint="", fails=["One prediction per test row"], code=code("""
        import pandas as pd
        val = pd.read_csv('data/val.csv')
        pd.DataFrame({'tier': val['tier']}).iloc[:-3].to_csv('predictions.csv', index=False)
    """)),
]

MODEL_NOTES = ("<p>The threshold is chosen on the validation set, never on the test set, and it aims a few points above the precision bar. "
               "With about 400 couriers marked as Priority, precision moves by 2 to 3 points from one sample to the next, so a threshold "
               "that only just clears the bar on validation can miss it on test.</p>"
               "<p>class_weight='balanced' is a second lever: it raises recall at the default threshold. Measure precision and recall on the "
               "validation set either way.</p>"
               "<p>Two habits for the real platform. Reports of this question type mention a limit of a few seconds for each run, so a model "
               "that trains in a second or two is the safer choice. The task text can leave the exact precision level to the unit tests, "
               "so open the test file in the file tree and read the number before you tune.</p>")


def exercises():
    analyze_inputs = make_analyze()
    model_inputs, model_hidden = make_model()
    return [
        dict(id="m3-analyze", module=3, title="Summarize the delivery data", story="Couriers", minutes=10,
             inputs=analyze_inputs, outputs=["analysis_results.csv"], hidden={"known.json": json.dumps(analyze_known(analyze_inputs))},
             expect=["analysis_results.csv"], align="insight_type",
             desc=ANALYZE_DESC, starter="import pandas as pd\n\n", solution=ANALYZE_SOLUTION, grader=ANALYZE_GRADER,
             hints=["Read the four delivery files in a loop and stack them with pd.concat. Every number about deliveries comes from the stacked table.",
                    "A share is the mean of a true-or-false column, times 100. For the busiest courier, keep the Delivered rows, count them per courier_id, and take the largest count.",
                    "Collect the four numbers in a dict, then build the table with pd.DataFrame({'insight_type': list(results), 'value': list(results.values())}). Round value to 2 decimals and save with index=False."],
             variants=ANALYZE_VARIANTS, oracle=oracle_analyze, oracle_decimals={"value": 2}),
        dict(id="m3-collect", module=3, title="Collect the courier data", story="Couriers", minutes=22,
             inputs=make_collect(), outputs=["collected.csv"], hidden={}, expect=["collected.csv"], align="courier_id",
             desc=COLLECT_DESC, starter="import pandas as pd\n\n", solution=COLLECT_SOLUTION, grader=COLLECT_GRADER,
             hints=["Stack the four delivery files first. Then build one table with a row per courier and the three counts, and left-join it and vehicles.csv onto couriers.csv.",
                    "For the kudos, add the three kudos columns in each delivery, then sum per courier. For the declined count, sum a true-or-false column that marks the status Declined by the courier.",
                    "Today is pd.Timestamp('2024-06-30'). days_since_service is (today - last_service_date).dt.days, and experience is 2024 minus started_year. Fill the three counts with 0 and cast them to int."],
             variants=COLLECT_VARIANTS, oracle=oracle_collect),
        dict(id="m3-process", module=4, title="Process the courier table", story="Couriers", minutes=15,
             inputs=make_process(), outputs=["processed_train.csv", "processed_test.csv"], hidden={},
             expect=["processed_train.csv", "processed_test.csv"], align=None,
             desc=PROCESS_DESC, starter="import pandas as pd\n\n", solution=PROCESS_SOLUTION, grader=PROCESS_GRADER,
             hints=["Every statistic comes from train: the mean age, the sorted category values, and the mean and standard deviation of tips_total.",
                    "OrdinalEncoder(handle_unknown='use_encoded_value', unknown_value=-1) fitted on train gives -1 for a value it never saw. In pandas, map a dict built from train, then fillna(-1).",
                    "Cast age and the codes to int before you save. StandardScaler divides by the population standard deviation, which is .std(ddof=0) in pandas."],
             variants=PROCESS_VARIANTS, oracle=oracle_process, oracle_decimals={"tips_total": 5}),
        dict(id="m3-model", module=5, title="Predict the Priority tier", story="Couriers", minutes=23,
             inputs=model_inputs, outputs=["predictions.csv"], hidden=model_hidden, expect=[], align=None,
             desc=MODEL_DESC, starter="import pandas as pd\n\n", solution=MODEL_SOLUTION, grader=MODEL_GRADER,
             hints=["Save a valid predictions.csv from a quick model first. Then measure precision and recall on val.csv.",
                    "model.predict uses a threshold of 0.5, which favors precision here. Take predict_proba(X)[:, 1] and lower the threshold to trade precision for recall.",
                    "Scan thresholds on val.csv and keep the lowest one whose precision is a few points above the bar. The few points cover the gap between validation and test."],
             variants=MODEL_VARIANTS, oracle=None, notes=MODEL_NOTES),
    ]
