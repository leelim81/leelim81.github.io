// The panel: a private notebook for the people you will meet.
// No person is named or pictured in this file, or anywhere else in the site. Names, notes, and photos
// come from the reader: typed, pasted, or loaded from a file on the reader's own device. They are kept
// in this browser, and nothing is uploaded.
import { add, ask, clear, h, icon, toast } from "./dom.js";
import { runDeck } from "./drills.js";
import { notice } from "./shell.js";
import { logDay, S, save, saveNow } from "./store.js";
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
const blank = (over = {}) => ({ id: newId(), name: "", role: "", say: "", bg: "", lens: "", ask: "", photo: "", ...over });

// ---- photos ----------------------------------------------------------------------------------------
// A photo is a small picture held as text inside the notes. Only that form is accepted, so a photo can
// never point at another site, and showing it never makes a request.
const PHOTO_MAX = 120000;
export const okPhoto = (v) => typeof v === "string" && v.length < PHOTO_MAX && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v);

const initials = (name) =>
  String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

// The photo if there is one, and the initials if there is not.
export const face = (p, cls = "") =>
  okPhoto(p.photo) ? h("img", { class: "face " + cls, src: p.photo, alt: p.name ? "Photo of " + p.name : "Photo", width: 64, height: 64 }) : h("span", { class: "face face-none " + cls, "aria-hidden": "true" }, initials(p.name));

// Shrinks a picture from the reader's device to a small square, on this device.
function squarePhoto(file, size = 256) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const hgt = img.naturalHeight;
      const side = Math.min(w, hgt);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, size, size);
      // a tall picture usually has the face above the middle
      ctx.drawImage(img, (w - side) / 2, (hgt - side) * (hgt > w ? 0.3 : 0.5), side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That picture could not be read. Try a JPEG or a PNG."));
    };
    img.src = url;
  });
}

// ---- a panel file ----------------------------------------------------------------------------------
// { app: "onetwenty-panel", v: 1, people: [{ name, role, say, bg, lens, ask, photo }] }
// It is made outside this site and read on the reader's device. It is how photos arrive in one step.
const clip = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const nameKey = (name) =>
  String(name)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

export function readPanelFile(data) {
  if (!data || data.app !== "onetwenty-panel" || !Array.isArray(data.people)) throw new Error("That file is not a panel file.");
  return data.people
    .filter((p) => p && typeof p === "object")
    .map((p) => ({
      name: clip(p.name, 80),
      role: clip(p.role, 140),
      say: clip(p.say, 80),
      bg: clip(p.bg, 700),
      ask: clip(p.ask, 400),
      lens: LENSES.some(([k]) => k && k === p.lens) ? p.lens : "",
      photo: okPhoto(p.photo) ? p.photo : "",
    }))
    .filter((p) => p.name)
    .slice(0, 20);
}

