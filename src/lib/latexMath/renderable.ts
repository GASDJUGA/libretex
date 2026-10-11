/**
 * The TeX that MathJax renders for a math region. Environments with alignment (`&`, `\\`)
 * become their inner equivalents (5.5): `align` → `aligned`, `gather` → `gathered`…
 * Numbering commands are dropped: the preview shows one formula, not the document.
 */
import type { MathRegion } from "./regions";

/** `\label{…}`, `\tag{…}`/`\tag*{…}`, `\nonumber`, `\notag`. */
const NUMBERING = /\\(?:label|tag\*?)\s*\{[^{}]*\}|\\(?:nonumber|notag)(?![a-zA-Z@])/g;

const INNER: Record<string, string> = {
  align: "aligned",
  flalign: "aligned",
  gather: "gathered",
  multline: "multlined",
};

/** `body` (already without comments) of `region`, ready for MathJax in display/inline mode. */
export function renderableTex(region: Pick<MathRegion, "env">, body: string): string {
  const tex = body.replace(NUMBERING, "").trim();
  const env = region.env?.replace(/\*$/, "") ?? null;
  if (!env || env === "equation" || env === "math" || env === "displaymath") return tex;
  if (env in INNER) return `\\begin{${INNER[env]}}${tex}\\end{${INNER[env]}}`;
  if (env === "alignat") {
    // \begin{alignat}{n} … : the body starts with the column count.
    const columns = /^\{(\d+)\}/.exec(tex);
    const rest = columns ? tex.slice(columns[0].length) : tex;
    return `\\begin{alignedat}{${columns?.[1] ?? 1}}${rest}\\end{alignedat}`;
  }
  if (env === "eqnarray") return `\\begin{array}{rcl}${tex}\\end{array}`;
  return tex;
}
