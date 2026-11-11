"""Story 1: houses. The three tasks from the practice kit (collect, process, model)."""
import csv
import io
from datetime import date, datetime

import numpy as np
import pandas as pd

from common import code, cols, csv_text, file_list, html, schema

LEVELS = ["poor", "fair", "average", "good", "excellent"]          # true quality order
ALPHA = {v: i for i, v in enumerate(sorted(LEVELS))}                 # scikit-learn's default order
COLS = ["house_id", "bedrooms", "bathrooms", "sqft_living", "sqft_lot", "floors",
        "waterfront", "age", "num_views", "condition_name", "price"]


def _houses(n, rng, start_id=1):
    return pd.DataFrame({
        "house_id": np.arange(start_id, start_id + n),
        "bedrooms": rng.integers(1, 7, n),
        "bathrooms": rng.integers(1, 5, n),
        "sqft_living": rng.integers(450, 4500, n),
        "sqft_lot": rng.integers(900, 22000, n),
        "floors": rng.choice([1, 1.5, 2, 2.5, 3], n),
        "waterfront": rng.choice([0, 1], n, p=[0.88, 0.12]),
        "condition_id": rng.integers(1, 6, n),
        "age": rng.integers(0, 95, n)})


def _price(h, rng):
    q = h["condition_id"] - 1
    p = (60000 + 160 * h.sqft_living + 2.5 * h.sqft_lot + 18000 * h.bedrooms + 9000 * h.bathrooms
         + h.waterfront * (120000 + 60 * h.sqft_living) + 20000 * q - 900 * h.age + 6 * (h.age - 45) ** 2
         + rng.normal(0, 25000, len(h)))
    return p.round().astype(int)


def _collected_like(n, rng, start_id):
    conds = dict(zip(range(1, 6), LEVELS))
    h = _houses(n, rng, start_id)
    out = h.drop(columns="condition_id").copy()
    out["num_views"] = rng.poisson(3.5, n)
    out["condition_name"] = h.condition_id.map(conds)
    out["price"] = _price(h, rng)
    return out


