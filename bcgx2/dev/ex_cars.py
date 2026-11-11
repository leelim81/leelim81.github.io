"""Story 3: used cars. Three short data processing drills (train and test files, no leakage)."""
import io

import numpy as np
import pandas as pd

from common import code, csv_text, file_list, html

BASE_COLS = ["car_id", "brand", "body", "fuel", "year", "mileage_km", "engine_cc", "power_hp", "condition", "price"]


def _cars(seed, n=1300, missing=False, coupe=False, stretch=False):
    rng = np.random.default_rng(seed)
    year = rng.integers(2007, 2023, n)
    age = 2024 - year
    mileage = np.clip(age * rng.normal(14000, 4500, n), 800, None).round().astype(int)
    engine = rng.choice([999, 1198, 1395, 1498, 1598, 1798, 1984, 2488, 2995], n,
                        p=[0.10, 0.14, 0.14, 0.16, 0.14, 0.12, 0.12, 0.05, 0.03]) + rng.integers(-3, 4, n)
    big = rng.choice(n, 16, replace=False)
    engine[big] = rng.integers(4600, 6400, 16)
    power = np.clip(48 + engine * 0.062 + rng.normal(0, 16, n), 52, None).round().astype(int)
    cond = rng.choice(["poor", "fair", "good", "excellent"], n, p=[0.10, 0.30, 0.40, 0.20])
    brand = rng.choice(["Aster", "Borea", "Civet", "Dorado", "Ember"], n)
    body = rng.choice(["hatch", "sedan", "suv", "wagon"], n, p=[0.30, 0.35, 0.25, 0.10])
    fuel = rng.choice(["petrol", "diesel", "hybrid", "electric"], n, p=[0.50, 0.25, 0.15, 0.10])
    q = pd.Series(cond).map({"poor": 0, "fair": 1, "good": 2, "excellent": 3}).to_numpy()
    price = (2500 + 62 * power + 1150 * (year - 2007) - 0.035 * mileage + 1400 * q
             + pd.Series(brand).map({"Aster": 0, "Borea": 900, "Civet": 1800, "Dorado": 3200, "Ember": 5200}).to_numpy()
             + rng.normal(0, 1500, n))
    df = pd.DataFrame({"car_id": np.arange(1, n + 1) + seed % 1000 * 10000, "brand": brand, "body": body, "fuel": fuel,
                       "year": year, "mileage_km": mileage.astype(float) if missing else mileage, "engine_cc": engine,
                       "power_hp": power, "condition": cond, "price": np.clip(price, 900, None).round().astype(int)})
    idx = rng.permutation(n)
    cut = int(0.7 * n)
    train, test = df.iloc[idx[:cut]].copy(), df.iloc[idx[cut:]].copy()
    if missing:
        for part, k1, k2 in ((train, 80, 45), (test, 36, 20)):
            part.iloc[rng.choice(len(part), k1, replace=False), part.columns.get_loc("mileage_km")] = np.nan
            part.iloc[rng.choice(len(part), k2, replace=False), part.columns.get_loc("fuel")] = None
    if coupe:
        test.iloc[rng.choice(len(test), 9, replace=False), test.columns.get_loc("body")] = "coupe"
    if stretch:                                   # a few test values outside the train range
        rows = rng.choice(len(test), 4, replace=False)
        test.iloc[rows[:2], test.columns.get_loc("year")] = [2024, 2005]
        test.iloc[rows[2:], test.columns.get_loc("power_hp")] = [int(train.power_hp.max()) + 37, 41]
    return {"data/train.csv": csv_text(train), "data/test.csv": csv_text(test)}


def _load(inputs):
    return pd.read_csv(io.StringIO(inputs["data/train.csv"])), pd.read_csv(io.StringIO(inputs["data/test.csv"]))


