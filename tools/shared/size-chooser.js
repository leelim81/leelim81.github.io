/* Renders the four real file sizes into a container and downloads on click. */
(function (global) {
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function download(bytes, filename, mime) {
    var blob = new Blob([bytes], { type: mime || 'application/pdf' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1500);
  }

  async function mount(container, options) {
    var gen = (container._gen || 0) + 1;
    container._gen = gen;
    container.innerHTML = '';
    container.classList.add('opt-list');
    var buttons = {};
    PdfCompress.LEVELS.forEach(function (level) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'opt loading';
      btn.dataset.level = String(level);
      btn.disabled = true;
      var pct = el('span', 'opt-pct', level + '%');
      var detail = el('span', 'opt-detail', 'Preparing…');
      var size = el('strong', 'opt-size', '…');
      btn.append(pct, detail, size);
      btn.addEventListener('click', function () {
        if (!btn._bytes) return;
        download(btn._bytes, options.nameFor(level), options.mime);
        try {
          if (options.usageKey && window.ToolsUsage) ToolsUsage.recordUse(options.usageKey);
        } catch (err) {}
      });
      container.appendChild(btn);
      buttons[level] = btn;
    });

    try {
      if (options.perLevel) {
        var zipBaseline = null;
        for (var li = 0; li < PdfCompress.LEVELS.length; li++) {
          if (container._gen !== gen) return;
          var level = PdfCompress.LEVELS[li];
          var btnL = buttons[level];
          btnL.classList.add('loading');
          btnL.querySelector('.opt-detail').textContent = 'Building…';
          var built = await options.perLevel(level);
          if (container._gen !== gen) return;
          if (zipBaseline == null) zipBaseline = built.byteLength;
          btnL.classList.remove('loading');
          btnL.disabled = false;
          btnL._bytes = built;
          btnL.dataset.bytes = String(built.byteLength);
          btnL.dataset.method = level === 100 ? 'full' : 'images';
          btnL.querySelector('.opt-size').textContent = PdfCompress.formatMB(built.byteLength);
          var note = level === 100 ? 'Full quality' : 'Compressed pieces';
          if (level !== 100) {
            var sav = PdfCompress.formatSaving(built.byteLength, zipBaseline);
            if (sav) note += ' · ' + sav;
          }
          btnL.querySelector('.opt-detail').textContent = note;
        }
        return;
      }
      var source = await options.getBytes();
      if (container._gen !== gen) return;
      var baseline = options.baselineSize || source.byteLength;
      await PdfCompress.computeVariants(source, function (info) {
        if (container._gen !== gen) return;
        var btn = buttons[info.level];
        if (!btn) return;
        if (info.status === 'loading') {
          btn.classList.add('loading');
          btn.querySelector('.opt-detail').textContent = info.level === 100 ? 'Measuring full quality…' : 'Compressing…';
          return;
        }
        btn.classList.remove('loading');
        btn.disabled = false;
        btn._bytes = info.bytes;
        btn.dataset.bytes = String(info.size);
        btn.dataset.method = info.method;
        btn.querySelector('.opt-size').textContent = PdfCompress.formatMB(info.size);
        var bits = [];
        if (info.level === 100 && options.baselineLabel === 'original') bits.push('Original file');
        else bits.push(PdfCompress.methodLabel(info.method));
        var saving = PdfCompress.formatSaving(info.size, info.level === 100 && options.baselineLabel === 'original' ? info.size : baseline);
        if (info.level !== 100 && saving) bits.push(saving);
        if (info.level === 100 && options.baselineLabel !== 'original') {
          var vs = PdfCompress.formatSaving(info.size, baseline);
          if (vs && vs !== 'same size') bits.push(vs);
        }
        btn.querySelector('.opt-detail').textContent = bits.join(' · ');
        if (options.onUpdate) options.onUpdate(info);
      });
    } catch (err) {
      if (container._gen !== gen) return;
      Object.keys(buttons).forEach(function (level) {
        var btn = buttons[level];
        if (btn.disabled) {
          btn.classList.remove('loading');
          btn.querySelector('.opt-detail').textContent = err.message || 'Could not build this file';
          btn.querySelector('.opt-size').textContent = '—';
        }
      });
      if (global.ToolsUI) ToolsUI.toast(err.message || 'Could not build the files');
    }
  }

  global.PdfSizes = { mount: mount };
})(window);
