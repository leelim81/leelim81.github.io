/* Two uploads, a local model, then the existing editor. */
(function () {
  var DB = 'tools-forms-filler';
  var EDITOR_DB = 'tools-edit-sign-pdf';
  var state = {
    gpu: null,
    formBytes: null,
    formName: '',
    fields: [],
    kind: '',
    refs: [],
    proposals: [],
    running: false
  };

  function $(id) { return document.getElementById(id); }
  function toast(msg) { if (window.ToolsUI) ToolsUI.toast(msg); }
  function status(msg, busy) {
    var el = $('readStatus');
    el.hidden = !msg;
    el.classList.toggle('busy', !!busy);
    el.textContent = msg || '';
  }

  function hintFor(field) {
    var known = {
      full_name: "the person's full name",
      nric: 'NRIC or FIN',
      address: 'postal address',
      phone: 'phone number',
      email: 'email address',
      dob: 'date of birth',
      nationality: 'nationality',
      member_type: 'Visitor or Member',
      emergency_name: 'emergency contact name',
      emergency_phone: 'emergency contact phone',
      consent: 'yes if they agree to the rules, otherwise no'
    };
    return known[field.id] || field.label;
  }

  function bestSupported(value, corpus) {
    var raw = String(value || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    if (supported(raw, corpus)) return raw;
    var words = raw.split(' ');
    var best = '';
    for (var len = words.length; len >= 1; len--) {
      for (var i = 0; i + len <= words.length; i++) {
        var cut = words.slice(i, i + len).join(' ').replace(/^[^a-z0-9+]+|[^a-z0-9@.+]+$/gi, '');
        if (cut && cut.length > best.length && supported(cut, corpus)) best = cut;
      }
      if (best.split(' ').length >= 2 || (best.replace(/\D/g, '').length >= 6)) return best;
    }
    return best;
  }

  function supported(value, corpus) {
    var raw = String(value || '').trim();
    if (!raw) return false;
    var hay = corpus.toLowerCase();
    if (hay.indexOf(raw.toLowerCase()) !== -1) return true;
    var digits = raw.replace(/\D/g, '');
    if (digits.length >= 6 && hay.replace(/\D/g, '').indexOf(digits) !== -1) return true;
    var words = raw.toLowerCase().split(/[^a-z0-9@.+]+/).filter(function (w) { return w.length > 2; });
    return words.length > 0 && words.every(function (w) { return hay.indexOf(w) !== -1; });
  }

  function snippetFor(corpus, query) {
    var lines = String(corpus || '').split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
    var terms = String(query || '').toLowerCase().split(/[^a-z0-9]+/).filter(function (word) { return word.length > 3; });
    var best = lines[0] || '';
    var bestScore = -1;
    lines.forEach(function (line) {
      var hay = line.toLowerCase();
      var score = 0;
      terms.forEach(function (term) { if (hay.indexOf(term) !== -1) score++; });
      if (score > bestScore) { bestScore = score; best = line; }
    });
    return best;
  }

  async function askOne(field, corpus) {
    var notes = snippetFor(corpus, field.label + ' ' + hintFor(field));
    var prompt = [
      'Reply with only the raw value for this field. No label, no sentence, no quotes, no explanation.',
      'If the notes do not contain it, reply with an empty line.',
      'Field: ' + field.label,
      'Notes: ' + notes
    ].join('\n');
    var text = await FormLLM.complete(prompt, 16);
    var value = FormSanitize.sanitize(text, field);
    value = bestSupported(value, corpus);
    return { value: value, confidence: value ? 0.9 : 0, quote: value ? notes : '' };
  }

  function refreshLabels() {
    $('formLabel').textContent = state.formName
      ? state.formName + ' · ' + state.fields.length + ' ' + (state.kind === 'flat' ? 'blank lines' : 'fields')
      : 'A fillable form, or a flat scan with lines.';
    $('refLabel').textContent = state.refs.length
      ? state.refs.map(function (ref) { return ref.name; }).join(', ')
      : 'Passport, letter, résumé, or a photo of an ID. One or many.';
    var ready = !!(state.formBytes && state.fields.length && state.refs.length && state.gpu && state.gpu.ok && !state.running);
    $('fillBtn').disabled = !ready;
  }

  function showGpu(status) {
    state.gpu = status;
    var warn = $('gpuWarn');
    if (status.ok) {
      warn.hidden = true;
      warn.textContent = '';
    } else {
      warn.hidden = false;
      warn.textContent = 'This browser has no WebGPU, so the private model cannot run. Open this page in Chrome or Edge on a computer or phone that has WebGPU. Nothing is sent to a server.';
    }
    refreshLabels();
  }

  function onceNote(mb) {
    return 'One-time download (~' + mb + ' MB). It\'s saved in this browser, so next time it loads from your device without downloading again. Clearing site data, using incognito, or another browser means downloading it again.';
  }

  function showProgress(report) {
    var box = $('modelBox');
    box.hidden = false;
    var model = state.gpu && state.gpu.model;
    var mb = model ? model.megabytes : 868;
    var text = report && report.text ? report.text : '';
    var cached = !!(report && report.cached);
    $('modelTitle').textContent = cached
      ? 'Model ready on this device, no download needed.'
      : 'Downloading private model · ~' + mb + ' MB';
    $('modelNote').textContent = cached
      ? 'It\'s saved in this browser. Clearing site data, using incognito, or another browser means downloading it again.'
      : onceNote(mb);
    var pct = Math.max(0, Math.min(1, report && report.progress ? report.progress : 0));
    $('modelBar').style.width = Math.round(pct * 100) + '%';
    $('modelDetail').textContent = text;
  }

  async function setForm(bytes, name) {
    state.formBytes = bytes;
    state.formName = name || 'form.pdf';
    state.proposals = [];
    var read = await FormFields.read(bytes);
    state.fields = read.fields;
    state.kind = read.kind;
    if (!state.fields.length) toast('No fields or blank lines were found in that PDF.');
    refreshLabels();
    scheduleSave();
  }

  async function addRef(bytes, name, mime) {
    state.refs.push({ name: name || 'reference', bytes: bytes, mime: mime || '' });
    state.proposals = [];
    refreshLabels();
    scheduleSave();
  }

  async function corpus() {
    var parts = [];
    for (var i = 0; i < state.refs.length; i++) {
      var ref = state.refs[i];
      status('Reading ' + ref.name + '…', true);
      var text = '';
      var isPdf = ref.mime === 'application/pdf' || /\.pdf$/i.test(ref.name);
      try {
        text = isPdf ? await FormExtract.fromPdf(ref.bytes) : await FormExtract.imageText(ref.bytes, ref.mime || 'image/png');
      } catch (err) {
        toast('Couldn’t read ' + ref.name + '.');
      }
      if (text && text.trim()) parts.push(text.trim());
    }
    return parts.join('\n\n');
  }

  async function fillFromPapers() {
    if (state.running) return;
    if (!state.gpu || !state.gpu.ok) {
      showGpu(state.gpu || { ok: false });
      return;
    }
    if (!state.formBytes || !state.fields.length || !state.refs.length) return;
    state.running = true;
    refreshLabels();
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    } catch (err) {}
    showProgress({ progress: 0, cached: false, text: '' });
    try {
      var notesAll = await corpus();
      if (!notesAll.trim()) throw new Error('The references had no readable text.');
      status('Loading the private model…', true);
      await FormLLM.ensure(showProgress);
      $('modelBox').hidden = true;
      var into = {};
      for (var i = 0; i < state.fields.length; i++) {
        var field = state.fields[i];
        status('Mapping ' + field.label + '…', true);
        into[field.id] = await askOne(field, notesAll);
      }
      state.proposals = state.fields.map(function (field) {
        var row = into[field.id] || { value: '', confidence: 0, quote: '' };
        return {
          id: field.id,
          label: field.label,
          type: field.type,
          value: row.value,
          confidence: row.confidence,
          quote: row.quote
        };
      });
      await openEditor(false);
    } catch (err) {
      state.running = false;
      refreshLabels();
      if (err && err.code === 'webgpu') showGpu({ ok: false });
      var msg = err && err.message ? err.message : 'The form could not be filled.';
      $('failText').textContent = msg;
      $('failBox').hidden = false;
      status('', false);
    }
  }

  async function openEditor(blank) {
    if (!state.formBytes) return;
    if (!blank && !state.proposals.length) return;
    status('Opening the editor…', true);
    var bytes = state.formBytes;
    if (!blank) {
      var values = {};
      state.proposals.forEach(function (row) {
        values[row.id] = FormSanitize.sanitize(row.value, row);
      });
      bytes = await FormFields.fill(state.formBytes, state.fields, values, { flatten: state.kind === 'acro' });
    }
    var probe = await PDFLib.PDFDocument.load(bytes.slice(0));
    var pages = [];
    for (var i = 0; i < probe.getPageCount(); i++) {
      pages.push({ id: Math.random().toString(36).slice(2, 10), srcIndex: i, rotation: 0, annotations: [] });
    }
    var fileName = blank ? (state.formName || 'form.pdf') : state.formName.replace(/\.pdf$/i, '') + '-filled.pdf';
    await DeskDB.set(EDITOR_DB, 'pdf', bytes);
    await DeskDB.set(EDITOR_DB, 'session', { fileName: fileName, zoom: 1, current: 0, pages: pages });
    try { if (window.ToolsUsage) await ToolsUsage.recordUse('forms-filler'); } catch (err) {}
    state.running = false;
    refreshLabels();
    location.href = '../pdf-editor/';
  }

  var saveTimer = 0;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 300);
  }
  function saveNow() {
    if (!state.formBytes && !state.refs.length) return;
    DeskDB.set(DB, 'draft', {
      formName: state.formName,
      formBytes: state.formBytes,
      kind: state.kind,
      refs: state.refs.map(function (ref) { return { name: ref.name, bytes: ref.bytes, mime: ref.mime }; })
    }).catch(function () {});
  }

  function snapshotFiles(input) {
    var files = [];
    if (input.files) for (var i = 0; i < input.files.length; i++) files.push(input.files[i]);
    input.value = '';
    return files;
  }

  function takeFiles(files, kind) {
    return (async function () {
      if (!files.length) {
        toast('No file was selected.');
        status('', false);
        return;
      }
      for (var n = 0; n < files.length; n++) {
        var file = files[n];
        status('Opening ' + file.name + '…', true);
        var bytes = new Uint8Array(await file.arrayBuffer());
        if (kind === 'form') await setForm(bytes, file.name);
        else await addRef(bytes, file.name, file.type || '');
      }
      status(kind === 'form' ? 'Form ready.' : files.length + ' reference file' + (files.length === 1 ? '' : 's') + ' added.', false);
    })().catch(function (err) {
      toast(err && err.message ? err.message : 'That file could not be opened.');
      status('', false);
    });
  }

  function resetDesk() {
    state.running = false;
    state.formBytes = null;
    state.formName = '';
    state.fields = [];
    state.kind = '';
    state.refs = [];
    state.proposals = [];
    $('formInput').value = '';
    $('refInput').value = '';
    $('formDrop').disabled = false;
    $('refDrop').disabled = false;
    $('failBox').hidden = true;
    $('modelBox').hidden = true;
    refreshLabels();
    status('', false);
  }

  $('formDrop').addEventListener('click', function () { $('formInput').click(); });
  $('refDrop').addEventListener('click', function () { $('refInput').click(); });
  $('formInput').addEventListener('change', function () {
    takeFiles(snapshotFiles($('formInput')), 'form');
  });
  $('refInput').addEventListener('change', function () {
    takeFiles(snapshotFiles($('refInput')), 'ref');
  });
  $('sampleBtn').addEventListener('click', async function () {
    status('Opening the sample…', true);
    try {
      var form = new Uint8Array(await (await fetch('samples/visitor-form.pdf')).arrayBuffer());
      var ref = new Uint8Array(await (await fetch('samples/visitor-reference.pdf')).arrayBuffer());
      var card = new Uint8Array(await (await fetch('samples/id-card.png')).arrayBuffer());
      state.refs = [];
      await setForm(form, 'visitor-form.pdf');
      await addRef(ref, 'visitor-reference.pdf', 'application/pdf');
      await addRef(card, 'id-card.png', 'image/png');
      status('', false);
    } catch (err) {
      toast('The sample files could not be opened.');
      status('', false);
    }
  });
  $('fillBtn').addEventListener('click', function () {
    $('failBox').hidden = true;
    fillFromPapers();
  });
  $('retryFill').addEventListener('click', function () {
    $('failBox').hidden = true;
    fillFromPapers();
  });
  $('openBlank').addEventListener('click', function () {
    openEditor(true).catch(function (err) { toast(err.message || 'Could not open the editor.'); });
  });
  $('clearBtn').addEventListener('click', function () {
    resetDesk();
    DeskDB.clear(DB).catch(function () {});
  });
  window.addEventListener('pageshow', function (event) {
    state.running = false;
    $('formDrop').disabled = false;
    $('refDrop').disabled = false;
    refreshLabels();
    if (event.persisted) status('Ready for another form.', false);
  });

  window.FormDesk = {
    applyMap: function (map) {
      state.proposals = state.fields.map(function (field) {
        var raw = map && map[field.id] != null ? String(map[field.id]) : '';
        var value = FormSanitize.sanitize(raw, field);
        return {
          id: field.id,
          label: field.label,
          type: field.type,
          value: value,
          confidence: value ? 0.9 : 0,
          quote: ''
        };
      });
      return openEditor(false);
    }
  };
  FormLLM.gpu().then(showGpu);
  DeskDB.get(DB, 'draft').then(async function (draft) {
    if (!draft || !draft.formBytes) return;
    await setForm(draft.formBytes, draft.formName);
    state.refs = draft.refs || [];
    refreshLabels();
  }).catch(function () {});
})();
