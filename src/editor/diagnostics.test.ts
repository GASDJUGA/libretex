import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import type { LogEntry, ParsedLog } from "../lib/latexLog/parse";
import { diagnosticsFor, entryLine } from "./diagnostics";

const doc = Text.of([
  "\\documentclass{article}",
  "\\usepackage[spanish]{babel}",
  "\\usepackage{amsmath, tikz-cd}",
  "\\begin{document}",
  "  \\foo",
  "\\end{document}",
]);

const entry = (e: Partial<LogEntry>): LogEntry => ({
  severity: "error",
  message: "m",
  file: "main.tex",
  line: null,
  context: [],
  ...e,
});

describe("diagnósticos del editor", () => {
  it("un paquete faltante apunta a su \\usepackage", () => {
    const missing = entry({ kind: "missingFile", missingFile: "tikz-cd.sty", line: 4 });
    expect(entryLine(missing, doc)).toBe(3);
  });

  it("subraya el texto de la línea sin la sangría y filtra por archivo", () => {
    const parsed: ParsedLog = {
      errors: [entry({ line: 5, message: "Undefined control sequence." })],
      warnings: [
        entry({ severity: "warning", line: 2 }),
        entry({ severity: "warning", file: "otro.tex", line: 1 }),
      ],
      typesetting: [entry({ severity: "typesetting", line: 99 })],
    };
    const diags = diagnosticsFor(parsed, "main.tex", doc);
    expect(diags.map((d) => [d.severity, doc.sliceString(d.from, d.to)])).toEqual([
      ["error", "\\foo"],
      ["warning", "\\usepackage[spanish]{babel}"],
    ]);
  });
});
