# Continued from build_bank.py. Relies on helpers already defined.

py("D1", "modelling", 1, "E", "Stratified split",
   """`df` has feature column `x` and binary label `y` (40/40). Return `(train, test)` from `train_test_split` with `test_size=0.25`, `random_state=0`, and a stratified label. Do not drop columns.""",
   "def solution(df):\n    raise NotImplementedError",
   """def solution(df):
    from sklearn.model_selection import train_test_split
    train, test = train_test_split(df, test_size=0.25, random_state=0, stratify=df['y'])
    return train, test""",
   [("sizes and balance", """
df = pd.DataFrame({'x': range(80), 'y': [0] * 40 + [1] * 40})
train, test = solution(df)
expect_equal(len(train), 60)
expect_equal(len(test), 20)
expect_equal(len(set(train.index) & set(test.index)), 0)
expect_equal(abs(float(train['y'].mean()) - 0.5) < 0.02, True)
expect_equal(abs(float(test['y'].mean()) - 0.5) < 0.02, True)
expect_equal(set(train['y']) == {0, 1} and set(test['y']) == {0, 1}, True)
""")],
   prelude="import pandas as pd",
   packages=["pandas", "scikit-learn"],
   explanation="`stratify=df['y']` keeps both classes in both sides. 25% of 80 rows is 20.")

py("D2", "modelling", 2, "E", "Linear regression coefficients",
   """`X` is an `(n, 1)` array and `y` the targets. Fit an ordinary linear regression with an intercept. Return a dict `{'coef': [slope], 'intercept': float}`.

The hidden test uses `X = 1,2,3,4` and `y = 3,5,7,9`.""",
   "def solution(X, y):\n    raise NotImplementedError",
   """def solution(X, y):
    from sklearn.linear_model import LinearRegression
    model = LinearRegression().fit(X, y)
    return {'coef': [float(c) for c in model.coef_], 'intercept': float(model.intercept_)}""",
   [("slope 2 intercept 1", """
X = np.array([[1.0], [2.0], [3.0], [4.0]])
y = np.array([3.0, 5.0, 7.0, 9.0])
got = solution(X, y)
expect_close(got['coef'][0], 2.0)
expect_close(got['intercept'], 1.0)
""")],
   prelude="import numpy as np",
   packages=["numpy", "scikit-learn"],
   explanation="The points sit on `y = 1 + 2x`. `coef_` does not include the intercept.")

py("D3", "modelling", 3, "E", "Random forest predictions",
   """Fit a `RandomForestClassifier` with `n_estimators=20` and `random_state=0` on `(X_train, y_train)`. Return a Python list of integer predictions for `X_test`, in row order.""",
   "def solution(X_train, y_train, X_test):\n    raise NotImplementedError",
   """def solution(X_train, y_train, X_test):
    from sklearn.ensemble import RandomForestClassifier
    clf = RandomForestClassifier(n_estimators=20, random_state=0)
    clf.fit(X_train, y_train)
    return [int(v) for v in clf.predict(X_test)]""",
   [("separates the two clusters", """
X_train = [[0.0], [0.1], [0.2], [1.0], [1.1], [0.9]]
y_train = [0, 0, 0, 1, 1, 1]
X_test = [[0.05], [0.15], [1.05], [0.95]]
expect_equal(solution(X_train, y_train, X_test), [0, 0, 1, 1])
""")],
   packages=["scikit-learn"],
   explanation="The two classes do not overlap, so a shallow forest returns the obvious label. `random_state` keeps the trees fixed.")

py("D4", "modelling", 4, "E", "Regression metrics",
   """Write `solution(y_true, y_pred, n_features)` returning a dict with `mae`, `rmse`, `r2`, and `adj_r2`.

RMSE is the square root of the mean squared error. Adjusted R² uses `1 - (1 - R²) * (n - 1) / (n - p - 1)` with `p = n_features` and `n` the number of rows.""",
   "def solution(y_true, y_pred, n_features):\n    raise NotImplementedError",
   """def solution(y_true, y_pred, n_features):
    import numpy as np
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    r2 = float(r2_score(y_true, y_pred))
    n = len(y_true)
    adj = 1 - (1 - r2) * (n - 1) / (n - n_features - 1)
    return {'mae': mae, 'rmse': rmse, 'r2': r2, 'adj_r2': float(adj)}""",
   [("known residuals", """
got = solution([1, 2, 3], [1, 2, 4], 1)
expect_close(got['mae'], 1/3)
expect_close(got['rmse'], (1/3) ** 0.5)
expect_close(got['r2'], 0.5)
expect_close(got['adj_r2'], 0.0)
""")],
   packages=["numpy", "scikit-learn"],
   explanation="One miss of 1 on three rows is MAE 1/3 and MSE 1/3. R² is 0.5, and with n=3 and p=1 the adjusted R² falls to 0.")

py("D5", "modelling", 5, "M", "K-fold mean accuracy",
   """Return the mean accuracy of `LogisticRegression(max_iter=500)` under `cross_val_score` with `cv=4` and `scoring='accuracy'`. `X` is an array, `y` a binary vector.""",
   "def solution(X, y):\n    raise NotImplementedError",
   """def solution(X, y):
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import cross_val_score
    scores = cross_val_score(LogisticRegression(max_iter=500), X, y, cv=4, scoring='accuracy')
    return float(scores.mean())""",
   [("matches a fresh cross_val_score", """
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score
X = np.array([[0], [0], [0], [0], [1], [1], [1], [1]], dtype=float)
y = np.array([0, 0, 0, 0, 1, 1, 1, 1])
exp = float(cross_val_score(LogisticRegression(max_iter=500), X, y, cv=4, scoring='accuracy').mean())
expect_close(solution(X, y), exp, tol=1e-8)
""")],
   prelude="import numpy as np",
   packages=["numpy", "scikit-learn"],
   explanation="The graded value is the mean of the fold scores, not the list of folds.")

py("D6", "modelling", 6, "M", "GridSearchCV depth",
   """Search `max_depth` in `{1, 4}` for a `DecisionTreeClassifier(random_state=0)`. Use `GridSearchCV` with `cv=3` and `scoring='accuracy'`. Return `{'max_depth': int, 'score': float}` from `best_params_` and `best_score_`.

`X` has two columns. `y` is the XOR of those columns, repeated so each fold is learnable.""",
   "def solution(X, y):\n    raise NotImplementedError",
   """def solution(X, y):
    from sklearn.model_selection import GridSearchCV
    from sklearn.tree import DecisionTreeClassifier
    grid = GridSearchCV(
        DecisionTreeClassifier(random_state=0),
        {'max_depth': [1, 4]},
        cv=3,
        scoring='accuracy',
    )
    grid.fit(X, y)
    return {'max_depth': int(grid.best_params_['max_depth']), 'score': float(grid.best_score_)}""",
   [("depth 1 cannot fit xor", """
from sklearn.model_selection import GridSearchCV
from sklearn.tree import DecisionTreeClassifier
X = np.array([[0, 0], [0, 1], [1, 0], [1, 1]] * 20)
y = np.array([0, 1, 1, 0] * 20)
grid = GridSearchCV(DecisionTreeClassifier(random_state=0), {'max_depth': [1, 4]}, cv=3, scoring='accuracy')
grid.fit(X, y)
got = solution(X, y)
expect_equal(got['max_depth'], int(grid.best_params_['max_depth']))
expect_close(got['score'], float(grid.best_score_), tol=1e-8)
expect_equal(got['max_depth'], 4)
""")],
   prelude="import numpy as np",
   packages=["numpy", "scikit-learn"],
   explanation="A depth-1 tree cannot represent XOR. Depth 4 fits it, so the search selects 4.",
   mock="model", timeout=45000)

