/**
 * Shared cases for both math detectors (text scanner and syntax tree). `|` marks the cursor;
 * `expected` is the body to render (or null: not in math), with the region's kind.
 */
export type MathCase = {
  name: string;
  text: string;
  expected: { body: string; display: boolean; env?: string | null; unclosed?: boolean } | null;
};

export const MATH_CASES: MathCase[] = [
  { name: "$…$", text: "Texto $a+|b$ fin", expected: { body: "a+b", display: false } },
  { name: "\\(…\\)", text: "Sea \\(c|\\) dado", expected: { body: "c", display: false } },
  { name: "$$…$$", text: "Y $$ d| $$ fin", expected: { body: " d ", display: true } },
  { name: "\\[…\\]", text: "Y \\[e|\\] fin", expected: { body: "e", display: true } },
  {
    name: "align*",
    text: "\\begin{align*} x &= |1 \\end{align*}",
    expected: { body: " x &= 1 ", display: true, env: "align*" },
  },
  {
    name: "equation sin asterisco",
    text: "\\begin{equation}\n  E = m|c^2\n\\end{equation}",
    expected: { body: "\n  E = mc^2\n", display: true, env: "equation" },
  },
  {
    name: "multilínea",
    text: "\\[\n  a \\\\\n  b|\n\\]",
    expected: { body: "\n  a \\\\\n  b\n", display: true },
  },
  { name: "fuera de la fórmula", text: "Texto| $a$ fin", expected: null },
  { name: "\\$ escapado no abre", text: "Cuesta \\$5 |y \\$7", expected: null },
  {
    name: "\\$ dentro de la fórmula",
    text: "$x = \\$|5$",
    expected: { body: "x = \\$5", display: false },
  },
  { name: "comentario con $", text: "% $no|$\nTexto", expected: null },
  {
    name: "después de un comentario",
    text: "% $no$\n$s|i$",
    expected: { body: "si", display: false },
  },
  {
    name: "verbatim",
    text: "\\begin{verbatim}\n$no|$\n\\end{verbatim}",
    expected: null,
  },
  {
    name: "lstlisting",
    text: "\\begin{lstlisting}\nx = $a|$\n\\end{lstlisting}",
    expected: null,
  },
  { name: "\\verb", text: "\\verb+$+ y $x|$", expected: { body: "x", display: false } },
  {
    name: "$ sin cerrar llega hasta el fin del párrafo",
    text: "Texto $a + |b\n\nOtro $c$",
    expected: { body: "a + b", display: false, unclosed: true },
  },
  {
    name: "el párrafo siguiente no se ve afectado",
    text: "Texto $a + b\n\nOtro $|c$",
    expected: { body: "c", display: false },
  },
  {
    name: "\\text con $ dentro de display",
    text: "\\[ x \\text{ si $y|>0$} \\]",
    expected: { body: " x \\text{ si $y>0$} ", display: true },
  },
  { name: "$x$$y$ son dos", text: "$x$$y|$", expected: { body: "y", display: false } },
  { name: "\\\\[2pt] no es matemática", text: "a \\\\[2pt|] b", expected: null },
];

/** Text without the cursor mark and the cursor position. */
export function withCursor(text: string): { text: string; pos: number } {
  const pos = text.indexOf("|");
  return { text: text.slice(0, pos) + text.slice(pos + 1), pos };
}
