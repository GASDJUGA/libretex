import { describe, expect, it } from "vitest";
import {
  buildOutline,
  currentHeading,
  hasChildren,
  headingKeys,
  parseStructure,
  resolveInclude,
  shownAs,
  type Heading,
} from "./outline";

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

describe("colapsar el esquema", () => {
  const h = (level: number, title: string, line: number, file = "main.tex"): Heading => ({
    level,
    title,
    line,
    file,
  });
  const headings = [
    h(1, "Uno", 1),
    h(2, "Intro", 2),
    h(3, "Detalle", 3),
    h(2, "Intro", 4),
    h(1, "Dos", 5),
    h(2, "Intro", 6),
  ];
  const keys = headingKeys(headings);

  it("las claves no dependen de la línea y distinguen títulos repetidos", () => {
    expect(new Set(keys).size).toBe(headings.length);
    const moved = headingKeys(headings.map((x) => ({ ...x, line: x.line + 10 })));
    expect(moved).toEqual(keys);
  });

  it("sabe qué títulos tienen subsecciones", () => {
    expect(headings.map((_, i) => hasChildren(headings, i))).toEqual([
      true,
      true,
      false,
      false,
      true,
      false,
    ]);
  });

  it("lo que queda dentro de un título colapsado se muestra como ese título", () => {
    expect(shownAs(headings, keys, new Set())).toEqual([0, 1, 2, 3, 4, 5]);
    expect(shownAs(headings, keys, new Set([keys[0]]))).toEqual([0, 0, 0, 0, 4, 5]);
    expect(shownAs(headings, keys, new Set([keys[1]]))).toEqual([0, 1, 1, 3, 4, 5]);
    // A collapsed heading inside another collapsed one stays hidden by the outer one.
    expect(shownAs(headings, keys, new Set([keys[0], keys[1]]))).toEqual([0, 0, 0, 0, 4, 5]);
    // Collapsing a heading without subsections hides nothing.
    expect(shownAs(headings, keys, new Set([keys[2], keys[5]]))).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