def make():
    # ---------------- task 1: raw files ----------------
    rng = np.random.default_rng(20261111)
    n = 1500
    houses = _houses(n, rng)
    conds = pd.DataFrame({"condition_id": [1, 2, 3, 4, 5], "condition": LEVELS})
    viewers = pd.DataFrame({
        "viewer_id": np.arange(1, 801),
        "first_name": rng.choice(["Ana", "Ben", "Chen", "Dev", "Eli", "Fay"], 800),
        "last_name": rng.choice(["Lim", "Tan", "Ng", "Lee", "Wong", "Goh"], 800),
        "email": [f"viewer{i}@example.com" for i in range(1, 801)],
        "registration_date": (pd.Timestamp("2021-01-01")
                              + pd.to_timedelta(rng.integers(0, 800, 800), unit="D")).strftime("%Y-%m-%d")})
    m = 18000
    minutes = rng.integers(0, 105 * 24 * 60, m)                       # 1 Jan 00:00 to 15 Apr 23:59
    dates = pd.Timestamp("2023-01-01") + pd.to_timedelta(minutes, unit="m")
    views = pd.DataFrame({"view_id": np.arange(1, m + 1),
                          "house_id": rng.integers(1, n - 120, m),    # the last 120 houses have no views
                          "view_date": dates.strftime("%Y-%m-%d %H:%M:%S"),
                          "viewer_id": rng.integers(1, 801, m)})
    edge = pd.DataFrame({"view_id": np.arange(m + 1, m + 9),          # boundary cases
                         "house_id": [1, 1, 2, 2, 3, 3, 4, 99999],
                         "view_date": ["2023-03-15 23:59:59", "2023-03-16 00:00:00", "2023-04-15 23:59:59",
                                       "2023-04-15 00:00:00", "2023-04-15 12:30:00", "2023-03-16 08:00:00",
                                       "2023-03-15 12:00:00", "2023-04-01 10:00:00"],
                         "viewer_id": [1, 2, 3, 4, 5, 6, 7, 8]})
    views = pd.concat([views, edge], ignore_index=True).sample(frac=1, random_state=1).reset_index(drop=True)
    prices = pd.DataFrame({"house_id": houses.house_id, "price": _price(houses, rng)}).sample(frac=1, random_state=2)
    collect_inputs = {
        "houses.csv": csv_text(houses), "house_conditions.csv": csv_text(conds),
        "house_views.csv": csv_text(views), "house_viewers.csv": csv_text(viewers),
        "house_prices.csv": csv_text(prices)}

    # ---------------- task 2: one collected-style table, split 70/30 ----------------
    rng = np.random.default_rng(42001)
    t4 = _collected_like(1400, rng, 5001)
    t4["age"] = t4["age"].astype(float)
    t4.loc[rng.choice(len(t4), 120, replace=False), "age"] = np.nan
    idx = rng.permutation(len(t4))
    cut = int(0.7 * len(t4))
    process_inputs = {"data/train.csv": csv_text(t4.iloc[idx[:cut]]), "data/test.csv": csv_text(t4.iloc[idx[cut:]])}

    # ---------------- task 3: processed table, split 70/15/15 ----------------
    rng = np.random.default_rng(42002)
    t5 = _collected_like(2400, rng, 9001)
    t5["condition_name"] = t5["condition_name"].map(ALPHA).astype(float)
    idx = rng.permutation(len(t5))
    a, b = int(0.70 * len(t5)), int(0.85 * len(t5))
    tr, va, te = t5.iloc[idx[:a]].copy(), t5.iloc[idx[a:b]].copy(), t5.iloc[idx[b:]].copy()
    for c in ["sqft_living", "sqft_lot"]:
        mu, sd = tr[c].mean(), tr[c].std(ddof=0)
        for f in (tr, va, te):
            f[c] = (f[c] - mu) / sd
    model_inputs = {"train.csv": csv_text(tr), "val.csv": csv_text(va), "test.csv": csv_text(te.drop(columns="price"))}
    base = float(np.abs(tr.price.median() - te.price.to_numpy()).mean())
    model_hidden = {"truth.csv": csv_text(te[["house_id", "price"]]),
                    "meta.json": '{"baseline_mae": %.1f}' % base}
    return collect_inputs, process_inputs, model_inputs, model_hidden


# ---------------------------------------------------------------- oracles (independent re-implementations)
def oracle_collect(inputs):
    """Plain-Python version of task 1: no pandas joins or datetime parsing."""
    rd = lambda name: list(csv.DictReader(io.StringIO(inputs[name])))
    conds = {r["condition_id"]: r["condition"] for r in rd("house_conditions.csv")}
    prices = {r["house_id"]: int(r["price"]) for r in rd("house_prices.csv")}
    lo, hi = date(2023, 3, 16), date(2023, 4, 15)
    counts = {}
    for r in rd("house_views.csv"):
        day = datetime.strptime(r["view_date"], "%Y-%m-%d %H:%M:%S").date()
        if lo <= day <= hi:
            counts[r["house_id"]] = counts.get(r["house_id"], 0) + 1
    rows = []
    for r in rd("houses.csv"):
        rows.append({"house_id": int(r["house_id"]), "bedrooms": int(r["bedrooms"]), "bathrooms": int(r["bathrooms"]),
                     "sqft_living": int(r["sqft_living"]), "sqft_lot": int(r["sqft_lot"]), "floors": float(r["floors"]),
                     "waterfront": int(r["waterfront"]), "age": int(r["age"]),
                     "num_views": counts.get(r["house_id"], 0), "condition_name": conds[r["condition_id"]],
                     "price": prices[r["house_id"]]})
    return {"collected.csv": pd.DataFrame(rows, columns=COLS)}


