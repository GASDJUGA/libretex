import { IS_MAC } from "./platform";

/**
 * The main modifier: Ctrl on Linux (Super too, as before), Cmd on macOS, where Ctrl+letter
 * belongs to the text fields (Ctrl+B moves back a character, as in Emacs).
 */
export const isMod = (e: KeyboardEvent, mac = IS_MAC) =>
  mac ? e.metaKey && !e.ctrlKey : e.ctrlKey || e.metaKey;

/** The main modifier with no other. */
const modOnly = (e: KeyboardEvent, mac: boolean) => isMod(e, mac) && !e.altKey && !e.shiftKey;

/**
 * Ctrl+J (⌘J): show the cursor's place in the PDF (SyncTeX). Matched by the physical key too:
 * with some keyboard layouts or toolkits Ctrl+J arrives as the line-feed control character
 * (reported as «Enter»), which must not be taken for Ctrl+Enter.
 */
export const isSyncToPdfKey = (e: KeyboardEvent, mac = IS_MAC) =>
  modOnly(e, mac) && (e.code === "KeyJ" || e.key.toLowerCase() === "j");

/** Ctrl+Enter (⌘↩): compile (not Ctrl+J, see above). */
export const isCompileKey = (e: KeyboardEvent, mac = IS_MAC) =>
  isMod(e, mac) && !e.altKey && e.key === "Enter" && e.code !== "KeyJ";

/** Ctrl+Shift+F (⇧⌘F): search in the whole project (also by the physical key). */
export const isProjectSearchKey = (e: KeyboardEvent, mac = IS_MAC) =>
  isMod(e, mac) && e.shiftKey && !e.altKey && (e.code === "KeyF" || e.key.toLowerCase() === "f");

/** Ctrl+F (⌘F): find, in the PDF viewer. */
export const isFindKey = (e: KeyboardEvent, mac = IS_MAC) =>
  modOnly(e, mac) && e.key.toLowerCase() === "f";

/**
 * Text to search for when opening the project search: the editor's selection if it is
 * on one line, so selecting a word and pressing Ctrl+Shift+F looks for it.
 */
export function selectedSearchText(selection: string): string | undefined {
  return selection && !selection.includes("\n") ? selection : undefined;
}

/**
 * Ctrl+Tab / Ctrl+PageDown: next tab (1); with Shift, or Ctrl+PageUp: previous (-1). On
 * macOS it is the Control key too (⌘Tab belongs to the system), and also ⇧⌘] / ⇧⌘[ as in
 * Safari.
 */
export function tabStep(e: KeyboardEvent, mac = IS_MAC): 1 | -1 | null {
  if (e.altKey) return null;
  if (mac && e.metaKey && e.shiftKey && !e.ctrlKey) {
    if (e.code === "BracketRight") return 1;
    if (e.code === "BracketLeft") return -1;
    return null;
  }
  if (!(mac ? e.ctrlKey && !e.metaKey : e.ctrlKey || e.metaKey)) return null;
  if (e.key === "Tab") return e.shiftKey ? -1 : 1;
  if (e.key === "PageDown" && !e.shiftKey) return 1;
  if (e.key === "PageUp" && !e.shiftKey) return -1;
  return null;
}

/** Ctrl+Shift+S (⇧⌘S): save a copy of the compiled PDF (also by the physical key). */
export const isExportPdfKey = (e: KeyboardEvent, mac = IS_MAC) =>
  isMod(e, mac) && e.shiftKey && !e.altKey && (e.code === "KeyS" || e.key.toLowerCase() === "s");
