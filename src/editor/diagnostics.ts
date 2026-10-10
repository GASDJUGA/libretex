import type { Diagnostic } from "@codemirror/lint";
import type { Text } from "@codemirror/state";
import type { LogEntry, ParsedLog } from "../lib/latexLog/parse";

const SEVERITY: Record<LogEntry["severity"], Diagnostic["severity"]> = {
  error: "error",
  warning: "warning",
  typesetting: "info",
};

/**
 * Line where an entry should be shown in `doc`. A missing package is reported by TeX at
 * the line it had reached (often `\begin{document}`): point at its `\usepackage` instead.
 */
export function entryLine(entry: LogEntry, doc: Text): number | null {
  if (entry.kind === "missingFile" && entry.missingFile?.endsWith(".sty")) {
    const name = entry.missingFile.slice(0, -4);
    const usepackage = new RegExp(
      `\\\\(?:usepackage|RequirePackage)(?:\\[[^\\]]*\\])?\\{[^}]*\\b${name}\\b`,
    );
    for (let n = 1; n <= doc.lines; n++) {
      if (usepackage.test(doc.line(n).text)) return n;
    }
  }
  return entry.line !== null && entry.line >= 1 && entry.line <= doc.lines ? entry.line : null;
}

/** CodeMirror diagnostics of `path` from a compilation log. */
export function diagnosticsFor(parsed: ParsedLog | null, path: string, doc: Text): Diagnostic[] {
  if (!parsed) return [];
  const entries = [...parsed.errors, ...parsed.warnings, ...parsed.typesetting];
  return entries.flatMap((entry): Diagnostic[] => {
    if (entry.file !== path) return [];
    const n = entryLine(entry, doc);
    if (n === null) return [];
    const line = doc.line(n);
    // Underline the text of the line, not its indentation.
    const indent = /^\s*/.exec(line.text)![0].length;
    return [
      {
        from: Math.min(line.from + indent, line.to),
        to: line.to,
        severity: SEVERITY[entry.severity],
        message: entry.message,
        source: "LaTeX",
      },
    ];
  });
}
