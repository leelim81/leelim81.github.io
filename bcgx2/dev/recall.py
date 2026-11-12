"""Code recall: the imports and arguments the three coding tasks lean on, as fill-in cards.

A card is a short job, a few lines of code with one or more blanks, and one line on why it matters.
In the code, {{answer}} marks a blank and {{answer|other}} lists every spelling that is accepted.

Nothing here is taken on trust. The build runs each card with its answers filled in and checks the
result, runs every accepted alternative the same way, and confirms that the listed wrong answers fail.
"""
import re

GROUPS = [
    dict(id=3, title="Data collection", blurb="Read the files, join them, summarize, and save one exact table."),
    dict(id=4, title="Data processing", blurb="Impute, encode, scale, and bin, with every number learned from train."),
    dict(id=5, title="Model development", blurb="Import, split, fit, predict, and score without a lookup."),
]

# ---- what each group's cards can assume: files on disk and tables in memory -------------------
COMMON = '''
import json
import numpy as np
import pandas as pd
'''

SETUP = {
    3: COMMON + '''
with open("orders.csv", "w") as f:
    f.write("order_id,customer_id,order_date,amount,status\\n"
            "1,10,2023-03-01,20.0,shipped\\n2,10,2023-03-15,35.5,delivered\\n"
            "3,11,2023-04-02,12.0,cancelled\\n4,12,2023-04-20,50.0,shipped\\n5,99,2023-05-05,8.0,shipped\\n")
with open("prices.csv", "w") as f:
    f.write("sku;price\\nA1;3,50\\nB2;10,00\\n")
with open("stores.csv", "w") as f:
    f.write("store_id,city\\n00412,Lyon\\n00007,Turin\\n")
with open("events.jsonl", "w") as f:
    f.write('{"user": 1, "event": "view"}\\n{"user": 2, "event": "buy"}\\n')
with open("config.json", "w") as f:
    json.dump({"shop": "north", "orders": [{"id": 1, "total": 20.0}, {"id": 2, "total": 12.0}]}, f)
orders = pd.read_csv("orders.csv", parse_dates=["order_date"])
customers = pd.DataFrame({"customer_id": [10, 11, 12, 13], "name": ["Ana", "Ben", "Cy", "Di"]})
people = customers.rename(columns={"customer_id": "id"})
jan, feb, mar = orders.iloc[:2], orders.iloc[2:4], orders.iloc[4:]
counts = orders.groupby("customer_id").size().reset_index(name="n_orders")
joined = customers.merge(counts, on="customer_id", how="left")
raw = pd.Series(["2023-03-01", "not a date", "2023-04-15"])
''',
    4: COMMON + '''
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler
train = pd.DataFrame({
    "age": [22.0, 35.0, None, 51.0, 44.0, 29.0],
    "income": [1800.0, 3200.0, 2500.0, 9100.0, 4000.0, 2700.0],
    "city": ["Lyon", "Turin", "Lyon", np.nan, "Lyon", "Turin"],
    "size": ["S", "M", "L", "M", "S", "M"],
    "condition": ["poor", "good", "fair", "good", "poor", "fair"],
})
test = pd.DataFrame({
    "age": [None, 61.0, 19.0],
    "income": [2100.0, 15000.0, 900.0],
    "city": ["Oslo", "Lyon", np.nan],
    "size": ["M", "XL", "S"],
    "condition": ["fair", "good", "poor"],
})
cols = ["age", "income"]
''',
    5: COMMON + '''
from sklearn.compose import ColumnTransformer
from sklearn.datasets import make_classification
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import GridSearchCV, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
_X, _y = make_classification(n_samples=300, n_features=6, n_informative=4, weights=[0.75], random_state=0)
train = pd.DataFrame(_X, columns=[f"f{i}" for i in range(6)])
train["plan"] = np.where(train["f0"] > 0, "pro", "basic")
train["churn"] = _y
num_cols, cat_cols = [f"f{i}" for i in range(6)], ["plan"]
X, y = train.drop(columns=["churn"]), train["churn"]
X_tr, X_va, y_tr, y_va = train_test_split(X[num_cols], y, test_size=0.2, random_state=42, stratify=y)
model = LogisticRegression(max_iter=1000).fit(X_tr, y_tr)
p = model.predict_proba(X_va)[:, 1]
pred = (p >= 0.5).astype(int)
''',
}

