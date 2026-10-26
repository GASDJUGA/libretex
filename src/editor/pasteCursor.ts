/**
 * After a paste, the browser's own cursor is put where CodeMirror's is (pedido del usuario:
 * pegando de una fórmula a un entorno nuevo, el cursor se veía al final de lo pegado pero lo
 * escrito después entraba al inicio y el cursor saltaba allí).
 *
 * CodeMirror draws its cursor from its state and leaves the browser's selection alone when
 * that one reports an equivalent place. When the text around the cursor is redrawn, Chrome
 * (and WebKit on iOS) may report one place and type at another; CodeMirror rewrites the
 * selection in that case only for those browsers, not for WebKitGTK. Typing then went to the
 * browser's stale place, at the start of the pasted text.
 */
import { EditorView } from "@codemirror/view";

export const pasteCursor = EditorView.updateListener.of((update) => {
  const { view } = update;
  if (!update.transactions.some((tr) => tr.isUserEvent("input.paste")) || !view.hasFocus) return;
  const { selection } = view.state;
  if (selection.ranges.length > 1 || !selection.main.empty) return;
  // Always written, as CodeMirror does for Chrome: the stale place may be reported as the
  // right one.
  const target = view.domAtPos(selection.main.head);
  document.getSelection()?.collapse(target.node, target.offset);
});
