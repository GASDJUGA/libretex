import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/** Editor colours come from the design tokens, so the light/dark editor theme is pure CSS. */
const theme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--jt-editor-bg)",
    color: "var(--jt-editor-fg)",
    fontSize: "var(--jt-editor-font-size, 14px)",
  },
  ".cm-scroller": {
    fontFamily: "var(--jt-editor-font, var(--font-mono))",
    lineHeight: "1.55",
  },
  ".cm-content": { caretColor: "var(--jt-editor-fg)", padding: "6px 0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--jt-editor-fg)" },
  ".cm-gutters": {
    backgroundColor: "var(--jt-editor-gutter)",
    color: "var(--jt-editor-gutter-fg)",
    borderRight: "1px solid var(--jt-editor-line)",
  },
  ".cm-activeLine": { backgroundColor: "var(--jt-editor-active-line)" },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--jt-editor-active-line)",
    color: "var(--jt-editor-fg)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--jt-accent) 28%, transparent) !important",
  },
  // A soft tint with a line underneath: a frame around the bracket next to the cursor
  // looked like a second cursor (pedido del usuario). Also when focused, where CodeMirror's
  // own teal background would win otherwise.
  "&.cm-focused .cm-matchingBracket, .cm-matchingBracket": {
    backgroundColor: "color-mix(in srgb, var(--jt-accent) 14%, transparent)",
    boxShadow: "inset 0 -2px 0 color-mix(in srgb, var(--jt-accent) 45%, transparent)",
  },
  ".cm-searchMatch": { backgroundColor: "color-mix(in srgb, var(--jt-warning) 35%, transparent)" },
  ".cm-searchMatch-selected": {
    backgroundColor: "color-mix(in srgb, var(--jt-accent) 35%, transparent)",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--jt-editor-gutter)",
    border: "1px solid var(--jt-editor-line)",
    color: "var(--jt-editor-gutter-fg)",
  },
  ".cm-panels": {
    backgroundColor: "var(--jt-editor-gutter)",
    color: "var(--jt-editor-fg)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--jt-editor-bg)",
    border: "1px solid var(--jt-editor-line)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--jt-accent)",
    color: "var(--jt-accent-fg)",
  },
});

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--jt-syntax-command)" },
  { tag: tags.heading, color: "var(--jt-syntax-command)", fontWeight: "600" },
  { tag: tags.className, color: "var(--jt-syntax-bracket)" },
  { tag: [tags.processingInstruction, tags.variableName], color: "var(--jt-syntax-math)" },
  { tag: [tags.bracket, tags.operator], color: "var(--jt-syntax-bracket)" },
  { tag: tags.comment, color: "var(--jt-syntax-comment)", fontStyle: "italic" },
  { tag: tags.meta, color: "var(--jt-syntax-comment)" },
]);

export const editorTheme = [theme, syntaxHighlighting(highlight)];
