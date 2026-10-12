/**
 * User macros for the math preview: `\newcommand`, `\renewcommand`, `\providecommand`,
 * `\DeclareMathOperator` and simple `\def` from the preamble of the main file and the files
 * it includes there. The result has the shape of MathJax's `configmacros` option.
 */
import { parseStructure, resolveInclude } from "../outline";

/** MathJax macro definition: the body, or `[body, args]` / `[body, args, default]`. */
export type MathJaxMacro = string | [string, number] | [string, number, string];
export type MathJaxMacros = Record<string, MathJaxMacro>;

/** The text without comments (a `%` not preceded by a backslash, to the end of the line). */
export function stripComments(text: string): string {
  return text.replace(/(^|[^\\])((?:\\\\)*)%.*$/gm, "$1$2");
}

/** Index after the group that starts at `at` (`{` or `[`), with nesting; -1 if unbalanced. */
function groupEnd(text: string, at: number): number {
  const open = text[at];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") {
      i++;
    } else if (c === open) {
      depth++;
    } else if (c === close && --depth === 0) {
      return i + 1;
    }
  }
  return -1;
}

const skipSpaces = (text: string, i: number) => {
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
};

/** The command name at `i`: `{\name}` or `\name`; returns the name and the next index. */
function readName(text: string, i: number): { name: string; next: number } | null {
  i = skipSpaces(text, i);
  if (text[i] === "{") {
    const end = groupEnd(text, i);
    const inner = end < 0 ? "" : text.slice(i + 1, end - 1).trim();
    const match = /^\\([a-zA-Z@]+|.)$/.exec(inner);
    return match ? { name: match[1], next: end } : null;
  }
  const match = /^\\([a-zA-Z@]+|.)/.exec(text.slice(i));
  return match ? { name: match[1], next: i + match[0].length } : null;
}

/** A `{…}` argument at `i` (after spaces): its content and the next index. */
function readGroup(text: string, i: number): { content: string; next: number } | null {
  i = skipSpaces(text, i);
  if (text[i] !== "{") return null;
  const end = groupEnd(text, i);
  return end < 0 ? null : { content: text.slice(i + 1, end - 1), next: end };
}

/** An optional `[…]` argument at `i`. */
function readOptional(text: string, i: number): { content: string; next: number } | null {
  const j = skipSpaces(text, i);
  if (text[j] !== "[") return null;
  const end = groupEnd(text, j);
  return end < 0 ? null : { content: text.slice(j + 1, end - 1), next: end };
}

const DEFINE = /\\(newcommand|renewcommand|providecommand|DeclareMathOperator|def)(\*?)/g;

/** Macros defined in `text` (later definitions win, like in TeX). */
export function extractMacros(text: string): MathJaxMacros {
  const source = stripComments(text);
  const macros: MathJaxMacros = {};
  for (const match of source.matchAll(DEFINE)) {
    const [, command, star] = match;
    let i = match.index + match[0].length;
    // `\define` or `\newcommandx` are other commands.
    if (/[a-zA-Z@]/.test(source[i] ?? "")) continue;

    if (command === "def") {
      const name = /^\\([a-zA-Z@]+)/.exec(source.slice(i));
      if (!name) continue;
      i += name[0].length;
      // Only simple parameter lists: #1#2…, in order.
      const params = /^((?:#\d)*)/.exec(source.slice(i))![1];
      const count = params.length / 2;
      if (params !== Array.from({ length: count }, (_, k) => `#${k + 1}`).join("")) continue;
      const body = readGroup(source, i + params.length);
      if (!body) continue;
      macros[name[1]] = count ? [body.content, count] : body.content;
      continue;
    }

    const name = readName(source, i);
    if (!name) continue;
    i = name.next;

    if (command === "DeclareMathOperator") {
      const body = readGroup(source, i);
      if (body) macros[name.name] = `\\operatorname${star}{${body.content}}`;
      continue;
    }

    const args = readOptional(source, i);
    const count = args ? Number(args.content.trim()) : 0;
    if (args && !(Number.isInteger(count) && count >= 0 && count <= 9)) continue;
    if (args) i = args.next;
    const optional = count > 0 ? readOptional(source, i) : null;
    if (optional) i = optional.next;
    const body = readGroup(source, i);
    if (!body) continue;
    // \providecommand does not replace an existing definition.
    if (command === "providecommand" && name.name in macros) continue;
    macros[name.name] = optional
      ? [body.content, count, optional.content]
      : count
        ? [body.content, count]
        : body.content;
  }
  return macros;
}

/** The text with its comments blanked out: same length, so positions still match. */
function blankComments(text: string): string {
  return text.replace(
    /(^|[^\\])((?:\\\\)*)(%.*)$/gm,
    (_, before: string, slashes: string, comment: string) =>
      before + slashes + " ".repeat(comment.length),
  );
}

/** The preamble: the text before `\begin{document}`, or all of it (a preamble file). */
export function preambleOf(text: string): string {
  const begin = blankComments(text).search(/\\begin\s*\{document\}/);
  return begin < 0 ? text : text.slice(0, begin);
}

/**
 * Macros of the main file's preamble and of the files it includes there (up to `maxDepth`
 * levels, each file once). `read` returns a file's text, or null if it is not available.
 */
export function collectMacros(
  mainFile: string,
  read: (path: string) => string | null,
  maxDepth = 3,
): MathJaxMacros {
  const seen = new Set<string>([mainFile]);
  const visit = (path: string, depth: number, isMain: boolean): MathJaxMacros => {
    const text = read(path);
    if (text === null) return {};
    const preamble = isMain ? preambleOf(text) : text;
    let macros: MathJaxMacros = {};
    // Included files are read where they are included: their macros come in that order.
    let last = 0;
    const includes = depth < maxDepth ? parseStructure(preamble, path).includes : [];
    const lines = preamble.split("\n");
    for (const include of includes) {
      const at = lines.slice(0, include.line).join("\n").length;
      macros = { ...macros, ...extractMacros(preamble.slice(last, at)) };
      last = at;
      const target = resolveInclude(include.target);
      if (!seen.has(target)) {
        seen.add(target);
        macros = { ...macros, ...visit(target, depth + 1, false) };
      }
    }
    return { ...macros, ...extractMacros(preamble.slice(last)) };
  };
  return visit(mainFile, 0, true);
}
