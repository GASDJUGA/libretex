/**
 * Quick structural check of a LaTeX source, run while typing (no compilation): braces,
 * `\begin`/`\end` pairs and math delimiters. It only reports what LaTeX would certainly
 * reject, and skips comments, verbatim text and macro definitions to avoid false alarms.
 */

export type CheckProblem = {
  from: number;
  to: number;
} & (
  | { code: "unclosedBrace" }
  | { code: "extraBrace" }
  | { code: "unclosedEnv"; name: string }
  | { code: "extraEnd"; name: string }
  | { code: "mismatchedEnv"; name: string; expected: string }
  | { code: "unclosedMath"; open: string; close: string }
  | { code: "extraMathClose"; open: string; close: string }
  | { code: "mismatchedMath"; open: string; close: string; expected: string }
);

/** Environments whose body is not LaTeX: skipped up to their `\end`. */
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

/** Commands whose arguments define macros or environments (unbalanced on purpose). */
const DEFINITIONS = new Set([
  "def",
  "gdef",
  "edef",
  "xdef",
  "newcommand",
  "renewcommand",
  "providecommand",
  "DeclareRobustCommand",
  "newenvironment",
  "renewenvironment",
  "NewDocumentCommand",
  "RenewDocumentCommand",
  "ProvideDocumentCommand",
  "DeclareDocumentCommand",
  "NewDocumentEnvironment",
  "RenewDocumentEnvironment",
  "newcommandx",
]);

/** Commands whose argument is read verbatim (a `%` or `#` there is not special). */
const VERBATIM_ARG = new Set(["url", "href", "path"]);

const CLOSERS: Record<string, string> = { $: "$", $$: "$$", "\\(": "\\)", "\\[": "\\]" };

const isLetter = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "@";

type Open = { text: string; from: number; to: number };

