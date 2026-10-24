import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/** Editor colours come from the design tokens, so the light/dark editor theme is pure CSS. */
const theme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--lt-editor-bg)",
    color: "var(--lt-editor-fg)",
    fontSize: "var(--lt-editor-font-size, 14px)",
  },
  ".cm-scroller": {
    fontFamily: "var(--lt-editor-font, var(--font-mono))",
    lineHeight: "1.55",
  },
  ".cm-content": { caretColor: "var(--lt-editor-fg)", padding: "6px 0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--lt-editor-fg)" },
  ".cm-gutters": {
    backgroundColor: "var(--lt-editor-gutter)",
    color: "var(--lt-editor-gutter-fg)",
    borderRight: "1px solid var(--lt-editor-line)",
  },
  ".cm-activeLine": { backgroundColor: "var(--lt-editor-active-line)" },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--lt-editor-active-line)",
    color: "var(--lt-editor-fg)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--lt-accent) 28%, transparent) !important",
  },
  // A soft tint with a line underneath: a frame around the bracket next to the cursor
  // looked like a second cursor (pedido del usuario). Also when focused, where CodeMirror's
  // own teal background would win otherwise.
  "&.cm-focused .cm-matchingBracket, .cm-matchingBracket": {
    backgroundColor: "color-mix(in srgb, var(--lt-accent) 14%, transparent)",
    boxShadow: "inset 0 -2px 0 color-mix(in srgb, var(--lt-accent) 45%, transparent)",
  },
  ".cm-searchMatch": { backgroundColor: "color-mix(in srgb, var(--lt-warning) 35%, transparent)" },
  ".cm-searchMatch-selected": {
    backgroundColor: "color-mix(in srgb, var(--lt-accent) 35%, transparent)",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--lt-editor-gutter)",
    border: "1px solid var(--lt-editor-line)",
    color: "var(--lt-editor-gutter-fg)",
  },
  ".cm-panels": {
    backgroundColor: "var(--lt-editor-gutter)",
    color: "var(--lt-editor-fg)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--lt-editor-bg)",
    border: "1px solid var(--lt-editor-line)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--lt-accent)",
    color: "var(--lt-accent-fg)",
  },
});

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--lt-syntax-command)" },
  { tag: tags.heading, color: "var(--lt-syntax-command)", fontWeight: "600" },
  { tag: tags.className, color: "var(--lt-syntax-bracket)" },
  { tag: [tags.processingInstruction, tags.variableName], color: "var(--lt-syntax-math)" },
  { tag: [tags.bracket, tags.operator], color: "var(--lt-syntax-bracket)" },
  { tag: tags.comment, color: "var(--lt-syntax-comment)", fontStyle: "italic" },
  { tag: tags.meta, color: "var(--lt-syntax-comment)" },
]);

export const editorTheme = [theme, syntaxHighlighting(highlight)];
