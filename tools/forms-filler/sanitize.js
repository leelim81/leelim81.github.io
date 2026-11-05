/* Turn a model reply into a bare form value. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FormSanitize = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var NRIC = /\b[STFGM]\d{7}[A-Z]\b/;
  var EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  var PHONE = /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d[\d\s()-]{5,}\d/;
  var DATE = /\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/;
  var POSTAL = /\b\d{6}\b/;

  function collapse(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function looksChatty(text) {
    return /\b(this is|here is|provided|incorrect|should be|i think|i believe|sorry|looks like|the answer|unknown)\b/i.test(text);
  }

  function stripDecor(text) {
    var s = collapse(text).replace(/`/g, '').replace(/\*\*/g, '').replace(/__/g, '');
    s = s.replace(/^\*+|\*+$/g, '').replace(/^_+|_+$/g, '');
    s = s.replace(/^["'«]+|["'»]+$/g, '');
    return s.trim();
  }

  function stripLead(text, field) {
    var value = text;
    var label = field && field.label ? field.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
    for (var n = 0; n < 4; n++) {
      var next = value
        .replace(/^this is the\s+[^:]{1,60}:\s*/i, '')
        .replace(/^here is the\s+[^:]{1,60}:\s*/i, '')
        .replace(/^the\s+.{1,80}?\s+is\s*[:\-]?\s*/i, '')
        .replace(/^(answer|value|result)\s*[:\-]\s*/i, '');
      if (label) next = next.replace(new RegExp('^' + label + '\\s*[:\\-]\\s*', 'i'), '');
      next = next.trim();
      if (next === value) break;
      value = next;
    }
    return value;
  }

  function tidyPhone(raw) {
    return collapse(raw).replace(/[.,;]+$/g, '');
  }

  function pullFact(text, field) {
    var id = ((field && field.id) || '') + ' ' + ((field && field.label) || '');
    var nric = text.match(NRIC);
    var email = text.match(EMAIL);
    var phone = text.match(PHONE);
    var date = text.match(DATE);
    if (/nric|fin|\bid\b/i.test(id) && nric) return nric[0];
    if (/mail/i.test(id) && email) return email[0];
    if (/phone|tel|mobile|fax/i.test(id) && phone) return tidyPhone(phone[0]);
    if (/dob|birth|date/i.test(id) && date) return date[0];
    if (nric && looksChatty(text)) return nric[0];
    if (email && looksChatty(text)) return email[0];
    if (phone && looksChatty(text)) return tidyPhone(phone[0]);
    if (date && looksChatty(text)) return date[0];
    if (/address|postal/i.test(id) && POSTAL.test(text)) {
      var tail = text.split(':').pop().trim();
      if (tail && POSTAL.test(tail) && !looksChatty(tail)) return tail.replace(/\.$/, '');
    }
    return '';
  }

  function mapChoice(text, field) {
    if (!field) return text;
    if (field.type === 'checkbox') {
      if (/\b(yes|true|agree|agreed|checked|on)\b/i.test(text)) return 'yes';
      if (/\b(no|false|disagree|unchecked|off)\b/i.test(text)) return 'no';
      return '';
    }
    if ((field.type === 'radio' || field.type === 'dropdown') && field.options && field.options.length) {
      var found = '';
      field.options.forEach(function (option) {
        var name = String(option);
        if (text.toLowerCase().indexOf(name.toLowerCase()) !== -1 && name.length > found.length) found = name;
      });
      return found;
    }
    return text;
  }

  function sanitize(raw, field) {
    var text = stripDecor(raw);
    if (!text || /^(none|null|n\/a|unknown|not found)$/i.test(text)) return '';
    text = stripLead(text, field || {});
    text = stripDecor(text);
    if (!text) return '';
    if (field && (field.type === 'checkbox' || field.type === 'radio' || field.type === 'dropdown')) {
      return mapChoice(text, field);
    }
    if (looksChatty(text)) {
      var after = text.split(':').pop().trim();
      if (after && after !== text && !looksChatty(after)) text = after;
      else {
        var fact = pullFact(text, field);
        return fact;
      }
    }
    var factNow = pullFact(text, field);
    if (factNow && /nric|fin|mail|phone|tel|mobile|dob|birth/i.test(((field && field.id) || '') + ' ' + ((field && field.label) || ''))) {
      text = factNow;
    }
    if (!/[.!?]/.test(text.slice(0, -1)) && text.split(' ').length < 14) text = text.replace(/\.$/, '');
    text = collapse(text);
    if (looksChatty(text) || (text.split(' ').length > 10 && /\b(is|are|was|provided)\b/i.test(text))) return pullFact(text, field);
    return text;
  }

  return { sanitize: sanitize };
});
