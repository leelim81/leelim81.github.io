/* Tiny key-value store. Values may be large (PDF bytes, photo bytes). */
(function (global) {
  function open(name) {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(name, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function get(name, key) {
    return open(name).then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction('kv', 'readonly').objectStore('kv').get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }
  function set(name, key, value) {
    return open(name).then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function putAll(name, entries) {
    return open(name).then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('kv', 'readwrite');
        var store = tx.objectStore('kv');
        (entries || []).forEach(function (entry) { store.put(entry.value, entry.key); });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function clear(name) {
    return open(name).then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function update(name, key, mutate) {
    return open(name).then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('kv', 'readwrite');
        var store = tx.objectStore('kv');
        var result = { ok: false, reason: 'cancelled' };
        var req = store.get(key);
        req.onsuccess = function () {
          try {
            var decision = mutate(req.result);
            result = decision || { ok: false, reason: 'cancelled' };
            if (result.write) store.put(result.value, key);
          } catch (err) {
            reject(err);
            try { tx.abort(); } catch (ignore) {}
          }
        };
        tx.oncomplete = function () { resolve(result); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { if (tx.error) reject(tx.error); };
      });
    });
  }
  global.DeskDB = { get: get, set: set, putAll: putAll, clear: clear, update: update };
})(window);
