/**
 * `itemize` and `enumerate` come with their first `\item` (pedido del usuario), however the
 * environment was completed: picking it from the list after `\begin{`, the `\begin{itemize}`
 * shortcut, or typing the `}` that closes the name (each one inserts the `\end{…}` with an
 * empty line in between, where the cursor is left).
 */
import { EditorState, Prec } from "@codemirror/state";

const LIST_END = /\\end\{(?:itemize|enumerate)\}/;

/** The list environment opened on `line` (`\begin{itemize}` or with options), if any. */
function openedList(line: string): string | null {
  return /\\begin\{(itemize|enumerate)\}(?:\[[^\]]*\])?\s*$/.exec(line)?.[1] ?? null;
}

// Highest precedence: transaction filters run from the lowest one up, so this one sees the
// `\end{…}` the language package's own filter adds.
export const listFirstItem = Prec.highest(
  EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || tr.isUserEvent("undo") || tr.isUserEvent("redo")) return tr;
    if (tr.isUserEvent("input.paste")) return tr;
    let closesList = false;
    tr.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
      if (LIST_END.test(inserted.toString())) closesList = true;
    });
    if (!closesList) return tr;
    const selection = tr.newSelection;
    const { head, empty } = selection.main;
    if (selection.ranges.length > 1 || !empty) return tr;
    const doc = tr.newDoc;
    const line = doc.lineAt(head);
    if (line.text.trim() !== "" || line.number === 1 || line.number === doc.lines) return tr;
    const name = openedList(doc.line(line.number - 1).text);
    if (!name || doc.line(line.number + 1).text.trim() !== `\\end{${name}}`) return tr;
    return [
      tr,
      {
        changes: { from: head, insert: "\\item " },
        selection: { anchor: head + "\\item ".length },
        sequential: true,
      },
    ];
  }),
);
