const KEYWORDS = [
  "False", "None", "True", "and", "as", "assert", "break", "class", "continue", "def",
  "elif", "else", "except", "finally", "for", "from", "if", "import", "in", "is", "lambda",
  "not", "or", "pass", "return", "try", "while", "with", "yield",
];

const BUILTINS = [
  ["abs", "(x)"], ["all", "(iterable)"], ["any", "(iterable)"], ["dict", "(**kwargs)"],
  ["enumerate", "(iterable, start=0)"], ["float", "(x)"], ["int", "(x)"], ["len", "(obj)"],
  ["list", "(iterable)"], ["max", "(iterable)"], ["min", "(iterable)"], ["print", "(*args)"],
  ["range", "(stop)"], ["round", "(number, ndigits=None)"], ["set", "(iterable)"],
  ["sorted", "(iterable, key=None, reverse=False)"], ["str", "(obj)"], ["sum", "(iterable)"],
  ["zip", "(*iterables)"], ["isinstance", "(obj, class)"], ["type", "(obj)"], ["tuple", "(iterable)"],
  ["map", "(fn, iterable)"], ["filter", "(fn, iterable)"], ["open", "(file)"],
];

const PD_FUNCS = [
  ["read_csv", "(filepath_or_buffer)"],
  ["concat", "(objs, axis=0, ignore_index=False)"],
  ["merge", "(left, right, on, how='inner')"],
  ["DataFrame", "(data, columns=None)"],
  ["Series", "(data)"],
  ["to_datetime", "(arg)"],
  ["cut", "(x, bins, labels=None, right=True)"],
  ["qcut", "(x, q, labels=None)"],
  ["pivot_table", "(data, index, columns, values, aggfunc='mean', fill_value=None)"],
  ["crosstab", "(index, columns)"],
  ["get_dummies", "(data, drop_first=False)"],
  ["melt", "(frame, id_vars, value_vars, var_name, value_name)"],
  ["isna", "(obj)"],
  ["notna", "(obj)"],
];

const NP_FUNCS = [
  ["array", "(object)"], ["arange", "(stop)"], ["zeros", "(shape)"], ["ones", "(shape)"],
  ["linspace", "(start, stop, num=50)"], ["column_stack", "(tup)"], ["eye", "(N)"],
  ["where", "(condition, x, y)"], ["unique", "(ar)"], ["argsort", "(a)"], ["argmax", "(a)"],
  ["log", "(x)"], ["log1p", "(x)"], ["exp", "(x)"], ["sqrt", "(x)"], ["abs", "(x)"],
  ["clip", "(a, a_min, a_max)"], ["sum", "(a, axis=None)"], ["mean", "(a, axis=None)"],
  ["std", "(a, axis=None, ddof=0)"], ["dot", "(a, b)"], ["concatenate", "(arrays, axis=0)"],
  ["maximum", "(x1, x2)"], ["minimum", "(x1, x2)"], ["isnan", "(x)"], ["nan_to_num", "(x)"],
];

const METHODS = [
  ["head", "(n=5)"], ["tail", "(n=5)"], ["copy", "()"], ["loc", ""], ["iloc", ""],
  ["assign", "(**kwargs)"], ["drop", "(columns)"], ["dropna", "(subset=None)"],
  ["fillna", "(value)"], ["rename", "(columns)"], ["sort_values", "(by, ascending=True)"],
  ["groupby", "(by, as_index=True)"], ["merge", "(right, on, how='inner')"],
  ["join", "(other, how='left')"], ["pivot", "(index, columns, values)"],
  ["melt", "(id_vars, value_vars)"], ["agg", "(func)"], ["aggregate", "(func)"],
  ["transform", "(func)"], ["apply", "(func, axis=0)"], ["map", "(arg)"],
  ["astype", "(dtype)"], ["reset_index", "(drop=False)"], ["set_index", "(keys)"],
  ["rolling", "(window, min_periods=None)"], ["expanding", "()"], ["shift", "(periods=1)"],
  ["rank", "(method='average', ascending=True)"], ["nlargest", "(n, columns)"],
  ["nsmallest", "(n, columns)"], ["value_counts", "()"], ["isin", "(values)"],
  ["isna", "()"], ["notna", "()"], ["duplicated", "(subset=None)"],
  ["drop_duplicates", "(subset=None, keep='first')"], ["query", "(expr)"],
  ["pipe", "(func)"], ["sample", "(n)"], ["round", "(decimals)"],
  ["sum", "(axis=None)"], ["mean", "(axis=None)"], ["std", "(axis=None, ddof=1)"],
  ["median", "()"], ["count", "()"], ["min", "()"], ["max", "()"], ["nunique", "()"],
  ["clip", "(lower, upper)"], ["eq", "(other)"], ["gt", "(other)"], ["lt", "(other)"],
  ["str", ""], ["dt", ""], ["to_numpy", "()"], ["to_dict", "()"], ["to_csv", "(path)"],
  ["shape", ""], ["columns", ""], ["index", ""], ["dtypes", ""], ["T", ""],
  ["describe", "()"], ["info", "()"], ["corr", "()"],
];

