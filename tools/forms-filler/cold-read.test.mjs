import assert from 'assert';
import { readFileSync } from 'fs';
import vm from 'vm';

function canvas() {
  const node = {
    width: 1,
    height: 1,
    getContext() {
      return {
        fillStyle: '',
        fillRect() {},
        drawImage() {},
        save() {},
        restore() {},
        translate() {},
        rotate() {},
        scale() {},
        transform() {},
        getImageData(x, y, w, h) {
          const width = w || node.width || 1;
          const height = h || node.height || 1;
          return { width: width, height: height, data: new Uint8ClampedArray(width * height * 4) };
        },
        putImageData() {}
      };
    }
  };
  return node;
}

function load(hooks) {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    Date,
    Math,
    JSON,
    Error,
    Uint8Array,
    Uint8ClampedArray,
    Uint32Array,
    Blob,
    URL,
    TextEncoder,
    location: { href: 'http://127.0.0.1/tools/forms-filler/index.html' },
    document: { createElement: () => canvas() },
    createImageBitmap: async () => ({ width: 80, height: 50, close() {} }),
    Tesseract: { createWorker() { throw new Error('real worker must not run'); } },
    FormFacts: {
      identityRead() {
        return { blk: '', name: 'Ada Lane', nric: 'S1234567D', nricValid: true, nricConf: 90, labeled: true };
      },
      identityVote(bag) {
        if (!bag || bag.length < 2) return null;
        return { name: 'Ada Lane', nric: 'S1234567D', nricChecked: true };
      },
      keepCardWords() { return true; }
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  let clock = 1000;
  sandbox.__ffNow = () => clock;
  sandbox.__ffAdvance = (ms) => { clock += ms; };
  sandbox.__ffReadBudgetMs = 15000;
  Object.assign(sandbox, hooks(sandbox));
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('./extract.js', import.meta.url), 'utf8'), sandbox, { filename: 'extract.js' });
  return sandbox;
}

function cardWords() {
  return {
    data: {
      text: 'Ada Lane\nS1234567D',
      words: [{
        text: '1234',
        bbox: { x0: 10, y0: 10, x1: 50, y1: 30 },
        symbols: []
      }]
    }
  };
}

function workerFactory(recognize) {
  return () => Promise.resolve({
    setParameters() { return Promise.resolve(); },
    recognize,
    terminate() { return Promise.resolve(); }
  });
}

async function readAfterSlowInit(initMs) {
  let created = 0;
  const sandbox = load(() => ({
    __ffCreateWorker() {
      created += 1;
      return new Promise((resolve) => {
        sandboxAdvance(initMs);
        setTimeout(() => resolve(workerFactory(() => new Promise((done) => {
          sandboxAdvance(4000);
          setTimeout(() => done(cardWords()), 20);
        }))()), 30);
      });
    }
  }));
  function sandboxAdvance(ms) { sandbox.__ffAdvance(ms); }
  const started = sandbox.__ffNow();
  const read = await sandbox.FormExtract.spatial(new Uint8Array([1, 2, 3, 4]), 'image/png');
  return { read, created, elapsed: sandbox.__ffNow() - started, options: sandbox.__ffOcrOptions };
}

const slow12 = await readAfterSlowInit(12000);
assert.equal(slow12.created, 1);
assert.ok(slow12.elapsed >= 12000, 'init delay is outside the read clock');
assert.ok(/Ada Lane/.test(slow12.read.text), slow12.read.text);
assert.ok(/S1234567D/.test(slow12.read.text), slow12.read.text);
assert.equal(slow12.options.cacheMethod, 'write');
assert.ok(/\/tools\/forms-filler\/vendor\/tesseract$/.test(slow12.options.langPath), slow12.options.langPath);
assert.equal(/jsdelivr|cdn\./i.test(JSON.stringify(slow12.options)), false);

const slow20 = await readAfterSlowInit(20000);
assert.equal(slow20.created, 1);
assert.ok(slow20.elapsed >= 20000);
assert.ok(/Ada Lane/.test(slow20.read.text), slow20.read.text);
assert.ok(/S1234567D/.test(slow20.read.text));

const retry = load(() => ({
  __ffCreateWorker() {
    let calls = 0;
    return Promise.resolve({
      setParameters() { return Promise.resolve(); },
      recognize() {
        calls += 1;
        retry.calls = calls;
        if (calls === 1) {
          retry.sandbox.__ffAdvance(20000);
          return new Promise(() => {});
        }
        return Promise.resolve(cardWords());
      },
      terminate() { return Promise.resolve(); }
    });
  }
}));
retry.sandbox = retry;
const retried = await retry.FormExtract.spatial(new Uint8Array([1, 2, 3, 4]), 'image/png');
assert.ok(retry.calls >= 2, 'the first recognize is retried once');
assert.ok(/Ada Lane/.test(retried.text), retried.text);

const glyph = load((sandbox) => ({
  FormFacts: {
    identityRead() {
      return { blk: '1234', name: 'Ada Lane', nric: 'S1234567D', nricValid: true, nricConf: 90, labeled: true };
    },
    identityVote(bag) {
      if (!bag || bag.length < 2) return null;
      return { name: 'Ada Lane', nric: 'S1234567D', nricChecked: true };
    },
    keepCardWords() { return true; }
  },
  __ffCreateWorker() {
    return Promise.resolve({
      setParameters() { return Promise.resolve(); },
      recognize(source) {
        if (source && source.width && source.width < 400) {
          sandbox.__ffGlyphCalls = (sandbox.__ffGlyphCalls || 0) + 1;
          return Promise.reject(new Error('budget'));
        }
        return Promise.resolve(cardWords());
      },
      terminate() { return Promise.resolve(); }
    });
  }
}));
const glyphRead = await glyph.FormExtract.spatial(new Uint8Array([1, 2, 3, 4]), 'image/png');
assert.ok(glyph.__ffGlyphCalls >= 1, 'glyph re-read ran');
assert.ok(/Ada Lane/.test(glyphRead.text), glyphRead.text);
assert.ok(/S1234567D/.test(glyphRead.text));

const room = load(() => ({}));
const session = room.FormExtract.openRead();
session._ffRecognizeStarted = true;
session._ffRecognizeAt = 1000;
session._ffBudgetUntil = 16000;
room.__ffNow = () => 15600;
assert.equal(room.FormExtract.glyphRoom(session), false);
room.__ffNow = () => 1000;
session._ffGlyphOwnUntil = 2000;
assert.equal(room.FormExtract.glyphRoom(session), true);
room.__ffNow = () => 2000;
assert.equal(room.FormExtract.glyphRoom(session), false);

assert.equal(room.FormExtract.keepPhotoBytes({ message: 'budget' }), true);
assert.equal(room.FormExtract.keepPhotoBytes({ message: 'cancelled' }), false);
assert.equal(room.FormExtract.keepPhotoBytes(null), false);

const warmed = load(() => ({
  __ffCreateWorker() {
    warmed.created = (warmed.created || 0) + 1;
    return Promise.resolve({
      setParameters() { return Promise.resolve(); },
      recognize() { return Promise.resolve(cardWords()); },
      terminate() { return Promise.resolve(); }
    });
  }
}));
await warmed.FormExtract.warm();
await warmed.FormExtract.spatial(new Uint8Array([1, 2, 3, 4]), 'image/png');
assert.equal(warmed.created, 1);

console.log('cold-read tests passed');
