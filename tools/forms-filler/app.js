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
    if (warn) {
      warn.hidden = true;
      warn.textContent = '';
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
      el.textContent = 'Photo and text reading still work on this device. The optional private model is off because this browser has no WebGPU, so nothing is downloaded.';
      return;
    }
    if (snap.phase === 'checking') {
      el.textContent = 'Photo and text reading work on this device. Checking the optional private model…';
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
  var deskGen = 0;
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

  function claimDesk() {
    deskGen += 1;
    return deskGen;
  }

  async function setForm(bytes, name, mime, intent) {
    if (intent != null && intent !== deskGen) return false;
    var token = ++formToken;
    fillToken++;
    if (intent == null) retireForm();
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
    if (intent != null && intent !== deskGen) return false;
    if (intent != null) retireForm();
    state.sourceBytes = bytes;
    state.sourceName = name || '';
    state.sourceMime = mime || '';
    state.formBytes = read.bytes || bytes;
    state.formName = image ? String(name || 'form').replace(/\.[^.]+$/, '') + '.pdf' : (name || 'form.pdf');
    state.proposals = [];
    state.fields = read.fields;
    if (window.FormEvidence && FormEvidence.markRegions) FormEvidence.markRegions(state.fields);
    state.kind = read.kind;
    state.placementBlocked = read.placementBlock || '';
    state.scanReview = read.reviewTransport || null;
    state.imageFrame = image ? (read.frame || null) : null;
    state.imageNote = imageSentence(state.imageFrame);
    paintScanReview();
    refreshLabels();
    var kept = await persistDraft(intent);
    if (!alive() || (intent != null && intent !== deskGen)) return false;
    if (intent != null && kept && kept.skipped) return false;
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

  var REF_SEQ_LIMIT = 9007199254740991;

  function refSuffix(text) {
    var match = /^[A-Za-z]+([1-9][0-9]*)$/.exec(text);
    if (!match || match[1].length > 16) return 0;
    var n = Number(match[1]);
    if (!Number.isSafeInteger(n) || n < 1 || n > REF_SEQ_LIMIT || String(n) !== match[1]) return 0;
    return n;
  }

  function mintRefId(seen) {
    if (!Number.isSafeInteger(refSeq) || refSeq < 0 || refSeq >= REF_SEQ_LIMIT) refSeq = 0;
    var spins = 0;
    var fresh = '';
    do {
      spins += 1;
      if (spins > 100000 || refSeq >= REF_SEQ_LIMIT) refSeq = 0;
      var next = refSeq + 1;
      if (!Number.isSafeInteger(next) || next <= refSeq) refSeq = 0;
      else refSeq = next;
      fresh = 'r' + refSeq;
    } while (seen[fresh] && spins < 100001);
    if (seen[fresh]) fresh = 'r' + refSeq + 'x' + spins;
    return fresh;
  }

  function uniqueRefId(id, seen) {
    var text = String(id == null ? '' : id);
    var n = refSuffix(text);
    if (n && !seen[text]) {
      if (n > refSeq) refSeq = n;
      seen[text] = true;
      return text;
    }
    var fresh = mintRefId(seen);
    seen[fresh] = true;
    return fresh;
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
      else if (ref.status === 'cleared') preview.textContent = 'Photo cleared for privacy — add it again';
      else if (ref.status === 'error') preview.textContent = ref.preview || 'Couldn’t read this file.';
      else if (ref.preview) preview.textContent = ref.preview;
      else if (identityPhotoRef(ref)) preview.textContent = 'Could not read a name or ID from this photo. Nothing was filled.';
      else preview.textContent = 'No fields found in this file.';
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
    var epoch = state.readEpoch || 0;
    var read = window.FormExtract && FormExtract.openRead ? FormExtract.openRead() : null;
    ref.read = read;
    var text = '';
    var failed = false;
    var budget = false;
    var unread = '';
    try {
      var isPdf = ref.mime === 'application/pdf' || /\.pdf$/i.test(ref.name);
      var spatial = window.FormExtract && FormExtract.spatial
        ? await FormExtract.spatial(ref.bytes, isPdf ? 'application/pdf' : (ref.mime || 'image/png'), read)
        : { text: '', channel: 'text-layer' };
      text = spatial.text || '';
      unread = spatial.unread || '';
      ref.channel = spatial.channel || 'text-layer';
      ref.words = spatial.words || [];
      ref.identity = spatial.identity || null;
      ref.transform = spatial.transform || null;
    } catch (err) {
      failed = true;
      budget = !!(err && (err.message === 'budget' || err.message === 'cancelled'));
      if (budget && read && window.FormExtract && FormExtract.cancelRead) FormExtract.cancelRead(read);
    }
    if ((state.readEpoch || 0) !== epoch) return;
    var live = refById(id);
    if (!live || live !== ref) return;
      if (failed) {
      live.status = 'error';
      live.preview = budget ? 'This file took too long to read. Remove it or choose a smaller page. Nothing new was confirmed.' : 'Could not read this photo. Nothing was filled.';
      live.text = '';
      live.words = [];
    } else {
      live.text = text || '';
      rememberRef(live);
      if (live.channel === 'ocr' && !live.preview && live.identity) {
        var seen = [];
        if (live.identity.name) seen.push('Name ' + live.identity.name);
        if (live.identity.nric) seen.push('NRIC ' + live.identity.nric);
        if (live.identity.dob) seen.push('DOB ' + live.identity.dob);
        if (live.identity.address) seen.push('Address ' + live.identity.address);
        if (seen.length) live.preview = seen.join(' · ');
      }
      if (live.identity && live.identity.address && String(live.preview || '').indexOf(live.identity.address) < 0) {
        live.preview = (live.preview ? live.preview + ' · ' : '') + 'Address ' + live.identity.address;
      }
      if (live.channel === 'ocr' && !live.preview) live.preview = 'Could not read a name or ID from this photo. Nothing was filled.';
      if (unread) live.preview = live.preview ? (live.preview + ' · ' + unread) : unread;
    }
    if (identityPhotoRef(live) && (failed || !live.text)) live.bytes = new Uint8Array(0);
    renderRefs();
    scheduleSave();
  }

  function currentRefIds() {
    var seen = {};
    state.refs.forEach(function (ref) {
      if (ref && ref.id) seen[String(ref.id)] = true;
    });
    return seen;
  }

  function addRef(bytes, name, mime) {
    var label = name || 'reference';
    var removed = false;
    state.refs = state.refs.filter(function (ref) {
      if (!ref || ref.name !== label || !photoCleared(ref)) return true;
      stopRead(ref);
      removed = true;
      return false;
    });
    var dup = state.refs.some(function (ref) { return ref.name === label && sameFile(ref.bytes, bytes); });
    if (dup) {
      status(label + ' is already in the list.', false);
      if (removed) renderRefs();
      return false;
    }
    var ref = {
      id: mintRefId(currentRefIds()),
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

  function stopRead(ref) {
    if (ref && ref.read && window.FormExtract && FormExtract.cancelRead) FormExtract.cancelRead(ref.read);
  }

  function removeRef(id) {
    var ref = refById(id);
    if (!ref) return;
    fillToken++;
    state.refs = state.refs.filter(function (item) { return item.id !== id; });
    stopRead(ref);
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
      if (!ref || ref.status === 'cleared' || photoCleared(ref) || !ref.text || !String(ref.text).trim()) continue;
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

  function addBlockChoices(li, row) {
    var choices = (row.blockCandidates || []).slice(0, 2).filter(Boolean);
    if (!choices.length || !li) return;
    var group = document.createElement('div');
    group.className = 'review-quote';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Did you mean');
    var lead = document.createElement('span');
    lead.textContent = 'Did you mean: ';
    group.appendChild(lead);
    choices.forEach(function (candidate, index) {
      if (index) {
        var sep = document.createElement('span');
        sep.textContent = ' / ';
        group.appendChild(sep);
      }
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'review-quote';
      button.textContent = candidate;
      button.setAttribute('aria-label', 'Use suggested block ' + candidate + '. This does not tick the row.');
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        var editor = li.querySelector('input[type="text"]');
        if (editor) editor.value = candidate;
        row.value = candidate;
      });
      group.appendChild(button);
    });
    li.appendChild(group);
  }

  function confirmReviews(reviews) {
    var box = $('reviewBox');
    var list = $('reviewList');
    list.textContent = '';
    $('reviewLead').textContent = 'Nothing is written until you use the checked values. Uncheck any you do not want.';
    reviews.forEach(function (row) {
      var li = document.createElement('li');
      var label = document.createElement('label');
      var boxIn = document.createElement('input');
      boxIn.type = 'checkbox';
      boxIn.value = row.fieldId;
      boxIn.checked = !!row.checked;
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
        if (row.note) note(row.note);
        list.appendChild(li);
        return;
      } else {
        text.textContent = (row.editable ? 'Unconfirmed ' : '') + (row.kind || 'field') + ': ' + (row.editable ? '' : row.value);
        if (row.editable) {
          var edit = document.createElement('input');
          edit.type = 'text';
          edit.value = row.value;
          edit.setAttribute('data-field', row.fieldId);
          edit.setAttribute('aria-label', 'Unconfirmed ' + (row.kind || 'value'));
          label.appendChild(edit);
        }
        var quote = document.createElement('span');
        quote.className = 'review-quote';
        quote.textContent = row.quote ? ' Source: ' + row.quote : '';
        label.appendChild(boxIn);
        label.appendChild(text);
        label.appendChild(quote);
      }
      li.appendChild(label);
      if (row.note) {
        var fitNote = document.createElement('span');
        fitNote.className = 'review-quote';
        fitNote.textContent = row.note;
        li.appendChild(fitNote);
      }
      if (row.plain && row.plain !== row.value) {
        var alt = document.createElement('button');
        alt.type = 'button';
        alt.className = 'review-quote';
        alt.textContent = 'Without bracketed name';
        alt.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          var editor = li.querySelector('input[type="text"]');
          if (editor) editor.value = row.plain;
          else text.textContent = (row.kind || 'field') + ': ' + row.plain;
          row.value = row.plain;
          boxIn.checked = true;
        });
        li.appendChild(alt);
      }
      if (row.repaired && row.repaired !== row.value) {
        var repair = document.createElement('button');
        repair.type = 'button';
        repair.className = 'review-quote';
        repair.textContent = 'With bracketed name';
        repair.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          var editor = li.querySelector('input[type="text"]');
          if (editor) editor.value = row.repaired;
          else text.textContent = (row.kind || 'field') + ': ' + row.repaired;
          row.value = row.repaired;
          boxIn.checked = true;
        });
        li.appendChild(repair);
      }
      addBlockChoices(li, row);
      list.appendChild(li);
    });
    box.hidden = false;
    return new Promise(function (resolve) {
      function finish(useChecked) {
        list.querySelectorAll('input[type="text"]').forEach(function (input) {
          var id = input.getAttribute('data-field');
          reviews.forEach(function (row) {
            if (row.fieldId === id) row.value = String(input.value || '').trim();
          });
        });
        var ids = [];
        if (useChecked) {
          list.querySelectorAll('input[type="checkbox"]:checked').forEach(function (input) {
            var row = null;
            for (var r = 0; r < reviews.length; r++) if (reviews[r].fieldId === input.value) row = reviews[r];
            if (row && row.kind === 'nric' && window.FormFacts && !FormFacts.nricChecksum(String(row.value || '').replace(/\s/g, '').toUpperCase())) return;
            ids.push(input.value);
          });
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

  function clearGeneration() {
    try { return Number(localStorage.getItem('ff-editor-clear-generation') || 0); } catch (err) { return 0; }
  }

  function recordRetired(record) {
    var mark = clearGeneration();
    var gen = Number(record && (record.generation || record.epoch) || 0);
    return !!(mark && gen && gen <= mark);
  }

  function readHandoff() {
    try {
      var raw = sessionStorage.getItem('ff-editor-handoff');
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.pages) || !parsed.pages.length) return null;
      if (recordRetired(parsed)) return null;
      return parsed;
    } catch (err) { return null; }
  }

  function sameEditorFile(stored, pdfSha, sourceSha, sheet) {
    if (!stored || !Array.isArray(stored.pages) || !stored.pages.length) return false;
    if (recordRetired(stored)) return false;
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

  var MARK_TYPES = { text: 1, date: 1, whiteout: 1, highlight: 1, rect: 1, ellipse: 1, image: 1, signature: 1 };

  function unit(n) {
    return typeof n === 'number' && isFinite(n) && n >= -0.02 && n <= 1.02;
  }

  function cleanMark(ann) {
    if (!ann || typeof ann !== 'object' || Array.isArray(ann)) return null;
    if (ann.type && !MARK_TYPES[ann.type]) return null;
    if (ann.text != null && typeof ann.text !== 'string') return null;
    if (ann.text && ann.text.length > 4000) return null;
    if (ann.profileId != null && typeof ann.profileId !== 'string') return null;
    if (ann.originProfileId != null && typeof ann.originProfileId !== 'string') return null;
    var copy = {
      id: typeof ann.id === 'string' ? ann.id.slice(0, 40) : '',
      type: ann.type || 'text',
      x: Number(ann.x), y: Number(ann.y), w: Number(ann.w), h: Number(ann.h),
      text: typeof ann.text === 'string' ? ann.text : '',
      fontSize: Number(ann.fontSize) > 0 ? Number(ann.fontSize) : 14,
      color: typeof ann.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(ann.color) ? ann.color : '#1a1612'
    };
    if (!unit(copy.x) || !unit(copy.y) || !unit(copy.w) || !unit(copy.h)) return null;
    if (ann.type === 'image' || ann.type === 'signature') {
      var payload = typeof ann.dataUrl === 'string' ? ann.dataUrl : '';
      var raster = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=\s]+$/.test(payload) && payload.length <= 1500000;
      if (!raster) return null;
      copy.dataUrl = payload;
      var aspect = Number(ann.pixelAspect);
      if (!(aspect > 0) || aspect > 20000 || !isFinite(aspect)) return null;
      copy.pixelAspect = aspect;
      copy.text = '';
    }
    if (ann.profileId) copy.profileId = ann.profileId.slice(0, 80);
    if (ann.originProfileId) copy.originProfileId = ann.originProfileId.slice(0, 80);
    if (typeof ann.factKey === 'string') copy.factKey = ann.factKey.slice(0, 40);
    if (ann.manual === true) copy.manual = true;
    if (typeof ann.mapId === 'string') copy.mapId = ann.mapId.slice(0, 40);
    if (typeof ann.role === 'string') copy.role = ann.role.slice(0, 40);
    if (typeof ann.personName === 'string') copy.personName = ann.personName.slice(0, 80);
    if (typeof ann.seedText === 'string') copy.seedText = ann.seedText.slice(0, 4000);
    return copy;
  }

  function cleanMarkList(list) {
    if (!Array.isArray(list)) return null;
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var mark = cleanMark(list[i]);
      if (!mark) return null;
      out.push(mark);
    }
    return out;
  }

  function markOwner(ann) {
    if (ann.profileId) return ann.profileId;
    if (ann.originProfileId) return ann.originProfileId;
    return '';
  }

  function resumePages(stored, pageCount, personId) {
    if (!stored || !Array.isArray(stored.pages) || stored.pages.length !== pageCount) return { invalid: true };
    var pool = [];
    for (var i = 0; i < pageCount; i++) {
      var page = stored.pages[i];
      if (!page || page.srcIndex !== i || !Array.isArray(page.annotations)) return { invalid: true };
      var marks = cleanMarkList(page.annotations);
      if (!marks) return { invalid: true };
      pool.push({ id: typeof page.id === 'string' ? page.id : '', rotation: page.rotation === 90 || page.rotation === 180 || page.rotation === 270 ? page.rotation : 0, marks: marks });
    }
    if (stored.withheld != null) {
      if (!Array.isArray(stored.withheld)) return { invalid: true };
      for (var w = 0; w < stored.withheld.length; w++) {
        var held = stored.withheld[w];
        if (!held || typeof held.srcIndex !== 'number' || held.srcIndex < 0 || held.srcIndex >= pageCount) return { invalid: true };
        var heldMarks = cleanMarkList(held.annotations);
        if (!heldMarks) return { invalid: true };
        pool[held.srcIndex].marks = pool[held.srcIndex].marks.concat(heldMarks);
      }
    }
    var dropped = 0;
    var kept = 0;
    var pages = [];
    var withheld = [];
    pool.forEach(function (page, index) {
      var mine = [];
      var theirs = [];
      page.marks.forEach(function (ann) {
        var owner = markOwner(ann);
        if (!owner || !personId || owner !== personId) {
          dropped += 1;
          if (owner) theirs.push(ann);
          return;
        }
        kept += 1;
        mine.push(ann);
      });
      pages.push({ id: page.id || Math.random().toString(36).slice(2, 10), srcIndex: index, rotation: page.rotation, annotations: mine });
      if (theirs.length) withheld.push({ srcIndex: index, annotations: theirs });
    });
    return { pages: pages, withheld: withheld, dropped: dropped, kept: kept, invalid: false };
  }

  function rasterBytes(dataUrl) {
    var comma = dataUrl.indexOf(',');
    if (comma < 0) return null;
    var text = dataUrl.slice(comma + 1).replace(/\s/g, '');
    if (!text || text.length % 4 === 1) return null;
    try {
      var bin = atob(text);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 255;
      return bytes;
    } catch (err) { return null; }
  }

  async function acceptedRaster(dataUrl) {
    var bytes = rasterBytes(dataUrl);
    if (!bytes) return false;
    var png = bytes.length > 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    var jpg = bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (dataUrl.indexOf('image/png') >= 0 && !png) return false;
    if (dataUrl.indexOf('image/jpeg') >= 0 && !jpg) return false;
    if (!png && !jpg) return false;
    try {
      var bmp = await createImageBitmap(new Blob([bytes], { type: png ? 'image/png' : 'image/jpeg' }));
      var ok = bmp.width > 0 && bmp.height > 0 && bmp.width <= 1600 && bmp.height <= 1600 && bmp.width * bmp.height <= 1600 * 1600;
      if (bmp.close) bmp.close();
      return ok;
    } catch (err) { return false; }
  }

  async function stripBadRasters(list) {
    var dropped = 0;
    var pages = [];
    for (var i = 0; i < (list || []).length; i++) {
      var page = list[i];
      var marks = [];
      var anns = page.annotations || [];
      for (var j = 0; j < anns.length; j++) {
        if (anns[j] && anns[j].dataUrl && !(await acceptedRaster(anns[j].dataUrl))) dropped += 1;
        else marks.push(anns[j]);
      }
      pages.push({ id: page.id, srcIndex: page.srcIndex, rotation: page.rotation || 0, annotations: marks });
    }
    return { pages: pages, dropped: dropped };
  }

  async function openRecovery() {
    if (openingEditor) return;
    var bytes = pdfBytesForEditor();
    if (!bytes) {
      toast('Choose a form first.');
      return;
    }
    openingEditor = true;
    var opened = false;
    var intentBytes = bytes.slice(0);
    var intentSheet = sheetStamp();
    var intentPick = $('profilePick') && $('profilePick').value || '';
    var intentClear = clearGeneration();
    var intentToken = formToken;
    var intentSource = state.sourceBytes && state.sourceBytes.length ? state.sourceBytes.slice(0) : null;
    try {
    if ($('placeMissing')) $('placeMissing').disabled = true;
    status('Opening the editor so you can place a saved value…', true);
    var seenGen = 0;
    try {
      var prior = await DeskDB.get(EDITOR_DB, 'session');
      seenGen = prior && (prior.generation || prior.epoch) || 0;
    } catch (err) {
      status('This browser could not store the form, so the editor was not opened. Nothing was written.', false);
      toast('The editor was not opened.');
      return;
    }
    var probe;
    try {
      probe = await PDFLib.PDFDocument.load(intentBytes.slice(0));
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
      pdfSha = await sha256Hex(intentBytes);
      sourceSha = (!intentSource || intentSource.length < 4 || (intentSource[0] === 0x25 && intentSource[1] === 0x50 && intentSource[2] === 0x44 && intentSource[3] === 0x46)) ? '' : await sha256Hex(intentSource);
    } catch (err) {
      openingEditor = false;
      if ($('placeMissing')) $('placeMissing').disabled = !(state.sourceBytes || state.formBytes);
      status('This browser could not store the form, so the editor was not opened. Nothing was written.', false);
      toast('The editor was not opened.');
      return;
    }
    var sheet = intentSheet;
    var personId = intentPick;
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
    var withheld = [];
    if (resumed && resumed.invalid) note = 'Saved marks could not be read, so they were not brought back.';
    else if (!best && (stored || handoff || storedPdf)) note = 'This file or crop changed, so earlier marks were not brought back.';
    else if (resumed && resumed.dropped) note = 'Returned to this file. The other person’s marks were left off.';
    else if (resumed && resumed.kept) note = 'Returned to the same page and the same marks.';
    if (resumed && !resumed.invalid) {
      pages = resumed.pages;
      withheld = resumed.withheld;
    }
    var seenStoreEdited = stored ? (stored.editedAt || 0) : 0;
    var checkedPages = await stripBadRasters(pages);
    var checkedHeld = await stripBadRasters(withheld);
    if (checkedPages.dropped || checkedHeld.dropped) note = (note ? note + ' ' : '') + 'A picture could not be read, so it was not brought back.';
    pages = checkedPages.pages;
    withheld = checkedHeld.pages;
    var generation = Date.now();
    var session = {
      fileName: state.formName || 'form.pdf',
      zoom: 1,
      fit: true,
      current: 0,
      pages: pages,
      withheld: withheld,
      epoch: generation,
      generation: generation,
      source: 'forms',
      recover: true,
      sourceSha256: sourceSha,
      pdfSha256: pdfSha,
      sheet: intentSheet,
      resumeProfileId: intentPick || '',
      editedAt: generation,
      resumeNote: note
    };
    function writeSession() {
      return DeskDB.change(EDITOR_DB, ['session'], function (found, put) {
        if (clearGeneration() !== intentClear) return { ok: false, reason: 'cleared' };
        if (formToken !== intentToken) return { ok: false, reason: 'file' };
        var pick = $('profilePick') && $('profilePick').value || '';
        if (pick !== intentPick) return { ok: false, reason: 'person' };
        if (JSON.stringify(sheetStamp() || null) !== JSON.stringify(intentSheet || null)) return { ok: false, reason: 'sheet' };
        var existing = found.session;
        var nowGen = existing && (existing.generation || existing.epoch) || 0;
        if (nowGen !== seenGen) return { ok: false, reason: 'newer' };
        var nowEdited = existing ? (existing.editedAt || 0) : 0;
        if (nowEdited !== seenStoreEdited) return { ok: false, reason: 'edited', editedAt: nowEdited };
        put('pdf', intentBytes);
        put('session', session);
        return { ok: true };
      });
    }
    var committed;
    try {
      committed = await writeSession();
      if (committed && committed.reason === 'edited') {
        var fresh = await DeskDB.get(EDITOR_DB, 'session');
        var live = fresh ? resumePages(fresh, pages.length, personId) : null;
        if (!live || live.invalid) {
          status('A newer edit could not be read. Nothing was replaced.', false);
          toast('The editor was not opened.');
          return;
        }
        var againPages = await stripBadRasters(live.pages);
        var againHeld = await stripBadRasters(live.withheld);
        session.pages = againPages.pages;
        session.withheld = againHeld.pages;
        if (againPages.dropped || againHeld.dropped) session.resumeNote = (live.kept ? 'Returned to the same page and the same marks. ' : '') + 'A picture could not be read, so it was not brought back.';
        else if (live.dropped) session.resumeNote = 'Returned to this file. The other person’s marks were left off.';
        else if (live.kept) session.resumeNote = 'Returned to the same page and the same marks.';
        seenStoreEdited = fresh && fresh.editedAt || 0;
        committed = await writeSession();
      }
    } catch (err) {
      status('This browser could not store the form, so the editor was not opened. Nothing was written.', false);
      toast('The editor was not opened.');
      return;
    }
    if (!committed || !committed.ok) {
      var why = committed && committed.reason;
      var refused = why === 'cleared' ? 'Start over finished before the editor opened. Nothing was written.'
        : why === 'person' ? 'The person changed before the editor opened. Nothing was written.'
        : why === 'newer' || why === 'edited' ? 'A newer editor session is already stored. Nothing was replaced.'
        : 'The form changed before the editor opened. Nothing was written.';
      status(refused, false);
      toast('The editor was not opened.');
      return;
    }
    opened = true;
    location.href = '../pdf-editor/?desk=forms';
    } catch (err) {
      status('This browser could not store the form, so the editor was not opened. Nothing was written.', false);
      toast('The editor was not opened.');
    } finally {
      if (!opened) {
        openingEditor = false;
        if ($('placeMissing')) $('placeMissing').disabled = !(state.sourceBytes || state.formBytes);
      }
    }
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
      if (!notesAll.trim()) {
        var clearedPhoto = state.refs.some(function (ref) { return ref.status === 'cleared'; });
        var photoRef = state.refs.some(function (ref) {
          return ref.status !== 'cleared' && (ref.channel === 'ocr' || identityPhotoRef(ref));
        });
        throw new Error(clearedPhoto
          ? 'Nothing could be read from your papers — add the ID photo again'
          : (photoRef ? 'Could not read a name or ID from the photo. Nothing was filled.' : 'The references had no readable text.'));
      }
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
      var identityPhoto = state.refs.some(function (ref) {
        return ref.channel === 'ocr' && (String(ref.mime || '').indexOf('image/') === 0 || /\.(png|jpe?g|webp)$/i.test(ref.name || ''));
      });
      if (identityPhoto && window.FormFacts && FormFacts.identityRead) {
        var photoWords = [];
        state.refs.forEach(function (ref) {
          if (ref.channel === 'ocr' && ref.words) ref.words.forEach(function (word) { photoWords.push(word); });
        });
        var idn = FormFacts.identityRead(notesAll, photoWords);
        var chosen = null;
        state.refs.forEach(function (ref) {
          var voted = ref && ref.identity;
          if (!voted || (!voted.name && !voted.nric)) return;
          if (!chosen || (voted.nricValid && !chosen.nricValid)) chosen = voted;
          else if (chosen && voted.name && voted.name === chosen.name && voted.nameUnconfirmed) chosen.nameUnconfirmed = true;
        });
        if (chosen) {
          if (chosen.name) idn.name = chosen.name;
          if (chosen.nric && chosen.nricValid) {
            idn.nric = chosen.nric;
            idn.nricValid = true;
          }
          if (chosen.nameUnconfirmed) idn.nameUnconfirmed = true;
          if (chosen.nricUnconfirmed) idn.nricUnconfirmed = true;
          idn.namePlain = chosen.namePlain || idn.namePlain || '';
          idn.nameAlias = chosen.nameAlias || '';
          idn.nameRepaired = chosen.nameRepaired || '';
          idn.nameChecked = !!chosen.nameChecked && !idn.nameUnconfirmed;
          idn.nricChecked = !!chosen.nricChecked && !idn.nricUnconfirmed;
        }
        state.refs.forEach(function (ref) {
          var extra = ref && ref.identity;
          if (!extra) return;
          ['dob', 'sex', 'nationality', 'race', 'birthCountry', 'blk', 'street', 'unit', 'postal', 'address'].forEach(function (key) {
            if (!extra[key]) return;
            if (!idn[key] || (extra[key + 'Checked'] && !idn[key + 'Checked'])) {
              idn[key] = extra[key];
              idn[key + 'Checked'] = !!extra[key + 'Checked'];
              if (key === 'blk') {
                idn.blkUnconfirmed = !!extra.blkUnconfirmed;
                if (extra.blkHint) idn.blkHint = extra.blkHint;
              }
              if (key === 'dob') idn.dobUnconfirmed = !!extra.dobUnconfirmed;
              if (key === 'unit') idn.unitUnconfirmed = !!extra.unitUnconfirmed;
            }
          });
          if (extra.blk && extra.blk === idn.blk && extra.blkUnconfirmed) idn.blkUnconfirmed = true;
          if (extra.dob && extra.dob === idn.dob && extra.dobUnconfirmed) idn.dobUnconfirmed = true;
          if (extra.unit && extra.unit === idn.unit && extra.unitUnconfirmed) idn.unitUnconfirmed = true;
        });
        var hinted = null;
        var hintClash = false;
        state.refs.forEach(function (ref) {
          var extra = ref && ref.identity;
          if (!extra || !extra.blkHint || !extra.blk) return;
          if (!hinted) hinted = { blk: extra.blk, hint: extra.blkHint };
          else if (hinted.blk !== extra.blk || hinted.hint !== extra.blkHint) hintClash = true;
        });
        if (hinted && !hintClash) {
          idn.blk = hinted.blk;
          idn.blkHint = hinted.hint;
          idn.blkChecked = false;
          idn.blkUnconfirmed = true;
        }
        state.refs.forEach(function (ref) {
          var extra = ref && ref.identity;
          if (extra && extra.blkCandidates && extra.blkCandidates.length) idn.blkCandidates = extra.blkCandidates.slice(0, 2);
        });
        if (/^\d{4}$/.test(idn.blk)) idn.blkUnconfirmed = true;
        if (idn.name && window.FormFacts && FormFacts.extendsName && window.FormEvidence && FormEvidence.extract) {
          var longer = [];
          FormEvidence.extract(notesAll).facts.forEach(function (fact) {
            if (fact.kind === 'name' && fact.role === 'applicant' && FormFacts.extendsName(idn.name, fact.value)) longer.push(fact.value);
          });
          if (longer.length === 1) {
            idn.name = longer[0];
            idn.namePlain = longer[0];
          }
        }
        if (idn.blkUnconfirmed || !idn.blk || !idn.street || !idn.postal) {
          idn.address = '';
          idn.addressChecked = false;
        }
        if (!idn.name && !idn.nric && !idn.dob && !idn.sex && !idn.nationality && !idn.address && !idn.postal && !idn.blk) throw new Error('Could not read a name or ID from the photo. Nothing was filled.');
        var matched = false;
        var asked = {};
        state.fields.forEach(function (field) {
          var kind = window.FormEvidence && FormEvidence.identityPhotoSlot ? FormEvidence.identityPhotoSlot(field, state.fields) : '';
          if (kind) asked[kind] = true;
        });
        var addressUnsure = window.FormEvidence.addressSlotsBlank ? FormEvidence.addressSlotsBlank(idn, state.fields) : false;
        function slotValue(slot) {
          if (addressUnsure && (slot === 'address' || slot === 'blk' || slot === 'street' || slot === 'unit' || slot === 'postal')) return '';
          if (slot === 'name') return idn.name || '';
          if (slot === 'nric') return idn.nric || '';
          if (slot === 'dob') return idn.dob || '';
          if (slot === 'sex') return idn.sex || '';
          if (slot === 'nationality') return idn.nationality || '';
          if (slot === 'race') return idn.race || '';
          if (slot === 'birthCountry') return idn.birthCountry || '';
          if (slot === 'address' || slot === 'blk') return (window.FormEvidence.identityCardOffer(idn, slot, state.fields) || {}).value || '';
          if (slot === 'postal') return idn.postal || '';
          if (slot === 'street') return idn.street || '';
          if (slot === 'unit') return idn.unit ? '#' + idn.unit : '';
          return '';
        }
        function slotChecked(slot) {
          if (slot === 'name') return !!idn.nameChecked;
          if (slot === 'nric') return !!idn.nricChecked;
          if (slot === 'dob') return !!idn.dobChecked && !idn.dobUnconfirmed;
          if (slot === 'sex') return !!idn.sexChecked;
          if (slot === 'nationality') return !!idn.nationalityChecked;
          if (slot === 'race') return !!idn.raceChecked;
          if (slot === 'birthCountry') return !!idn.birthCountryChecked;
          if (slot === 'blk' || slot === 'address' || slot === 'street' || slot === 'unit' || slot === 'postal') return !!(window.FormEvidence.identityCardOffer(idn, slot, state.fields) || {}).checked;
          return false;
        }
        decisions.forEach(function (row) {
          var field = null;
          for (var i = 0; i < state.fields.length; i++) if (state.fields[i].id === row.fieldId) field = state.fields[i];
          var slot = window.FormEvidence && FormEvidence.identityPhotoSlot ? FormEvidence.identityPhotoSlot(field, state.fields) : '';
          var value = slotValue(slot);
          if (!slot || !value) {
            if (row.decision !== 'abstain') {
              row.decision = 'abstain';
              row.value = '';
              row.reason = 'not_identity';
            }
            return;
          }
          if (slot === 'name') {
            matched = true;
            row.decision = 'review';
            row.value = idn.name;
            row.kind = 'name';
            row.editable = !!idn.nameUnconfirmed;
            row.checked = !!idn.nameChecked;
            row.plain = idn.namePlain && idn.namePlain !== idn.name ? idn.namePlain : '';
            row.repaired = idn.nameRepaired && idn.nameRepaired !== idn.name ? idn.nameRepaired : '';
            row.reason = idn.nameUnconfirmed ? 'identity_unconfirmed' : 'identity_photo';
            row.quote = 'Read from the photo';
            return;
          }
          if (slot === 'nric') {
            matched = true;
            row.decision = 'review';
            row.value = idn.nric;
            row.kind = 'nric';
            row.editable = !!idn.nricUnconfirmed;
            row.checked = !!idn.nricChecked;
            row.reason = idn.nricUnconfirmed ? 'identity_unconfirmed' : 'identity_photo';
            row.quote = idn.nricValid ? 'Read from the photo' : 'Checksum not confirmed';
            return;
          }
          matched = true;
          row.decision = 'review';
          row.value = value;
          row.kind = slot;
          if (slot === 'dob') {
            row.editable = !!idn.dobUnconfirmed;
            row.checked = !!idn.dobChecked && !idn.dobUnconfirmed;
            row.reason = row.editable ? 'identity_unconfirmed' : 'identity_photo';
            row.quote = 'Read from the photo';
            return;
          }
          var cardOffer = (slot === 'blk' || slot === 'address' || slot === 'street' || slot === 'unit' || slot === 'postal') ? window.FormEvidence.identityCardOffer(idn, slot, state.fields) : null;
          row.editable = !!(cardOffer && cardOffer.editable);
          row.checked = slotChecked(slot);
          row.reason = row.editable ? 'identity_unconfirmed' : 'identity_photo';
          row.quote = slot === 'blk' && idn.blkHint ? 'Read as ' + idn.blkHint : 'Read from the photo';
          if (slot === 'blk') row.blockCandidates = (idn.blkCandidates || []).slice(0, 2);
        });
        decisions.forEach(function (row) {
          if (!row || !row.value || !window.FormEvidence || !FormEvidence.fittedSize) return;
          var field = null;
          for (var i = 0; i < state.fields.length; i++) if (state.fields[i].id === row.fieldId) field = state.fields[i];
          if (!field || !field.rect || !(field.rect.width > 0)) return;
          var start = row.fontSize || Math.max(9, Math.min(13, ((field.lineH || 12) * 0.85)));
          var fit = FormEvidence.fittedSize(row.value, field.rect.width, start);
          row.fontSize = fit.size;
          if (fit.fits) return;
          row.checked = false;
          row.decision = 'review';
          row.note = 'Does not fit in the box. Left unticked.';
          row.reason = 'does_not_fit';
        });
        if (!matched) throw new Error('No line on this form is clearly the applicant\'s. The name and ID were not offered.');
      }
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
        status('Check the values below, then tap Use checked values.', false);
        confirmed = await confirmReviews(reviews);
        if (!current()) return;
        if (identityPhoto) await forgetIdentityPhotos();
        if (confirmed.length && state.profileId && window.FormProfiles) {
          try {
            var live = await FormProfiles.load();
            if (live.ok) {
              var next = live.vault;
              confirmed.forEach(function (fieldId) {
                var row = null;
                for (var r = 0; r < reviews.length; r++) if (reviews[r].fieldId === fieldId) row = reviews[r];
                if (!row || !row.value) return;
                if (row.kind === 'nric' && window.FormFacts && !FormFacts.nricChecksum(String(row.value).replace(/\s/g, '').toUpperCase())) return;
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
      await forgetIdentityPhotos();
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
    var missed = [];
    if (!blank && state.kind === 'acro') {
      bytes = await FormFields.fill(state.formBytes, state.fields, values, { flatten: true });
      if (bytes && bytes.unplaced) missed = missed.concat(bytes.unplaced);
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
    if (boxes && boxes.unplaced) {
      missed = missed.concat(boxes.unplaced);
      delete boxes.unplaced;
    }
    var ticked = Object.keys(values).filter(function (id) { return String(values[id] || '').trim(); });
    if (missed.length) {
      var placeNote = 'Could not place ' + missed.map(function (row) { return row.label || row.id; }).join(', ') + '. Those ticked values were not written.';
      var wrote = 0;
      Object.keys(boxes).forEach(function (key) {
        if (Array.isArray(boxes[key])) wrote += boxes[key].length;
      });
      var nothingWritten = state.kind === 'flat' ? wrote === 0 && ticked.length > 0 : missed.length >= ticked.length && ticked.length > 0;
      if (nothingWritten) {
        status(placeNote, false);
        if ($('failText')) $('failText').textContent = placeNote;
        if ($('failBox')) $('failBox').hidden = false;
        state.running = false;
        refreshLabels();
        return;
      }
      state.placeNote = placeNote;
    } else {
      state.placeNote = '';
    }
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
      var heldNote = reviewNote(state.fields);
      if (state.placeNote) heldNote = heldNote ? heldNote + ' ' + state.placeNote : state.placeNote;
      editorSession = { fileName: fileName, zoom: 1, fit: true, current: 0, pages: pages, epoch: Date.now(), source: 'forms', reviewNote: heldNote, sourceSha256: await sourceIdentity(), pdfSha256: await sha256Hex(bytes), sheet: sheetStamp(), editedAt: Date.now() };
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

  function identityPhotoRef(ref) {
    if (!ref) return false;
    if (String(ref.mime || '').indexOf('image/') === 0) return true;
    return /\.(png|jpe?g|webp|gif|bmp|heic|tif|tiff)$/i.test(ref.name || '');
  }

  function photoCleared(ref) {
    return identityPhotoRef(ref) && !(ref.bytes && ref.bytes.length);
  }

  function wipeIdentityPhotoBytes() {
    (state.refs || []).forEach(function (ref) {
      if (!identityPhotoRef(ref)) return;
      ref.bytes = new Uint8Array(0);
      ref.text = '';
      ref.words = [];
      ref.identity = null;
      ref.channel = '';
      ref.status = 'cleared';
      ref.preview = 'Photo cleared for privacy — add it again';
      ref.pending = null;
    });
  }

  function forgetIdentityPhotos() {
    wipeIdentityPhotoBytes();
    clearTimeout(saveTimer);
    draftEpoch++;
    return persistDraft();
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
        var photo = identityPhotoRef(ref);
        return {
          id: ref.id,
          name: ref.name,
          bytes: photo ? new Uint8Array(0) : ref.bytes,
          mime: ref.mime,
          text: photo ? '' : (ref.text || '')
        };
      })
    };
  }

  function persistDraft(intent) {
    var epoch = draftEpoch;
    return enqueueDraft(function () {
      if (!DeskDB.change) return { ok: false, reason: 'unavailable' };
      return DeskDB.change(DB, ['draft'], function (found, put) {
        if (epoch !== draftEpoch || (intent != null && intent !== deskGen)) return { ok: false, reason: 'stale' };
        var snap = draftSnapshot();
        put('draft', snap || null);
        return { ok: true };
      }).then(function (result) {
        if (result && result.reason === 'stale') return { ok: true, skipped: true };
        if (!result || result.ok === false) return { ok: false, reason: (result && result.reason) || 'cancelled' };
        return { ok: true };
      });
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
    try { localStorage.setItem('ff-editor-clear-generation', String(clearedAt)); } catch (err) {}
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
    if (files.length) claimDesk();
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
          wipeIdentityPhotoBytes();
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
    claimDesk();
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
    wipeIdentityPhotoBytes();
    var pendingRefs = state.refs.slice();
    state.refs = [];
    state.readEpoch = (state.readEpoch || 0) + 1;
    if (window.FormExtract && FormExtract.cancelAll) FormExtract.cancelAll();
    else pendingRefs.forEach(stopRead);
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
  function releaseRefs(intent) {
    if (intent != null && intent !== deskGen) return false;
    var pending = state.refs.slice();
    state.refs = [];
    state.readEpoch = (state.readEpoch || 0) + 1;
    state.proposals = [];
    if (window.FormExtract && FormExtract.cancelAll) FormExtract.cancelAll();
    else pending.forEach(stopRead);
    refreshLabels();
    return intent == null || intent === deskGen;
  }

  $('sampleBtn').addEventListener('click', async function () {
    var intent = claimDesk();
    userTouched = true;
    status('Opening the sample…', true);
    try {
      var form = new Uint8Array(await (await fetch('samples/visitor-form.pdf')).arrayBuffer());
      var ref = new Uint8Array(await (await fetch('samples/visitor-reference.pdf')).arrayBuffer());
      var card = new Uint8Array(await (await fetch('samples/id-card.png')).arrayBuffer());
      if (intent !== deskGen || !releaseRefs(intent)) return;
      var applied = await setForm(form, 'visitor-form.pdf', '', intent);
      if (!applied || intent !== deskGen) return;
      addRef(ref, 'visitor-reference.pdf', 'application/pdf');
      if (intent !== deskGen) return;
      addRef(card, 'id-card.png', 'image/png');
      if (intent !== deskGen) return;
      status('', false);
    } catch (err) {
      if (intent !== deskGen) return;
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
    wipeIdentityPhotoBytes();
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
    wipeIdentityPhotoBytes();
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
        return { id: ref.id, name: ref.name, status: ref.status, preview: ref.preview };
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
        if (window.FormEvidence && FormEvidence.markRegions) FormEvidence.markRegions(state.fields);
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
        var bytes = ref.bytes && ref.bytes.length ? ref.bytes : new Uint8Array(0);
        var item = {
          id: ref.id || '',
          name: ref.name || 'reference',
          bytes: bytes,
          mime: ref.mime || '',
          text: ref.text || '',
          status: 'reading',
          preview: '',
          pending: null
        };
        if (photoCleared(item)) {
          item.text = '';
          item.status = 'cleared';
          item.preview = 'Photo cleared for privacy — add it again';
          return item;
        }
        if (item.text) rememberRef(item);
        return item;
      });
      var seenIds = {};
      var changedId = false;
      state.refs.forEach(function (ref) {
        var nextId = uniqueRefId(ref.id, seenIds);
        if (nextId !== ref.id) changedId = true;
        ref.id = nextId;
      });
      if (changedId) scheduleSave();
      state.refs.forEach(function (ref) {
        if (ref.status === 'reading' && ref.bytes && ref.bytes.length) ref.pending = extractOne(ref);
      });
      refreshLabels();
      paintModel();
      paintDeskStatus();
    } catch (err) {
      if (userTouched) return;
      status(err && err.message ? err.message : 'The saved form could not be opened.', false);
    }
  }).catch(function () {});
  window.FormBlockChoices = { add: addBlockChoices };
})();
