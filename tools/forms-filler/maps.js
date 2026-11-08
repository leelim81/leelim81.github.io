/* Blank-form maps. Geometry only, in this browser, not an account.
   A map never stores a value, a person, a profile id, a filename, or a signature. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FormMaps = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  var DB = 'tools-forms-maps';
  var SCHEMA = 1;
  var SHEET_VERSION = 1;
  var ROLES = ['applicant', 'patient', 'spouse', 'other'];
  var KEYS = ['name', 'nric', 'dob', 'phone', 'email', 'address', 'postal', 'custom'];
  var LIMITS = { maps: 20, slots: 40, name: 40 };

  function empty() { return { schema: SCHEMA, maps: [] }; }
  function id() { return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6); }
  function now() { return new Date().toISOString(); }
  function badKey(key) { return key === '__proto__' || key === 'constructor' || key === 'prototype'; }
  function num(value) {
    var n = Number(value);
    return isFinite(n) ? n : null;
  }

  function cleanName(value) {
    var text = String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length > LIMITS.name) text = text.slice(0, LIMITS.name);
    if (badKey(text)) return '';
    return text;
  }

  function slotOf(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (badKey(raw.key) || badKey(raw.role)) return null;
    if (KEYS.indexOf(raw.key) < 0 || ROLES.indexOf(raw.role) < 0) return null;
    var x = num(raw.x), y = num(raw.y), w = num(raw.w), h = num(raw.h);
    if (x == null || y == null || w == null || h == null) return null;
    if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1.001 || y + h > 1.001) return null;
    return {
      key: raw.key,
      role: raw.role,
      x: x, y: y, w: w, h: h,
      fontSize: Math.max(8, Math.min(96, num(raw.fontSize) || 14))
    };
  }

  function geometryOf(page) {
    var keys = ['rotation', 'userUnit', 'cropX', 'cropY', 'cropWidth', 'cropHeight'];
    var present = keys.some(function (key) { return page[key] != null && page[key] !== ''; });
    if (!present) return { historical: true };
    var rotation = num(page.rotation);
    var userUnit = num(page.userUnit);
    var cropX = num(page.cropX);
    var cropY = num(page.cropY);
    var cropWidth = num(page.cropWidth);
    var cropHeight = num(page.cropHeight);
    if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) return null;
    if (userUnit == null || userUnit <= 0 || userUnit > 75000) return null;
    if (cropX == null || cropY == null || cropWidth == null || cropHeight == null) return null;
    if (!(cropWidth > 0) || !(cropHeight > 0)) return null;
    return {
      historical: false,
      rotation: rotation,
      userUnit: userUnit,
      cropX: cropX,
      cropY: cropY,
      cropWidth: cropWidth,
      cropHeight: cropHeight
    };
  }

  function sheetOf(raw) {
    if (raw == null) return { absent: true };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    var keys = ['version', 'sourceW', 'sourceH', 'inW', 'inH', 'angle', 'cropX', 'cropY', 'cropW', 'cropH', 'outW', 'outH'];
    var out = {};
    for (var i = 0; i < keys.length; i++) {
      var n = num(raw[keys[i]]);
      if (n == null) return null;
      out[keys[i]] = n;
    }
    if (out.version !== Math.round(out.version) || out.version < 1) return null;
    if (!(out.sourceW > 0) || !(out.sourceH > 0) || !(out.inW > 0) || !(out.inH > 0)) return null;
    if (!(out.cropW > 0) || !(out.cropH > 0) || !(out.outW > 0) || !(out.outH > 0)) return null;
    if (out.cropX < 0 || out.cropY < 0) return null;
    if (out.cropX + out.cropW > out.inW + 0.5 || out.cropY + out.cropH > out.inH + 0.5) return null;
    return out;
  }

  function matchesSheet(stored, current) {
    if (!stored || stored.absent || !current) return false;
    var keys = ['version', 'sourceW', 'sourceH', 'inW', 'inH', 'angle', 'cropX', 'cropY', 'cropW', 'cropH', 'outW', 'outH'];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var a = Number(stored[key]);
      var b = Number(current[key]);
      if (!isFinite(a) || !isFinite(b)) return false;
      if (key === 'angle') {
        if (Math.abs(a - b) > 1e-6) return false;
      } else if (a !== b) return false;
    }
    return stored.version === SHEET_VERSION && current.version === SHEET_VERSION;
  }

  function matchesFrame(stored, frame) {
    if (!stored || !frame || !frame.media || !frame.crop || frame.ok === false) return false;
    if (Math.abs(stored.width - frame.media.width) > 0.5 || Math.abs(stored.height - frame.media.height) > 0.5) return false;
    if (stored.rotation == null) {
      return frame.rotation === 0
        && Math.abs(Number(frame.userUnit) - 1) <= 0.001
        && Math.abs(frame.crop.x - frame.media.x) <= 0.5
        && Math.abs(frame.crop.y - frame.media.y) <= 0.5
        && Math.abs(frame.crop.width - frame.media.width) <= 0.5
        && Math.abs(frame.crop.height - frame.media.height) <= 0.5;
    }
    return stored.rotation === frame.rotation
      && Math.abs(stored.userUnit - frame.userUnit) <= 0.001
      && Math.abs(stored.cropX - frame.crop.x) <= 0.5
      && Math.abs(stored.cropY - frame.crop.y) <= 0.5
      && Math.abs(stored.cropWidth - frame.crop.width) <= 0.5
      && Math.abs(stored.cropHeight - frame.crop.height) <= 0.5;
  }

  function mapOf(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (!/^[a-f0-9]{64}$/.test(String(raw.fileSha256 || ''))) return null;
    if (!Array.isArray(raw.pages) || !raw.pages.length || raw.pages.length > 20) return null;
    var pages = [];
    var roles = {};
    for (var i = 0; i < raw.pages.length; i++) {
      var page = raw.pages[i];
      if (!page || typeof page !== 'object' || Array.isArray(page)) return null;
      var width = num(page.width), height = num(page.height);
      if (!width || !height || width < 20 || height < 20) return null;
      var geometry = geometryOf(page);
      if (!geometry) return null;
      var slots = [];
      var list = Array.isArray(page.slots) ? page.slots : [];
      if (list.length > LIMITS.slots) return null;
      for (var s = 0; s < list.length; s++) {
        var slot = slotOf(list[s]);
        if (!slot) return null;
        roles[slot.role] = true;
        slots.push(slot);
      }
      var stored = { width: width, height: height, slots: slots };
      if (!geometry.historical) {
        stored.rotation = geometry.rotation;
        stored.userUnit = geometry.userUnit;
        stored.cropX = geometry.cropX;
        stored.cropY = geometry.cropY;
        stored.cropWidth = geometry.cropWidth;
        stored.cropHeight = geometry.cropHeight;
      }
      pages.push(stored);
    }
    if (Object.keys(roles).length > 1) return null;
    var sheet = sheetOf(raw.sheet);
    if (!sheet) return null;
    var stored = {
      id: cleanName(raw.id) || id(),
      name: cleanName(raw.name) || 'Blank map',
      fileSha256: String(raw.fileSha256),
      role: Object.keys(roles)[0] || 'applicant',
      createdAt: now(),
      updatedAt: now(),
      pages: pages
    };
    if (!sheet.absent) stored.sheet = sheet;
    return stored;
  }

  function migrate(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'malformed', vault: empty() };
    if (raw.schema !== SCHEMA || !Array.isArray(raw.maps)) return { ok: false, reason: 'version', vault: empty() };
    var maps = [];
    raw.maps.slice(0, LIMITS.maps).forEach(function (item) {
      var map = mapOf(item);
      if (map) maps.push(map);
    });
    return { ok: true, vault: { schema: SCHEMA, maps: maps } };
  }

  function saveMap(vault, draft) {
    var next = migrate(JSON.parse(JSON.stringify(vault || empty())));
    if (!next.ok && next.reason === 'version') return { ok: false, reason: 'version', vault: empty() };
    var base = next.ok ? next.vault : empty();
    var map = mapOf(draft);
    if (!map) return { ok: false, reason: 'malformed', vault: base };
    if (base.maps.length >= LIMITS.maps) return { ok: false, reason: 'full', vault: base };
    base.maps.push(map);
    return { ok: true, vault: base, map: map };
  }

  function deleteMap(vault, mapId) {
    var next = migrate(JSON.parse(JSON.stringify(vault || empty())));
    var base = next.ok ? next.vault : empty();
    base.maps = base.maps.filter(function (map) { return map.id !== mapId; });
    return { ok: true, vault: base };
  }

  function reasonFromError(err) {
    var name = err && (err.name || err.code);
    if (name === 'QuotaExceededError' || name === 22) return 'quota';
    if (name === 'SecurityError' || name === 'InvalidStateError') return 'blocked';
    return 'unavailable';
  }

  async function load() {
    if (!root.DeskDB) return { ok: false, reason: 'unavailable', vault: empty() };
    try {
      var raw = await root.DeskDB.get(DB, 'vault');
      if (!raw) return { ok: true, vault: empty() };
      return migrate(raw);
    } catch (err) {
      return { ok: false, reason: reasonFromError(err), vault: empty() };
    }
  }

  async function persist(vault) {
    if (!root.DeskDB) return { ok: false, reason: 'unavailable' };
    var clean = migrate(vault);
    if (!clean.ok) return clean;
    try {
      await root.DeskDB.set(DB, 'vault', clean.vault);
      return { ok: true, vault: clean.vault };
    } catch (err) {
      return { ok: false, reason: reasonFromError(err), vault: clean.vault };
    }
  }

  async function clearAll() {
    if (!root.DeskDB) return { ok: false, reason: 'unavailable' };
    try {
      await root.DeskDB.set(DB, 'vault', empty());
      return { ok: true, vault: empty() };
    } catch (err) {
      return { ok: false, reason: reasonFromError(err) };
    }
  }

  return {
    SCHEMA: SCHEMA,
    SHEET_VERSION: SHEET_VERSION,
    ROLES: ROLES,
    DB: DB,
    empty: empty,
    migrate: migrate,
    saveMap: saveMap,
    deleteMap: deleteMap,
    matchesFrame: matchesFrame,
    matchesSheet: matchesSheet,
    load: load,
    persist: persist,
    clearAll: clearAll
  };
});
