import { preamblePieces, stripComments } from "./extract";

/**
 * Environments the user defines in the preamble (pedido del usuario: los `tcolorbox` propios
 * no aparecían al completar `\begin{}`). The same forms the backend reads in the style files
 * of packages (`tex/definitions.rs`).
 */
export type UserEnvironment = { name: string; args: number };

/** Mandatory brace arguments of an xparse specification (`O{} m m` → 2). */
export function specArguments(spec: string): number {
  let count = 0;
  let i = 0;
  const skipGroup = (at: number): number => {
    if (spec[at] !== "{") return at + 1;
    let depth = 0;
    for (let j = at; j < spec.length; j++) {
      if (spec[j] === "{") depth++;
      else if (spec[j] === "}" && --depth === 0) return j + 1;
    }
    return spec.length;
  };
  while (i < spec.length) {
    const c = spec[i++];
    if (c === "m" || c === "v") count++;
    else if (c === ">" || c === "=" || c === "O" || c === "e" || c === "t") i = skipGroup(i);
    else if (c === "E") i = skipGroup(skipGroup(i));
    else if (c === "r" || c === "d") i = skipGroup(skipGroup(i));
    else if (c === "R" || c === "D") i = skipGroup(skipGroup(skipGroup(i)));
  }
  return count;
}

const GROUP = String.raw`\{((?:[^{}]|\{[^{}]*\})*)\}`;
const NAME = String.raw`[ \t]*\{[ \t]*([A-Za-z]+\*?)[ \t]*\}`;
const OPTIONS = String.raw`[ \t]*(?:\[[^\]]*\])?`;
/** `[2][default]` after the name: 2 arguments, the first optional. */
const COUNT = String.raw`[ \t]*(?:\[(\d)\])?[ \t]*(\[)?`;

const PATTERNS: { re: RegExp; args: (m: RegExpMatchArray) => number; starred?: number }[] = [
  {
    re: new RegExp(
      String.raw`\\(?:newenvironment|renewenvironment|lstnewenvironment)\*?${NAME}${COUNT}`,
      "g",
    ),
    args: countArgs,
  },
  {
    re: new RegExp(
      String.raw`\\(?:New|Renew|Provide|Declare)DocumentEnvironment${NAME}[ \t]*${GROUP}`,
      "g",
    ),
    args: (m) => specArguments(m[2]),
  },
  { re: new RegExp(String.raw`\\newtheorem\*?${NAME}`, "g"), args: () => 0 },
  {
    re: new RegExp(String.raw`\\(?:new|renew)tcolorbox${OPTIONS}${NAME}${COUNT}`, "g"),
    args: countArgs,
  },
  {
    re: new RegExp(
      String.raw`\\(?:New|Renew|Provide|Declare)TColorBox${OPTIONS}${NAME}[ \t]*${GROUP}`,
      "g",
    ),
    args: (m) => specArguments(m[2]),
  },
  // `\begin{ejemplo}{título}{etiqueta}`; unnumbered, `\begin{ejemplo*}{título}`.
  {
    re: new RegExp(
      String.raw`\\(?:new|renew|New|Renew)(?:tcb|Tcb)(?:theorem|Theorem)${OPTIONS}${NAME}`,
      "g",
    ),
    args: () => 2,
    starred: 1,
  },
  {
    re: new RegExp(
      String.raw`\\(?:newtcblisting|renewtcblisting|DeclareTCBListing|NewTCBListing|newmdenv|newmdtheoremenv|declaretheorem|newfloat|DeclareFloatingEnvironment)${OPTIONS}${NAME}`,
      "g",
    ),
    args: () => 0,
  },
];

function countArgs(m: RegExpMatchArray): number {
  const n = m[2] ? Number(m[2]) : 0;
  return m[3] ? Math.max(0, n - 1) : n;
}

/** Environments defined in `text`, each once (the first definition). */
export function extractEnvironments(text: string): UserEnvironment[] {
  const clean = stripComments(text);
  const found: { at: number; env: UserEnvironment }[] = [];
  for (const { re, args, starred } of PATTERNS) {
    for (const m of clean.matchAll(re)) {
      found.push({ at: m.index, env: { name: m[1], args: args(m) } });
      if (starred !== undefined && !m[1].endsWith("*")) {
        found.push({ at: m.index, env: { name: `${m[1]}*`, args: starred } });
      }
    }
  }
  const seen = new Set<string>();
  return found
    .sort((a, b) => a.at - b.at)
    .map((f) => f.env)
    .filter((env) => !seen.has(env.name) && seen.add(env.name));
}

/** Environments defined in the preamble of the main file and the files it includes there. */
export function collectEnvironments(
  mainFile: string,
  read: (path: string) => string | null,
): UserEnvironment[] {
  const seen = new Set<string>();
  return preamblePieces(mainFile, read)
    .flatMap(extractEnvironments)
    .filter((env) => !seen.has(env.name) && seen.add(env.name));
}
