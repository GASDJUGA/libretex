/**
 * Parser of TeX engine logs (as produced with `-file-line-error`), classifying errors,
 * warnings and typesetting issues (over/underfull boxes) with their file and line.
 */

export type LogSeverity = "error" | "warning" | "typesetting";

export type LogEntry = {
  severity: LogSeverity;
  /** First line of the message, whitespace normalized. */
  message: string;
  /** Project-relative file (`./` removed), or the distribution file, or null if unknown. */
  file: string | null;
  /** 1-based line, when known. */
  line: number | null;
  /** Following log lines that help understand the message (e.g. `l.4 \foo`). */
  context: string[];
  kind?: "missingFile" | "undefinedReference" | "undefinedCitation";
  /** For `missingFile`: the file TeX could not find (e.g. `tikz-cd.sty`). */
  missingFile?: string;
  /** Package or class that emitted a warning. */
  source?: string;
};

export type ParsedLog = {
  errors: LogEntry[];
  warnings: LogEntry[];
  typesetting: LogEntry[];
};

const FILE_LINE =
  /^(\.{0,2}\/?[^\s:][^:]*?\.(?:tex|ltx|sty|cls|bib|bbl|aux|dtx|ins|def|cfg|clo)):(\d+): (.*)$/;
const BANG = /^! (.*)$/;
const WARNING = /^(LaTeX|LaTeX Font|Package ([\w.-]+)|Class ([\w.-]+)) Warning: (.*)$/;
const BOX =
  /^(Overfull|Underfull) \\([hv])box (.*?)(?: in paragraph at lines (\d+)--(\d+)| detected at line (\d+)| has occurred while \\output is active)/;
const MISSING_FILE = /File [`'‘]([^'’]+)['’] not found/;
const CONTEXT_LINE = /^l\.(\d+)/;
/** Noise that only repeats a real error, or summaries handled by latexmk reruns. */
const DERIVED_ERROR = /Emergency stop|==> Fatal error occurred/;
const SKIPPED_WARNING =
  /There were undefined (references|citations)|Label\(s\) may have changed|Rerun to get/;
/** A `(` followed by something that looks like a file path opens that file. */
const FILE_OPEN =
  /^(?:\.{1,2}\/|\/)[^\s()]*|^[\w.-]+\.(?:tex|ltx|sty|cls|cfg|def|clo|fd|aux|bbl|ldf|ini|toc|lof|lot|out|ind|nav|snm|vrb)\b/;

const normalizeFile = (file: string) => file.replace(/^\.\//, "");
const clean = (text: string) => text.replace(/\s+/g, " ").trim();

/** Tracks which file TeX is reading from the parentheses it prints around file names. */
class FileStack {
  private stack: string[] = [];
  /** Last project file that was closed: «File ended while…» errors come right after it. */
  private lastClosed: string | null = null;

  /** Updates the stack with the parentheses of a non-message line. */
  scan(line: string) {
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === "(") {
        const match = FILE_OPEN.exec(line.slice(i + 1));
        // Non-file parentheses are pushed too, so their `)` does not pop a file.
        this.stack.push(match ? normalizeFile(match[0]) : "");
        if (match) i += match[0].length;
      } else if (ch === ")") {
        const closed = this.stack.pop();
        if (closed && !closed.startsWith("/")) this.lastClosed = closed;
      }
    }
  }

  /**
   * The innermost project file being read (distribution files under absolute paths are not
   * useful locations), else the last project file closed, else any open file.
   */
  top(): string | null {
    const files = this.stack.filter(Boolean);
    const project = [...files].reverse().find((f) => !f.startsWith("/"));
    return project ?? this.lastClosed ?? files[files.length - 1] ?? null;
  }
}

/** Following lines of an error, up to the first blank line (at most `max`). */
function contextAfter(lines: string[], start: number, max = 8): string[] {
  const context: string[] = [];
  for (let i = start; i < lines.length && context.length < max; i++) {
    if (lines[i].trim() === "") break;
    context.push(lines[i]);
  }
  return context;
}

export function parseLatexLog(log: string): ParsedLog {
  const lines = log.split(/\r?\n/);
  const files = new FileStack();
  const entries: LogEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    let m: RegExpExecArray | null;

    if ((m = FILE_LINE.exec(text))) {
      const context = contextAfter(lines, i + 1);
      const message = clean(m[3]);
      const missing = MISSING_FILE.exec(message);
      entries.push({
        severity: "error",
        message,
        file: normalizeFile(m[1]),
        line: Number(m[2]),
        context,
        ...(missing ? { kind: "missingFile" as const, missingFile: missing[1] } : {}),
      });
      continue;
    }

    if ((m = BANG.exec(text))) {
      const context = contextAfter(lines, i + 1);
      const lineMatch = context.map((c) => CONTEXT_LINE.exec(c)).find(Boolean);
      const message = clean(m[1]);
      const missing = MISSING_FILE.exec(message);
      entries.push({
        severity: "error",
        message,
        file: files.top(),
        line: lineMatch ? Number(lineMatch[1]) : null,
        context,
        ...(missing ? { kind: "missingFile" as const, missingFile: missing[1] } : {}),
      });
      continue;
    }

    if ((m = WARNING.exec(text))) {
      const source = m[2] ?? m[3] ?? undefined;
      const parts = [m[4]];
      // Continuation lines: «(package)   …» for packages, plain lines for LaTeX warnings.
      for (let j = i + 1; j < lines.length && lines[j].trim() !== ""; j++) {
        const continuation = /^\(([\w.-]+)\)\s+(.*)$/.exec(lines[j]);
        if (continuation) parts.push(continuation[2]);
        else if (!source) parts.push(lines[j]);
        else break;
        i = j;
      }
      const message = clean(parts.join(" "));
      if (SKIPPED_WARNING.test(message)) continue;
      const inputLine = /on input line (\d+)/.exec(message);
      const kind = /^Reference [`'‘].*undefined/.test(message)
        ? ("undefinedReference" as const)
        : /^Citation [`'‘].*undefined/.test(message)
          ? ("undefinedCitation" as const)
          : undefined;
      entries.push({
        severity: "warning",
        message: message.replace(/\s*on input line \d+\.?$/, "").trim(),
        file: files.top(),
        line: inputLine ? Number(inputLine[1]) : null,
        context: [],
        ...(kind ? { kind } : {}),
        ...(source ? { source } : {}),
      });
      continue;
    }

    if ((m = BOX.exec(text))) {
      const line = m[4] ?? m[6];
      entries.push({
        severity: "typesetting",
        message: clean(`${m[1]} \\${m[2]}box ${m[3]}`),
        file: files.top(),
        line: line ? Number(line) : null,
        context: contextAfter(lines, i + 1, 3),
      });
      continue;
    }

    files.scan(text);
  }

  // «Emergency stop» / «Fatal error» only repeat a real error: drop them when there is one.
  const real = entries.filter((e) => !(e.severity === "error" && DERIVED_ERROR.test(e.message)));
  const hasRealError = real.some((e) => e.severity === "error");
  const kept = hasRealError ? real : entries;

  const seen = new Set<string>();
  const unique = kept.filter((e) => {
    const key = `${e.severity}|${e.file}|${e.line}|${e.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    errors: unique.filter((e) => e.severity === "error"),
    warnings: unique.filter((e) => e.severity === "warning"),
    typesetting: unique.filter((e) => e.severity === "typesetting"),
  };
}
