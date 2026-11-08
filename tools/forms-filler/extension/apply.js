/* Write only the approved pairs. Do not focus a control, and do not submit. */
globalThis.__ffApply = (function () {
  var jobs = globalThis.__ffJobs || [];
  globalThis.__ffJobs = [];
  var touched = [];
  var rejected = [];
  function setNative(el, value) {
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  jobs.forEach(function (job) {
    var el = document.querySelector('[data-ff-scan="' + CSS.escape(job.token) + '"]');
    if (!el || el.disabled || el.readOnly) { rejected.push(job.token); return; }
    var type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'password' || type === 'hidden' || type === 'file' || el.hidden) { rejected.push(job.token); return; }
    if (!job.replace && String(el.value || '').trim()) { rejected.push(job.token); return; }
    if (el.tagName === 'SELECT') {
      var options = Array.prototype.map.call(el.options, function (opt) { return opt.value; });
      if (options.indexOf(job.value) < 0) { rejected.push(job.token); return; }
    }
    setNative(el, job.value);
    if (String(el.value || '') !== String(job.value)) { rejected.push(job.token); return; }
    touched.push(job.token);
  });
  return { touched: touched, rejected: rejected };
})();
