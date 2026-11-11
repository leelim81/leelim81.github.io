"""Model development drills: a precision bar with threshold tuning, and a cross-validation report."""
import numpy as np
import pandas as pd

from common import code, csv_text, file_list, html, schema

CATS = ["dining", "electronics", "fuel", "grocery", "online", "travel"]
P_BAR, R_BAR = 0.90, 0.35


def make_fraud(seed=61001, n=12000, lookalike=0.06):
    """Three groups: fraud (8%), genuine payments that look like fraud (6%), and ordinary payments.

    The look-alike group shares the loud signals (foreign, at night, large amounts), so a default
    0.5 threshold flags many of them. Only the quieter signals separate them from fraud.
    """
    rng = np.random.default_rng(seed)
    u = rng.random(n)
    g = np.where(u < 0.08, 2, np.where(u < 0.08 + lookalike, 1, 0))
    by = lambda f, t, l: np.where(g == 2, f, np.where(g == 1, t, l))
    amount = np.round(np.exp(by(rng.normal(4.8, 1.0, n), rng.normal(4.7, 0.9, n), rng.normal(3.6, 0.9, n))), 2)
    night = by(rng.random(n) < 0.42, rng.random(n) < 0.36, rng.random(n) < 0.08).astype(bool)
    hour = np.where(night, rng.integers(0, 6, n), rng.integers(6, 24, n))
    country_match = by(rng.random(n) < 0.58, rng.random(n) < 0.45, rng.random(n) < 0.97).astype(int)
    n_tx_24h = by(rng.poisson(5.1, n), rng.poisson(2.6, n), rng.poisson(2.2, n))
    account_age_days = np.round(by(rng.gamma(2.0, 230, n), rng.gamma(2.0, 400, n), rng.gamma(2.0, 420, n))).astype(int) + 3
    device_score = np.round(by(rng.beta(2.4, 2.9, n), rng.beta(5.5, 2, n), rng.beta(6, 2, n)), 3)
    pl = np.array([.18, .12, .12, .30, .20, .08])
    pf = np.array([.07, .28, .04, .09, .37, .15])
    pt = np.array([.20, .10, .06, .06, .28, .30])
    cat = by(rng.choice(CATS, n, p=pf), rng.choice(CATS, n, p=pt), rng.choice(CATS, n, p=pl))
    df = pd.DataFrame({"tx_id": np.arange(700001, 700001 + n), "amount": amount, "hour": hour, "merchant_category": cat,
                       "country_match": country_match, "n_tx_24h": n_tx_24h, "account_age_days": account_age_days,
                       "device_score": device_score, "is_fraud": (g == 2).astype(int)})
    df.loc[rng.choice(n, int(n * .05), replace=False), "device_score"] = np.nan
    tr, va, te = df.iloc[:5000], df.iloc[5000:8000], df.iloc[8000:]
    inputs = {"train.csv": csv_text(tr), "val.csv": csv_text(va), "test.csv": csv_text(te.drop(columns="is_fraud"))}
    hidden = {"truth.csv": csv_text(te[["tx_id", "is_fraud"]])}
    return inputs, hidden


FRAUD_DESC = html(f"""
<p>A card issuer wants to block suspicious transactions automatically. A blocked genuine payment annoys a customer, so the model must be right when it raises a flag.</p>
<p>The data is split three ways: train, validation, and test. The test set has no labels. About 8% of transactions are fraud, and some genuine payments look a lot like it.</p>
<h3>Files</h3>
{file_list(
    ("train.csv", ["tx_id", "amount", "hour", "merchant_category", "country_match", "n_tx_24h", "account_age_days", "device_score", "is_fraud"],
     "<code>merchant_category</code> is text, and <code>device_score</code> has missing values."),
    ("val.csv", ["the same columns"]),
    ("test.csv", ["the same columns without <code>is_fraud</code>"]))}
<h3>Your task</h3>
<p>Predict <code>is_fraud</code> for every row of <code>test.csv</code>. Use any model.</p>
<p>The bars, measured on the hidden test labels: precision of at least {P_BAR:.2f} and recall of at least {R_BAR:.2f}.</p>
<p>Save <code>predictions.csv</code> in the task folder with one column named <code>is_fraud</code> that holds 0 or 1, one row per test row, in the same order.</p>
""")

