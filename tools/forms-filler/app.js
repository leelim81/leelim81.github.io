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
    var choice = field.options && field.options.length
      ? 'Reply with one of these options and nothing else: ' + field.options.join(', ') + '.'
      : 'Reply with only the raw value for this field. No label, no sentence, no quotes, no explanation.';
    var prompt = [
      choice,
      'If the notes do not contain it, reply with an empty line.',
      'Field: ' + (field.group ? field.group + ' — ' + field.label : field.label),
      'Notes: ' + notes
    ].join('\n');
    var text = await FormLLM.complete(prompt, 16);
    var value = FormSanitize.sanitize(text, field);
    value = bestSupported(value, corpus);
    return { value: value, confidence: value ? 0.9 : 0, quote: value ? notes : '' };
  }

  function refreshLabels() {
    var flat = state.kind === 'flat';
    $('formLabel').textContent = state.formName
      ? state.formName + ' · ' + state.fields.length + ' ' + (flat ? 'entry spots' : 'fields')
      : 'A fillable PDF, a flat form, or a photo of one.';
    $('refLabel').textContent = state.refs.length
      ? state.refs.map(function (ref) { return ref.name; }).join(', ')
      : 'Passport, letter, résumé, or a photo of an ID. One or many.';
    var ready = !!(state.formBytes && state.fields.length && !state.running && (flat || (state.refs.length && state.gpu && state.gpu.ok)));
    $('fillBtn').disabled = !ready;
    $('fillBtn').textContent = flat && !state.refs.length ? 'Open in the editor' : 'Fill from the papers';
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

  var formToken = 0;
  var userTouched = false;

  function isImageName(name, mime) {
    if (mime && mime.indexOf('image/') === 0) return true;
    return /\.(png|jpe?g|webp|gif|bmp)$/i.test(name || '');
  }

  async function setForm(bytes, name, mime) {
    var token = ++formToken;
    var image = isImageName(name, mime);
    var read = image ? await FormFields.readImage(bytes, mime || 'image/jpeg') : await FormFields.read(bytes);
    if (token !== formToken) return false;
    state.formBytes = read.bytes || bytes;
    state.formName = image ? String(name || 'form').replace(/\.[^.]+$/, '') + '.pdf' : (name || 'form.pdf');
    state.proposals = [];
    state.fields = read.fields;
    state.kind = read.kind;
    if (!state.fields.length) toast('No fields or blank lines were found in that PDF.');
    refreshLabels();
    scheduleSave();
    return true;
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

  function blankRow(field) {
    return { id: field.id, label: field.label, type: field.type, value: '', confidence: 0, quote: '', source: '' };
  }

  function proposalFrom(field, value, source) {
    var clean = source === 'facts' ? value : FormSanitize.sanitize(value, field);
    if (source !== 'facts') {
      if (window.FormFacts && !FormFacts.accept(field, clean)) clean = '';
    }
    return {
      id: field.id,
      label: field.label,
      type: field.type,
      value: clean || '',
      confidence: clean ? (source === 'facts' ? 1 : 0.7) : 0,
      quote: source || '',
      source: source || ''
    };
  }

  async function askRest(fields, facts, corpusText) {
    if (!fields.length || !window.FormLLM || !FormLLM.completeJson) return {};
    var properties = {};
    fields.forEach(function (field) {
      properties[field.id] = { type: 'string', description: field.group ? field.group + ': ' + field.label : field.label };
    });
    var schema = { type: 'object', properties: properties };
    var prompt = [
      'Fill only these form fields from the identity facts and the excerpt.',
      'Reply with a JSON object whose keys are the field ids. Use an empty string when the excerpt does not contain the value.',
      'Never answer with SINGAPORE or REPUBLIC OF SINGAPORE unless that is the whole street or country the field asks for, and never invent a phone or email.',
      'Facts: ' + JSON.stringify(facts || {}),
      'Fields: ' + fields.map(function (field) { return field.id + ' = ' + (field.group ? field.group + ' / ' : '') + field.label; }).join('; '),
      'Excerpt: ' + String(corpusText || '').slice(0, 900)
    ].join('\n');
    try {
      return await FormLLM.completeJson(prompt, schema) || {};
    } catch (err) {
      return {};
    }
  }

  async function fillFromPapers() {
    if (state.running) return;
    if (!state.formBytes || !state.fields.length) return;
    if (!state.refs.length) {
      state.proposals = state.fields.map(blankRow);
      await openEditor(false);
      return;
    }
    state.running = true;
    refreshLabels();
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    } catch (err) {}
    try {
      var notesAll = await corpus();
      if (!notesAll.trim()) throw new Error('The references had no readable text.');
      var facts = window.FormFacts ? FormFacts.fromText(notesAll) : {};
      var seeded = window.FormFacts ? FormFacts.mapFactsToFields(facts, state.fields) : {};
      var rest = state.fields.filter(function (field) {
        return !seeded[field.id] && field.type !== 'radio' && field.type !== 'checkbox';
      });
      var guessed = {};
      var gpuOk = state.gpu && state.gpu.ok;
      if (rest.length && gpuOk) {
        status('Checking the remaining fields…', true);
        showProgress({ progress: 0, cached: false, text: '' });
        try {
          await FormLLM.ensure(showProgress);
          $('modelBox').hidden = true;
          guessed = await askRest(rest, facts, notesAll);
        } catch (err) {
          if (err && err.code === 'webgpu') showGpu({ ok: false });
          guessed = {};
        }
      } else if (!gpuOk) {
        showGpu(state.gpu || { ok: false });
      }
      state.proposals = state.fields.map(function (field) {
        if (seeded[field.id]) return proposalFrom(field, seeded[field.id], 'facts');
        var raw = guessed && guessed[field.id] != null ? String(guessed[field.id]) : '';
        var row = proposalFrom(field, raw, 'model');
        if (row.value && !bestSupported(row.value, notesAll)) row.value = '';
        return row;
      });
      await openEditor(false);
    } catch (err) {
      state.running = false;
      refreshLabels();
      var msg = err && err.message ? err.message : 'The form could not be filled.';
      $('failText').textContent = msg;
      $('failBox').hidden = false;
      status('', false);
    }
  }

  async function openEditor(blank) {
    if (!state.formBytes) return;
    if (!blank && state.kind === 'acro' && !state.proposals.length) return;
    status('Opening the editor…', true);
    var values = {};
    if (!blank) {
      state.proposals.forEach(function (row) {
        var field = null;
        for (var i = 0; i < state.fields.length; i++) {
          if (state.fields[i].id === row.id) { field = state.fields[i]; break; }
        }
        values[row.id] = FormSanitize.sanitize(row.value, field || row);
        if (row.source !== 'facts' && window.FormFacts && !FormFacts.accept(field || row, values[row.id])) values[row.id] = '';
      });
    }
    var bytes = state.formBytes;
    if (!blank && state.kind === 'acro') {
      bytes = await FormFields.fill(state.formBytes, state.fields, values, { flatten: true });
    }
    var probe = await PDFLib.PDFDocument.load(bytes.slice(0));
    var boxes = state.kind === 'flat' && window.FormSpots ? FormSpots.annotations(state.fields, values) : {};
    var pages = [];
    for (var i = 0; i < probe.getPageCount(); i++) {
      pages.push({
        id: Math.random().toString(36).slice(2, 10),
        srcIndex: i,
        rotation: 0,
        annotations: boxes[i] || []
      });
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
      userTouched = true;
      if (!files.length) {
        toast('No file was selected.');
        status('', false);
        return;
      }
      for (var n = 0; n < files.length; n++) {
        var file = files[n];
        status('Opening ' + file.name + '…', true);
        var bytes = new Uint8Array(await file.arrayBuffer());
        if (kind === 'form') {
          var applied = await setForm(bytes, file.name, file.type || '');
          if (!applied) return;
        } else await addRef(bytes, file.name, file.type || '');
      }
      status(kind === 'form' ? 'Form ready.' : files.length + ' reference file' + (files.length === 1 ? '' : 's') + ' added.', false);
    })().catch(function (err) {
      toast(err && err.message ? err.message : 'That file could not be opened.');
      status('', false);
    });
  }

  function resetDesk() {
    formToken++;
    userTouched = true;
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
    userTouched = true;
    status('Opening the sample…', true);
    try {
      var form = new Uint8Array(await (await fetch('samples/visitor-form.pdf')).arrayBuffer());
      var ref = new Uint8Array(await (await fetch('samples/visitor-reference.pdf')).arrayBuffer());
      var card = new Uint8Array(await (await fetch('samples/id-card.png')).arrayBuffer());
      state.refs = [];
      var applied = await setForm(form, 'visitor-form.pdf');
      if (!applied) return;
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
    fields: function () {
      return state.fields.map(function (field) {
        return {
          id: field.id,
          label: field.label,
          type: field.type,
          group: field.group || '',
          options: field.options || [],
          page: field.page || 0,
          rect: field.rect || null
        };
      });
    },
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
    if (userTouched || !draft || !draft.formBytes) return;
    var applied = await setForm(draft.formBytes, draft.formName);
    if (!applied || userTouched) return;
    state.refs = draft.refs || [];
    refreshLabels();
  }).catch(function () {});
})();
