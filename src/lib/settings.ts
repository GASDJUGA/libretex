/**
 * Defaults and validation of the settings, the same as src-tauri/src/settings.rs (used by
 * the browser preview's backend and to migrate the values older versions kept in the
 * browser storage).
 */
import type { EditableSettings, Settings } from "../store/types";

export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 32;
export const MAX_HISTORY_MINUTES = 120;

export const DEFAULT_SETTINGS: Settings = {
  locale: "es",
  editorFontFamily: "",
  editorFontSize: 14,
  editorTheme: "light",
  keymap: "default",
  indentMode: "environments",
  liveCheck: true,
  mathPreview: true,
  mathPreviewHover: false,
  pdfDarkMode: false,
  defaultCompiler: "xelatex",
  defaultSpellLang: "es",
  historyMinutes: 10,
  projectsDir: null,
  texDistribution: "auto",
};

const oneOf =
  (...values: unknown[]) =>
  (v: unknown) =>
    values.includes(v);
const isBoolean = (v: unknown) => typeof v === "boolean";

const VALID: { [K in keyof EditableSettings]: (value: unknown) => boolean } = {
  locale: oneOf("es", "en"),
  editorFontFamily: (v) =>
    typeof v === "string" && [...v].length <= 100 && !/[\p{Cc};{}"\\]/u.test(v),
  editorFontSize: (v) =>
    typeof v === "number" && Number.isInteger(v) && v >= MIN_FONT_SIZE && v <= MAX_FONT_SIZE,
  editorTheme: oneOf("light", "dark"),
  keymap: oneOf("default", "vim", "emacs"),
  indentMode: oneOf("environments", "full", "none"),
  liveCheck: isBoolean,
  mathPreview: isBoolean,
  mathPreviewHover: isBoolean,
  pdfDarkMode: isBoolean,
  defaultCompiler: oneOf("pdflatex", "xelatex", "lualatex"),
  defaultSpellLang: oneOf("es", "en", "off"),
  historyMinutes: (v) =>
    typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_HISTORY_MINUTES,
};

/** Whether `key` is a setting the webview may change and `value` is valid for it. */
export function validSetting(key: string, value: unknown): key is keyof EditableSettings {
  return key in VALID && VALID[key as keyof EditableSettings](value);
}

/** The valid editable settings of `values` (anything else is dropped). */
export function editableSettings(values: Record<string, unknown>): Partial<EditableSettings> {
  return Object.fromEntries(
    Object.entries(values).filter(([key, value]) => validSetting(key, value)),
  ) as Partial<EditableSettings>;
}
