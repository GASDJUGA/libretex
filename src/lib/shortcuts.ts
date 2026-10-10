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
