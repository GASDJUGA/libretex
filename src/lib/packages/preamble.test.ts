import { describe, expect, it } from "vitest";
import { addToPreamble, loadsPackage, packageToLoad } from "./preamble";

const main = [
  "\\documentclass{article}",
  "\\usepackage{fontspec}",
  "\\usepackage[spanish]{babel}",
  "% \\usepackage{physics}",
  "\\newcommand{\\R}{\\mathbb{R}}",
  "\\begin{document}",
  "Hola",
  "\\end{document}",
].join("\n");

describe("agregar al preámbulo", () => {
  it("nombre para \\usepackage", () => {
    expect(packageToLoad({ name: "physics", styles: ["physics.sty"] })).toBe("physics");
    expect(packageToLoad({ name: "pgf", styles: ["tikz.sty", "pgf.sty"] })).toBe("pgf");
    expect(packageToLoad({ name: "pgf-blur", styles: ["tikzlibraryfadings.code.tex"] })).toBe(
      "pgf-blur",
    );
    expect(packageToLoad({ name: "ctex", styles: ["ctexart.cls", "ctex.sty"] })).toBe("ctex");
    expect(packageToLoad({ name: "tools", styles: ["array.sty", "calc.sty"] })).toBe("array");
  });

  it("se agrega tras el último \\usepackage (los comentados no cuentan)", () => {
    const edit = addToPreamble(main, "physics");
    expect(edit.kind).toBe("added");
    if (edit.kind !== "added") return;
    expect(edit.line).toBe(4);
    expect(edit.text.split("\n")[3]).toBe("\\usepackage{physics}");
    expect(edit.text.split("\n")[4]).toBe("% \\usepackage{physics}");
  });

  it("si ya está (también en una lista) no se repite", () => {
    expect(addToPreamble(main, "babel")).toEqual({ kind: "already" });
    expect(loadsPackage("\\usepackage{amsmath, amssymb}", "amssymb")).toBe(true);
    expect(loadsPackage("\\usepackage{amsmath}", "amssymb")).toBe(false);
  });

  it("sin \\usepackage va antes de \\begin{document}; sin documento, nada", () => {
    const edit = addToPreamble("\\documentclass{article}\n\\begin{document}\nx", "physics");
    expect(edit).toEqual({
      kind: "added",
      text: "\\documentclass{article}\n\\usepackage{physics}\n\\begin{document}\nx",
      line: 2,
    });
    expect(addToPreamble("\\section{Capítulo}", "physics")).toEqual({ kind: "noPreamble" });
  });
});
