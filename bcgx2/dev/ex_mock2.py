"""Mock 2 story: a lender and loan defaults. Three linked tasks (collect, process, model)."""
import csv
import io
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal

import numpy as np
import pandas as pd

from common import code, csv_text, file_list, html, schema

GRADES = ["A", "B", "C", "D"]
CITIES = ["Aarhus", "Bergen", "Ghent", "Graz", "Tampere", "Malmo"]
AUC_BAR = 0.80
COLLECT_COLS = ["loan_id", "amount", "term_months", "interest_rate", "age", "income", "employment_years", "grade",
                "branch_city", "n_due", "n_late", "late_ratio", "total_paid"]
TABLE_COLS = COLLECT_COLS + ["defaulted"]
CUTOFF = pd.Timestamp("2024-12-31")


def _people(rng, n):
    g = rng.choice(4, n, p=[.30, .35, .25, .10])
    age = rng.integers(21, 71, n)
    income = np.round(np.exp(rng.normal(10.95 - 0.17 * g, 0.42, n)), -2).astype(int)
    rich = rng.choice(n, max(3, n // 80), replace=False)
    income[rich] = income[rich] * rng.integers(5, 9, len(rich))
    emp = np.clip(np.round((age - 21) * rng.uniform(0.1, 0.9, n)), 0, None).astype(int)
    return g, age, income, emp


def _table(seed, n, start_id):
    """A loan-level table in the collected format, with a default label."""
    rng = np.random.default_rng(seed)
    g, age, income, emp = _people(rng, n)
    amount = (np.round(rng.uniform(2000, 40000, n), -2)).astype(int)
    term = rng.choice([6, 12, 18, 24], n, p=[.15, .35, .25, .25])
    rate = np.round(4.0 + 2.2 * g + rng.normal(0, 0.8, n), 2)
    n_due = np.minimum(term, rng.integers(0, 25, n))
    p_late = 1 / (1 + np.exp(-(-2.6 + 0.55 * g + rng.normal(0, 1.0, n))))
    n_late = rng.binomial(n_due, p_late)
    ratio = np.round(np.divide(n_late, n_due, out=np.zeros(n), where=n_due > 0), 3)
    inst = amount * (1 + rate / 100 * term / 12) / term
    total_paid = np.round(inst * (n_due - rng.binomial(n_late, 0.3)), 2)
    z = (-3.6 + 4.6 * ratio + 0.45 * g + 0.05 * (rate - 8) - 0.000012 * (np.minimum(income, 200000) - 60000)
         + 0.000022 * (amount - 15000) - 0.035 * emp + 0.7 * (n_late >= 3))
    y = (rng.random(n) < 1 / (1 + np.exp(-z))).astype(int)
    return pd.DataFrame({"loan_id": np.arange(start_id, start_id + n), "amount": amount, "term_months": term,
                         "interest_rate": rate, "age": age, "income": income, "employment_years": emp,
                         "grade": np.array(GRADES)[g], "branch_city": rng.choice(CITIES, n), "n_due": n_due,
                         "n_late": n_late, "late_ratio": ratio, "total_paid": total_paid, "defaulted": y})


def make_collect():
    rng = np.random.default_rng(81001)
    n_app, n_loans = 380, 450
    g, age, income, emp = _people(rng, n_app)
    applicants = pd.DataFrame({"applicant_id": np.arange(3001, 3001 + n_app), "age": age, "income": income,
                               "employment_years": emp, "grade": np.array(GRADES)[g]})
    branches = pd.DataFrame({"branch_id": np.arange(11, 17), "branch_name": [f"{c} Central" for c in CITIES], "city": CITIES})
    branches_text = branches.to_csv(index=False, sep=";")

    app_idx = rng.integers(0, n_app, n_loans)
    term = rng.choice([6, 12, 18, 24], n_loans, p=[.15, .35, .25, .25])
    start = pd.Timestamp("2022-09-01") + pd.to_timedelta(rng.integers(0, 850, n_loans), unit="D")     # up to late Dec 2024
    amount = (np.round(rng.uniform(2000, 40000, n_loans), -2)).astype(int)
    rate = np.round(4.0 + 2.2 * g[app_idx] + rng.normal(0, 0.8, n_loans), 2)
    loans = pd.DataFrame({"loan_id": np.arange(5001, 5001 + n_loans), "applicant_id": applicants.applicant_id.to_numpy()[app_idx],
                          "branch_id": rng.integers(11, 17, n_loans), "amount": amount, "term_months": term,
                          "interest_rate": rate, "start_date": start.strftime("%Y-%m-%d")})
    not_disbursed = set(rng.choice(loans.loan_id.to_numpy()[20:], 8, replace=False).tolist())      # no instalments at all

    rows, pid = [], 900001
    for lid, st, tm, amt, rt, gi in zip(loans.loan_id, start, term, amount, rate, g[app_idx]):
        if lid in not_disbursed:
            continue
        inst = round(float(amt) * (1 + rt / 100 * tm / 12) / tm, 2)
        p_late = 1 / (1 + np.exp(-(-2.6 + 0.55 * gi + rng.normal(0, 1.0))))
        for k in range(1, tm + 1):
            due = st + pd.DateOffset(months=k)
            paid, amt_paid = None, 0.0
            if due <= CUTOFF:
                if rng.random() >= p_late:
                    paid = due - pd.Timedelta(days=int(rng.integers(0, 6)))                     # on time or early
                elif rng.random() >= 0.3:
                    late_day = due + pd.Timedelta(days=int(rng.integers(1, 45)))
                    paid = late_day if late_day <= CUTOFF else None                              # paid late, or still open
            elif rng.random() < 0.03 and due - pd.Timedelta(days=40) <= CUTOFF:
                paid = CUTOFF - pd.Timedelta(days=int(rng.integers(0, 20)))                      # prepaid a future instalment
            if paid is not None:
                amt_paid = inst
            rows.append([pid, int(lid), due.strftime("%Y-%m-%d"), paid.strftime("%Y-%m-%d") if paid is not None else "", inst, amt_paid])
            pid += 1
    pay = pd.DataFrame(rows, columns=["payment_id", "loan_id", "due_date", "paid_date", "amount_due", "amount_paid"])
    # fixed edge cases on the first loans: due on the cutoff (paid, unpaid), due the day after, prepaid
    pay = pay[~pay.loan_id.isin([5001, 5002, 5003, 5004])]
    edge = [
        [990001, 5001, "2024-11-30", "2024-11-30", 410.00, 410.00], [990002, 5001, "2024-12-31", "2024-12-31", 410.00, 410.00],
        [990003, 5001, "2025-01-31", "", 410.00, 0.0],
        [990004, 5002, "2024-11-30", "2024-12-02", 255.50, 255.50], [990005, 5002, "2024-12-31", "", 255.50, 0.0],
        [990006, 5003, "2025-01-01", "", 300.00, 0.0], [990007, 5003, "2025-02-01", "", 300.00, 0.0],
        [990008, 5004, "2024-12-15", "2024-12-10", 520.25, 520.25], [990009, 5004, "2025-01-15", "2024-12-20", 520.25, 520.25],
        [990010, 5004, "2025-02-15", "", 520.25, 0.0],
    ]
    pay = pd.concat([pay, pd.DataFrame(edge, columns=pay.columns)], ignore_index=True).sample(frac=1, random_state=9).reset_index(drop=True)
    return {"loans.csv": csv_text(loans), "applicants.csv": csv_text(applicants), "branches.csv": branches_text,
            "payments.csv": csv_text(pay)}


def oracle_collect(inputs):
    rd = lambda name, **kw: list(csv.DictReader(io.StringIO(inputs[name]), **kw))
    apps = {r["applicant_id"]: r for r in rd("applicants.csv")}
    city = {r["branch_id"]: r["city"] for r in rd("branches.csv", delimiter=";")}
    cutoff = date(2024, 12, 31)
    n_due, n_late, paid = defaultdict(int), defaultdict(int), defaultdict(Decimal)
    for r in rd("payments.csv"):
        due = datetime.strptime(r["due_date"], "%Y-%m-%d").date()
        pd_ = datetime.strptime(r["paid_date"], "%Y-%m-%d").date() if r["paid_date"] else None
        paid[r["loan_id"]] += Decimal(r["amount_paid"])
        if due <= cutoff:
            n_due[r["loan_id"]] += 1
            if pd_ is None or pd_ > due:
                n_late[r["loan_id"]] += 1
    rows = []
    for r in sorted(rd("loans.csv"), key=lambda r: int(r["loan_id"])):
        a, lid = apps[r["applicant_id"]], r["loan_id"]
        d, l = n_due.get(lid, 0), n_late.get(lid, 0)
        rows.append({"loan_id": int(lid), "amount": int(r["amount"]), "term_months": int(r["term_months"]),
                     "interest_rate": float(r["interest_rate"]), "age": int(a["age"]), "income": int(a["income"]),
                     "employment_years": int(a["employment_years"]), "grade": a["grade"], "branch_city": city[r["branch_id"]],
                     "n_due": d, "n_late": l, "late_ratio": round(l / d, 3) if d else 0.0, "total_paid": float(paid.get(lid, Decimal(0)))})
    return {"collected.csv": pd.DataFrame(rows, columns=COLLECT_COLS)}


COLLECT_DESC = html(f"""
<p>A lender wants to predict which loans default. You have a snapshot of its records taken on 31 December 2024. Build one table with a row for each loan.</p>
<h3>Files</h3>
<ul class="files">
  <li><code>loans.csv</code>: <code>loan_id</code>, <code>applicant_id</code>, <code>branch_id</code>, <code>amount</code>, <code>term_months</code>, <code>interest_rate</code>, <code>start_date</code>.</li>
  <li><code>applicants.csv</code>: <code>applicant_id</code>, <code>age</code>, <code>income</code>, <code>employment_years</code>, <code>grade</code>.</li>
  <li><code>branches.csv</code>: <code>branch_id</code>, <code>branch_name</code>, <code>city</code>. This file uses semicolons as separators.</li>
  <li><code>payments.csv</code>: the instalment schedule, with <code>payment_id</code>, <code>loan_id</code>, <code>due_date</code>, <code>paid_date</code>, <code>amount_due</code>, <code>amount_paid</code>. <code>paid_date</code> is empty while an instalment is unpaid. The schedule includes instalments that fall due after the snapshot.</li>
</ul>
<h3>Your task</h3>
<p>Save <code>collected.csv</code> in the task folder. It has one row per loan in <code>loans.csv</code>, sorted by <code>loan_id</code>, with these columns in this order:</p>
{schema([
    ("loan_id", "int", "Loan identifier"),
    ("amount", "int", "Loan amount"),
    ("term_months", "int", "Loan term"),
    ("interest_rate", "float", "Interest rate"),
    ("age", "int", "Applicant's age"),
    ("income", "int", "Applicant's income"),
    ("employment_years", "int", "Applicant's years in employment"),
    ("grade", "str", "Applicant's credit grade"),
    ("branch_city", "str", "City of the loan's branch"),
    ("n_due", "int", "Instalments with a <code>due_date</code> on or before 31 December 2024"),
    ("n_late", "int", "Of those, the instalments that were paid after their due date or are still unpaid"),
    ("late_ratio", "float", "<code>n_late</code> divided by <code>n_due</code>, rounded to 3 decimals. 0 when no instalment is due yet"),
    ("total_paid", "float", "Sum of <code>amount_paid</code> over all of the loan's instalments, rounded to 2 decimals. 0 if there are none")])}
<p>You can use pandas, NumPy, and scikit-learn.</p>
""")

COLLECT_SOLUTION = code("""
    import pandas as pd

    loans = pd.read_csv('loans.csv')
    applicants = pd.read_csv('applicants.csv')
    branches = pd.read_csv('branches.csv', sep=';')
    pay = pd.read_csv('payments.csv', parse_dates=['due_date', 'paid_date'])

    # Instalments that are due by the snapshot. Unpaid ones have no paid_date and count as late
    due = pay[pay['due_date'] <= '2024-12-31'].copy()
    due['late'] = due['paid_date'].isna() | (due['paid_date'] > due['due_date'])
    counts = due.groupby('loan_id').agg(n_due=('payment_id', 'count'), n_late=('late', 'sum')).reset_index()
    paid = pay.groupby('loan_id')['amount_paid'].sum().round(2).rename('total_paid').reset_index()
    city = branches[['branch_id', 'city']].rename(columns={'city': 'branch_city'})

    out = (loans
           .merge(applicants, on='applicant_id', how='left')
           .merge(city, on='branch_id', how='left')
           .merge(counts, on='loan_id', how='left')
           .merge(paid, on='loan_id', how='left'))
    assert len(out) == len(loans)

    for col in ['n_due', 'n_late']:
        out[col] = out[col].fillna(0).astype(int)
    out['total_paid'] = out['total_paid'].fillna(0)
    out['late_ratio'] = (out['n_late'] / out['n_due']).fillna(0).round(3)     # 0 / 0 gives NaN

    cols = ['loan_id', 'amount', 'term_months', 'interest_rate', 'age', 'income', 'employment_years', 'grade',
            'branch_city', 'n_due', 'n_late', 'late_ratio', 'total_paid']
    out.sort_values('loan_id')[cols].to_csv('collected.csv', index=False)
""")

COLLECT_GRADER = code("""
    import numpy as np
    import pandas as pd

    COLS = ['loan_id', 'amount', 'term_months', 'interest_rate', 'age', 'income', 'employment_years', 'grade',
            'branch_city', 'n_due', 'n_late', 'late_ratio', 'total_paid']
    DUE = 'n_due counts the instalments due on or before 31 December 2024'
    LATE = 'n_late counts the late and unpaid instalments among those due'
    RATIO = 'late_ratio is n_late divided by n_due, rounded to 3 decimals'


    def grade(c):
        c.plan('collected.csv is saved in the task folder',
               'collected.csv has no index column',
               'Columns match the spec, in order',
               'One row per loan',
               'Count and ID columns are whole numbers',
               ('The loan and applicant columns are joined correctly', True),
               ('branch_city comes from branches.csv', True),
               (DUE, True),
               (LATE, True),
               (RATIO, True),
               ('total_paid sums amount_paid, rounded to 2 decimals', True),
               'Rows are sorted by loan_id')
        raw = c.output('collected.csv')
        if raw is None:
            return
        if not c.columns('Columns match the spec, in order', raw, COLS):
            return
        exp = c.expected('collected.csv')
        got = c.rows('One row per loan', raw, exp, 'loan_id', what='loan',
                     fewer='An inner join drops loans that have no instalments yet. Left-join onto loans.',
                     more='Aggregate the instalments to one row per loan before you join.')
        if got is None:
            return
        c.integers('Count and ID columns are whole numbers', got,
                   ['loan_id', 'amount', 'term_months', 'age', 'income', 'employment_years', 'n_due', 'n_late'])
        pairs = [('collected.csv', got, exp)]
        k = 'loan_id'
        c.values('The loan and applicant columns are joined correctly', pairs,
                 ['amount', 'term_months', 'interest_rate', 'age', 'income', 'employment_years', 'grade'], key=k,
                 hint='Join applicants.csv on applicant_id.')
        c.values('branch_city comes from branches.csv', pairs, ['branch_city'], key=k,
                 hint="Read branches.csv with sep=';', join on branch_id, and rename city.")
        c.values(DUE, pairs, ['n_due'], key=k,
                 hint='Keep the instalments with due_date <= 2024-12-31, then count them per loan. Loans with none get 0.')
        c.values(LATE, pairs, ['n_late'], key=k,
                 hint='Among the due instalments, late means paid_date is after due_date, or paid_date is empty.')
        c.values(RATIO, pairs, ['late_ratio'], key=k, decimals={'late_ratio': 3},
                 hint='Divide n_late by n_due. Where n_due is 0 the result is NaN, so fill it with 0.')
        c.values('total_paid sums amount_paid, rounded to 2 decimals', pairs, ['total_paid'], key=k, decimals={'total_paid': 2},
                 hint='Sum amount_paid over every instalment of the loan, including ones prepaid before their due date.')
        c.order('Rows are sorted by loan_id', raw, exp, 'loan_id', hint='Sort by loan_id before you save.')
""")


def _collect_variant(due_filter="pay['due_date'] <= '2024-12-31'", late="due['paid_date'].isna() | (due['paid_date'] > due['due_date'])",
                     how="left", ratio=".fillna(0).round(3)", paid_from="pay"):
    return code(f"""
import pandas as pd
loans = pd.read_csv('loans.csv'); applicants = pd.read_csv('applicants.csv'); branches = pd.read_csv('branches.csv', sep=';')
pay = pd.read_csv('payments.csv', parse_dates=['due_date', 'paid_date'])
due = pay[{due_filter}].copy()
due['late'] = {late}
counts = due.groupby('loan_id').agg(n_due=('payment_id', 'count'), n_late=('late', 'sum')).reset_index()
paid = {paid_from}.groupby('loan_id')['amount_paid'].sum().round(2).rename('total_paid').reset_index()
city = branches[['branch_id', 'city']].rename(columns={{'city': 'branch_city'}})
out = loans.merge(applicants, on='applicant_id', how='left').merge(city, on='branch_id', how='left').merge(counts, on='loan_id', how='{how}').merge(paid, on='loan_id', how='left')
for col in ['n_due', 'n_late']:
    out[col] = out[col].fillna(0).astype(int)
out['total_paid'] = out['total_paid'].fillna(0)
out['late_ratio'] = (out['n_late'] / out['n_due']){ratio}
cols = ['loan_id', 'amount', 'term_months', 'interest_rate', 'age', 'income', 'employment_years', 'grade', 'branch_city', 'n_due', 'n_late', 'late_ratio', 'total_paid']
out.sort_values('loan_id')[cols].to_csv('collected.csv', index=False)
""")


C_DUE = "n_due counts the instalments due on or before 31 December 2024"
C_LATE = "n_late counts the late and unpaid instalments among those due"
C_RATIO = "late_ratio is n_late divided by n_due, rounded to 3 decimals"
C_PAID = "total_paid sums amount_paid, rounded to 2 decimals"
COLLECT_VARIANTS = [
    dict(name="forgot_unpaid",
         hint="An unpaid instalment that is past its due date is late. Its paid_date is empty, and comparing an empty date gives False, so add paid_date.isna().",
         code=_collect_variant(late="due['paid_date'] > due['due_date']"), fails=[C_LATE, C_RATIO]),
    dict(name="future_as_due",
         hint="Instalments due after 31 December 2024 are not due yet. Filter on due_date before you count.",
         code=_collect_variant(due_filter="pay['due_date'].notna()"), fails=[C_DUE, C_LATE, C_RATIO]),
    dict(name="ratio_nan", hint="0 divided by 0 gives NaN. Fill late_ratio with 0 for loans with nothing due.",
         code=_collect_variant(ratio=".round(3)"), fails=[C_RATIO]),
    dict(name="paid_from_due", hint="total_paid covers every instalment of the loan. A prepaid instalment that is due later still counts.",
         code=_collect_variant(paid_from="due"), fails=[C_PAID]),
    dict(name="inner_join", hint="", code=_collect_variant(how="inner"), fails=["One row per loan"]),
]

# ---------------------------------------------------------------- process
PROCESS_COLS = TABLE_COLS + ["income_log"]


def make_process():
    rng = np.random.default_rng(81002)
    t = _table(81012, 1300, 60001)
    t["income"] = t["income"].astype(float)
    idx = rng.permutation(len(t))
    cut = int(0.7 * len(t))
    train, test = t.iloc[idx[:cut]].copy(), t.iloc[idx[cut:]].copy()
    for part, k in ((train, 78), (test, 34)):
        part.iloc[rng.choice(len(part), k, replace=False), part.columns.get_loc("income")] = np.nan
    return {"data/train.csv": csv_text(train), "data/test.csv": csv_text(test)}


PROCESS_DESC = html(f"""
<p>This dataset has the format of the table you built in the collection task, plus the label <code>defaulted</code>. The values are different, so you can't reuse your earlier answer. It is split into a train set (70%) and a test set (30%).</p>
<h3>Files</h3>
{file_list(("data/train.csv", TABLE_COLS), ("data/test.csv", ["the same columns"]))}
<h3>Your task</h3>
<p>Apply these steps in this order:</p>
<ol>
  <li>Fill the missing values in <code>income</code> with the median income of the same <code>grade</code> in the train set.</li>
  <li>Cap <code>income</code> at the IQR fences of the train set, computed after step 1. The fences are Q1 minus 1.5 times the IQR and Q3 plus 1.5 times the IQR (pandas default quantiles).</li>
  <li>Add <code>income_log</code>: the natural log of 1 plus the capped <code>income</code>.</li>
  <li>Encode <code>grade</code> as an integer: <code>A</code> 0, <code>B</code> 1, <code>C</code> 2, <code>D</code> 3.</li>
  <li>Standard-scale <code>amount</code> and <code>interest_rate</code> with the train mean and the train population standard deviation.</li>
</ol>
<p>Keep the original columns in order and append <code>income_log</code>.</p>
<p>Don't let information from the test set leak into the train set. Keep every row and the row order. Save the results in the task folder as <code>processed_train.csv</code> and <code>processed_test.csv</code>.</p>
""")

PROCESS_SOLUTION = code("""
    import numpy as np
    import pandas as pd
    from sklearn.preprocessing import StandardScaler

    train = pd.read_csv('data/train.csv')
    test = pd.read_csv('data/test.csv')

    # 1 Group-wise median, learned on train
    med = train.groupby('grade')['income'].median()
    for df in (train, test):
        df['income'] = df['income'].fillna(df['grade'].map(med))

    # 2 IQR fences on the filled train income
    q1, q3 = train['income'].quantile([0.25, 0.75])
    iqr = q3 - q1
    lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr

    # 5 Scaler fitted on train
    num = ['amount', 'interest_rate']
    sc = StandardScaler().fit(train[num])

    for df in (train, test):
        df['income'] = df['income'].clip(lo, hi)
        df['income_log'] = np.log1p(df['income'])                              # 3
        df['grade'] = df['grade'].map({'A': 0, 'B': 1, 'C': 2, 'D': 3})        # 4
        df[num] = sc.transform(df[num])

    train.to_csv('processed_train.csv', index=False)
    test.to_csv('processed_test.csv', index=False)
""")

PROCESS_GRADER = code("""
    import numpy as np
    import pandas as pd

    FILES = ['processed_train.csv', 'processed_test.csv']
    INCOME = 'income is filled by grade, then capped at the train IQR fences'
    SCALE = 'amount and interest_rate are standard-scaled with train statistics'


    def grade(c):
        c.plan('processed_train.csv is saved in the task folder',
               'processed_train.csv has no index column',
               'processed_test.csv is saved in the task folder',
               'processed_test.csv has no index column',
               'Columns match the spec, in order',
               'Rows and row order are unchanged',
               'grade is a whole number',
               (INCOME, True),
               ('income_log is the log of 1 plus the capped income', True),
               ('grade is encoded A 0 to D 3', True),
               (SCALE, True),
               ('The other columns are untouched', True))
        pairs = c.frames(FILES, 'Columns match the spec, in order', 'Rows and row order are unchanged', 'loan_id')
        if pairs is None:
            return
        both = pd.concat([got for _, got, _ in pairs])
        c.integers('grade is a whole number', both, ['grade'], hint='Map the grades to integers. A grade that is not in your mapping becomes NaN.')
        k = 'loan_id'
        c.values(INCOME, pairs, ['income'], key=k,
                 hint='Fill with train.groupby(grade)[income].median(), mapped through each row\\'s grade. Then compute the fences on the filled train income and clip both sets.')
        c.values('income_log is the log of 1 plus the capped income', pairs, ['income_log'], key=k,
                 hint='Take np.log1p after the fill and the cap.')
        c.values('grade is encoded A 0 to D 3', pairs, ['grade'], key=k)
        c.values(SCALE, pairs, ['amount', 'interest_rate'], key=k, hint='Fit the scaler on train, then transform train and test with it.')
        c.values('The other columns are untouched', pairs,
                 ['loan_id', 'term_months', 'age', 'employment_years', 'branch_city', 'n_due', 'n_late', 'late_ratio', 'total_paid', 'defaulted'],
                 key=k, hint='Transform only the columns the task names.')
""")


def _process_variant(fill="grade", fence="after", stats="train", log="capped", ddof=0):
    return code(f"""
import numpy as np
import pandas as pd
train = pd.read_csv('data/train.csv'); test = pd.read_csv('data/test.csv')
raw_train = train.copy()
def fences(s):
    q1, q3 = s.quantile([0.25, 0.75]); return q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)
out = {{}}
for name, df in (('train', train), ('test', test)):
    ref = raw_train if '{stats}' == 'train' else df
    d = df.copy()
    if '{fill}' == 'grade':
        d['income'] = d['income'].fillna(d['grade'].map(ref.groupby('grade')['income'].median()))
    else:
        d['income'] = d['income'].fillna(ref['income'].median())
    out[name] = d
filled_train = out['train']['income'].copy()
for name, d in out.items():
    if '{fence}' == 'after':
        lo, hi = fences(filled_train if '{stats}' == 'train' else d['income'])
    else:
        lo, hi = fences(raw_train['income'])
    before = d['income'].copy()
    d['income'] = d['income'].clip(lo, hi)
    d['income_log'] = np.log1p(d['income'] if '{log}' == 'capped' else before)
    d['grade'] = d['grade'].map({{'A': 0, 'B': 1, 'C': 2, 'D': 3}})
    ref = raw_train if '{stats}' == 'train' else (train if name == 'train' else test)
    for col in ['amount', 'interest_rate']:
        d[col] = (d[col] - ref[col].mean()) / ref[col].std(ddof={ddof})
    d.to_csv(f'processed_{{name}}.csv', index=False)
""")


P_INCOME = "income is filled by grade, then capped at the train IQR fences"
P_LOG = "income_log is the log of 1 plus the capped income"
P_SCALE = "amount and interest_rate are standard-scaled with train statistics"
PROCESS_VARIANTS = [
    dict(name="overall_median", hint="You filled with one overall median. The task asks for the median of the same grade.",
         code=_process_variant(fill="overall"), fails=[P_INCOME, P_LOG]),
    dict(name="test_stats", hint="The test set uses its own statistics. Learn the medians, fences, mean, and standard deviation on train.",
         code=_process_variant(stats="each"), fails=[P_INCOME, P_LOG, P_SCALE]),
    dict(name="log_before_cap", hint="Take the log after the cap, so the extreme incomes are already pulled in.",
         code=_process_variant(log="raw"), fails=[P_LOG]),
    dict(name="sample_std", hint="You divided by the sample standard deviation. pandas .std() uses ddof=1; pass ddof=0 or use StandardScaler.",
         code=_process_variant(ddof=1), fails=[P_SCALE]),
]


def oracle_process(inputs):
    tr = pd.read_csv(io.StringIO(inputs["data/train.csv"]))
    te = pd.read_csv(io.StringIO(inputs["data/test.csv"]))
    med = {g: float(np.nanmedian(tr.loc[tr["grade"] == g, "income"].to_numpy())) for g in GRADES}
    fill = lambda d: np.array([med[g] if np.isnan(v) else v for v, g in zip(d["income"].to_numpy(dtype=float), d["grade"])])
    ftr = fill(tr)
    q1, q3 = np.percentile(ftr, [25, 75])
    lo, hi = q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)
    stats = {}
    for c in ("amount", "interest_rate"):
        x = tr[c].to_numpy(dtype=float)
        stats[c] = (x.mean(), float(np.sqrt(((x - x.mean()) ** 2).mean())))
    out = {}
    for name, df in (("processed_train.csv", tr), ("processed_test.csv", te)):
        d = df.copy()
        d["income"] = np.minimum(np.maximum(fill(df), lo), hi)
        d["income_log"] = np.log(1.0 + d["income"].to_numpy())
        d["grade"] = [GRADES.index(g) for g in d["grade"]]
        for c, (mu, sd) in stats.items():
            d[c] = (d[c].to_numpy(dtype=float) - mu) / sd
        out[name] = d[PROCESS_COLS]
    return out


# ---------------------------------------------------------------- model
def make_model():
    t = _table(81003, 5200, 80001)
    rng = np.random.default_rng(81013)
    idx = rng.permutation(len(t))
    a, b = 3200, 4000
    tr, va, te = t.iloc[idx[:a]].copy(), t.iloc[idx[a:b]].copy(), t.iloc[idx[b:]].copy()
    q1, q3 = tr["income"].quantile([0.25, 0.75])
    lo, hi = q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)
    stats = {c: (tr[c].mean(), tr[c].std(ddof=0)) for c in ("amount", "interest_rate")}
    out = []
    for part in (tr, va, te):
        d = part.copy()
        d["income"] = d["income"].clip(lo, hi)
        d["income_log"] = np.log1p(d["income"])
        d["grade"] = d["grade"].map({g: i for i, g in enumerate(GRADES)})
        for c, (mu, sd) in stats.items():
            d[c] = (d[c] - mu) / sd
        out.append(d[PROCESS_COLS])
    tr, va, te = out
    inputs = {"train.csv": csv_text(tr), "val.csv": csv_text(va), "test.csv": csv_text(te.drop(columns="defaulted"))}
    hidden = {"truth.csv": csv_text(te[["loan_id", "defaulted"]])}
    return inputs, hidden