py("D7", "modelling", 7, "M", "Precision, recall, F1, AUC, Gini",
   """`y_true` is 0/1 and `y_score` is a probability. At threshold 0.5, return a dict with `precision`, `recall`, `f1`, `auc` (using the scores, not the hard labels), and `gini` defined as `2 * auc - 1`.""",
   "def solution(y_true, y_score):\n    raise NotImplementedError",
   """def solution(y_true, y_score):
    import numpy as np
    from sklearn.metrics import f1_score, precision_score, recall_score, roc_auc_score
    pred = (np.asarray(y_score) >= 0.5).astype(int)
    auc = float(roc_auc_score(y_true, y_score))
    return {
        'precision': float(precision_score(y_true, pred, zero_division=0)),
        'recall': float(recall_score(y_true, pred, zero_division=0)),
        'f1': float(f1_score(y_true, pred, zero_division=0)),
        'auc': auc,
        'gini': 2 * auc - 1,
    }""",
   [("threshold 0.5 versus ranking", """
y_true = [0, 0, 1, 1, 1]
y_score = [0.2, 0.7, 0.4, 0.8, 0.9]
got = solution(y_true, y_score)
expect_close(got['precision'], 2/3)
expect_close(got['recall'], 2/3)
expect_close(got['f1'], 2/3)
expect_close(got['auc'], roc_auc_score(y_true, y_score))
expect_close(got['gini'], 2 * got['auc'] - 1)
""")],
   prelude="from sklearn.metrics import roc_auc_score",
   packages=["numpy", "scikit-learn"],
   explanation="Hard labels at 0.5 give precision and recall 2/3. AUC is computed on the scores. Gini is just a rescaling of AUC.")

py("D8", "modelling", 8, "M", "Threshold that maximises F1",
   """`y_true` is 0/1 and `scores` are probabilities. Search thresholds `0.1, 0.2, ..., 0.9`. A prediction is positive when `score >= threshold`. Return the threshold with the highest F1. If two tie, return the lower one.""",
   "def solution(y_true, scores):\n    raise NotImplementedError",
   """def solution(y_true, scores):
    import numpy as np
    from sklearn.metrics import f1_score
    y_true = np.asarray(y_true)
    scores = np.asarray(scores)
    best_t, best_f = 0.1, -1.0
    for step in range(1, 10):
        t = step / 10
        pred = (scores >= t).astype(int)
        f = float(f1_score(y_true, pred, zero_division=0))
        if f > best_f + 1e-12:
            best_t, best_f = t, f
    return float(best_t)""",
   [("lower threshold wins the tie", """
y_true = [0, 0, 0, 1, 1, 1]
scores = [0.2, 0.4, 0.55, 0.45, 0.7, 0.9]
expect_close(solution(y_true, scores), 0.6)
""")],
   packages=["numpy", "scikit-learn"],
   explanation="F1 is 0.8 at both 0.6 and 0.7. The lower threshold is the one the tests want. `>=` matters at 0.7, where a score of exactly 0.7 stays positive.",
   mock="model")

# D9 built with generated data
rng = np.random.default_rng(0)
_n = 200
_x1 = rng.normal(size=_n)
_x2 = rng.normal(size=_n)
_y = (1.4 * _x1 - 0.6 * _x2 + rng.normal(scale=0.5, size=_n) > 0).astype(int)
_train = pd.DataFrame({"x1": _x1[:140], "x2": _x2[:140], "y": _y[:140]})
_testx = pd.DataFrame({"x1": _x1[140:], "x2": _x2[140:]})
_ytest = _y[140:].tolist()
_d9_prelude = (
    "import pandas as pd\nfrom io import StringIO\n"
    "train_df = pd.read_csv(StringIO(%r))\n"
    "test_X = pd.read_csv(StringIO(%r))\n"
) % (_train.round(5).to_csv(index=False), _testx.round(5).to_csv(index=False))
py("D9", "modelling", 9, "H", "Beat an AUC bar",
   """`train_df` has columns `x1`, `x2`, `y` (140 rows). `test_X` has `x1`, `x2` (60 rows). Fit a classifier on the training rows only and return a 1-d array or list of positive-class probabilities for `test_X`, in the same row order.

The hidden test computes ROC-AUC against labels you cannot see. You need AUC of at least 0.85. A logistic regression on the two features is enough.""",
   "def solution(train_df, test_X):\n    raise NotImplementedError",
   """def solution(train_df, test_X):
    from sklearn.linear_model import LogisticRegression
    model = LogisticRegression(max_iter=500)
    model.fit(train_df[['x1', 'x2']], train_df['y'])
    return model.predict_proba(test_X[['x1', 'x2']])[:, 1]""",
   [("clears 0.85", f"""
from sklearn.metrics import roc_auc_score
scores = solution(train_df, test_X)
expect_equal(len(list(scores)), len(test_X))
auc = float(roc_auc_score({_ytest!r}, list(scores)))
if auc < 0.85:
    raise AssertionError('EXPECTED AUC >= 0.85\\nACTUAL %s' % round(auc, 3))
""")],
   prelude=_d9_prelude,
   packages=["pandas", "scikit-learn"],
   explanation="The label is a noisy linear rule of x1 and x2, so logistic regression clears 0.85 without a search. Return probabilities, not hard labels.",
   mock="model", timeout=60000)

numeric("E1", 1, "E", "Expected value",
   """A contract pays +8 with probability 0.25, +0 with probability 0.50, and −4 with probability 0.25. Enter the expected value, rounded to 3 decimals.""",
   1.000,
   "E = 8×0.25 + 0×0.50 + (−4)×0.25 = 2 − 1 = 1. Rounded to 3 decimals: 1.000.")

numeric("E2", 2, "M", "Bayes after a positive test",
   """A condition has prevalence 2%. A test has sensitivity 90% and specificity 95%. A person tests positive. Enter P(condition | positive), rounded to 3 decimals.""",
   0.269,
   "P(+) = 0.90×0.02 + 0.05×0.98 = 0.067. P(D|+) = 0.018/0.067 = 0.268656…, which rounds to 0.269.")

numeric("E3", 3, "M", "Which line made the defect",
   """Line A makes 40% of parts with a 2% defect rate. Line B makes 60% with a 5% defect rate. A part is defective. Enter P(it came from A), rounded to 3 decimals.""",
   0.211,
   "P(defect) = 0.4×0.02 + 0.6×0.05 = 0.038. P(A|defect) = 0.008/0.038 = 0.210526…, which rounds to 0.211.")

numeric("E4", 4, "M", "Binomial probability",
   """Eight independent trials, success probability 0.25. Enter P(exactly 2 successes), rounded to 3 decimals.""",
   0.311,
   "C(8,2) × 0.25² × 0.75⁶ = 28 × 0.0625 × 0.1779785… = 0.311462…, which rounds to 0.311.")

numeric("E5", 5, "M", "Confidence interval upper bound",
   """A sample of n = 64 has mean 250. The population standard deviation is 20. Using z = 1.96, enter the upper end of the 95% confidence interval for the mean, rounded to 3 decimals.""",
   254.900,
   "SE = 20/√64 = 2.5. Margin = 1.96 × 2.5 = 4.9. Upper end = 250 + 4.9 = 254.900.")

