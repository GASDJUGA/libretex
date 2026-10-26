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
const GRAPHICS = "\\includegraphics[width=0.8\\linewidth]";

/** `\usepackage{graphicx}` added to the file's preamble, if it has one without it. */
function withGraphicx(state: EditorState) {
  const preamble = addToPreamble(state.doc.toString(), "graphicx");
  if (preamble.kind !== "added") return [];
  const at = state.doc.line(preamble.line).from;
  return [{ from: at, to: at, insert: "\\usepackage{graphicx}\n" }];
}

/** Whether `pos` is inside a `figure` environment (its `\begin` seen, its `\end` not yet). */
function insideFigure(state: EditorState, pos: number): boolean {
  const before = state.sliceDoc(0, pos);
  const begin = before.search(/\\begin\{figure\*?\}(?![^]*\\begin\{figure\*?\})/);
  return begin >= 0 && !/\\end\{figure\*?\}/.test(before.slice(begin));
}

/**
 * Inserts an image saved in the project (pegar una captura): the whole figure with `path`
 * and `fig:<name>` as label, cursor in the caption; just `\includegraphics` if the cursor is
 * already inside a figure. A figure goes on its own line (after the cursor's, if that one has
 * text).
 */
export function imageSpec(state: EditorState, path: string): TransactionSpec {
  const { head } = state.selection.main;
  const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.[^.]*$/, "");
  if (insideFigure(state, head)) {
    const insert = `${GRAPHICS}{${path}}`;
    const set = state.changes([{ from: head, insert }, ...withGraphicx(state)]);
    return {
      changes: set,
      selection: EditorSelection.cursor(set.mapPos(head, 1)),
      scrollIntoView: true,
      userEvent: "input.paste",
    };
  }
  const line = state.doc.lineAt(head);
  const indent = /^\s*/.exec(line.text)![0];
  const inner = `${indent}  `;
  const blank = line.text.trim() === "";
  const before =
    `${blank ? "" : `\n${indent}`}\\begin{figure}[htbp]\n${inner}\\centering\n` +
    `${inner}${GRAPHICS}{${path}}\n${inner}\\caption{`;
  const after = `}\n${inner}\\label{fig:${name}}\n${indent}\\end{figure}`;
  const from = blank ? line.from + indent.length : line.to;
  const set = state.changes([
    { from, to: line.to, insert: before + after },
    ...withGraphicx(state),
  ]);
  return {
    changes: set,
    selection: EditorSelection.cursor(set.mapPos(from, -1) + before.length),
    scrollIntoView: true,
    userEvent: "input.paste",
  };
}

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
  const head = `${typed}}[htbp]\n${inner}\\centering\n${inner}${GRAPHICS}{`;
  const tail = `}\n${inner}\\caption{}\n${inner}\\label{fig:}\n${indent}\\end{${name}}`;
  const set = state.changes([{ from, to, insert: head + tail }, ...withGraphicx(state)]);
  return {
    changes: set,
    selection: EditorSelection.cursor(set.mapPos(from, -1) + head.length),
    scrollIntoView: true,
    userEvent: "input.complete",
  };
}

/**
 * Typing the `}` that closes `\begin{name`: the environment's `\end` (the whole figure for
 * `figure`). The `}` typed takes the place of the one closed automatically after `{`: the
 * language package's own handler added another and left `\end{itemize}}`.
 */
export const beginOnCloseBrace = keymap.of([
  {
    key: "}",
    run: (view) => {
      const { state } = view;
      const range = state.selection.main;
      if (!range.empty || state.selection.ranges.length > 1) return false;
      const closing = state.sliceDoc(range.head, range.head + 1) === "}" ? 1 : 0;
      const to = range.head + closing;
      const spec = figureSpec(state, range.head, to, "") ?? environmentEnd(state, range.head, to);
      if (!spec) return false;
      view.dispatch(spec);
      return true;
    },
  },
]);

/** `}`, an empty indented line (the cursor) and `\end{name}`, after `\begin{name`. */
function environmentEnd(state: EditorState, from: number, to: number): TransactionSpec | null {
  const line = state.doc.lineAt(from);
  const begin = /\\begin\{([A-Za-z]+\*?)$/.exec(line.text.slice(0, from - line.from));
  if (!begin) return null;
  const indent = /^\s*/.exec(line.text)![0];
  const inner = `${indent}  `;
  return {
    changes: { from, to, insert: `}\n${inner}\n${indent}\\end{${begin[1]}}` },
    selection: { anchor: from + 2 + inner.length },
    scrollIntoView: true,
    userEvent: "input.type",
  };
}
