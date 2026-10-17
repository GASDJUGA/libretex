/**
 * The words of a LaTeX source that the spell checker looks at: prose only. Skipped:
 * commands, math, comments, verbatim-like environments, optional arguments (`[width=…]`)
 * and the arguments of commands that hold names rather than text (`\ref`, `\cite`,
 * `\usepackage`, `\begin`, `\includegraphics`…). Also skipped: acronyms (`PDF`), names with
 * capitals inside (`LaTeX`) and pieces glued to a command (`Introducci\'on`).
 */
import { mathRegions } from "../latexMath/regions";

export type WordRange = { from: number; to: number; word: string };

/** Commands whose arguments are keys, file names, packages, options or code. */
const NAME_ARGUMENTS = new Set(
  (
    "label ref eqref pageref autoref nameref cref Cref vref cite citep citet citealp " +
    "citeauthor citeyear nocite parencite textcite autocite footcite fullcite smartcite " +
    "supercite usepackage RequirePackage documentclass usetikzlibrary usepgfplotslibrary " +
    "input include includeonly includegraphics includepdf subfile bibliography " +
    "bibliographystyle addbibresource printbibliography url hypersetup graphicspath " +
    "lstinputlisting inputminted newcommand renewcommand providecommand newenvironment " +
    "renewenvironment DeclareMathOperator NewDocumentCommand RenewDocumentCommand def let " +
    "newcounter setcounter addtocounter stepcounter setlength addtolength newlength " +
    "settowidth definecolor color pagecolor pagestyle thispagestyle pagenumbering " +
    "numberwithin geometry setmainfont setsansfont setmonofont newfontfamily selectlanguage " +
    "begin end hspace vspace rule raisebox fontsize linespread newtheorem theoremstyle tikz " +
    "tikzset pgfplotsset sisetup SI si qty unit num ang DTMsetstyle cline"
  ).split(" "),
);

/** Commands with some name arguments followed by text: how many to skip. */
const LEADING_NAME_ARGUMENTS: Record<string, number> = {
  href: 1,
  textcolor: 1,
  colorbox: 1,
  foreignlanguage: 1,
  multicolumn: 2,
  multirow: 2,
};

/** Environments whose content is code or data, not prose. */
const RAW_ENVIRONMENTS = new Set(
  (
    "verbatim verbatim* Verbatim lstlisting minted comment tikzpicture pgfpicture axis " +
    "filecontents filecontents*"
  ).split(" "),
);

const isLetter = (c: string) => /\p{L}/u.test(c);
const isWordChar = (c: string) => /[\p{L}\p{M}]/u.test(c);

/** End of a balanced `{…}` or `[…]` group starting at `i` (the position after it). */
function groupEnd(text: string, i: number): number {
  const open = text[i];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (c === "\\") {
      j++;
      continue;
    }
    if (c === "%" && open === "{") {
      const eol = text.indexOf("\n", j);
      if (eol < 0) return text.length;
      j = eol;
      continue;
    }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return j + 1;
    // An optional argument never spans a paragraph: a stray `[` is just text.
    else if (open === "[" && c === "\n" && text[j + 1] === "\n") return i + 1;
  }
  return text.length;
}

/** Position after the groups (`{…}` and `[…]`) that follow `i` right away. */
function skipGroups(text: string, i: number, kinds: string): number {
  while (i < text.length && kinds.includes(text[i])) i = groupEnd(text, i);
  return i;
}

/** The argument of `\begin{…}` / `\end{…}` starting at `i` (spaces allowed before it). */
function environmentName(text: string, i: number): { name: string; end: number } | null {
  const match = /^\s*\{([^{}]*)\}/.exec(text.slice(i, i + 80));
  return match ? { name: match[1].trim(), end: i + match[0].length } : null;
}

/** A word that is checked: not an acronym, not a name with capitals inside. */
function checkable(word: string): boolean {
  const letters = [...word].filter(isLetter);
  if (letters.length < 2) return false;
  const rest = word.slice(1);
  if (rest !== rest.toLowerCase()) return false; // PDF, LaTeX, McDonald
  return true;
}

/**
 * The prose words of `text` (in order). Positions are offsets in `text` (UTF-16 units).
 */
export function proseWords(text: string): WordRange[] {
  const words: WordRange[] = [];
  const math = mathRegions(text);
  let nextMath = 0;
  const n = text.length;
  /** Where the last command ended: a word glued to it is a piece of an accent. */
  let commandEnd = -1;
  let i = 0;

  while (i < n) {
    // Math regions (they also cover their delimiters).
    while (nextMath < math.length && math[nextMath].to <= i) nextMath++;
    if (nextMath < math.length && math[nextMath].from <= i) {
      i = Math.max(i + 1, math[nextMath].to);
      continue;
    }
    const c = text[i];
    if (c === "%") {
      const eol = text.indexOf("\n", i);
      i = eol < 0 ? n : eol;
      continue;
    }
    if (c === "\\") {
      const name = /^\\([A-Za-z@]+\*?|.)/s.exec(text.slice(i, i + 64))?.[1] ?? "";
      let j = i + 1 + name.length;
      const base = name.replace(/\*$/, "");
      if (base === "verb" || base === "lstinline") {
        // \verb|…| (any delimiter) or \lstinline{…}
        const delimiter = text[j] === "{" ? "}" : text[j];
        const close = delimiter ? text.indexOf(delimiter, j + 1) : -1;
        i = close < 0 ? n : close + 1;
        continue;
      }
      if (base === "begin") {
        const env = environmentName(text, j);
        if (env && RAW_ENVIRONMENTS.has(env.name)) {
          const endTag = text.indexOf(`\\end{${env.name}}`, env.end);
          i = endTag < 0 ? n : endTag + `\\end{${env.name}}`.length;
          continue;
        }
        // Its name and what follows it right away (`{|c|c|}`, `[htbp]`).
        j = env ? skipGroups(text, env.end, "{[") : j;
      } else if (base in LEADING_NAME_ARGUMENTS) {
        for (let k = 0; k < LEADING_NAME_ARGUMENTS[base]; k++) {
          j = skipGroups(text, j, "[");
          if (text[j] === "{") j = groupEnd(text, j);
        }
        j = skipGroups(text, j, "[");
      } else if (NAME_ARGUMENTS.has(base)) {
        j = skipGroups(text, j, "{[");
      } else if (/^[A-Za-z@]/.test(name)) {
        // Optional arguments (`[width=0.8\linewidth]`) are options, not prose.
        j = skipGroups(text, j, "[");
      }
      commandEnd = j;
      i = j;
      continue;
    }
    if (isLetter(c)) {
      let j = i;
      while (j < n) {
        if (isWordChar(text[j])) j++;
        // Apostrophes inside a word (don't, l'eau).
        else if ((text[j] === "'" || text[j] === "’") && j + 1 < n && isLetter(text[j + 1])) j++;
        else break;
      }
      // A piece of a word written with an accent command (`Introducci\'on`).
      const glued = i === commandEnd || (text[j] === "\\" && /['`^"~=.]/.test(text[j + 1] ?? ""));
      const digits = (i > 0 && /[\d_]/.test(text[i - 1])) || (j < n && /[\d_]/.test(text[j]));
      const word = text.slice(i, j);
      if (!glued && !digits && checkable(word)) words.push({ from: i, to: j, word });
      i = j;
      continue;
    }
    i++;
  }
  return words;
}
