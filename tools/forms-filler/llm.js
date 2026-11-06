/* Local model only. Qwen2.5-1.5B Instruct via WebLLM.
   Phones with shader-f16 get the q4f16 build (~868 MB). Machines without
   that feature get the q4f32 build of the same model. Weights stay in
   the browser Cache Storage. There is no cloud model. */
(function (global) {
  /* 1.5B fits a phone that has fp16 shaders. Without fp16 the 1.5B
     build is too heavy to finish, so those browsers get the 0.5B model. */
  var F16 = {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen2.5 1.5B',
    megabytes: 868
  };
  var F32 = {
    id: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
    label: 'Qwen2.5 0.5B',
    megabytes: 390
  };
  var LIB = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/lib/index.js';
  var enginePromise = null;
  var choice = null;

  function gpu() {
    if (!navigator.gpu || typeof navigator.gpu.requestAdapter !== 'function') {
      return Promise.resolve({ ok: false, reason: 'missing' });
    }
    return navigator.gpu.requestAdapter().then(function (adapter) {
      if (!adapter) return { ok: false, reason: 'no-adapter' };
      var f16 = adapter.features && adapter.features.has('shader-f16');
      return { ok: true, f16: !!f16, model: f16 ? F16 : F32 };
    }).catch(function () {
      return { ok: false, reason: 'error' };
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

  function ensure(onProgress) {
    if (enginePromise) return enginePromise;
    enginePromise = gpu().then(function (status) {
      if (!status.ok) {
        var err = new Error('WebGPU is not available in this browser.');
        err.code = 'webgpu';
        throw err;
      }
      choice = status.model;
      keepStored();
      if (onProgress) {
        onProgress({
          progress: 0,
          cached: false,
          text: 'Downloading private model · ~' + choice.megabytes + ' MB'
        });
      }
      return loadLib().then(function (lib) {
        return lib.CreateMLCEngine(choice.id, {
          logLevel: 'ERROR',
          initProgressCallback: function (report) {
            if (!onProgress) return;
            var text = report && report.text ? report.text : '';
            var cached = /from cache/i.test(text);
            onProgress({
              progress: report && typeof report.progress === 'number' ? report.progress : 0,
              cached: cached,
              text: text
            });
          }
        }, {
          context_window_size: 1024,
          temperature: 0
        });
      });
    });
    enginePromise.catch(function () { enginePromise = null; });
    return enginePromise;
  }

  function replyText(reply) {
    var choice0 = reply && reply.choices && reply.choices[0];
    var message = choice0 && choice0.message;
    return message && message.content ? String(message.content) : '';
  }

  async function complete(prompt, maxTokens) {
    var engine = await ensure();
    if (engine.resetChat) await engine.resetChat();
    var reply = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: maxTokens || 8,
      stop: ['\n', '.']
    });
    return replyText(reply);
  }

  async function completeJson(prompt, schema) {
    var engine = await ensure();
    if (engine.resetChat) await engine.resetChat();
    var reply = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 480,
      response_format: { type: 'json_object', schema: schema }
    });
    var text = replyText(reply);
    try { return JSON.parse(text); } catch (err) { return {}; }
  }

  global.FormLLM = {
    gpu: gpu,
    ensure: ensure,
    complete: complete,
    completeJson: completeJson,
    current: function () { return choice; }
  };
})(window);
