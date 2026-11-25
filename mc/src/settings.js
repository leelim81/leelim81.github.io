// Settings: the panel date, the theme, the offline copy, and a backup of your progress.
import { BUILD } from "./build.js";
import { add, ask, clear, h, icon, toast } from "./dom.js";
import { offlineCount, offlineState, onOffline } from "./offline.js";
import { applyTheme } from "./shell.js";
import { dayKey, exportAll, importAll, resetAll, S, save } from "./store.js";

function seg(name, options, value, onPick) {
  return h(
    "div",
    { class: "seg", role: "radiogroup" },
    options.map(([val, label]) => h("label", null, h("input", { type: "radio", name, checked: value === val, onchange: () => onPick(val) }), h("span", null, label))),
  );
}

const field = (label, ...kids) => h("div", { class: "field" }, h("div", { class: "field-label" }, label), h("div", null, kids));

const OFF = {
  checking: "Checking for an offline copy.",
  saving: "Saving a copy for offline use.",
  saved: "Saved. This site opens without a connection.",
  partial: "Partly saved. Open the site again with a connection to finish.",
  none: "This browser is not keeping an offline copy.",
};

export function settingsView(root) {
  const page = h("div", { class: "page settings" });
  clear(root).append(page);
  const off = h("div", { class: "off" });
  const paintOff = () => {
    const state = offlineState();
    const { have, want } = offlineCount();
    off.dataset.state = state;
    add(clear(off), h("p", { class: "off-head" }, state === "saved" ? icon("check") : null, OFF[state]), state === "saving" || state === "partial" ? h("p", { class: "muted num" }, `${have} of ${want} files`) : null);
  };
  const stop = onOffline(paintOff);

  function paint() {
    const st = S().settings;
    clear(page);
    add(
      page,
      h("h1", { class: "display" }, "Settings"),
      h("h2", { class: "h-sec" }, "The panel"),
      field(
        "Date and time",
        h(
          "div",
          { class: "btn-row" },
          h("input", { type: "date", value: st.date, "aria-label": "Date of the panel", onchange: (e) => e.target.value && ((st.date = e.target.value), save(), toast("Date saved.")) }),
          h("input", { type: "time", value: st.time, "aria-label": "Start time of the panel", onchange: (e) => e.target.value && ((st.time = e.target.value), save(), toast("Time saved.")) }),
        ),
        h("p", { class: "field-help muted" }, "In Singapore time. The countdown on the plan page uses this."),
      ),
      h("h2", { class: "h-sec" }, "Display"),
      field(
        "Theme",
        seg(
          "theme",
          [
            ["system", "Match the device"],
            ["light", "Light"],
            ["dark", "Dark"],
          ],
          st.theme,
          (v) => ((st.theme = v), save(), applyTheme()),
        ),
      ),
      field(
        "Diagrams",
        seg(
          "tall",
          [
            ["auto", "Fit the screen"],
            ["tall", "Always tall"],
            ["wide", "Always wide"],
          ],
          st.tall === true ? "tall" : st.tall === false ? "wide" : "auto",
          (v) => ((st.tall = v === "tall" ? true : v === "wide" ? false : null), save()),
        ),
        h("p", { class: "field-help muted" }, "Tall suits a phone. Wide suits a laptop, and it matches how you'd draw on a whiteboard."),
      ),
      h("h2", { class: "h-sec" }, "Your progress"),
      field("Offline copy", off),
      field(
        "Backup",
        h(
          "div",
          { class: "btn-row" },
          h(
            "button",
            {
              class: "btn",
              type: "button",
              onclick: () => {
                const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: "application/json" });
                const a = h("a", { href: URL.createObjectURL(blob), download: `one-twenty-${dayKey()}.json` });
                document.body.append(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 2000);
              },
            },
            "Download a backup",
          ),
          h(
            "label",
            { class: "btn" },
            "Restore from a backup",
            h("input", {
              type: "file",
              accept: "application/json,.json",
              hidden: true,
              onchange: async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                  importAll(JSON.parse(await file.text()));
                  applyTheme();
                  paint();
                  toast("Backup restored.");
                } catch (err) {
                  toast(err.message || "That file could not be read.");
                }
              },
            }),
          ),
        ),
        h("p", { class: "field-help muted" }, "Progress lives in this browser alone. Nothing is sent anywhere. Use a backup to move it to another device."),
      ),
      field(
        "Start over",
        h(
          "button",
          {
            class: "btn btn-danger",
            type: "button",
            onclick: async () => {
              const yes = await ask({
                title: "Clear all progress?",
                body: h("p", null, "This removes every mark, round, and mock from this browser. It can't be undone."),
                actions: [
                  { label: "Keep my progress", value: false, focus: true },
                  { label: "Clear everything", value: true, kind: "btn-danger" },
                ],
              });
              if (!yes) return;
              resetAll();
              applyTheme();
              paint();
              toast("Progress cleared.");
            },
          },
          "Clear all progress",
        ),
      ),
      h("p", { class: "muted", style: "margin-top: 28px; font-size: 13.5px" }, `Build ${BUILD}.`),
    );
    paintOff();
  }

  paint();
  return stop;
}
