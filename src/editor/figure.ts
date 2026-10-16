/**
 * `\begin{figure}` written as a command (closing its brace by hand, or picking «figure» from
 * the list of environments) comes with everything an image needs, like the toolbar's figure:
 * placement, `\centering`, `\includegraphics` (cursor on the path), caption, label and
 * `\end{figure}`; and `graphicx` in the preamble if the file has one without it.
 */
import { EditorSelection, EditorState, type TransactionSpec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { addToPreamble } from "../lib/packages/preamble";

const FIGURE = /^figure\*?$/;

/**
 * Replaces `from`–`to` with `typed` and the rest of the figure, when the text before `from`
 * plus `typed` is `\begin{figure` (or `figure*`). Null for other environments.
 */
export function figureSpec(
  state: EditorState,
  from: number,
  to: number,
  typed: string,
): TransactionSpec | null {
  const line = state.doc.lineAt(from);
  const begin = /\\begin\{([^{}]*)$/.exec(line.text.slice(0, from - line.from));
  const name = begin ? begin[1] + typed : "";
  if (!begin || !FIGURE.test(name)) return null;
  const indent = /^\s*/.exec(line.text)![0];
  const inner = `${indent}  `;
  const head = `${typed}}[htbp]\n${inner}\\centering\n${inner}\\includegraphics[width=0.8\\linewidth]{`;
  const tail = `}\n${inner}\\caption{}\n${inner}\\label{fig:}\n${indent}\\end{${name}}`;
  const changes = [{ from, to, insert: head + tail }];

  const preamble = addToPreamble(state.doc.toString(), "graphicx");
  if (preamble.kind === "added") {
    const at = state.doc.line(preamble.line).from;
    changes.push({ from: at, to: at, insert: "\\usepackage{graphicx}\n" });
  }
  const set = state.changes(changes);
  return {
    changes: set,
    selection: EditorSelection.cursor(set.mapPos(from, -1) + head.length),
    scrollIntoView: true,
    userEvent: "input.complete",
  };
}

/** Typing the `}` that closes `\begin{figure` (over the auto-inserted one, if any). */
export const figureOnCloseBrace = keymap.of([
  {
    key: "}",
    run: (view) => {
      const { state } = view;
      const range = state.selection.main;
      if (!range.empty || state.selection.ranges.length > 1) return false;
      const closing = state.sliceDoc(range.head, range.head + 1) === "}" ? 1 : 0;
      const spec = figureSpec(state, range.head, range.head + closing, "");
      if (!spec) return false;
      view.dispatch(spec);
      return true;
    },
  },
]);
