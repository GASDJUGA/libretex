import { describe, expect, it } from "vitest";
import { buildOutline, currentHeading, parseStructure, resolveInclude } from "./outline";

describe("parseStructure", () => {
  it("títulos con asterisco, título corto, llaves anidadas e ignora comentarios", () => {
    const text = [
      "\\chapter{Intro}",
      "\\section*{Sin número}",
      "\\section[Corto]{Un título \\textbf{largo}}",
      "% \\section{Comentado}",
      "50\\% \\subsection{Después de 50\\%}",
      "\\input{capitulos/uno}",
    ].join("\n");
    const { headings, includes } = parseStructure(text, "main.tex");
    expect(headings.map((h) => [h.level, h.title, h.line])).toEqual([
      [1, "Intro", 1],
      [2, "Sin número", 2],
      [2, "Un título \\textbf{largo}", 3],
      [3, "Después de 50\\%", 5],
    ]);
    expect(includes).toEqual([{ target: "capitulos/uno", line: 6 }]);
  });

  it("ignora llaves sin cerrar", () => {
    expect(parseStructure("\\section{Abierto", "a.tex").headings).toEqual([]);
  });
});

describe("resolveInclude", () => {
  it("agrega .tex si no hay extensión", () => {
    expect(resolveInclude("caps/uno")).toBe("caps/uno.tex");
    expect(resolveInclude("./caps/uno.tex")).toBe("caps/uno.tex");
  });
});

describe("buildOutline", () => {
  const files: Record<string, string> = {
    "main.tex": "\\section{A}\n\\input{caps/b}\n\\section{C}\n\\include{bucle}",
    "caps/b.tex": "\\subsection{B1}\n\\subsection{B2}",
    "bucle.tex": "\\section{Bucle}\n\\input{main}",
  };

  it("inserta los títulos de los archivos incluidos en su lugar y evita bucles", () => {
    const { headings, pending } = buildOutline("main.tex", (p) => files[p]);
    expect(headings.map((h) => `${h.file}:${h.title}`)).toEqual([
      "main.tex:A",
      "caps/b.tex:B1",
      "caps/b.tex:B2",
      "main.tex:C",
      "bucle.tex:Bucle",
    ]);
    expect(pending).toEqual([]);
  });

  it("informa los archivos aún no cargados", () => {
    const { pending } = buildOutline("main.tex", (p) => (p === "main.tex" ? files[p] : undefined));
    expect(pending).toEqual(["caps/b.tex", "bucle.tex"]);
  });

  it("la sección actual es la última antes del cursor en el archivo activo", () => {
    const { headings } = buildOutline("main.tex", (p) => files[p]);
    expect(currentHeading(headings, "main.tex", 1)).toBe(0);
    expect(currentHeading(headings, "main.tex", 2)).toBe(0);
    expect(currentHeading(headings, "main.tex", 3)).toBe(3);
    expect(currentHeading(headings, "caps/b.tex", 2)).toBe(2);
  });
});