FRAUD_SOLUTION = code("""
    import pandas as pd
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import precision_score, recall_score

    train = pd.read_csv('train.csv')
    val = pd.read_csv('val.csv')
    test = pd.read_csv('test.csv')
    target = 'is_fraud'

    # 1 Features: one-hot the text column, align every set to train's columns
    def features(df, cols=None):
        X = pd.get_dummies(df.drop(columns=['tx_id', target], errors='ignore'),
                           columns=['merchant_category'], dtype=int)
        return X if cols is None else X.reindex(columns=cols, fill_value=0)

    X = features(train)
    med = X['device_score'].median()                 # learned on train
    X = X.fillna({'device_score': med})
    X_val = features(val, X.columns).fillna({'device_score': med})
    X_test = features(test, X.columns).fillna({'device_score': med})

    # 2 Fit, then score probabilities on validation
    clf = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1)
    clf.fit(X, train[target])
    p_val = clf.predict_proba(X_val)[:, 1]

    # 3 Lowest threshold whose validation precision clears the bar with a margin
    for t in [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90]:
        lab = (p_val >= t).astype(int)
        p = precision_score(val[target], lab, zero_division=0)
        r = recall_score(val[target], lab)
        print(t, round(p, 3), round(r, 3))
        if p >= 0.95:
            break

    # 4 Apply that threshold to test and save labels
    pred = (clf.predict_proba(X_test)[:, 1] >= t).astype(int)
    pd.DataFrame({target: pred}).to_csv('predictions.csv', index=False)
""")

FRAUD_GRADER = code(f"""
    import numpy as np
    import pandas as pd

    P_BAR, R_BAR = {P_BAR}, {R_BAR}
    PREC = f'Precision on the hidden test labels is at least {{P_BAR:.2f}}'
    REC = f'Recall on the hidden test labels is at least {{R_BAR:.2f}}'


    def grade(c):
        c.plan('predictions.csv is saved in the task folder',
               'predictions.csv has no index column',
               'One column, named is_fraud',
               'One prediction per test row',
               'Every prediction is 0 or 1',
               (PREC, True),
               (REC, True))
        got = c.output('predictions.csv')
        if got is None:
            return
        if not c.check('One column, named is_fraud', list(got.columns) == ['is_fraud'],
                       'Found these columns: ' + ', '.join(map(str, got.columns)) + '.',
                       'Save a DataFrame that holds only the is_fraud column.'):
            return
        truth = c.secret('truth.csv')
        if not c.check('One prediction per test row', len(got) == len(truth),
                       f'test.csv has {{len(truth):,}} rows and predictions.csv has {{len(got):,}}.',
                       'Predict on test.csv and keep its row order.'):
            return
        p = pd.to_numeric(got['is_fraud'], errors='coerce')
        if not c.check('Every prediction is 0 or 1', bool(p.isin([0, 1]).all()),
                       'Some values are not 0 or 1.',
                       'Save labels, not probabilities: (proba >= threshold).astype(int).'):
            return
        y = truth['is_fraud'].to_numpy()
        pred = p.to_numpy().astype(int)
        tp = int(((pred == 1) & (y == 1)).sum())
        flagged = int(pred.sum())
        precision = tp / flagged if flagged else 0.0
        recall = tp / int(y.sum())
        c.note(f'Precision {{precision:.3f}} (bar {{P_BAR:.2f}}). Recall {{recall:.3f}} (bar {{R_BAR:.2f}}). You flagged {{flagged:,}} of {{len(y):,}} transactions.')
        c.check(PREC, precision >= P_BAR,
                f'Precision is {{precision:.3f}}.' if flagged else 'No transaction is flagged, so precision is 0.',
                'Raise the decision threshold. Scan thresholds on val.csv and keep the lowest one that clears the bar with a margin.')
        c.check(REC, recall >= R_BAR, f'Recall is {{recall:.3f}}.',
                'The threshold is too strict or the model is too weak. Lower the threshold as far as the precision bar allows, or try a stronger model.')
""")

