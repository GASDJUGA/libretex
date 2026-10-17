/** Ctrl (or Cmd) with no other modifier. */
const ctrlOnly = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;

/**
 * Ctrl+J: show the cursor's place in the PDF (SyncTeX). Matched by the physical key too:
 * with some keyboard layouts or toolkits Ctrl+J arrives as the line-feed control character
 * (reported as «Enter»), which must not be taken for Ctrl+Enter.
 */
export const isSyncToPdfKey = (e: KeyboardEvent) =>
  ctrlOnly(e) && (e.code === "KeyJ" || e.key.toLowerCase() === "j");

/** Ctrl+Enter: compile (not Ctrl+J, see above). */
export const isCompileKey = (e: KeyboardEvent) =>
  (e.ctrlKey || e.metaKey) && !e.altKey && e.key === "Enter" && e.code !== "KeyJ";

/** Ctrl+Shift+F: search in the whole project (also by the physical key). */
export const isProjectSearchKey = (e: KeyboardEvent) =>
  (e.ctrlKey || e.metaKey) &&
  e.shiftKey &&
  !e.altKey &&
  (e.code === "KeyF" || e.key.toLowerCase() === "f");

/**
 * Text to search for when opening the project search: the editor's selection if it is
 * on one line, so selecting a word and pressing Ctrl+Shift+F looks for it.
 */
export function selectedSearchText(selection: string): string | undefined {
  return selection && !selection.includes("\n") ? selection : undefined;
}