def oracle_process(inputs):
    """pandas-only version of task 2: no scikit-learn."""
    tr = pd.read_csv(io.StringIO(inputs["data/train.csv"]))
    te = pd.read_csv(io.StringIO(inputs["data/test.csv"]))
    mean_age = tr["age"].sum() / tr["age"].count()
    levels = {v: float(i) for i, v in enumerate(sorted(set(tr["condition_name"])))}
    stats = {c: (tr[c].mean(), float(np.sqrt(((tr[c] - tr[c].mean()) ** 2).sum() / len(tr)))) for c in ("sqft_living", "sqft_lot")}
    out = {}
    for name, df in (("processed_train.csv", tr), ("processed_test.csv", te)):
        d = df.copy()
        d["age"] = d["age"].where(d["age"].notna(), mean_age)
        d["condition_name"] = d["condition_name"].map(levels)
        for c, (mu, sd) in stats.items():
            d[c] = (d[c] - mu) / sd
        out[name] = d
    return out


# ---------------------------------------------------------------- task 1
COLLECT_DESC = html(f"""
<p>An agency lists houses for sale and logs every online viewing. You have the raw files, with data up to 15 April 2023. Build one table with a row for each house.</p>
<h3>Files</h3>
{file_list(
    ("houses.csv", ["house_id", "bedrooms", "bathrooms", "sqft_living", "sqft_lot", "floors", "waterfront", "condition_id", "age"]),
    ("house_conditions.csv", ["condition_id", "condition"]),
    ("house_views.csv", ["view_id", "house_id", "view_date", "viewer_id"]),
    ("house_viewers.csv", ["viewer_id", "first_name", "last_name", "email", "registration_date"]),
    ("house_prices.csv", ["house_id", "price"]))}
<h3>Your task</h3>
<p>Save <code>collected.csv</code> in the task folder. It has one row per house in <code>houses.csv</code> and these columns, in this order:</p>
{schema([
    ("house_id", "int", "House identifier"),
    ("bedrooms", "int", "Number of bedrooms"),
    ("bathrooms", "int", "Number of bathrooms"),
    ("sqft_living", "int", "Living area"),
    ("sqft_lot", "int", "Lot area"),
    ("floors", "float", "Number of floors, for example 1.5"),
    ("waterfront", "int", "1 if the house faces the waterfront, otherwise 0"),
    ("age", "int", "Age of the house in years"),
    ("num_views", "int", "Views of the house in the last 30 days of the data: 16 March 2023 to 15 April 2023, both days included"),
    ("condition_name", "str", "Name of the condition, not its ID"),
    ("price", "int", "Price of the house")])}
<p>You can use pandas, NumPy, and scikit-learn.</p>
""")

COLLECT_SOLUTION = code("""
    import pandas as pd

    houses = pd.read_csv('houses.csv')
    conds = pd.read_csv('house_conditions.csv')
    prices = pd.read_csv('house_prices.csv')
    views = pd.read_csv('house_views.csv', parse_dates=['view_date'])

    # 1 Filter: 16 Mar to 15 Apr 2023, both days included
    d = views['view_date']
    recent = views[(d >= '2023-03-16') & (d < '2023-04-16')]

    # 2 Aggregate to one row per key
    n_views = recent.groupby('house_id').size().reset_index(name='num_views')

    # 3 Left-join everything onto the base table
    out = (houses
           .merge(n_views, on='house_id', how='left')
           .merge(conds, on='condition_id', how='left')
           .merge(prices, on='house_id', how='left'))
    assert len(out) == len(houses)   # no rows lost or doubled

    # 4 Fix nulls, names, types, and column order
    out['num_views'] = out['num_views'].fillna(0).astype(int)
    out = out.rename(columns={'condition': 'condition_name'})
    cols = ['house_id', 'bedrooms', 'bathrooms', 'sqft_living', 'sqft_lot', 'floors',
            'waterfront', 'age', 'num_views', 'condition_name', 'price']
    out[cols].to_csv('collected.csv', index=False)
""")

