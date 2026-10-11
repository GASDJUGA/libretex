/**
 * Math regions of a LaTeX source: `$…$`, `\(…\)`, `$$…$$`, `\[…\]` and the math
 * environments. This text scanner is the fallback of the syntax-tree detection
 * (`editor/mathRegion.ts`); both follow the same rules and share the tests.
 */

/** A top-level math region. Offsets are in the scanned text. */
export type MathRegion = {
  /** The whole region, delimiters included. */
  from: number;
  to: number;
  /** The TeX to render (between the delimiters). */
  bodyFrom: number;
  bodyTo: number;
  /** Display math (`$$`, `\[`, environments) or inline (`$`, `\(`). */
  display: boolean;
  /** The environment (`align*`…), or null for delimiters. */
  env: string | null;
  /** No closing delimiter before the end of the paragraph (or of the text). */
  unclosed: boolean;
};

/** Math environments, also with `*`. */
export const MATH_ENVS = [
  "equation",
  "align",
  "gather",
  "multline",
  "flalign",
  "alignat",
  "eqnarray",
  "math",
  "displaymath",
] as const;

const MATH_ENV = new Set<string>(MATH_ENVS.flatMap((e) => [e, `${e}*`]));

/** Environments whose content is not LaTeX. */
const VERBATIM_ENVS = new Set([
  "verbatim",
  "verbatim*",
  "Verbatim",
  "Verbatim*",
  "BVerbatim",
  "LVerbatim",
  "lstlisting",
  "minted",
  "comment",
  "filecontents",
  "filecontents*",
]);

const isLetter = (c: string | undefined) =>
  c !== undefined && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "@");

/** `\begin{name}` / `\end{name}` at `at` (pointing at the backslash), on one line. */
function envTag(text: string, at: number, kind: "begin" | "end") {
  const word = `\\${kind}`;
  if (!text.startsWith(word, at) || isLetter(text[at + word.length])) return null;
  let i = at + word.length;
  while (text[i] === " " || text[i] === "\t") i++;
  if (text[i] !== "{") return null;
  const close = text.indexOf("}", i);
  const newline = text.indexOf("\n", i);
  if (close < 0 || (newline >= 0 && newline < close)) return null;
  return { name: text.slice(i + 1, close).trim(), end: close + 1 };
}

/** Index of the next blank line (paragraph end) at or after `from`, or the text length. */
function paragraphEnd(text: string, from: number) {
  const blank = /\n[ \t]*\n/g;
  blank.lastIndex = from;
  const match = blank.exec(text);
  return match ? match.index : text.length;
}

/** End of the comment starting at `at` (the `%`): the end of its line. */
function commentEnd(text: string, at: number) {
  const end = text.indexOf("\n", at);
  return end < 0 ? text.length : end;
}

/** Skips `\verb|…|`, `\lstinline` and `\mintinline` arguments; returns the new index. */
function skipInlineVerbatim(text: string, name: string, i: number) {
  if (name === "mintinline") {
    const brace = text.indexOf("}", i);
    if (text[i] === "{" && brace > 0) i = brace + 1;
  }
  if (text[i] === "*") i++;
  if (name !== "verb" && text[i] === "[") {
    const close = text.indexOf("]", i);
    if (close > 0) i = close + 1;
  }
  const delimiter = text[i];
  if (!delimiter || delimiter === "\n") return i;
  const closing = delimiter === "{" ? "}" : delimiter;
  const end = text.indexOf(closing, i + 1);
  const newline = text.indexOf("\n", i + 1);
  return end < 0 || (newline >= 0 && newline < end) ? i + 1 : end + 1;
}

type Closer = { kind: "dollar" | "double" | "paren" | "bracket" } | { kind: "env"; name: string };

/**
 * End of the math region whose body starts at `from`: the closer at brace depth 0 (so
 * `\text{… $x$ …}` inside display math does not end it), skipping comments. Returns the
 * body end and the region end, or null when it is not closed.
 */
