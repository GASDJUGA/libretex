/**
 * Vim and Emacs key bindings (Settings → «Atajos de teclado»), loaded on demand so the
 * default editor does not carry them. JuTeX's own shortcuts keep working: Ctrl+S,
 * Ctrl+B/I (higher precedence), Ctrl+Enter and Ctrl+J (DOM handlers).
 */
import type { Extension } from "@codemirror/state";
import type { Keymap } from "../store/types";

const loaded = new Map<Keymap, Extension>([["default", []]]);

/** The bindings of `mode`, loading them if needed. */
export async function loadKeymap(mode: Keymap): Promise<Extension> {
  let extension = loaded.get(mode);
  if (!extension) {
    if (mode === "vim") {
      const { vim } = await import("@replit/codemirror-vim");
      // With the mode line (-- INSERT --, commands typed after «:»).
      extension = vim({ status: true });
    } else {
      const { emacs } = await import("@replit/codemirror-emacs");
      extension = emacs();
    }
    loaded.set(mode, extension);
  }
  return extension;
}

/** The bindings of `mode` if already loaded (new editor states), or none yet. */
export function loadedKeymap(mode: Keymap): Extension {
  return loaded.get(mode) ?? [];
}
