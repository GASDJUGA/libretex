/**
 * Ctrl+C / Ctrl+X with nothing selected copy (or cut) the whole line, as before, but the
 * pasted text then goes where the cursor is, like any paste (pedido del usuario). CodeMirror
 * would insert such a copy above the current line and leave the cursor where it was.
 */
import { EditorView } from "@codemirror/view";

type ClipboardLike = Pick<ClipboardEvent, "preventDefault"> & {
  clipboardData: Pick<DataTransfer, "clearData" | "setData"> | null;
};

/** Handles copy/cut without a selection; false lets CodeMirror handle a real selection. */
export function copyWholeLines(view: EditorView, event: ClipboardLike, cut: boolean): boolean {
  const { state } = view;
  if (!event.clipboardData || state.selection.ranges.some((range) => !range.empty)) return false;
  const lines = [
    ...new Map(
      state.selection.ranges.map((r) => {
        const line = state.doc.lineAt(r.head);
        return [line.number, line] as const;
      }),
    ).values(),
  ].sort((a, b) => a.from - b.from);
  event.clipboardData.clearData();
  event.clipboardData.setData("text/plain", lines.map((l) => l.text).join(state.lineBreak));
  event.preventDefault();
  if (cut && !state.readOnly) {
    view.dispatch({
      changes: lines.map((l) => ({ from: l.from, to: Math.min(state.doc.length, l.to + 1) })),
      scrollIntoView: true,
      userEvent: "delete.cut",
    });
  }
  return true;
}

export const lineCopy = EditorView.domEventHandlers({
  copy: (event, view) => copyWholeLines(view, event, false),
  cut: (event, view) => copyWholeLines(view, event, true),
});
