// The code editor (CodeMirror 6) and a static highlighter for read-only code.
import { acceptCompletion, autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { python, pythonLanguage } from "@codemirror/lang-python";
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, Prec, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import { classHighlighter, highlightTree } from "@lezer/highlight";
import { esc } from "./dom.js";

const look = EditorView.theme({
  "&": { height: "100%", fontSize: "var(--code-size)", color: "var(--ink)", backgroundColor: "var(--paper)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "1.6" },
  ".cm-content": { padding: "10px 0", caretColor: "var(--ink)" },
  ".cm-line": { padding: "0 14px 0 10px" },
  ".cm-gutters": { backgroundColor: "var(--paper)", color: "var(--faint)", border: "none", borderRight: "1px solid var(--rule)" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 14px", minWidth: "2.2em" },
  ".cm-activeLine": { backgroundColor: "var(--line)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--line)", color: "var(--ink)" },
  ".cm-cursor": { borderLeftColor: "var(--ink)", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "var(--select)" },
  ".cm-selectionMatch": { backgroundColor: "var(--match)" },
  "&.cm-focused .cm-matchingBracket": { backgroundColor: "var(--match)", outline: "1px solid var(--rule-strong)" },
  ".cm-errline": { backgroundColor: "var(--fail-wash)" },
  ".cm-tooltip": { backgroundColor: "var(--paper)", color: "var(--ink)", border: "1px solid var(--ink)", borderRadius: "3px" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": { fontFamily: "var(--mono)", fontSize: "0.92em" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "var(--marker)", color: "var(--marker-ink)" },
  ".cm-panels": { backgroundColor: "var(--desk)", color: "var(--ink)", borderTop: "1px solid var(--rule)" },
  ".cm-textfield": { backgroundColor: "var(--paper)", color: "var(--ink)", border: "1px solid var(--rule-strong)", borderRadius: "3px" },
  ".cm-button": { backgroundImage: "none", backgroundColor: "var(--paper)", color: "var(--ink)", border: "1px solid var(--rule-strong)", borderRadius: "3px" },
});

// Tab accepts a suggestion. Enter always starts a new line, so a suggestion never swallows it.
const completeKeys = [...completionKeymap.filter((k) => k.key !== "Enter"), { key: "Tab", run: acceptCompletion }];
const suggest = () => autocompletion({ defaultKeymap: false });

const markLine = StateEffect.define();
const errorLine = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    let next = tr.docChanged ? Decoration.none : deco;
    for (const e of tr.effects) {
      if (!e.is(markLine)) continue;
      const n = e.value;
      next = n && n >= 1 && n <= tr.state.doc.lines ? Decoration.set([Decoration.line({ class: "cm-errline" }).range(tr.state.doc.line(n).from)]) : Decoration.none;
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function createEditor({ parent, doc, onChange, onRun, onTest, onSave, autocomplete = true, label = "solution.py, code editor" }) {
  const complete = new Compartment();
  const run = (fn) => () => {
    fn?.();
    return true;
  };
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        Prec.highest(
          keymap.of([
            { key: "Mod-Enter", run: run(onRun) },
            { key: "Shift-Mod-Enter", run: run(onTest) },
            { key: "Mod-s", run: run(onSave) },
          ]),
        ),
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        history(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        indentUnit.of("    "),
        EditorState.tabSize.of(4),
        python(),
        syntaxHighlighting(classHighlighter),
        complete.of(autocomplete ? suggest() : []),
        errorLine,
        look,
        keymap.of([...closeBracketsKeymap, ...completeKeys, ...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        EditorView.contentAttributes.of({ "aria-label": label, spellcheck: "false", autocapitalize: "off" }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange?.(u.state.doc.toString());
        }),
      ],
    }),
  });
  return {
    get value() {
      return view.state.doc.toString();
    },
    set(text) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    focus: () => view.focus(),
    markError(line) {
      view.dispatch({ effects: markLine.of(line || 0) });
    },
    goTo(line) {
      if (!line || line < 1 || line > view.state.doc.lines) return;
      const at = view.state.doc.line(line).from;
      view.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: "center" }) });
      view.focus();
    },
    setAutocomplete(on) {
      view.dispatch({ effects: complete.reconfigure(on ? suggest() : []) });
    },
    destroy: () => view.destroy(),
  };
}

// Python source as highlighted HTML, for the reference solutions.
export function highlight(code) {
  let html = "";
  let at = 0;
  highlightTree(pythonLanguage.parser.parse(code), classHighlighter, (from, to, cls) => {
    html += esc(code.slice(at, from)) + `<span class="${cls}">${esc(code.slice(from, to))}</span>`;
    at = to;
  });
  return html + esc(code.slice(at));
}
