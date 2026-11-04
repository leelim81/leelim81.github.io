import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, placeholder } from "@codemirror/view";
import { EditorState, Compartment, Prec } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { sql, StandardSQL } from "@codemirror/lang-sql";
import { defaultKeymap, indentWithTab, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentOnInput, indentUnit } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap, autocompletion, acceptCompletion } from "@codemirror/autocomplete";
import { oneDark } from "@codemirror/theme-one-dark";
import { pythonCompletions, sqlCompletions } from "./complete.js";

const langComp = new Compartment();
const themeComp = new Compartment();
const acComp = new Compartment();
const lookComp = new Compartment();
const wrapComp = new Compartment();

function look(fontSize, tabSize) {
  const unit = " ".repeat(Math.max(2, Number(tabSize) || 4));
  return [
    indentUnit.of(unit),
    EditorView.theme({
      "&": { height: "100%", fontSize: `${fontSize || 16}px` },
      ".cm-scroller": {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
        lineHeight: "1.5",
        overflow: "auto",
      },
      ".cm-content": { padding: "10px 0 40px" },
      ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "#7d8696" },
      "&.cm-focused": { outline: "none" },
    }),
  ];
}

function language(lang) {
  if (lang === "sql") return sql({ dialect: StandardSQL });
  return python();
}

function completionExt(lang, enabled) {
  if (!enabled) return [];
  return autocompletion({
    activateOnTyping: true,
    selectOnOpen: false,
    defaultKeymap: false,
    maxRenderedOptions: 8,
    interactionDelay: 40,
    override: [lang === "sql" ? sqlCompletions : pythonCompletions],
  });
}

export function createEditor(parent, { value, lang, theme, fontSize, tabSize, autocomplete, onChange, wrap }) {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: value || "",
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        EditorView.contentAttributes.of({
          autocorrect: "off",
          autocapitalize: "none",
          spellcheck: "false",
          "data-gramm": "false",
        }),
        Prec.high(keymap.of([{ key: "Tab", run: acceptCompletion }])),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        langComp.of(language(lang)),
        themeComp.of(theme === "light" ? [] : oneDark),
        acComp.of(completionExt(lang, autocomplete)),
        lookComp.of(look(fontSize, tabSize)),
        wrapComp.of(wrap ? EditorView.lineWrapping : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && onChange) onChange(update.state.doc.toString());
        }),
      ],
    }),
  });

  return {
    view,
    lang,
    get: () => view.state.doc.toString(),
    set(next) {
      const cur = view.state.doc.toString();
      if (cur === next) return;
      view.dispatch({ changes: { from: 0, to: cur.length, insert: next || "" } });
    },
    insert(text, cursorBack = 0) {
      const sel = view.state.selection.main;
      const from = sel.from;
      view.dispatch({
        changes: { from, to: sel.to, insert: text },
        selection: { anchor: from + text.length - cursorBack },
      });
      view.focus();
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
    setAutocomplete(enabled, nextLang) {
      view.dispatch({ effects: acComp.reconfigure(completionExt(nextLang || lang, enabled)) });
    },
    setFontSize(size, tabs) {
      view.dispatch({ effects: lookComp.reconfigure(look(size, tabs)) });
    },
    setTheme(next) {
      view.dispatch({ effects: themeComp.reconfigure(next === "light" ? [] : oneDark) });
    },
    setWrap(on) {
      view.dispatch({ effects: wrapComp.reconfigure(on ? EditorView.lineWrapping : []) });
    },
  };
}

export { placeholder };
