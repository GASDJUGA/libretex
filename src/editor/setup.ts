import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  codeFolding,
  foldGutter,
  foldKeymap,
  indentOnInput,
} from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { EditorState, Prec, type Extension } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { latex } from "codemirror-lang-latex";
import { bold, italic, run } from "./commands";
import { editorTheme } from "./theme";

/**
 * Only {} [] () and $ are closed automatically: the language's default also pairs ' and ",
 * which gets in the way of ``quotes'' and apostrophes in prose.
 */
export const LATEX_CLOSE_BRACKETS = ["(", "[", "{", "$"];

export type EditorCallbacks = {
  /** The document changed (typing, undo, paste…). */
  onChange: (doc: string) => void;
  /** The cursor moved to another line (1-based). */
  onCursorLine: (line: number) => void;
  /** Ctrl+S. */
  onSave: () => void;
};

/** Extensions shared by every file opened in the editor. */
export function editorExtensions(callbacks: EditorCallbacks, extra: Extension[] = []): Extension[] {
  let lastLine = -1;
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    codeFolding(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    Prec.highest(
      EditorState.languageData.of(() => [
        // `before`: also close when the next character is `$` (e.g. `{` typed inside `$|$`).
        { closeBrackets: { brackets: LATEX_CLOSE_BRACKETS, before: ")]}:;>$" } },
      ]),
    ),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    EditorView.lineWrapping,
    latex({
      autoCloseTags: true,
      autoCloseBrackets: false,
      // Per-file linting gives false positives in multi-file projects (labels and the
      // bibliography live in other files); compile diagnostics arrive in phase 5.
      enableLinting: false,
      // Hover help is English-only; the UI is Spanish by default.
      enableTooltips: false,
      enableAutocomplete: true,
    }),
    editorTheme,
    Prec.high(
      keymap.of([
        {
          key: "Mod-b",
          run: (view) => {
            run(view, bold);
            return true;
          },
        },
        {
          key: "Mod-i",
          run: (view) => {
            run(view, italic);
            return true;
          },
        },
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            callbacks.onSave();
            return true;
          },
        },
      ]),
    ),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) callbacks.onChange(update.state.doc.toString());
      if (update.selectionSet || update.docChanged) {
        const line = update.state.doc.lineAt(update.state.selection.main.head).number;
        if (line !== lastLine) {
          lastLine = line;
          callbacks.onCursorLine(line);
        }
      }
    }),
    ...extra,
  ];
}
