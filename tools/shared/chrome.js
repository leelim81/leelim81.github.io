/* Shared chrome: theme, grain, toasts, and a short paper-wipe between pages. */
(function () {
  var root = document.documentElement;

  root.dataset.theme = 'paper';
  try { localStorage.removeItem('tools-theme'); } catch (e) {}

  if (!document.querySelector('.grain')) {
    var grain = document.createElement('div');
    grain.className = 'grain';
    grain.setAttribute('aria-hidden', 'true');
    document.body.appendChild(grain);
  }

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === '_blank') return;
      if (a.hasAttribute('download')) return;
      var url;
      try { url = new URL(a.getAttribute('href'), location.href); } catch (err) { return; }
      if (url.protocol === 'blob:' || url.protocol === 'data:') return;
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      e.preventDefault();
      document.body.classList.add('is-leaving');
      setTimeout(function () { location.href = url.href; }, 420);
    });
  }

  var toastEl = null;
  var toastTimer = 0;
  window.ToolsUI = {
    toast: function (message) {
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.id = 'toast';
        toastEl.setAttribute('role', 'status');
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = message;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 4600);
    }
  };
})();
