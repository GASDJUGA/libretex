import type { Settings } from "../store/types";

type Appearance = Pick<Settings, "editorTheme" | "editorFontFamily" | "editorFontSize">;

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
      "--lt-editor-font",
      `${cssFontFamily(editorFontFamily)}, var(--font-mono)`,
    );
  } else {
    root.style.removeProperty("--lt-editor-font");
  }
  root.style.setProperty("--lt-editor-font-size", `${editorFontSize}px`);
}
