/**
 * Tab (pedido del usuario): it completes, and inside math it never indents in the middle of
 * a line. At the start of a line (only spaces before the cursor) it indents as usual. If the
 * suggestions are not shown yet (they appear shortly after typing), Tab asks for them and
 * accepts the first one as soon as it arrives. It also moves through arguments (see
 * `smartTab`).
 */
import {
  acceptCompletion,
  clearSnippet,
  completionStatus,
  nextSnippetField,
  prevSnippetField,
  snippetKeymap,
  startCompletion,
} from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { mathRegionInState } from "./mathRegion";

/**
 * CodeMirror ignores accepting a suggestion during this long after the list appears (to
 * avoid accidents); passed explicitly to `autocompletion` so both stay equal.
 */
/** Pause in typing before the completion sources are asked (CodeMirror's default is 100). */
export const COMPLETION_TYPING_DELAY_MS = 15;

export const COMPLETION_INTERACTION_DELAY_MS = 75;

/** Views waiting for suggestions requested by Tab, to accept the first one. */
const waiting = new WeakSet<EditorView>();

/** Accepts the open suggestion; right after the list appears CodeMirror refuses: retry. */
function acceptOpen(view: EditorView): boolean {
  if (completionStatus(view.state) !== "active") return false;
  if (!acceptCompletion(view)) {
    setTimeout(() => acceptCompletion(view), COMPLETION_INTERACTION_DELAY_MS + 5);
  }
  return true;
}

/** The text of the cursor's line before it, if the selection is a single cursor. */
function lineBefore(state: EditorState): string | null {
  const selection = state.selection.main;
  if (!selection.empty || state.selection.ranges.length > 1) return null;
  const line = state.doc.lineAt(selection.head);
  return line.text.slice(0, selection.head - line.from);
}

/** In math, a command being typed (`\fr`): ask for the suggestions and take the first one. */
function completeTypedCommand(view: EditorView): boolean {
  const before = lineBefore(view.state);
  if (before === null || !/\\[A-Za-z@]+$/.test(before)) return false;
  if (!mathRegionInState(view.state, view.state.selection.main.head)) return false;
  waiting.add(view);
  startCompletion(view);
  return true;
}

/** What closes a group: `}`, `]` or a `\right` delimiter (`\right)`, `\right\}`, `\right.`). */
const GROUP_END = /^(?:\}|\]|\\right\s*(?:\\[A-Za-z]+|\\[{}|]|[()[\]|./]))/;

/**
 * Out of the group the cursor is at the end of (`\tilde{x|}` → `\tilde{x}|`) and into the next
 * argument if there is one (`\frac{a|}{b}` → `\frac{a}{|b}`); also past `\right)`. False if the
 * cursor is not before a group end.
 */
export function exitGroup(view: EditorView): boolean {
  const { state } = view;
  if (lineBefore(state) === null) return false;
  const head = state.selection.main.head;
  const after = state.sliceDoc(head, head + 40);
  const end = GROUP_END.exec(after);
  if (!end) return false;
  let to = head + end[0].length;
  if (state.sliceDoc(to, to + 1) === "{") to += 1;
  view.dispatch({ selection: { anchor: to }, scrollIntoView: true, userEvent: "select" });
  return true;
}

/**
 * Tab (pedido del usuario: que complete bien también dentro de los argumentos de algo recién
 * completado). In order: accept the open suggestion; in math, complete the command being
 * typed; go to the next field of the active snippet (`\braket{|}{}`); leave the group the
 * cursor ends (`}`, `\right)`), into the next argument. CodeMirror's snippet keymap used to
 * take Tab first: inside `\braket{\tilde|}{}` it jumped to the next field and `\tilde` was
 * left without its braces. False: nothing to do (Tab may indent).
 */
export function smartTab(view: EditorView): boolean {
  return (
    acceptOpen(view) || completeTypedCommand(view) || nextSnippetField(view) || exitGroup(view)
  );
}

/** Tab in the middle of a math line never indents, even with nothing to do. */
export function tabInMath(view: EditorView): boolean {
  if (smartTab(view)) return true;
  const before = lineBefore(view.state);
  return (
    before !== null &&
    before.trim() !== "" &&
    mathRegionInState(view.state, view.state.selection.main.head) !== null
  );
}

/** Tab and Shift+Tab while a snippet is active (CodeMirror's facet; replaces its default). */
export const snippetTabKeymap = snippetKeymap.of([
  { key: "Tab", run: tabInMath, shift: prevSnippetField },
  { key: "Escape", run: clearSnippet },
]);

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