numeric("E6", 6, "M", "Two-sided coin p-value",
   """A fair coin is the null. You observe 9 heads in 12 flips. Enter the two-sided p-value, rounded to 3 decimals. The distribution is symmetric, so double the matching one-sided tail.""",
   0.146,
   "P(X≥9) = (C(12,9)+C(12,10)+C(12,11)+C(12,12))/4096 = 299/4096. Two-sided = 598/4096 = 0.145996…, which rounds to 0.146.")

numeric("E7", 7, "H", "Committee with a gender constraint",
   """A committee of 5 is drawn at random from 6 men and 5 women. Enter the probability that it contains at least 2 men and at least 2 women, rounded to 3 decimals.""",
   0.758,
   "C(11,5) = 462. Illegal committees: 5 men (6), 4 men and 1 woman (75), 1 man and 4 women (30), 5 women (1). Valid = 462 − 112 = 350. 350/462 = 0.757575…, which rounds to 0.758.")

numeric("E8", 8, "H", "Geometric waiting time",
   """Each independent trial succeeds with probability 0.2. Enter the probability that the first success occurs on the 4th trial, rounded to 3 decimals.""",
   0.102,
   "P(T=4) = 0.8³ × 0.2 = 0.1024, which rounds to 0.102. The mean wait would be 1/0.2 = 5, which is a different question.")

mcq("F1", 1, "E", "Bias and variance",
   "A model is almost perfect on the training set and clearly worse on a held-out set from the same process. Which description fits?",
   [("a", "High bias. Add features or a more flexible model."),
    ("b", "High variance. The model is fitting the particular sample."),
    ("c", "Neither. A gap between train and test means the metric is wrong."),
    ("d", "High bias and high variance cannot be told apart from a train/test gap.")],
   ["b"],
   "A large train-to-test drop is the signature of variance. High bias usually looks mediocre on both.")

mcq("F2", 2, "E", "L1 versus L2",
   "You standardise the inputs and add a penalty. Which statement is right?",
   [("a", "L2 often sets coefficients to exactly zero, so it is the usual sparsity penalty."),
    ("b", "L1 can set coefficients to exactly zero. L2 shrinks them but rarely zeros them."),
    ("c", "Neither penalty changes the coefficients. They only change the intercept."),
    ("d", "The penalty should be chosen to maximise training accuracy.")],
   ["b"],
   "L1 is the sparsity-inducing penalty. The strength of either penalty belongs on validation data, not training accuracy.")

mcq("F3", 3, "M", "Bagging versus boosting",
   "Which description of the two ensembles is right?",
   [("a", "Bagging fits models sequentially on residuals. Boosting averages independent bootstrap models."),
    ("b", "Both methods fit one deep tree and then prune it with L1."),
    ("c", "Bagging averages models fit on bootstrap samples. Boosting fits the next model on the remaining error of the previous ones."),
    ("d", "Random forests are a form of boosting because each tree sees a random subset of features.")],
   ["c"],
   "Bagging is parallel variance reduction. Boosting is sequential. Feature subsampling does not turn a forest into boosting.")

mcq("F4", 4, "M", "Choosing k in KNN",
   "What should you expect as k in k-nearest neighbours increases, assuming inputs are scaled?",
   [("a", "The decision boundary gets smoother: bias up, variance down."),
    ("b", "The decision boundary gets smoother: bias down, variance down."),
    ("c", "k has no effect once features are standardised."),
    ("d", "Larger k always raises accuracy on the training set.")],
   ["a"],
   "A larger neighbourhood averages more neighbours, which is a smoother, more biased rule. k=1 memorizes the training set.")

mcq("F5", 5, "M", "Logistic regression",
   "A logistic regression coefficient on a standardised feature is 0.693, about ln(2). What does that mean?",
   [("a", "A one-unit increase multiplies the odds of the positive class by about 2, other features held fixed."),
    ("b", "A one-unit increase adds 2 to the probability."),
    ("c", "The model was trained by maximising accuracy, so the coefficient is a rate."),
    ("d", "The coefficient is the decision threshold.")],
   ["a"],
   "The linear piece is a log-odds. exp(0.693) ≈ 2 is a multiplier on the odds, not an addition to the probability. Training minimises log loss.")

mcq("F6", 6, "M", "Neural net basics",
   "Select every statement that is true.",
   [("a", "ReLU is a common hidden-unit activation because it reduces the vanishing-gradient problem relative to a deep stack of sigmoids."),
    ("b", "A sigmoid on a single output unit is a standard way to produce a probability for one binary label."),
    ("c", "Dropout randomly drops units during training and is disabled at prediction time."),
    ("d", "Adding layers always reduces both bias and variance.")],
   ["a", "b", "c"],
   "Capacity is not free generalisation. The first three statements are the standard picture; the fourth is false.",
   multi=True)

mcq("F7", 7, "M", "Metric choice",
   "Select every statement that is true.",
   [("a", "When the positive class is rare, a model that never flags anyone can still post a very high accuracy."),
    ("b", "Precision is the share of predicted positives that are truly positive."),
    ("c", "Recall is the share of actual positives that the model catches."),
    ("d", "ROC-AUC at 0.9 guarantees that precision is high at the one threshold you can afford to act on.")],
   ["a", "b", "c"],
   "AUC summarises ranking across thresholds. It does not promise a usable precision at the operating point the business can pay for.",
   multi=True)

mcq("F8", 8, "M", "Leakage and selection",
   "Select every practice that leaks or biases the model.",
   [("a", "Using a refund that is only issued after the customer has already churned, as a feature to predict churn at decision time."),
    ("b", "Fitting a scaler on the full dataset, then splitting into train and test."),
    ("c", "Target-encoding a category with means computed on train and test together."),
    ("d", "Fitting the imputer inside a pipeline that is refit on each cross-validation fold.")],
   ["a", "b", "c"],
   "The pipeline-per-fold imputer is the version that avoids leakage. The other three all let information from the wrong rows into the fit.",
   multi=True)

py("G1", "numpy", 1, "E", "Column z-scores by broadcasting",
   """`X` is a 2-d numeric array, shape `(rows, columns)`. Return an array of the same shape: each column standardised with that column's mean and sample standard deviation (`ddof=1`). Do not use pandas. Every column in the tests has non-zero variance.""",
   "def solution(X):\n    raise NotImplementedError",
   """def solution(X):
    import numpy as np
    X = np.asarray(X, dtype=float)
    mu = X.mean(axis=0)
    sd = X.std(axis=0, ddof=1)
    return (X - mu) / sd""",
   [("three rows", """
X = np.array([[1.0, 10.0], [2.0, 20.0], [3.0, 30.0]])
expect_array(solution(X), [[-1, -1], [0, 0], [1, 1]])
""")],
   prelude="import numpy as np",
   packages=["numpy"],
   explanation="`axis=0` reduces rows. The resulting length-2 vectors broadcast across the rows. Sample std of 1,2,3 is 1, so the z-scores are −1, 0, 1.")

py("G2", "numpy", 2, "M", "Least squares",
   """`X_raw` has a single feature column and `y` the targets. Fit an ordinary least-squares line with an intercept using NumPy only (`np.linalg.lstsq` is the stable call). Return `{'intercept': float, 'slope': float}`.""",
   "def solution(X_raw, y):\n    raise NotImplementedError",
   """def solution(X_raw, y):
    import numpy as np
    X_raw = np.asarray(X_raw, dtype=float)
    y = np.asarray(y, dtype=float)
    design = np.column_stack([np.ones(len(X_raw)), X_raw])
    beta = np.linalg.lstsq(design, y, rcond=None)[0]
    return {'intercept': float(beta[0]), 'slope': float(beta[1])}""",
   [("line y = 1 + 2x", """
got = solution([[1.0], [2.0], [3.0], [4.0]], [3.0, 5.0, 7.0, 9.0])
expect_close(got['intercept'], 1.0)
expect_close(got['slope'], 2.0)
""")],
   packages=["numpy"],
   explanation="A column of ones carries the intercept. `lstsq` returns the coefficients in that column order.")