FILES = file_list(("data/train.csv", BASE_COLS), ("data/test.csv", ["the same columns"]))
SAVE = "<p>Don't let information from the test set leak into the train set. Keep every row and the row order. Save the results in the task folder as <code>processed_train.csv</code> and <code>processed_test.csv</code>.</p>"
PLAN_HEAD = """
        c.plan('processed_train.csv is saved in the task folder',
               'processed_train.csv has no index column',
               'processed_test.csv is saved in the task folder',
               'processed_test.csv has no index column',
               'Columns match the spec, in order',
               'Rows and row order are unchanged',"""

# ================================================================ D6 impute, flag, one-hot
ONEHOT_COLS = ["car_id", "brand", "year", "mileage_km", "engine_cc", "power_hp", "condition", "price", "mileage_missing",
               "fuel_diesel", "fuel_electric", "fuel_hybrid", "fuel_petrol", "body_hatch", "body_sedan", "body_suv", "body_wagon"]
ONEHOT_DESC = html(f"""
<p>A dealer's listings have gaps in <code>mileage_km</code> and <code>fuel</code>, and two text columns that a model can't read. The data is split into a train set (70%) and a test set (30%).</p>
<h3>Files</h3>
{FILES}
<h3>Your task</h3>
<ol>
  <li>Add <code>mileage_missing</code>: 1 where <code>mileage_km</code> is missing, otherwise 0.</li>
  <li>Fill the missing <code>mileage_km</code> values with the median mileage of the train set.</li>
  <li>Fill the missing <code>fuel</code> values with the most frequent fuel in the train set.</li>
  <li>One-hot encode <code>fuel</code> and <code>body</code>. Learn the levels from the train set. Name the new columns <code>fuel_&lt;level&gt;</code> and <code>body_&lt;level&gt;</code>, with levels in alphabetical order, holding the integers 0 and 1. A level that the train set never saw gets 0 in every column of that feature. Drop the original <code>fuel</code> and <code>body</code> columns.</li>
</ol>
<p>The saved files have these columns, in this order: {", ".join(f"<code>{c}</code>" for c in ONEHOT_COLS)}.</p>
{SAVE}
""")

ONEHOT_SOLUTION = code("""
    import pandas as pd
    from sklearn.preprocessing import OneHotEncoder

    train = pd.read_csv('data/train.csv')
    test = pd.read_csv('data/test.csv')

    # 1 Flag first, then fill. Both statistics come from train
    med = train['mileage_km'].median()
    top_fuel = train['fuel'].mode()[0]
    for df in (train, test):
        df['mileage_missing'] = df['mileage_km'].isna().astype(int)
        df['mileage_km'] = df['mileage_km'].fillna(med)
        df['fuel'] = df['fuel'].fillna(top_fuel)

    # 2 One-hot: fit on train, transform both. Unseen levels become all zeros
    cat = ['fuel', 'body']
    oh = OneHotEncoder(handle_unknown='ignore', sparse_output=False)
    oh.fit(train[cat])
    names = oh.get_feature_names_out(cat)

    def encode(df):
        hot = pd.DataFrame(oh.transform(df[cat]).astype(int), columns=names, index=df.index)
        return df.drop(columns=cat).join(hot)

    encode(train).to_csv('processed_train.csv', index=False)
    encode(test).to_csv('processed_test.csv', index=False)
""")

