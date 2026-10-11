/**
 * «Agregar al preámbulo» (5.6): `\usepackage{…}` for a package, inserted in the main file's
 * preamble after the last `\usepackage` (or before `\begin{document}`).
 */
import type { PackageHit } from "../../store/types";

/**
 * The name to load: the package's own `.sty` when it has one with its name, else its first
 * style file (TeX Live's `pgf` is loaded as `tikz`), else the package name.
 */
export function packageToLoad(pkg: Pick<PackageHit, "name" | "styles">): string {
  const styles = pkg.styles.filter((s) => s.endsWith(".sty")).map((s) => s.slice(0, -4));
  return styles.find((s) => s === pkg.name) ?? styles[0] ?? pkg.name;
}

/** `\usepackage` lines already in `text` load `name` (also within a list: `{a, b}`). */
export function loadsPackage(text: string, name: string): boolean {
  const usepackage = /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
  for (const match of withoutComments(text).matchAll(usepackage)) {
    if (match[1].split(",").some((p) => p.trim() === name)) return true;
  }
  return false;
}

function withoutComments(text: string): string {
  return text.replace(/(^|[^\\])%.*$/gm, "$1");
}

export type PreambleEdit =
  { kind: "added"; text: string; line: number } | { kind: "already" } | { kind: "noPreamble" };

/** `text` with `\usepackage{name}` added to its preamble. */
export function addToPreamble(text: string, name: string): PreambleEdit {
  const lines = text.split("\n");
  const clean = withoutComments(text).split("\n");
  const begin = clean.findIndex((l) => /\\begin\s*\{document\}/.test(l));
  if (begin < 0) return { kind: "noPreamble" };
  if (loadsPackage(lines.slice(0, begin).join("\n"), name)) return { kind: "already" };
  let at = begin;
  for (let i = begin - 1; i >= 0; i--) {
    if (/\\usepackage\b/.test(clean[i])) {
      at = i + 1;
      break;
    }
  }
  lines.splice(at, 0, `\\usepackage{${name}}`);
  return { kind: "added", text: lines.join("\n"), line: at + 1 };
}
