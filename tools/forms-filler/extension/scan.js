/* Describe fields on this page. Do not read a profile and do not fill. */
globalThis.__ffScan = (function () {
  function labelFor(el) {
    if (el.id) {
      var via = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (via && via.textContent) return via.textContent;
    }
    var wrap = el.closest ? el.closest('label') : null;
    if (wrap && wrap.textContent) return wrap.textContent;
    return el.getAttribute('aria-label') || el.placeholder || '';
  }
  function legendFor(el) {
    var set = el.closest ? el.closest('fieldset') : null;
    if (!set) return '';
    var legend = set.querySelector('legend');
    return legend && legend.textContent ? legend.textContent : '';
  }
  function roleWords(text) {
    var found = [];
    var s = String(text || '').toLowerCase();
    if (/\bapplicant\b/.test(s)) found.push('applicant');
    if (/\bpatient\b/.test(s)) found.push('patient');
    if (/\bspouse\b/.test(s)) found.push('spouse');
    if (/\bcontact\b/.test(s)) found.push('contact');
    return found.filter(function (role, index) { return found.indexOf(role) === index; });
  }
  function hidden(el) {
    if (el.hidden || el.getAttribute('type') === 'hidden' || el.getAttribute('aria-hidden') === 'true') return true;
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
    return false;
  }
  function secret(el) {
    var type = (el.getAttribute('type') || '').toLowerCase();
    var auto = (el.getAttribute('autocomplete') || '').toLowerCase();
    var name = ((el.getAttribute('name') || '') + ' ' + (el.id || '')).toLowerCase();
    if (type === 'password' || type === 'hidden' || type === 'file') return true;
    if (/password|current-password|new-password|cc-|card|one-time-code|otp/.test(auto)) return true;
    if (/password|otp|cvv|cvc|cardnumber|cc-name|cc-number|cc-exp|cc-csc|ssn/.test(name)) return true;
    return false;
  }
  var fields = [];
  var nodes = document.querySelectorAll('input, select, textarea');
  nodes.forEach(function (el) {
    if (el.closest && el.closest('template')) return;
    var token = el.getAttribute('data-ff-scan');
    if (!token) {
      token = 'ff' + Math.random().toString(36).slice(2, 10);
      el.setAttribute('data-ff-scan', token);
    }
    var tag = el.tagName.toLowerCase();
    var label = String(labelFor(el) || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    var legend = String(legendFor(el) || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    var visibleRoles = roleWords(legend + ' ' + label);
    var auto = el.getAttribute('autocomplete') || '';
    var sectionMatch = auto.toLowerCase().match(/\bsection-([a-z0-9_-]+)/);
    var opaqueSection = sectionMatch ? sectionMatch[1] : '';
    var sectionRole = roleWords(opaqueSection.replace(/[-_]/g, ' '));
    var roleConflict = visibleRoles.length > 1 || (sectionRole.length === 1 && visibleRoles.length === 1 && sectionRole[0] !== visibleRoles[0]);
    fields.push({
      token: token,
      tag: tag,
      type: (el.getAttribute('type') || (tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : 'text')).toLowerCase(),
      label: label,
      legend: legend,
      role: visibleRoles.length === 1 ? visibleRoles[0] : '',
      roleConflict: roleConflict,
      opaqueSection: opaqueSection,
      autocomplete: auto,
      name: el.getAttribute('name') || '',
      empty: tag === 'select' ? !el.value : !String(el.value || '').trim(),
      disabled: !!el.disabled,
      readOnly: !!el.readOnly,
      hidden: hidden(el),
      secret: secret(el),
      file: (el.getAttribute('type') || '').toLowerCase() === 'file'
    });
  });
  var shadow = 0;
  document.querySelectorAll('*').forEach(function (el) { if (el.shadowRoot) shadow++; });
  var frames = document.querySelectorAll('iframe, frame').length;
  var roles = [];
  fields.forEach(function (field) {
    if (field.role && roles.indexOf(field.role) < 0) roles.push(field.role);
  });
  return { fields: fields, roles: roles, unsupported: { shadow: shadow, frames: frames } };
})();
