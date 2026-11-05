/* Read AcroForm fields, or find blank lines on a flat page, then write values back. */
(function (global) {
  function copy(bytes) {
    return bytes instanceof Uint8Array ? bytes.slice(0) : new Uint8Array(bytes);
  }

  function prettify(name) {
    var text = String(name || 'Field').replace(/[._[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return 'Field';
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function slug(text) {
    var s = String(text || 'field').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    return (s || 'field').slice(0, 48);
  }

  function fieldType(field) {
    if (typeof field.setText === 'function' && typeof field.getText === 'function') return 'text';
    if (typeof field.check === 'function' && typeof field.isChecked === 'function') return 'checkbox';
    if (typeof field.getOptions === 'function' && typeof field.select === 'function') {
      try {
        var selected = field.getSelected();
        if (Array.isArray(selected)) return 'dropdown';
      } catch (err) {}
      return 'radio';
    }
    return 'other';
  }

  function readAcro(doc) {
    var form;
    try { form = doc.getForm(); } catch (err) { return []; }
    var fields = [];
    form.getFields().forEach(function (field) {
      var type = fieldType(field);
      if (type === 'other') return;
      var options = [];
      if (type === 'radio' || type === 'dropdown') {
        try { options = field.getOptions().map(String); } catch (err) { options = []; }
      }
      fields.push({
        id: field.getName(),
        label: prettify(field.getName()),
        type: type,
        options: options,
        source: 'acro'
      });
    });
    return fields;
  }

  async function readFlat(bytes) {
    if (!global.pdfjsLib) return [];
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    var pdf = await pdfjsLib.getDocument({ data: copy(bytes) }).promise;
    var fields = [];
    var seen = {};
    var pages = Math.min(pdf.numPages, 6);
    for (var p = 1; p <= pages; p++) {
      var page = await pdf.getPage(p);
      var content = await page.getTextContent();
      var rows = [];
      content.items.forEach(function (item) {
        if (!item.str || !item.str.trim()) return;
        var y = item.transform[5];
        var row = null;
        for (var i = 0; i < rows.length; i++) {
          if (Math.abs(rows[i].y - y) < 3) { row = rows[i]; break; }
        }
        if (!row) {
          row = { y: y, items: [] };
          rows.push(row);
        }
        row.items.push(item);
      });
      rows.forEach(function (row) {
        row.items.sort(function (a, b) { return a.transform[4] - b.transform[4]; });
        var pending = '';
        row.items.forEach(function (item) {
          var match = item.str.match(/^(.*?)(_{4,})\s*$/);
          var label = '';
          var underscores = '';
          if (match) {
            label = match[1].replace(/[:\s]+$/, '').trim() || pending;
            underscores = match[2];
          } else if (/_{4,}/.test(item.str) && pending) {
            label = pending;
            underscores = (item.str.match(/_{4,}/) || [''])[0];
          } else {
            pending = item.str.replace(/[:\s]+$/, '').trim();
            return;
          }
          if (!label) return;
          var fraction = underscores.length / Math.max(item.str.length, 1);
          var width = (item.width || 160) * fraction;
          var x = item.transform[4] + (item.width || 0) - width;
          var id = slug(label);
          if (seen[id]) id = id + '_' + fields.length;
          seen[id] = true;
          fields.push({
            id: id,
            label: label,
            type: 'text',
            options: [],
            source: 'flat',
            page: p - 1,
            rect: { x: x, y: item.transform[5], width: Math.max(width, 80), height: item.height || 12 }
          });
          pending = '';
        });
      });
    }
    return fields;
  }

  async function read(bytes) {
    var doc = await PDFLib.PDFDocument.load(copy(bytes));
    var fields = readAcro(doc);
    var kind = 'acro';
    if (!fields.length) {
      fields = await readFlat(bytes);
      kind = 'flat';
    }
    return { kind: kind, fields: fields };
  }

  function truthy(value) {
    return /^(yes|true|1|on|checked|agree|agreed)$/i.test(String(value || '').trim());
  }

  function applyAcro(field, meta, value) {
    var empty = value == null || String(value).trim() === '';
    if (meta.type === 'text') {
      field.setText(empty ? '' : String(value));
      return;
    }
    if (meta.type === 'checkbox') {
      if (!empty && truthy(value)) field.check();
      else field.uncheck();
      return;
    }
    if (empty) return;
    var options = [];
    try { options = field.getOptions(); } catch (err) { options = []; }
    var want = String(value).trim().toLowerCase();
    var match = options.filter(function (option) {
      return String(option).trim().toLowerCase() === want;
    })[0];
    if (match != null) field.select(match);
  }

  async function fill(bytes, fields, values, opts) {
    var doc = await PDFLib.PDFDocument.load(copy(bytes));
    var font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    var byName = {};
    if (fields.some(function (field) { return field.source === 'acro'; })) {
      var form = doc.getForm();
      form.getFields().forEach(function (field) {
        byName[field.getName()] = field;
      });
      fields.forEach(function (meta) {
        if (meta.source !== 'acro' || !byName[meta.id]) return;
        applyAcro(byName[meta.id], meta, values[meta.id]);
      });
      form.updateFieldAppearances(font);
      if (opts && opts.flatten) form.flatten();
    }
    fields.forEach(function (meta) {
      if (meta.source !== 'flat') return;
      var value = values[meta.id];
      if (value == null || String(value).trim() === '') return;
      var page = doc.getPages()[meta.page] || doc.getPages()[0];
      page.drawRectangle({
        x: meta.rect.x,
        y: meta.rect.y - 2,
        width: meta.rect.width,
        height: (meta.rect.height || 12) + 4,
        color: PDFLib.rgb(1, 1, 1)
      });
      page.drawText(String(value), {
        x: meta.rect.x,
        y: meta.rect.y,
        size: 11,
        font: font,
        color: PDFLib.rgb(0.1, 0.08, 0.06)
      });
    });
    return new Uint8Array(await doc.save());
  }

  global.FormFields = { read: read, fill: fill };
})(window);