function findCloser(text: string, from: number, closer: Closer) {
  const limit = closer.kind === "env" ? text.length : paragraphEnd(text, from);
  let depth = 0;
  let nested = 0;
  for (let i = from; i < limit; i++) {
    const c = text[i];
    if (c === "%") {
      i = commentEnd(text, i);
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth = Math.max(0, depth - 1);
    else if (c === "$") {
      if (depth > 0) continue;
      if (closer.kind === "double" && text[i + 1] === "$") return { bodyTo: i, to: i + 2 };
      if (closer.kind === "dollar") return { bodyTo: i, to: i + 1 };
    } else if (c === "\\") {
      const next = text[i + 1];
      if (closer.kind === "paren" && next === ")" && depth === 0) return { bodyTo: i, to: i + 2 };
      if (closer.kind === "bracket" && next === "]" && depth === 0) return { bodyTo: i, to: i + 2 };
      if (closer.kind === "env") {
        const begin = envTag(text, i, "begin");
        if (begin?.name === closer.name) nested++;
        const end = envTag(text, i, "end");
        if (end?.name === closer.name) {
          if (nested === 0) return { bodyTo: i, to: end.end };
          nested--;
        }
      }
      i++; // a control symbol (`\$`, `\\`, `\%`…) is never a delimiter
    }
  }
  return null;
}

/** Top-level math regions of `text`, in order. */
export function mathRegions(text: string): MathRegion[] {
  const regions: MathRegion[] = [];
  const n = text.length;
  let i = 0;

  const add = (
    from: number,
    bodyFrom: number,
    closer: Closer,
    display: boolean,
    env: string | null,
  ) => {
    const end = findCloser(text, bodyFrom, closer);
    const to = end?.to ?? (closer.kind === "env" ? n : paragraphEnd(text, bodyFrom));
    regions.push({
      from,
      to,
      bodyFrom,
      bodyTo: end?.bodyTo ?? to,
      display,
      env,
      unclosed: !end,
    });
    return to;
  };

  while (i < n) {
    const c = text[i];
    if (c === "%") {
      i = commentEnd(text, i);
    } else if (c === "$") {
      i =
        text[i + 1] === "$"
          ? add(i, i + 2, { kind: "double" }, true, null)
          : add(i, i + 1, { kind: "dollar" }, false, null);
    } else if (c !== "\\") {
      i++;
    } else if (text[i + 1] === "(") {
      i = add(i, i + 2, { kind: "paren" }, false, null);
    } else if (text[i + 1] === "[") {
      i = add(i, i + 2, { kind: "bracket" }, true, null);
    } else if (!isLetter(text[i + 1])) {
      i += 2; // `\$`, `\\`, `\%`…
    } else {
      let j = i + 1;
      while (j < n && isLetter(text[j])) j++;
      const name = text.slice(i + 1, j);
      if (name === "verb" || name === "lstinline" || name === "mintinline") {
        i = skipInlineVerbatim(text, name, j);
      } else if (name === "begin") {
        const tag = envTag(text, i, "begin");
        if (tag && MATH_ENV.has(tag.name)) {
          i = add(i, tag.end, { kind: "env", name: tag.name }, true, tag.name);
        } else if (tag && VERBATIM_ENVS.has(tag.name)) {
          const endTag = `\\end{${tag.name}}`;
          const end = text.indexOf(endTag, tag.end);
          i = end < 0 ? n : end + endTag.length;
        } else {
          i = tag ? tag.end : j;
        }
      } else {
        i = j;
      }
    }
  }
  return regions;
}

/**
 * The math region whose body contains `pos` (a cursor position; the edges of the body
 * count), or null.
 */
export function mathRegionAt(text: string, pos: number): MathRegion | null {
  return mathRegions(text).find((r) => r.bodyFrom <= pos && pos <= r.bodyTo) ?? null;
}
