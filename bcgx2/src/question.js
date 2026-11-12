// One quiz question: numeric, single choice, or select all that apply. Also the Python calculator.
import { X } from "./content.js";
import { add, h, icon, shuffled } from "./dom.js";
import { consoleLine } from "./runtime.js";

export function parseNumber(text) {
  const t = String(text ?? "").trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return Number(t);
}

// value: a string for numeric, an option index for single, a list of option indexes for multi.
export function judge(q, value) {
  if (q.type === "numeric") {
    const x = parseNumber(value);
    if (x == null) return { answered: false, correct: false };
    const tol = 0.5 * 10 ** -q.decimals + 1e-9;
    const off = Math.abs(x - q.exact);
    return { answered: true, correct: off <= tol, close: off > tol && off <= 20 * tol };
  }
  if (q.type === "single") {
    if (value == null) return { answered: false, correct: false };
    return { answered: true, correct: !!q.options[value]?.correct };
  }
  const picked = new Set(value || []);
  return { answered: picked.size > 0, correct: picked.size > 0 && q.options.every((o, i) => o.correct === picked.has(i)) };
}

export function answerText(q, value) {
  if (q.type === "numeric") return String(value ?? "").trim() || "no answer";
  const picked = q.type === "single" ? (value == null ? [] : [value]) : value || [];
  return picked.length ? picked.map((i) => q.options[i].text).join("; ") : "no answer";
}

// mode "ask": Submit shows the answer and the explanation. mode "mock": answers save quietly.
// mode "shown": locked, with the answer and the explanation.
export function questionCard({ q, mode, value, seed = "", onChange, onSubmit }) {
  let current = value ?? (q.type === "multi" ? [] : q.type === "numeric" ? "" : null);
  let locked = mode === "shown";
  const order = q.options ? shuffled(q.options.length, q.id + seed) : [];
  const opts = [];
  const feedback = h("div", { class: "q-feedback", "aria-live": "polite" });
  const problem = h("p", { class: "q-problem", hidden: true });
  const submit = mode === "ask" ? h("button", { class: "btn btn-go", type: "submit" }, "Submit answer") : null;
  const saved = mode === "mock" ? h("span", { class: "q-saved muted" }) : null;
  let field = null;

  const note = () => {
    if (saved) saved.textContent = judge(q, current).answered ? "Answer saved. You can change it until you finish the test." : "";
  };
  const changed = () => {
    note();
    problem.hidden = true;
    onChange?.(current);
  };

  let control;
  if (q.type === "numeric") {
    field = h("input", {
      class: "q-input",
      type: "text",
      inputMode: "decimal",
      autocomplete: "off",
      spellcheck: false,
      placeholder: "0.000",
      value: current,
      id: "answer-" + q.id,
      disabled: locked,
      oninput: () => {
        current = field.value;
        changed();
      },
    });
    control = h("div", { class: "q-num" }, h("label", { for: "answer-" + q.id }, "Your answer"), field);
  } else {
    const multi = q.type === "multi";
    control = h("fieldset", { class: "q-options" }, h("legend", null, multi ? "Select all that apply." : "Select one."));
    for (const i of order) {
      const o = q.options[i];
      const input = h("input", {
        type: multi ? "checkbox" : "radio",
        name: "opt-" + q.id,
        checked: multi ? current.includes(i) : current === i,
        disabled: locked,
        onchange: () => {
          if (multi) current = opts.filter((x) => x.input.checked).map((x) => x.i).sort((a, b) => a - b);
          else current = i;
          changed();
        },
      });
      const mark = h("span", { class: "opt-mark" });
      const why = h("span", { class: "opt-why", hidden: true }, o.why);
      const row = h("label", { class: "opt" }, input, h("span", { class: "opt-main" }, h("span", { class: "opt-text", html: o.text }), why), mark);
      opts.push({ i, o, input, row, mark, why });
      control.append(row);
    }
  }

  function reveal() {
    const res = judge(q, current);
    locked = true;
    if (field) field.disabled = true;
    const picked = new Set(q.type === "single" ? (current == null ? [] : [current]) : q.type === "multi" ? current : []);
    for (const x of opts) {
      x.input.disabled = true;
      x.why.hidden = false;
      const on = picked.has(x.i);
      x.row.classList.add(x.o.correct ? "is-right" : "is-wrong");
      if (on) x.row.classList.add("is-picked");
      x.mark.replaceChildren(x.o.correct ? icon("check", on ? "Right, and you picked it" : "Right, and you missed it") : on ? icon("cross", "Not right") : "");
      if (x.o.correct && !on) x.mark.append(h("span", { class: "opt-missed" }, "missed"));
    }
    feedback.replaceChildren();
    let head;
    if (!res.answered) head = h("p", { class: "verdict is-miss" }, icon("ring"), q.type === "numeric" ? `No answer. The answer is ${q.answer}.` : "No answer. The right options are marked.");
    else if (res.correct) head = h("p", { class: "verdict is-hit" }, icon("check"), q.type === "numeric" ? `Correct. The answer is ${q.answer}.` : "Correct.");
    else if (q.type === "numeric") {
      head = h("p", { class: "verdict is-miss" }, icon("cross"), `The answer is ${q.answer}. You entered ${String(current).trim()}.`, res.close ? " The method looks right, so check the rounding." : "");
    } else head = h("p", { class: "verdict is-miss" }, icon("cross"), q.type === "multi" ? "Not this time. The marks show which options are right." : "Not this time. The right option is marked.");
    const lesson = q.see && X.lesson[q.see];
    add(
      feedback,
      head,
      h("div", { class: "q-explain prose", html: q.explain }),
      q.ref || lesson ? h("p", { class: "q-ref muted" }, q.ref, q.ref && lesson ? ". " : "", lesson ? ["Refresher: ", h("a", { href: `#/learn/${lesson.id}` }, lesson.title)] : null) : null,
    );
    if (submit) submit.hidden = true;
    return res;
  }

  const form = h(
    "form",
    {
      class: "q-form",
      onsubmit: (e) => {
        e.preventDefault();
        if (locked || mode !== "ask") return;
        if (!judge(q, current).answered) {
          problem.textContent = q.type === "numeric" ? "Enter a number, for example 0.123." : "Pick an option first.";
          problem.hidden = false;
          return;
        }
        const res = reveal();
        onSubmit?.({ value: current, ...res });
      },
    },
    control,
    problem,
    h("div", { class: "q-actions" }, submit, saved),
  );

  const el = h("div", { class: "q q-" + q.type }, h("div", { class: "q-stem prose", html: q.stem }), form, feedback);
  if (mode === "shown") reveal();
  note();
  return {
    el,
    focus: () => (field || opts[0]?.input)?.focus({ preventScroll: true }),
  };
}