/** Problems found in `text`, in document order. */
export function checkLatex(text: string): CheckProblem[] {
  const problems: CheckProblem[] = [];
  const braces: number[] = [];
  const envs: { name: string; from: number; to: number }[] = [];
  const math: Open[] = [];
  /** Brace depth where a definition started; inside its arguments envs and math are ignored. */
  let definitionDepth: number | null = null;
  const n = text.length;
  let i = 0;

  const inDefinition = () => definitionDepth !== null;

  /** Index of the next character that is not a space or tab (newlines included). */
  const skipSpaces = (from: number) => {
    let j = from;
    while (j < n && (text[j] === " " || text[j] === "\t" || text[j] === "\n")) j++;
    return j;
  };

  /** `{name}` starting at `from` (after optional spaces), or null. */
  const readGroupName = (from: number): { name: string; end: number } | null => {
    const j = skipSpaces(from);
    if (text[j] !== "{") return null;
    const close = text.indexOf("}", j + 1);
    const newline = text.indexOf("\n", j + 1);
    if (close < 0 || (newline >= 0 && newline < close)) return null;
    return { name: text.slice(j + 1, close).trim(), end: close + 1 };
  };

  /** Math still open at a paragraph break (or the end) can never be closed: report it. */
  const flushMath = () => {
    for (const open of math) {
      problems.push({
        code: "unclosedMath",
        from: open.from,
        to: open.to,
        open: open.text,
        close: CLOSERS[open.text],
      });
    }
    math.length = 0;
  };

  const mathDelimiter = (delimiter: string, from: number, to: number) => {
    if (inDefinition()) return;
    const top = math[math.length - 1];
    if (delimiter === "$$" && top?.text === "$") {
      // Inside inline math the first `$` closes it and the second opens another formula.
      math.pop();
      math.push({ text: "$", from: from + 1, to });
      return;
    }
    if (delimiter === "$" || delimiter === "$$") {
      // `$` closes a `$`; otherwise it opens (also inside `\text{…}` in display math).
      if (top?.text === delimiter) math.pop();
      else math.push({ text: delimiter, from, to });
      return;
    }
    if (delimiter === "\\(" || delimiter === "\\[") {
      math.push({ text: delimiter, from, to });
      return;
    }
    // `\)` or `\]`.
    const opener = delimiter === "\\)" ? "\\(" : "\\[";
    if (top?.text === opener) {
      math.pop();
    } else if (top) {
      problems.push({
        code: "mismatchedMath",
        from,
        to,
        open: top.text,
        close: delimiter,
        expected: CLOSERS[top.text],
      });
      // Recover at the matching opener if there is one, else drop the innermost formula.
      if (math.some((m) => m.text === opener)) {
        while (math[math.length - 1].text !== opener) math.pop();
      }
      math.pop();
    } else {
      problems.push({ code: "extraMathClose", from, to, open: opener, close: delimiter });
    }
  };

  while (i < n) {
    const c = text[i];

    if (c === "%") {
      const end = text.indexOf("\n", i);
      i = end < 0 ? n : end;
      continue;
    }

    if (c === "\n") {
      // A blank line ends the paragraph: math cannot span it.
      let j = i + 1;
      while (j < n && (text[j] === " " || text[j] === "\t")) j++;
      if (text[j] === "\n" && math.length && !inDefinition()) flushMath();
      i++;
      continue;
    }

    if (c === "{") {
      braces.push(i);
      i++;
      continue;
    }

    if (c === "}") {
      if (braces.length) braces.pop();
      else problems.push({ code: "extraBrace", from: i, to: i + 1 });
      i++;
      // A definition ends when its last argument closes.
      if (definitionDepth !== null && braces.length <= definitionDepth) {
        const next = skipSpaces(i);
        if (text[next] !== "{" && text[next] !== "[") definitionDepth = null;
      }
      continue;
    }

    if (c === "$") {
      const double = text[i + 1] === "$";
      const len = double ? 2 : 1;
      mathDelimiter(double ? "$$" : "$", i, i + len);
      i += len;
      continue;
    }

    if (c !== "\\") {
      i++;
      continue;
    }

    // A control sequence: `\` + letters, or `\` + one other character.
    const start = i;
    if (i + 1 >= n) break;
    if (!isLetter(text[i + 1])) {
      const symbol = text[i + 1];
      if (symbol === "(" || symbol === ")" || symbol === "[" || symbol === "]") {
        mathDelimiter(`\\${symbol}`, start, start + 2);
      }
      i += 2;
      continue;
    }
    let j = i + 1;
    while (j < n && isLetter(text[j])) j++;
    const name = text.slice(i + 1, j);
    i = j;

    if (name === "verb" || name === "lstinline" || name === "mintinline") {
      if (name === "mintinline") {
        const lang = readGroupName(i);
        if (lang) i = lang.end;
      }
      if (text[i] === "*") i++;
      if (name !== "verb" && text[i] === "[") {
        const close = text.indexOf("]", i);
        if (close > 0) i = close + 1;
      }
      const delimiter = text[i];
      if (!delimiter || delimiter === "\n") continue;
      const closing = delimiter === "{" ? "}" : delimiter;
      const end = text.indexOf(closing, i + 1);
      const newline = text.indexOf("\n", i + 1);
      i = end < 0 || (newline >= 0 && newline < end) ? i + 1 : end + 1;
      continue;
    }

    if (VERBATIM_ARG.has(name)) {
      const j2 = skipSpaces(i);
      if (text[j2] === "{") {
        const end = text.indexOf("}", j2 + 1);
        if (end > 0) i = end + 1;
      }
      continue;
    }

    if (DEFINITIONS.has(name)) {
      if (definitionDepth === null) definitionDepth = braces.length;
      continue;
    }

    if ((name === "begin" || name === "end") && !inDefinition()) {
      const group = readGroupName(i);
      if (!group || !group.name) continue;
      i = group.end;
      if (name === "begin") {
        if (VERBATIM_ENVS.has(group.name)) {
          const endTag = `\\end{${group.name}}`;
          const end = text.indexOf(endTag, i);
          if (end < 0) {
            problems.push({ code: "unclosedEnv", from: start, to: group.end, name: group.name });
            i = n;
          } else {
            i = end + endTag.length;
          }
          continue;
        }
        envs.push({ name: group.name, from: start, to: group.end });
        continue;
      }
      const top = envs[envs.length - 1];
      if (top?.name === group.name) {
        envs.pop();
      } else if (envs.some((e) => e.name === group.name)) {
        problems.push({
          code: "mismatchedEnv",
          from: start,
          to: group.end,
          name: group.name,
          expected: top.name,
        });
        while (envs.length && envs[envs.length - 1].name !== group.name) envs.pop();
        envs.pop();
      } else {
        problems.push({ code: "extraEnd", from: start, to: group.end, name: group.name });
      }
    }
  }

  flushMath();
  for (const env of envs) {
    problems.push({ code: "unclosedEnv", from: env.from, to: env.to, name: env.name });
  }
  for (const pos of braces) problems.push({ code: "unclosedBrace", from: pos, to: pos + 1 });
  return problems.sort((a, b) => a.from - b.from);
}