const SK_SNIPPETS = [
  ["train_test_split", "from sklearn.model_selection import train_test_split"],
  ["cross_val_score", "from sklearn.model_selection import cross_val_score"],
  ["GridSearchCV", "from sklearn.model_selection import GridSearchCV"],
  ["LogisticRegression", "from sklearn.linear_model import LogisticRegression"],
  ["LinearRegression", "from sklearn.linear_model import LinearRegression"],
  ["RandomForestClassifier", "from sklearn.ensemble import RandomForestClassifier"],
  ["RandomForestRegressor", "from sklearn.ensemble import RandomForestRegressor"],
  ["GradientBoostingClassifier", "from sklearn.ensemble import GradientBoostingClassifier"],
  ["DecisionTreeClassifier", "from sklearn.tree import DecisionTreeClassifier"],
  ["StandardScaler", "from sklearn.preprocessing import StandardScaler"],
  ["OneHotEncoder", "from sklearn.preprocessing import OneHotEncoder"],
  ["OrdinalEncoder", "from sklearn.preprocessing import OrdinalEncoder"],
  ["SimpleImputer", "from sklearn.impute import SimpleImputer"],
  ["Pipeline", "from sklearn.pipeline import Pipeline"],
  ["ColumnTransformer", "from sklearn.compose import ColumnTransformer"],
  ["accuracy_score", "from sklearn.metrics import accuracy_score"],
  ["precision_score", "from sklearn.metrics import precision_score"],
  ["recall_score", "from sklearn.metrics import recall_score"],
  ["f1_score", "from sklearn.metrics import f1_score"],
  ["roc_auc_score", "from sklearn.metrics import roc_auc_score"],
  ["mean_absolute_error", "from sklearn.metrics import mean_absolute_error"],
  ["mean_squared_error", "from sklearn.metrics import mean_squared_error"],
  ["r2_score", "from sklearn.metrics import r2_score"],
  ["KNeighborsClassifier", "from sklearn.neighbors import KNeighborsClassifier"],
];

const SQL_WORDS = [
  "SELECT", "FROM", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "JOIN", "LEFT JOIN",
  "INNER JOIN", "ON", "AS", "AND", "OR", "NOT", "IN", "DISTINCT", "LIMIT",
  "COUNT", "SUM", "AVG", "MIN", "MAX", "ROUND", "RANK", "ROW_NUMBER", "DENSE_RANK",
  "LAG", "LEAD", "OVER", "PARTITION BY", "ASC", "DESC", "CASE", "WHEN", "THEN", "ELSE", "END",
  "WITH", "CAST", "COALESCE", "NULLIF",
];

function opt(label, detail, apply) {
  return { label, detail: detail || "", apply: apply || label, type: "function" };
}

function filterPrefix(items, prefix, mapFn) {
  const p = prefix.toLowerCase();
  return items
    .filter((item) => {
      const label = Array.isArray(item) ? item[0] : item;
      return label.toLowerCase().startsWith(p);
    })
    .slice(0, 40)
    .map(mapFn);
}