// Adds the people in a file. Someone already on the list is updated: a field the file fills replaces
// the note, and a field the file leaves empty keeps what was typed.
export function mergePeople(found) {
  let added = 0;
  let updated = 0;
  for (const f of found) {
    const cur = S().panel.find((p) => nameKey(p.name) && nameKey(p.name) === nameKey(f.name));
    if (cur) {
      for (const k of ["name", "role", "say", "bg", "lens", "ask", "photo"]) if (f[k]) cur[k] = f[k];
      updated++;
    } else {
      S().panel.push(blank(f));
      added++;
    }
  }
  return { added, updated };
}

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
  const roster = h("ul", { class: "roster", "aria-label": "The people you will meet" });
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
    count.textContent = people.length ? `${named} ${named === 1 ? "person" : "people"} named. Kept in this browser only.` : "No one here yet. Load a panel file, paste a list, or add people one at a time.";
    const ready = people.filter((p) => p.name.trim() && (p.bg.trim() || p.role.trim())).length >= 2;
    clear(drillRow).append(
      ready ? h("a", { class: "btn btn-go", href: "#/panel/recall" }, icon("play"), "Test yourself on who is who") : h("span", { class: "muted" }, "Add two people with a name and a background, and a recall drill appears here."),
    );
    paintRoster();
  }

  // Everyone at a glance: a face, a name, a role, and the line on their background.
  function paintRoster() {
    const named = S().panel.filter((p) => p.name.trim());
    roster.hidden = !named.length;
    clear(roster);
    add(
      roster,
      named.map((p) => h("li", { class: "roster-row" }, face(p), h("div", null, h("p", { class: "roster-name" }, p.name), p.role.trim() ? h("p", { class: "roster-role" }, p.role) : null, p.bg.trim() ? h("p", { class: "roster-bg" }, p.bg) : null))),
    );
  }

  // Keeps a change that includes a photo only if the browser has room for it.
  function keep(undo) {
    if (saveNow()) return true;
    undo();
    saveNow();
    toast("This browser has no room left for that photo.");
    return false;
  }

  function photoControls(p) {
    const input = h("input", {
      type: "file",
      accept: "image/*",
      hidden: true,
      onchange: async () => {
        const file = input.files?.[0];
        if (!file) return;
        const before = p.photo;
        try {
          p.photo = await squarePhoto(file);
        } catch (err) {
          return toast(err.message);
        }
        keep(() => (p.photo = before));
        paint();
      },
    });
    return h(
      "div",
      { class: "person-photo" },
      h("button", { class: "link-btn", type: "button", onclick: () => input.click() }, okPhoto(p.photo) ? "Change the photo" : "Add a photo"),
      okPhoto(p.photo)
        ? h(
            "button",
            {
              class: "link-btn",
              type: "button",
              onclick: () => {
                p.photo = "";
                save();
                paint();
              },
            },
            "Remove the photo",
          )
        : null,
      input,
    );
  }

  function card(p, i) {
    return h(
      "div",
      { class: "card person" },
      h("div", { class: "person-top" }, face(p), h("div", null, h("p", { class: "card-title" }, `Person ${i + 1}`), photoControls(p))),
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
          style: "align-self: flex-start; margin-top: 6px",
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

  const fileFold = h(
    "details",
    { class: "fold" },
    h("summary", null, "Load a panel file"),
    h(
      "p",
      { class: "body", style: "font-size: 15px" },
      "A panel file holds the names, notes, and photos for several people. It is read on this device, and nothing is uploaded. Someone who is already on your list is updated: a field the file fills replaces your note, and a field it leaves empty keeps what you typed.",
    ),
    h(
      "div",
      { class: "btn-row", style: "margin-top: 10px" },
      h(
        "label",
        { class: "btn btn-go" },
        "Choose a panel file",
        h("input", {
          type: "file",
          accept: "application/json,.json",
          hidden: true,
          onchange: async (e) => {
            const file = e.target.files[0];
            e.target.value = "";
            if (!file) return;
            let found;
            try {
              found = readPanelFile(JSON.parse(await file.text()));
            } catch (err) {
              return toast(err instanceof SyntaxError ? "That file could not be read." : err.message);
            }
            if (!found.length) return toast("That file names no one.");
            const before = JSON.stringify(S().panel);
            const { added, updated } = mergePeople(found);
            if (!keep(() => (S().panel = JSON.parse(before)))) return paint();
            logDay();
            fileFold.open = false;
            paint();
            const photos = found.filter((p) => p.photo).length;
            toast(`Loaded ${found.length}: ${added} added, ${updated} updated, ${photos} with a photo.`);
          },
        }),
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
        h("p", { class: "hero-sub" }, "A private notebook for the people you will meet: a face, a name, a role, a line or two on their background, and one question for each. Learn the names and the faces before you walk in."),
        count,
      ),
      h(
        "div",
        { class: "next" },
        h("span", { class: "next-where" }, "Private by design"),
        h("p", { class: "next-meta", style: "margin: 0; color: var(--ink)" }, "What you type or load here stays in this browser, with the rest of your progress. No person is named or pictured anywhere in this site's code, and nothing on this page is sent anywhere."),
        h("p", { class: "next-hint" }, "Photos work the same way. A photo you add is shrunk on this device and kept in this browser. It is never uploaded."),
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
      h("p", { class: "body" }, "Keep each note short. You want a face you recognize, a name you can say, one fact that shows you looked, and one question that only this person can answer."),
      roster,
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
      fileFold,
      list,
    ),
    sec("use", "In the room", "Use the names", bullets(USE), h("p", { class: "body", style: "margin-top: 12px" }, "The four lenses, and what each one listens for, are in ", h("a", { href: "#/playbook" }, "the playbook"), ".")),
    sec("recall", "Before you walk in", "Test yourself", h("p", { class: "body" }, "The drill shows a face or a background and asks for the name, then shows a name and asks what you know. It uses only the notes and photos above."), drillRow),
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
    // Every face is asked once. The other cards fill the round up to twelve.
    const faces = people.filter((p) => okPhoto(p.photo)).map((p) => ({ id: p.id + "-face", topic: "Who is this?", q: "A face from your notes", face: p.photo, p }));
    const rest = mixed([
      ...people.map((p) => ({ id: p.id + "-who", topic: "Who is this?", q: [p.role, p.bg].filter((x) => x.trim()).join(". "), p })),
      ...people.map((p) => ({ id: p.id + "-what", topic: "What do you know about this person?", q: p.name, p, about: true })),
    ]);
    const items = mixed([...faces, ...rest.slice(0, Math.max(0, 12 - faces.length))]);
    stop = runDeck(root, {
      back: ["#/panel", "The panel"],
      title: "Who is who",
      items,
      returnMissed: true,
      answer: (x) =>
        x.about
          ? [h("p", { class: "fc-a" }, [x.p.role, x.p.bg].filter((t) => t.trim()).join(". ")), x.p.lens ? h("p", { class: "fc-note" }, "Listens for: " + lensName(x.p.lens)) : null, x.p.ask ? h("p", { class: "fc-note" }, "Your question: " + x.p.ask) : null]
          : [
              h("p", { class: "fc-a" }, h("mark", null, x.p.name), x.face && x.p.role.trim() ? ". " + x.p.role : ""),
              x.p.say ? h("p", { class: "fc-note" }, "Say it: " + x.p.say) : null,
              x.face && x.p.bg.trim() ? h("p", { class: "fc-note" }, x.p.bg) : null,
              !x.face && okPhoto(x.p.photo) ? face(x.p) : null,
            ],
      onFirst: () => logDay(),
      again: run,
    });
    window.scrollTo(0, 0);
  };
  run();
  return () => stop();
}