COLLECT_GRADER = code("""
    import numpy as np
    import pandas as pd

    COLS = ['house_id', 'bedrooms', 'bathrooms', 'sqft_living', 'sqft_lot', 'floors',
            'waterfront', 'age', 'num_views', 'condition_name', 'price']
    VIEWS = 'num_views counts 16 March to 15 April 2023, both days included'


    def grade(c):
        c.plan('collected.csv is saved in the task folder',
               'collected.csv has no index column',
               'Columns match the spec, in order',
               'One row per house',
               'Count and ID columns are whole numbers',
               (VIEWS, True),
               ('condition_name is the name, not the ID', True),
               ('price comes from house_prices.csv', True),
               ('The house columns are unchanged', True))
        got = c.output('collected.csv')
        if got is None:
            return
        if not c.columns('Columns match the spec, in order', got, COLS):
            return
        exp = c.expected('collected.csv')
        got = c.rows('One row per house', got, exp, 'house_id', what='house',
                     fewer='An inner join drops houses that have no views in the window. Left-join onto houses.',
                     more='Aggregate the views to one row per house before you join.')
        if got is None:
            return
        c.integers('Count and ID columns are whole numbers', got,
                   ['house_id', 'bedrooms', 'bathrooms', 'sqft_living', 'sqft_lot', 'waterfront', 'age', 'num_views', 'price'])
        pairs = [('collected.csv', got, exp)]
        c.values(VIEWS, pairs, ['num_views'], key='house_id',
                 hint='Count the views dated 16 March to 15 April 2023. Houses with none get 0.')
        c.values('condition_name is the name, not the ID', pairs, ['condition_name'], key='house_id',
                 hint='Join house_conditions.csv on condition_id, keep condition, and rename it.')
        c.values('price comes from house_prices.csv', pairs, ['price'], key='house_id')
        c.values('The house columns are unchanged', pairs,
                 ['bedrooms', 'bathrooms', 'sqft_living', 'sqft_lot', 'floors', 'waterfront', 'age'], key='house_id')
""")

_COLLECT_TAIL = """
out = out.rename(columns={'condition': 'condition_name'})
cols = ['house_id', 'bedrooms', 'bathrooms', 'sqft_living', 'sqft_lot', 'floors',
        'waterfront', 'age', 'num_views', 'condition_name', 'price']
out[cols].to_csv('collected.csv', index=False)
"""


def _collect_variant(mask, how="left", fill=True, tail=_COLLECT_TAIL):
    return code(f"""
import pandas as pd
houses = pd.read_csv('houses.csv'); conds = pd.read_csv('house_conditions.csv')
prices = pd.read_csv('house_prices.csv'); views = pd.read_csv('house_views.csv', parse_dates=['view_date'])
d = views['view_date']
recent = views[{mask}]
n_views = recent.groupby('house_id').size().reset_index(name='num_views')
out = houses.merge(n_views, on='house_id', how='{how}').merge(conds, on='condition_id', how='left').merge(prices, on='house_id', how='left')
{"out['num_views'] = out['num_views'].fillna(0).astype(int)" if fill else ""}
""") + tail.lstrip("\n")


