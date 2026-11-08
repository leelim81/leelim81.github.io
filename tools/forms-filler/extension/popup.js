/* Popup only. It does not watch pages. A click scans the active tab, then a second click writes the checked values. */
function $(id) { return document.getElementById(id); }

function say(text) { $('status').textContent = text || ''; }

function bad(key) { return key === '__proto__' || key === 'constructor' || key === 'prototype'; }

async function profiles() {
  var data = await chrome.storage.local.get('bundle');
  var bundle = data.bundle;
  if (!bundle || bundle.kind !== 'forms-filler-profiles' || bundle.schema !== 1) return [];
  return bundle.profiles || [];
}

async function paintProfiles() {
  var list = await profiles();
  var select = $('profile');
  select.textContent = '';
  list.forEach(function (profile) {
    var opt = document.createElement('option');
    opt.value = profile.id;
    opt.textContent = profile.name;
    select.appendChild(opt);
  });
  if (!list.length) say('Import a profile JSON from Forms Filler. Nothing is stored until you do.');
}

async function activeTab() {
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function scanTab(tab) {
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['scan.js'] });
  var packed = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: function () { return globalThis.__ffScan; }
  });
  return packed && packed[0] && packed[0].result;
}

async function writeTab(tab, jobs) {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: function (list) { globalThis.__ffJobs = list; },
    args: [jobs]
  });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['apply.js'] });
  var packed = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: function () { return globalThis.__ffApply; }
  });
  return packed && packed[0] && packed[0].result;
}

var lastPlan = [];
var lastScan = null;
var lastFacts = [];

function render(rows, unsupported) {
  var list = $('preview');
  list.textContent = '';
  lastPlan = rows;
  rows.forEach(function (row, index) {
    var li = document.createElement('li');
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.disabled = !row.fact || !!row.skip && row.skip !== 'nonempty';
    box.checked = !!row.fact && !row.skip;
    box.dataset.index = String(index);
    var text = document.createElement('span');
    var name = row.field.label || row.field.name || row.field.tag;
    if (row.fact && !row.skip) text.textContent = name + ' ← ' + row.fact.value;
    else if (row.skip === 'nonempty') text.textContent = name + ' already has a value. Check to replace it.';
    else if (row.skip === 'secret' || row.skip === 'hidden' || row.skip === 'disabled' || row.skip === 'readonly') text.textContent = name + ' left alone (' + row.skip + ').';
    else if (row.skip === 'ambiguous') text.textContent = name + ' matches more than one saved value, so it stays blank.';
    else if (row.skip === 'role') text.textContent = name + ' belongs to the ' + (row.field.role || 'other') + ' section. Choose that role, or leave it blank.';
    else if (row.skip === 'opaque-section') text.textContent = name + ' has a section id. That id is not treated as a person, so it stays blank.';
    else if (row.skip === 'role-conflict') text.textContent = name + ' has conflicting role words. It stays blank.';
    else if (row.skip === 'repeat') text.textContent = name + ' repeats a ' + (row.field.role || 'page') + ' field. One person is not copied into both.';
    else if (row.skip === 'file') text.textContent = name + ' is a file field. It stays empty.';
    else text.textContent = name + ' has no saved value.';
    li.appendChild(box);
    li.appendChild(text);
    list.appendChild(li);
  });
  if (unsupported && (unsupported.shadow || unsupported.frames)) {
    var note = document.createElement('li');
    note.textContent = 'Not filled: ' + unsupported.shadow + ' shadow tree(s), ' + unsupported.frames + ' frame(s).';
    list.appendChild(note);
  }
}

