/* Manager for the on-browser profile store. */
(function () {
  function $(id) { return document.getElementById(id); }
  function say(text) { if ($('profileMsg')) $('profileMsg').textContent = text || ''; }

  async function vault() {
    var loaded = await FormProfiles.load();
    if (!loaded.ok) {
      say(loaded.reason === 'quota' ? 'This browser has no room to store more values.' : 'This browser blocked local storage. Nothing was saved.');
      return null;
    }
    return loaded.vault;
  }

  async function save(next, message) {
    var stored = await FormProfiles.persist(next);
    if (!stored.ok) {
      say(stored.reason === 'quota' ? 'This browser has no room to store more values.' : 'This browser blocked local storage. Nothing was saved.');
      return;
    }
    await paint();
    if (message) say(message);
  }

  var paintSerial = 0;
  var selectPersonId = '';

  function typedFact() {
    return $('factValue') ? String($('factValue').value || '').replace(/^\s+|\s+$/g, '') : '';
  }
  function finishPersonAdded(personId) {
    var box = typedFact();
    if (!box) {
      say('Person added on this browser.');
      return;
    }
    if (selectedId() === personId) {
      say('Person added on this browser. The value in the box was not saved yet. Press Add value to save it.');
      return;
    }
    say('Person added on this browser. The value in the box was not saved.');
  }

  function selectedId() { return $('profilePick') ? $('profilePick').value : ''; }

  function clearFactControls() {
    if ($('profileFacts')) $('profileFacts').textContent = '';
    if ($('profilePending')) $('profilePending').textContent = '';
  }

  function rowIsCurrent(profileId) {
    if (selectPersonId) return false;
    return !!profileId && profileId === selectedId();
  }

  async function paint() {
    var ticket = ++paintSerial;
    var data = await vault();
    if (ticket !== paintSerial || !data || !$('profilePick')) return;
    var pick = $('profilePick');
    var previous = pick.value;
    var prefer = selectPersonId;
    if (prefer && !data.profiles.some(function (p) { return p.id === prefer; })) {
      say('That person is not saved yet.');
      return;
    }
    pick.textContent = '';
    data.profiles.forEach(function (profile) {
      var opt = document.createElement('option');
      opt.value = profile.id;
      opt.textContent = profile.name;
      pick.appendChild(opt);
    });
    var chosen = '';
    if (prefer) chosen = prefer;
    else if (previous && data.profiles.some(function (p) { return p.id === previous; })) chosen = previous;
    else if (data.profiles[0]) chosen = data.profiles[0].id;
    if (chosen) pick.value = chosen;
    if (prefer && chosen === prefer && selectPersonId === prefer) selectPersonId = '';
    var profile = data.profiles.filter(function (p) { return p.id === chosen; })[0];
    var list = $('profileFacts');
    list.textContent = '';
    if (!data.profiles.length) {
      var empty = document.createElement('li');
      empty.textContent = 'No one is saved yet. Filling from a reference can add a person, or use New person.';
      list.appendChild(empty);
    }
    if (profile) {
      profile.facts.forEach(function (fact) {
        var li = document.createElement('li');
        var label = document.createElement('span');
        label.textContent = (fact.label || fact.key) + ' (' + fact.status + ', ' + fact.origin + ')';
        var input = document.createElement('input');
        input.type = 'text';
        input.value = fact.value;
        input.setAttribute('aria-label', fact.label || fact.key);
        var saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn';
        saveBtn.textContent = 'Save correction';
        saveBtn.addEventListener('click', async function () {
          var profileId = profile.id;
          var factId = fact.id;
          var value = input.value;
          if (!rowIsCurrent(profileId)) {
            say(selectPersonId ? 'That person is not saved yet. Nothing was written.' : 'That value is not for the selected person. Nothing was written.');
            return;
          }
          var stored = await FormProfiles.persist(null, function (current) {
            var edited = FormProfiles.editFact(current, profileId, factId, value);
            if (!edited.ok) return { ok: false, reason: edited.reason || 'cancelled' };
            return { ok: true, vault: edited.vault };
          });
          if (!stored.ok) { say('That value was not saved.'); return; }
          await paint();
          say('Saved on this browser.');
        });
        var drop = document.createElement('button');
        drop.type = 'button';
        drop.className = 'btn';
        drop.textContent = 'Delete';
        drop.addEventListener('click', async function () {
          var profileId = profile.id;
          var factId = fact.id;
          if (!rowIsCurrent(profileId)) {
            say(selectPersonId ? 'That person is not saved yet. Nothing was written.' : 'That value is not for the selected person. Nothing was written.');
            return;
          }
          var stored = await FormProfiles.persist(null, function (current) {
            return { ok: true, vault: FormProfiles.deleteFact(current, profileId, factId).vault };
          });
          if (!stored.ok) { say('This browser blocked local storage. Nothing was saved.'); return; }
          await paint();
          say('Deleted.');
        });
        li.appendChild(label);
        li.appendChild(input);
        li.appendChild(saveBtn);
        li.appendChild(drop);
        list.appendChild(li);
      });
    }
    var pending = $('profilePending');
    pending.textContent = '';
    if (data.pending.length) {
      var head = document.createElement('p');
      head.textContent = data.pending.length + ' value(s) are not filed under a person yet.';
      pending.appendChild(head);
      data.pending.forEach(function (item) {
        var row = document.createElement('p');
        row.textContent = item.key + ': ' + item.value + ' (' + item.reason + ')';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn';
        btn.textContent = 'File under the selected person';
        btn.addEventListener('click', async function () {
          var profileId = chosen;
          var pendingId = item.id;
          if (!profileId) { say('Choose a person first.'); return; }
          if (!rowIsCurrent(profileId)) {
            say(selectPersonId ? 'That person is not saved yet. Nothing was written.' : 'That value is not for the selected person. Nothing was written.');
            return;
          }
          var stored = await FormProfiles.persist(null, function (current) {
            var assigned = FormProfiles.assignPending(current, pendingId, profileId);
            if (!assigned.ok) return { ok: false, reason: assigned.reason || 'cancelled' };
            return { ok: true, vault: assigned.vault };
          });
          if (!stored.ok) {
            say(stored.reason === 'needs-mapping' || stored.reason === 'missing' ? 'That person is not saved yet. Nothing was written.' : 'That value was not filed.');
            return;
          }
          await paint();
          say('Filed under the selected person.');
        });
        row.appendChild(btn);
        pending.appendChild(row);
      });
    }
  }

  function setSavedOpen(open) {
    var box = $('profileBox');
    var toggle = $('profileToggle');
    if (!box || !toggle) return;
    var wasOpen = !box.hidden;
    box.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && !wasOpen) box.focus();
    if (!open && wasOpen) toggle.focus();
  }

  function boot() {
    if (!$('profilePick') || !window.FormProfiles) return;
    var key = $('factKey');
    FormProfiles.CANON.concat(['custom']).forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      key.appendChild(opt);
    });
    key.addEventListener('change', function () { $('factLabel').hidden = key.value !== 'custom'; });
    $('profileAdd').addEventListener('click', async function () {
      var raw = window.prompt('Name for this person');
      if (raw == null) return;
      var name = String(raw).replace(/^\s+|\s+$/g, '').slice(0, 80);
      if (!name) return;
      var personId = Math.random().toString(36).slice(2, 12);
      var now = new Date().toISOString();
      selectPersonId = personId;
      paintSerial += 1;
      clearFactControls();
      var pick = $('profilePick');
      if (pick) {
        var shown = document.createElement('option');
        shown.value = personId;
        shown.textContent = name;
        pick.appendChild(shown);
        pick.value = personId;
      }
      var stored = await FormProfiles.persist(null, function (current) {
        if ((current.profiles || []).some(function (p) { return p.id === personId; })) return { ok: true, unchanged: true, vault: current };
        if (current.profiles.length >= 30) return { ok: false, reason: 'full' };
        current.profiles.push({ id: personId, name: name, createdAt: now, updatedAt: now, facts: [] });
        return { ok: true, vault: current };
      });
      if (!stored.ok) {
        if (selectPersonId === personId) selectPersonId = '';
        say(stored.reason === 'full' ? 'Too many people are stored.' : 'This browser blocked local storage. Nothing was saved.');
        await paint();
        return;
      }
      await paint();
      finishPersonAdded(personId);
    });
    $('profileDelete').addEventListener('click', async function () {
      var profileId = selectedId();
      if (!profileId) return;
      var stored = await FormProfiles.persist(null, function (current) {
        return { ok: true, vault: FormProfiles.deleteProfile(current, profileId).vault };
      });
      if (!stored.ok) { say('This browser blocked local storage. Nothing was saved.'); return; }
      await paint();
      say('Person deleted.');
    });
    $('factAdd').addEventListener('click', async function () {
      var profileId = selectedId();
      if (!profileId) { say('Choose a person first.'); return; }
      if (selectPersonId && profileId === selectPersonId) {
        say('That person is not saved yet. Nothing was written.');
        return;
      }
      var key = $('factKey').value;
      var label = $('factLabel').value;
      var value = $('factValue').value;
      var stored = await FormProfiles.persist(null, function (current) {
        var result = key === 'custom'
          ? FormProfiles.addCustom(current, profileId, label, value)
          : FormProfiles.confirmFact(current, profileId, key, value);
        if (!result.ok) return { ok: false, reason: result.reason || 'cancelled' };
        return { ok: true, vault: result.vault };
      });
      if (!stored.ok) {
        say(stored.reason === 'needs-mapping' || stored.reason === 'missing' ? 'That person is not saved yet. Nothing was written.' : 'That value was not saved.');
        return;
      }
      $('factValue').value = '';
      await paint();
      say('Saved on this browser.');
    });
    if ($('profileToggle')) {
      $('profileToggle').addEventListener('click', function () { setSavedOpen($('profileBox').hidden); });
    }
    if ($('profileClose')) {
      $('profileClose').addEventListener('click', function () { setSavedOpen(false); });
    }
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !$('profileBox') || $('profileBox').hidden) return;
      var active = document.activeElement;
      if (active !== $('profileBox') && !$('profileBox').contains(active)) return;
      event.preventDefault();
      setSavedOpen(false);
    });
    $('profileExport').addEventListener('click', async function () {
      var current = await vault();
      if (!current) return;
      var bundle = FormProfiles.exportBundle(current);
      if (!bundle.profiles.length) {
        say('Nothing confirmed yet. Confirm a value, then export. Unconfirmed reads stay on this site.');
        return;
      }
      var blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'forms-filler-profiles.json';
      link.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      say('Downloaded confirmed values only.');
    });
    $('profileImport').addEventListener('change', async function () {
      var file = $('profileImport').files && $('profileImport').files[0];
      $('profileImport').value = '';
      if (!file) return;
      var text = await file.text();
      var imported = FormProfiles.importBundle(text);
      if (!imported.ok) { say('Import rejected (' + imported.reason + ').'); return; }
      await save(imported.vault, 'Imported on this browser.');
    });
    $('profileClear').addEventListener('click', async function () {
      var cleared = await FormProfiles.clearAll();
      if (!cleared.ok) { say('Could not clear storage (' + cleared.reason + ').'); return; }
      await paint();
      say('Cleared every saved person, value, and unfiled item.');
    });
    $('profilePick').addEventListener('change', function () {
      if (selectedId() !== selectPersonId) selectPersonId = '';
      clearFactControls();
      paint();
    });
    paint();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.FormProfileUI = { paint: paint, setSavedOpen: setSavedOpen };
})();
