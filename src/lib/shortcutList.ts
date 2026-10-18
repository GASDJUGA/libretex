import type { TranslationKey } from "../i18n";

/**
 * A shortcut shown in «Atajos de teclado»: the keys (alternatives; `{name}` is a key whose
 * name is translated, `shortcuts.keys.<name>`) and what they do.
 */
export type Shortcut = { keys: string[]; action: TranslationKey };

/**
 * Every keyboard shortcut of the app, by group (the single list the help dialog shows; the
 * handlers live in lib/shortcuts.ts, the editor's keymaps and the PDF viewer).
 */
export const SHORTCUTS: { group: TranslationKey; items: Shortcut[] }[] = [
  {
    group: "shortcuts.general",
    items: [
      { keys: ["Ctrl+S"], action: "shortcuts.save" },
      { keys: ["Ctrl+Enter"], action: "shortcuts.compile" },
      { keys: ["Ctrl+Shift+S"], action: "shortcuts.exportPdf" },
      { keys: ["Ctrl+Shift+F"], action: "shortcuts.findInProject" },
      { keys: ["Ctrl+Tab", "Ctrl+{pageDown}"], action: "shortcuts.nextTab" },
      { keys: ["Ctrl+Shift+Tab", "Ctrl+{pageUp}"], action: "shortcuts.previousTab" },
      { keys: ["F1"], action: "shortcuts.help" },
    ],
  },
  {
    group: "shortcuts.editor",
    items: [
      { keys: ["Ctrl+Z"], action: "shortcuts.undo" },
      { keys: ["Ctrl+Shift+Z", "Ctrl+Y"], action: "shortcuts.redo" },
      { keys: ["Ctrl+B"], action: "shortcuts.bold" },
      { keys: ["Ctrl+I"], action: "shortcuts.italic" },
      { keys: ["Ctrl+/"], action: "shortcuts.comment" },
      { keys: ["Ctrl+F"], action: "shortcuts.find" },
      { keys: ["Ctrl+{space}"], action: "shortcuts.complete" },
      { keys: ["Tab"], action: "shortcuts.mathTab" },
      { keys: ["Ctrl+C", "Ctrl+X"], action: "shortcuts.copyLine" },
      { keys: ["Esc"], action: "shortcuts.closePreview" },
    ],
  },
  {
    group: "shortcuts.pdf",
    items: [
      { keys: ["Ctrl+J"], action: "shortcuts.syncToPdf" },
      { keys: ["Ctrl+F"], action: "shortcuts.findInPdf" },
      { keys: ["{doubleClick}"], action: "shortcuts.syncToCode" },
      { keys: ["Ctrl+{wheel}"], action: "shortcuts.zoom" },
    ],
  },
];