MODEL_DESC = html(f"""
<p>This dataset has the format of the files you saved in the processing task. The values are different. <code>branch_city</code> is still text.</p>
<p>It is split three ways: train, validation, and test. The test set has no <code>defaulted</code> column. About one loan in six defaults.</p>
<h3>Files</h3>
{file_list(("train.csv", PROCESS_COLS), ("val.csv", ["the same columns"]), ("test.csv", ["the same columns without <code>defaulted</code>"]))}
<h3>Your task</h3>
<p>Estimate the probability of default for every loan in <code>test.csv</code>. This is a free-form task: use any model.</p>
<p>The metric is ROC AUC. The bar is an AUC of at least {AUC_BAR:.2f} on the test set.</p>
<p>Save <code>predictions.csv</code> in the task folder with one column named <code>default_probability</code> that holds a number from 0 to 1, one row per test row, in the same order.</p>
""")

MODEL_SOLUTION = code("""
    import pandas as pd
    from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    train = pd.read_csv('train.csv')
    val = pd.read_csv('val.csv')
    test = pd.read_csv('test.csv')
    target = 'defaulted'

    # 1 Features: one-hot the text column, align every set to train's columns
    def features(df, cols=None):
        X = pd.get_dummies(df.drop(columns=['loan_id', target], errors='ignore'), columns=['branch_city'], dtype=int)
        return X if cols is None else X.reindex(columns=cols, fill_value=0)

    X = features(train)
    X_val, X_test = features(val, X.columns), features(test, X.columns)

    # 2 Compare model families by validation AUC, on probabilities
    models = {
        'logreg': make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)),
        'rf': RandomForestClassifier(n_estimators=200, min_samples_leaf=5, random_state=42, n_jobs=-1),
        'hgb': HistGradientBoostingClassifier(random_state=42)}
    scores = {}
    for name, m in models.items():
        m.fit(X, train[target])
        scores[name] = roc_auc_score(val[target], m.predict_proba(X_val)[:, 1])
        print(name, round(scores[name], 3))

    # 3 Refit the winner on train + val, save probabilities for test
    best = models[max(scores, key=scores.get)]
    best.fit(pd.concat([X, X_val]), pd.concat([train[target], val[target]]))
    out = pd.DataFrame({'default_probability': best.predict_proba(X_test)[:, 1]})
    out.to_csv('predictions.csv', index=False)
""")

