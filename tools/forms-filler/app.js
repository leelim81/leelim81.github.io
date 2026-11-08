/* Two uploads, a local model, then the existing editor. */
(function () {
  var DB = 'tools-forms-filler';
  var EDITOR_DB = 'tools-forms-editor';
  var state = {
    gpu: null,
    formBytes: null,
    sourceBytes: null,
    sourceName: '',
    sourceMime: '',
    formName: '',
    fields: [],
    kind: '',
    refs: [],
    proposals: [],
    running: false,
    modelNote: '',
    handedOff: false,
    seeded: {},
    notes: '',
    placementBlocked: ''
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
    var ready = !!(state.formBytes && !state.running && ((state.fields.length && (flat || state.refs.length)) || state.placementBlocked));
    $('fillBtn').disabled = !ready;
    $('fillBtn').textContent = state.placementBlocked || (flat && state.fields.length && !state.refs.length) ? 'Open in the editor' : 'Fill from the papers';
    if ($('placeMissing')) $('placeMissing').disabled = !(state.sourceBytes || state.formBytes);
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
  var takeToken = 0;
  var fillToken = 0;
  var refSeq = 0;
  var userTouched = false;

  function imageSentence(frame) {
    if (!frame || !frame.sourceW || !frame.sourceH) return '';
    var reduced = frame.sourceW !== frame.inW || frame.sourceH !== frame.inH;
    var turned = Math.abs(frame.angle || 0) >= 0.05;
    if (!reduced && !turned) return '';
    var text = 'The photo is ' + frame.sourceW + '×' + frame.sourceH;
    if (reduced) text += ' and was reduced to ' + frame.inW + '×' + frame.inH;
    if (turned) text += ' before a small straighten';
    return text + '. The sheet is that image.';
  }

  function retireForm() {
    state.formBytes = null;
    state.formName = '';
    state.fields = [];
    state.sourceBytes = null;
    state.sourceName = '';
    state.sourceMime = '';
    state.placementBlocked = '';
    state.scanReview = null;
    state.imageFrame = null;
    state.imageNote = '';
    state.kind = '';
    state.proposals = [];
    if ($('scanReview')) $('scanReview').hidden = true;
    refreshLabels();
  }

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
    retireForm();
    var image = isImageName(name, mime);
    function alive() { return token === formToken; }
    function progress(msg) {
      if (!alive()) return;
      status(msg, true);
    }
    var read;
    try {
      read = await withTimeout(
        image ? FormFields.readImage(bytes, mime || 'image/jpeg', progress, alive) : FormFields.read(bytes, progress),
        45000,
        'Reading the form took too long. Start over and choose it again.'
      );
    } catch (err) {
      if (token === formToken) formToken++;
      throw err;
    }
    if (!alive() || !read) return false;
    state.sourceBytes = bytes;
    state.sourceName = name || '';
    state.sourceMime = mime || '';
    state.formBytes = read.bytes || bytes;
    state.formName = image ? String(name || 'form').replace(/\.[^.]+$/, '') + '.pdf' : (name || 'form.pdf');
    state.proposals = [];
    state.fields = read.fields;
    state.kind = read.kind;
    state.placementBlocked = read.placementBlock || '';
    state.scanReview = read.reviewTransport || null;
    state.imageFrame = image ? (read.frame || null) : null;
    state.imageNote = imageSentence(state.imageFrame);
    paintScanReview();
    refreshLabels();
    var kept = await persistDraft();
    if (!alive()) return false;
    if (!kept.ok) {
      state.draftError = 'This form is open in this tab, but the browser could not store it. Back or reload will not bring it back.';
      status(state.draftError, false);
      toast('The form could not be stored in this browser.');
      return true;
    }
    state.draftError = '';
    state.deskewDeg = read.deskewDeg || 0;
    paintDeskStatus();
    if (state.placementBlocked) toast(state.placementBlocked);
    return true;
  }

  function paintDeskStatus() {
    if (state.draftError) {
      status(state.draftError, false);
      return;
    }
    if (!state.formBytes && !state.sourceBytes) {
      status('', false);
      return;
    }
    var tail = state.imageNote ? ' ' + state.imageNote : '';
    if (state.placementBlocked) {
      status(state.placementBlocked + tail, false);
    } else if ((state.fields || []).some(function (field) { return field.transport === 'viewport-review'; })) {
      status(state.fields.length + ' scan estimates. Nothing is written until you check a value.' + tail, false);
    } else if (!(state.fields || []).length) {
      var tilt = state.deskewDeg ? ' The lines are tilted, and the page was not replaced with a turned picture.' : '';
      status('No lines were found. Use Place a missing line to put a value where you want it. Nothing was written.' + tail + tilt, false);
    } else {
      status('Form ready.' + tail, false);
    }
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
      var spatial = window.FormExtract && FormExtract.spatial
        ? await FormExtract.spatial(ref.bytes, isPdf ? 'application/pdf' : (ref.mime || 'image/png'))
        : { text: '', channel: 'text-layer' };
      text = spatial.text || '';
      ref.channel = spatial.channel || 'text-layer';
      ref.words = spatial.words || [];
      ref.transform = spatial.transform || null;
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
    return await FormLLM.completeJson(prompt, { type: 'object', properties: properties, additionalProperties: false, required: Object.keys(properties) }, 12000) || {};
  }

  function rowsFrom(seeded, guessed, notes) {
    return state.fields.map(function (field) {
      if (seeded && seeded[field.id]) return proposalFrom(field, seeded[field.id], 'facts');
      var incoming = guessed && Object.prototype.hasOwnProperty.call(guessed, field.id) ? guessed[field.id] : '';
      var raw = window.FormFacts && FormFacts.modelScalar ? FormFacts.modelScalar(incoming) : (incoming == null ? '' : String(incoming));
      if (window.FormFacts && FormFacts.evidenceField && FormFacts.evidenceField(field)) {
        raw = FormFacts.prepareModelValue(field, incoming, notes);
      } else if (raw && notes) {
        raw = bestSupported(raw, notes) || '';
        if (raw && window.FormFacts && FormFacts.allowModelValue && !FormFacts.allowModelValue(field, raw, notes)) raw = '';
      }
      return proposalFrom(field, raw, 'model');
    });
  }

  function confirmReviews(reviews) {
    var box = $('reviewBox');
    var list = $('reviewList');
    list.textContent = '';
    $('reviewLead').textContent = reviews.length + ' value' + (reviews.length === 1 ? ' is' : 's are') + ' not written until you check ' + (reviews.length === 1 ? 'it' : 'them') + '.';
    reviews.forEach(function (row) {
      var li = document.createElement('li');
      var label = document.createElement('label');
      var boxIn = document.createElement('input');
      boxIn.type = 'checkbox';
      boxIn.value = row.fieldId;
      var field = null;
      for (var i = 0; i < state.fields.length; i++) if (state.fields[i].id === row.fieldId) field = state.fields[i];
      var text = document.createElement('span');
      var person = row.candidates && row.candidates[0] ? row.candidates[0].role : '';
      if (field && field.transport === 'viewport-review') {
        li.className = 'scan-estimate';
        text.textContent = 'Value not confirmed: ' + (row.kind || 'field') + ' ' + row.value;
        label.appendChild(boxIn);
        label.appendChild(text);
        li.appendChild(label);
        function note(copy) {
          var span = document.createElement('span');
          span.className = 'review-quote';
          span.textContent = copy;
          li.appendChild(span);
        }
        note('Person on the paper: ' + (person || 'not named') + '. Not confirmed until you check this.');
        note('Label binding: ' + (field.label || 'unlabeled') + ' as ' + (row.kind || 'unknown') + '.');
        note('Location: scan estimate on page ' + ((field.page || 0) + 1) + '. Unchecked lines are not written.');
        if (row.quote) note('Source: ' + row.quote);
        list.appendChild(li);
        return;
      } else {
        text.textContent = (row.kind || 'field') + ': ' + row.value;
        var quote = document.createElement('span');
        quote.className = 'review-quote';
        quote.textContent = row.quote ? ' Source: ' + row.quote : '';
        label.appendChild(boxIn);
        label.appendChild(text);
        label.appendChild(quote);
      }
      li.appendChild(label);
      list.appendChild(li);
    });
    box.hidden = false;
    return new Promise(function (resolve) {
      function finish(useChecked) {
        var ids = [];
        if (useChecked) {
          list.querySelectorAll('input:checked').forEach(function (input) { ids.push(input.value); });
        }
        $('reviewUse').removeEventListener('click', onUse);
        $('reviewSkip').removeEventListener('click', onSkip);
        resolve(ids);
      }
      function onUse() { finish(true); }
      function onSkip() { finish(false); }
      $('reviewUse').addEventListener('click', onUse);
      $('reviewSkip').addEventListener('click', onSkip);
    });
  }

  function pdfBytesForEditor() {
    var source = state.sourceBytes;
    var form = state.formBytes;
    if (source && source.length > 4 && source[0] === 0x25 && source[1] === 0x50 && source[2] === 0x44 && source[3] === 0x46) return source;
    return form || source;
  }

  async function sourceIdentity() {
    var source = state.sourceBytes;
    if (!source || source.length < 4) return '';
    if (source[0] === 0x25 && source[1] === 0x50 && source[2] === 0x44 && source[3] === 0x46) return '';
    var digest = await crypto.subtle.digest('SHA-256', source);
    var bytes = new Uint8Array(digest);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return hex;
  }

  var openingEditor = false;

  function sha256Hex(bytes) {
    return crypto.subtle.digest('SHA-256', bytes).then(function (digest) {
      var view = new Uint8Array(digest);
      var hex = '';
      for (var i = 0; i < view.length; i++) hex += (view[i] < 16 ? '0' : '') + view[i].toString(16);
      return hex;
    });
  }

  function editorClearedAt() {
    try { return Number(localStorage.getItem('ff-editor-cleared') || 0); } catch (err) { return 0; }
  }

  function readHandoff() {
    try {
      var raw = sessionStorage.getItem('ff-editor-handoff');
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.pages || !parsed.pages.length) return null;
      if ((parsed.editedAt || 0) <= editorClearedAt()) return null;
      return parsed;
    } catch (err) { return null; }
  }

  function sameEditorFile(stored, pdfSha, sourceSha, sheet) {
    if (!stored || !stored.pages || !stored.pages.length) return false;
    if ((stored.editedAt || 0) <= editorClearedAt()) return false;
    if (sourceSha) {
      if (stored.sourceSha256 !== sourceSha || !stored.sheet || !sheet || !window.FormMaps) return false;
      return FormMaps.matchesSheet(stored.sheet, sheet);
    }
    return !!(pdfSha && stored.pdfSha256 === pdfSha);
  }

  async function currentResumePerson() {
    var pick = $('profilePick');
    if (pick && pick.value) return pick.value;
    if (!window.FormProfiles) return '';
    try {
      var loaded = await FormProfiles.load();
      if (loaded.ok && loaded.vault && loaded.vault.profiles && loaded.vault.profiles.length === 1) return loaded.vault.profiles[0].id;
    } catch (err) {}
    return '';
  }

  function resumePages(stored, pageCount, personId) {
    if (!stored || !stored.pages || stored.pages.length !== pageCount) return null;
    for (var i = 0; i < pageCount; i++) {
      if (!stored.pages[i] || stored.pages[i].srcIndex !== i) return null;
    }
    var storedPerson = stored.resumeProfileId || '';
    var changed = !!(personId && storedPerson && personId !== storedPerson);
    var keepPerson = changed ? personId : (personId || storedPerson);
    var dropped = 0;
    var kept = 0;
    var pages = stored.pages.map(function (page) {
      var annotations = (page.annotations || []).filter(function (ann) {
        if (!ann) return false;
        if (!ann.profileId) {
          if (changed) { dropped += 1; return false; }
          kept += 1;
          return true;
        }
        if (keepPerson && ann.profileId === keepPerson) { kept += 1; return true; }
        dropped += 1;
        return false;
      });
      return {
        id: page.id || Math.random().toString(36).slice(2, 10),
        srcIndex: page.srcIndex,
        rotation: page.rotation || 0,
        annotations: annotations
      };
    });
    return { pages: pages, dropped: dropped, kept: kept, changed: changed };
  }

  async function openRecovery() {
    if (openingEditor) return;
    var bytes = pdfBytesForEditor();
    if (!bytes) {
      toast('Choose a form first.');
      return;
    }
    openingEditor = true;
    if ($('placeMissing')) $('placeMissing').disabled = true;
    status('Opening the editor so you can place a saved value…', true);
    var probe;
    try {
      probe = await PDFLib.PDFDocument.load(bytes.slice(0));
    } catch (err) {
      openingEditor = false;
      if ($('placeMissing')) $('placeMissing').disabled = false;
      status('That file could not be opened for placement. Nothing was written.', false);
      toast('That file could not be opened for placement.');
      return;
    }
    var pages = [];
    for (var i = 0; i < probe.getPageCount(); i++) {
      pages.push({ id: Math.random().toString(36).slice(2, 10), srcIndex: i, rotation: 0, annotations: [] });
    }
    var kept = await persistDraft();
    if (!kept.ok || kept.skipped) {
      openingEditor = false;
      if ($('placeMissing')) $('placeMissing').disabled = !(state.sourceBytes || state.formBytes);
      status(kept.ok ? 'The form was cleared before it could be opened.' : 'This browser could not store the form, so the editor was not opened. Nothing was written.', false);
      toast('The editor was not opened.');
      return;
    }
    var pdfSha = '';
    var sourceSha = '';
    try {
      pdfSha = await sha256Hex(bytes);
      sourceSha = await sourceIdentity();
    } catch (err) {
      openingEditor = false;
      if ($('placeMissing')) $('placeMissing').disabled = !(state.sourceBytes || state.formBytes);
      status('This browser could not store the form, so the editor was not opened. Nothing was written.', false);
      toast('The editor was not opened.');
      return;
    }
    var sheet = sheetStamp();
    var personId = await currentResumePerson();
    var stored = null;
    var storedPdf = null;
    try {
      stored = await DeskDB.get(EDITOR_DB, 'session');
      storedPdf = await DeskDB.get(EDITOR_DB, 'pdf');
    } catch (err) { stored = null; }
    if (stored && !stored.pdfSha256 && storedPdf) {
      try { stored.pdfSha256 = await sha256Hex(storedPdf instanceof Uint8Array ? storedPdf : new Uint8Array(storedPdf)); } catch (err) {}
    }
    var handoff = readHandoff();
    var best = null;
    [stored, handoff].forEach(function (candidate) {
      if (!sameEditorFile(candidate, pdfSha, sourceSha, sheet)) return;
      if (!best || (candidate.editedAt || 0) >= (best.editedAt || 0)) best = candidate;
    });
    var resumed = best ? resumePages(best, pages.length, personId) : null;
    var note = '';
    if (best && !resumed) note = 'The page list changed, so earlier marks were not brought back.';
    else if (!best && (stored || handoff || storedPdf)) note = 'This file or crop changed, so earlier marks were not brought back.';
    else if (resumed && resumed.changed && resumed.dropped) note = 'Returned to this file. The other person’s marks were left off.';
    else if (resumed && resumed.kept) note = 'Returned to the same page and the same marks.';
    if (resumed) pages = resumed.pages;
    var resumePerson = personId || '';
    if (best && (!resumed || !resumed.changed) && !resumePerson) resumePerson = best.resumeProfileId || '';
    var session = {
      fileName: state.formName || 'form.pdf',
      zoom: 1,
      fit: true,
      current: 0,
      pages: pages,
      epoch: Date.now(),
      source: 'forms',
      recover: true,
      sourceSha256: sourceSha,
      pdfSha256: pdfSha,
      sheet: sheet,
      resumeProfileId: resumePerson,
      editedAt: Date.now(),
      resumeNote: note
    };
    try {
      await DeskDB.putAll(EDITOR_DB, [
        { key: 'pdf', value: bytes },
        { key: 'session', value: session }
      ]);
    } catch (err) {
      openingEditor = false;
      if ($('placeMissing')) $('placeMissing').disabled = !(state.sourceBytes || state.formBytes);
      status('This browser could not store the form, so the editor was not opened. Nothing was written.', false);
      toast('The editor was not opened.');
      return;
    }
    location.href = '../pdf-editor/?desk=forms';
  }

  async function fillFromPapers() {
    if (state.running) return;
    if (!state.formBytes || (!state.fields.length && !state.placementBlocked)) return;
    if (state.placementBlocked && !state.fields.length) {
      state.handedOff = true;
      await openEditor(true);
      return;
    }
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
      state.notes = notesAll;
      state.modelNote = 'skipped';
      paintModel();
      var frozen = window.FormThresholds || { autofill: {} };
      var channel = state.refs.some(function (ref) { return ref.channel === 'ocr'; }) ? 'ocr' : 'text-layer';
      var decisions = window.FormSelect ? FormSelect.decideAll(state.fields, notesAll, frozen, { channel: channel }) : [];
      decisions.forEach(function (row) {
        var field = null;
        for (var i = 0; i < state.fields.length; i++) if (state.fields[i].id === row.fieldId) field = state.fields[i];
        if (field && field.transport === 'viewport-review' && row.decision === 'autofill') {
          row.decision = 'review';
          row.reason = 'scan_location_unconfirmed';
        }
      });
      function proposalsFrom(confirmed) {
        var allow = {};
        (confirmed || []).forEach(function (id) { allow[id] = true; });
        return state.fields.map(function (field) {
          var decision = null;
          for (var i = 0; i < decisions.length; i++) if (decisions[i].fieldId === field.id) decision = decisions[i];
          var use = decision && (decision.decision === 'autofill' || (decision.decision === 'review' && allow[field.id]));
          var row = proposalFrom(field, use ? decision.value : '', 'facts');
          row.quote = decision && use ? (decision.quote || '') : '';
          row.reason = decision ? decision.reason : '';
          return row;
        });
      }
      if (window.FormProfiles && window.FormEvidence) {
        try {
          var loaded = await FormProfiles.load();
          if (loaded.ok) {
            var ingested = FormProfiles.ingest(loaded.vault, FormEvidence.extract(notesAll));
            state.profileId = ingested.profileId || '';
            var stored = await FormProfiles.persist(ingested.vault);
            if (!stored.ok && $('profileMsg')) $('profileMsg').textContent = stored.reason === 'quota' ? 'This browser has no room to store more values.' : 'This browser blocked local storage. Nothing was saved.';
            if (window.FormProfileUI) FormProfileUI.paint();
          }
        } catch (err) {}
      }
      var reviews = decisions.filter(function (row) { return row.decision === 'review' && row.value; });
      var confirmed = [];
      if (reviews.length && $('reviewBox')) {
        confirmed = await confirmReviews(reviews);
        if (!current()) return;
        if (confirmed.length && state.profileId && window.FormProfiles) {
          try {
            var live = await FormProfiles.load();
            if (live.ok) {
              var next = live.vault;
              confirmed.forEach(function (fieldId) {
                var row = null;
                for (var r = 0; r < reviews.length; r++) if (reviews[r].fieldId === fieldId) row = reviews[r];
                if (!row) return;
                var saved = FormProfiles.confirmFact(next, state.profileId, row.kind, row.value);
                if (saved.ok) next = saved.vault;
              });
              await FormProfiles.persist(next);
              if (window.FormProfileUI) FormProfileUI.paint();
            }
          } catch (err) {}
        }
      }
      if (!current()) return;
      state.handedOff = true;
      $('skipModel').hidden = true;
      if ($('reviewBox')) $('reviewBox').hidden = true;
      state.proposals = proposalsFrom(confirmed);
      var automatic = decisions.filter(function (row) { return row.decision === 'autofill'; }).length;
      status('Wrote ' + automatic + ' automatic value' + (automatic === 1 ? '' : 's') + '. ' + reviews.length + ' stayed for review.', false);
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

  function paintScanReview() {
    var box = $('scanReview');
    if (!box) return;
    var list = $('scanReviewList');
    var fields = (state.fields || []).filter(function (field) { return field.transport === 'viewport-review'; });
    if (!fields.length || state.placementBlocked) {
      box.hidden = true;
      if (list) list.textContent = '';
      return;
    }
    box.hidden = false;
    $('scanReviewLead').textContent = 'These spots come from the scan. The value and the person are not chosen. Nothing is written until you check a review. A line on the wrong label is not a match.';
    list.textContent = '';
    fields.forEach(function (field) {
      var kind = window.FormEvidence ? FormEvidence.fieldKind(field) : '';
      var li = document.createElement('li');
      li.className = 'scan-estimate';
      function line(text) {
        var span = document.createElement('span');
        span.className = 'review-quote';
        span.textContent = text;
        li.appendChild(span);
      }
      line('Label read: ' + (field.label || 'unlabeled'));
      line('Binding: ' + (kind && kind !== 'other' ? kind : 'not a known field') + '.');
      line('Location: scan estimate on page ' + ((field.page || 0) + 1) + '. Not a form widget.');
      line('Value: not chosen. Person: not confirmed.');
      list.appendChild(li);
    });
  }

  function reviewNote(fields) {
    var labels = window.FormFacts && FormFacts.reviewLabels ? FormFacts.reviewLabels(fields) : [];
    if (!labels.length) return '';
    return 'Left ' + labels.length + ' uncertain line' + (labels.length === 1 ? '' : 's') + ' blank.';
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
    if (window.FormEvidence) {
      state.fields.forEach(function (field) {
        field.factKey = FormEvidence.fieldKind(field);
        field.profileId = state.profileId || '';
      });
    }
    var carried = state.fields.filter(function (field) {
      if (field.transport !== 'viewport-review') return true;
      var row = null;
      for (var r = 0; r < state.proposals.length; r++) if (state.proposals[r].id === field.id) row = state.proposals[r];
      return !!(row && row.value);
    });
    var boxes = state.kind === 'flat' && window.FormSpots ? FormSpots.annotations(carried, values) : {};
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
    var kept = await persistDraft();
    if (!kept.ok || kept.skipped) {
      status(kept.ok ? 'The form was cleared before it could be opened.' : 'This browser could not store the form, so the editor was not opened. Nothing was written.', false);
      toast('The editor was not opened.');
      state.running = false;
      refreshLabels();
      return;
    }
    var editorSession;
    try {
      editorSession = { fileName: fileName, zoom: 1, fit: true, current: 0, pages: pages, epoch: Date.now(), source: 'forms', reviewNote: reviewNote(state.fields), sourceSha256: await sourceIdentity(), pdfSha256: await sha256Hex(bytes), sheet: sheetStamp(), editedAt: Date.now() };
      await DeskDB.putAll(EDITOR_DB, [
        { key: 'pdf', value: bytes },
        { key: 'session', value: editorSession }
      ]);
    } catch (err) {
      status('This browser could not store the form, so the editor was not opened. Nothing was written.', false);
      toast('The editor was not opened.');
      state.running = false;
      refreshLabels();
      return;
    }
    try { if (window.ToolsUsage) await ToolsUsage.recordUse('forms-filler'); } catch (err) {}
    state.running = false;
    refreshLabels();
    location.href = '../pdf-editor/?desk=forms';
  }

  var saveTimer = 0;
  var draftEpoch = 0;
  var draftTail = Promise.resolve();

  function isPdfBytes(bytes) {
    return !!(bytes && bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);
  }

  function draftReason(err) {
    var name = err && (err.name || err.code);
    if (name === 'QuotaExceededError' || name === 22) return 'quota';
    if (name === 'SecurityError' || name === 'InvalidStateError') return 'blocked';
    return 'unavailable';
  }

  function enqueueDraft(work) {
    var run = draftTail.then(work, work);
    draftTail = run.then(function () {}, function () {});
    return run;
  }

  function draftSnapshot() {
    var image = state.sourceBytes && !isPdfBytes(state.sourceBytes);
    var hasForm = image ? state.sourceBytes : state.formBytes;
    if (!hasForm && !(state.refs && state.refs.length)) return null;
    return {
      formName: state.formName,
      formBytes: state.formBytes,
      sourceName: state.sourceName || state.formName,
      sourceMime: state.sourceMime || '',
      sourceBytes: image ? state.sourceBytes : null,
      kind: state.kind,
      fields: state.fields || [],
      placementBlocked: state.placementBlocked || '',
      imageFrame: state.imageFrame || null,
      imageNote: state.imageNote || '',
      deskewDeg: state.deskewDeg || 0,
      refs: state.refs.map(function (ref) {
        return { id: ref.id, name: ref.name, bytes: ref.bytes, mime: ref.mime, text: ref.text || '' };
      })
    };
  }

  function persistDraft() {
    var epoch = draftEpoch;
    return enqueueDraft(function () {
      if (epoch !== draftEpoch) return { ok: true, skipped: true };
      var snap = draftSnapshot();
      if (!snap) return DeskDB.clear(DB).then(function () { return { ok: true }; });
      return DeskDB.set(DB, 'draft', snap).then(function () { return { ok: true }; });
    }).catch(function (err) {
      return { ok: false, reason: draftReason(err) };
    });
  }

  function discardDraft() {
    draftEpoch++;
    clearTimeout(saveTimer);
    return enqueueDraft(function () {
      return DeskDB.clear(DB).then(function () { return { ok: true }; });
    }).catch(function (err) {
      return { ok: false, reason: draftReason(err) };
    });
  }
  function discardEditor() {
    var clearedAt = Date.now();
    try { localStorage.setItem('ff-editor-cleared', String(clearedAt)); } catch (err) {}
    try { sessionStorage.removeItem('ff-editor-handoff'); } catch (err) {}
    return DeskDB.clear(EDITOR_DB).then(function () { return { ok: true }; }).catch(function (err) {
      return { ok: false, reason: draftReason(err) };
    });
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { persistDraft(); }, 300);
  }

  function sheetStamp() {
    var frame = state.imageFrame;
    if (!frame || !frame.crop || !window.FormMaps) return null;
    return {
      version: FormMaps.SHEET_VERSION,
      sourceW: frame.sourceW,
      sourceH: frame.sourceH,
      inW: frame.inW,
      inH: frame.inH,
      angle: frame.angle || 0,
      cropX: frame.crop.x,
      cropY: frame.crop.y,
      cropW: frame.crop.w,
      cropH: frame.crop.h,
      outW: frame.outW,
      outH: frame.outH
    };
  }

  function snapshotFiles(input) {
    var files = [];
    if (input.files) for (var i = 0; i < input.files.length; i++) files.push(input.files[i]);
    return files;
  }

  function takeFiles(files, kind, input) {
    var mine = ++takeToken;
    return (async function () {
      userTouched = true;
      if (!files.length) {
        if (mine !== takeToken) return;
        toast('No file was selected.');
        status('No file was selected.', false);
        if (input) input.value = '';
        return;
      }
      var loaded = [];
      for (var n = 0; n < files.length; n++) {
        if (mine !== takeToken) return;
        var file = files[n];
        status('Reading ' + file.name + '…', true);
        var buf = await withTimeout(
          file.arrayBuffer(),
          15000,
          'Could not read ' + (file.name || 'that file') + '. Choose it again.'
        );
        if (mine !== takeToken) return;
        loaded.push({ name: file.name, type: file.type || '', bytes: new Uint8Array(buf) });
      }
      if (input) input.value = '';
      var added = 0;
      for (var i = 0; i < loaded.length; i++) {
        if (mine !== takeToken) return;
        var item = loaded[i];
        if (kind === 'form') {
          await discardDraft();
          if (mine !== takeToken) return;
          var applied = await setForm(item.bytes, item.name, item.type);
          if (!applied || mine !== takeToken) return;
        } else if (addRef(item.bytes, item.name, item.type)) added++;
      }
      if (mine !== takeToken) return;
      if (state.draftError) {
        status(state.draftError, false);
      } else if (kind === 'form' && !state.placementBlocked && state.fields.length && !(state.fields || []).some(function (field) { return field.transport === 'viewport-review'; })) {
        status('Form ready.' + (state.imageNote ? ' ' + state.imageNote : ''), false);
      } else if (added) status(added + ' reference file' + (added === 1 ? '' : 's') + ' added.', false);
    })().catch(function (err) {
      if (mine !== takeToken) return;
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
    takeToken++;
    fillToken++;
    clearTimeout(saveTimer);
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
    state.sourceBytes = null;
    state.sourceName = '';
    state.sourceMime = '';
    state.placementBlocked = '';
    state.scanReview = null;
    if ($('scanReview')) $('scanReview').hidden = true;
    state.kind = '';
    state.imageFrame = null;
    state.imageNote = '';
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
  if ($('placeMissing')) $('placeMissing').addEventListener('click', function () { openRecovery(); });
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
    status('Clearing the stored form…', true);
    Promise.all([discardDraft(), discardEditor()]).then(function (results) {
      if (results.some(function (result) { return result && !result.ok; })) status('Start over could not finish clearing the stored form.', false);
      else status('Started over. Nothing is stored from that form.', false);
    });
  });
  window.addEventListener('pagehide', function () {
    clearTimeout(saveTimer);
    persistDraft();
  });
  window.addEventListener('pageshow', function (event) {
    state.running = false;
    $('formDrop').disabled = false;
    $('refDrop').disabled = false;
    refreshLabels();
    if (event.persisted) paintDeskStatus();
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
    imageFrame: function () { return state.imageFrame || null; },
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
      if (draft.formBytes && (draft.imageFrame || draft.kind || (draft.fields && draft.fields.length))) {
        state.sourceBytes = draft.sourceBytes && draft.sourceBytes.length ? draft.sourceBytes : draft.formBytes;
        state.sourceName = draft.sourceName || draft.formName || '';
        state.sourceMime = draft.sourceMime || '';
        state.formBytes = draft.formBytes;
        state.formName = draft.formName || 'form.pdf';
        state.fields = draft.fields || [];
        state.kind = draft.kind || '';
        state.placementBlocked = draft.placementBlocked || '';
        state.imageFrame = draft.imageFrame || null;
        state.imageNote = draft.imageNote || imageSentence(state.imageFrame);
        state.deskewDeg = draft.deskewDeg || 0;
        refreshLabels();
        paintDeskStatus();
      } else if (draft.formBytes || (draft.sourceBytes && draft.sourceBytes.length)) {
        status('Opening the saved form…', true);
        var source = draft.sourceBytes && draft.sourceBytes.length ? draft.sourceBytes : null;
        var applied = await setForm(source || draft.formBytes, source ? (draft.sourceName || draft.formName) : draft.formName, source ? (draft.sourceMime || '') : '');
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
      paintDeskStatus();
    } catch (err) {
      if (userTouched) return;
      status(err && err.message ? err.message : 'The saved form could not be opened.', false);
    }
  }).catch(function () {});
})();
