/* Local model only. Qwen2.5-1.5B Instruct via WebLLM.
   Phones with shader-f16 get the q4f16 build (~868 MB). Machines without
   that feature get the q4f32 build of the same model. Weights stay in
   the browser Cache Storage. There is no cloud model.
   Choosing a build is not a download. Ready and cache are recorded only
   after CreateMLCEngine finishes, and cache only if its own progress
   text said the weights came from cache. */
(function (global) {
  var F16 = {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen2.5-1.5B-Instruct',
    quant: 'q4f16',
    megabytes: 868
  };
  var F32 = {
    id: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
    label: 'Qwen2.5-0.5B-Instruct',
    quant: 'q4f32',
    megabytes: 390
  };
  var LIB = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/lib/index.js';
  var enginePromise = null;
  var choice = null;
  var phase = 'checking';
  var progress = 0;
  var detail = '';
  var sawCacheText = false;
  var cachedConfirmed = false;
  var failedMessage = '';

  function snapshot() {
    return {
      phase: phase,
      label: choice ? choice.label : '',
      id: choice ? choice.id : '',
      quant: choice ? choice.quant : '',
      megabytes: choice ? choice.megabytes : 0,
      progress: progress,
      cachedConfirmed: phase === 'ready' && cachedConfirmed,
      detail: detail,
      error: failedMessage
    };
  }

  function report(onProgress, extra) {
    if (!onProgress) return;
    var snap = snapshot();
    if (extra) Object.keys(extra).forEach(function (key) { snap[key] = extra[key]; });
    onProgress(snap);
  }

  function gpu() {
    if (!navigator.gpu || typeof navigator.gpu.requestAdapter !== 'function') {
      phase = 'unavailable';
      return Promise.resolve({ ok: false, reason: 'missing' });
    }
    var request = navigator.gpu.requestAdapter().then(function (adapter) {
      if (!adapter) {
        phase = 'unavailable';
        return { ok: false, reason: 'no-adapter' };
      }
      var f16 = adapter.features && adapter.features.has('shader-f16');
      choice = f16 ? F16 : F32;
      if (phase === 'checking' || phase === 'unavailable') phase = 'selected';
      return { ok: true, f16: !!f16, model: choice };
    }).catch(function () {
      phase = 'unavailable';
      return { ok: false, reason: 'error' };
    });
    return new Promise(function (resolve) {
      var timer = setTimeout(function () {
        if (phase === 'checking') phase = 'unavailable';
        resolve({ ok: false, reason: 'timeout' });
      }, 4000);
      request.then(function (status) { clearTimeout(timer); resolve(status); });
    });
  }

  function loadLib() {
    return import(LIB);
  }

  function keepStored() {
    try {
      if (navigator.storage && typeof navigator.storage.persist === 'function') {
        navigator.storage.persist().catch(function () {});
      }
    } catch (err) {}
  }

  function withTimeout(promise, ms, message) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        var err = new Error(message || 'Timed out');
        err.code = 'timeout';
        reject(err);
      }, ms);
      Promise.resolve(promise).then(function (value) {
        clearTimeout(timer);
        resolve(value);
      }, function (err) {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  function ensure(onProgress) {
    if (enginePromise) return enginePromise;
    phase = 'downloading';
    progress = 0;
    sawCacheText = false;
    cachedConfirmed = false;
    failedMessage = '';
    report(onProgress);
    enginePromise = gpu().then(function (status) {
      if (!status.ok) {
        phase = 'unavailable';
        var err = new Error('WebGPU is not available in this browser.');
        err.code = 'webgpu';
        throw err;
      }
      choice = status.model;
      phase = 'downloading';
      keepStored();
      report(onProgress);
      return loadLib().then(function (lib) {
        return lib.CreateMLCEngine(choice.id, {
          logLevel: 'ERROR',
          initProgressCallback: function (info) {
            var text = info && info.text ? info.text : '';
            if (/from cache/i.test(text)) sawCacheText = true;
            progress = info && typeof info.progress === 'number' ? info.progress : progress;
            detail = text;
            phase = 'downloading';
            report(onProgress);
          }
        }, {
          context_window_size: 1024,
          temperature: 0
        });
      });
    }).then(function (engine) {
      phase = 'ready';
      progress = 1;
      cachedConfirmed = sawCacheText;
      detail = cachedConfirmed ? 'from cache' : 'downloaded';
      report(onProgress);
      return engine;
    });
    enginePromise.catch(function (err) {
      enginePromise = null;
      failedMessage = err && err.message ? err.message : 'The model did not load.';
      if (phase !== 'unavailable') phase = 'failed';
      report(onProgress);
    });
    return enginePromise;
  }

  function markFailed(message) {
    if (phase === 'ready') return snapshot();
    phase = 'failed';
    failedMessage = message || failedMessage || 'The model did not finish.';
    if (enginePromise) {
      enginePromise = null;
    }
    return snapshot();
  }

  function replyText(reply) {
    var choice0 = reply && reply.choices && reply.choices[0];
    var message = choice0 && choice0.message;
    return message && message.content ? String(message.content) : '';
  }

  function asciiSchema(schema) {
    var source = schema;
    if (typeof schema === 'string') {
      try { source = JSON.parse(schema); } catch (err) { return schema; }
    }
    if (!source || typeof source !== 'object') return JSON.stringify({ type: 'object', properties: {} });
    var properties = {};
    var raw = source.properties || {};
    Object.keys(raw).forEach(function (key) {
      var item = raw[key] || {};
      var description = String(item.description || key).replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48);
      properties[key] = { type: 'string', description: description || key };
    });
    return JSON.stringify({
      type: 'object',
      properties: properties,
      additionalProperties: false
    });
  }

  async function complete(prompt, maxTokens) {
    var engine = await withTimeout(ensure(), 12000, 'The private model did not start.');
    if (engine.resetChat) await engine.resetChat();
    var reply = await withTimeout(engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: maxTokens || 8,
      stop: ['\n', '.']
    }), 12000, 'The private model did not answer.');
    return replyText(reply);
  }

  async function completeJson(prompt, schema, ms) {
    var limit = ms || 12000;
    var engine = await withTimeout(ensure(), limit, 'The private model did not start.');
    if (engine.resetChat) await engine.resetChat();
    var reply = await withTimeout(engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 96,
      response_format: { type: 'json_object', schema: asciiSchema(schema) }
    }), limit, 'The private model did not answer.');
    var text = replyText(reply);
    try { return JSON.parse(text); } catch (err) { return {}; }
  }

  function applyTestState(partial) {
    partial = partial || {};
    if (partial.phase) phase = partial.phase;
    if (partial.choice) choice = partial.choice;
    if (partial.modelId === 'f16') choice = F16;
    if (partial.modelId === 'f32') choice = F32;
    if (typeof partial.progress === 'number') progress = partial.progress;
    if (typeof partial.cachedConfirmed === 'boolean') cachedConfirmed = partial.cachedConfirmed;
    if (partial.detail) detail = partial.detail;
    if (partial.error) failedMessage = partial.error;
    return snapshot();
  }

  global.FormLLM = {
    gpu: gpu,
    ensure: ensure,
    complete: complete,
    completeJson: completeJson,
    current: function () { return choice; },
    snapshot: snapshot,
    markFailed: markFailed,
    applyTestState: applyTestState,
    models: { f16: F16, f32: F32 }
  };
})(window);
