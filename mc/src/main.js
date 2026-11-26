// One Twenty: a practice room for a two-hour panel case.
import { caseView, casesView } from "./cases.js";
import { clear, h } from "./dom.js";
import { drawListView, drawView, drillsView, mockView, numbersView, pushbackView, recallView, roundView } from "./drills.js";
import { homeView } from "./home.js";
import { kitView, refView } from "./kit.js";
import { mineCaseView, mineProbesView, mineView } from "./mine.js";
import { panelRecallView, panelView } from "./panel.js";
import { startOffline } from "./offline.js";
import { playbookView } from "./playbook.js";
import { lessonView, primerView } from "./primer.js";
import { qaView } from "./qa.js";
import { settingsView } from "./settings.js";
import { applyTheme, renderHeader } from "./shell.js";
import { freeze, load, storageWorks } from "./store.js";
import { videosView } from "./videos.js";

const view = document.getElementById("view");
const top = document.getElementById("top");
let cleanup = null;

function route() {
  // The toolkit used to live at another address. Old links still work.
  if (/^#\/aws(\/|$)/.test(location.hash)) return location.replace("#/kit" + location.hash.slice(5));
  const hash = location.hash || "#/";
  cleanup?.();
  cleanup = null;
  document.body.classList.remove("focus");
  document.querySelectorAll("dialog.dlg:not(.dlg-lock)").forEach((d) => d.remove());
  clear(view);
  window.scrollTo(0, 0);
  view.focus({ preventScroll: true });
  let m;
  if ((m = hash.match(/^#\/case\/([\w-]+)$/))) cleanup = caseView(view, m[1]);
  else if (hash === "#/cases") cleanup = casesView(view);
  else if (hash === "#/playbook") cleanup = playbookView(view);
  else if (hash === "#/panel/recall") cleanup = panelRecallView(view);
  else if (hash === "#/panel") cleanup = panelView(view);
  else if ((m = hash.match(/^#\/mine\/([\w-]+)\/probes$/))) cleanup = mineProbesView(view, m[1]);
  else if ((m = hash.match(/^#\/mine\/([\w-]+)$/))) cleanup = mineCaseView(view, m[1]);
  else if (hash === "#/mine") cleanup = mineView(view);
  else if ((m = hash.match(/^#\/kit\/d\/([\w-]+)$/))) cleanup = refView(view, m[1]);
  else if (hash === "#/kit") cleanup = kitView(view);
  else if (hash === "#/qa") cleanup = qaView(view);
  else if (hash === "#/drills/recall/round") cleanup = roundView(view);
  else if (hash === "#/drills/recall") cleanup = recallView(view);
  else if ((m = hash.match(/^#\/drills\/draw\/([\w-]+)$/))) cleanup = drawView(view, m[1]);
  else if (hash === "#/drills/draw") cleanup = drawListView(view);
  else if (hash === "#/drills/pushback") cleanup = pushbackView(view);
  else if (hash === "#/drills/numbers") cleanup = numbersView(view);
  else if (hash === "#/drills/mock") cleanup = mockView(view);
  else if (hash === "#/drills") cleanup = drillsView(view);
  else if ((m = hash.match(/^#\/primer\/([\w-]+)$/))) cleanup = lessonView(view, m[1]);
  else if (hash === "#/primer") cleanup = primerView(view);
  else if (hash === "#/videos") cleanup = videosView(view);
  else if (hash === "#/settings") cleanup = settingsView(view);
  else cleanup = homeView(view);
  renderHeader(top);
  const title = document.querySelector("#view h1")?.textContent;
  document.title = title ? `${title} | One Twenty` : "One Twenty";
}

// Only the newest tab saves. An older tab says so and offers to take over.
function oneTab() {
  if (!("BroadcastChannel" in window)) return;
  const channel = new BroadcastChannel("onetwenty");
  channel.onmessage = (ev) => {
    if (ev.data !== "opened") return;
    freeze();
    channel.close();
    document.querySelectorAll("dialog.dlg").forEach((d) => d.remove());
    const dlg = h(
      "dialog",
      { class: "dlg dlg-lock" },
      h("h2", { class: "dlg-title" }, "One Twenty is open in another tab"),
      h("div", { class: "dlg-body" }, h("p", null, "Only the newest tab saves, so your progress stays in one piece. Carry on there, or bring the work back to this tab.")),
      h("div", { class: "dlg-actions" }, h("button", { class: "btn btn-go", type: "button", onclick: () => location.reload() }, "Continue in this tab")),
    );
    dlg.addEventListener("cancel", (e) => e.preventDefault());
    document.body.append(dlg);
    dlg.showModal();
  };
  channel.postMessage("opened");
}

function boot() {
  load();
  applyTheme();
  oneTab();
  startOffline();
  if (!storageWorks()) {
    document.body.prepend(h("p", { class: "banner", role: "alert" }, "This browser is not saving progress, which happens in private windows or when site data is blocked. You can practice, but nothing is kept after you close the tab."));
  }
  window.addEventListener("hashchange", route);
  route();
}

boot();