py("G3", "numpy", 3, "M", "K-means labels",
   """Run k-means for exactly 2 assignment/update iterations. `points` is `(n, 2)`. Initial centroids are `[[0, 0], [5, 5]]`, index 0 then index 1. Assign each point to the nearest centroid by squared Euclidean distance, breaking ties toward the lower index. Then set each centroid to the mean of its points. Return the list of integer labels after the second assignment.""",
   "def solution(points):\n    raise NotImplementedError",
   """def solution(points):
    import numpy as np
    pts = np.asarray(points, dtype=float)
    centroids = np.array([[0.0, 0.0], [5.0, 5.0]])
    labels = np.zeros(len(pts), dtype=int)
    for _ in range(2):
        dist = ((pts[:, None, :] - centroids[None, :, :]) ** 2).sum(axis=2)
        labels = dist.argmin(axis=1)
        for k in range(2):
            members = pts[labels == k]
            if len(members):
                centroids[k] = members.mean(axis=0)
    return [int(v) for v in labels]""",
   [("two tight clusters", """
points = [[0.0, 0.0], [0.2, 0.1], [5.0, 5.0], [5.2, 4.8], [0.1, 0.3], [4.7, 5.1]]
expect_equal(solution(points), [0, 0, 1, 1, 0, 1])
""")],
   packages=["numpy"],
   explanation="The clusters are already sitting on the initial centroids, so both iterations keep labels `[0, 0, 1, 1, 0, 1]`. `argmin` breaks a tie toward the smaller index.")

py("G4", "numpy", 4, "M", "Confusion counts and AUC",
   """`y` is 0/1 and `scores` are floats, with no tied scores. Return a dict:

- `tp`, `fp`, `fn`, `tn` at threshold 0.5 (`score >= 0.5` is positive)
- `auc`, the ROC AUC computed with a trapezoid as you walk scores from high to low

Do not import sklearn.""",
   "def solution(y, scores):\n    raise NotImplementedError",
   """def solution(y, scores):
    import numpy as np
    y = np.asarray(y).astype(int)
    scores = np.asarray(scores, dtype=float)
    pred = (scores >= 0.5).astype(int)
    tp = int(((pred == 1) & (y == 1)).sum())
    fp = int(((pred == 1) & (y == 0)).sum())
    fn = int(((pred == 0) & (y == 1)).sum())
    tn = int(((pred == 0) & (y == 0)).sum())
    order = np.argsort(-scores)
    ranked = y[order]
    P = max(int((y == 1).sum()), 1)
    N = max(int((y == 0).sum()), 1)
    tps = fps = 0.0
    area = 0.0
    prev_fpr = prev_tpr = 0.0
    for label in ranked:
        tps += label == 1
        fps += label == 0
        tpr, fpr = tps / P, fps / N
        area += (fpr - prev_fpr) * (tpr + prev_tpr) / 2
        prev_fpr, prev_tpr = fpr, tpr
    return {'tp': tp, 'fp': fp, 'fn': fn, 'tn': tn, 'auc': float(area)}""",
   [("counts and area", """
got = solution([0, 0, 1, 1], [0.2, 0.8, 0.4, 0.9])
expect_equal((got['tp'], got['fp'], got['fn'], got['tn']), (1, 1, 1, 1))
expect_close(got['auc'], 0.75)
""")],
   packages=["numpy"],
   explanation="At 0.5 the predictions are 0,1,0,1 against labels 0,0,1,1, so every confusion cell is 1. Walking the ROC from the high score gives area 0.75.")

sql(
    "H4", 4, "M", "Join, group, having",
    """Tables `customers` and `orders` are already loaded.

`customers`: `id`, `name`, `segment`
`orders`: `id`, `customer_id`, `amount`, `status`

Return one row per segment with columns `segment`, `revenue`, `orders`. `revenue` is the sum of `amount` rounded to 2 decimals. `orders` is the number of orders. Use paid orders only. Keep segments that have at least 2 paid orders. Order by `segment` ascending.""",
    """CREATE TABLE customers (id INTEGER, name TEXT, segment TEXT);
CREATE TABLE orders (id INTEGER, customer_id INTEGER, amount REAL, status TEXT);
INSERT INTO customers VALUES (1, 'Ann', 'Pro'), (2, 'Bo', 'Basic'), (3, 'Cy', 'Pro'), (4, 'Dee', 'Basic');
INSERT INTO orders VALUES
 (1, 1, 100, 'paid'), (2, 1, 50, 'paid'), (3, 2, 40, 'paid'), (4, 2, 10, 'void'),
 (5, 3, 70, 'paid'), (6, 3, 30, 'paid'), (7, 4, 20, 'paid'), (8, 4, 25, 'paid');""",
    "SELECT segment, revenue, orders\nFROM customers\nWHERE 1 = 0\n",
    """SELECT c.segment AS segment,
       ROUND(SUM(o.amount), 2) AS revenue,
       COUNT(*) AS orders
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'paid'
GROUP BY c.segment
HAVING COUNT(*) >= 2
ORDER BY segment""",
    ["segment", "revenue", "orders"],
    [["Basic", 85, 3], ["Pro", 250, 4]],
    "Paid Basic is 40 + 20 + 25 = 85 across Bo's one paid order and Dee's two. Paid Pro is 250 across four orders. The void row never enters the aggregate.",
)

sql(
    "H5", 5, "M", "Rank within category",
    """Table `products(category, product, revenue)` is loaded.

Return `category`, `product`, `revenue`, `rnk` where `rnk` is `RANK()` of revenue descending within the category. Keep rows with `rnk <= 2`. Order by category, then rnk, then product.""",
    """CREATE TABLE products (category TEXT, product TEXT, revenue REAL);
INSERT INTO products VALUES
 ('A', 'p1', 10), ('A', 'p2', 30), ('A', 'p3', 30),
 ('B', 'p4', 5), ('B', 'p5', 9);""",
    "SELECT category, product, revenue, 1 AS rnk\nFROM products\nWHERE 1 = 0\n",
    """SELECT category, product, revenue, rnk FROM (
  SELECT category, product, revenue,
         RANK() OVER (PARTITION BY category ORDER BY revenue DESC) AS rnk
  FROM products
) t
WHERE rnk <= 2
ORDER BY category, rnk, product""",
    ["category", "product", "revenue", "rnk"],
    [["A", "p2", 30, 1], ["A", "p3", 30, 1], ["B", "p5", 9, 1], ["B", "p4", 5, 2]],
    "RANK gives both A products at revenue 30 the rank 1, and p1 falls to rank 3, so it is filtered out. You cannot put the rank filter in the same WHERE as the window.",
)