GOOD_MASK = "(d >= '2023-03-16') & (d < '2023-04-16')"
VIEWS = "num_views counts 16 March to 15 April 2023, both days included"
COLLECT_VARIANTS = [
    dict(name="le_timestamp",
         hint="view_date holds a time of day. Comparing with <= '2023-04-15' stops at midnight and drops the rest of 15 April. Use < '2023-04-16', or compare dates.",
         code=_collect_variant("(d >= '2023-03-16') & (d <= '2023-04-15')"), fails=[VIEWS]),
    dict(name="all_time",
         hint="You counted views from every date. Filter to the 30-day window before you count.",
         code=_collect_variant("d.notna()"), fails=[VIEWS]),
    dict(name="late_start",
         hint="The window starts on 16 March. Check your start date.",
         code=_collect_variant("(d >= '2023-03-17') & (d < '2023-04-16')"), fails=[VIEWS]),
    dict(name="no_fill",
         hint="A house with no views in the window has no match after the left join, so its count is missing. Fill with 0, then cast to int.",
         code=_collect_variant(GOOD_MASK, fill=False), fails=["Count and ID columns are whole numbers", VIEWS]),
    dict(name="inner_join", hint="", code=_collect_variant(GOOD_MASK, how="inner"), fails=["One row per house"]),
    dict(name="index_saved", hint="",
         code=_collect_variant(GOOD_MASK, tail=_COLLECT_TAIL.replace(", index=False", "")),
         fails=["collected.csv has no index column"]),
    dict(name="id_as_name",
         hint="That column holds the condition ID. Join house_conditions.csv and keep the condition text.",
         code=_collect_variant(GOOD_MASK, tail="""
out = out.drop(columns='condition').rename(columns={'condition_id': 'condition_name'})
cols = ['house_id', 'bedrooms', 'bathrooms', 'sqft_living', 'sqft_lot', 'floors',
        'waterfront', 'age', 'num_views', 'condition_name', 'price']
out[cols].to_csv('collected.csv', index=False)
"""), fails=["condition_name is the name, not the ID"]),
]

# ---------------------------------------------------------------- task 2
PROCESS_DESC = html(f"""
<p>This dataset has the format of the table you built in the collection task. The values are different, so you can't reuse your earlier answer.</p>
<p>The data is split into a train set with 70% of the rows and a test set with the other 30%.</p>
<h3>Files</h3>
{file_list(
    ("data/train.csv", ["house_id", "bedrooms", "bathrooms", "sqft_living", "sqft_lot", "floors", "waterfront", "age", "num_views", "condition_name", "price"]),
    ("data/test.csv", ["the same columns"]))}
<h3>Your task</h3>
<p>Apply these steps with pandas, NumPy, or scikit-learn:</p>
<ol>
  <li>Fill the missing values in <code>age</code> with the mean age.</li>
  <li>Convert <code>condition_name</code> to numbers with ordinal encoding. Use scikit-learn's default order, which is alphabetical.</li>
  <li>Normalize <code>sqft_living</code> and <code>sqft_lot</code> with standard scaling.</li>
</ol>
<p>Don't let information from the test set leak into the train set. Keep every row, the row order, and the column order.</p>
<p>Save the results in the task folder as <code>processed_train.csv</code> and <code>processed_test.csv</code>.</p>
""")

PROCESS_SOLUTION = code("""
    import pandas as pd
    from sklearn.preprocessing import OrdinalEncoder, StandardScaler

    train = pd.read_csv('data/train.csv')
    test = pd.read_csv('data/test.csv')

    # 1 Impute: the statistic comes from train only
    age_mean = train['age'].mean()
    train['age'] = train['age'].fillna(age_mean)
    test['age'] = test['age'].fillna(age_mean)

    # 2 Ordinal encode: fit on train, transform both
    cat = ['condition_name']
    enc = OrdinalEncoder()      # alphabetical unless you say otherwise
    train[cat] = enc.fit_transform(train[cat])
    test[cat] = enc.transform(test[cat])

    # 3 Standard scale: fit on train, transform both
    num = ['sqft_living', 'sqft_lot']
    sc = StandardScaler()
    train[num] = sc.fit_transform(train[num])
    test[num] = sc.transform(test[num])

    # 4 Save both files
    train.to_csv('processed_train.csv', index=False)
    test.to_csv('processed_test.csv', index=False)
""")

