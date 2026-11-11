import { isCompileKey, isSyncToPdfKey } from "../lib/shortcuts";
import {
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
  type Panel,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { latex, latexCompletionSource } from "codemirror-lang-latex";
import { closeBracketsBefore, deadKeyInput, LATEX_CLOSE_BRACKETS } from "./brackets";
import { bold, italic, run } from "./commands";
import { beginOnCloseBrace } from "./figure";
import { withUsageBoost } from "./completionUsage";
import { environmentBraces } from "./latexCompletion";
import { leftRightPairs } from "./leftRight";
import { notAfterLineBreak } from "./lineBreak";
import { lineCopy } from "./lineCopy";
import { listFirstItem } from "./listItem";
import { mathDelimiters } from "./mathDelimiters";
import { pasteCursor } from "./pasteCursor";
import { inactiveWindow } from "./inactiveWindow";
import { pasteImage } from "./pasteImage";
import {
  acceptRequestedCompletion,
  COMPLETION_INTERACTION_DELAY_MS,
  COMPLETION_TYPING_DELAY_MS,
  snippetTabKeymap,
  tabInMath,
} from "./mathTab";
import { editorTheme } from "./theme";

export type EditorCallbacks = {
  /** The find/replace bar (Ctrl+F); CodeMirror's default panel if not given. */
  searchPanel?: (view: EditorView) => Panel;
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
  /** Pasting with no text on the clipboard (maybe an image). */
  onPasteImage?: (view: EditorView) => void;
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
    deadKeyInput,
    Prec.highest(mathDelimiters),
    leftRightPairs,
    listFirstItem,
    // Before the language package's `}` (which only adds `\end{figure}`, and a second `}`).
    Prec.highest(beginOnCloseBrace),
    lineCopy,
    pasteCursor,
    inactiveWindow,
    ...(callbacks.onPasteImage ? [Prec.highest(pasteImage(callbacks.onPasteImage))] : []),
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
      EditorState.languageData.of((state, pos) => [
        {
          closeBrackets: {
            brackets: LATEX_CLOSE_BRACKETS,
            before: closeBracketsBefore(state, pos),
          },
        },
      ]),
    ),
    // The language package configures autocompletion with `override`, which would hide any
    // other source; its source is combined here with ours instead.
    autocompletion({
      // Every source remembers what is chosen in the project and ranks it higher.
      override: [...completions, environmentBraces(latexCompletionSource(true))].map((source) =>
        notAfterLineBreak(withUsageBoost(source)),
      ),
      interactionDelay: COMPLETION_INTERACTION_DELAY_MS,
      // CodeMirror waits 100 ms of no typing before asking the sources, also for each new
      // letter: the list appeared and followed the typing late (pedido del usuario). The
      // sources are synchronous and cheap, so they are asked almost at once.
      activateOnTypingDelay: COMPLETION_TYPING_DELAY_MS,
    }),
    acceptRequestedCompletion,
    snippetTabKeymap,
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches({ wholeWords: true }),
    // Case-sensitive by default, like the project search (pedido del usuario).
    search({ top: true, createPanel: callbacks.searchPanel, literal: true, caseSensitive: true }),
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
        // Tab accepts the selected suggestion (Enter still works), moves through arguments
        // and, in math, completes; otherwise it indents (see mathTab.ts).
        { key: "Tab", run: tabInMath },
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
      // Like indentWithTab, but Tab completes and moves through arguments first.
      { key: "Tab", run: indentMore, shift: indentLess },
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
