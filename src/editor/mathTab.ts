/**
 * Tab inside math (pedido del usuario): it completes, it never indents in the middle of a
 * line. At the start of a line (only spaces before the cursor) it indents as usual. If the
 * suggestions are not shown yet (they appear shortly after typing), Tab asks for them and
 * accepts the first one as soon as it arrives.
 */
import { acceptCompletion, completionStatus, startCompletion } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { mathRegionInState } from "./mathRegion";

/**
 * CodeMirror ignores accepting a suggestion during this long after the list appears (to
 * avoid accidents); passed explicitly to `autocompletion` so both stay equal.
 */
export const COMPLETION_INTERACTION_DELAY_MS = 75;

/** Views waiting for suggestions requested by Tab, to accept the first one. */
const waiting = new WeakSet<EditorView>();

/** Tab in the middle of a math line: complete (never indent). False: let Tab indent. */
export function tabInMath(view: EditorView): boolean {
  const { state } = view;
  const selection = state.selection.main;
  if (!selection.empty) return false;
  const line = state.doc.lineAt(selection.head);
  const before = line.text.slice(0, selection.head - line.from);
  if (before.trim() === "" || !mathRegionInState(state, selection.head)) return false;
  if (completionStatus(state) === "active") {
    // Refused right after the list appears: accept once it can be (never indent).
    if (!acceptCompletion(view)) {
      setTimeout(() => acceptCompletion(view), COMPLETION_INTERACTION_DELAY_MS + 5);
    }
    return true;
  }
  // A command being typed (`\fr`): ask for the suggestions and take the first one.
  if (/\\[A-Za-z@]+$/.test(before)) {
    waiting.add(view);
    startCompletion(view);
  }
  return true;
}

/** Accepts the suggestion requested by Tab once the list arrives (or gives up). */
export const acceptRequestedCompletion = EditorView.updateListener.of((update) => {
  const view = update.view;
  if (!waiting.has(view)) return;
  const status = completionStatus(update.state);
  if (status === "active") {
    waiting.delete(view);
    // After the interaction delay (and not while the view is updating).
    setTimeout(() => acceptCompletion(view), COMPLETION_INTERACTION_DELAY_MS + 5);
  } else if (status === null || update.docChanged || update.selectionSet) {
    waiting.delete(view);
  }
});