ONEHOT_GRADER = code("""
    import numpy as np
    import pandas as pd

    FILES = ['processed_train.csv', 'processed_test.csv']
    HOT = ['fuel_diesel', 'fuel_electric', 'fuel_hybrid', 'fuel_petrol', 'body_hatch', 'body_sedan', 'body_suv', 'body_wagon']
    COLS = ['car_id', 'brand', 'year', 'mileage_km', 'engine_cc', 'power_hp', 'condition', 'price', 'mileage_missing'] + HOT


    def grade(c):
""" + PLAN_HEAD + """
               'The flag and one-hot columns hold whole numbers',
               ('mileage_missing flags the rows that had no mileage', True),
               ('mileage_km is filled with the train median', True),
               ('fuel and body are one-hot encoded with the train levels', True),
               ('The other columns are untouched', True))
        pairs = c.frames(FILES, 'Columns match the spec, in order', 'Rows and row order are unchanged', 'car_id',
                         cols_hint='Expected, in order: ' + ', '.join(COLS) + '. An extra column such as body_coupe means test was encoded on its own. Learn the levels on train.')
        if pairs is None:
            return
        both = pd.concat([got for _, got, _ in pairs])
        c.integers('The flag and one-hot columns hold whole numbers', both, ['mileage_missing'] + HOT,
                   hint='Cast the flag and the one-hot output to int before you save.')
        c.values('mileage_missing flags the rows that had no mileage', pairs, ['mileage_missing'], key='car_id',
                 hint='Use isna() on the original column, then cast to int.')
        c.values('mileage_km is filled with the train median', pairs, ['mileage_km'], key='car_id',
                 hint='Compute the median on train, then fill train and test with that one number.')
        c.values('fuel and body are one-hot encoded with the train levels', pairs, HOT, key='car_id',
                 hint='Fill fuel with the train mode first. Then fit the encoder on train and transform both sets.')
        c.values('The other columns are untouched', pairs, ['car_id', 'brand', 'year', 'engine_cc', 'power_hp', 'condition', 'price'], key='car_id',
                 hint='Transform only the columns the task names.')
""")


def _onehot_variant(flag_first=True, med_te="med", dummies=False):
    flag = "df['mileage_missing'] = df['mileage_km'].isna().astype(int)"
    fill = "df['mileage_km'] = df['mileage_km'].fillna(m)"
    body = f"""
import pandas as pd
train = pd.read_csv('data/train.csv'); test = pd.read_csv('data/test.csv')
med = train['mileage_km'].median(); med_test = test['mileage_km'].median(); top = train['fuel'].mode()[0]
for df, m in ((train, med), (test, {med_te})):
    {flag if flag_first else fill}
    {fill if flag_first else flag}
    df['fuel'] = df['fuel'].fillna(top)
"""
    if dummies:
        body += """
pd.get_dummies(train, columns=['fuel', 'body'], dtype=int).to_csv('processed_train.csv', index=False)
pd.get_dummies(test, columns=['fuel', 'body'], dtype=int).to_csv('processed_test.csv', index=False)
"""
    else:
        body += """
tr = pd.get_dummies(train, columns=['fuel', 'body'], dtype=int)
te = pd.get_dummies(test, columns=['fuel', 'body'], dtype=int).reindex(columns=tr.columns, fill_value=0)
tr.to_csv('processed_train.csv', index=False); te.to_csv('processed_test.csv', index=False)
"""
    return code(body)


ONEHOT_VARIANTS = [
    dict(name="flag_after_fill", hint="Create the flag before you fill. After the fill nothing is missing, so the flag is always 0.",
         code=_onehot_variant(flag_first=False), fails=["mileage_missing flags the rows that had no mileage"]),
    dict(name="test_median", hint="The test set is filled with its own median. Use the train median for both sets.",
         code=_onehot_variant(med_te="med_test"), fails=["mileage_km is filled with the train median"]),
    dict(name="dummies_each", hint="", code=_onehot_variant(dummies=True), fails=["Columns match the spec, in order"]),
]


def oracle_onehot(inputs):
    tr, te = _load(inputs)
    med = float(np.nanmedian(tr["mileage_km"].to_numpy()))
    top = tr["fuel"].value_counts().idxmax()
    levels = {"fuel": sorted(tr["fuel"].dropna().unique()), "body": sorted(tr["body"].dropna().unique())}
    out = {}
    for name, df in (("processed_train.csv", tr), ("processed_test.csv", te)):
        d = df.copy()
        d["mileage_missing"] = d["mileage_km"].isna().astype(int)
        d["mileage_km"] = d["mileage_km"].where(d["mileage_km"].notna(), med)
        fuel = d["fuel"].where(d["fuel"].notna(), top)
        for col, series in (("fuel", fuel), ("body", d["body"])):
            for lv in levels[col]:
                d[f"{col}_{lv}"] = (series == lv).astype(int)
        out[name] = d.drop(columns=["fuel", "body"])[ONEHOT_COLS]
    return out


