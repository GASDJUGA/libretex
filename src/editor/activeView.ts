import type { EditorView } from "@codemirror/view";
import { run, type EditCommand } from "./commands";

/** The CodeMirror view of the active tab, so the toolbar and menus can act on it. */
let active: EditorView | null = null;

export function setActiveView(view: EditorView | null) {
  active = view;
}

export function getActiveView() {
  return active;
}

/** Runs an editing command on the active editor (no-op without one). */
export function runCommand(command: EditCommand) {
  if (active) run(active, command);
}

/** Runs a CodeMirror view command (undo, search…) on the active editor. */
export function runViewCommand(command: (view: EditorView) => unknown) {
  if (!active) return;
  command(active);
  active.focus();
}