PROCESS_GRADER = code("""
    import numpy as np
    import pandas as pd

    FILES = ['processed_train.csv', 'processed_test.csv']
    SCALE = 'sqft_living and sqft_lot are standard-scaled with train statistics'


    def grade(c):
        c.plan('processed_train.csv is saved in the task folder',
               'processed_train.csv has no index column',
               'processed_test.csv is saved in the task folder',
               'processed_test.csv has no index column',
               'Columns are unchanged, in order',
               'Rows and row order are unchanged',
               'age has no missing values',
               ('age is filled with the train mean', True),
               ('condition_name is ordinal-encoded in alphabetical order', True),
               (SCALE, True),
               ('The other columns are untouched', True))
        pairs = c.frames(FILES, 'Columns are unchanged, in order', 'Rows and row order are unchanged', 'house_id')
        if pairs is None:
            return
        left = sum(int(pd.to_numeric(got['age'], errors='coerce').isna().sum()) for _, got, _ in pairs)
        c.check('age has no missing values', left == 0, f'{left} values in age are still missing or not numeric.')
        c.values('age is filled with the train mean', pairs, ['age'], key='house_id',
                 hint='Compute the mean on train, then fill train and test with that one number.')
        c.values('condition_name is ordinal-encoded in alphabetical order', pairs, ['condition_name'], key='house_id',
                 hint='Alphabetical order: average 0, excellent 1, fair 2, good 3, poor 4.')
        c.values(SCALE, pairs, ['sqft_living', 'sqft_lot'], key='house_id',
                 hint='Fit the scaler on train, then transform train and test with it.')
        c.values('The other columns are untouched', pairs,
                 ['house_id', 'bedrooms', 'bathrooms', 'floors', 'waterfront', 'num_views', 'price'], key='house_id',
                 hint='Transform only the columns the task names.')
""")


def _process_variant(age_te="m", enc="sorted(train['condition_name'].unique())", stat_tr="train", stat_te="train", ddof=0):
    return code(f"""
import pandas as pd
train = pd.read_csv('data/train.csv'); test = pd.read_csv('data/test.csv')
both = pd.concat([train, test])
m = train['age'].mean(); mt = test['age'].mean(); mb = both['age'].mean()
levels = {{v: i for i, v in enumerate({enc})}}
stats = {{}}
for col in ['sqft_living', 'sqft_lot']:
    stats[col] = (({stat_tr})[col].mean(), ({stat_tr})[col].std(ddof={ddof}), ({stat_te})[col].mean(), ({stat_te})[col].std(ddof={ddof}))
train['age'] = train['age'].fillna({'mb' if age_te == 'mb' else 'm'}); test['age'] = test['age'].fillna({age_te})
for df in (train, test):
    df['condition_name'] = df['condition_name'].map(levels)
for col, (a, b, a2, b2) in stats.items():
    train[col] = (train[col] - a) / b
    test[col] = (test[col] - a2) / b2
train.to_csv('processed_train.csv', index=False); test.to_csv('processed_test.csv', index=False)
""")


SCALE = "sqft_living and sqft_lot are standard-scaled with train statistics"
PROCESS_VARIANTS = [
    dict(name="leak_test_stats",
         hint="The test set is transformed with its own statistics. Learn the statistic on train and apply that same number to test.",
         code=_process_variant(age_te="mt", stat_te="test"), fails=["age is filled with the train mean", SCALE]),
    dict(name="fit_on_all",
         hint="The statistic comes from train and test together, which leaks test data. Fit on train only.",
         code=_process_variant(age_te="mb", stat_tr="both", stat_te="both"), fails=["age is filled with the train mean", SCALE]),
    dict(name="pandas_std",
         hint="You divided by the sample standard deviation. pandas .std() uses ddof=1; StandardScaler uses ddof=0.",
         code=_process_variant(ddof=1), fails=[SCALE]),
    dict(name="quality_order",
         hint="You encoded by quality. The task asks for scikit-learn's default, which sorts the names alphabetically.",
         code=_process_variant(enc="['poor', 'fair', 'average', 'good', 'excellent']"),
         fails=["condition_name is ordinal-encoded in alphabetical order"]),
]

