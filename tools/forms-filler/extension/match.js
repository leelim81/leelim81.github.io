/* Decide which saved facts may fill which fields. No page access. */
(function (root) {
  var KEYS = {
    email: 'email',
    tel: 'phone',
    name: 'name',
    'given-name': 'name',
    'street-address': 'address',
    'postal-code': 'postal',
    bday: 'dob'
  };
  function fieldKey(field) {
    var auto = String(field.autocomplete || '').toLowerCase().split(/\s+/).pop();
    if (KEYS[auto]) return KEYS[auto];
    var name = String(field.name || '').toLowerCase();
    if (KEYS[name]) return KEYS[name];
    return '';
  }
  function matches(field, fact) {
    if (field.secret || field.hidden || field.disabled || field.readOnly) return false;
    var label = String(field.label || '').toLowerCase();
    if (fact.key === 'custom') return label === String(fact.label || '').toLowerCase();
    var byAttr = fieldKey(field);
    if (byAttr && byAttr === fact.key) return true;
    if (!label) return false;
    if (fact.key === 'email') return /\be-?mail\b/.test(label);
    if (fact.key === 'phone') return /\b(phone|tel|mobile)\b/.test(label);
    if (fact.key === 'name') return /\bname\b/.test(label) && !/user|file|street/.test(label);
    if (fact.key === 'address') return /\b(address|street)\b/.test(label);
    if (fact.key === 'postal') return /\b(postal|zip)\b/.test(label);
    if (fact.key === 'dob') return /\b(dob|birth)\b/.test(label);
    if (fact.key === 'nric') return /\b(nric|fin)\b/.test(label);
    return false;
  }
  function plan(scan, facts) {
    return (scan.fields || []).map(function (field) {
      if (field.secret || field.hidden || field.disabled || field.readOnly) {
        return { field: field, skip: field.secret ? 'secret' : field.hidden ? 'hidden' : field.disabled ? 'disabled' : 'readonly' };
      }
      var hits = facts.filter(function (fact) { return matches(field, fact); });
      if (hits.length !== 1) return { field: field, skip: hits.length > 1 ? 'ambiguous' : 'none' };
      return { field: field, fact: hits[0], skip: field.empty ? '' : 'nonempty' };
    });
  }
  root.FormMatch = { plan: plan, matches: matches };
})(typeof globalThis !== 'undefined' ? globalThis : this);