_FRAUD_HEAD = """
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
train = pd.read_csv('train.csv'); val = pd.read_csv('val.csv'); test = pd.read_csv('test.csv')
def features(df, cols=None):
    X = pd.get_dummies(df.drop(columns=['tx_id', 'is_fraud'], errors='ignore'), columns=['merchant_category'], dtype=int)
    return X if cols is None else X.reindex(columns=cols, fill_value=0)
X = features(train); med = X['device_score'].median(); X = X.fillna({'device_score': med})
X_test = features(test, X.columns).fillna({'device_score': med})
clf = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1).fit(X, train['is_fraud'])
proba = clf.predict_proba(X_test)[:, 1]
"""
PREC = f"Precision on the hidden test labels is at least {P_BAR:.2f}"
REC = f"Recall on the hidden test labels is at least {R_BAR:.2f}"
FRAUD_VARIANTS = [
    dict(name="default_threshold", hint="", fails=[PREC],
         code=code(_FRAUD_HEAD + "pd.DataFrame({'is_fraud': (proba >= 0.5).astype(int)}).to_csv('predictions.csv', index=False)\n")),
    dict(name="too_strict", hint="", fails=[REC],
         code=code(_FRAUD_HEAD + "pd.DataFrame({'is_fraud': (proba >= 0.97).astype(int)}).to_csv('predictions.csv', index=False)\n")),
    dict(name="probabilities", hint="", fails=["Every prediction is 0 or 1"],
         code=code(_FRAUD_HEAD + "pd.DataFrame({'is_fraud': proba}).to_csv('predictions.csv', index=False)\n")),
    dict(name="all_zero", hint="", fails=[PREC, REC],
         code=code("import pandas as pd\ntest = pd.read_csv('test.csv')\npd.DataFrame({'is_fraud': [0] * len(test)}).to_csv('predictions.csv', index=False)\n")),
]


# ================================================================ cross-validation report
def make_cv(seed=62001, n=900):
    rng = np.random.default_rng(seed)
    tenure = rng.integers(1, 73, n)
    fee = np.round(rng.normal(62, 18, n).clip(15, 140), 2)
    tickets = rng.poisson(1.3, n)
    data_gb = np.round(rng.gamma(2.2, 9, n), 1)
    late = rng.poisson(0.6, n)
    age = rng.integers(19, 78, n)
    contract = rng.choice([1, 12, 24], n, p=[0.5, 0.3, 0.2])
    autopay = rng.choice([0, 1], n, p=[0.45, 0.55])
    z = (-0.9 - 0.035 * tenure + 0.022 * (fee - 62) + 0.55 * tickets + 0.45 * late - 0.012 * (data_gb - 20)
         - 0.05 * contract - 0.5 * autopay + 0.9 * (tickets >= 3) * (contract == 1))
    y = (rng.random(n) < 1 / (1 + np.exp(-z))).astype(int)
    df = pd.DataFrame({"customer_id": np.arange(30001, 30001 + n), "tenure_months": tenure, "monthly_fee": fee,
                       "support_tickets": tickets, "data_gb": data_gb, "late_payments": late, "age": age,
                       "contract_months": contract, "autopay": autopay, "churned": y})
    return {"train.csv": csv_text(df)}


CV_DESC = html(f"""
<p>Before you tune anything, you want an honest comparison of a linear model and a few random forests. Report 5-fold cross-validation scores for four candidates.</p>
<h3>Files</h3>
{file_list(("train.csv", ["customer_id", "tenure_months", "monthly_fee", "support_tickets", "data_gb", "late_payments", "age", "contract_months", "autopay", "churned"]))}
<h3>Your task</h3>
<p>The target is <code>churned</code>. The features are every column except <code>customer_id</code> and <code>churned</code>. Score each model with ROC AUC, using this splitter for all of them:</p>
<pre class="sample">StratifiedKFold(n_splits=5, shuffle=True, random_state=42)</pre>
<p>The four models, in this order:</p>
<ul>
  <li><code>logreg</code>: <code>make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))</code></li>
  <li><code>forest_2</code>, <code>forest_4</code>, <code>forest_8</code>: <code>RandomForestClassifier(n_estimators=50, max_depth=d, random_state=42)</code> with <code>d</code> equal to 2, 4, and 8</li>
</ul>
<p>Save <code>cv_report.csv</code> with one row per model, in the order above:</p>
{schema([
    ("model", "str", "Model name as written above"),
    ("mean_auc", "float", "Mean of the five fold scores, rounded to 4 decimals"),
    ("std_auc", "float", "Standard deviation of the five fold scores (NumPy default, ddof=0), rounded to 4 decimals")])}
<p>Also save <code>best_model.txt</code>. It holds only the name of the model with the highest mean AUC.</p>
""")

