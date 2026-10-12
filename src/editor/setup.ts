import { isCompileKey, isSyncToPdfKey } from "../lib/shortcuts";
import {
  acceptCompletion,
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type CompletionSource,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentLess,
  indentMore,
} from "@codemirror/commands";
import {
  bracketMatching,
  codeFolding,
  foldGutter,
  foldKeymap,
  indentOnInput,
} from "@codemirror/language";
import { lintGutter } from "@codemirror/lint";
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
import { latex, latexCompletionSource } from "codemirror-lang-latex";
import { bold, italic, run } from "./commands";
import { environmentBraces } from "./latexCompletion";
import { mathDelimiters } from "./mathDelimiters";
import { acceptRequestedCompletion, COMPLETION_INTERACTION_DELAY_MS, tabInMath } from "./mathTab";
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
  /** Ctrl+Enter (replaces CodeMirror's «insert blank line»). */
  onCompile?: () => void;
  /** Ctrl+J: show the cursor's place in the PDF (SyncTeX). */
  onSyncToPdf?: () => void;
};

/**
 * Extensions shared by every file opened in the editor. `completions` are extra sources
 * (project references, citations, paths) queried before the LaTeX commands/environments.
 */
export function editorExtensions(
  callbacks: EditorCallbacks,
  extra: Extension[] = [],
  completions: CompletionSource[] = [],
): Extension[] {
  let lastLine = -1;
  return [
    lineNumbers(),
    // Compilation problems (set from the log with setDiagnostics).
    lintGutter(),
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
    Prec.highest(mathDelimiters),
    // Ctrl+J and Ctrl+Enter by DOM event (not keymap): Ctrl+J may arrive as «Enter».
    Prec.highest(
      EditorView.domEventHandlers({
        keydown: (event) => {
          if (isSyncToPdfKey(event)) callbacks.onSyncToPdf?.();
          else if (isCompileKey(event)) callbacks.onCompile?.();
          else return false;
          event.preventDefault();
          return true;
        },
      }),
    ),
    Prec.highest(
      EditorState.languageData.of(() => [
        // `before`: also close when the next character is `$` (e.g. `{` typed inside `$|$`).
        { closeBrackets: { brackets: LATEX_CLOSE_BRACKETS, before: ")]}:;>$" } },
      ]),
    ),
    // The language package configures autocompletion with `override`, which would hide any
    // other source; its source is combined here with ours instead.
    autocompletion({
      override: [...completions, environmentBraces(latexCompletionSource(true))],
      interactionDelay: COMPLETION_INTERACTION_DELAY_MS,
    }),
    acceptRequestedCompletion,
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches({ wholeWords: true }),
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
      enableAutocomplete: false,
    }),
    editorTheme,
    Prec.high(
      keymap.of([
        // Tab accepts the selected suggestion (Enter still works); otherwise it indents.
        { key: "Tab", run: acceptCompletion },
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
      // Like indentWithTab, but inside math Tab completes instead (see mathTab.ts).
      { key: "Tab", run: (view) => tabInMath(view) || indentMore(view), shift: indentLess },
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
