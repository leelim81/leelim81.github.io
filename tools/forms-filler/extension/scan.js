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
    if (type === 'password' || type === 'hidden') return true;
    if (/password|current-password|new-password|cc-|card|one-time-code|otp/.test(auto)) return true;
    if (/password|otp|cvv|cvc|cardnumber|ssn/.test(name)) return true;
    return false;
  }
  var fields = [];
  var nodes = document.querySelectorAll('input, select, textarea');
  nodes.forEach(function (el, index) {
    if (el.closest && el.closest('template')) return;
    var token = 'ff' + index;
    el.setAttribute('data-ff-scan', token);
    var tag = el.tagName.toLowerCase();
    fields.push({
      token: token,
      tag: tag,
      type: (el.getAttribute('type') || (tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : 'text')).toLowerCase(),
      label: String(labelFor(el) || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      autocomplete: el.getAttribute('autocomplete') || '',
      name: el.getAttribute('name') || '',
      empty: tag === 'select' ? !el.value : !String(el.value || '').trim(),
      disabled: !!el.disabled,
      readOnly: !!el.readOnly,
      hidden: hidden(el),
      secret: secret(el)
    });
  });
  var shadow = 0;
  document.querySelectorAll('*').forEach(function (el) { if (el.shadowRoot) shadow++; });
  var frames = document.querySelectorAll('iframe').length;
  return { fields: fields, unsupported: { shadow: shadow, frames: frames } };
})();