# ---------------------------------------------------------------- task 3
MODEL_BAR = 27000
MODEL_DESC = html(f"""
<p>This dataset has the format of the files you saved in the processing task. The values are different.</p>
<p>The data is split three ways: a train set with 70% of the rows, a validation set with 15%, and a test set with 15%. The test set has no prices. It is used to score your model on unseen data.</p>
<h3>Files</h3>
{file_list(
    ("train.csv", ["house_id", "bedrooms", "bathrooms", "sqft_living", "sqft_lot", "floors", "waterfront", "age", "num_views", "condition_name", "price"]),
    ("val.csv", ["the same columns"]),
    ("test.csv", ["the same columns without <code>price</code>"]))}
<h3>Your task</h3>
<p>Predict <code>price</code> for every house in <code>test.csv</code>. This is a free-form task: use any model and any of pandas, NumPy, and scikit-learn.</p>
<p>The metric is mean absolute error (MAE). The bar is an MAE below {MODEL_BAR:,} on the test set.</p>
<p>Save your predictions in the task folder as <code>predictions.csv</code>, one row per test row in the same order, with this format:</p>
<pre class="sample">price
123456.789
234567.89
345678.9</pre>
""")

MODEL_SOLUTION = code("""
    import pandas as pd
    from sklearn.linear_model import Ridge
    from sklearn.ensemble import RandomForestRegressor, HistGradientBoostingRegressor
    from sklearn.metrics import mean_absolute_error

    # 1 Load, name the target, list the features
    train = pd.read_csv('train.csv')
    val = pd.read_csv('val.csv')
    test = pd.read_csv('test.csv')
    target = 'price'
    feats = list(test.columns.drop('house_id'))

    # 2 Compare three model families on validation
    models = {
        'ridge': Ridge(),
        'rf': RandomForestRegressor(n_estimators=300, random_state=42, n_jobs=-1),
        'hgb': HistGradientBoostingRegressor(loss='absolute_error', random_state=42)}
    scores = {}
    for name, m in models.items():
        m.fit(train[feats], train[target])
        scores[name] = mean_absolute_error(val[target], m.predict(val[feats]))
        print(name, round(scores[name]))

    # 3 Refit the winner on train + val, then predict test
    best = models[min(scores, key=scores.get)]
    full = pd.concat([train, val], ignore_index=True)
    best.fit(full[feats], full[target])
    out = pd.DataFrame({'price': best.predict(test[feats])})
    out.to_csv('predictions.csv', index=False)
""")

MODEL_GRADER = code(f"""
    import json

    import numpy as np
    import pandas as pd

    BAR = {MODEL_BAR}
    METRIC = f'MAE on the hidden test prices is below {{BAR:,}}'


    def grade(c):
        c.plan('predictions.csv is saved in the task folder',
               'predictions.csv has no index column',
               'One column, named price',
               'One prediction per test row',
               'Every prediction is a number',
               (METRIC, True))
        got = c.output('predictions.csv')
        if got is None:
            return
        if not c.check('One column, named price', list(got.columns) == ['price'],
                       'Found these columns: ' + ', '.join(map(str, got.columns)) + '.',
                       "Save a DataFrame that holds only the price column."):
            return
        truth = c.secret('truth.csv')
        if not c.check('One prediction per test row', len(got) == len(truth),
                       f'test.csv has {{len(truth):,}} rows and predictions.csv has {{len(got):,}}.',
                       'Predict on test.csv and keep its row order.'):
            return
        p = pd.to_numeric(got['price'], errors='coerce')
        if not c.check('Every prediction is a number', bool(p.notna().all()),
                       f'{{int(p.isna().sum())}} predictions are missing or not numeric.'):
            return
        mae = float(np.abs(p.to_numpy() - truth['price'].to_numpy()).mean())
        base = json.loads((c.hidden / 'meta.json').read_text())['baseline_mae']
        c.note(f'Your MAE: {{mae:,.0f}}. Bar: below {{BAR:,}}. A median-only guess scores {{base:,.0f}}.')
        c.check(METRIC, mae < BAR, f'Your MAE is {{mae:,.0f}}.',
                'Compare a linear model, a random forest, and gradient boosting on val.csv. Match the loss to the metric, then refit the best on train plus val.')
""")

