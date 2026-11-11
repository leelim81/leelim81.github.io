// The coding workspace: task on the left, files and editor on the right, console and checks below.
// The task page and the mock test both use it.
import { payload } from "./content.js";
import { parseCSV } from "./csv.js";
import { add, ask, bytes, clear, h, icon, plural } from "./dom.js";
import { createEditor, highlight } from "./editor.js";
import { consoleLine, readOutput, rt, runCode, stopRuntime } from "./runtime.js";
import { S, getCode, save, setCode } from "./store.js";

const MAX_LINES = 3000;
const MOD = /Mac|iPhone|iPad/.test(navigator.platform || "") ? "Cmd" : "Ctrl";

function tabs(names, onPick) {
  const buttons = {};
  const el = h("div", { class: "tabs", role: "tablist" });
  for (const [id, label] of names) {
    buttons[id] = h("button", { class: "tab", type: "button", role: "tab", onclick: () => pick(id) }, label);
    el.append(buttons[id]);
  }
  function pick(id) {
    for (const [name, b] of Object.entries(buttons)) b.setAttribute("aria-selected", name === id ? "true" : "false");
    onPick(id);
  }
  return { el, pick, buttons };
}

// opts.mode: "practice" shows hints, the solution, and every check after a submit. "mock" keeps them back.
// opts.progress: { hints, peeked, solved } for this attempt. opts.onProgress(patch) saves a change to it.
// opts.onSubmit({ items, notes, error, passed, total }) fires after each submit.
export function workspace({ ex, key, mode, progress, onProgress, onSubmit, heading }) {
  const slot = key.replace(/[^\w-]/g, "_");
  const settings = S().settings;
  const practice = mode === "practice";
  let data = null;
  let busy = false;
  let outputs = [];
  let result = null;
  let revealed = false;
  let submittedAt = 0;
  let saveTimer = 0;
  let dirty = false;
  let preview = null;
  let alive = true;

  // ---- left: the task, hints, and the solution -------------------------------------------
  const sideBody = h("div", { class: "ws-side-body" });
  const sideTabs = tabs(practice ? [["task", "Task"], ["hints", "Hints"], ["solution", "Solution"]] : [["task", "Task"]], showSide);

  let sideNow = "task";
  function showSide(id) {
    sideNow = id;
    clear(sideBody);
    sideBody.scrollTop = 0;
    if (id === "task") {
      add(sideBody, heading ? h("h2", { class: "task-heading" }, heading) : null, h("div", { class: "prose task-text", html: ex.desc }));
      return;
    }
    if (id === "hints") {
      const list = h("ol", { class: "hints" });
      ex.hints.slice(0, progress.hints).forEach((text) => list.append(h("li", null, text)));
      add(sideBody, h("div", { class: "prose" }, h("p", null, "Three hints, from a nudge to the key step. The real test has none, so read the failing check first."), list));
      if (progress.hints < ex.hints.length) {
        sideBody.append(
          h("button", { class: "btn", type: "button", onclick: () => { onProgress({ hints: progress.hints + 1 }); showSide("hints"); } }, icon("hint"), `Show hint ${progress.hints + 1} of ${ex.hints.length}`),
        );
      } else sideBody.append(h("p", { class: "muted" }, "That is every hint. The Solution tab has a full reference answer."));
      return;
    }
    if (progress.peeked || progress.solved) {
      add(
        sideBody,
        h("div", { class: "prose" }, h("p", null, progress.solved ? "You solved it. Compare your code with the reference: look for steps it does in fewer lines." : "Read it, close it, then write it again from memory."), ex.notes ? h("p", { html: ex.notes }) : null),
        h("pre", { class: "code" }, h("code", { html: highlight(ex.solution) })),
      );
    } else {
      add(
        sideBody,
        h("div", { class: "prose" }, h("p", null, "The reference solution passes every check. Looking is fine. If you do, come back to this task tomorrow and write it from a blank file.")),
        h("button", { class: "btn", type: "button", onclick: () => { onProgress({ peeked: true }); showSide("solution"); } }, "Show the reference solution"),
      );
    }
  }

  // ---- files -----------------------------------------------------------------------------
  const fileList = h("div", { class: "ws-files" });

  function fileButton(f, kind) {
    const isCsv = /\.csv$/i.test(f.path);
    return h(
      "button",
      { class: "file" + (preview?.path === f.path ? " is-open" : ""), type: "button", title: `Preview ${f.path}`, onclick: () => openFile(f, kind) },
      icon(isCsv ? "table" : "file"),
      h("span", { class: "file-name" }, f.path),
      h("span", { class: "file-size" }, bytes(f.bytes)),
    );
  }

  function renderFiles() {
    clear(fileList);
    add(
      fileList,
      h("div", { class: "ws-files-head" }, "Task folder"),
      h("button", { class: "file" + (!preview ? " is-open" : ""), type: "button", onclick: () => closePreview() }, icon("code"), h("span", { class: "file-name" }, "solution.py")),
      ex.files.map((f) => fileButton(f, "input")),
    );
    if (outputs.length) add(fileList, h("div", { class: "ws-files-head" }, "Written by your code"), outputs.map((f) => fileButton(f, "output")));
  }

  // ---- editor and file preview -----------------------------------------------------------
  const editorHost = h("div", { class: "editor-host" });
  const previewHost = h("div", { class: "preview-host", hidden: true });
  const fileTabs = h("div", { class: "tabs file-tabs" });
  const saveNote = h("span", { class: "save-note muted", role: "status" });

  const editor = createEditor({
    parent: editorHost,
    doc: getCode(key) ?? ex.starter,
    autocomplete: settings.autocomplete,
    onChange: () => {
      dirty = true;
      saveNote.textContent = "";
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flush, 600);
    },
    onRun: () => go("run"),
    onTest: () => go("test"),
    onSave: () => {
      dirty = true;
      flush();
    },
  });

  function flush() {
    clearTimeout(saveTimer);
    if (!dirty) return;
    dirty = false;
    saveNote.textContent = setCode(key, editor.value) ? "Saved" : "Not saved: this browser is blocking storage";
  }

  function renderFileTabs() {
    clear(fileTabs);
    fileTabs.append(h("button", { class: "tab", type: "button", "aria-selected": String(!preview), onclick: () => closePreview() }, "solution.py"));
    if (preview) {
      fileTabs.append(
        h("span", { class: "tab tab-file", "aria-selected": "true" }, preview.path, h("button", { class: "tab-x", type: "button", "aria-label": `Close ${preview.path}`, onclick: () => closePreview() }, icon("x"))),
      );
    }
    fileTabs.append(
      h("span", { class: "tabs-end" }, saveNote, h("button", { class: "link-btn", type: "button", onclick: resetCode }, "Reset code")),
    );
  }

  function closePreview() {
    preview = null;
    previewHost.hidden = true;
    editorHost.hidden = false;
    renderFileTabs();
    renderFiles();
    editor.focus();
  }

  async function openFile(f, kind) {
    preview = { path: f.path };
    editorHost.hidden = true;
    previewHost.hidden = false;
    clear(previewHost).append(h("p", { class: "pv-note muted" }, "Loading the preview"));
    renderFileTabs();
    renderFiles();
    setPane("code");
    let text = "";
    let note = "";
    try {
      if (kind === "input") text = data ? data.inputs[f.path] : (await payload(ex.id)).inputs[f.path];
      else {
        const res = await readOutput(slot, f.path);
        if (res.binary) note = "This is a binary file, so there is no preview.";
        else {
          text = res.text;
          if (res.truncated) note = `Showing the first ${bytes(res.text.length)} of ${bytes(res.bytes)}.`;
        }
      }
    } catch (err) {
      note = kind === "output" ? "Run your code again to bring this file back. Each run starts from a fresh folder." : err.message;
    }
    if (preview?.path !== f.path) return;
    clear(previewHost);
    if (note && !text) {
      previewHost.append(h("p", { class: "pv-note muted" }, note));
      return;
    }
    if (/\.csv$/i.test(f.path)) {
      const t = parseCSV(text, 100);
      const shown = Math.min(t.rows.length, 100);
      add(
        previewHost,
        h("p", { class: "pv-note muted" }, `${plural(t.total, "row")}, ${plural(t.header.length, "column")}.`, t.total > shown ? ` Showing the first ${shown}.` : "", t.delim !== "," ? ` Separator: ${t.delim === "\t" ? "tab" : t.delim}` : "", note ? " " + note : ""),
        h(
          "div",
          { class: "pv-scroll", tabIndex: 0 },
          h(
            "table",
            { class: "grid" },
            h("thead", null, h("tr", null, h("th", { class: "grid-n" }, ""), t.header.map((c) => h("th", null, c)))),
            h("tbody", null, t.rows.slice(0, shown).map((r, i) => h("tr", null, h("td", { class: "grid-n" }, i), r.map((c) => h("td", { class: c === "" ? "is-empty" : "" }, c === "" ? "empty" : c))))),
          ),
        ),
      );
    } else {
      const lines = text.split("\n");
      add(previewHost, h("p", { class: "pv-note muted" }, `${plural(lines.length - (text.endsWith("\n") ? 1 : 0), "line")}.`, lines.length > 400 ? " Showing the first 400." : "", note ? " " + note : ""), h("pre", { class: "pv-text", tabIndex: 0 }, lines.slice(0, 400).join("\n")));
    }
  }

  async function resetCode() {
    const yes = await ask({
      title: "Reset your code?",
      body: h("p", null, `This replaces your code for this task with the starter file. You can undo with ${MOD}+Z while the task stays open.`),
      actions: [{ label: "Keep my code", value: false, focus: true }, { label: "Reset", value: true, kind: "btn-danger" }],
    });
    if (!yes) return;
    closePreview();
    editor.set(ex.starter);
    dirty = true;
    flush();
  }

  // ---- console ---------------------------------------------------------------------------
  const lines = h("div", { class: "console-lines" });
  const replInput = h("input", { class: "repl-in", type: "text", spellcheck: false, autocomplete: "off", autocapitalize: "off", "aria-label": "Python console", placeholder: "Try df.head() after a run" });
  const past = [];
  let pastAt = 0;
  const consoleEl = h("div", { class: "console", role: "log", "aria-label": "Console output" }, lines);

  function line(cls, text) {
    const stick = consoleEl.scrollHeight - consoleEl.scrollTop - consoleEl.clientHeight < 40;
    const el = h("div", { class: "ln ln-" + cls }, text);
    lines.append(el);
    while (lines.childElementCount > MAX_LINES) lines.firstElementChild.remove();
    if (stick) consoleEl.scrollTop = consoleEl.scrollHeight;
    return el;
  }

  const repl = h(
    "form",
    {
      class: "repl",
      onsubmit: async (e) => {
        e.preventDefault();
        const src = replInput.value;
        if (!src.trim() || busy) return;
        past.push(src);
        pastAt = past.length;
        replInput.value = "";
        line("cmd", ">>> " + src);
        consoleEl.scrollTop = consoleEl.scrollHeight;
        try {
          const res = await consoleLine({ slot, src, onEvent: (m) => m.type === "out" && m.lines.forEach(([kind, text]) => line(kind, text)) });
          if (res.error) line("err", res.error.trimEnd());
        } catch (err) {
          line(err.stopped ? "note" : "err", err.stopped ? "Stopped. Python restarts in a few seconds." : err.message);
        }
        consoleEl.scrollTop = consoleEl.scrollHeight;
      },
    },
    h("span", { class: "repl-prompt", "aria-hidden": "true" }, ">>>"),
    replInput,
  );
  replInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" && pastAt > 0) {
      replInput.value = past[--pastAt];
      e.preventDefault();
    } else if (e.key === "ArrowDown" && pastAt < past.length) {
      replInput.value = past[++pastAt] ?? "";
      e.preventDefault();
    }
  });

  // ---- checks ----------------------------------------------------------------------------
  const checksEl = h("div", { class: "checks", hidden: true });
  const hiddenLabel = practice ? "Hidden check. It runs when you submit." : "Hidden check. It is scored when you finish the test.";

  function checkRow(state, name, msg, hint) {
    const mark = { pass: icon("check", "Passes"), fail: icon("cross", "Fails"), skip: icon("ring", "Not checked yet"), hidden: icon("lock", "Hidden"), idle: icon("ring", "Not run yet") }[state];
    return h(
      "li",
      { class: "chk is-" + state },
      h("span", { class: "chk-mark" }, mark),
      h("div", { class: "chk-body" }, h("div", { class: "chk-name" }, name), msg ? h("div", { class: "chk-msg" }, msg) : null, hint ? h("div", { class: "chk-hint" }, h("b", null, "Try this: "), hint) : null),
    );
  }

  function renderChecks() {
    clear(checksEl);
    const list = h("ul", { class: "chk-list" });
    if (!result) {
      add(checksEl, h("p", { class: "chk-sum muted" }, "Test runs your code in a fresh folder, then checks the files it saved."));
      ex.checks.forEach((c) => list.append(c.hidden ? checkRow("hidden", hiddenLabel) : checkRow("idle", c.name)));
      checksEl.append(list);
      return;
    }
    const items = result.items;
    const seen = revealed ? items : items.filter((i) => !i.hidden);
    const passed = seen.filter((i) => i.status === "pass").length;
    const all = passed === seen.length;
    let head;
    if (revealed) head = all ? `All ${items.length} checks pass.` : `${passed} of ${items.length} checks pass. Start with the first cross.`;
    else if (all) head = practice ? `All ${seen.length} visible checks pass. Submit to run the hidden ones.` : `All ${seen.length} visible checks pass.`;
    else head = `${passed} of ${seen.length} visible checks pass. Start with the first cross.`;
    add(checksEl, h("p", { class: "chk-sum" + (all ? " is-pass" : "") }, h("span", { class: "chk-ticks", "aria-hidden": "true" }, seen.map((i) => h("i", { class: "is-" + i.status }))), head));
    if (!practice && submittedAt) checksEl.append(h("p", { class: "chk-note" }, `Submitted at ${new Date(submittedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. You can change your code and submit again until you finish the test.`));
    if (practice) result.notes.forEach((n) => checksEl.append(h("p", { class: "chk-note" }, n)));
    for (const i of items) {
      if (i.hidden && !revealed) list.append(checkRow("hidden", hiddenLabel));
      else list.append(checkRow(i.status, i.name, i.status === "pass" ? "" : i.msg, practice && i.status === "fail" ? i.hint : ""));
    }
    checksEl.append(list);
    // bring the first cross into view, below the summary line
    const first = list.querySelector(".chk.is-fail");
    if (first) requestAnimationFrame(() => (checksEl.scrollTop = Math.max(0, first.offsetTop - checksEl.offsetTop - 56)));
    else checksEl.scrollTop = 0;
  }

  // ---- bottom panel: tabs and actions ----------------------------------------------------
  const runBtn = h("button", { class: "btn btn-small", type: "button", title: `Run your code (${MOD}+Enter)`, onclick: () => go("run") }, icon("play"), "Run");
  const testBtn = h("button", { class: "btn btn-small", type: "button", title: `Run, then check the output (${MOD}+Shift+Enter)`, onclick: () => go("test") }, "Test");
  const submitBtn = h("button", { class: "btn btn-small btn-go", type: "button", title: "Run every check and record the result", onclick: () => go("submit") }, "Submit");
  const stopBtn = h("button", { class: "btn btn-small", type: "button", hidden: true, onclick: () => stopRuntime() }, icon("stop"), "Stop");
  const status = h("span", { class: "run-status muted", role: "status" });
  const bottomTabs = tabs([["console", "Console"], ["checks", "Checks"]], (id) => {
    consoleEl.hidden = id !== "console";
    repl.hidden = id !== "console";
    checksEl.hidden = id !== "checks";
  });
  const clearBtn = h("button", { class: "link-btn", type: "button", onclick: () => clear(lines) }, "Clear");

  function setBusy(on, text = "") {
    busy = on;
    runBtn.disabled = testBtn.disabled = submitBtn.disabled = on;
    replInput.disabled = on;
    stopBtn.hidden = !on;
    status.textContent = text;
  }

  // ---- run, test, submit -----------------------------------------------------------------
  async function go(kind) {
    if (busy || !alive) return;
    flush();
    bottomTabs.pick("console");
    setPane("output");
    if (!data) {
      line("note", "The task files are still loading. Try again in a moment.");
      return;
    }
    const code = editor.value;
    const label = { run: "Run", test: "Test", submit: "Submit" }[kind];
    line("rule", `${label}, ${new Date().toLocaleTimeString("en-GB")}`);
    consoleEl.scrollTop = consoleEl.scrollHeight;
    editor.markError(0);
    let began = 0;
    let waiting = rt.state === "ready" ? null : line("note", "Python is still starting. Your code runs as soon as it is ready.");
    setBusy(true, rt.state === "ready" ? "Running" : "Waiting for Python");
    const ticker = setInterval(() => {
      if (began) status.textContent = `${status.dataset.verb || "Running"}, ${Math.round((performance.now() - began) / 1000)} s`;
    }, 500);
    try {
      const res = await runCode({
        slot,
        files: data.inputs,
        hidden: data.hidden,
        code,
        grader: kind === "run" ? null : ex.grader,
        onEvent: (m) => {
          if (m.type === "out") m.lines.forEach(([cls, text]) => line(cls, text));
          else if (m.type === "waiting") waiting ||= line("note", m.text + ".");
          else if (m.type === "started") {
            waiting?.remove();
            began = performance.now();
            status.dataset.verb = "Running";
            status.textContent = "Running";
          } else if (m.type === "checking") {
            status.dataset.verb = "Checking";
            status.textContent = "Checking your output";
          }
        },
      });
      if (!alive) return;
      outputs = res.files.filter((f) => !f.input);
      renderFiles();
      if (res.error) {
        line("err", res.error.text.trimEnd());
        const where = res.error.line ? h("button", { class: "link-btn", type: "button", onclick: () => { closePreview(); editor.goTo(res.error.line); } }, `Go to line ${res.error.line}`) : null;
        add(line("fail", ""), res.error.summary, where ? " " : "", where);
        editor.markError(res.error.line);
        if (kind !== "run") line("note", "The checks did not run because your code stopped with an error. Fix it, then test again.");
      } else {
        const wrote = outputs.map((f) => f.path);
        line("note", `Finished in ${res.seconds < 10 ? res.seconds.toFixed(1) : Math.round(res.seconds)} s.` + (wrote.length ? ` Wrote ${wrote.join(", ")}.` : ""));
        const missing = ex.outputs.filter((o) => !wrote.includes(o));
        if (kind === "run" && missing.length) line("note", `Not written yet: ${missing.join(", ")}.`);
      }
      if (kind !== "run") {
        if (!res.error) {
          result = res.result;
          revealed = practice && kind === "submit";
          if (kind === "submit") submittedAt = Date.now();
          renderChecks();
          bottomTabs.pick("checks");
        }
        if (kind === "submit") {
          const items = res.result?.items || [];
          onSubmit?.({ error: res.error ? res.error.summary : null, items, notes: res.result?.notes || [], passed: items.filter((i) => i.status === "pass").length, total: items.length || ex.checks.length, code });
        }
      }
    } catch (err) {
      if (!alive) return;
      line(err.stopped ? "note" : "err", err.stopped ? "Stopped. Python restarts in a few seconds, and your code is saved." : err.message);
    } finally {
      clearInterval(ticker);
      if (alive) setBusy(false);
    }
  }

  // ---- layout ----------------------------------------------------------------------------
  const paneTabs = tabs([["task", "Task"], ["code", "Code"], ["output", "Output"]], (id) => {
    root.dataset.pane = id;
  });
  paneTabs.el.classList.add("ws-panes");
  function setPane(id) {
    if (root.dataset.pane !== id) paneTabs.pick(id);
  }

  const splitX = h("div", { class: "split split-x", role: "separator", "aria-orientation": "vertical", "aria-label": "Resize the task pane", tabIndex: 0 });
  const splitY = h("div", { class: "split split-y", role: "separator", "aria-orientation": "horizontal", "aria-label": "Resize the output pane", tabIndex: 0 });
  const main = h(
    "section",
    { class: "ws-main" },
    h("div", { class: "ws-top" }, fileList, h("div", { class: "ws-editor" }, fileTabs, editorHost, previewHost)),
    splitY,
    h("div", { class: "ws-bottom" }, h("div", { class: "ws-bottom-bar" }, bottomTabs.el, clearBtn, h("span", { class: "ws-actions" }, status, stopBtn, runBtn, testBtn, submitBtn)), consoleEl, repl, checksEl),
  );
  const root = h("div", { class: "ws", vars: { "--left": settings.left + "%", "--bottom": settings.bottom + "%" } }, paneTabs.el, h("section", { class: "ws-side" }, sideTabs.el, sideBody), splitX, main);

  function drag(handle, axis) {
    const apply = (value) => {
      const v = Math.round(Math.max(axis === "x" ? 22 : 16, Math.min(axis === "x" ? 68 : 78, value)));
      settings[axis === "x" ? "left" : "bottom"] = v;
      root.style.setProperty(axis === "x" ? "--left" : "--bottom", v + "%");
    };
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      root.classList.add("is-dragging");
      const box = (axis === "x" ? root : main).getBoundingClientRect();
      const move = (ev) => apply(axis === "x" ? ((ev.clientX - box.left) / box.width) * 100 : ((box.bottom - ev.clientY) / box.height) * 100);
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        root.classList.remove("is-dragging");
        save();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    });
    handle.addEventListener("keydown", (e) => {
      const step = { ArrowLeft: -3, ArrowRight: 3, ArrowUp: 3, ArrowDown: -3 }[e.key];
      if (!step || (axis === "x") !== (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;
      e.preventDefault();
      apply(settings[axis === "x" ? "left" : "bottom"] + step);
      save();
    });
  }
  drag(splitX, "x");
  drag(splitY, "y");

  // ---- start -----------------------------------------------------------------------------
  sideTabs.el.hidden = !practice; // the mock has only the task text, so a lone tab would be noise
  sideTabs.pick("task");
  bottomTabs.pick("console");
  paneTabs.pick("task");
  renderFiles();
  renderFileTabs();
  renderChecks();
  line("note", `Output from Run appears here (${MOD}+Enter runs, ${MOD}+Shift+Enter tests). After a run, type Python at the prompt below to look at your variables.`);
  payload(ex.id).then(
    (p) => {
      data = p;
    },
    (err) => alive && line("err", `${err.message} Check your connection, then reload the page.`),
  );
  const onHide = () => flush();
  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", onHide);

  return {
    el: root,
    get code() {
      return editor.value;
    },
    flush,
    focus: () => editor.focus(),
    showSolution: () => {
      sideTabs.pick("solution");
      setPane("task");
    },
    refreshSide: () => sideNow === "solution" && showSide("solution"),
    setAutocomplete: (on) => editor.setAutocomplete(on),
    destroy() {
      alive = false;
      flush();
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      editor.destroy();
    },
  };
}