CARDS = []
BLANK = re.compile(r"\{\{(.+?)\}\}")
WIDE = 12  # every blank is at least this many characters wide, so its size gives nothing away


def card(id, group, prompt, code, note, check, setup="", wrong=None, any_case=False, width=WIDE):
    """wrong maps a blank's position to answers that must NOT pass (they raise, or they fail the check)."""
    code = code.strip("\n")
    assert BLANK.search(code), id
    CARDS.append(dict(id=id, group=group, prompt=prompt, code=code, note=note, check=check, setup=setup.strip("\n"),
                      wrong=wrong or {}, any_case=any_case, width=width))


# ---- data collection ----------------------------------------------------------------------------
card("read-dates", 3, "Read orders.csv so that order_date holds real dates, not text.",
     'orders = pd.read_csv("orders.csv", {{parse_dates}}=["order_date"])',
     "Without it the column stays text, and comparing dates compares strings.",
     'str(orders["order_date"].dtype).startswith("datetime64")')

card("read-sep", 3, "prices.csv puts semicolons between its columns.",
     'prices = pd.read_csv("prices.csv", {{sep|delimiter}}=";")',
     'sep="\\t" reads tab-separated files, and decimal="," reads 3,50 as a number.',
     'list(prices.columns) == ["sku", "price"]')

card("read-dtype", 3, "Keep the leading zeros of store_id, such as 00412.",
     'stores = pd.read_csv("stores.csv", {{dtype|converters}}={"store_id": str})',
     "pandas reads 00412 as the number 412 unless you say that the column is text.",
     'stores["store_id"].tolist() == ["00412", "00007"]')

card("read-jsonl", 3, "Each line of events.jsonl is one JSON record.",
     'events = pd.read_json("events.jsonl", {{lines}}=True)',
     "Without lines=True, pandas expects one JSON document and stops with a trailing data error.",
     "events.shape == (2, 2)")

card("json-load", 3, "Read a JSON file into Python dictionaries and lists.", '''
with open("config.json") as f:
    data = json.{{load}}(f)
''', "json.load reads from an open file. json.loads reads from a string.",
     'data["shop"] == "north"', wrong={0: ["loads"]})

card("merge-left", 3, "Add the customer name to every order. Keep the orders that have no matching customer.",
     'out = orders.merge(customers, on="customer_id", how="{{left}}")',
     'The default is how="inner", which drops unmatched rows without a word.',
     'len(out) == len(orders) and out["name"].isna().sum() == 1', wrong={0: ["inner", "outer", "right"]})

card("merge-keys", 3, "The key is called customer_id in orders and id in people.", '''
out = orders.merge(
    people, {{left_on}}="customer_id", {{right_on}}="id", how="left")
''', "Both key columns stay in the result. Drop the one you don't need.",
     'len(out) == 5 and "name" in out.columns')

card("merge-indicator", 3, "Find the customers who have no orders at all.", '''
m = customers.merge(
    orders, on="customer_id", how="left", {{indicator}}=True)
no_orders = m[m["_merge"] == "left_only"]
''', "indicator=True adds a _merge column that says left_only, right_only, or both.",
     'no_orders["customer_id"].tolist() == [13]')

card("concat", 3, "Stack three monthly tables into one, with a clean index from 0.",
     "all_orders = pd.concat([jan, feb, mar], {{ignore_index}}=True)",
     "concat takes a list of tables. DataFrame.append was removed in pandas 2.",
     "all_orders.index.tolist() == [0, 1, 2, 3, 4]")

card("groupby-agg", 3, "One row per customer, with the number of orders and the total amount. Keep customer_id as a normal column.", '''
by = orders.groupby("customer_id", {{as_index}}=False)
per_customer = by.{{agg|aggregate}}(
    n_orders=("order_id", "count"),
    total=("amount", "sum"),
)
''', "Each new column is written as name=(source column, function).",
     'list(per_customer.columns) == ["customer_id", "n_orders", "total"]')

card("reset-index", 3, "Count the orders of each customer, as a table with a column called n_orders.", '''
counts = (orders.groupby("customer_id").size()
          .{{reset_index}}({{name}}="n_orders"))
''', "size counts rows. reset_index moves the group key back into a column, and name labels the counts.",
     'list(counts.columns) == ["customer_id", "n_orders"]')