sql(
    "H6", 6, "H", "Month-on-month change",
    """Table `monthly(month, revenue)` is loaded. `month` is a `YYYY-MM` text that sorts chronologically.

Return `month`, `revenue`, `delta`, where `delta` is revenue minus the previous month's revenue in calendar order. The first month's delta is null. Order by month.""",
    """CREATE TABLE monthly (month TEXT, revenue REAL);
INSERT INTO monthly VALUES ('2024-01', 100), ('2024-02', 80), ('2024-03', 110);""",
    "SELECT month, revenue, NULL AS delta\nFROM monthly\nORDER BY month\n",
    """SELECT month, revenue,
       revenue - LAG(revenue) OVER (ORDER BY month) AS delta
FROM monthly
ORDER BY month""",
    ["month", "revenue", "delta"],
    [["2024-01", 100, None], ["2024-02", 80, -20], ["2024-03", 110, 30]],
    "LAG looks one row back in the window order. January has no predecessor, so the delta is null. February is 80 − 100.",
)

py("H1", "sqlalgo", 1, "E", "Two sum",
   """Write `solution(nums, target)` returning the indices of two entries that add to `target`. Walk left to right and return as soon as the complement of the current value has already been seen, so the pair is the one that finishes earliest. Return `[]` if none exists. Each input has at most one such pair.""",
   "def solution(nums, target):\n    raise NotImplementedError",
   """def solution(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i
    return []""",
   [("earliest finish", "expect_equal(solution([1, 5, 3, 7], 8), [1, 2])"),
    ("pair at the ends", "expect_equal(solution([2, 7, 11, 15], 9), [0, 1])"),
    ("missing", "expect_equal(solution([1, 2, 3], 100), [])")],
   explanation="A dict from value to index answers 'have I seen the complement?' in constant time. Returning immediately is what makes the pair unique.")

py("H2", "sqlalgo", 2, "M", "Merge intervals",
   """`intervals` is a list of `[start, end]` pairs, closed on both ends. Merge any that overlap or touch and return the merged list sorted by start. Each merged piece is a two-item list.""",
   "def solution(intervals):\n    raise NotImplementedError",
   """def solution(intervals):
    if not intervals:
        return []
    ordered = sorted(intervals)
    out = [list(ordered[0])]
    for start, end in ordered[1:]:
        if start <= out[-1][1]:
            out[-1][1] = max(out[-1][1], end)
        else:
            out.append([start, end])
    return out""",
   [("overlap and a gap", "expect_equal(solution([[1, 3], [2, 6], [8, 10], [15, 18]]), [[1, 6], [8, 10], [15, 18]])"),
    ("touching ends merge", "expect_equal(solution([[1, 4], [4, 5]]), [[1, 5]])")],
   explanation="Sort by start, then extend the open interval while the next start is less than or equal to its end. A shared endpoint is an overlap for a closed interval.")

py("H3", "sqlalgo", 3, "M", "Sliding window sum",
   """Write `solution(nums, k)` returning the maximum sum of any contiguous subarray of length exactly `k`. `k` is at least 1 and no longer than `nums`.""",
   "def solution(nums, k):\n    raise NotImplementedError",
   """def solution(nums, k):
    total = sum(nums[:k])
    best = total
    for i in range(k, len(nums)):
        total += nums[i] - nums[i - k]
        if total > best:
            best = total
    return best""",
   [("classic window", "expect_equal(solution([2, 1, 5, 1, 3, 2], 3), 9)"),
    ("the whole array", "expect_equal(solution([1, 2], 2), 3)")],
   explanation="Keep a running sum of k elements. When the window moves one step, add the new value and subtract the one that fell out. 5+1+3 = 9 is the best window.")

CASE_OUTLINE_NOTE = "Shown after you submit, as a skeleton rather than a script."

case(
    "I1", 1, "Weekly grocery forecast",
    """A national grocer wants a weekly forecast for 8,000 skus across 400 stores. Planners currently copy last year's week and add 2%. Waste on fresh food is high, and so are stockouts on promoted skus. You have three years of daily sales, a promo calendar, price, and a flag for days the shelf was empty. The planning team will only change an order if they trust the number on Monday morning.

Write the case you would take into a BCG X interview. Cover the decision the forecast serves, the grain, the metrics (and why a single MAPE is not enough), the baseline, features, how you would validate, and what you would ship in the first month versus later. Mention intermittent skus and stockouts specifically.

You will be asked what you would put in front of a planner on Monday of week one, what you would not automate yet, and how a stockout should change the training label. Waste costs about 1.40 per unit on fresh and a stockout costs the lost sale plus a substitution you cannot see.""",
    """A strong outline:
- Decision: the store order for next week, not a dashboard. Grain: sku × store × week, because that is the purchase order.
- Baseline: seasonal naive (same week last year), which is what planners already approximate. You must beat it on WAPE and on bias, not only on a flashy model.
- Metrics: WAPE for the mix of volumes, bias so you do not systematically over-order fresh, MAE in units for the buyer. MAPE will embarrass slow skus and break on zeros.
- Stockouts: sales are not demand. Treat zero-on-hand days as censored, or the model learns that demand was zero.
- Features: lags and seasonal lags, promo type and price, calendar, local events if they exist. Keep the first model additive and explainable.
- Validation: rolling origin, never a random week split. Report WAPE by volume tier.
- Intermittent skus: do not smear a weekly mean. Separate "any sale" from size, and put a wider safety stock on them.
- First month: seasonal naive plus promo uplift for the top volume skus, published next to the old forecast so planners can veto. Hierarchies and new-store pooling come after the Monday process is real.""",
    "demand forecasting: grain, WAPE versus MAPE, bias, stockout censoring, seasonal baseline, rolling-origin validation, and a Monday-morning adoption plan.",
)

case(
    "I2", 2, "Spare parts and a new depot",
    """An industrial OEM stocks 30,000 spare parts. Most sell fewer than five units a year. A new depot opens next quarter with no history. The CFO wants a forecast and a recommended opening stock, and has heard that "AI demand sensing" is what competitors bought.

Write how you would frame the forecast, what you would refuse to promise, how you would borrow strength for the new depot, and how the stock decision uses the forecast rather than displaying it. Include error metrics that survive intermittent demand.

Lead time is 6 weeks for imported parts and 4 days for a short list of fast movers. The outlet cost of a stockout is a grounded aircraft or a stopped line, not a lost retail sale. Opening capital for the new depot is capped, so you cannot stock the long tail at the old network's depth. Engineering will delete parts that have had no demand in five years if you show them the list.""",
    """A strong outline:
- Most series are intermittent. A weekly point forecast will be a string of zeros with an occasional spike, and MAPE is undefined or absurd.
- Model the rate of demand and the size of a demand, or a hurdle, then convert to a lead-time distribution. The decision is a stock quantile, not the mean.
- Metrics: WAPE or MAE in units on the aggregate, bias, and service level (fill rate) on a backtest of the policy. Not MAPE.
- New depot: pool with similar depots (fleet mix, climate, industry). Shrink hard toward that pool. Show a wide interval and a small opening list of parts that are cheap to stock or painful to miss.
- What you would not buy: a deep model on 30,000 sparse series before the hierarchy and the pooling are in place.
- First deliverable: classify parts into fast / intermittent / dead, set stock from a simple rate model, and review dead stock with engineering before the depot opens.""",
    "intermittent demand, fill rate rather than MAPE, shrinkage toward similar depots, and a stock policy rather than a point forecast.",
)

