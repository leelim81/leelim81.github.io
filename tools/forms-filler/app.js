/* Two uploads, a local model, then the existing editor. */
(function () {
  var DB = 'tools-forms-filler';
  var EDITOR_DB = 'tools-forms-editor';
  var state = {
    gpu: null,
    formBytes: null,
    formName: '',
    fields: [],
    kind: '',
    refs: [],
    proposals: [],
    running: false,
    modelNote: '',
    handedOff: false,
    seeded: {},
    notes: ''
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
    renderRefs();
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
    paintModel();
  }

  function modelSentence(snap) {
    var name = snap && snap.label ? snap.label : 'Private model';
    var bits = [name];
    if (snap && snap.quant) bits.push(snap.quant);
    if (snap && snap.megabytes) bits.push('~' + snap.megabytes + ' MB');
    return bits.join(' · ');
  }

  function paintModel() {
    var el = $('modelState');
    if (!el || !window.FormLLM || !FormLLM.snapshot) return;
    var snap = FormLLM.snapshot();
    var who = modelSentence(snap);
    var tail = ' It runs only on this device. The browser may evict the cache.';
    el.hidden = false;
    if (state.modelNote === 'skipped') {
      el.textContent = snap.label
        ? 'Model not needed. These papers had nothing further for it to read, so ' + who + ' was not downloaded.' + tail
        : 'Model not needed. These papers had nothing further for it to read, so nothing was downloaded.' + tail;
      return;
    }
    if (snap.phase === 'unavailable') {
      el.textContent = 'Private model unavailable. This browser has no WebGPU, so nothing is downloaded.';
      return;
    }
    if (snap.phase === 'checking') {
      el.textContent = 'Checking whether this browser can run the private model…';
      return;
    }
    if (snap.phase === 'selected') {
      el.textContent = who + ' selected, not downloaded yet.' + tail;
      return;
    }
    if (snap.phase === 'downloading') {
      var pct = Math.round(Math.max(0, Math.min(1, snap.progress || 0)) * 100);
      var fromCache = /from cache/i.test(snap.detail || '');
      el.textContent = (fromCache ? 'Loading ' : 'Downloading ') + who + ' · ' + pct + '%.' + tail;
      return;
    }
    if (snap.phase === 'ready' && snap.cachedConfirmed) {
      el.textContent = who + ' loaded from this browser’s cache and ready.' + tail;
      return;
    }
    if (snap.phase === 'ready') {
      el.textContent = who + ' downloaded and ready on this device.' + tail;
      return;
    }
    if (snap.phase === 'failed') {
      el.textContent = who + ' did not finish loading. Fields already read from the papers are still filled.' + tail;
      return;
    }
    el.textContent = who + ' selected, not downloaded yet.' + tail;
  }

  function showProgress(report) {
    paintModel();
    var snap = window.FormLLM && FormLLM.snapshot ? FormLLM.snapshot() : { phase: '', progress: 0, detail: '' };
    var box = $('modelBox');
    if (snap.phase !== 'downloading') {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    $('modelTitle').textContent = (/from cache/i.test(snap.detail || '') ? 'Loading from cache · ' : 'Downloading ') + modelSentence(snap);
    $('modelNote').textContent = 'On this device. The browser may evict the cache. This is not finished until the line above says ready.';
    var pct = Math.max(0, Math.min(1, snap.progress || (report && report.progress) || 0));
    $('modelBar').style.width = Math.round(pct * 100) + '%';
    $('modelDetail').textContent = snap.detail || '';
  }

  var formToken = 0;
  var fillToken = 0;
  var refSeq = 0;
  var userTouched = false;

  function isImageName(name, mime) {
    if (mime && mime.indexOf('image/') === 0) return true;
    return /\.(png|jpe?g|webp|gif|bmp)$/i.test(name || '');
  }

  function withTimeout(promise, ms, message) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error(message)); }, ms);
      Promise.resolve(promise).then(function (value) {
        clearTimeout(timer);
        resolve(value);
      }, function (err) {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  async function setForm(bytes, name, mime) {
    var token = ++formToken;
    fillToken++;
    var image = isImageName(name, mime);
    function progress(msg) {
      if (token !== formToken) return;
      status(msg, true);
    }
    var read;
    try {
      read = await withTimeout(
        image ? FormFields.readImage(bytes, mime || 'image/jpeg', progress) : FormFields.read(bytes, progress),
        45000,
        'Reading the form took too long. Start over and choose it again.'
      );
    } catch (err) {
      if (token === formToken) formToken++;
      throw err;
    }
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

  function refById(id) {
    for (var i = 0; i < state.refs.length; i++) if (state.refs[i].id === id) return state.refs[i];
    return null;
  }

  function sameFile(a, b) {
    if (!a || !b || a.byteLength !== b.byteLength) return false;
    var step = Math.max(1, Math.floor(a.byteLength / 24));
    for (var i = 0; i < a.byteLength; i += step) if (a[i] !== b[i]) return false;
    return a[a.byteLength - 1] === b[b.byteLength - 1];
  }

  function renderRefs() {
    var list = $('refList');
    if (!list) return;
    list.textContent = '';
    if (!state.refs.length) {
      list.hidden = true;
      $('refLabel').textContent = 'Passport, letter, résumé, or a photo of an ID. One or many.';
      return;
    }
    list.hidden = false;
    $('refLabel').textContent = state.refs.length + (state.refs.length === 1 ? ' file' : ' files') + ' · add another or remove one';
    state.refs.forEach(function (ref) {
      var li = document.createElement('li');
      li.className = 'ref-row';
      var main = document.createElement('div');
      main.className = 'ref-main';
      var name = document.createElement('span');
      name.className = 'ref-name';
      name.textContent = ref.name || 'reference';
      var preview = document.createElement('span');
      preview.className = 'ref-preview';
      if (ref.status === 'reading') preview.textContent = 'Reading…';
      else if (ref.status === 'error') preview.textContent = 'Couldn’t read this file.';
      else if (!ref.preview) preview.textContent = 'No fields found in this file.';
      else preview.textContent = ref.preview;
      main.appendChild(name);
      main.appendChild(preview);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ref-x';
      btn.textContent = '×';
      btn.setAttribute('aria-label', 'Remove ' + (ref.name || 'reference'));
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        removeRef(ref.id);
      });
      li.appendChild(main);
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function rememberRef(ref) {
    var facts = window.FormFacts ? FormFacts.fromText(ref.text || '') : {};
    ref.preview = window.FormFacts && FormFacts.preview ? FormFacts.preview(facts) : '';
    ref.status = ref.preview ? 'ready' : 'empty';
  }

  async function extractOne(ref) {
    var id = ref.id;
    var text = '';
    var failed = false;
    try {
      var isPdf = ref.mime === 'application/pdf' || /\.pdf$/i.test(ref.name);
      text = isPdf ? await FormExtract.fromPdf(ref.bytes) : await FormExtract.imageText(ref.bytes, ref.mime || 'image/png');
    } catch (err) {
      failed = true;
    }
    var live = refById(id);
    if (!live) return;
    if (failed) {
      live.status = 'error';
      live.preview = '';
      live.text = '';
    } else {
      live.text = text || '';
      rememberRef(live);
    }
    renderRefs();
    scheduleSave();
  }

  function addRef(bytes, name, mime) {
    var label = name || 'reference';
    var dup = state.refs.some(function (ref) { return ref.name === label && sameFile(ref.bytes, bytes); });
    if (dup) {
      status(label + ' is already in the list.', false);
      return false;
    }
    var ref = {
      id: 'r' + (++refSeq),
      name: label,
      bytes: bytes,
      mime: mime || '',
      text: '',
      status: 'reading',
      preview: '',
      pending: null
    };
    state.refs.push(ref);
    state.proposals = [];
    ref.pending = extractOne(ref);
    refreshLabels();
    scheduleSave();
    return true;
  }

  function removeRef(id) {
    var ref = refById(id);
    if (!ref) return;
    fillToken++;
    state.refs = state.refs.filter(function (item) { return item.id !== id; });
    state.proposals = [];
    state.seeded = {};
    state.notes = '';
    var wasRunning = state.running;
    state.running = false;
    state.handedOff = false;
    $('skipModel').hidden = true;
    if (wasRunning) status('Removed ' + (ref.name || 'the file') + '. Fill again with the files that are left.', false);
    refreshLabels();
    scheduleSave();
  }

  async function corpus() {
    var ids = state.refs.map(function (ref) { return ref.id; });
    var parts = [];
    for (var i = 0; i < ids.length; i++) {
      var ref = refById(ids[i]);
      if (!ref) continue;
      if (ref.pending) {
        try { await ref.pending; } catch (err) {}
      }
      ref = refById(ids[i]);
      if (!ref || !ref.text || !String(ref.text).trim()) continue;
      parts.push(String(ref.text).trim());
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

  function plainLabel(field) {
    return String((field.group ? field.group + ': ' : '') + (field.label || field.id || 'field')).replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48);
  }

  async function askRest(fields, facts, corpusText) {
    if (!fields.length || !window.FormLLM || !FormLLM.completeJson) return {};
    var properties = {};
    fields.forEach(function (field) {
      properties[field.id] = { type: 'string', description: plainLabel(field) };
    });
    var prompt = [
      'Fill only these form fields from the identity facts and the excerpt.',
      'Reply with a JSON object whose keys are the field ids. Use an empty string when the excerpt does not contain the value.',
      'Never answer with SINGAPORE or REPUBLIC OF SINGAPORE unless that is the whole street or country the field asks for, and never invent a phone or email.',
      'Facts: ' + JSON.stringify(facts || {}),
      'Fields: ' + fields.map(function (field) { return field.id + ' = ' + plainLabel(field); }).join('; '),
      'Excerpt: ' + String(corpusText || '').slice(0, 900)
    ].join('\n');
    return await FormLLM.completeJson(prompt, { type: 'object', properties: properties }, 12000) || {};
  }

  function rowsFrom(seeded, guessed, notes) {
    return state.fields.map(function (field) {
      if (seeded && seeded[field.id]) return proposalFrom(field, seeded[field.id], 'facts');
      var raw = guessed && guessed[field.id] != null ? String(guessed[field.id]) : '';
      var row = proposalFrom(field, raw, 'model');
      if (row.value && notes && !bestSupported(row.value, notes)) row.value = '';
      return row;
    });
  }

  async function fillFromPapers() {
    if (state.running) return;
    if (!state.formBytes || !state.fields.length) return;
    var token = ++fillToken;
    var seenForm = formToken;
    state.handedOff = false;
    function current() { return token === fillToken && seenForm === formToken && !state.handedOff; }
    if (!state.refs.length) {
      state.modelNote = '';
      paintModel();
      state.proposals = state.fields.map(blankRow);
      if (!current()) return;
      state.handedOff = true;
      await openEditor(false);
      return;
    }
    state.running = true;
    refreshLabels();
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    } catch (err) {}
    try {
      status('Reading the papers…', true);
      var notesAll = await corpus();
      if (!current()) return;
      if (!notesAll.trim()) throw new Error('The references had no readable text.');
      var facts = window.FormFacts ? FormFacts.fromText(notesAll) : {};
      var seeded = window.FormFacts ? FormFacts.mapFactsToFields(facts, state.fields) : {};
      state.seeded = seeded;
      state.notes = notesAll;
      var rest = state.fields.filter(function (field) {
        return !seeded[field.id] && field.type !== 'radio' && field.type !== 'checkbox';
      });
      var ask = window.FormFacts && FormFacts.modelFields ? FormFacts.modelFields(rest, notesAll) : [];
      var guessed = {};
      var gpuOk = state.gpu && state.gpu.ok;
      if (!ask.length) {
        state.modelNote = 'skipped';
        paintModel();
      } else if (!gpuOk) {
        state.modelNote = '';
        showGpu(state.gpu || { ok: false });
        paintModel();
      } else {
        state.modelNote = '';
        status('Checking ' + ask.length + ' field' + (ask.length === 1 ? '' : 's') + ' the papers might contain…', true);
        $('skipModel').hidden = false;
        showProgress({ progress: 0 });
        try {
          await withTimeout(FormLLM.ensure(showProgress), 12000, 'The private model did not start.');
          if (!current()) return;
          $('modelBox').hidden = true;
          paintModel();
          guessed = await withTimeout(askRest(ask, facts, notesAll), 13000, 'The private model did not answer.') || {};
        } catch (err) {
          guessed = {};
          if (err && err.code === 'webgpu') showGpu({ ok: false });
          else if (window.FormLLM && FormLLM.markFailed && FormLLM.snapshot().phase !== 'ready') FormLLM.markFailed(err && err.message);
          paintModel();
          status('The model did not answer in time. Opening the fields already read from the papers.', true);
        }
        $('skipModel').hidden = true;
        $('modelBox').hidden = true;
        if (!current()) return;
      }
      if (!current()) return;
      state.handedOff = true;
      $('skipModel').hidden = true;
      state.proposals = rowsFrom(seeded, guessed, notesAll);
      await openEditor(false);
    } catch (err) {
      if (!current()) return;
      state.running = false;
      $('skipModel').hidden = true;
      refreshLabels();
      var msg = err && err.message ? err.message : 'The form could not be filled.';
      $('failText').textContent = msg;
      $('failBox').hidden = false;
      status(msg, false);
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
    await DeskDB.putAll(EDITOR_DB, [
      { key: 'pdf', value: bytes },
      { key: 'session', value: { fileName: fileName, zoom: 1, current: 0, pages: pages, epoch: Date.now(), source: 'forms' } }
    ]);
    try { if (window.ToolsUsage) await ToolsUsage.recordUse('forms-filler'); } catch (err) {}
    state.running = false;
    refreshLabels();
    location.href = '../pdf-editor/?desk=forms';
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
      refs: state.refs.map(function (ref) {
        return { id: ref.id, name: ref.name, bytes: ref.bytes, mime: ref.mime, text: ref.text || '' };
      })
    }).catch(function () {});
  }

  function snapshotFiles(input) {
    var files = [];
    if (input.files) for (var i = 0; i < input.files.length; i++) files.push(input.files[i]);
    return files;
  }

  function takeFiles(files, kind, input) {
    return (async function () {
      userTouched = true;
      if (!files.length) {
        toast('No file was selected.');
        status('No file was selected.', false);
        if (input) input.value = '';
        return;
      }
      var loaded = [];
      for (var n = 0; n < files.length; n++) {
        var file = files[n];
        status('Reading ' + file.name + '…', true);
        var buf = await withTimeout(
          file.arrayBuffer(),
          15000,
          'Could not read ' + (file.name || 'that file') + '. Choose it again.'
        );
        loaded.push({ name: file.name, type: file.type || '', bytes: new Uint8Array(buf) });
      }
      if (input) input.value = '';
      var added = 0;
      for (var i = 0; i < loaded.length; i++) {
        var item = loaded[i];
        if (kind === 'form') {
          var applied = await setForm(item.bytes, item.name, item.type);
          if (!applied) return;
        } else if (addRef(item.bytes, item.name, item.type)) added++;
      }
      if (kind === 'form') status('Form ready.', false);
      else if (added) status(added + ' reference file' + (added === 1 ? '' : 's') + ' added.', false);
    })().catch(function (err) {
      if (input) input.value = '';
      state.running = false;
      $('formDrop').disabled = false;
      $('refDrop').disabled = false;
      var msg = err && err.message ? err.message : 'That file could not be opened.';
      toast(msg);
      status(msg, false);
      refreshLabels();
    });
  }

  function resetDesk() {
    formToken++;
    fillToken++;
    userTouched = true;
    state.modelNote = '';
    state.handedOff = false;
    state.seeded = {};
    state.notes = '';
    $('skipModel').hidden = true;
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
    paintModel();
    status('', false);
  }

  $('formDrop').addEventListener('click', function () { $('formInput').click(); });
  $('refDrop').addEventListener('click', function () { $('refInput').click(); });
  $('formInput').addEventListener('change', function () {
    takeFiles(snapshotFiles($('formInput')), 'form', $('formInput'));
  });
  $('refInput').addEventListener('change', function () {
    takeFiles(snapshotFiles($('refInput')), 'ref', $('refInput'));
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
    fillFromPapers().catch(function (err) {
      state.running = false;
      refreshLabels();
      status(err && err.message ? err.message : 'The form could not be opened.', false);
    });
  });
  $('retryFill').addEventListener('click', function () {
    $('failBox').hidden = true;
    fillFromPapers();
  });
  $('openBlank').addEventListener('click', function () {
    openEditor(true).catch(function (err) { toast(err.message || 'Could not open the editor.'); });
  });
  $('skipModel').addEventListener('click', function () {
    if (!state.running || state.handedOff) return;
    fillToken++;
    state.handedOff = true;
    state.running = false;
    $('skipModel').hidden = true;
    $('modelBox').hidden = true;
    state.proposals = rowsFrom(state.seeded || {}, {}, state.notes || '');
    openEditor(false).catch(function (err) {
      state.handedOff = false;
      status(err && err.message ? err.message : 'The form could not be opened.', false);
    });
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
    forceGpu: function (on) {
      showGpu(on ? { ok: true, f16: true, model: FormLLM.models.f16 } : { ok: false, reason: 'test' });
    },
    paintTest: function (partial) {
      if (partial && Object.prototype.hasOwnProperty.call(partial, 'note')) state.modelNote = partial.note || '';
      if (window.FormLLM) FormLLM.applyTestState(partial || {});
      paintModel();
      showProgress(FormLLM.snapshot());
      return {
        text: $('modelState').textContent,
        title: $('modelBox').hidden ? '' : $('modelTitle').textContent,
        boxHidden: $('modelBox').hidden
      };
    },
    refs: function () {
      return state.refs.map(function (ref) {
        return { name: ref.name, status: ref.status, preview: ref.preview };
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
    if (userTouched || !draft || (!draft.formBytes && !(draft.refs && draft.refs.length))) return;
    try {
      if (draft.formBytes) {
        status('Opening the saved form…', true);
        var applied = await setForm(draft.formBytes, draft.formName);
        if (!applied || userTouched) return;
      }
      if (userTouched) return;
      state.refs = (draft.refs || []).map(function (ref) {
        var item = {
          id: ref.id || ('d' + (++refSeq)),
          name: ref.name || 'reference',
          bytes: ref.bytes,
          mime: ref.mime || '',
          text: ref.text || '',
          status: 'reading',
          preview: '',
          pending: null
        };
        if (item.text) rememberRef(item);
        return item;
      });
      state.refs.forEach(function (ref) {
        if (ref.status === 'reading' && ref.bytes) ref.pending = extractOne(ref);
      });
      refreshLabels();
      paintModel();
      status(draft.formBytes ? 'Form ready.' : '', false);
    } catch (err) {
      if (userTouched) return;
      status(err && err.message ? err.message : 'The saved form could not be opened.', false);
    }
  }).catch(function () {});
})();
