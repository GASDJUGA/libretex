import { describe, expect, it } from "vitest";
import errorBraces from "../../../tests/fixtures/logs/error-braces.log?raw";
import errorUndefined from "../../../tests/fixtures/logs/error-undefined.log?raw";
import miktexMissingSty from "../../../tests/fixtures/logs/miktex-missing-sty.log?raw";
import miktexMultifile from "../../../tests/fixtures/logs/miktex-multifile.log?raw";
import miktexXelatexBabel from "../../../tests/fixtures/logs/miktex-xelatex-babel-es.log?raw";
import missingSty from "../../../tests/fixtures/logs/missing-sty.log?raw";
import multifile from "../../../tests/fixtures/logs/multifile.log?raw";
import pdflatexOk from "../../../tests/fixtures/logs/pdflatex-ok.log?raw";
import xelatexBabel from "../../../tests/fixtures/logs/xelatex-babel-es.log?raw";
import { parseLatexLog } from "./parse";

/** Logs generated with TeX Live 2026 and the same latexmk options LibreTeX uses
 * (sources in tests/fixtures/logs/sources). */
describe("parseLatexLog (logs reales)", () => {
  it("pdfLaTeX sin problemas", () => {
    const log = parseLatexLog(pdflatexOk);
    expect(log.errors).toEqual([]);
    expect(log.warnings).toEqual([]);
    expect(log.typesetting).toEqual([]);
  });

  it("comando inexistente: archivo, línea y contexto", () => {
    const { errors } = parseLatexLog(errorUndefined);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: "Undefined control sequence.",
      file: "main.tex",
      line: 4,
    });
    expect(errors[0].context[0]).toBe("l.4 \\comandoinexistente");
  });

  it("llave sin cerrar: error sin número de línea en el archivo que se leía", () => {
    const { errors } = parseLatexLog(errorBraces);
    expect(errors.map((e) => e.message)).toEqual(["File ended while scanning use of \\textbf ."]);
    expect(errors[0].file).toBe("main.tex");
    expect(errors[0].line).toBeNull();
  });

  it("paquete faltante: marcado como missingFile y sin errores derivados", () => {
    const { errors } = parseLatexLog(missingSty);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      kind: "missingFile",
      missingFile: "paquetequenoexiste.sty",
      file: "main.tex",
    });
  });

  it("varios archivos: el error del capítulo apunta a su archivo", () => {
    const { errors } = parseLatexLog(multifile);
    expect(errors.map((e) => [e.file, e.line, e.message])).toEqual([
      ["capitulos/uno.tex", 3, "Undefined control sequence."],
      ["main.tex", 5, "LaTeX Error: File `figura-inexistente' not found."],
    ]);
    expect(errors[1].kind).toBe("missingFile");
  });

  it("XeLaTeX con babel: referencias y citas sin definir, avisos de paquete y cajas", () => {
    const { errors, warnings, typesetting } = parseLatexLog(xelatexBabel);
    expect(errors).toEqual([]);

    const reference = warnings.find((w) => w.kind === "undefinedReference");
    expect(reference).toMatchObject({
      message: "Reference `sec:noexiste' on page 1 undefined",
      file: "main.tex",
      line: 7,
    });
    expect(warnings.find((w) => w.kind === "undefinedCitation")?.message).toBe(
      "Citation `nadie2026' on page 1 undefined",
    );
    const hyperref = warnings.find((w) => w.source === "hyperref");
    expect(hyperref).toMatchObject({
      message: "Token not allowed in a PDF string (Unicode): removing `math shift'",
      line: 6,
      file: "main.tex",
    });
    expect(warnings.some((w) => /There were undefined/.test(w.message))).toBe(false);

    expect(typesetting.map((t) => [t.message.split(" (")[0], t.line, t.file])).toEqual([
      ["Overfull \\hbox", 9, "main.tex"],
      ["Underfull \\hbox", 11, "main.tex"],
    ]);
  });
});

/** The same sources compiled with MiKTeX 25.12 on Windows: distribution files open as
 * `(C:\Users\…\MiKTeX\tex/latex/base\article.cls`, mixing both separators (user name replaced
 * by one of the same length, so the lines wrap as TeX wrote them). */
describe("parseLatexLog (logs reales de MiKTeX en Windows)", () => {
  it("varios archivos: el error del capítulo apunta a su archivo", () => {
    const { errors } = parseLatexLog(miktexMultifile);
    expect(errors.map((e) => [e.file, e.line, e.message])).toEqual([
      ["capitulos/uno.tex", 3, "Undefined control sequence."],
      ["main.tex", 5, "LaTeX Error: File `figura-inexistente' not found."],
    ]);
    expect(errors[1].kind).toBe("missingFile");
  });

  it("paquete faltante: marcado como missingFile y sin errores derivados", () => {
    const { errors } = parseLatexLog(miktexMissingSty);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      kind: "missingFile",
      missingFile: "paquetequenoexiste.sty",
      file: "main.tex",
    });
  });

  it("XeLaTeX con babel: los avisos van a main.tex, no a un archivo de la distribución", () => {
    const { errors, warnings, typesetting } = parseLatexLog(miktexXelatexBabel);
    expect(errors).toEqual([]);
    expect(warnings.find((w) => w.kind === "undefinedReference")).toMatchObject({
      message: "Reference `sec:noexiste' on page 1 undefined",
      file: "main.tex",
      line: 7,
    });
    expect(warnings.find((w) => w.kind === "undefinedCitation")?.file).toBe("main.tex");
    expect(typesetting.map((t) => [t.message.split(" (")[0], t.line, t.file])).toEqual([
      ["Overfull \\hbox", 9, "main.tex"],
      ["Underfull \\hbox", 11, "main.tex"],
    ]);
  });

  it("con finales de línea CRLF da lo mismo", () => {
    for (const log of [miktexMultifile, miktexXelatexBabel, xelatexBabel]) {
      expect(parseLatexLog(log.replace(/\n/g, "\r\n"))).toEqual(parseLatexLog(log));
    }
  });
});

describe("parseLatexLog (casos sintéticos)", () => {
  it("los paréntesis de los mensajes no rompen la pila de archivos", () => {
    const log = [
      "(./main.tex",
      "Overfull \\hbox (10.0pt too wide) in paragraph at lines 3--4",
      "[]",
      "",
      "(./caps/uno.tex (/usr/share/texmf-dist/tex/latex/base/x.sty)",
      "LaTeX Warning: Reference `a' on page 1 undefined on input line 2.",
      "",
      ")",
      "LaTeX Warning: Citation `b' on page 1 undefined on input line 9.",
      ")",
    ].join("\n");
    const { warnings, typesetting } = parseLatexLog(log);
    expect(typesetting[0].file).toBe("main.tex");
    expect(warnings.map((w) => [w.file, w.line])).toEqual([
      ["caps/uno.tex", 2],
      ["main.tex", 9],
    ]);
  });

  it("si solo hay un error fatal se conserva", () => {
    const { errors } = parseLatexLog("!  ==> Fatal error occurred, no output PDF file produced!");
    expect(errors).toHaveLength(1);
  });
});
