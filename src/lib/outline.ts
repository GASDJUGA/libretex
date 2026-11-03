/** Structure of a LaTeX document: sectioning commands and included files. */

export const SECTION_LEVELS = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
} as const;

export type SectionCommand = keyof typeof SECTION_LEVELS;

export type Heading = {
  level: number;
  title: string;
  /** 1-based line. */
  line: number;
  /** File the heading belongs to (relative path). */
  file: string;
};

export type Structure = {
  headings: Heading[];
  /** `\input`/`\include` targets, as written, with their line. */
  includes: { target: string; line: number }[];
};

/** Removes a `%` comment from a line (ignoring `\%`). */
function stripComment(line: string) {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\") i++;
    else if (line[i] === "%") return line.slice(0, i);
  }
  return line;
}

/** Content of the brace group starting at `open` (which must be `{`), or null if unclosed. */
function braceGroup(text: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(open + 1, i);
  }
  return null;
}

const COMMAND =
  /\\(part|chapter|section|subsection|subsubsection|input|include)\b(\*?)\s*(?:\[[^\]]*\])?\s*(?=\{)/g;

/** Headings and includes of one file. */
export function parseStructure(text: string, file: string): Structure {
  const headings: Heading[] = [];
  const includes: Structure["includes"] = [];
  text.split("\n").forEach((raw, i) => {
    const line = stripComment(raw);
    for (const m of line.matchAll(COMMAND)) {
      const arg = braceGroup(line, m.index + m[0].length);
      if (arg === null) continue;
      const name = m[1];
      if (name === "input" || name === "include") {
        includes.push({ target: arg.trim(), line: i + 1 });
      } else {
        const title = arg.replace(/\s+/g, " ").trim();
        headings.push({ level: SECTION_LEVELS[name as SectionCommand], title, line: i + 1, file });
      }
    }
  });
  return { headings, includes };
}

/** Project path of an `\input{…}` target (adds `.tex` when there is no extension). */
export function resolveInclude(target: string): string {
  const clean = target.replace(/^\.\//, "");
  return /\.[A-Za-z0-9]+$/.test(clean.split("/").pop() ?? "") ? clean : `${clean}.tex`;
}

/**
 * Outline of `file`, with the headings of its included files spliced in where they are
 * included (up to `maxDepth` levels, never twice the same file). `read` returns the text of
 * a file, or undefined while it is not loaded.
 */
export function buildOutline(
  file: string,
  read: (path: string) => string | undefined,
  maxDepth = 3,
): { headings: Heading[]; pending: string[] } {
  const pending: string[] = [];
  const visit = (path: string, depth: number, seen: Set<string>): Heading[] => {
    const text = read(path);
    if (text === undefined) {
      pending.push(path);
      return [];
    }
    const { headings, includes } = parseStructure(text, path);
    if (depth >= maxDepth || includes.length === 0) return headings;
    const items: (Heading | { include: string; line: number })[] = [
      ...headings,
      ...includes.map((inc) => ({ include: resolveInclude(inc.target), line: inc.line })),
    ].sort((a, b) => a.line - b.line);
    return items.flatMap((item) => {
      if (!("include" in item)) return [item];
      if (seen.has(item.include)) return [];
      return visit(item.include, depth + 1, new Set([...seen, item.include]));
    });
  };
  return { headings: visit(file, 0, new Set([file])), pending };
}

/** Index of the heading of `file` that contains `line` (the last one at or before it). */
export function currentHeading(headings: Heading[], file: string, line: number): number {
  let found = -1;
  headings.forEach((h, i) => {
    if (h.file === file && h.line <= line) found = i;
  });
  return found;
}

/**
 * Key of each heading that survives editing (lines move while typing): its file, level and
 * title, plus how many identical headings came before it.
 */
export function headingKeys(headings: Heading[]): string[] {
  const seen = new Map<string, number>();
  return headings.map((h) => {
    const base = `${h.file}\n${h.level}\n${h.title}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}\n${n}`;
  });
}

/** The heading has subsections (the one after it is deeper). */
export function hasChildren(headings: Heading[], i: number): boolean {
  return i + 1 < headings.length && headings[i + 1].level > headings[i].level;
}

/**
 * For each heading, the index shown in its place: itself, or the collapsed heading that
 * hides it (a section inside a collapsed chapter shows as that chapter).
 */
export function shownAs(headings: Heading[], keys: string[], collapsed: Set<string>): number[] {
  let hider = -1;
  return headings.map((h, i) => {
    if (hider >= 0 && h.level > headings[hider].level) return hider;
    hider = collapsed.has(keys[i]) && hasChildren(headings, i) ? i : -1;
    return i;
  });
}
