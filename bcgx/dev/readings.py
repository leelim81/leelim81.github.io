"""Refresher readings. Examples use different numbers from the graded questions."""

READINGS = [
    {
        "id": "read-A",
        "code": "A0",
        "group": "phase0",
        "order": 0,
        "type": "reading",
        "title": "Python syntax refresher",
        "minutes": 8,
        "body": """
The coding tasks are short, and the usual failure is a typo: a method that returned a new object, a boolean mask without parentheses, or a function that built the right table and never returned it. This page is muscle memory. The statistics can wait.

## Names and f-strings

```python
name = "Lee"
score = 91.26
label = f"{name} scored {score:.1f}"
print(label)
```

`:.1f` rounds to one decimal. `None`, `0`, `""`, and empty containers are falsy. Compare to `None` with `is`, not `==`.

## Lists and slices

```python
xs = [10, 20, 30, 40, 50]
print(xs[1:4])   # [20, 30, 40]  end is exclusive
print(xs[-2:])   # [40, 50]
print(xs[::-1])  # reversed copy
```

A slice that runs off the end does not raise. A bare index does.

## Dicts

```python
counts = {"a": 1}
counts["b"] = counts.get("b", 0) + 1
print(sorted(counts))
```

`get` returns the default instead of raising. `[]` raises `KeyError`.

## Comprehensions

```python
nums = [1, 2, 3, 4, 5]
evens = [n * n for n in nums if n % 2 == 0]
lookup = {n: n * n for n in nums}
```

A comprehension builds a new collection. It does not update the input.

## enumerate and zip

```python
names = ["Ada", "Grace"]
scores = [88, 91]
for i, (name, score) in enumerate(zip(names, scores), start=1):
    print(f"{i}:{name}={score}")
```

`zip` stops at the shorter list. `start=1` is how you write a 1-based rank.

## Functions, defaults, lambda

```python
def discounted(prices, discount=0.1):
    take = lambda p: round(p * (1 - discount), 2)
    return [take(p) for p in prices]

print(discounted([20, 40]))
print(discounted([20, 40], discount=0.25))
```

Defaults are bound once, when the function is defined. Never use a list or dict as a default value.

## Sorting with a key

```python
rows = [{"name": "Bo", "rev": 10}, {"name": "Ann", "rev": 10}, {"name": "Cy", "rev": 4}]
ordered = sorted(rows, key=lambda r: (-r["rev"], r["name"]))
print([r["name"] for r in ordered])
```

A tuple key sorts by the first item, then the next. Negating a number reverses that field only. `sorted` returns a new list.

## Strings

```python
raw = "  AB-1029, extra "
clean = raw.strip().lower().replace(",", "")
sku, rest = "AB-1029 extra".split(" ", 1)
print(clean.startswith("ab"))
```

String methods return a new string.

## Counter and defaultdict

```python
from collections import Counter, defaultdict
tokens = ["a", "b", "a", "a", "b"]
print(Counter(tokens).most_common(1))
groups = defaultdict(list)
for key, value in [("east", 2), ("west", 5), ("east", 1)]:
    groups[key].append(value)
print(dict(groups))
```

## Exceptions

```python
def as_int(text):
    try:
        return int(text)
    except (ValueError, TypeError):
        return None

print(as_int("42"), as_int("x"), as_int(None))
```

Catch the narrow error. A bare `except` hides the bug you are trying to find.

## A small class

```python
class Ledger:
    def __init__(self):
        self.bal = 0
    def add(self, amount):
        self.bal += amount
        return self.bal

book = Ledger()
print(book.add(5), book.add(-2))
```

## NumPy

```python
import numpy as np
a = np.arange(12).reshape(3, 4)
print(a.mean(axis=0))
print(a[a > 6])
```

`axis=0` collapses rows and leaves one value per column. A boolean mask used for indexing must match the array shape.

## Pandas, the four lines that show up constantly

```python
import pandas as pd
df = pd.DataFrame([
    {"region": "East", "revenue": 10, "cost": 4},
    {"region": "East", "revenue": 14, "cost": 9},
    {"region": "West", "revenue": 8, "cost": 3},
])
east = df.loc[df["region"].eq("East"), ["region", "revenue"]]
df["margin"] = df["revenue"] - df["cost"]
totals = df.groupby("region", as_index=False)["revenue"].sum()
print(east)
print(totals)
```

`loc` selects by label. `iloc` selects by position. Assigning `df["margin"] = ...` adds a column. `groupby(..., as_index=False)` keeps the key as a column, which is what the unit tests usually expect.

```python
orders = pd.DataFrame({"order_id": [1, 2], "customer_id": [10, 11], "amount": [5, 7]})
customers = pd.DataFrame({"customer_id": [10, 12], "name": ["Ann", "Bo"]})
print(orders.merge(customers, on="customer_id", how="left"))
```

`merge` returns a new frame. A left join keeps every order.

## Pitfalls

- The cell built the right frame and did not `return` it. The test then fails on `None`.
- `dropna`, `sort_values`, `merge`, and `groupby` return new objects.
- `df[mask]["col"] = 1` is unreliable. Write `df.loc[mask, "col"] = 1`.
- `and` / `or` do not work on Series. Use `&` and `|`, each side in parentheses.
- Python 3 `1/2` is `0.5`. `//` floors.

## What you must memorise

- Slices are half-open.
- `dict.get(key, default)` and `Counter` / `defaultdict(list)`.
- `sorted(rows, key=lambda r: (...))`.
- `df.loc[mask, cols]`, column assign, `groupby(..., as_index=False)`, `merge(..., how="left")`.
- Parentheses around every boolean mask.

More one-liners: [slices and dicts](#/sheet/py-slice), [pandas selection](#/sheet/pd-select), [merge](#/sheet/pd-merge).
""",
    },
    {
        "id": "read-B",
        "code": "B0",
        "group": "pandas",
        "order": 0,
        "type": "reading",
        "title": "Pandas data collection",
        "minutes": 8,
        "body": """
The first coding task is almost always "make one table". Several files arrive with different columns, you filter, join, aggregate, and the tests compare an exact schema. Speed matters more than cleverness. Write the column list you must return before you write the pipeline.

## Concat when columns do not match

```python
import pandas as pd
from io import StringIO
a = pd.read_csv(StringIO("date,sku,units,discount\\n2024-01-01,A,2,0.1\\n"))
b = pd.read_csv(StringIO("date,sku,units,tax\\n2024-01-02,B,1,0.05\\n"))
a["source"] = "east"
b["source"] = "west"
both = pd.concat([a, b], ignore_index=True)
both = both[["date", "sku", "units", "discount", "tax", "source"]]
print(both)
```

`concat` unions columns and fills the gaps with nulls. Set the column order yourself. The tests check names and order.

## Merge and duplicates

Join keys are rarely unique on both sides. Decide which duplicate survives before the join, or the row count explodes.

```python
customers = pd.DataFrame({
    "customer_id": [1, 1, 2],
    "name": ["Ann", "Anna", "Bo"],
    "updated_at": ["2024-01-01", "2024-06-01", "2024-01-01"],
})
latest = customers.sort_values("updated_at").drop_duplicates("customer_id", keep="last")
orders = pd.DataFrame({"order_id": [10, 11], "customer_id": [1, 9], "amount": [50, 5]})
print(orders.merge(latest, on="customer_id", how="left"))
```

`how="left"` keeps orders with no customer. An inner join would drop them, and a test that expects null names will fail.

## Named aggregation

```python
orders = pd.DataFrame({"region": ["East", "East", "West"], "amount": [10, 30, 5]})
out = orders.groupby("region", as_index=False).agg(
    revenue=("amount", "sum"),
    orders=("amount", "count"),
    aov=("amount", "mean"),
)
print(out)
```

The `name=(column, agg)` form is the one to memorise. `as_index=False` avoids a later `reset_index` you may forget.

## Share and z-score inside a group

```python
df = pd.DataFrame({"category": ["A", "A", "A"], "sku": ["a", "b", "c"], "revenue": [10, 20, 30]})
g = df.groupby("category")["revenue"]
df["share"] = df["revenue"] / g.transform("sum")
df["z"] = (df["revenue"] - g.transform("mean")) / g.transform("std")
print(df)
```

`transform` broadcasts the group statistic back to every row. Pandas `std` is the sample standard deviation (`ddof=1`). If a group has one row, that std is null. Say in the function what you do with it.

## Pivot, melt, time, rolling, top-N

```python
long = pd.DataFrame({
    "product": ["P", "P", "Q"],
    "quarter": ["Q1", "Q2", "Q1"],
    "units": [2, 3, 4],
})
wide = long.pivot_table(index="product", columns="quarter", values="units", aggfunc="sum", fill_value=0)
wide = wide.reindex(columns=["Q1", "Q2", "Q3"], fill_value=0).reset_index()
print(wide)

daily = pd.DataFrame({"date": pd.to_datetime(["2024-01-15", "2024-01-20", "2024-03-02"]), "amount": [4, 6, 8]})
monthly = daily.set_index("date").resample("ME")["amount"].sum().rename("amount").reset_index()
monthly["month"] = monthly["date"].dt.strftime("%Y-%m")
print(monthly[["month", "amount"]])
```

Use `ME` for month-end. The old alias `M` is gone in current pandas. `resample` inserts the empty February for you if the index spans it.

Top-N with a tie break is a sort plus `groupby.head`, not `nlargest`, which does not let you break ties cleanly:

```python
df = pd.DataFrame({"category": ["A", "A", "A"], "product_id": [2, 1, 3], "revenue": [10, 10, 4]})
ranked = df.sort_values(["category", "revenue", "product_id"], ascending=[True, False, True])
print(ranked.groupby("category", as_index=False).head(2))
```

## Pitfalls

- Wrong join type. Read the sentence "keep every order" as `how="left"`.
- Duplicate keys doubling revenue. Deduplicate first and state the rule.
- `groupby` sorts keys alphabetically. Sort again if the test wants another order.
- `resample("M")` raises or warns on recent pandas. Use `"ME"`.
- Returning the frame with the group key stuck in the index. Tests compare columns.

## What you must memorise

- `pd.concat`, then an explicit column list.
- `sort_values` + `drop_duplicates(keep="last")` before a join.
- `groupby(as_index=False).agg(name=(col, fn))`.
- `transform` for a share or a z-score.
- `pivot_table(..., fill_value=0)`, `melt`, `resample("ME")`, `shift`, `rolling`.
- Top-N: sort by value descending and tie-break ascending, then `.head(n)`.

One-liners: [concat](#/sheet/pd-concat), [joins](#/sheet/pd-merge), [groupby](#/sheet/pd-groupby), [time](#/sheet/pd-time).
""",
    },
    {
        "id": "read-C",
        "code": "C0",
        "group": "processing",
        "order": 0,
        "type": "reading",
        "title": "Data processing",
        "minutes": 8,
        "body": """
The second coding task is preprocessing: missing values, outliers, bins, encodings, scaling. The tests punish leakage. Anything you learn from the target, or from rows you are not allowed to see, has to be fit on the training rows only.

## Impute inside the group

```python
import pandas as pd
df = pd.DataFrame({"segment": ["A", "A", "A", "B"], "income": [10.0, None, 30.0, None]})
med = df.groupby("segment")["income"].transform("median")
df["income"] = df["income"].fillna(med).fillna(df["income"].median())
print(df)
```

The second `fillna` covers a segment that is entirely missing. Global median is the usual fallback. Do not fill with zero unless the prompt says the missing value means zero.

## IQR caps

```python
s = pd.Series([1, 2, 3, 4, 100], dtype=float)
q1, q3 = s.quantile(0.25), s.quantile(0.75)
low, high = q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)
print(s.clip(low, high).tolist())
```

Clip or drop, whichever the prompt says. Compute the fences on the training fold only when a test frame exists. Pandas `quantile` uses linear interpolation.

## Bins and log

```python
import numpy as np
ages = pd.Series([17, 18, 36, 60])
print(pd.cut(ages, [0, 18, 35, 50, 120], labels=["youth", "adult", "mid", "senior"], right=False).tolist())
print(np.log1p(pd.Series([0, 9, 99])).round(4).tolist())
```

`right=False` makes the right edge exclusive, so 18 falls in the next bin. `log1p` is defined at zero. Box-Cox with lambda 0 is the log; `log1p` is the safe version when zeros are real. Do not log a column you already standardised.

## Encodings, without leaking the target

```python
df = pd.DataFrame({"region": ["East", "West", "East"], "plan": ["Basic", "Pro", "Plus"]})
df["plan_ord"] = df["plan"].map({"Basic": 0, "Plus": 1, "Pro": 2})
west = pd.get_dummies(df["region"], dtype=int)["West"]
print(west.tolist())
```

One-hot columns are alphabetical unless you set categories yourself. `drop_first=True` drops the first of those columns.

Target encoding uses the mean of `y` by category. Fit it on train only. Unseen categories on the test set get the global train mean, not zero, and not a mean computed from the test labels.

```python
train = pd.DataFrame({"city": ["A", "A", "B"], "y": [1, 0, 1]})
test = pd.DataFrame({"city": ["A", "C"]})
means = train.groupby("city")["y"].mean()
global_mean = train["y"].mean()
print(test["city"].map(means).fillna(global_mean).tolist())
```

## Scale on train only

```python
from sklearn.preprocessing import StandardScaler
train = pd.DataFrame({"x": [0.0, 2.0]})
test = pd.DataFrame({"x": [4.0]})
scaler = StandardScaler().fit(train[["x"]])
print(scaler.transform(train[["x"]]).ravel().tolist())
print(scaler.transform(test[["x"]]).ravel().tolist())
```

`StandardScaler` divides by the population standard deviation. A zero-variance column has scale 1 after fitting, so training rows become 0.

## Regex

```python
import pandas as pd
notes = pd.Series(["order AB-1029 rushed", "no code here", "see ZX-0007"])
print(notes.str.extract(r"([A-Z]{2}-\\d{4})", expand=False).tolist())
```

`str.extract` returns null when there is no match. That is usually what you want.

## Pipeline

A `ColumnTransformer` plus `Pipeline` is the version that survives cross-validation, because the imputer and the scaler refit on each fold.

```python
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
num = Pipeline([("imp", SimpleImputer(strategy="median")), ("sc", StandardScaler())])
cat = Pipeline([
    ("imp", SimpleImputer(strategy="most_frequent")),
    ("oh", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
])
pre = ColumnTransformer([("num", num, ["age"]), ("cat", cat, ["region"])])
```

`handle_unknown="ignore"` is the difference between a passing test set and a crash on a new city.

## Pitfalls

- Filling missing values with a statistic computed on train and test together.
- Fitting a scaler, then splitting.
- Target-encoding with the test labels, or mapping unseen levels to 0 when the base rate is not 0.
- A column that is only known after the event you are predicting: refund after cancel, a flag copied from the label, a "final" status.
- `get_dummies` on train and test separately, producing different columns. Fit one encoder.

## What you must memorise

- Group median, then global median.
- IQR fence: `q1 - 1.5 * iqr`, `q3 + 1.5 * iqr`, then `clip`.
- `cut` versus `qcut`. `log1p`.
- One-hot and ordinal maps. Target mean from train only.
- `StandardScaler.fit` on train, `transform` on test.
- Leakage smells: future fields, full-sample statistics, target copied into a feature.
- `ColumnTransformer` + `Pipeline` + `handle_unknown="ignore"`.

Sheets: [missing data](#/sheet/pr-na), [encodings](#/sheet/pr-encode), [leakage](#/sheet/pr-leak), [pipeline](#/sheet/pr-pipe).
""",
    },
    {
        "id": "read-D",
        "code": "D0",
        "group": "modelling",
        "order": 0,
        "type": "reading",
        "title": "Modelling and evaluation",
        "minutes": 9,
        "body": """
The third coding task is a model that must clear a metric. The tests do not care that you imported a fashionable estimator. They care that the split is stratified, the metric is the one named in the prompt, and the number clears the bar. A plain logistic regression that you finish is worth more than a tuning loop that throws.

## Split

```python
import pandas as pd
from sklearn.model_selection import train_test_split
df = pd.DataFrame({"x": range(8), "y": [0, 0, 0, 0, 1, 1, 1, 1]})
train, test = train_test_split(df, test_size=0.25, random_state=0, stratify=df["y"])
print(len(train), len(test), train["y"].mean())
```

Always pass `stratify` on a classification label. Set `random_state` when the prompt mentions one. Do not fit on the test rows.

## Linear and logistic

```python
from sklearn.linear_model import LinearRegression, LogisticRegression
import numpy as np
X = np.array([[1], [2], [3], [4]])
y = np.array([3, 5, 7, 9])
lin = LinearRegression().fit(X, y)
print(lin.coef_, lin.intercept_)
```

For a classification threshold task, `predict_proba(X)[:, 1]` is the positive-class score. `predict` already applied 0.5.

## Trees, forests, boosting

```python
from sklearn.ensemble import RandomForestClassifier
clf = RandomForestClassifier(n_estimators=20, random_state=0)
```

Set `random_state` or a later run will not match. You rarely need a huge forest to clear a generous bar. `class_weight="balanced"` is the one-line response to imbalance. It is not a substitute for checking precision and recall.

## Cross-validation and a small search

```python
from sklearn.model_selection import cross_val_score, GridSearchCV
from sklearn.tree import DecisionTreeClassifier
score = cross_val_score(LogisticRegression(max_iter=500), X, y[:4] * 0 + 1, cv=2)
```

That toy line is only to show the call. In a real task, `cross_val_score(..., cv=4, scoring="accuracy")` returns one score per fold. The tests usually want the mean.

`GridSearchCV` refits on the best parameters. Read `best_params_` and `best_score_`. Keep the grid tiny: two or three values. A 4-by-4 grid on a forest will burn the clock inside Pyodide and inside CodeSignal.

## Metrics you must be able to type

Classification, with a 0.5 cut unless the prompt says otherwise:

- precision: of the rows you flagged, the fraction that are positive
- recall: of the positives, the fraction you flagged
- F1: harmonic mean of precision and recall
- ROC-AUC: ranking quality, threshold-free
- Gini: `2 * AUC - 1`

Regression:

- MAE: mean absolute error
- RMSE: square root of mean squared error
- R²: `1 - SS_res / SS_tot`
- adjusted R²: `1 - (1 - R²) * (n - 1) / (n - p - 1)`

```python
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import numpy as np
y_true = [0, 0, 1, 1]
y_pred = [0, 1, 1, 1]
print(precision_score(y_true, y_pred), recall_score(y_true, y_pred))
err = mean_squared_error([1, 2, 3], [1, 2, 4])
print(mean_absolute_error([1, 2, 3], [1, 2, 4]), np.sqrt(err))
```

`mean_squared_error` returns the mean square. RMSE is the square root. Do not report the square and call it RMSE.

## Beat a threshold

When the prompt says "AUC at least 0.85":

1. Look at the columns. Drop obvious identifiers.
2. Fit a logistic regression or a small forest on the numeric features.
3. Return probabilities for the positive class, aligned to the test rows.
4. If the bar is recall at a fixed precision, sweep a threshold. Do not stay at 0.5 out of habit.

```python
def pick_threshold(y_true, scores):
    best_t, best_f = 0.5, -1.0
    for step in range(1, 10):
        t = step / 10
        pred = (scores >= t).astype(int)
        f = f1_score(y_true, pred, zero_division=0)
        if f > best_f:
            best_t, best_f = t, f
    return best_t, best_f
```

## Pitfalls

- Scoring `predict` with `roc_auc_score`. AUC wants scores or probabilities, not hard labels, unless the prompt says otherwise.
- Macro versus binary average. The default in recent sklearn is binary for a 0/1 target. Pass `average` only if asked.
- Forgetting `[:, 1]` and submitting a matrix.
- Tuning on the test set you will be scored on. The hidden test is not a validation set.
- A model that does not converge. Raise `max_iter` before you change the algorithm.

## What you must memorise

- `train_test_split(..., stratify=y, random_state=...)`.
- `predict_proba(X)[:, 1]`.
- `cross_val_score(est, X, y, cv=k, scoring="accuracy")`.
- `GridSearchCV(est, param_grid, cv=k, scoring=...).fit` then `best_params_`.
- F1, AUC, Gini `2*AUC-1`, MAE, RMSE, R², adjusted R².
- `class_weight="balanced"` and a threshold sweep.

Sheets: [splits and search](#/sheet/sk-cv), [metrics](#/sheet/sk-metrics), [formulas](#/sheet/met-formulas).
""",
    },
    {
        "id": "read-E",
        "code": "E0",
        "group": "stats",
        "order": 0,
        "type": "reading",
        "title": "Probability and statistics",
        "minutes": 9,
        "body": """
Two numeric items, answers to three decimals. A wrong third digit is a miss. Write the fraction first, then divide, then round. Do not round the pieces early.

These worked examples are not the graded questions. Same formulas, different numbers.

## Probability

Independent events multiply. Mutually exclusive events add. The complement is often shorter: `P(at least one) = 1 - P(none)`.

Two fair dice. P(sum is 9) = 4/36 = 0.111. The pairs are (3,6), (4,5), (5,4), (6,3).

## Bayes

Prevalence 1%, sensitivity 99%, specificity 99%. A person tests positive.

```text
P(D|+) = P(+|D) P(D) / P(+)
P(+) = 0.99 * 0.01 + 0.01 * 0.99 = 0.0198
P(D|+) = 0.0099 / 0.0198 = 0.500
```

A rare event stays uncertain when the false-positive rate is on the same scale as the prevalence. Write the four counts in a population of 10,000 if the algebra feels slippery: 100 sick, 99 true positives, 9,900 well, 99 false positives, 99/198 = 0.500.

```python
tp, fp = 0.99 * 0.01, 0.01 * 0.99
print(round(tp / (tp + fp), 3))
```

## Total probability, then Bayes again

Machine A makes 30% of parts and 1% are defective. Machine B makes 70% and 4% are defective.

```text
P(defect) = 0.30 * 0.01 + 0.70 * 0.04 = 0.031
P(A|defect) = 0.003 / 0.031 = 0.097
```

Round 0.0968 to 0.097.

## Expectation and variance

A bet pays +8 with probability 0.25, +0 with probability 0.50, and -4 with probability 0.25.

```text
E = 8*0.25 + 0*0.50 + (-4)*0.25 = 1
E[X^2] = 64*0.25 + 0 + 16*0.25 = 20
Var = 20 - 1^2 = 19
```

`Var(X) = E[X^2] - (E[X])^2`. The second term uses the square of the mean, not the mean of the square.

## Binomial and Poisson

Binomial: n independent trials, probability p, `P(X=k) = C(n,k) p^k (1-p)^(n-k)`.

n=5, p=0.2, P(X=1) = 5 * 0.2 * 0.8**4 = 5 * 0.2 * 0.4096 = 0.410.

```python
from math import comb
print(round(comb(5, 1) * (0.2) * (0.8 ** 4), 3))
```

Poisson with mean lambda: `P(X=k) = e^(-lambda) * lambda^k / k!`. P(X=0) = e^(-lambda). lambda=1, P(X>=1) = 1 - e^(-1) = 0.632.

## Normal and a confidence interval

When the prompt gives a z value, use it. Do not invent a finer table.

Sample mean 20, known sigma 4, n=64. Standard error = 4/8 = 0.5. A 95% interval that uses 1.96 has margin 1.96 * 0.5 = 0.980, so the upper end is 20.980.

`P(Z > 1) ≈ 0.159` and `P(Z > 1.96) = 0.025` are the two values worth having in your head. Standardise first: `z = (x - mu) / sigma`.

## Hypothesis tests

A fair coin, 8 heads in 10 flips, two-sided p-value.

```text
P(X>=8) = (C(10,8)+C(10,9)+C(10,10)) / 1024 = 56/1024
two-sided = 112/1024 = 0.109
```

The distribution is symmetric, so the lower tail `P(X<=2)` equals the upper tail. If you are asked for the conclusion at alpha 0.05, 0.109 does not reject. Type I error is rejecting a true null, and its rate is alpha when the test is run as designed. Type II is failing to reject a false null. The p-value is not the probability that the null is true.

## Combinatorics

Committee of 3 from 4 women and 3 men, at least one of each gender.

```text
C(7,3) = 35
all women C(4,3)*C(3,0) = 4
all men C(4,0)*C(3,3) = 1
valid = 35 - 5 = 30
P = 30/35 = 0.857
```

Subtract the illegal committees from the total when "at least" gets messy.

## Geometric waiting time

Probability p of success each trial, independent. P(first success on trial k) = `(1-p)^(k-1) * p`. P(it takes more than k trials) = `(1-p)^k`. Mean wait is `1/p`.

p=0.25, first success on trial 3: 0.75**2 * 0.25 = 0.141.

## Pitfalls

- Rounding 0.2045 to 0.205, then to 0.21. Divide the exact fraction and round once, to three decimals.
- Using population counts in Bayes and forgetting the false positives.
- A two-sided p-value reported as one tail.
- `C(n,k)` off by one. `C(5,1)` is 5, `C(5,2)` is 10.
- Confidence interval for a mean written with sigma instead of `sigma/sqrt(n)`.

## What you must memorise

- Bayes in counts, not only in symbols.
- `P(A|B) = P(B|A)P(A) / P(B)` and the law of total probability.
- `E[X]`, `Var = E[X^2] - (E[X])^2`.
- Binomial coefficient times the two powers. Poisson `e^(-lambda)` for zero events.
- Standard error `sigma/sqrt(n)`, margin `z * SE`, Gini is not this page.
- Two-sided coin p-value doubles one symmetric tail.
- Complement counting for "at least". Geometric: `(1-p)^(k-1) * p`, mean `1/p`.

Sheet: [metric and probability formulas](#/sheet/met-formulas).
""",
    },
    {
        "id": "read-F",
        "code": "F0",
        "group": "ml",
        "order": 0,
        "type": "reading",
        "title": "ML theory",
        "minutes": 8,
        "body": """
The multiple-choice block is about judgment, not syntax. Several items are select-all. A single wrong tick fails the item. Read every option as its own true or false statement.

## Bias and variance

Bias is systematic error from a model that is too rigid. Variance is sensitivity to the particular sample.

- High bias: train and test are both weak, and the errors look similar. A linear model on a clearly curved relationship.
- High variance: train looks excellent, test falls apart. A deep tree, or k=1 nearest neighbours.
- More data reduces variance. It does not fix a wrong functional form.
- Regularisation and a smaller model trade variance for bias.

## L1 and L2

L2 (ridge) shrinks coefficients toward zero and rarely sets them to exactly zero. L1 (lasso) can set coefficients to exactly zero, so it is a feature selector as well as a shrinker. Elastic net is the mixture.

Standardise inputs before either penalty, or the penalty punishes the unit of measure instead of the signal. The penalty is chosen on validation data, not on the test set and not by staring at training accuracy.

## Bagging, forests, boosting

Bagging fits models on bootstrap samples and averages them. Random forests add random feature subsets at each split. The point is variance reduction. Trees stay deep.

Boosting fits the next model on the residuals or on reweighted errors of the previous ones. It is sequential. Gradient boosting is the usual form. It can overfit. Shallow trees, a small learning rate, and early stopping are the controls.

A forest is not "more accurate than boosting" as a law. Boosting often wins on structured tabular data and is easier to overfit. Forests are harder to overfit and awkward to extrapolate. Neither replaces a linear model when the signal is linear and the audience wants coefficients.

## K nearest neighbours

`k=1` memorizes the training set: low bias, high variance. Larger `k` smooths the boundary: bias up, variance down. Scale the features or the coordinate with the larger unit dominates the distance.

In high dimension, distances concentrate: the nearest neighbour is not much nearer than the furthest. That is the curse of dimensionality. KNN is a poor default once you have dozens of sparse features.

## Logistic regression

The model is a linear score passed through a sigmoid. The coefficient is a change in log odds. A coefficient of 0.7 means the odds multiply by `exp(0.7) ≈ 2` for a one-unit increase, holding the other features fixed.

The training loss is log loss, not accuracy. Accuracy is not differentiable and ignores how confident the wrong predictions were. The output is a probability only after the model is actually fit by maximum likelihood (or a close regularised cousin), not because the sigmoid squashes to (0, 1). You still have to calibrate if you need the probabilities to match observed frequencies.

## Neural nets, the interview version

- Sigmoid and tanh saturate. Gradients vanish in deep stacks. ReLU and its variants are the default hidden activation because they stay responsive for positive inputs.
- A sigmoid on the output is for a single probability. Softmax is for mutually exclusive classes. Neither belongs on a regression output.
- Dropout randomly drops units while training and scales the rest. It is a regulariser. Turn it off at prediction time. Frameworks do that if you use the train/eval switch. Forgetting the switch is a classic bug.
- More layers are not free generalisation. They add capacity, which can add variance.

## Metrics and selection bias

Accuracy is the wrong headline when the positive class is rare. A fraud model that flags nobody can be 99.9% accurate.

Precision answers "when we act, how often are we right?". Recall answers "of the cases we care about, how many did we catch?". The threshold moves you along that trade-off. AUC summarises ranking and can look healthy while precision at the only operating point you can afford is useless.

Selection bias: the rows you train on are not the rows you will score. A churn model fit only on customers who already called support does not estimate churn for the whole base. A credit model fit only on approved applicants never sees the rejects. Splitting a leaked sample into train and test does not fix that. The leak is in who entered the sample.

## Pitfalls

- Calling L2 a sparsity method.
- Saying boosting averages independent models. That is bagging.
- Treating AUC as a business metric. The business metric is at a threshold.
- Describing dropout as a way to drop features permanently.
- "We cross-validated, so there is no leakage." Target leakage and selection bias survive random splits.

## What you must memorise

- Bias versus variance, and which knob moves which.
- L1 can zero a coefficient. L2 shrinks it.
- Bagging is parallel variance reduction. Boosting is sequential.
- Larger k in KNN: smoother, more bias, less variance. Scale the inputs.
- Logistic coefficient: change in log odds. Loss: log loss.
- ReLU in the hidden layers, sigmoid or softmax at the output, dropout only while training.
- Precision, recall, the failure of accuracy under imbalance, selection bias.

Sheets: [regularisation and metrics](#/sheet/sk-metrics), [formulas](#/sheet/met-formulas).
""",
    },
    {
        "id": "read-G",
        "code": "G0",
        "group": "numpy",
        "order": 0,
        "type": "reading",
        "title": "NumPy from scratch",
        "minutes": 7,
        "body": """
These tasks ban pandas and, for a couple of them, scikit-learn. You implement the operation with arrays. The arithmetic is the same arithmetic you already trust. The failure mode is shape.

## Broadcasting

```python
import numpy as np
x = np.array([[1.0, 2.0, 3.0], [3.0, 6.0, 9.0]])
mu = x.mean(axis=0)
sd = x.std(axis=0, ddof=1)
z = (x - mu) / sd
print(z.round(3))
```

`mean(axis=0)` is one value per column, shape `(n_features,)`. Subtracting it from `(n_rows, n_features)` aligns the last axis. If you needed a per-row statistic you would reshape to `(n_rows, 1)` or reduce `axis=1` and use `keepdims=True`.

`np.std` defaults to `ddof=0`. Pandas defaults to `ddof=1`. The prompt will say which. Match it.

A mask:

```python
a = np.array([0.0, -1.0, 4.0, 9.0])
print(a[a > 0].mean())
```

## Linear regression by the normal equation

With a column of ones in `X` and targets `y`:

```text
beta = (X' X)^{-1} X' y
```

```python
X_raw = np.array([[1.0], [2.0], [3.0], [4.0]])
y = np.array([3.0, 5.0, 7.0, 9.0])
X = np.column_stack([np.ones(len(X_raw)), X_raw])
beta = np.linalg.lstsq(X, y, rcond=None)[0]
print(beta)  # intercept 1, slope 2
```

`lstsq` is more stable than an explicit inverse and is the call to memorise. Predictions are `X_new @ beta`. Gradient descent is the same objective: walk `beta` against `X' (X beta - y) / n`. You only need it if the prompt says "by gradient descent".

## K-means

Assign each point to the nearest centroid, then move each centroid to the mean of its points. Repeat. With a fixed initialisation and a fixed number of iterations the result is deterministic. Break distance ties by the lower centroid index so your labels match the tests.

```python
points = np.array([[0.0, 0.0], [0.2, 0.1], [5.0, 5.0], [5.2, 4.8]])
centroids = np.array([[0.0, 0.0], [5.0, 5.0]])
# one assignment step
d = ((points[:, None, :] - centroids[None, :, :]) ** 2).sum(axis=2)
labels = d.argmin(axis=1)
print(labels)
```

`points[:, None, :]` has shape `(n, 1, d)` and `centroids[None, :, :]` has shape `(1, k, d)`. The subtraction broadcasts to `(n, k, d)`.

## Confusion matrix and AUC

```python
y = np.array([0, 0, 1, 1])
pred = np.array([0, 1, 1, 1])
tp = int(((pred == 1) & (y == 1)).sum())
fp = int(((pred == 1) & (y == 0)).sum())
fn = int(((pred == 0) & (y == 1)).sum())
tn = int(((pred == 0) & (y == 0)).sum())
precision = tp / (tp + fp)
recall = tp / (tp + fn)
```

AUC without sklearn, for a small set: sort by score descending, walk the ROC curve, and add trapezoid areas. Ties in the score get a diagonal step (the rank method), which is what `roc_auc_score` does. For a first implementation with no tied scores:

```python
def auc(y, scores):
    order = np.argsort(-scores)
    y = np.asarray(y)[order]
    P = (y == 1).sum()
    N = (y == 0).sum()
    tp = fp = 0.0
    area = 0.0
    prev_fpr, prev_tpr = 0.0, 0.0
    for label in y:
        tp += label == 1
        fp += label == 0
        tpr, fpr = tp / P, fp / N
        area += (fpr - prev_fpr) * (tpr + prev_tpr) / 2
        prev_fpr, prev_tpr = fpr, tpr
    return area
```

## Pitfalls

- `axis` direction. Print `array.shape` when a test says the shape is wrong.
- Forgetting `keepdims` and subtracting a row vector from columns.
- `ddof`.
- An explicit matrix inverse on a singular `X'X`. Use `lstsq`.
- K-means labels swapped because the centroid order changed. Keep the initial centroid order.

## What you must memorise

- Broadcasting aligns trailing axes. `keepdims=True` when you will broadcast back.
- `ddof=0` versus `ddof=1`.
- `np.column_stack` and `np.linalg.lstsq(X, y, rcond=None)[0]`.
- K-means: squared distance, `argmin`, mean update.
- Confusion counts from boolean masks. AUC as a ROC trapezoid.

Sheets: [broadcasting](#/sheet/np-broadcast), [least squares](#/sheet/np-lstsq).
""",
    },
    {
        "id": "read-H",
        "code": "H0",
        "group": "sqlalgo",
        "order": 0,
        "type": "reading",
        "title": "SQL and algorithms",
        "minutes": 7,
        "body": """
Older rounds and some screens still include a SQL item or a short algorithm. The coding style is the same as the pandas tasks: exact columns, exact filter, no extras.

## SQL joins, group, having

```sql
SELECT c.segment AS segment,
       ROUND(SUM(o.amount), 2) AS revenue,
       COUNT(*) AS orders
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'paid'
GROUP BY c.segment
HAVING COUNT(*) >= 2
ORDER BY segment;
```

`WHERE` filters rows before the aggregation. `HAVING` filters groups after it. `COUNT(*)` counts rows. `COUNT(amount)` skips null amounts. The tests compare column names, so alias them to the names in the prompt.

SQLite, which this trainer uses, wants `ORDER BY` if you depend on order. There is no `FULL OUTER JOIN`. A missing match is a `LEFT JOIN`. Strings concatenate with `||`.

## Windows

```sql
SELECT category, product, revenue,
       RANK() OVER (PARTITION BY category ORDER BY revenue DESC) AS rnk
FROM products;
```

`RANK` ties get the same rank and the next rank skips. `ROW_NUMBER` never ties. `DENSE_RANK` does not skip. `LAG(revenue) OVER (ORDER BY month)` is the previous row's revenue in that order, and it is null on the first row.

A top-N per group is a window in a subquery, then `WHERE rnk <= 2` outside. You cannot filter a window alias in the same `WHERE`.

```sql
SELECT month, revenue,
       revenue - LAG(revenue) OVER (ORDER BY month) AS delta
FROM monthly
ORDER BY month;
```

## Hash map

Two-sum: walk left to right, and for each value ask whether `target - value` is already in a dict of values you have seen. Store the index. Return on the first hit. That pair finishes earliest.

```python
def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i
    return []
```

The dict is a hash map. Average lookup is constant time. A nested loop is the version that times out once the list grows, including in an interview follow-up.

## Intervals and a sliding window

Merge overlapping intervals by sorting on the start, then extending the end of the open interval while the next start falls inside it.

```python
def merge_intervals(intervals):
    intervals = sorted(intervals)
    out = [list(intervals[0])]
    for start, end in intervals[1:]:
        if start <= out[-1][1]:
            out[-1][1] = max(out[-1][1], end)
        else:
            out.append([start, end])
    return out
```

Touching endpoints (`[1,4]` and `[4,5]`) overlap if the prompt says a closed interval. Read that sentence.

A fixed-length sliding window keeps a running sum. Add the new element, drop the element that fell out, and update the maximum. The window has length `k`, so this is linear, not a double loop.

```python
def max_window(nums, k):
    total = sum(nums[:k])
    best = total
    for i in range(k, len(nums)):
        total += nums[i] - nums[i - k]
        best = max(best, total)
    return best
```

## Pitfalls

- `HAVING` used to filter a raw column that is not aggregated. That belongs in `WHERE`.
- Filtering `RANK()` in the same query level.
- `COUNT(*)` versus counting a nullable column.
- Two-sum returning the later pair because the function kept scanning.
- Intervals sorted by the end, or a `<` where the prompt's endpoints are closed.
- Off-by-one when the window slides: subtract `nums[i - k]`, not `nums[i - k + 1]`.

## What you must memorise

- `JOIN` / `LEFT JOIN`, `GROUP BY`, `HAVING`, `ORDER BY`.
- `RANK() OVER (PARTITION BY ... ORDER BY ...)`, `LAG`.
- Dict two-sum, returning at the first hit.
- Sort-and-merge intervals.
- Fixed window: add the incoming, subtract the outgoing.

Sheets: [SQL joins](#/sheet/sql-join), [windows](#/sheet/sql-window).
""",
    },
    {
        "id": "read-I",
        "code": "I0",
        "group": "cases",
        "order": 0,
        "type": "reading",
        "title": "Senior case frameworks",
        "minutes": 10,
        "body": """
Later rounds are spoken or written cases. There is no unit test. A principal-level answer makes a decision, names the metric, and says what would change your mind. A tour of algorithms without a decision reads as junior, however fluent it is.

Structure every answer in the same order. The listener can follow it, and you will not forget the business half under pressure.

1. Decision and metric.
2. Baseline, and what "good" means in money or hours.
3. Data, grain, and leakage.
4. Method, only as much as the decision needs.
5. Validation.
6. Constraints and the thing you will actually optimise.
7. How it runs in production, and what you watch.
8. What you would do this month, and what you would not do.

## Demand forecasting

Open with the decision the forecast serves: buy, roster, or allocate. A forecast without a decision is a chart.

Grain: sku × store × week is different from category × country × month. Say which one, and why the decision sits there.

Metrics, and why one number is not enough:

- MAE in units, when the cost of an error is roughly flat.
- RMSE when large misses are disproportionately expensive.
- MAPE punishes the same unit error more on a small sku. It explodes when actuals are zero.
- WAPE is the sum of absolute errors divided by the sum of actuals. It behaves on a mix of fast and slow sellers. Prefer it over a raw average of MAPEs.
- Bias is signed error. A model can have a flattering WAPE and still systematically overbuy.

Baseline: seasonal naive, or last year times a growth factor. If you cannot beat that, you do not have a model yet.

Features that usually earn their place: lags, rolling means at the seasonal period, calendar and promo flags, price, and stockout indicators so you do not learn demand from weeks you had nothing to sell. Hierarchical reconciliation matters when the buying decision is at category level and the history is at sku level.

Intermittent demand is a different problem. A weekly mean of a sku that sells twice a quarter is not a forecast, it is a smear. Croston-style rate and size, or a hurdle (probability of any sale, then size), then a safety stock on top. Say so.

Cold start: borrow strength from similar stores or similar skus, and put a wide interval on it. Do not present a point forecast for a new store as if it had the history of an old one.

## Churn

Predicting churn is not the decision. Whom to call, given a budget, is the decision.

A model of `P(churn)` ranks risk. It does not rank the effect of the call. The customers most likely to leave can be the ones a discount will not save, or the ones who would have stayed. If the action is expensive, ask for uplift: the change in probability caused by the treatment. If you cannot estimate uplift yet, say so, and use risk times value times a conservative save-rate from a test.

Validation: a time split. Random rows leak future behaviour of the same customer. The positive class is the definition of churn you can act on, written down: 30 days inactive, contract not renewed, whatever the P&L uses. A cleverer label that ops cannot see is not a better label.

Money: expected value of contacting a customer is `uplift × margin − cost`. Take customers in that order until the budget stops. Report the baseline "call the highest risk" so the gain from the model is visible.

## Pricing and optimisation

Name the decision variable before the model. Price by sku-day, markdown percent by week, or offer size. Then the objective: contribution, not revenue, unless they truly want revenue. Then the constraints you were given and the ones you should ask about: price floor and ceiling, capacity, inventory that must clear, competitor index, brand rules, how often a price may move.

A demand model that says "quantity falls in price" is an input to the optimisation, not the answer. The answer is the price. If you only have time for one method, a log-log elasticity with a few controls and a grid of feasible prices beats an elaborate model you cannot constrain.

Say what is identified. Observational price changes are mixed up with promotions, stockouts, and season. A randomised price test on a slice of skus is the honest design. Until that exists, present the elasticity as directional and keep the first price move small.

Cannibalisation and complement effects decide whether sku-by-sku optimisation is even valid. If you ignore them, say that the recommendation is partial.

## ML system design

Pick a serving pattern and stick to it.

- Batch scores overnight into the CRM, for a weekly outbound list. Features are built as of yesterday. This covers most churn and propensity work.
- Request/response, for a price or a fraud decision while the customer is waiting. Latency budget, timeout behaviour, and a fallback score are part of the design, not an appendix.

Walk the path of one prediction: event, feature lookup, model, decision policy, log. The log is how you will know next month whether the model still works. Store the features that were actually used, the score, the policy version, and the outcome when it arrives.

Training-serving skew is the failure mode to name out loud. The same definition of "last 7 day spend" has to run offline and online. A feature store, even a plain scheduled table, is the remedy you should propose before a new model class.

Monitoring: stability of the score distribution, a few key features, and the business rate (approval, contact, fraud catch) on a delay. AUC on last month's labels is necessary and late. The early alarm is the input drift and the decision rate.

Governance: who can approve a model, what the challenger is, and how you roll back. For anything customer-facing, a human appeal path and a documented reason code matter more than a second hidden layer.

## Business impact, said plainly

Translate the metric into the P&L unit the room uses. "AUC 0.81" is not impact. "About 40 fewer missed fraud cases a week at the same review headcount, worth roughly X, if the pilot matches the backtest" is impact. Put a range on it. State the assumption that moves the range the most.

Compare to the baseline policy, not to a world where the company does nothing. Most companies already have a rule.

Say what you would not build. A real-time system for a decision that is taken once a week is a common waste. So is a model before the label is defined.

## Pitfalls

- Leading with the algorithm.
- MAPE on intermittent series, presented as the single number.
- Churn accuracy with no budget and no uplift.
- An unconstrained "optimal price".
- A system diagram with no fallback, no log, and no owner.
- A benefit case with no baseline.

## What you must memorise

- Decision, metric, baseline, leakage, validation, constraint, production, money.
- WAPE and bias next to MAE. MAPE's failure at zero.
- Churn: time split, uplift or an explicit save-rate, value minus cost.
- Pricing: decision variable, contribution, constraints, what is not identified.
- Batch versus real-time, training-serving skew, log the features you scored.
- Impact in the P&L unit, against the current policy, with a range.

Sheets: [forecasting](#/sheet/case-forecast), [churn](#/sheet/case-churn), [pricing](#/sheet/case-price), [system design](#/sheet/case-system).
""",
    },
]
