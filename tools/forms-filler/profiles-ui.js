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

  function selectedId() { return $('profilePick').value; }

  async function paint() {
    var data = await vault();
    if (!data || !$('profilePick')) return;
    var pick = $('profilePick');
    var previous = pick.value;
    pick.textContent = '';
    data.profiles.forEach(function (profile) {
      var opt = document.createElement('option');
      opt.value = profile.id;
      opt.textContent = profile.name;
      pick.appendChild(opt);
    });
    if (previous && data.profiles.some(function (p) { return p.id === previous; })) pick.value = previous;
    var profile = data.profiles.filter(function (p) { return p.id === pick.value; })[0];
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
          var current = await vault();
          if (!current) return;
          var edited = FormProfiles.editFact(current, profile.id, fact.id, input.value);
          if (!edited.ok) { say('That value was not saved.'); return; }
          await save(edited.vault, 'Saved on this browser.');
        });
        var drop = document.createElement('button');
        drop.type = 'button';
        drop.className = 'btn';
        drop.textContent = 'Delete';
        drop.addEventListener('click', async function () {
          var current = await vault();
          if (!current) return;
          await save(FormProfiles.deleteFact(current, profile.id, fact.id).vault, 'Deleted.');
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
          var current = await vault();
          if (!current || !selectedId()) { say('Choose a person first.'); return; }
          var assigned = FormProfiles.assignPending(current, item.id, selectedId());
          if (!assigned.ok) { say('That value was not filed.'); return; }
          await save(assigned.vault, 'Filed under the selected person.');
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
      var name = window.prompt('Name for this person');
      if (!name) return;
      var current = await vault();
      if (!current) return;
      if (current.profiles.length >= 30) { say('Too many people are stored.'); return; }
      current.profiles.push({ id: Math.random().toString(36).slice(2, 12), name: name.slice(0, 80), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), facts: [] });
      await save(current, 'Person added on this browser.');
    });
    $('profileDelete').addEventListener('click', async function () {
      var current = await vault();
      if (!current || !selectedId()) return;
      await save(FormProfiles.deleteProfile(current, selectedId()).vault, 'Person deleted.');
    });
    $('factAdd').addEventListener('click', async function () {
      var current = await vault();
      if (!current || !selectedId()) { say('Choose a person first.'); return; }
      var result = $('factKey').value === 'custom'
        ? FormProfiles.addCustom(current, selectedId(), $('factLabel').value, $('factValue').value)
        : FormProfiles.confirmFact(current, selectedId(), $('factKey').value, $('factValue').value);
      if (!result.ok) { say('That value was not saved.'); return; }
      $('factValue').value = '';
      await save(result.vault, 'Saved on this browser.');
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
    $('profilePick').addEventListener('change', function () { paint(); });
    paint();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.FormProfileUI = { paint: paint, setSavedOpen: setSavedOpen };
})();