# ================================================================ D7 outlier caps, log, quantile bins
BINS_COLS = BASE_COLS + ["mileage_log", "power_band"]
BINS_DESC = html(f"""
<p>The same kind of listings, this time with no missing values. A few engine sizes are far outside the usual range.</p>
<h3>Files</h3>
{FILES}
<h3>Your task</h3>
<ol>
  <li>Cap <code>engine_cc</code> at the IQR fences of the train set. The lower fence is Q1 minus 1.5 times the IQR and the upper fence is Q3 plus 1.5 times the IQR, where Q1 and Q3 are the 25th and 75th percentiles (the pandas default, linear interpolation). Set values outside a fence to that fence.</li>
  <li>Add <code>mileage_log</code>: the natural log of 1 plus <code>mileage_km</code>.</li>
  <li>Add <code>power_band</code>: the quartile of <code>power_hp</code>, as an integer from 0 (lowest) to 3. Use <code>pd.qcut</code> with 4 bins on the train set, and reuse its bin edges for the test set. Test values below the lowest train edge go to band 0, and values above the highest go to band 3.</li>
</ol>
<p>Keep the original columns in order and append <code>mileage_log</code> and <code>power_band</code>.</p>
{SAVE}
""")

BINS_SOLUTION = code("""
    import numpy as np
    import pandas as pd

    train = pd.read_csv('data/train.csv')
    test = pd.read_csv('data/test.csv')

    # IQR fences from train
    q1, q3 = train['engine_cc'].quantile([0.25, 0.75])
    iqr = q3 - q1
    lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr

    # Quartile edges from train, opened at both ends to catch unseen extremes
    _, edges = pd.qcut(train['power_hp'], 4, retbins=True)
    edges[0], edges[-1] = -np.inf, np.inf

    for df in (train, test):
        df['engine_cc'] = df['engine_cc'].clip(lo, hi)
        df['mileage_log'] = np.log1p(df['mileage_km'])
        df['power_band'] = pd.cut(df['power_hp'], bins=edges, labels=False)

    train.to_csv('processed_train.csv', index=False)
    test.to_csv('processed_test.csv', index=False)
""")

BINS_GRADER = code("""
    import numpy as np
    import pandas as pd

    FILES = ['processed_train.csv', 'processed_test.csv']


    def grade(c):
""" + PLAN_HEAD + """
               'power_band is a whole number',
               ('engine_cc is capped at the train IQR fences', True),
               ('mileage_log is the log of 1 plus mileage_km', True),
               ('power_band uses the train quartile edges', True),
               ('The other columns are untouched', True))
        pairs = c.frames(FILES, 'Columns match the spec, in order', 'Rows and row order are unchanged', 'car_id')
        if pairs is None:
            return
        both = pd.concat([got for _, got, _ in pairs])
        c.integers('power_band is a whole number', both, ['power_band'],
                   hint='pd.cut(..., labels=False) returns integers when every value lands in a bin.')
        c.values('engine_cc is capped at the train IQR fences', pairs, ['engine_cc'], key='car_id',
                 hint='Compute Q1, Q3, and the fences on train, then clip() both sets with them.')
        c.values('mileage_log is the log of 1 plus mileage_km', pairs, ['mileage_log'], key='car_id', hint='Use np.log1p.')
        c.values('power_band uses the train quartile edges', pairs, ['power_band'], key='car_id',
                 hint='Get the edges with pd.qcut(train[col], 4, retbins=True), set the outer edges to -inf and inf, then pd.cut both sets.')
        c.values('The other columns are untouched', pairs,
                 ['car_id', 'brand', 'body', 'fuel', 'year', 'mileage_km', 'power_hp', 'condition', 'price'], key='car_id',
                 hint='Transform only the columns the task names.')
""")