card("fillna-astype", 3, "After a left join, n_orders has gaps and has turned into floats. Make the gaps 0 and the column whole numbers.",
     'joined["n_orders"] = joined["n_orders"].{{fillna}}(0).{{astype}}(int)',
     "One NaN turns an integer column into floats, so 3 would be saved as 3.0.",
     'joined["n_orders"].tolist() == [2, 1, 1, 0] and joined["n_orders"].dtype.kind == "i"')

card("sort-desc", 3, "Sort the orders by amount, largest first.",
     'top = orders.sort_values("amount", {{ascending}}=False)',
     'To break ties, pass lists: sort_values(["amount", "order_id"], ascending=[False, True]).',
     'top["amount"].tolist() == sorted(orders["amount"], reverse=True)')

card("to-csv", 3, "Save the table without the extra index column.",
     'orders.to_csv("result.csv", {{index}}=False)',
     "The default writes the index as an unnamed first column, and an exact-match check then fails.",
     'pd.read_csv("result.csv").columns[0] == "order_id"')

card("to-datetime", 3, "Convert text to dates. A bad value should become missing, not raise an error.",
     'dates = pd.to_datetime(raw, {{errors}}="coerce")',
     "The same argument works in pd.to_numeric.",
     "dates.isna().sum() == 1")

card("strftime", 3, "Label each order with its month, written like 2023-03.",
     'orders["month"] = orders["order_date"].dt.{{strftime}}("{{%Y-%m}}")',
     "%Y is the 4-digit year, %m the month, and %d the day.",
     'orders["month"].tolist()[:3] == ["2023-03", "2023-03", "2023-04"]', wrong={1: ["%y-%m", "%Y-%M"]})

card("drop-duplicates", 3, "Keep only the latest order of each customer.", '''
latest = (orders.sort_values("order_date")
          .drop_duplicates("customer_id", {{keep}}="last"))
''', "The default keeps the first row of each group, so sort before you drop.",
     'len(latest) == 4 and latest.set_index("customer_id").loc[10, "order_id"] == 2')

card("rename", 3, "Rename the column amount to amount_eur.",
     'orders = orders.rename({{columns}}={"amount": "amount_eur"})',
     "rename returns a new table. Assign it, or nothing changes.",
     '"amount_eur" in orders.columns and "amount" not in orders.columns', wrong={0: ["index"]})

# ---- data processing ----------------------------------------------------------------------------
card("impute-train", 4, "Fill the missing ages in test with a median. Which table does the median come from?",
     'test["age"] = test["age"].fillna({{train}}["age"].median())',
     "Every statistic comes from train and is then applied to test. Taking it from test is leakage.",
     'test["age"].iloc[0] == 35.0', wrong={0: ["test"]})

card("import-impute", 4, "Import the imputer.",
     "from sklearn.{{impute}} import SimpleImputer",
     "Imputers have a module of their own. They are not in sklearn.preprocessing.",
     'SimpleImputer.__name__ == "SimpleImputer"', wrong={0: ["preprocessing", "imputer"]})

card("imputer-strategy", 4, "Fill the gaps in a text column with its most common value.", '''
imp = SimpleImputer({{strategy}}="{{most_frequent}}")
train[["city"]] = imp.fit_transform(train[["city"]])
''', "The other strategies are mean, median, and constant. The default is mean.",
     'train["city"].tolist()[3] == "Lyon"', wrong={1: ["mode", "most_common"]})

card("import-preprocessing", 4, "Import the scaler and the one-hot encoder.",
     "from sklearn.{{preprocessing}} import StandardScaler, OneHotEncoder",
     "Scalers and encoders live together in sklearn.preprocessing.",
     'StandardScaler.__name__ == "StandardScaler"', wrong={0: ["preprocess", "processing"]})

card("fit-transform", 4, "Learn the scaling from train, then apply the same scaling to test.", '''
sc = StandardScaler()
train[cols] = sc.{{fit_transform}}(train[cols])
test[cols] = sc.{{transform}}(test[cols])
''', "fit_transform on test would rescale it with its own mean and spread. That is leakage.",
     'abs(train["income"].mean()) < 1e-9 and abs(test["income"].mean()) > 0.01', wrong={1: ["fit_transform"]})