case(
    "I3", 3, "Churn calls under a budget",
    """A telecom has a model that scores P(churn in 60 days) with AUC 0.78. Retention can call 20,000 customers a month. The call centre is already calling the highest scores. Save rate on those calls is about 4%, and a saved customer is worth roughly 180 in contribution after the discount they offer. A call costs 6. Leadership wants you to "use the model better".

Write the case. Define the decision, why risk is not the same as uplift, how you would test it, what you would do before any new model is trained, and how you would know the change made money.

The discount offered on a save is fixed. Agents work from a Monday list and will not look at more than a score plus one reason code. Regulatory rules forbid using a few sensitive attributes. You may propose a test that withholds the call from a random slice of eligible customers.""",
    """A strong outline:
- Decision: which 20,000 customers to call, maximising expected contribution, not AUC.
- The current policy is a baseline: top risk. Report its profit, not a world with no calls.
- Uplift: the call changes the outcome for some customers and not others. High risk can mean "already gone" or "would have stayed". If there is no randomised history, say you cannot identify uplift yet.
- Immediate step: randomise a slice of the call list (or hold out a group) so the next quarter measures a save rate that is causal. Until then, rank by risk × value × a conservative save rate, minus cost, and cap contacts per household.
- Value: 180 × save rate − 6. At a 4% save rate the call is worth about 1.2, so the programme is thin. A model only helps if it concentrates the saves.
- Validation of any new score: time-based, on the policy's profit, with the same offer rules. Do not retune on the customers who were already called.
- What you would not do: retrain a more complex churn model and hand the same top-20,000 list back.""",
    "churn as a budgeted action, uplift versus risk, a real baseline, unit economics, and a randomised measurement plan.",
)

case(
    "I4", 4, "Price with a capacity constraint",
    """A hotel chain sets nightly rates for 120 properties. Revenue management already uses a rules engine. Occupancy on event weeks hits 100% and price looks too low; midweek in winter is empty and price looks too high. You may not price below a brand floor, you may not move a rate more than 15% week to week, and a property cannot sell more rooms than it has. Competitor rates are scraped and noisy.

Write how you would use data to recommend a price, what the decision variable and the objective are, which constraints bind, what you can and cannot identify from historical prices, and how you would pilot.

Variable cost is about 18 per occupied room. A refused high-rate night during an event cannot be recovered. The commercial lead will reject a recommendation that moves more than a few dozen properties in the first month, and they want to know which nights you would leave on the current rule.""",
    """A strong outline:
- Decision variable: the nightly rate by property and date, or a multiplier on the current rule. Objective: contribution (rate minus variable cost) subject to the room cap, the floor, and the 15% move limit. Revenue alone will overprice nothing and underprice the cap.
- Demand is an input. A simple elasticity, or even a monotone grid search over feasible prices, is enough to start if the constraints are honoured.
- Identification: historical price moves are mixed with events, the old rules, and sell-outs. A sell-out week does not tell you the demand curve above the cap. Say that plainly.
- Competitor scrapes are a control, not the strategy. Noise and missing rates need a rule.
- Pilot: randomise the multiplier within the 15% band on a subset of property-nights that are not event peaks, for long enough to see occupancy and contribution. Keep the rules engine as the fallback.
- What you would not do: an unconstrained "optimal price" from a regression of bookings on price.""",
    "pricing: decision variable, contribution, capacity and brand constraints, identification, and a bounded pilot.",
)

case(
    "I5", 5, "End-of-season markdowns",
    """A fashion retailer has 12 weeks to clear seasonal stock. Every Monday they pick a discount of 0, 20, 40, or 60 percent per style. Leftover units after week 12 go to an outlet at a known loss. Gross margin and the brand team's dislike of deep discounts both matter. You have weekly sales, price, and starting inventory by style.

Write the optimisation you would actually run, including the decision variable, the objective, the constraints, and how you would estimate the effect of a markdown given that past markdowns were chosen by merchants who could see the stock.

Styles differ by a lot in starting depth. A 60% discount in week 2 trains the customer to wait, and the brand team has vetoed that in public. You can randomise the first markdown week for a subset of styles this season. Say how that experiment feeds the policy you would run next season.""",
    """A strong outline:
- Decision: a discount in {0, 20, 40, 60} each week for each style. This is a small discrete set. A dynamic program or even a greedy one-step lookahead is credible.
- Objective: expected margin over the remaining season, including the outlet salvage. A constraint or a penalty captures "do not go to 60% before week 8" if the brand team requires it.
- State: weeks left, units left, and a simple demand model at each discount.
- Demand estimation is biased: merchants marked down dogs. Prefer within-style variation over time, or a pilot that randomises the week a style first hits 20%.
- Do not recommend a continuous price. The operation can only execute four rungs.
- Report the policy against "merchant's usual week-6 markdown", in margin and in units sent to outlet.""",
    "markdown optimisation: discrete decision variable, salvage value, merchant confounding, and a policy compared with the current calendar.",
)

case(
    "I6", 6, "Batch scoring into the CRM",
    """The churn score from a sister case has to reach 400 retail agents every Monday. Features today are built in a notebook. Scores are pasted into a sheet. Two agents already noticed that a customer's "complaints in the last 7 days" on the sheet did not match the CRM.

Design the system you would put in place. Cover training versus serving, the schedule, what gets logged, how you would monitor it, and how a bad Monday is rolled back. Stay concrete. This is a weekly list, not a checkout API.

The notebook currently takes 40 minutes and fails when a join duplicates customers. Two people know how to run it. Agents need the file by 07:00 local, and last week's list must remain available if this week's job fails. You do not need to invent a feature store product name. Describe the tables, the job, and the rollback.""",
    """A strong outline:
- Batch, weekly. A real-time feature store is not the first design.
- One scheduled job builds features as of Sunday night from the same SQL the training set used. That is how the complaint-count bug dies.
- The model scores only rows that pass data checks (null rate, row count, join fan-out). On failure it republishes last week's scores and pages the owner. Agents never see a half file.
- Log: customer id, feature values that were scored, model version, score, the decision (called or not), and later the outcome.
- Monitor: score distribution versus last month, a few feature means, contact rate, and delayed save rate. AUC arrives too late to be the only alarm.
- Retrain on a cadence, with a challenger that has to beat the incumbent on the policy metric in a backtest before it is promoted. Rollback is "point the job at the previous version", which only works if versions are immutable.
- Access: agents see the list and a short reason, not a notebook.""",
    "batch ML system design: one feature definition, failed-job behaviour, logging, monitoring, and rollback.",
)

case(
    "I7", 7, "A card-payment decision",
    """A bank wants a model in the authorisation path for card-not-present payments. The auth has to return in under 200 milliseconds. Today a rules engine blocks obvious cases and approves the rest. Fraud ops can review only 3,000 transactions a day. False declines are expensive because the customer takes the next purchase elsewhere. Confirmed fraud labels arrive days later, and only for a fraction of cases.

Design the decision system. Include latency, fallback, where the model sits relative to the rules, how reviewers are used, and what you would measure in the first pilot.

A false decline on a good customer is priced by the business at roughly 40 in lost margin. A missed fraud averages 220, but only about a third of fraud is confirmed within 14 days. The rules engine already blocks stolen-card patterns and sanctions hits. You cannot add more than a few milliseconds of feature lookup, and a model timeout has to do something explicit.""",
    """A strong outline:
- The decision is approve, step-up (3-D Secure or review), or decline. A probability is not a decision.
- Hard latency budget. The model is a small scorer with features already computed or looked up, not a query across raw history. On timeout, fall back to the current rules. Never fail closed into a mass decline because the model is down.
- Rules stay in front for the cases that are legally or operationally certain. The model allocates the scarce 3,000 reviews and the step-ups, where the economics are soft.
- Objective: expected loss from fraud minus expected loss from false declines, subject to the review cap. Pick the threshold from that, not from a default 0.5.
- Labels are late and incomplete. A sample of approvals has to be investigated or the model only learns from what the old rules already caught.
- Pilot: shadow mode first (score logged, rules unchanged), then a slice of traffic with a kill switch. Watch decline rate and review volume the same day. Fraud loss is a lagging metric.
- Log the features served, the score, the rule path, and the fallback flag.""",
    "real-time decisioning: latency and fallback, rules plus model, asymmetric costs, delayed labels, shadow then limited pilot.",
)