$('file').addEventListener('change', async function () {
  var file = $('file').files && $('file').files[0];
  if (!file) return;
  var text = await file.text();
  if (text.length > 200000) { say('That file is too large.'); return; }
  var raw;
  try { raw = JSON.parse(text); } catch (err) { say('That file is not JSON.'); return; }
  if (!raw || raw.kind !== 'forms-filler-profiles' || raw.schema !== 1 || !Array.isArray(raw.profiles)) {
    say('That file is not a profile export.');
    return;
  }
  var clean = { kind: 'forms-filler-profiles', schema: 1, profiles: [] };
  for (var i = 0; i < raw.profiles.length && i < 30; i++) {
    var profile = raw.profiles[i];
    if (!profile || typeof profile.name !== 'string' || !Array.isArray(profile.facts)) { say('A profile was malformed.'); return; }
    if (bad(profile.name)) { say('A profile was rejected.'); return; }
    var facts = [];
    for (var f = 0; f < profile.facts.length && f < 50; f++) {
      var fact = profile.facts[f];
      if (!fact || typeof fact.value !== 'string' || typeof fact.key !== 'string') { say('A value was malformed.'); return; }
      if (bad(fact.key) || bad(fact.label) || fact.status === 'unconfirmed') { say('A value was rejected.'); return; }
      facts.push({ key: fact.key, label: String(fact.label || fact.key).slice(0, 40), value: fact.value.slice(0, 400), status: 'confirmed' });
    }
    clean.profiles.push({ id: String(profile.id || ('p' + i)).slice(0, 40), name: profile.name.slice(0, 80), facts: facts });
  }
  await chrome.storage.local.set({ bundle: clean });
  say('Imported ' + clean.profiles.length + ' profile(s) on this browser.');
  await paintProfiles();
});

function paintRoles(roles) {
  var select = $('role');
  var previous = select.value;
  select.textContent = '';
  var none = document.createElement('option');
  none.value = '';
  none.textContent = 'Only fields with no role';
  select.appendChild(none);
  (roles || []).forEach(function (role) {
    var opt = document.createElement('option');
    opt.value = role;
    opt.textContent = role;
    select.appendChild(opt);
  });
  if (previous && (roles || []).indexOf(previous) >= 0) select.value = previous;
  else select.value = '';
}
function showPlan() {
  if (!lastScan) return;
  render(FormMatch.plan(lastScan, lastFacts, $('role').value), lastScan.unsupported);
}
$('role').addEventListener('change', function () {
  showPlan();
  say('The role changed, so review the list again. Fill copies only the checked values.');
});
$('look').addEventListener('click', async function () {
  var list = await profiles();
  var profile = list.filter(function (item) { return item.id === $('profile').value; })[0];
  if (!profile) { say('Choose a profile first.'); return; }
  var tab = await activeTab();
  if (!tab || !tab.id) { say('No page is open.'); return; }
  try {
    lastScan = await scanTab(tab);
    lastFacts = profile.facts;
    paintRoles(lastScan.roles);
    showPlan();
    say('Check the list, then fill. Fill copies those values into this website now. Nothing is submitted.');
  } catch (err) {
    say('This page did not allow a look. Open the form, then click the extension.');
  }
});

$('fill').addEventListener('click', async function () {
  var jobs = [];
  $('preview').querySelectorAll('input[type="checkbox"]').forEach(function (box) {
    if (!box.checked) return;
    var row = lastPlan[Number(box.dataset.index)];
    if (!row || !row.fact || (row.skip && row.skip !== 'nonempty')) return;
    jobs.push({
      token: row.field.token,
      value: row.fact.value,
      replace: row.skip === 'nonempty',
      label: row.field.label,
      role: row.field.role || '',
      opaqueSection: row.field.opaqueSection || ''
    });
  });
  if (!jobs.length) { say('Nothing checked.'); return; }
  var tab = await activeTab();
  try {
    var fresh = await scanTab(tab);
    var stale = 0;
    var current = [];
    jobs.forEach(function (job) {
      var field = (fresh.fields || []).filter(function (item) { return item.token === job.token; })[0];
      if (!field || field.label !== job.label || (field.role || '') !== job.role || (field.opaqueSection || '') !== job.opaqueSection) { stale++; return; }
      if (!job.replace && !field.empty) { stale++; return; }
      if (field.secret || field.hidden || field.disabled || field.readOnly || field.file || field.roleConflict) { stale++; return; }
      current.push({ token: job.token, value: job.value, replace: job.replace });
    });
    if (!current.length) { say('The page changed since the preview. Look again before filling.'); return; }
    var result = await writeTab(tab, current);
    var wrote = ((result && result.touched) || []).length;
    var rejected = ((result && result.rejected) || []).length;
    say('Wrote ' + wrote + ' field(s) into this page. The site can read them now. The page was not submitted.' + (stale || rejected ? ' ' + (stale + rejected) + ' field(s) were left because the page changed or cleared them. Look again for those.' : ''));
  } catch (err) {
    say('The page was not changed.');
  }
});

$('drop').addEventListener('click', async function () {
  await chrome.storage.local.remove('bundle');
  await paintProfiles();
  say('Removed the imported copy on this browser. Forms Filler’s own saved values are untouched.');
});

paintProfiles();