MODEL_GRADER = code(f"""
    import numpy as np
    import pandas as pd

    BAR = {AUC_BAR}
    METRIC = f'ROC AUC on the hidden test labels is at least {{BAR:.2f}}'


    def auc(y, score):
        rank = pd.Series(score).rank(method='average').to_numpy()
        pos = y == 1
        n1, n0 = int(pos.sum()), int((~pos).sum())
        return float((rank[pos].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


    def grade(c):
        c.plan('predictions.csv is saved in the task folder',
               'predictions.csv has no index column',
               'One column, named default_probability',
               'One prediction per test row',
               'Every prediction is a number from 0 to 1',
               (METRIC, True))
        got = c.output('predictions.csv')
        if got is None:
            return
        if not c.check('One column, named default_probability', list(got.columns) == ['default_probability'],
                       'Found these columns: ' + ', '.join(map(str, got.columns)) + '.',
                       'Save a DataFrame that holds only the default_probability column.'):
            return
        truth = c.secret('truth.csv')
        if not c.check('One prediction per test row', len(got) == len(truth),
                       f'test.csv has {{len(truth):,}} rows and predictions.csv has {{len(got):,}}.',
                       'Predict on test.csv and keep its row order.'):
            return
        p = pd.to_numeric(got['default_probability'], errors='coerce')
        if not c.check('Every prediction is a number from 0 to 1', bool(p.notna().all() and p.between(0, 1).all()),
                       'Some values are missing or fall outside 0 to 1.', 'Save predict_proba(X)[:, 1].'):
            return
        score = auc(truth['defaulted'].to_numpy(), p.to_numpy())
        labels = p.nunique() <= 2
        c.note(f'ROC AUC {{score:.3f}} (bar {{BAR:.2f}}).')
        c.check(METRIC, score >= BAR, f'Your AUC is {{score:.3f}}.',
                'These look like 0 and 1 labels. AUC scores a ranking, so save predict_proba(X)[:, 1], not predict(X).' if labels
                else 'Compare a scaled logistic regression with tree ensembles on val.csv, and use every informative column.')
""")