case(
    "I8", 8, "Should this retention offer be a model",
    """Marketing wants an uplift model to decide who receives a 15% discount email. They have never randomised the offer. The last three campaigns went to customers the CRM marked as "high value and quiet". Finance thinks the emails mostly discount people who would have bought anyway. You have one quarter and one analyst.

Write whether you would build a model now, what experiment you would run instead or first, how large and how long, what you would measure, and how you would stop the programme.

The email list is 2 million customers. Finance will fund one campaign this quarter and wants a stop/go before the next budget cycle. The CRM team can hold out a random 10% without a model. Click-through is what marketing reports today. Contribution after the discount is what finance will believe. Say which one you would pre-register, and what result would make you refuse to build the uplift model afterwards.""",
    """A strong outline:
- Do not build the uplift model yet. There is no random variation, so any model will reproduce the old targeting and call it propensity.
- Run a randomised encouragement: a held-out group that is eligible but does not get the email, large enough to see the margin effect, not just the click rate. Stratify the randomisation on the current "high value and quiet" flag so the old policy is a visible arm.
- Primary metric: incremental contribution per email, after the discount. Secondary: unsubscribe and support contacts. A click-through lift is not success.
- Duration: one purchase cycle, pre-registered sample size. Peeking every day and stopping on a lucky week is how the last team got a fake win.
- Only if the offer has a positive increment overall, or in a pre-declared segment, do you spend the next quarter modelling who should get it.
- Stopping rule: if incremental contribution is negative and the interval excludes a worthwhile gain, kill the discount and keep the measurement habit.
- Say this out loud. Recommending an experiment instead of a model is the senior answer.""",
    "experiment design before modelling: randomisation, incrementality, a pre-registered metric, and a willingness not to build the model yet.",
)

# Algorithms were given order 1..3 but SQL was added later and also needs to sit
# after them. Re-number so difficulty is non-decreasing: H1 E, H2 M, H3 M, H4 M, H5 M, H6 H.
# Orders are already 1..6 with that difficulty pattern. Good.