card("onehot-unknown", 4, "The size XL appears only in test. Encoding it must not raise an error.", '''
enc = OneHotEncoder({{handle_unknown}}="ignore")
enc.fit(train[["size"]])
coded = enc.transform(test[["size"]])
''', "The unseen value becomes a row of zeros. The result is a sparse matrix, and .toarray() shows it.",
     "coded.shape == (3, 3) and coded.toarray()[1].sum() == 0")

card("feature-names", 4, "Get the names of the columns that the encoder made.",
     "names = enc.{{get_feature_names_out}}()",
     "Use them as the column names when you put the encoded values back into a table.",
     'list(names) == ["size_L", "size_M", "size_S"]',
     setup='enc = OneHotEncoder(handle_unknown="ignore").fit(train[["size"]])')

card("dummies-reindex", 4, "One-hot encode test with get_dummies so that it has exactly the training columns.", '''
tr = pd.get_dummies(train, columns=["size"])
te = pd.get_dummies(test, columns=["size"]).{{reindex}}(
    columns=tr.columns, {{fill_value}}=0)
''', "get_dummies only sees the values in the table you give it, so train and test can come out with different columns.",
     'list(te.columns) == list(tr.columns) and te["size_L"].tolist() == [0, 0, 0]')

card("ordinal-categories", 4, "Encode poor, fair, good as 0, 1, 2, in that order.", '''
enc = OrdinalEncoder({{categories}}=[["poor", "fair", "good"]])
codes = enc.fit_transform(train[["condition"]])
''', "Without it the order is alphabetical: fair, good, poor.",
     "codes.ravel().tolist() == [0.0, 2.0, 1.0, 2.0, 0.0, 1.0]")

card("cut", 4, "Cut age into fixed bands: under 30, 30 to 49, and 50 or more.", '''
train["band"] = pd.cut(
    train["age"],
    {{bins}}=[0, 30, 50, np.inf],
    {{labels}}=["young", "mid", "senior"],
    right=False,
)
''', "right=False makes each band include its left edge: [0, 30), [30, 50), [50, inf).",
     'train["band"].dropna().tolist() == ["young", "mid", "senior", "mid", "young"] and train["band"].isna().sum() == 1')

card("qcut", 4, "Split income into 3 groups with the same number of rows in each.", '''
train["tier"] = pd.{{qcut}}(
    train["income"], 3, labels=["low", "mid", "high"])
''', "cut uses edges of equal width. qcut uses quantiles, so the groups are equal in size.",
     'train["tier"].value_counts().tolist() == [2, 2, 2]', wrong={0: ["cut"]})

card("clip-quantile", 4, "Cap the incomes in test at the 5th and 95th percentiles of train.", '''
lo, hi = train["income"].{{quantile}}([0.05, 0.95])
test["income"] = test["income"].{{clip}}(lo, hi)
''', "The limits come from train, and the same limits are used on test.",
     'test["income"].max() == hi and test["income"].min() == lo and 1800 < lo < hi < 9100')

card("log1p", 4, "Shrink a long right tail with a log that is safe at zero.",
     'train["income_log"] = np.{{log1p}}(train["income"])',
     "log1p(x) is log(1 + x), so 0 stays 0. np.expm1 turns a prediction back.",
     'abs(train["income_log"].iloc[0] - np.log(1801.0)) < 1e-9', wrong={0: ["log", "log10"]})

card("map", 4, "Turn S, M, L into 1, 2, 3 with a dictionary. Any other value becomes missing.",
     'test["size_num"] = test["size"].{{map}}({"S": 1, "M": 2, "L": 3})',
     "map returns NaN for a value that is not in the dictionary. replace leaves it as it was.",
     'test["size_num"].isna().tolist() == [False, True, False]', wrong={0: ["replace"]})

card("mode", 4, "Get the most common city in train, as a single value.",
     'top_city = train["city"].{{mode}}()[0]',
     "mode returns a Series, because there can be a tie. [0] takes the first.",
     'top_city == "Lyon"')

# ---- model development --------------------------------------------------------------------------
card("import-split", 5, "Import the function that splits rows into a training part and a validation part.",
     "from sklearn.{{model_selection}} import train_test_split",
     "cross_val_score, StratifiedKFold, and GridSearchCV are in the same module.",
     "callable(train_test_split)", wrong={0: ["model", "selection", "cross_validation"]})