// A Python prompt for the arithmetic. The real test expects answers to three decimals, so you need one.
export function calculator() {
  const past = [];
  let at = 0;
  let n = 0;
  const log = h("div", { class: "calc-log", "aria-live": "polite" });
  const input = h("input", { class: "calc-in", type: "text", spellcheck: false, autocomplete: "off", autocapitalize: "off", "aria-label": "Python expression", placeholder: "comb(12, 2) * 0.15**2 * 0.85**10" });
  const print = (cls, text) => {
    log.append(h("div", { class: "ln ln-" + cls }, text));
    log.scrollTop = log.scrollHeight;
  };
  const form = h(
    "form",
    {
      class: "calc-form",
      onsubmit: async (e) => {
        e.preventDefault();
        const src = input.value.trim();
        if (!src) return;
        past.push(src);
        at = past.length;
        input.value = "";
        print("cmd", ">>> " + src);
        const mine = ++n;
        const wait = setTimeout(() => mine === n && print("note", "Python is still starting. This runs as soon as it is ready."), 1200);
        try {
          const res = await consoleLine({ slot: "calc", src, onEvent: (m) => m.type === "out" && m.lines.forEach(([kind, text]) => print(kind, text)) });
          if (res.error) print("err", res.error.trim().split("\n").at(-1));
        } catch (err) {
          print("err", err.message);
        } finally {
          clearTimeout(wait);
        }
      },
    },
    h("span", { class: "calc-prompt", "aria-hidden": "true" }, ">>>"),
    input,
  );
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" && at > 0) {
      input.value = past[--at];
      e.preventDefault();
    } else if (e.key === "ArrowDown" && at < past.length) {
      input.value = past[++at] ?? "";
      e.preventDefault();
    }
  });
  const el = h(
    "details",
    { class: "calc" },
    h("summary", null, icon("calc"), "Calculator"),
    h("div", { class: "calc-body" }, h("p", { class: "muted calc-tip" }, "Python, with math loaded. Try comb(n, k), exp(x), sqrt(x), or NormalDist(40, 6).cdf(52). The last result is _."), log, form),
  );
  el.addEventListener("toggle", () => el.open && input.focus({ preventScroll: true }));
  return el;
}