CV_SOLUTION = code("""
    import pandas as pd
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedKFold, cross_val_score
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    train = pd.read_csv('train.csv')
    X = train.drop(columns=['customer_id', 'churned'])
    y = train['churned']

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    models = {'logreg': make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))}
    for depth in [2, 4, 8]:
        models[f'forest_{depth}'] = RandomForestClassifier(n_estimators=50, max_depth=depth, random_state=42)

    rows = []
    for name, model in models.items():
        s = cross_val_score(model, X, y, cv=cv, scoring='roc_auc')
        rows.append({'model': name, 'mean_auc': s.mean(), 'std_auc': s.std()})   # NumPy std: ddof=0

    report = pd.DataFrame(rows)
    best = report.loc[report['mean_auc'].idxmax(), 'model']
    report.round({'mean_auc': 4, 'std_auc': 4}).to_csv('cv_report.csv', index=False)
    with open('best_model.txt', 'w') as f:
        f.write(best)
""")

CV_GRADER = code("""
    import numpy as np
    import pandas as pd

    NAMES = ['logreg', 'forest_2', 'forest_4', 'forest_8']


    def scores(c):
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.linear_model import LogisticRegression
        from sklearn.model_selection import StratifiedKFold, cross_val_score
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import StandardScaler
        train = c.secret('train.csv')
        X, y = train.drop(columns=['customer_id', 'churned']), train['churned']
        cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        models = {'logreg': make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))}
        for d in [2, 4, 8]:
            models[f'forest_{d}'] = RandomForestClassifier(n_estimators=50, max_depth=d, random_state=42)
        return {n: cross_val_score(m, X, y, cv=cv, scoring='roc_auc') for n, m in models.items()}


    def grade(c):
        c.plan('cv_report.csv is saved in the task folder',
               'cv_report.csv has no index column',
               'Columns match the spec, in order',
               'Four rows, one per model, in the given order',
               ('mean_auc is the mean of the five fold scores, rounded to 4 decimals', True),
               ('std_auc is the ddof=0 standard deviation, rounded to 4 decimals', True),
               ('best_model.txt names the model with the highest mean AUC', True))
        got = c.output('cv_report.csv')
        if got is None:
            return
        if not c.columns('Columns match the spec, in order', got, ['model', 'mean_auc', 'std_auc']):
            return
        if not c.check('Four rows, one per model, in the given order', list(got['model'].astype(str)) == NAMES,
                       'Found these models: ' + ', '.join(got['model'].astype(str)) + '.',
                       'Expected, in order: ' + ', '.join(NAMES) + '.'):
            return
        s = scores(c)
        exp = pd.DataFrame({'model': NAMES, 'mean_auc': [s[n].mean() for n in NAMES], 'std_auc': [s[n].std() for n in NAMES]})
        pairs = [('cv_report.csv', got, exp)]
        c.values('mean_auc is the mean of the five fold scores, rounded to 4 decimals', pairs, ['mean_auc'], key='model',
                 decimals={'mean_auc': 4},
                 hint='Use the exact splitter and models from the task, with scoring=\\'roc_auc\\'. A plain KFold or a different random_state changes the folds.')
        sample = np.array([s[n].std(ddof=1) for n in NAMES])
        mine = pd.to_numeric(got['std_auc'], errors='coerce').to_numpy()
        hint = 'Take the standard deviation of the five fold scores.'
        if np.allclose(mine, np.round(sample, 4), atol=1.01e-4):
            hint = 'That is the sample standard deviation (ddof=1), which pandas uses by default. NumPy uses ddof=0: call .std() on the array that cross_val_score returns.'
        c.values('std_auc is the ddof=0 standard deviation, rounded to 4 decimals', pairs, ['std_auc'], key='model',
                 decimals={'std_auc': 4}, hint=hint)
        best = NAMES[int(np.argmax([s[n].mean() for n in NAMES]))]
        path = c.work / 'best_model.txt'
        text = path.read_text().strip() if path.is_file() else None
        c.check('best_model.txt names the model with the highest mean AUC', text == best,
                'best_model.txt is missing.' if text is None else f'best_model.txt says {text!r}.',
                'Write only the model name, with no extra text.')
""")

