/* Global counts via Abacus (no account, CORS open). Failures stay silent. */
(function (global) {
  var NS = 'leelim81-tools';
  var BASE = 'https://abacus.jasoncameron.dev';

  function slug(href) {
    var s = String(href || 'tool').replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
    return s || 'tool';
  }

  function keyFor(tool) {
    if (tool && tool.counter) return String(tool.counter);
    return slug(tool && tool.href);
  }

  function url(kind, key) {
    return BASE + '/' + kind + '/' + encodeURIComponent(NS) + '/' + encodeURIComponent(key);
  }

  function hit(key) {
    if (!key) return Promise.resolve(null);
    return fetch(url('hit', key), { mode: 'cors', cache: 'no-store', credentials: 'omit' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (body) { return body && typeof body.value === 'number' ? body.value : null; })
      .catch(function () { return null; });
  }

  function get(key) {
    if (!key) return Promise.resolve(null);
    return fetch(url('info', key), { mode: 'cors', cache: 'no-store', credentials: 'omit' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (body) {
        if (!body || body.exists === false || typeof body.value !== 'number' || body.value < 0) return null;
        return body.value;
      })
      .catch(function () { return null; });
  }

  function formatCount(n) {
    return typeof n === 'number' && isFinite(n) ? String(n) : '-';
  }

  function recordUse(key) {
    return hit(key);
  }

  function showHub(el, tools) {
    if (!el) return;
    var list = tools || [];
    var keys = list.map(keyFor);
    el.textContent = ['-'].concat(keys.map(function () { return '-'; })).join('/');
    var visit = hit('visits');
    var uses = keys.map(get);
    Promise.all([visit].concat(uses)).then(function (values) {
      el.textContent = values.map(formatCount).join('/');
    }).catch(function () {});
  }

  global.ToolsUsage = {
    namespace: NS,
    slug: slug,
    keyFor: keyFor,
    recordUse: recordUse,
    showHub: showHub
  };
})(window);