M_METRIC = f"ROC AUC on the hidden test labels is at least {AUC_BAR:.2f}"
_MODEL_HEAD = """
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
train = pd.read_csv('train.csv'); test = pd.read_csv('test.csv')
f = [c for c in test.columns if c not in ('loan_id', 'branch_city')]
m = HistGradientBoostingClassifier(random_state=42).fit(train[f], train['defaulted'])
"""
MODEL_VARIANTS = [
    dict(name="labels", hint="", fails=[M_METRIC],
         code=code(_MODEL_HEAD + "pd.DataFrame({'default_probability': m.predict(test[f])}).to_csv('predictions.csv', index=False)\n")),
    dict(name="constant", hint="", fails=[M_METRIC],
         code=code("import pandas as pd\ntest = pd.read_csv('test.csv')\npd.DataFrame({'default_probability': [0.15] * len(test)}).to_csv('predictions.csv', index=False)\n")),
    dict(name="percent", hint="", fails=["Every prediction is a number from 0 to 1"],
         code=code(_MODEL_HEAD + "pd.DataFrame({'default_probability': m.predict_proba(test[f])[:, 1] * 100}).to_csv('predictions.csv', index=False)\n")),
    dict(name="wrong_name", hint="", fails=["One column, named default_probability"],
         code=code(_MODEL_HEAD + "pd.DataFrame({'defaulted': m.predict_proba(test[f])[:, 1]}).to_csv('predictions.csv', index=False)\n")),
]