function variablesIn(doc) {
  const names = new Set();
  const re = /(?:^|\n)\s*(?:def|class)\s+([A-Za-z_]\w*)|(?:^|\n)\s*for\s+([A-Za-z_]\w*)|(?:^|\n)\s*([A-Za-z_]\w*)\s*(?::[^=]+)?=/g;
  let m;
  while ((m = re.exec(doc))) names.add(m[1] || m[2] || m[3]);
  const args = /def\s+\w+\s*\(([^)]*)\)/g;
  while ((m = args.exec(doc))) {
    m[1].split(",").forEach((part) => {
      const name = part.trim().split("=")[0].trim().replace(/^\*/, "");
      if (/^[A-Za-z_]\w*$/.test(name)) names.add(name);
    });
  }
  return [...names];
}

export function pythonCompletions(context) {
  const doc = context.state.doc.toString();
  const pdMatch = context.matchBefore(/pd\.[\w]*/);
  if (pdMatch) {
    const prefix = pdMatch.text.slice(3);
    const options = filterPrefix(PD_FUNCS, prefix, ([label, detail]) => opt(label, detail));
    if (!options.length && !context.explicit) return null;
    return { from: pdMatch.from + 3, options, validFor: /^[\w]*$/ };
  }
  const npMatch = context.matchBefore(/np\.[\w]*/);
  if (npMatch) {
    const prefix = npMatch.text.slice(3);
    const options = filterPrefix(NP_FUNCS, prefix, ([label, detail]) => opt(label, detail));
    if (!options.length && !context.explicit) return null;
    return { from: npMatch.from + 3, options, validFor: /^[\w]*$/ };
  }
  const dot = context.matchBefore(/\.[\w]*/);
  if (dot && dot.from > 0) {
    const prefix = dot.text.slice(1);
    const options = filterPrefix(METHODS, prefix, ([label, detail]) => opt(label, detail));
    if (!options.length && prefix && !context.explicit) return null;
    return { from: dot.from + 1, options, validFor: /^[\w]*$/ };
  }
  const word = context.matchBefore(/[\w]*/);
  if (!word) return null;
  if (word.from === word.to && !context.explicit) return null;
  const prefix = word.text;
  if (!prefix && !context.explicit) return null;
  const options = [];
  filterPrefix(SK_SNIPPETS, prefix, ([label, stmt]) => {
    options.push({ label, detail: "import", apply: stmt, type: "class" });
    return null;
  });
  [["pd", "pandas"], ["np", "numpy"], ["pandas", "import pandas as pd"], ["numpy", "import numpy as np"]].forEach(([label, detail]) => {
    if (label.toLowerCase().startsWith(prefix.toLowerCase())) {
      options.push({ label, detail, apply: label === "pandas" ? "import pandas as pd" : label === "numpy" ? "import numpy as np" : label, type: "variable" });
    }
  });
  filterPrefix(KEYWORDS, prefix, (label) => {
    options.push({ label, detail: "keyword", type: "keyword" });
    return null;
  });
  filterPrefix(BUILTINS, prefix, ([label, detail]) => {
    options.push(opt(label, detail));
    return null;
  });
  filterPrefix(variablesIn(doc), prefix, (label) => {
    options.push({ label, detail: "in this buffer", type: "variable" });
    return null;
  });
  const seen = new Set();
  const unique = [];
  for (const o of options) {
    if (seen.has(o.label + o.detail)) continue;
    seen.add(o.label + o.detail);
    unique.push(o);
  }
  if (!unique.length) return null;
  return { from: word.from, options: unique.slice(0, 50), validFor: /^[\w]*$/ };
}

export function sqlCompletions(context) {
  const word = context.matchBefore(/[\w]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  const prefix = word.text.toLowerCase();
  const options = SQL_WORDS.filter((w) => w.toLowerCase().replace(/\s/g, "").startsWith(prefix.replace(/\s/g, "")) || w.toLowerCase().startsWith(prefix))
    .slice(0, 30)
    .map((label) => ({ label, type: "keyword" }));
  if (!options.length) return null;
  return { from: word.from, options, validFor: /^[\w]*$/ };
}