def _bins_variant(fence="train", edge="train", log="np.log1p", drop=False):
    return code(f"""
import numpy as np
import pandas as pd
train = pd.read_csv('data/train.csv'); test = pd.read_csv('data/test.csv')
def fences(df):
    q1, q3 = df['engine_cc'].quantile([0.25, 0.75]); return q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)
def edges(df):
    _, e = pd.qcut(df['power_hp'], 4, retbins=True); e[0], e[-1] = -np.inf, np.inf; return e
out = {{}}
for name, df in (('train', train), ('test', test)):
    lo, hi = fences(train if '{fence}' == 'train' else df)
    e = edges(train if '{edge}' == 'train' else df)
    d = df.copy()
    {"d = d[d['engine_cc'].between(lo, hi)]" if drop else "d['engine_cc'] = d['engine_cc'].clip(lo, hi)"}
    d['mileage_log'] = {log}(d['mileage_km'])
    d['power_band'] = pd.cut(d['power_hp'], bins=e, labels=False)
    d.to_csv(f'processed_{{name}}.csv', index=False)
""")


BINS_VARIANTS = [
    dict(name="fences_each", hint="The test set is capped with its own fences. Compute the fences on train and reuse them.",
         code=_bins_variant(fence="each"), fails=["engine_cc is capped at the train IQR fences"]),
    dict(name="qcut_each", hint="The test set got its own quartile edges. pd.qcut on test learns from test; reuse the train edges with pd.cut.",
         code=_bins_variant(edge="each"), fails=["power_band uses the train quartile edges"]),
    dict(name="plain_log", hint="np.log(x) is not log(1 + x). Use np.log1p.",
         code=_bins_variant(log="np.log"), fails=["mileage_log is the log of 1 plus mileage_km"]),
    dict(name="drop_outliers", hint="", code=_bins_variant(drop=True), fails=["Rows and row order are unchanged"]),
]


def oracle_bins(inputs):
    tr, te = _load(inputs)
    q1, q2, q3 = np.percentile(tr["engine_cc"].to_numpy(), [25, 50, 75])
    lo, hi = q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)
    inner = np.percentile(tr["power_hp"].to_numpy(), [25, 50, 75])
    out = {}
    for name, df in (("processed_train.csv", tr), ("processed_test.csv", te)):
        d = df.copy()
        d["engine_cc"] = np.minimum(np.maximum(d["engine_cc"].to_numpy(dtype=float), lo), hi)
        d["mileage_log"] = np.log(1.0 + d["mileage_km"].to_numpy(dtype=float))
        d["power_band"] = np.searchsorted(inner, d["power_hp"].to_numpy(), side="left")   # right-closed bins
        out[name] = d[BINS_COLS]
    return out


# ================================================================ D8 ordinal order, min-max, z-score
ORD_COLS = BASE_COLS + ["engine_z", "is_outlier"]
ORD_DESC = html(f"""
<p>The same kind of listings, with no missing values. Prepare three columns for a distance-based model.</p>
<h3>Files</h3>
{FILES}
<h3>Your task</h3>
<ol>
  <li>Encode <code>condition</code> as an integer by quality: <code>poor</code> 0, <code>fair</code> 1, <code>good</code> 2, <code>excellent</code> 3.</li>
  <li>Min-max scale <code>year</code> and <code>power_hp</code> with the train set: subtract the train minimum, then divide by the train maximum minus the train minimum. Don't clip the test set, so test values can fall below 0 or above 1.</li>
  <li>Add <code>engine_z</code>: the z-score of <code>engine_cc</code>, using the train mean and the train population standard deviation (ddof=0).</li>
  <li>Add <code>is_outlier</code>: 1 where the absolute value of <code>engine_z</code> is above 3, otherwise 0.</li>
</ol>
<p>Keep the original columns in order and append <code>engine_z</code> and <code>is_outlier</code>.</p>
{SAVE}
""")

