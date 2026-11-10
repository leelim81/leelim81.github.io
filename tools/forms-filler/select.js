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
    if (ev.applySectionContext) ev.applySectionContext(fields);
    if (ev.markRegions) ev.markRegions(fields);
    function normLabel(label) {
      return String(label || '').replace(/[:.*\s]+$/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
    function openForPretick(field) {
      if (!field || (ev.unsafeDestination && ev.unsafeDestination(field))) return false;
      var kind = ev.sectionKind ? ev.sectionKind(field.section || field.heading || field.group || '') : '';
      return kind !== 'other' && kind !== 'reset';
    }
    function sameLabel(field) {
      var want = normLabel(field && field.label);
      return (fields || []).filter(function (item) { return normLabel(item && item.label) === want; });
    }
    function readingOrder(a, b) {
      var ap = a.page || 0;
      var bp = b.page || 0;
      if (ap !== bp) return ap - bp;
      var ay = a.rect ? a.rect.y : 0;
      var by = b.rect ? b.rect.y : 0;
      if (a.rect && b.rect && Math.abs(ay - by) > 2) return by - ay;
      var ax = a.rect ? a.rect.x : 0;
      var bx = b.rect ? b.rect.x : 0;
      return ax - bx;
    }
    function firstOpen(field) {
      var peers = sameLabel(field).filter(openForPretick);
      peers.sort(readingOrder);
      return peers[0] === field;
    }
    function present(field, row) {
      var kind = row.kind;
      var slot = ev.identityPhotoSlot ? ev.identityPhotoSlot(field, fields) : '';
      var pretick = (kind === 'name' || kind === 'nric' || kind === 'address') && openForPretick(field) && firstOpen(field);
      if (pretick && (slot === 'name' || slot === 'nric') && slot === kind) row.checked = true;
      else if (pretick && (kind === 'name' || kind === 'nric') && !slot && sameLabel(field).length > 1 && row.value) row.checked = true;
      else if ((kind === 'name' || kind === 'nric') && !pretick) row.checked = false;
      if (kind === 'address' && row.decision === 'autofill' && !pretick && row.value) {
        row.decision = 'review';
        row.checked = false;
        row.reason = 'section_not_first';
      }
      return noteFit(field, row);
    }
    return (fields || []).map(function (field) {
      var refusal = ev.unsafeDestination ? ev.unsafeDestination(field) : '';
      if (refusal) {
        return {
          fieldId: field.id,
          kind: ev.fieldKind(field),
          geometryTrusted: !(field && field.untrusted),
          channel: channel,
          candidates: [],
          decision: 'abstain',
          value: '',
          reason: 'placement_refused',
          refusal: refusal,
          hard: 'destination'
        };
      }
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
      if ((field.type === 'checkbox' || field.type === 'radio') && /^(name|given|surname|nric|dob|phone|email|address|postal)$/.test(kind)) {
        return Object.assign(base, { decision: 'abstain', value: '', reason: 'placement_refused', refusal: 'not-a-text-line', hard: 'destination' });
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
        return present(field, Object.assign(base, {
          decision: 'review', value: fact.value, factId: fact.id, quote: fact.quote,
          reason: 'placement_untrusted', hard: null
        }));
      }
      if (!allow[kind]) {
        return present(field, Object.assign(base, {
          decision: 'review', value: fact.value, factId: fact.id, quote: fact.quote,
          reason: 'type_not_cleared', hard: null
        }));
      }
      var label = String((field && field.label) || '').toLowerCase();
      if ((/name as per/.test(label) && /bank account/.test(label)) || (/nric/.test(label) && /passport|fin/.test(label))) {
        return present(field, Object.assign(base, {
          decision: 'review', value: fact.value, factId: fact.id, quote: fact.quote,
          reason: 'identity_needs_review', hard: null
        }));
      }
      if (kind === 'name' || kind === 'given' || kind === 'surname') {
        var named = Object.assign(base, {
          decision: 'review', value: fact.value, factId: fact.id, quote: fact.quote,
          reason: 'identity_needs_review', hard: null
        });
        return present(field, named);
      }
      var placed = Object.assign(base, {
        decision: 'autofill', value: fact.value, factId: fact.id, quote: fact.quote,
        reason: 'explicit_single_source', hard: null
      });
      return present(field, placed);
    });
  }

  function noteFit(field, row) {
    if (!field || !field.rect || !(field.rect.width > 0) || !row.value) return row;
    var start = Math.max(9, Math.min(13, ((field.lineH || 12) * 0.85)));
    var fit = field.rect.height > 0 && ev.fitInBox
      ? ev.fitInBox(row.value, field.rect.width, field.rect.height, start)
      : (ev.fittedSize ? ev.fittedSize(row.value, field.rect.width, start) : { size: start, fits: true });
    if (fit.fits) {
      row.fontSize = fit.size;
      return row;
    }
    row.decision = 'review';
    row.checked = false;
    row.fontSize = fit.size;
    row.note = 'Does not fit in the box. Left unticked.';
    row.reason = 'does_not_fit';
    return row;
  }

  return {
    decideAll: decideAll,
    echo: echo,
    IDENTITY: IDENTITY
  };
});
