// The panel: a private notebook for the people you will meet.
// No person is named in this file or anywhere else in the site. What you type is kept in this browser.
import { add, ask, clear, h, icon, toast } from "./dom.js";
import { runDeck } from "./drills.js";
import { notice } from "./shell.js";
import { logDay, S, save } from "./store.js";
import { bullets, jump, sec } from "./ui.js";

const LENSES = [
  ["", "Not sure yet"],
  ["platform", "Platform and architecture"],
  ["model", "Modeling"],
  ["govern", "Governance and risk"],
  ["deliver", "Delivery and people"],
];
const lensName = (id) => (LENSES.find(([k]) => k === id) || LENSES[0])[1];

const USE = [
  "Learn every name, and how to say it. If you are unsure, ask at the start. People forgive a question and remember a mistake.",
  "When you sit down, sketch the table in your notebook and write each name where the person sits.",
  "Answer the person who asked, by name. Then look at the others.",
  "Bring in anyone who has been quiet, and anyone on a video link, by name.",
  "Match each person to a lens as they speak. The first question someone asks tells you what they listen for.",
  "The same evening, write down who asked what.",
];

let seq = 0;
const newId = () => "p" + Date.now().toString(36) + (seq++).toString(36);
const blank = (over = {}) => ({ id: newId(), name: "", role: "", say: "", bg: "", lens: "", ask: "", ...over });

// "Name | Role | Background", one person on each line.
export function parseList(text) {
  return String(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", role = "", ...rest] = line.split("|").map((part) => part.trim());
      return { name, role, bg: rest.join(" | ") };
    })
    .filter((p) => p.name);
}

