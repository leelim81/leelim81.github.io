// Ninety: a practice room for a 90-minute data science test.
import { loadBank } from "./content.js";
import { clear, h } from "./dom.js";
import { homeView } from "./home.js";
import { learnView, lessonView } from "./learn.js";
import { recallView, roundView } from "./recall.js";
import { libraryView } from "./library.js";
import { mockView } from "./mock.js";
import { reviewView, setView } from "./quiz.js";
import { startRuntime, startServiceWorker } from "./runtime.js";
import { settingsView } from "./settings.js";
import { applyTheme, renderHeader } from "./shell.js";
import { freeze, load, storageWorks, subscribe } from "./store.js";
import { taskView } from "./task.js";

const view = document.getElementById("view");
const top = document.getElementById("top");
let cleanup = null;

function route() {
  const hash = location.hash || "#/";
  cleanup?.();
  cleanup = null;
  document.body.classList.remove("focus");
  document.querySelectorAll("dialog.dlg:not(.dlg-lock)").forEach((d) => d.remove());
  clear(view);
  window.scrollTo(0, 0);
  view.focus({ preventScroll: true });
  let m;
  if ((m = hash.match(/^#\/task\/([\w@-]+)$/))) cleanup = taskView(view, m[1]);
  else if ((m = hash.match(/^#\/set\/(\w+)$/))) cleanup = setView(view, m[1]);
  else if ((m = hash.match(/^#\/mock\/(\w+)$/))) cleanup = mockView(view, m[1]);
  else if (hash === "#/learn/recall") cleanup = recallView(view);
  else if (hash === "#/learn/recall/round") cleanup = roundView(view);
  else if ((m = hash.match(/^#\/learn\/([\w-]+)$/))) cleanup = lessonView(view, m[1]);
  else if (hash === "#/learn") cleanup = learnView(view);
  else if (hash === "#/review") cleanup = reviewView(view);
  else if (hash === "#/library") cleanup = libraryView(view);
  else if (hash === "#/settings") cleanup = settingsView(view);
  else cleanup = homeView(view);
  renderHeader(top);
  document.title = document.querySelector("#view h1")?.textContent ? `${document.querySelector("#view h1").textContent} | Ninety` : "Ninety";
}

// Only the newest tab saves. An older tab says so and offers to take over.
function oneTab() {
  if (!("BroadcastChannel" in window)) return;
  const channel = new BroadcastChannel("ninety");
  channel.onmessage = (ev) => {
    if (ev.data !== "opened") return;
    freeze();
    channel.close();
    document.querySelectorAll("dialog.dlg").forEach((d) => d.remove());
    const dlg = h(
      "dialog",
      { class: "dlg dlg-lock" },
      h("h2", { class: "dlg-title" }, "Ninety is open in another tab"),
      h("div", { class: "dlg-body" }, h("p", null, "Only the newest tab saves, so your progress stays in one piece. Carry on there, or bring the work back to this tab.")),
      h("div", { class: "dlg-actions" }, h("button", { class: "btn btn-go", type: "button", onclick: () => location.reload() }, "Continue in this tab")),
    );
    dlg.addEventListener("cancel", (e) => e.preventDefault());
    document.body.append(dlg);
    dlg.showModal();
  };
  channel.postMessage("opened");
}

async function boot() {
  load();
  applyTheme();
  oneTab();
  // Python starts loading now, in the background, so it is ready before the first Run.
  // The service worker goes first so that the download lands in its cache.
  startServiceWorker().then(startRuntime);
  try {
    await loadBank();
  } catch (err) {
    clear(view).append(h("div", { class: "notice" }, h("h1", { class: "display-2" }, "The practice room did not load"), h("p", null, `${err.message} Check your connection, then reload.`), h("button", { class: "btn btn-go", type: "button", onclick: () => location.reload() }, "Reload")));
    return;
  }
  if (!storageWorks()) {
    document.body.prepend(h("p", { class: "banner", role: "alert" }, "This browser is not saving progress, which happens in private windows or when site data is blocked. You can practice, but nothing is kept after you close the tab."));
  }
  let misses = -1;
  subscribe((st) => {
    const n = Object.keys(st.misses).length;
    if (n !== misses && !document.body.classList.contains("focus")) {
      misses = n;
      renderHeader(top);
    }
  });
  window.addEventListener("hashchange", route);
  route();
}

boot();
