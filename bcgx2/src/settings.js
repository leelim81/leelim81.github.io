// Settings: the test date, how the editor behaves, and a backup of your progress.
import { BUILD } from "./build.js";
import { add, ask, clear, h, toast } from "./dom.js";
import { applyTheme } from "./shell.js";
import { S, dayKey, exportAll, importAll, resetAll, save } from "./store.js";

function field(label, control, help) {
  return h("div", { class: "field" }, h("div", { class: "field-label" }, label), h("div", { class: "field-control" }, control, help ? h("p", { class: "muted field-help" }, help) : null));
}

export function settingsView(root) {
  const st = S().settings;

  const date = h("input", {
    type: "date",
    id: "set-date",
    value: st.testDate,
    onchange: () => {
      if (!date.value) return;
      st.testDate = date.value;
      save();
      toast("Test date saved");
    },
  });

  const theme = h(
    "div",
    { class: "seg", role: "radiogroup", "aria-label": "Theme" },
    [["system", "Match my device"], ["light", "Light"], ["dark", "Dark"]].map(([value, label]) =>
      h("label", null, h("input", { type: "radio", name: "theme", value, checked: st.theme === value, onchange: () => { st.theme = value; save(); applyTheme(); } }), h("span", null, label)),
    ),
  );

  const size = h("select", { id: "set-size", onchange: () => { st.fontSize = Number(size.value); save(); applyTheme(); } }, [12, 13, 14, 15, 16, 18].map((n) => h("option", { value: n, selected: st.fontSize === n }, `${n} px`)));

  const complete = h("label", { class: "check" }, h("input", { type: "checkbox", checked: st.autocomplete, onchange: (e) => { st.autocomplete = e.target.checked; save(); } }), h("span", null, "Suggest keywords and names as I type"));

  const file = h("input", {
    type: "file",
    accept: "application/json,.json",
    hidden: true,
    onchange: async () => {
      const f = file.files[0];
      file.value = "";
      if (!f) return;
      try {
        let data = null;
        try {
          data = JSON.parse(await f.text());
        } catch {
          data = null;
        }
        if (!data || data.app !== "ninety" || data.v !== 1) {
          toast("That file is not a Ninety backup");
          return;
        }
        const yes = await ask({
          title: "Replace the progress in this browser?",
          body: h("p", null, `The backup from ${String(data.exported || "an unknown date").slice(0, 10)} replaces everything saved here, including code drafts.`),
          actions: [{ label: "Cancel", value: false, focus: true }, { label: "Replace", value: true, kind: "btn-danger" }],
        });
        if (!yes) return;
        importAll(data);
        applyTheme();
        toast("Backup restored");
        settingsView(root);
      } catch (err) {
        toast(err.message || "That file could not be read");
      }
    },
  });

  const backup = h(
    "div",
    { class: "btn-row" },
    h(
      "button",
      {
        class: "btn",
        type: "button",
        onclick: () => {
          const blob = new Blob([JSON.stringify(exportAll())], { type: "application/json" });
          const a = h("a", { href: URL.createObjectURL(blob), download: `ninety-progress-${dayKey()}.json` });
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        },
      },
      "Download a backup",
    ),
    h("button", { class: "btn", type: "button", onclick: () => file.click() }, "Restore from a backup"),
    file,
  );

  const reset = h(
    "button",
    {
      class: "btn btn-danger",
      type: "button",
      onclick: async () => {
        const yes = await ask({
          title: "Clear all progress?",
          body: h("p", null, "This removes every answer, code draft, and result saved in this browser. Download a backup first if you might want it back."),
          actions: [{ label: "Keep my progress", value: false, focus: true }, { label: "Clear everything", value: true, kind: "btn-danger" }],
        });
        if (!yes) return;
        resetAll();
        applyTheme();
        location.hash = "#/";
      },
    },
    "Clear all progress",
  );

  clear(root);
  add(
    root,
    h(
      "div",
      { class: "settings" },
      h("h1", { class: "display" }, "Settings"),
      h("h2", { class: "h-sec" }, "Your test"),
      field(h("label", { for: "set-date" }, "Test date"), date, "The plan page counts down to this day. The sessions are not tied to dates, so nothing breaks if it moves."),
      h("h2", { class: "h-sec" }, "Look and editor"),
      field("Theme", theme),
      field(h("label", { for: "set-size" }, "Code size"), size),
      field("Autocomplete", complete, "It knows Python keywords and the names in your file, not pandas methods. Tab accepts a suggestion, and Enter always starts a new line."),
      h("h2", { class: "h-sec" }, "Your progress"),
      field("Backup", backup, "Progress lives in this browser on this device. A backup file moves it to another browser, or keeps it safe if you clear your browsing data."),
      field("Start over", reset),
      h("h2", { class: "h-sec" }, "About"),
      h("p", { class: "about" }, "Ninety is a personal practice room for a 90-minute data science test: probability and statistics, machine learning fundamentals, and three coding tasks in pandas and scikit-learn. The data, questions, and checks are written for practice and are not taken from any real test."),
      h("p", { class: "about muted" }, "It is not affiliated with or endorsed by CodeSignal. Python runs in your browser through Pyodide. Nothing you type leaves this device."),
      h("p", { class: "about muted" }, `Build ${BUILD}.`),
    ),
  );
  return () => {};
}