ORD_SOLUTION = code("""
    import pandas as pd
    from sklearn.preprocessing import MinMaxScaler, OrdinalEncoder, StandardScaler

    train = pd.read_csv('data/train.csv')
    test = pd.read_csv('data/test.csv')

    # Each transformer is fitted on train only
    enc = OrdinalEncoder(categories=[['poor', 'fair', 'good', 'excellent']]).fit(train[['condition']])
    num = ['year', 'power_hp']
    mm = MinMaxScaler().fit(train[num])
    z = StandardScaler().fit(train[['engine_cc']])        # population standard deviation

    for df in (train, test):
        df['condition'] = enc.transform(df[['condition']])[:, 0].astype(int)
        df[num] = mm.transform(df[num])
        df['engine_z'] = z.transform(df[['engine_cc']])[:, 0]
        df['is_outlier'] = (df['engine_z'].abs() > 3).astype(int)

    train.to_csv('processed_train.csv', index=False)
    test.to_csv('processed_test.csv', index=False)
""")

ORD_GRADER = code("""
    import numpy as np
    import pandas as pd

    FILES = ['processed_train.csv', 'processed_test.csv']


    def grade(c):
""" + PLAN_HEAD + """
               'condition and is_outlier are whole numbers',
               ('condition is encoded by quality, poor 0 to excellent 3', True),
               ('year and power_hp are min-max scaled with train statistics', True),
               ('engine_z uses the train mean and population standard deviation', True),
               ('is_outlier flags an absolute z-score above 3', True),
               ('The other columns are untouched', True))
        pairs = c.frames(FILES, 'Columns match the spec, in order', 'Rows and row order are unchanged', 'car_id')
        if pairs is None:
            return
        both = pd.concat([got for _, got, _ in pairs])
        c.integers('condition and is_outlier are whole numbers', both, ['condition', 'is_outlier'], hint='Cast both columns to int before you save.')
        c.values('condition is encoded by quality, poor 0 to excellent 3', pairs, ['condition'], key='car_id',
                 hint="Map the levels yourself, or pass categories=[['poor', 'fair', 'good', 'excellent']] to OrdinalEncoder.")
        c.values('year and power_hp are min-max scaled with train statistics', pairs, ['year', 'power_hp'], key='car_id',
                 hint='Use the train minimum and maximum for both sets.')
        c.values('engine_z uses the train mean and population standard deviation', pairs, ['engine_z'], key='car_id',
                 hint='z = (x - train mean) / train std, with ddof=0.')
        c.values('is_outlier flags an absolute z-score above 3', pairs, ['is_outlier'], key='car_id')
        c.values('The other columns are untouched', pairs,
                 ['car_id', 'brand', 'body', 'fuel', 'mileage_km', 'engine_cc', 'price'], key='car_id',
                 hint='Transform only the columns the task names.')
""")


def _ord_variant(order="['poor', 'fair', 'good', 'excellent']", mm="train", ddof=0, clip=False):
    return code(f"""
import pandas as pd
train = pd.read_csv('data/train.csv'); test = pd.read_csv('data/test.csv')
levels = {{v: i for i, v in enumerate({order})}}
mu, sd = train['engine_cc'].mean(), train['engine_cc'].std(ddof={ddof})
for name, df in (('train', train), ('test', test)):
    ref = train if '{mm}' == 'train' else df
    d = df.copy()
    d['condition'] = d['condition'].map(levels)
    for col in ['year', 'power_hp']:
        d[col] = (d[col] - ref[col].min()) / (ref[col].max() - ref[col].min())
        {"d[col] = d[col].clip(0, 1)" if clip else "pass"}
    d['engine_z'] = (d['engine_cc'] - mu) / sd
    d['is_outlier'] = (d['engine_z'].abs() > 3).astype(int)
    d.to_csv(f'processed_{{name}}.csv', index=False)
""")


ORD_VARIANTS = [
    dict(name="alphabetical", hint="That is alphabetical order, which is what OrdinalEncoder does by default. Pass the quality order yourself.",
         code=_ord_variant(order="sorted(train['condition'].unique())"), fails=["condition is encoded by quality, poor 0 to excellent 3"]),
    dict(name="test_minmax", hint="The test set is scaled with its own minimum and maximum. Use the train values for both sets.",
         code=_ord_variant(mm="each"), fails=["year and power_hp are min-max scaled with train statistics"]),
    dict(name="sample_std", hint="You divided by the sample standard deviation. pandas .std() uses ddof=1; pass ddof=0 or use StandardScaler.",
         code=_ord_variant(ddof=1), fails=["engine_z uses the train mean and population standard deviation"]),
    dict(name="clipped", hint="The task says not to clip. A test value outside the train range scales below 0 or above 1.",
         code=_ord_variant(clip=True), fails=["year and power_hp are min-max scaled with train statistics"]),
]


