import {
  toggleComment as cmToggleComment,
  redo as cmRedo,
  undo as cmUndo,
} from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { EditorSelection, type EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/**
 * Editing commands of the toolbar and menus. Most are pure functions from a state to a
 * transaction (easy to test); `run` applies one to a view.
 */
export type EditCommand = (state: EditorState) => TransactionSpec | null;

/** Applies a command to the view and gives it the focus back. */
export function run(view: EditorView, command: EditCommand) {
  const spec = command(view.state);
  if (spec) view.dispatch({ scrollIntoView: true, userEvent: "input", ...spec });
  view.focus();
}

/**
 * Wraps each selection in `before`/`after`; an empty selection gets the cursor between them.
 * When the selection is already wrapped exactly, the wrapping is removed (toggle).
 */
export const wrap =
  (before: string, after: string): EditCommand =>
  (state) =>
    state.changeByRange((range) => {
      const outerFrom = range.from - before.length;
      const outerTo = range.to + after.length;
      const isWrapped =
        outerFrom >= 0 &&
        outerTo <= state.doc.length &&
        state.sliceDoc(outerFrom, range.from) === before &&
        state.sliceDoc(range.to, outerTo) === after;
      if (isWrapped) {
        return {
          changes: [
            { from: outerFrom, to: range.from, insert: "" },
            { from: range.to, to: outerTo, insert: "" },
          ],
          range: EditorSelection.range(outerFrom, range.to - before.length),
        };
      }
      return {
        changes: [
          { from: range.from, insert: before },
          { from: range.to, insert: after },
        ],
        range: EditorSelection.range(range.from + before.length, range.to + before.length),
      };
    });

export const bold = wrap("\\textbf{", "}");
export const italic = wrap("\\textit{", "}");
export const inlineMath = wrap("$", "$");
export const ref = wrap("\\ref{", "}");
export const cite = wrap("\\cite{", "}");

/** Marks where the cursor ends up in inserted templates (never appears in LaTeX). */
export const CURSOR = "\u0000";

/**
 * Inserts `text` on its own lines at the cursor, indented like the current line. The
 * selection (if any) replaces the `CURSOR` mark, and the cursor ends up after it.
 */
export const insertBlock =
  (text: string): EditCommand =>
  (state) => {
    const { from, to } = state.selection.main;
    const line = state.doc.lineAt(from);
    const indent = /^\s*/.exec(line.text)![0];
    const selected = state.sliceDoc(from, to);
    const body = text.replace(/\n/g, `\n${indent}`);
    const atLineStart = state.sliceDoc(line.from, from).trim() === "";
    const prefix = atLineStart ? "" : `\n${indent}`;
    const inserted = prefix + body.replace(CURSOR, selected);
    const cursor = from + prefix.length + body.indexOf(CURSOR) + selected.length;
    return {
      changes: { from, to, insert: inserted },
      selection: { anchor: cursor },
    };
  };

export const displayMath = insertBlock(`\\[\n  ${CURSOR}\n\\]`);
export const bulletList = insertBlock(`\\begin{itemize}\n  \\item ${CURSOR}\n\\end{itemize}`);
export const numberedList = insertBlock(`\\begin{enumerate}\n  \\item ${CURSOR}\n\\end{enumerate}`);
export const figure = insertBlock(
  `\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{${CURSOR}}\n  \\caption{}\n  \\label{fig:}\n\\end{figure}`,
);

/** `\href{url}{text}`: the selection becomes the text and the cursor goes to the URL. */
export const link: EditCommand = (state) =>
  state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to);
    const insert = `\\href{}{${text}}`;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(range.from + "\\href{".length),
    };
  });

/** A `table` with a `rows × cols` tabular; the cursor goes to the first cell. */
export function table(rows: number, cols: number): EditCommand {
  const spec = "|" + Array(cols).fill("c").join("|") + "|";
  const row = Array(cols).fill("").join(" & ") + " \\\\ \\hline";
  const lines = [
    "\\begin{table}[htbp]",
    "  \\centering",
    `  \\begin{tabular}{${spec}}`,
    "    \\hline",
    ...Array.from({ length: rows }, (_, i) => `    ${i === 0 ? CURSOR : ""}${row}`),
    "  \\end{tabular}",
    "  \\caption{}",
    "  \\label{tab:}",
    "\\end{table}",
  ];
  return insertBlock(lines.join("\n"));
}

export type HeadingLevel = "normal" | "section" | "subsection" | "subsubsection" | "paragraph";

const HEADING =
  /^(\s*)\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\{(.*)\}\s*$/;

/** Turns the cursor's line into a heading of `level` (or back into plain text). */
export const setHeading =
  (level: HeadingLevel): EditCommand =>
  (state) => {
    const line = state.doc.lineAt(state.selection.main.head);
    const match = HEADING.exec(line.text);
    const indent = match ? match[1] : /^\s*/.exec(line.text)![0];
    const title = match ? match[3] : line.text.trim();
    const text = level === "normal" ? `${indent}${title}` : `${indent}\\${level}{${title}}`;
    const titleStart = level === "normal" ? indent.length : indent.length + level.length + 2;
    return {
      changes: { from: line.from, to: line.to, insert: text },
      selection: { anchor: line.from + titleStart + title.length },
    };
  };

/** Heading level of the cursor's line, for the toolbar selector. */
export function headingAt(state: EditorState): HeadingLevel {
  const match = HEADING.exec(state.doc.lineAt(state.selection.main.head).text);
  const level = match?.[2];
  return level === "section" ||
    level === "subsection" ||
    level === "subsubsection" ||
    level === "paragraph"
    ? level
    : "normal";
}

/** Inserts a symbol command, adding a space when a letter follows (`\alpha x`). */
export const insertSymbol =
  (command: string): EditCommand =>
  (state) =>
    state.changeByRange((range) => {
      const next = state.sliceDoc(range.to, range.to + 1);
      const insert = command + (/[A-Za-z]/.test(next) ? " " : "");
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.cursor(range.from + insert.length),
      };
    });

// Commands that need the view (CodeMirror's own).
export const undo = (view: EditorView) => cmUndo(view);
export const redo = (view: EditorView) => cmRedo(view);
export const toggleComment = (view: EditorView) => cmToggleComment(view);
export const find = (view: EditorView) => openSearchPanel(view);
