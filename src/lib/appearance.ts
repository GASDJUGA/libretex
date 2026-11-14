import type { Settings } from "../store/types";

type Appearance = Pick<Settings, "editorTheme" | "editorFontFamily" | "editorFontSize">;

/** The interface theme: `data-ui-theme` switches the chrome's colour tokens (styles/index.css). */
export function applyUiTheme(
  theme: Settings["uiTheme"],
  root: HTMLElement = document.documentElement,
) {
  root.dataset.uiTheme = theme;
}

/** Quotes a font family for CSS (validated settings have no quotes or backslashes). */
export const cssFontFamily = (family: string) => `"${family.replace(/["\\]/g, "")}"`;

/**
 * The editor's theme and font as CSS on the root element: `data-editor-theme` switches the
 * colour tokens (styles/index.css) and two variables set the font (editor/theme.ts).
 */
export function applyEditorAppearance(
  { editorTheme, editorFontFamily, editorFontSize }: Appearance,
  root: HTMLElement = document.documentElement,
) {
  root.dataset.editorTheme = editorTheme;
  if (editorFontFamily) {
    root.style.setProperty(
      "--jt-editor-font",
      `${cssFontFamily(editorFontFamily)}, var(--font-mono)`,
    );
  } else {
    root.style.removeProperty("--jt-editor-font");
  }
  root.style.setProperty("--jt-editor-font-size", `${editorFontSize}px`);
}