def oracle_ord(inputs):
    tr, te = _load(inputs)
    order = {"poor": 0, "fair": 1, "good": 2, "excellent": 3}
    x = tr["engine_cc"].to_numpy(dtype=float)
    mu = x.sum() / len(x)
    sd = float(np.sqrt(((x - mu) ** 2).sum() / len(x)))
    rng_ = {c: (float(tr[c].min()), float(tr[c].max())) for c in ("year", "power_hp")}
    out = {}
    for name, df in (("processed_train.csv", tr), ("processed_test.csv", te)):
        d = df.copy()
        d["condition"] = [order[v] for v in d["condition"]]
        for c, (a, b) in rng_.items():
            d[c] = (d[c].to_numpy(dtype=float) - a) / (b - a)
        d["engine_z"] = (d["engine_cc"].to_numpy(dtype=float) - mu) / sd
        d["is_outlier"] = (np.abs(d["engine_z"].to_numpy()) > 3).astype(int)
        out[name] = d[ORD_COLS]
    return out


def exercises():
    return [
        dict(id="cars-onehot", module=4, title="Impute, flag, and one-hot encode", story="Cars", minutes=12,
             inputs=_cars(52001, missing=True, coupe=True), outputs=["processed_train.csv", "processed_test.csv"], hidden={},
             expect=["processed_train.csv", "processed_test.csv"], align=None,
             desc=ONEHOT_DESC, starter="import pandas as pd\n\n", solution=ONEHOT_SOLUTION, grader=ONEHOT_GRADER,
             hints=["Order matters: build the missing flag before you fill, and fill fuel before you encode it.",
                    "The median and the most frequent fuel both come from train. Apply the same two values to test.",
                    "OneHotEncoder(handle_unknown='ignore', sparse_output=False) fitted on train gives zeros for unseen levels. In pandas, use get_dummies on both sets and reindex test to train's columns with fill_value=0."],
             variants=ONEHOT_VARIANTS, oracle=oracle_onehot),
        dict(id="cars-bins", module=4, title="Cap outliers, log, and bin", story="Cars", minutes=12,
             inputs=_cars(52002), outputs=["processed_train.csv", "processed_test.csv"], hidden={},
             expect=["processed_train.csv", "processed_test.csv"], align=None,
             desc=BINS_DESC, starter="import numpy as np\nimport pandas as pd\n\n", solution=BINS_SOLUTION, grader=BINS_GRADER,
             hints=["Three numbers come from train: the two IQR fences and the quartile edges of power_hp.",
                    "train['engine_cc'].quantile([0.25, 0.75]) gives Q1 and Q3. clip(lo, hi) caps both sets.",
                    "pd.qcut(train['power_hp'], 4, retbins=True) returns the edges. Set the first to -inf and the last to inf, then use pd.cut(..., bins=edges, labels=False) on both sets."],
             variants=BINS_VARIANTS, oracle=oracle_bins),
        dict(id="cars-scale", module=4, title="Ordinal order, min-max, and z-scores", story="Cars", minutes=12,
             inputs=_cars(52003, stretch=True), outputs=["processed_train.csv", "processed_test.csv"], hidden={},
             expect=["processed_train.csv", "processed_test.csv"], align=None,
             desc=ORD_DESC, starter="import pandas as pd\n\n", solution=ORD_SOLUTION, grader=ORD_GRADER,
             hints=["Fit every transformer on train only, then transform train and test.",
                    "OrdinalEncoder sorts levels alphabetically unless you pass categories=[['poor', 'fair', 'good', 'excellent']]. A dict with .map() works too.",
                    "StandardScaler divides by the population standard deviation. In pandas, pass ddof=0 to .std()."],
             variants=ORD_VARIANTS, oracle=oracle_ord),
    ]