MODEL_VARIANTS = [
    dict(name="median_baseline", hint="", fails=[f"MAE on the hidden test prices is below {MODEL_BAR:,}"], code=code("""
        import pandas as pd
        train = pd.read_csv('train.csv'); test = pd.read_csv('test.csv')
        pd.DataFrame({'price': [train.price.median()] * len(test)}).to_csv('predictions.csv', index=False)
    """)),
    dict(name="ridge_only", hint="", fails=[f"MAE on the hidden test prices is below {MODEL_BAR:,}"], code=code("""
        import pandas as pd
        from sklearn.linear_model import Ridge
        train = pd.read_csv('train.csv'); test = pd.read_csv('test.csv')
        f = list(test.columns.drop('house_id'))
        pd.DataFrame({'price': Ridge().fit(train[f], train.price).predict(test[f])}).to_csv('predictions.csv', index=False)
    """)),
    dict(name="wrong_column", hint="", fails=["One column, named price"], code=code("""
        import pandas as pd
        test = pd.read_csv('test.csv')
        pd.DataFrame({'house_id': test.house_id, 'price': 300000.0}).to_csv('predictions.csv', index=False)
    """)),
    dict(name="val_rows", hint="", fails=["One prediction per test row"], code=code("""
        import pandas as pd
        val = pd.read_csv('val.csv')
        pd.DataFrame({'price': val.price}).iloc[:-3].to_csv('predictions.csv', index=False)
    """)),
]


def exercises():
    collect_inputs, process_inputs, model_inputs, model_hidden = make()
    return [
        dict(id="houses-collect", module=3, title="Collect the house data", story="Houses", minutes=22,
             inputs=collect_inputs, outputs=["collected.csv"], hidden={}, expect=["collected.csv"], align="house_id",
             desc=COLLECT_DESC, starter="import pandas as pd\n\n", solution=COLLECT_SOLUTION, grader=COLLECT_GRADER,
             hints=["Work in four steps: filter the views, aggregate to one row per house, left-join onto houses, then fix nulls, names, types, and column order.",
                    "The window is 16 March to 15 April 2023 with both days included, and view_date carries a time of day. A safe filter is >= '2023-03-16' and < '2023-04-16'.",
                    "Houses with no views in the window have no match after the left join. Fill num_views with 0, then cast it to int."],
             variants=COLLECT_VARIANTS, oracle=oracle_collect),
        dict(id="houses-process", module=4, title="Process without leakage", story="Houses", minutes=15,
             inputs=process_inputs, outputs=["processed_train.csv", "processed_test.csv"], hidden={},
             expect=["processed_train.csv", "processed_test.csv"], align=None,
             desc=PROCESS_DESC, starter="import pandas as pd\n\n", solution=PROCESS_SOLUTION, grader=PROCESS_GRADER,
             hints=["Every statistic comes from train: the mean age, the category order, and the scaling mean and standard deviation.",
                    "For each step, fit on train, then transform train and test. The test set only ever gets transform.",
                    "StandardScaler divides by the population standard deviation (ddof=0). pandas .std() uses ddof=1 unless you pass ddof=0."],
             variants=PROCESS_VARIANTS, oracle=oracle_process),
        dict(id="houses-model", module=5, title="Predict house prices", story="Houses", minutes=23,
             inputs=model_inputs, outputs=["predictions.csv"], hidden=model_hidden, expect=[], align=None,
             desc=MODEL_DESC, starter="import pandas as pd\n\n", solution=MODEL_SOLUTION, grader=MODEL_GRADER,
             hints=["Save a valid predictions.csv from any quick model first. Improve it after that.",
                    "Compare a linear model, a random forest, and gradient boosting on val.csv with mean_absolute_error.",
                    "The metric is MAE, so try HistGradientBoostingRegressor(loss='absolute_error'). Refit the winner on train plus val before you predict test."],
             variants=MODEL_VARIANTS, oracle=None),
    ]
