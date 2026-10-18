import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Tests run from the repository root.
const css = readFileSync(join(process.cwd(), "src/styles/index.css"), "utf8");

/** Colour tokens of a block of src/styles/index.css (`--lt-name: #rrggbb;`). */
function tokens(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--lt-([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2]]),
  );
}

const root = tokens(css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {"))));
const darkStart = css.indexOf(':root[data-editor-theme="dark"]');
const darkEditor = { ...root, ...tokens(css.slice(darkStart, css.indexOf("}", darkStart))) };

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA: text 4.5:1. Pairs of [foreground, background] tokens. */
const TEXT_PAIRS: [string, string][] = [
  ...["topbar", "rail", "panel", "panel-raised", "hover"].flatMap((bg): [string, string][] =>
    ["fg", "fg-muted", "accent-text", "success", "danger", "warning", "info"].map((fg) => [fg, bg]),
  ),
  ["fg", "pdf-bg"],
  ["fg-muted", "pdf-bg"],
  ["accent-fg", "accent"],
  ["accent-fg", "accent-hover"],
  ["topbar", "danger"],
];

const EDITOR_PAIRS: [string, string][] = [
  ["editor-fg", "editor-bg"],
  ["syntax-command", "editor-bg"],
  ["syntax-bracket", "editor-bg"],
  ["syntax-math", "editor-bg"],
  ["syntax-comment", "editor-bg"],
  ["editor-gutter-fg", "editor-gutter"],
];

describe("contraste de los colores (WCAG AA)", () => {
  it.each(TEXT_PAIRS)("%s sobre %s ≥ 4,5:1", (fg, bg) => {
    expect(contrast(root[fg], root[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(EDITOR_PAIRS)("editor claro: %s sobre %s ≥ 4,5:1", (fg, bg) => {
    expect(contrast(root[fg], root[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(EDITOR_PAIRS)("editor oscuro: %s sobre %s ≥ 4,5:1", (fg, bg) => {
    expect(contrast(darkEditor[fg], darkEditor[bg])).toBeGreaterThanOrEqual(4.5);
  });
});