_CV_HEAD = """
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import KFold, StratifiedKFold, cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
train = pd.read_csv('train.csv'); X = train.drop(columns=['customer_id', 'churned']); y = train['churned']
models = {'logreg': make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))}
for depth in [2, 4, 8]:
    models[f'forest_{depth}'] = RandomForestClassifier(n_estimators=50, max_depth=depth, random_state=42)
"""
MEAN = "mean_auc is the mean of the five fold scores, rounded to 4 decimals"
STD = "std_auc is the ddof=0 standard deviation, rounded to 4 decimals"
BEST = "best_model.txt names the model with the highest mean AUC"
CV_VARIANTS = [
    dict(name="plain_kfold", hint="", fails=[MEAN, STD], also=[BEST], code=code(_CV_HEAD + """
cv = KFold(n_splits=5)
rows = [{'model': n, 'mean_auc': (s := cross_val_score(m, X, y, cv=cv, scoring='roc_auc')).mean(), 'std_auc': s.std()} for n, m in models.items()]
r = pd.DataFrame(rows); r.round(4).to_csv('cv_report.csv', index=False)
open('best_model.txt', 'w').write(r.loc[r['mean_auc'].idxmax(), 'model'])
""")),
    dict(name="pandas_std", hint="That is the sample standard deviation (ddof=1)", hint_optional=False, fails=[STD], code=code(_CV_HEAD + """
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
rows = [{'model': n, 'mean_auc': (s := pd.Series(cross_val_score(m, X, y, cv=cv, scoring='roc_auc'))).mean(), 'std_auc': s.std()} for n, m in models.items()]
r = pd.DataFrame(rows); r.round(4).to_csv('cv_report.csv', index=False)
open('best_model.txt', 'w').write(r.loc[r['mean_auc'].idxmax(), 'model'])
""")),
    dict(name="unrounded", hint="The numbers are right. Round mean_auc to 4 decimals.", fails=[MEAN, STD], code=code(_CV_HEAD + """
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
rows = [{'model': n, 'mean_auc': (s := cross_val_score(m, X, y, cv=cv, scoring='roc_auc')).mean(), 'std_auc': s.std()} for n, m in models.items()]
r = pd.DataFrame(rows); r.to_csv('cv_report.csv', index=False)
open('best_model.txt', 'w').write(r.loc[r['mean_auc'].idxmax(), 'model'])
""")),
    dict(name="no_best_file", hint="", fails=[BEST], code=code(_CV_HEAD + """
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
rows = [{'model': n, 'mean_auc': (s := cross_val_score(m, X, y, cv=cv, scoring='roc_auc')).mean(), 'std_auc': s.std()} for n, m in models.items()]
pd.DataFrame(rows).round(4).to_csv('cv_report.csv', index=False)
""")),
]


def exercises():
    fraud_inputs, fraud_hidden = make_fraud()
    cv_inputs = make_cv()
    return [
        dict(id="fraud-precision", module=5, title="Clear a precision bar", story="Fraud", minutes=20,
             inputs=fraud_inputs, outputs=["predictions.csv"], hidden=fraud_hidden, expect=[], align=None,
             desc=FRAUD_DESC, starter="import pandas as pd\n\n", solution=FRAUD_SOLUTION, grader=FRAUD_GRADER,
             hints=["Get a valid predictions.csv from a default model first. Then look at precision and recall on val.csv.",
                    "predict() uses a threshold of 0.5. Use predict_proba(X)[:, 1] and choose your own threshold: a higher one raises precision and lowers recall.",
                    "Scan thresholds from 0.5 to 0.9 on val.csv. Keep the lowest one whose precision clears the bar with a few points of margin, then apply it to test."],
             variants=FRAUD_VARIANTS, oracle=None,
             notes="A random forest with 200 trees takes about 10 seconds in the browser. Start with fewer trees while you iterate."),
        dict(id="cv-report", module=5, title="Report cross-validation scores", story="Churn", minutes=15,
             inputs=cv_inputs, outputs=["cv_report.csv", "best_model.txt"], hidden={"train.csv": cv_inputs["train.csv"]}, expect=[], align=None,
             desc=CV_DESC, starter="import pandas as pd\n\n", solution=CV_SOLUTION, grader=CV_GRADER,
             hints=["cross_val_score(model, X, y, cv=cv, scoring='roc_auc') returns the five fold scores as a NumPy array.",
                    "Create the splitter once and pass the same object to every model, so all four see the same folds.",
                    "Call .mean() and .std() on the NumPy array. NumPy's std uses ddof=0; pandas uses ddof=1."],
             variants=CV_VARIANTS, oracle=None,
             notes="The checks refit all four models, so Submit takes several seconds here."),
    ]