card("import-linear", 5, "Import logistic regression.",
     "from sklearn.{{linear_model}} import LogisticRegression",
     "LinearRegression, Ridge, and Lasso are in the same module.",
     'LogisticRegression.__name__ == "LogisticRegression"', wrong={0: ["linear", "linear_models"]})

card("import-ensemble", 5, "Import the random forest.",
     "from sklearn.{{ensemble}} import RandomForestClassifier",
     "The boosting models are there too: GradientBoostingClassifier and HistGradientBoostingClassifier.",
     'RandomForestClassifier.__name__ == "RandomForestClassifier"', wrong={0: ["tree", "ensembles"]})

card("import-metrics", 5, "Import two scoring functions.",
     "from sklearn.{{metrics}} import f1_score, roc_auc_score",
     "Both take the truth first, then the prediction: f1_score(y_va, pred).",
     "callable(f1_score) and callable(roc_auc_score)", wrong={0: ["metric", "model_selection"]})

card("import-pipeline", 5, "Import the helper that chains steps into one model.",
     "from sklearn.{{pipeline}} import make_pipeline",
     "make_pipeline names each step after its class, in lowercase: randomforestclassifier.",
     "callable(make_pipeline)", wrong={0: ["pipelines", "compose"]})

card("import-compose", 5, "Import the class that sends different columns to different steps.",
     "from sklearn.{{compose}} import ColumnTransformer",
     "It is in sklearn.compose, not in sklearn.pipeline or sklearn.preprocessing.",
     'ColumnTransformer.__name__ == "ColumnTransformer"', wrong={0: ["pipeline", "preprocessing"]})

card("xy-drop", 5, "Split the table into the features X and the target y.", '''
X = train.{{drop}}({{columns}}=["churn"])
y = train["churn"]
''', "drop returns a new table and leaves train as it was.",
     '"churn" not in X.columns and X.shape[1] == train.shape[1] - 1')

card("split", 5, "Hold out 20% for validation, and keep the class shares the same in both parts.", '''
X_tr, X_va, y_tr, y_va = train_test_split(
    X, y, {{test_size}}=0.2, random_state=42, {{stratify}}=y)
''', "The four results come in this order: X train, X validation, y train, y validation.",
     "len(X_va) == 60 and abs(y_va.mean() - y.mean()) < 0.01")

card("max-iter", 5, "Logistic regression stops with a convergence warning. Give the solver more steps.",
     "model = LogisticRegression({{max_iter}}=1000)",
     "Scaling the features first is the other fix, and often the better one.",
     "model.max_iter == 1000")

card("forest-args", 5, "Build a forest of 300 trees that uses every CPU core.", '''
model = RandomForestClassifier(
    {{n_estimators}}=300, random_state=42, {{n_jobs}}=-1)
''', "random_state makes the result the same on every run.",
     "model.n_estimators == 300 and model.n_jobs == -1")

card("class-weight", 5, "Positives are rare. Make each one count for more during training.",
     'model = LogisticRegression(max_iter=1000, {{class_weight}}="{{balanced}}")',
     "It usually raises recall and lowers precision. RandomForestClassifier takes the same argument.",
     'model.fit(X_tr, y_tr).class_weight == "balanced"', wrong={1: ["balance", "auto"]})

card("predict-proba", 5, "Get the probability of the positive class for each validation row.",
     "p = model.{{predict_proba}}(X_va)[:, {{1|-1}}]",
     "predict_proba returns one column per class. Column 1 is the positive class.",
     "p.shape == (len(X_va),) and np.allclose(p, 1 - model.predict_proba(X_va)[:, 0])", wrong={0: ["predict"], 1: ["0"]})

card("threshold", 5, "Turn the probabilities p into 0 and 1 labels, with a threshold of 0.7.",
     "pred = (p >= 0.7).{{astype}}(int)",
     "A higher threshold trades recall for precision.",
     'pred.dtype.kind == "i" and set(np.unique(pred)) <= {0, 1}')

card("auc-scores", 5, "p holds probabilities and pred holds 0 and 1 labels. Which one does ROC AUC need?",
     "auc = roc_auc_score(y_va, {{p}})",
     "AUC ranks the rows, so it needs scores. With labels it still runs, with no warning, and usually gives a lower number.",
     "auc == roc_auc_score(y_va, model.predict_proba(X_va)[:, 1])", wrong={0: ["pred"]})

