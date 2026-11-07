/** Scorecard arithmetic. Automatic fills are the only fills in the wrong-fill denominator. */

export function binomialUpper(k, n, alpha = 0.05) {
  if (!Number.isInteger(n) || n <= 0 || k < 0 || k > n) return null;
  if (k === 0) return 1 - Math.pow(alpha, 1 / n);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (cdfAtMost(k, n, mid) > alpha) lo = mid;
    else hi = mid;
  }
  return hi;
}

function cdfAtMost(k, n, p) {
  if (p <= 0) return 1;
  if (p >= 1) return k >= n ? 1 : 0;
  let term = Math.pow(1 - p, n);
  let sum = term;
  for (let i = 0; i < k; i++) {
    term *= ((n - i) / (i + 1)) * (p / (1 - p));
    sum += term;
    if (sum > 1) return 1;
  }
  return sum;
}

export function norm(kind, value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (kind === 'dob') {
    const m = text.match(/^(\d{1,2})[\/.\- ](\d{1,2})[\/.\- ](\d{4})$/);
    if (!m) return text.toLowerCase();
    return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`;
  }
  if (kind === 'phone') return text.replace(/\D/g, '').slice(-8);
  if (kind === 'email') return text.toLowerCase();
  if (kind === 'nric') return text.replace(/\s/g, '').toUpperCase();
  return text.toLowerCase();
}

function emptyBucket() {
  return {
    fields: 0,
    answerable: 0,
    automatic: 0,
    correct: 0,
    wrong: 0,
    wrongPerson: 0,
    unsupported: 0,
    wrongDestination: 0,
    abstain: 0,
    review: 0,
    reviewCorrect: 0,
    parseFailFields: 0,
    hardViolations: 0,
    forms: 0,
    formsAnswerable: 0,
    formsAllCorrect: 0,
    formsAnyWrong: 0
  };
}

function add(bucket, row) {
  bucket.fields += 1;
  const auto = row.decision === 'autofill' && String(row.value || '').trim() !== '';
  const answerable = !!row.answerable;
  const same = answerable && norm(row.kind, row.value) === norm(row.kind, row.gold);
  const wrongPerson = !!(auto && row.wrongPerson);
  const wrongDest = !!(auto && row.wrongDestination);
  const unsupported = !!(auto && !answerable);
  const correct = !!(auto && same && !wrongPerson && !wrongDest && !unsupported);
  const wrong = !!(auto && !correct);
  if (answerable) bucket.answerable += 1;
  if (auto) bucket.automatic += 1;
  if (correct) bucket.correct += 1;
  if (wrong) bucket.wrong += 1;
  if (wrongPerson) bucket.wrongPerson += 1;
  if (unsupported) bucket.unsupported += 1;
  if (wrongDest) bucket.wrongDestination += 1;
  if (row.decision === 'abstain') bucket.abstain += 1;
  if (row.decision === 'review') {
    bucket.review += 1;
    if (same && !row.wrongPerson && !row.wrongDestination) bucket.reviewCorrect += 1;
  }
  if (row.parseFail && answerable) bucket.parseFailFields += 1;
  if (auto && row.hardViolation) bucket.hardViolations += 1;
}

function finish(bucket) {
  const rate = (num, den) => (den ? num / den : null);
  bucket.correctCoverage = rate(bucket.correct, bucket.answerable);
  bucket.wrongFillRate = rate(bucket.wrong, bucket.automatic);
  bucket.wrongPersonRate = rate(bucket.wrongPerson, bucket.automatic);
  bucket.unsupportedRate = rate(bucket.unsupported, bucket.automatic);
  bucket.reviewShare = rate(bucket.review, bucket.fields);
  bucket.suggestionPrecision = rate(bucket.reviewCorrect, bucket.review);
  bucket.formAllCorrectRate = rate(bucket.formsAllCorrect, bucket.formsAnswerable);
  bucket.wrongFillUpper = binomialUpper(bucket.wrong, bucket.automatic);
  bucket.wrongPersonUpper = binomialUpper(bucket.wrongPerson, bucket.automatic);
  bucket.formAnyWrongUpper = binomialUpper(bucket.formsAnyWrong, bucket.formsAnswerable);
  return bucket;
}

function formRollup(rows) {
  const forms = new Map();
  rows.forEach((row) => {
    const key = row.caseId;
    if (!forms.has(key)) forms.set(key, []);
    forms.get(key).push(row);
  });
  return forms;
}

export function summarize(rows) {
  const all = emptyBucket();
  const forms = formRollup(rows);
  all.forms = forms.size;
  forms.forEach((list) => {
    const answerable = list.filter((row) => row.answerable);
    if (!answerable.length) return;
    all.formsAnswerable += 1;
    const autoWrong = list.some((row) => row.decision === 'autofill' && String(row.value || '').trim() && !(
      row.answerable && norm(row.kind, row.value) === norm(row.kind, row.gold) && !row.wrongPerson && !row.wrongDestination
    ));
    const allCorrect = answerable.every((row) => (
      row.decision === 'autofill' && norm(row.kind, row.value) === norm(row.kind, row.gold) && !row.wrongPerson && !row.wrongDestination
    ));
    if (allCorrect) all.formsAllCorrect += 1;
    if (autoWrong) all.formsAnyWrong += 1;
  });
  rows.forEach((row) => add(all, row));
  return finish(all);
}

export function breakout(rows, key) {
  const groups = new Map();
  rows.forEach((row) => {
    const name = row[key] || 'unknown';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  });
  const out = {};
  groups.forEach((list, name) => { out[name] = summarize(list); });
  return out;
}

export function sensitive(rows) {
  const idKinds = new Set(['name', 'nric', 'dob']);
  return {
    identity: summarize(rows.filter((row) => idKinds.has(row.kind))),
    other: summarize(rows.filter((row) => !idKinds.has(row.kind)))
  };
}
