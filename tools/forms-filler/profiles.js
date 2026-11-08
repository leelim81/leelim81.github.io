/* Persistent per-person facts. IndexedDB on this browser, not an account.
   Confirmed values are the only ones an export offers to the extension.
   A programmatic fill is not a confirmation. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FormProfiles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  var DB = 'tools-forms-profiles';
  var SCHEMA = 1;
  var CANON = ['name', 'nric', 'dob', 'phone', 'email', 'address', 'postal'];
  var LIMITS = { profiles: 30, facts: 50, pending: 80, value: 400, name: 80, json: 200000 };

  function empty() {
    return { schema: SCHEMA, profiles: [], pending: [] };
  }

  function id() {
    return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  }

  function now() { return new Date().toISOString(); }

  function cleanText(value, max) {
    var text = String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length > max) text = text.slice(0, max);
    return text;
  }

  function badKey(key) {
    return key === '__proto__' || key === 'constructor' || key === 'prototype';
  }

  function canonKey(key, label) {
    var raw = cleanText(key || label, 40).toLowerCase();
    if (badKey(raw)) return '';
    if (CANON.indexOf(raw) >= 0) return raw;
    if (raw === 'custom') return 'custom';
    return '';
  }

  function migrate(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty();
    if (raw.schema === 1 && Array.isArray(raw.profiles)) {
      return {
        schema: 1,
        profiles: raw.profiles.filter(function (p) { return p && typeof p === 'object'; }).slice(0, LIMITS.profiles),
        pending: Array.isArray(raw.pending) ? raw.pending.slice(0, LIMITS.pending) : []
      };
    }
    var vault = empty();
    var entries = Array.isArray(raw.entries) ? raw.entries : [];
    entries.forEach(function (entry) {
      if (!entry || typeof entry !== 'object') return;
      var person = cleanText(entry.person || entry.name, LIMITS.name);
      var key = canonKey(entry.key, entry.label);
      if (!person || !key) return;
      var profile = vault.profiles.filter(function (p) { return p.name === person; })[0];
      if (!profile) {
        profile = { id: id(), name: person, createdAt: now(), updatedAt: now(), facts: [] };
        vault.profiles.push(profile);
      }
      profile.facts.push({
        id: id(),
        key: key,
        label: cleanText(entry.label || key, 40),
        value: cleanText(entry.value, LIMITS.value),
        status: entry.corrected ? 'confirmed' : 'unconfirmed',
        origin: entry.corrected ? 'user' : 'reference',
        quote: '',
        updatedAt: now()
      });
    });
    return vault;
  }

  function profileById(vault, profileId) {
    return (vault.profiles || []).filter(function (p) { return p.id === profileId; })[0] || null;
  }

  function findProfileByName(vault, name) {
    var want = cleanText(name, LIMITS.name).toLowerCase();
    var hits = (vault.profiles || []).filter(function (p) { return p.name.toLowerCase() === want; });
    return hits.length === 1 ? hits[0] : null;
  }

  function putUnconfirmed(profile, fact) {
    var key = fact.key;
    var confirmed = profile.facts.filter(function (item) { return item.key === key && item.status === 'confirmed'; })[0];
    if (confirmed) return false;
    var slot = profile.facts.filter(function (item) { return item.key === key; })[0];
    if (slot) {
      slot.value = fact.value;
      slot.label = fact.label || slot.label;
      slot.status = 'unconfirmed';
      slot.origin = 'reference';
      slot.quote = fact.quote || '';
      slot.updatedAt = now();
      return true;
    }
    if (profile.facts.length >= LIMITS.facts) return false;
    profile.facts.push({
      id: id(),
      key: key,
      label: fact.label || key,
      value: fact.value,
      status: 'unconfirmed',
      origin: 'reference',
      quote: fact.quote || '',
      updatedAt: now()
    });
    return true;
  }

  function addPending(vault, item) {
    if (vault.pending.length >= LIMITS.pending) return;
    vault.pending.push(item);
  }

  function ingest(vault, extracted) {
    var next = migrate(JSON.parse(JSON.stringify(vault || empty())));
    var facts = (extracted && extracted.facts) || [];
    var names = facts.filter(function (fact) { return fact.kind === 'name' && fact.role === 'applicant' && fact.value; });
    var distinct = {};
    names.forEach(function (fact) { distinct[fact.value] = true; });
    var nameList = Object.keys(distinct);
    if (nameList.length !== 1) {
      facts.forEach(function (fact) {
        if (!fact || !fact.kind || !fact.value || fact.kind === 'mailbox') return;
        addPending(next, {
          id: id(),
          key: fact.kind,
          label: fact.kind,
          value: cleanText(fact.value, LIMITS.value),
          quote: cleanText(fact.quote, 180),
          role: fact.role || '',
          reason: nameList.length > 1 ? 'conflict' : 'unknown-person',
          updatedAt: now()
        });
      });
      return { vault: next, profileId: '', pending: next.pending.length };
    }
    var person = cleanText(nameList[0], LIMITS.name);
    var profile = findProfileByName(next, person);
    if (!profile) {
      if (next.profiles.length >= LIMITS.profiles) return { vault: next, profileId: '', pending: next.pending.length, reason: 'full' };
      profile = { id: id(), name: person, createdAt: now(), updatedAt: now(), facts: [] };
      next.profiles.push(profile);
    }
    var seen = {};
    facts.forEach(function (fact) {
      if (!fact || !fact.value || fact.kind === 'mailbox') return;
      if (fact.role && fact.role !== 'applicant') {
        addPending(next, {
          id: id(),
          key: fact.kind,
          label: fact.kind,
          value: cleanText(fact.value, LIMITS.value),
          quote: cleanText(fact.quote, 180),
          role: fact.role,
          reason: 'other-person',
          updatedAt: now()
        });
        return;
      }
      if (fact.role !== 'applicant') return;
      if (seen[fact.kind]) {
        addPending(next, {
          id: id(),
          key: fact.kind,
          label: fact.kind,
          value: cleanText(fact.value, LIMITS.value),
          quote: cleanText(fact.quote, 180),
          role: 'applicant',
          reason: 'conflict',
          updatedAt: now()
        });
        return;
      }
      seen[fact.kind] = fact.value;
      putUnconfirmed(profile, {
        key: fact.kind,
        label: fact.kind,
        value: cleanText(fact.value, LIMITS.value),
        quote: cleanText(fact.quote, 180)
      });
    });
    profile.updatedAt = now();
    return { vault: next, profileId: profile.id, pending: next.pending.length };
  }

  function confirmFact(vault, profileId, key, value) {
    var next = migrate(JSON.parse(JSON.stringify(vault)));
    var profile = profileById(next, profileId);
    var clean = canonKey(key, key);
    if (!profile || !clean) return { vault: next, ok: false, reason: 'needs-mapping' };
    var slot = profile.facts.filter(function (item) { return item.key === clean; })[0];
    var text = cleanText(value, LIMITS.value);
    if (!text) return { vault: next, ok: false, reason: 'empty' };
    if (!slot) {
      if (profile.facts.length >= LIMITS.facts) return { vault: next, ok: false, reason: 'full' };
      slot = { id: id(), key: clean, label: clean, value: text, status: 'confirmed', origin: 'user', quote: '', updatedAt: now() };
      profile.facts.push(slot);
    } else {
      slot.value = text;
      slot.status = 'confirmed';
      slot.origin = 'user';
      slot.updatedAt = now();
    }
    profile.updatedAt = now();
    return { vault: next, ok: true };
  }

  function noteFieldEdit(vault, edit) {
    var next = migrate(JSON.parse(JSON.stringify(vault)));
    if (!edit || !edit.profileId || !edit.key) return { vault: next, ok: false, reason: 'needs-mapping' };
    if (edit.kind === 'signature' || edit.floating) return { vault: next, ok: false, reason: 'not-a-fact' };
    if (String(edit.value || '') === String(edit.seed || '')) return { vault: next, ok: true, changed: false };
    var saved = confirmFact(next, edit.profileId, edit.key, edit.value);
    if (!saved.ok) return saved;
    var profile = profileById(saved.vault, edit.profileId);
    var slot = profile.facts.filter(function (item) { return item.key === canonKey(edit.key, edit.key); })[0];
    if (slot) slot.origin = 'pdf-field';
    return { vault: saved.vault, ok: true, changed: true };
  }

  function addCustom(vault, profileId, label, value) {
    var next = migrate(JSON.parse(JSON.stringify(vault)));
    var profile = profileById(next, profileId);
    var name = cleanText(label, 40);
    var text = cleanText(value, LIMITS.value);
    if (!profile || !name || !text || badKey(name.toLowerCase())) return { vault: next, ok: false, reason: 'needs-mapping' };
    if (profile.facts.length >= LIMITS.facts) return { vault: next, ok: false, reason: 'full' };
    profile.facts.push({
      id: id(),
      key: 'custom',
      label: name,
      value: text,
      status: 'confirmed',
      origin: 'user',
      quote: '',
      updatedAt: now()
    });
    profile.updatedAt = now();
    return { vault: next, ok: true };
  }

  function editFact(vault, profileId, factId, value) {
    var next = migrate(JSON.parse(JSON.stringify(vault)));
    var profile = profileById(next, profileId);
    if (!profile) return { vault: next, ok: false, reason: 'missing' };
    var slot = profile.facts.filter(function (item) { return item.id === factId; })[0];
    if (!slot) return { vault: next, ok: false, reason: 'missing' };
    var text = cleanText(value, LIMITS.value);
    if (!text) return { vault: next, ok: false, reason: 'empty' };
    slot.value = text;
    slot.status = 'confirmed';
    slot.origin = 'user';
    slot.updatedAt = now();
    profile.updatedAt = now();
    return { vault: next, ok: true };
  }

  function deleteFact(vault, profileId, factId) {
    var next = migrate(JSON.parse(JSON.stringify(vault)));
    var profile = profileById(next, profileId);
    if (!profile) return { vault: next, ok: false };
    profile.facts = profile.facts.filter(function (item) { return item.id !== factId; });
    profile.updatedAt = now();
    return { vault: next, ok: true };
  }

  function deleteProfile(vault, profileId) {
    var next = migrate(JSON.parse(JSON.stringify(vault)));
    next.profiles = next.profiles.filter(function (p) { return p.id !== profileId; });
    return { vault: next, ok: true };
  }

  function assignPending(vault, pendingId, profileId) {
    var next = migrate(JSON.parse(JSON.stringify(vault)));
    var item = next.pending.filter(function (row) { return row.id === pendingId; })[0];
    var profile = profileById(next, profileId);
    if (!item || !profile) return { vault: next, ok: false, reason: 'needs-mapping' };
    next.pending = next.pending.filter(function (row) { return row.id !== pendingId; });
    putUnconfirmed(profile, item);
    var slot = profile.facts.filter(function (fact) { return fact.key === item.key && fact.status !== 'confirmed'; })[0];
    if (slot && slot.value === item.value) {
      slot.status = 'confirmed';
      slot.origin = 'user';
    }
    return { vault: next, ok: true };
  }

  function exportBundle(vault) {
    var src = migrate(vault);
    return {
      kind: 'forms-filler-profiles',
      schema: 1,
      profiles: src.profiles.map(function (profile) {
        return {
          id: profile.id,
          name: profile.name,
          facts: profile.facts.filter(function (fact) { return fact.status === 'confirmed'; }).map(function (fact) {
            return { key: fact.key, label: fact.label, value: fact.value, status: 'confirmed' };
          })
        };
      }).filter(function (profile) { return profile.facts.length; })
    };
  }

  function importBundle(raw) {
    if (typeof raw === 'string') {
      if (raw.length > LIMITS.json) return { ok: false, reason: 'too-large' };
      try { raw = JSON.parse(raw); } catch (err) { return { ok: false, reason: 'malformed' }; }
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'malformed' };
    if (raw.kind !== 'forms-filler-profiles' || raw.schema !== 1) return { ok: false, reason: 'schema' };
    if (!Array.isArray(raw.profiles) || raw.profiles.length > LIMITS.profiles) return { ok: false, reason: 'malformed' };
    var vault = empty();
    for (var i = 0; i < raw.profiles.length; i++) {
      var profile = raw.profiles[i];
      if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return { ok: false, reason: 'malformed' };
      if (badKey(profile.id) || badKey(profile.name)) return { ok: false, reason: 'hostile' };
      var name = cleanText(profile.name, LIMITS.name);
      if (!name || !Array.isArray(profile.facts) || profile.facts.length > LIMITS.facts) return { ok: false, reason: 'malformed' };
      var facts = [];
      for (var f = 0; f < profile.facts.length; f++) {
        var fact = profile.facts[f];
        if (!fact || typeof fact !== 'object' || Array.isArray(fact)) return { ok: false, reason: 'malformed' };
        var key = fact.key === 'custom' ? 'custom' : canonKey(fact.key, fact.label);
        var label = cleanText(fact.label || key, 40);
        if (!key || badKey(key) || badKey(label.toLowerCase()) || typeof fact.value !== 'string') return { ok: false, reason: 'hostile' };
        var value = cleanText(fact.value, LIMITS.value);
        if (!value) return { ok: false, reason: 'malformed' };
        if (fact.status && fact.status !== 'confirmed') return { ok: false, reason: 'unconfirmed' };
        facts.push({ id: id(), key: key, label: label || key, value: value, status: 'confirmed', origin: 'user', quote: '', updatedAt: now() });
      }
      vault.profiles.push({ id: cleanText(profile.id, 40) || id(), name: name, createdAt: now(), updatedAt: now(), facts: facts });
    }
    return { ok: true, vault: vault };
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
      return { ok: true, vault: migrate(raw) };
    } catch (err) {
      return { ok: false, reason: reasonFromError(err), vault: empty() };
    }
  }

  async function persist(vault, decide) {
    if (!root.DeskDB) return { ok: false, reason: 'unavailable' };
    try {
      if (typeof decide === 'function' && root.DeskDB.update) {
        var outcome = await root.DeskDB.update(DB, 'vault', function (raw) {
          var current = migrate(raw);
          var decision = decide(current) || { ok: false, reason: 'cancelled' };
          if (!decision.ok) return { ok: false, reason: decision.reason || 'cancelled', write: false };
          if (decision.unchanged) return { ok: true, reason: 'unchanged', write: false, vault: current };
          return { ok: true, write: true, value: migrate(decision.vault), vault: decision.vault };
        });
        return { ok: !!outcome.ok, reason: outcome.reason || '', vault: outcome.vault };
      }
      await root.DeskDB.set(DB, 'vault', migrate(vault));
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: reasonFromError(err) };
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
    CANON: CANON,
    DB: DB,
    empty: empty,
    migrate: migrate,
    ingest: ingest,
    confirmFact: confirmFact,
    noteFieldEdit: noteFieldEdit,
    addCustom: addCustom,
    editFact: editFact,
    deleteFact: deleteFact,
    deleteProfile: deleteProfile,
    assignPending: assignPending,
    exportBundle: exportBundle,
    importBundle: importBundle,
    load: load,
    persist: persist,
    clearAll: clearAll
  };
});