def exercises():
    model_inputs, model_hidden = make_model()
    return [
        dict(id="m2-collect", module=3, title="Collect the loan data", story="Loans", minutes=22,
             inputs=make_collect(), outputs=["collected.csv"], hidden={}, expect=["collected.csv"], align="loan_id",
             desc=COLLECT_DESC, starter="import pandas as pd\n\n", solution=COLLECT_SOLUTION, grader=COLLECT_GRADER,
             hints=["Open branches.csv in the Files panel: it uses semicolons. Build the instalment counts and the paid total as one-row-per-loan tables, then left-join onto loans.",
                    "Filter to due_date <= '2024-12-31' before you count. An unpaid instalment has an empty paid_date, so test it with isna().",
                    "After the joins, fill the counts with 0 and cast to int. n_late / n_due is NaN where nothing is due, so fill late_ratio with 0."],
             variants=COLLECT_VARIANTS, oracle=oracle_collect, oracle_decimals={"late_ratio": 3}),
        dict(id="m2-process", module=4, title="Process without leakage", story="Loans", minutes=15,
             inputs=make_process(), outputs=["processed_train.csv", "processed_test.csv"], hidden={},
             expect=["processed_train.csv", "processed_test.csv"], align=None,
             desc=PROCESS_DESC, starter="import numpy as np\nimport pandas as pd\n\n", solution=PROCESS_SOLUTION, grader=PROCESS_GRADER,
             hints=["The order of the steps matters: fill, then cap, then log. Everything is learned on train.",
                    "train.groupby('grade')['income'].median() gives one median per grade. Fill with df['grade'].map(med).",
                    "Compute the IQR fences on the train income after the fill, then clip() both sets. StandardScaler uses the population standard deviation."],
             variants=PROCESS_VARIANTS, oracle=oracle_process),
        dict(id="m2-model", module=5, title="Score default risk", story="Loans", minutes=23,
             inputs=model_inputs, outputs=["predictions.csv"], hidden=model_hidden, expect=[], align=None,
             desc=MODEL_DESC, starter="import pandas as pd\n\n", solution=MODEL_SOLUTION, grader=MODEL_GRADER,
             hints=["branch_city is text. One-hot encode it or leave it out, then save a first predictions.csv from a quick model.",
                    "AUC scores a ranking. Save predict_proba(X)[:, 1], not the 0 and 1 labels from predict().",
                    "Compare a scaled logistic regression, a random forest, and gradient boosting with roc_auc_score on val.csv. Refit the best on train plus val."],
             variants=MODEL_VARIANTS, oracle=None),
    ]
