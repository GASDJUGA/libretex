import type { TranslationKey } from "../i18n";

/**
 * A shortcut shown in «Atajos de teclado»: the keys (alternatives, written for `keyLabel`:
 * `Mod` is Ctrl or ⌘; `{name}` is a key whose name is translated, `shortcuts.keys.<name>`),
 * the keys on macOS when they are others, and what they do.
 */
export type Shortcut = { keys: string[]; mac?: string[]; action: TranslationKey };

/**
 * Every keyboard shortcut of the app, by group (the single list the help dialog shows; the
 * handlers live in lib/shortcuts.ts, the editor's keymaps and the PDF viewer).
 */
export const SHORTCUTS: { group: TranslationKey; items: Shortcut[] }[] = [
  {
    group: "shortcuts.general",
    items: [
      { keys: ["Mod+S"], action: "shortcuts.save" },
      { keys: ["Mod+Enter"], action: "shortcuts.compile" },
      { keys: ["Mod+Shift+S"], action: "shortcuts.exportPdf" },
      { keys: ["Mod+Shift+F"], action: "shortcuts.findInProject" },
      {
        keys: ["Ctrl+Tab", "Ctrl+{pageDown}"],
        mac: ["Ctrl+Tab", "Mod+Shift+]"],
        action: "shortcuts.nextTab",
      },
      {
        keys: ["Ctrl+Shift+Tab", "Ctrl+{pageUp}"],
        mac: ["Ctrl+Shift+Tab", "Mod+Shift+["],
        action: "shortcuts.previousTab",
      },
      { keys: ["F1"], action: "shortcuts.help" },
    ],
  },
  {
    group: "shortcuts.editor",
    items: [
      { keys: ["Mod+Z"], action: "shortcuts.undo" },
      { keys: ["Mod+Shift+Z", "Mod+Y"], mac: ["Mod+Shift+Z"], action: "shortcuts.redo" },
      { keys: ["Mod+B"], action: "shortcuts.bold" },
      { keys: ["Mod+I"], action: "shortcuts.italic" },
      { keys: ["Mod+/"], action: "shortcuts.comment" },
      { keys: ["Mod+F"], action: "shortcuts.find" },
      { keys: ["Ctrl+{space}"], mac: ["Ctrl+{space}", "Alt+`"], action: "shortcuts.complete" },
      { keys: ["Tab"], action: "shortcuts.mathTab" },
      { keys: ["Mod+C", "Mod+X"], action: "shortcuts.copyLine" },
      { keys: ["Esc"], action: "shortcuts.closePreview" },
    ],
  },
  {
    group: "shortcuts.pdf",
    items: [
      { keys: ["Mod+J"], action: "shortcuts.syncToPdf" },
      { keys: ["Mod+F"], action: "shortcuts.findInPdf" },
      { keys: ["{doubleClick}"], action: "shortcuts.syncToCode" },
      { keys: ["Mod+{wheel}"], action: "shortcuts.zoom" },
    ],
  },
];