CHEAT = [
    {"id": "py-fstring", "section": "Python", "title": "f-strings", "body": "f\"{name} scored {score:.1f}\" rounds to one decimal. f\"{n:,}\" adds thousands separators."},
    {"id": "py-slice", "section": "Python", "title": "Slices", "body": "xs[start:end] is half-open. xs[-2:] is the last two. xs[::-1] reverses. Slicing off the end does not raise."},
    {"id": "py-dict", "section": "Python", "title": "dict.get", "body": "d.get(key, 0) returns the default instead of raising. Use it to count: d[k] = d.get(k, 0) + 1."},
    {"id": "py-comp", "section": "Python", "title": "Comprehensions", "body": "[n*n for n in nums if n % 2 == 0]. Dict form: {k: v for k, v in pairs}."},
    {"id": "py-loop", "section": "Python", "title": "enumerate and zip", "body": "for i, (name, score) in enumerate(zip(names, scores), start=1). zip stops at the shorter list."},
    {"id": "py-fn", "section": "Python", "title": "Defaults and lambda", "body": "def f(prices, discount=0.1). Defaults bind at definition time. lambda r: (-r['rev'], r['name']) is a sort key."},
    {"id": "py-sort", "section": "Python", "title": "Sort key", "body": "sorted(rows, key=lambda r: (-r['rev'], r['name'])) sorts revenue down, then name up. sorted returns a new list."},
    {"id": "py-str", "section": "Python", "title": "String cleanup", "body": "text.strip().lower().replace(',', '').split('-'). startswith / endswith for cheap filters."},
    {"id": "py-collections", "section": "Python", "title": "Counter and defaultdict", "body": "Counter(tokens).most_common(1). defaultdict(list) then groups[k].append(v). Wrap with dict() if you need a plain dict."},
    {"id": "py-exc", "section": "Python", "title": "Exceptions", "body": "try: return int(text)\\nexcept (ValueError, TypeError): return None. Do not use a bare except."},
    {"id": "pd-select", "section": "Pandas", "title": "loc and iloc", "body": "df.loc[df['region'].eq('East'), ['revenue']]. df.iloc[0, 1] is position. Masks need parentheses: (a > 0) & (b < 3)."},
    {"id": "pd-assign", "section": "Pandas", "title": "Assign", "body": "out = df.copy(); out['margin'] = out['revenue'] - out['cost']. Assigning on a slice without loc is unreliable."},
    {"id": "pd-concat", "section": "Pandas", "title": "Concat", "body": "pd.concat([a, b], ignore_index=True) unions columns and fills gaps with null. Then select the column order you were asked for."},
    {"id": "pd-merge", "section": "Pandas", "title": "Merge", "body": "orders.merge(customers, on='customer_id', how='left'). Deduplicate the right table first or the row count explodes. how='left' keeps unmatched left rows."},
    {"id": "pd-groupby", "section": "Pandas", "title": "Named aggregation", "body": "df.groupby('region', as_index=False).agg(revenue=('amount','sum'), orders=('order_id','count'), aov=('amount','mean'))."},
    {"id": "pd-transform", "section": "Pandas", "title": "transform share and z-score", "body": "g = df.groupby('category')['revenue']; df['share'] = df['revenue'] / g.transform('sum'); df['z'] = (df['revenue'] - g.transform('mean')) / g.transform('std'). pandas std is ddof=1."},
    {"id": "pd-pivot", "section": "Pandas", "title": "pivot_table and melt", "body": "pivot_table(index=, columns=, values=, aggfunc='sum', fill_value=0). reindex columns to force a missing level. melt(id_vars=, value_vars=, var_name=, value_name=)."},
    {"id": "pd-time", "section": "Pandas", "title": "resample, shift, rolling", "body": "pd.to_datetime. set_index('date').resample('ME')['amount'].sum() fills empty months. groupby(key)[col].shift(1). rolling(3, min_periods=1).mean() via transform."},
    {"id": "pd-rank", "section": "Pandas", "title": "Top-N with ties", "body": "df.sort_values(['category','revenue','product_id'], ascending=[True, False, True]).groupby('category', as_index=False).head(2)."},
    {"id": "pr-na", "section": "Processing", "title": "Group imputation", "body": "med = df.groupby('segment')['income'].transform('median'); df['income'] = df['income'].fillna(med).fillna(df['income'].median())."},
    {"id": "pr-outlier", "section": "Processing", "title": "IQR cap", "body": "q1, q3 = s.quantile(0.25), s.quantile(0.75); s.clip(q1 - 1.5*(q3-q1), q3 + 1.5*(q3-q1)). Fit fences on train only."},
    {"id": "pr-bin", "section": "Processing", "title": "cut, qcut, log1p", "body": "pd.cut(age, [0,18,35,50,120], labels=[...], right=False). pd.qcut(spend, 4, labels=['Q1','Q2','Q3','Q4']). np.log1p for zeros."},
    {"id": "pr-encode", "section": "Processing", "title": "Encodings", "body": "plan.map({'Basic':0,'Plus':1,'Pro':2}). pd.get_dummies(..., dtype=int) or OneHotEncoder(handle_unknown='ignore', sparse_output=False). Target mean from train only; unseen -> global train mean."},
    {"id": "pr-scale", "section": "Processing", "title": "StandardScaler", "body": "scaler = StandardScaler().fit(train[cols]); train[cols] = scaler.transform(train[cols]); test[cols] = scaler.transform(test[cols]). Population std. Zero variance becomes zeros on the training rows."},
    {"id": "pr-leak", "section": "Processing", "title": "Leakage tells", "body": "Future refunds, a column copied from the label, a statistic fit on train+test, target encoding fit on the test labels, dummies built separately on test. A random split does not fix any of these."},
    {"id": "pr-pipe", "section": "Processing", "title": "ColumnTransformer", "body": "Pipeline([('imp', SimpleImputer(strategy='median')), ('sc', StandardScaler())]). One-hot branch with most_frequent and handle_unknown='ignore'. Wrap both in ColumnTransformer and fit on train."},
    {"id": "sk-split", "section": "sklearn", "title": "Stratified split", "body": "train_test_split(df, test_size=0.25, random_state=0, stratify=df['y'])."},
    {"id": "sk-linear", "section": "sklearn", "title": "Linear and logistic", "body": "LinearRegression().fit(X, y).coef_ and .intercept_. LogisticRegression(max_iter=500).predict_proba(X)[:, 1] is the positive score. predict() already cut at 0.5."},
    {"id": "sk-tree", "section": "sklearn", "title": "Forests and weights", "body": "RandomForestClassifier(n_estimators=20, random_state=0). class_weight='balanced' on imbalance. Set random_state or the next run moves."},
    {"id": "sk-cv", "section": "sklearn", "title": "cross_val_score and GridSearchCV", "body": "cross_val_score(est, X, y, cv=4, scoring='accuracy').mean(). GridSearchCV(est, {'max_depth':[1,4]}, cv=3, scoring='accuracy').fit(...). best_params_, best_score_."},
    {"id": "sk-metrics", "section": "sklearn", "title": "Metric calls", "body": "precision_score, recall_score, f1_score, roc_auc_score on scores. mean_absolute_error, sqrt(mean_squared_error) for RMSE, r2_score. zero_division=0. Gini = 2*AUC-1."},
    {"id": "met-formulas", "section": "Formulas", "title": "Numbers worth memorising", "body": "Bayes: TP / (TP+FP). SE = sigma/sqrt(n). Margin = z*SE. Binomial C(n,k) p^k (1-p)^(n-k). Poisson P(0)=e^(-lambda). Geometric P(T=k)=(1-p)^(k-1)*p, mean 1/p. Var = E[X^2]-(E[X])^2. Adj R2 = 1-(1-R2)*(n-1)/(n-p-1). WAPE = sum|e|/sum|actual|. MAPE breaks at zero."},
    {"id": "np-broadcast", "section": "NumPy", "title": "Broadcasting", "body": "mu = X.mean(axis=0); sd = X.std(axis=0, ddof=1); (X-mu)/sd. keepdims=True when reducing axis 1 and broadcasting back. np.std default ddof is 0. Pandas std default is 1."},
    {"id": "np-lstsq", "section": "NumPy", "title": "Least squares and k-means", "body": "design = np.column_stack([np.ones(n), X]); beta = np.linalg.lstsq(design, y, rcond=None)[0]. K-means: dist = ((pts[:,None,:]-centroids[None,:,:])**2).sum(2); labels = dist.argmin(1)."},
    {"id": "sql-join", "section": "SQL", "title": "Join, group, having", "body": "SELECT segment, ROUND(SUM(amount),2) AS revenue, COUNT(*) AS orders FROM orders o JOIN customers c ON c.id = o.customer_id WHERE status='paid' GROUP BY segment HAVING COUNT(*)>=2 ORDER BY segment. WHERE filters rows. HAVING filters groups."},
    {"id": "sql-window", "section": "SQL", "title": "Windows", "body": "RANK() OVER (PARTITION BY category ORDER BY revenue DESC). Filter rank in an outer query. LAG(revenue) OVER (ORDER BY month) is null on the first row. ROW_NUMBER never ties. DENSE_RANK does not skip."},
    {"id": "case-forecast", "section": "Cases", "title": "Forecasting", "body": "Decision and grain first. Baseline = seasonal naive. WAPE and bias, not MAPE alone. Stockouts censor demand. Rolling origin. Intermittent series need a rate and a size, then a stock quantile."},
    {"id": "case-churn", "section": "Cases", "title": "Churn", "body": "The decision is who to contact under a budget. Risk is not uplift. Time split. Value × save rate − cost. Compare with the current 'call the riskiest' policy. Randomise before you trust a save rate."},
    {"id": "case-price", "section": "Cases", "title": "Price and markdowns", "body": "Name the decision variable and the constraints before the model. Objective is usually contribution. Sell-outs do not trace the demand curve. Pilot inside the move limit. Markdowns are a small discrete set plus a salvage value."},
    {"id": "case-system", "section": "Cases", "title": "System design", "body": "Batch for a weekly list. One feature SQL for train and serve. On failure, republish the last good scores. Log features, version, score, decision, outcome. Timeout falls back to rules. Shadow mode, then a slice, with a kill switch."},
]

# Attach readings and validate structure.
for reading in READINGS:
    body = reading["body"].strip()
    if "What you must memorise" not in body or "Pitfall" not in body:
        raise SystemExit(f"reading {reading['id']} missing required sections")
    if len(body) < 1500:
        raise SystemExit(f"reading {reading['id']} too short ({len(body)})")
    QS.append({
        "id": reading["id"], "code": reading["code"], "group": reading["group"], "order": reading["order"],
        "type": "reading", "title": reading["title"], "minutes": reading["minutes"], "body": body,
        "difficulty": "E", "prompt": body, "explanation": "",
    })

rank = {"E": 0, "M": 1, "H": 2}
for g in GROUPS:
    items = sorted((q for q in QS if q["group"] == g["id"]), key=lambda q: q["order"])
    if not items or items[0]["type"] != "reading":
        raise SystemExit(f"{g['id']} does not start with a reading")
    diffs = [rank[q["difficulty"]] for q in items if q["type"] != "reading"]
    if diffs != sorted(diffs):
        raise SystemExit(f"{g['id']} difficulty not sorted: {[(q['code'], q['difficulty']) for q in items if q['type']!='reading']}")
    codes = [q["code"] for q in items]
    if len(codes) != len(set(codes)):
        raise SystemExit(f"duplicate codes in {g['id']}")

ids = [q["id"] for q in QS]
if len(ids) != len(set(ids)):
    raise SystemExit("duplicate ids")

need = {"numeric": 2, "mcq": 6, "collection": 1, "processing": 1, "model": 1}
have = {}
for q in QS:
    role = q.get("mockRole")
    if role:
        have[role] = have.get(role, 0) + 1
for role, n in need.items():
    if have.get(role, 0) < n:
        raise SystemExit(f"mock pool {role} has {have.get(role, 0)}")

bank = {"groups": GROUPS, "questions": QS, "cheatsheet": CHEAT}
out = ROOT / "questions" / "bank.json"
out.write_text(json.dumps(bank, ensure_ascii=False))
from collections import Counter
c = Counter(q["type"] for q in QS)
g = Counter(q["group"] for q in QS if q["type"] != "reading")
print(f"wrote {out} questions={sum(c.values())} types={dict(c)} by_group={dict(g)}")