export function panelView(root) {
  const page = h("div", { class: "page learn" });
  clear(root).append(page);
  const list = h("div", { class: "cards people" });
  const count = h("p", { class: "muted" });
  const drillRow = h("div", { class: "btn-row", style: "margin-top: 14px" });

  const field = (label, control) => h("label", { class: "note-field" }, h("span", { class: "note-label" }, label), control);
  const bind = (p, key, el) => {
    el.addEventListener("input", () => {
      p[key] = el.value;
      save();
      paintMeta();
    });
    return el;
  };
  const grow = (box) => {
    const fit = () => {
      box.style.height = "auto";
      box.style.height = Math.max(64, box.scrollHeight + 2) + "px";
    };
    box.addEventListener("input", fit);
    requestAnimationFrame(fit);
    return box;
  };

  function paintMeta() {
    const people = S().panel;
    const named = people.filter((p) => p.name.trim()).length;
    count.textContent = people.length ? `${named} ${named === 1 ? "person" : "people"} named. Kept in this browser only.` : "No one here yet. Paste a list, or add people one at a time.";
    const ready = people.filter((p) => p.name.trim() && (p.bg.trim() || p.role.trim())).length >= 2;
    clear(drillRow).append(
      ready ? h("a", { class: "btn btn-go", href: "#/panel/recall" }, icon("play"), "Test yourself on who is who") : h("span", { class: "muted" }, "Add two people with a name and a background, and a recall drill appears here."),
    );
  }

  function card(p, i) {
    return h(
      "div",
      { class: "card person" },
      h("p", { class: "card-title" }, `Person ${i + 1}`),
      field("Name", bind(p, "name", h("input", { class: "text-in", type: "text", value: p.name, autocomplete: "off", placeholder: "As they introduce themselves" }))),
      field("Role", bind(p, "role", h("input", { class: "text-in", type: "text", value: p.role, autocomplete: "off", placeholder: "Their title" }))),
      field("How to say the name", bind(p, "say", h("input", { class: "text-in", type: "text", value: p.say, autocomplete: "off", placeholder: "Spell it the way it sounds" }))),
      field("Background, in one or two lines", grow(bind(p, "bg", h("textarea", { class: "note-in", rows: 2, value: p.bg, placeholder: "What they work on, and where they came from." })))),
      field(
        "Listens for",
        bind(
          p,
          "lens",
          h(
            "select",
            { class: "text-in" },
            LENSES.map(([k, label]) => h("option", { value: k, selected: p.lens === k }, label)),
          ),
        ),
      ),
      field("One question for them", grow(bind(p, "ask", h("textarea", { class: "note-in", rows: 2, value: p.ask, placeholder: "Something only they can answer." })))),
      h(
        "button",
        {
          class: "link-btn",
          type: "button",
          style: "justify-self: start; margin-top: 6px",
          onclick: async () => {
            const filled = p.name || p.bg || p.ask;
            if (filled) {
              const yes = await ask({
                title: "Remove this person?",
                body: h("p", null, "Their name and your notes are removed from this browser."),
                actions: [
                  { label: "Keep", value: false, focus: true },
                  { label: "Remove", value: true, kind: "btn-danger" },
                ],
              });
              if (!yes) return;
            }
            S().panel = S().panel.filter((x) => x.id !== p.id);
            save();
            paint();
          },
        },
        "Remove this person",
      ),
    );
  }

  function paint() {
    clear(list);
    add(list, S().panel.map(card));
    paintMeta();
  }

  const pasteBox = h("textarea", { class: "note-in", rows: 5, placeholder: "Name | Role | One or two lines on their background" });
  const paste = h(
    "details",
    { class: "fold" },
    h("summary", null, "Paste a list"),
    h("p", { class: "body", style: "font-size: 15px" }, "One person on each line, with a bar between the parts: the name, then the role, then the background. Only the name is required."),
    h("label", { class: "note-field" }, h("span", { class: "note-label" }, "Your list"), pasteBox),
    h(
      "div",
      { class: "btn-row", style: "margin-top: 10px" },
      h(
        "button",
        {
          class: "btn btn-go",
          type: "button",
          onclick: () => {
            const found = parseList(pasteBox.value);
            if (!found.length) return toast("Nothing to add. Put one person on each line.");
            const have = new Set(S().panel.map((p) => p.name.trim().toLowerCase()));
            const fresh = found.filter((p) => !have.has(p.name.toLowerCase()));
            S().panel.push(...fresh.map((p) => blank(p)));
            logDay();
            pasteBox.value = "";
            paste.open = false;
            paint();
            toast(fresh.length === found.length ? `Added ${fresh.length}.` : `Added ${fresh.length}. ${found.length - fresh.length} already on the list.`);
          },
        },
        "Add these people",
      ),
    ),
  );

  add(
    page,
    h(
      "div",
      { class: "hero" },
      h(
        "div",
        null,
        h("h1", { class: "display" }, "The people in the room"),
        h("p", { class: "hero-sub" }, "A private notebook for the people you will meet: a name, a role, a line or two on their background, and one question for each. Learn the names before you walk in."),
        count,
      ),
      h(
        "div",
        { class: "next" },
        h("span", { class: "next-where" }, "Private by design"),
        h("p", { class: "next-meta", style: "margin: 0; color: var(--ink)" }, "What you type here stays in this browser, with the rest of your progress. No person is named anywhere in this site's code, and nothing on this page is sent anywhere."),
        h("p", { class: "next-hint" }, "For faces, look at each person's professional profile yourself before the day. Photos are not kept here."),
      ),
    ),
    jump([
      ["people", "Who you will meet"],
      ["use", "Use the names"],
      ["recall", "Test yourself"],
    ]),
    sec(
      "people",
      "Your notes",
      "Who you will meet",
      h("p", { class: "body" }, "Keep each note short. You want a name you can say, one fact that shows you looked, and one question that only this person can answer."),
      h(
        "div",
        { class: "btn-row", style: "margin: 14px 0 6px" },
        h(
          "button",
          {
            class: "btn",
            type: "button",
            onclick: () => {
              S().panel.push(blank());
              save();
              paint();
              list.lastElementChild?.querySelector("input")?.focus();
            },
          },
          "Add a person",
        ),
      ),
      paste,
      list,
    ),
    sec("use", "In the room", "Use the names", bullets(USE), h("p", { class: "body", style: "margin-top: 12px" }, "The four lenses, and what each one listens for, are in ", h("a", { href: "#/playbook" }, "the playbook"), ".")),
    sec("recall", "Before you walk in", "Test yourself", h("p", { class: "body" }, "The drill shows a background and asks for the name, then shows a name and asks what you know. It uses only what you typed above."), drillRow),
  );
  paint();
  return () => {};
}

export function panelRecallView(root) {
  const people = S().panel.filter((p) => p.name.trim() && (p.bg.trim() || p.role.trim()));
  if (people.length < 2) return notice(root, "Add two people first", "The drill needs at least two people with a name and a background.", "#/panel", "The panel");
  const mixed = (items) => items.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
  let stop = () => {};
  const run = () => {
    stop();
    const items = mixed([
      ...people.map((p) => ({ id: p.id + "-who", topic: "Who is this?", q: [p.role, p.bg].filter((x) => x.trim()).join(". "), p })),
      ...people.map((p) => ({ id: p.id + "-what", topic: "What do you know about this person?", q: p.name, p, about: true })),
    ]).slice(0, 12);
    stop = runDeck(root, {
      back: ["#/panel", "The panel"],
      title: "Who is who",
      items,
      returnMissed: true,
      answer: (x) =>
        x.about
          ? [h("p", { class: "fc-a" }, [x.p.role, x.p.bg].filter((t) => t.trim()).join(". ")), x.p.lens ? h("p", { class: "fc-note" }, "Listens for: " + lensName(x.p.lens)) : null, x.p.ask ? h("p", { class: "fc-note" }, "Your question: " + x.p.ask) : null]
          : [h("p", { class: "fc-a" }, h("mark", null, x.p.name)), x.p.say ? h("p", { class: "fc-note" }, "Say it: " + x.p.say) : null],
      onFirst: () => logDay(),
      again: run,
    });
    window.scrollTo(0, 0);
  };
  run();
  return () => stop();
}