card("metric-order", 5, "y_va is the truth and pred is the prediction. Put them in the right order.",
     "precision = precision_score({{y_va}}, {{pred}})",
     "Swap them and precision turns into recall, with no error.",
     "precision == precision_score(y_true=y_va, y_pred=pred) and precision != recall_score(y_true=y_va, y_pred=pred)",
     wrong={0: ["pred"], 1: ["y_va"]})

card("cross-val", 5, "Score the model with 5-fold cross-validation on F1.", '''
scores = cross_val_score(
    model, X_tr, y_tr, {{cv}}=5, {{scoring}}="f1")
''', "Report scores.mean(). Other scoring names: accuracy, precision, recall, roc_auc, r2.",
     "len(scores) == 5")

card("scoring-neg", 5, "The scoring name for mean absolute error is missing its first part.", '''
scores = cross_val_score(
    Ridge(), X_tr, y_tr, cv=5,
    scoring="{{neg}}_mean_absolute_error")
''', "scikit-learn always maximizes a score, so errors are negated. Flip the sign to report them.",
     "len(scores) == 5 and (scores < 0).all()")

card("column-transformer", 5, "Scale the numeric columns and one-hot encode the text column, in one object.", '''
pre = {{ColumnTransformer}}([
    ("num", StandardScaler(), num_cols),
    ("cat", OneHotEncoder(handle_unknown="ignore"), cat_cols),
])
''', 'Each entry is (name, step, columns). Columns you leave out are dropped unless you pass remainder="passthrough".',
     "pre.fit_transform(X).shape == (len(X), 8)")

card("make-pipeline", 5, "Chain the preprocessing and the model, so that cross-validation refits both inside each fold.", '''
clf = {{make_pipeline}}(
    pre, RandomForestClassifier(n_estimators=50, random_state=42))
''', "A pipeline is the simplest protection against leakage.",
     "clf.fit(X, y).score(X, y) > 0.9",
     setup='pre = ColumnTransformer([("num", StandardScaler(), num_cols), ("cat", OneHotEncoder(handle_unknown="ignore"), cat_cols)])',
     wrong={0: ["Pipeline"]})

card("grid-search", 5, "Tune the depth of the forest inside the pipeline clf. Name the argument, and join the step to its parameter.", '''
grid = GridSearchCV(clf, {{param_grid}}={
    "randomforestclassifier{{__}}max_depth": [3, None],
}, cv=3, scoring="f1")
''', "The key is the step name, two underscores, then the parameter name.",
     'grid.fit(X, y).best_params_.keys() == {"randomforestclassifier__max_depth"}',
     setup="clf = make_pipeline(StandardScaler(), RandomForestClassifier(n_estimators=30, random_state=42))\nX = X[num_cols]",
     wrong={1: ["_", "."]})

card("best-params", 5, "After the search: read the winning settings, and take the model refit with them.", '''
print(grid.{{best_params_}})
best = grid.{{best_estimator_}}
''', "Fitted attributes end with an underscore. best_estimator_ is already refit on all the rows you passed.",
     'hasattr(best, "predict")',
     setup='grid = GridSearchCV(LogisticRegression(max_iter=1000), {"C": [0.1, 1]}, cv=3).fit(X_tr, y_tr)',
     wrong={0: ["best_params"], 1: ["best_estimator", "best_model_"]})

card("confusion-order", 5, "Unpack the four cells of a binary confusion matrix, in the order scikit-learn returns them.",
     "{{tn}}, {{fp}}, {{fn}}, {{tp}} = confusion_matrix(y_va, pred).ravel()",
     "Rows are the truth and columns the prediction, with 0 first. So it reads tn, fp, fn, tp.",
     "tp == ((pred == 1) & (y_va == 1)).sum() and fp == ((pred == 1) & (y_va == 0)).sum() and tn + fp + fn + tp == len(y_va)",
     any_case=True, width=4)

# The order in which new cards are dealt: the lines used most come first, and every round mixes the three tasks.
DEAL = """
import-split merge-left import-preprocessing to-csv predict-proba import-ensemble fit-transform read-dates import-metrics split
import-impute groupby-agg import-linear onehot-unknown fillna-astype auc-scores impute-train forest-args cross-val reset-index
import-pipeline read-sep imputer-strategy xy-drop merge-keys import-compose dummies-reindex sort-desc column-transformer rename
make-pipeline concat ordinal-categories max-iter read-jsonl threshold cut drop-duplicates grid-search json-load
class-weight clip-quantile to-datetime metric-order map read-dtype mode best-params strftime qcut
scoring-neg merge-indicator feature-names confusion-order log1p
""".split()


