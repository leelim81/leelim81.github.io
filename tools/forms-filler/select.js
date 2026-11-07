/* Choose autofill, review, or abstain. A hard gate is never overridden. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FormSelect = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var ev = typeof module !== 'undefined' && module.exports
    ? require('./evidence.js')
    : (typeof FormEvidence !== 'undefined' ? FormEvidence : null);

  var ECHO = /^(not|nowhere|designation|null|none|n\/a|nil|unknown|not specified|desk inbox|inbox|mailbox)$/i;
  var IDENTITY = { name: 1, nric: 1, dob: 1 };

  function echo(value, field) {
    var text = String(value || '').trim();
    if (!text || ECHO.test(text)) return true;
    var label = String((field && field.label) || '').trim();
    return label && text.toLowerCase() === label.toLowerCase();
  }

  function eligible(fact, field, packet) {
    var kind = ev.fieldKind(field);
    if (!kind || kind === 'other' || fact.kind !== kind) return false;
    if (kind === 'mailbox') return false;
    if (echo(fact.value, field)) return false;
    var role = ev.fieldRole(field);
    if (fact.role === 'other' || fact.role === 'dependant' || fact.role === 'patient') return false;
    if (fact.role === 'unscoped') return false;
    if (!fact.explicit && !fact.samePerson) return false;
    if (role === 'other') return false;
    if (role === 'unspecified' && packet.people.length > 1) return false;
    if (role === 'unspecified' && fact.role !== 'applicant') return false;
    if (role === 'applicant' && fact.role !== 'applicant') return false;
    return true;
  }

  function groupKey(fact) {
    return fact.kind + '|' + fact.role;
  }

  function decideAll(fields, text, frozen, meta) {
    if (!ev) throw new Error('FormEvidence is not loaded');
    var channel = meta && meta.channel === 'ocr' ? 'ocr' : 'text-layer';
    var packet = ev.extract(text);
    var conflicts = {};
    var byKey = {};
    packet.facts.forEach(function (fact) {
      var key = groupKey(fact);
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(fact);
    });
    Object.keys(byKey).forEach(function (key) {
      var values = {};
      byKey[key].forEach(function (fact) { values[fact.value] = true; });
      if (Object.keys(values).length > 1) conflicts[key] = true;
    });
    var allow = channel === 'ocr' ? ((frozen && frozen.ocrAutofill) || {}) : ((frozen && frozen.autofill) || {});
    return (fields || []).map(function (field) {
      var kind = ev.fieldKind(field);
      var matches = packet.facts.filter(function (fact) { return eligible(fact, field, packet); });
      var trusted = !(field && field.untrusted);
      var base = {
        fieldId: field.id,
        kind: kind,
        geometryTrusted: trusted,
        channel: channel,
        candidates: matches.map(function (fact) {
          return { factId: fact.id, value: fact.value, role: fact.role, quote: fact.quote, line: fact.line };
        })
      };
      if (kind === 'mailbox') {
        return Object.assign(base, { decision: 'abstain', value: '', reason: 'mailbox_not_address', hard: 'type' });
      }
      if (kind === 'other') {
        return Object.assign(base, { decision: 'abstain', value: '', reason: 'unknown_field_type', hard: 'destination' });
      }
      if (!matches.length) {
        return Object.assign(base, { decision: 'abstain', value: '', reason: 'no_source', hard: 'source' });
      }
      var values = {};
      matches.forEach(function (fact) { values[fact.value] = fact; });
      var distinct = Object.keys(values);
      if (distinct.length > 1 || conflicts[groupKey(matches[0])]) {
        return Object.assign(base, { decision: 'abstain', value: '', reason: 'conflict', hard: 'conflict' });
      }
      var fact = matches[0];
      if (!trusted) {
        return Object.assign(base, {
          decision: 'review', value: fact.value, factId: fact.id, quote: fact.quote,
          reason: 'placement_untrusted', hard: null
        });
      }
      if (!allow[kind]) {
        return Object.assign(base, {
          decision: 'review', value: fact.value, factId: fact.id, quote: fact.quote,
          reason: 'type_not_cleared', hard: null
        });
      }
      return Object.assign(base, {
        decision: 'autofill', value: fact.value, factId: fact.id, quote: fact.quote,
        reason: 'explicit_single_source', hard: null
      });
    });
  }

  return {
    decideAll: decideAll,
    echo: echo,
    IDENTITY: IDENTITY
  };
});
