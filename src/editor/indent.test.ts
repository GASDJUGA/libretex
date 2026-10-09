import { getIndentation } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { latex } from "codemirror-lang-latex";
import { describe, expect, it } from "vitest";
import type { IndentMode } from "../store/settings";
import { indentation } from "./indent";

/** Indentation for a new line at the end of `doc`. */
const indentAfter = (doc: string, mode: IndentMode) =>
  getIndentation(EditorState.create({ doc, extensions: [latex(), indentation(mode)] }), doc.length);

const doc = "\\begin{document}\n";

describe("sangría automática", () => {
  it("«solo en entornos»: nada bajo secciones ni en document; sí en entornos", () => {
    expect(indentAfter(doc, "environments")).toBe(0);
    expect(indentAfter(`${doc}\\section{A}\n`, "environments")).toBe(0);
    expect(indentAfter(`${doc}\\section{A}\ntexto\n\\subsection{B}\n`, "environments")).toBe(0);
    expect(indentAfter(`${doc}\\begin{itemize}\n`, "environments")).toBe(2);
    expect(indentAfter(`${doc}\\section{A}\n\\begin{equation}\n`, "environments")).toBe(2);
  });

  it("«solo en entornos» respeta la sangría que ya tiene el texto", () => {
    expect(indentAfter(`${doc}\\section{A}\n    texto con sangría\n`, "environments")).toBe(4);
  });

  it("«también en secciones» es el comportamiento de la gramática", () => {
    expect(indentAfter(`${doc}\\section{A}\n`, "full")).toBe(2);
  });

  it("«desactivada» copia la línea anterior también en entornos", () => {
    expect(indentAfter(`${doc}\\begin{itemize}\n`, "none")).toBe(0);
    expect(indentAfter(`${doc}  \\item a\n`, "none")).toBe(2);
  });
});