def parts(code):
    """Split code into literal text and blanks."""
    out, at = [], 0
    for m in BLANK.finditer(code):
        if m.start() > at:
            out.append(code[at:m.start()])
        out.append(dict(a=m.group(1).split("|")))
        at = m.end()
    if at < len(code):
        out.append(code[at:])
    return out


def filled(c, pick=None):
    """The card's code with an answer in every blank. pick maps a blank's position to the answer to use there."""
    n = -1

    def sub(m):
        nonlocal n
        n += 1
        return (pick or {}).get(n, m.group(1).split("|")[0])
    return BLANK.sub(sub, c["code"])


def script(c, pick=None):
    """A complete program for one card: the group's setup, the card's own setup, its code, and its check."""
    return "\n".join([SETUP[c["group"]], c["setup"], filled(c, pick), f"assert ({c['check']}), 'the check failed'", ""])


def cases():
    """Every program the build has to run: (label, source, should it pass)."""
    out = []
    for c in CARDS:
        out.append((c["id"], script(c), True))
        for i, p in enumerate(x for x in parts(c["code"]) if isinstance(x, dict)):
            for alt in p["a"][1:]:
                out.append((f"{c['id']} with {alt}", script(c, {i: alt}), True))
            for bad in c["wrong"].get(i, []):
                out.append((f"{c['id']} with {bad}", script(c, {i: bad}), False))
    return out


def build():
    ids = [c["id"] for c in CARDS]
    assert len(ids) == len(set(ids)), "duplicate card id"
    assert sorted(DEAL) == sorted(ids), f"deal order: missing {set(ids) - set(DEAL)}, unknown {set(DEAL) - set(ids)}"
    assert "recall" not in ids
    text = " ".join(c["prompt"] + " " + c["note"] for c in CARDS) + " ".join(g["title"] + " " + g["blurb"] for g in GROUPS)
    for bad, name in (("–", "en dash"), ("—", "em dash"), ("!", "exclamation mark"), ("$", "dollar sign")):
        assert bad not in text, f"{name} in a card: {text[max(0, text.index(bad) - 50):text.index(bad) + 20]!r}"
    for word in ("simply", "just", "please note", "easily", "obviously"):
        assert not re.search(rf"\b{word}\b", text, re.I), f"filler word in a card: {word}"
    cards = []
    for c in CARDS:
        assert c["prompt"].endswith((".", "?")) and c["note"].endswith("."), c["id"]
        # on the page a gap is as wide as its longest accepted answer plus one character, and never narrower than width
        shown = BLANK.sub(lambda m: "_" * max(c["width"], max(map(len, m.group(1).split("|"))) + 1), c["code"])
        assert max(len(ln) for ln in shown.splitlines()) <= 74, f"{c['id']}: a line is too wide for the card"
        assert "\t" not in c["code"] and not any(ln != ln.rstrip() for ln in c["code"].splitlines()), c["id"]
        ps = parts(c["code"])
        blanks = [p for p in ps if isinstance(p, dict)]
        assert 1 <= len(blanks) <= 4, c["id"]
        for i in c["wrong"]:
            assert 0 <= i < len(blanks), c["id"]
        for p in blanks:
            if c["any_case"]:
                p["ci"] = 1
            if c["width"] != WIDE:
                p["w"] = c["width"]
        cards.append(dict(id=c["id"], group=c["group"], deal=DEAL.index(c["id"]), prompt=c["prompt"], parts=ps, note=c["note"]))
    return dict(groups=GROUPS, cards=cards)


if __name__ == "__main__":
    import json
    import sys
    if "--cases" in sys.argv:   # for a test in the browser's Python: every program, and whether it should pass
        json.dump([dict(label=label, source=src, ok=ok) for label, src, ok in cases()], sys.stdout)
    else:
        data = build()
        print(len(data["cards"]), "cards,", sum(1 for c in data["cards"] for p in c["parts"] if isinstance(p, dict)), "blanks,", len(cases()), "programs to run")
