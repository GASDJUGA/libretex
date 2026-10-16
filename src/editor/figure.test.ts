import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { figureSpec } from "./figure";

const apply = (doc: string, from: number, to: number, typed: string) => {
  const state = EditorState.create({ doc });
  const spec = figureSpec(state, from, to, typed)!;
  const next = state.update(spec).state;
  return { text: next.doc.toString(), cursor: next.selection.main.head };
};

const MAIN = [
  "\\documentclass{article}",
  "\\usepackage{fontspec}",
  "\\begin{document}",
  "  \\begin{figure|}",
  "\\end{document}",
].join("\n");

describe("figura completa al escribir \\begin{figure}", () => {
  it("cuerpo para incluir una imagen, con la sangría de la línea y el cursor en la ruta", () => {
    const doc = MAIN.replace("|", "");
    const at = MAIN.indexOf("|");
    const { text, cursor } = apply(doc, at, at + 1, "");
    expect(text).toContain(
      [
        "  \\begin{figure}[htbp]",
        "    \\centering",
        "    \\includegraphics[width=0.8\\linewidth]{}",
        "    \\caption{}",
        "    \\label{fig:}",
        "  \\end{figure}",
      ].join("\n"),
    );
    expect(text.slice(cursor - "\\linewidth]{".length, cursor + 1)).toBe("\\linewidth]{}");
  });

  it("agrega graphicx al preámbulo si no está", () => {
    const doc = MAIN.replace("|", "");
    const at = MAIN.indexOf("|");
    const { text, cursor } = apply(doc, at, at + 1, "");
    expect(text.split("\n")[2]).toBe("\\usepackage{graphicx}");
    expect(text.slice(cursor - 1, cursor + 1)).toBe("{}");
    // Already loaded (also in a list): not repeated.
    const loaded = doc.replace("{fontspec}", "{fontspec, graphicx}");
    const again = apply(loaded, at + 10, at + 11, "");
    expect(again.text.match(/graphicx/g)).toHaveLength(1);
  });

  it("en un archivo incluido (sin preámbulo) solo la figura", () => {
    const doc = "\\section{A}\n\\begin{figure";
    const { text } = apply(doc, doc.length, doc.length, "");
    expect(text).not.toContain("graphicx");
    expect(text).toContain("\\end{figure}");
  });

  it("desde la lista de entornos: reemplaza lo escrito del nombre, también figure*", () => {
    const doc = "\\begin{fig}";
    const from = "\\begin{".length;
    const { text } = apply(doc, from, doc.length, "figure*");
    expect(text).toMatch(/^\\begin\{figure\*\}\[htbp\]\n/);
    expect(text.endsWith("\\end{figure*}")).toBe(true);
  });

  it("solo para figure", () => {
    const state = EditorState.create({ doc: "\\begin{table" });
    expect(figureSpec(state, 12, 12, "")).toBeNull();
  });
});
