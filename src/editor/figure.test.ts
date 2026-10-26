import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { figureSpec, imageSpec } from "./figure";

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

/** `doc` with `|` as the cursor, after pasting the image saved at `path`. */
const paste = (doc: string, path: string) => {
  const state = EditorState.create({
    doc: doc.replace("|", ""),
    selection: { anchor: doc.indexOf("|") },
  });
  const next = state.update(imageSpec(state, path)).state;
  const text = next.doc.toString();
  const at = next.selection.main.head;
  return `${text.slice(0, at)}|${text.slice(at)}`;
};

describe("pegar una imagen", () => {
  it("en una línea vacía: la figura completa con su ruta y etiqueta, cursor en el título", () => {
    const doc = ["\\documentclass{article}", "\\begin{document}", "  |", "\\end{document}"].join(
      "\n",
    );
    expect(paste(doc, "figuras/diagrama-espin.png")).toBe(
      [
        "\\documentclass{article}",
        "\\usepackage{graphicx}",
        "\\begin{document}",
        "  \\begin{figure}[htbp]",
        "    \\centering",
        "    \\includegraphics[width=0.8\\linewidth]{figuras/diagrama-espin.png}",
        "    \\caption{|}",
        "    \\label{fig:diagrama-espin}",
        "  \\end{figure}",
        "\\end{document}",
      ].join("\n"),
    );
  });

  it("en medio de un párrafo: la figura va en la línea siguiente", () => {
    expect(paste("Como se ve| en la figura.", "a.jpg")).toBe(
      [
        "Como se ve en la figura.",
        "\\begin{figure}[htbp]",
        "  \\centering",
        "  \\includegraphics[width=0.8\\linewidth]{a.jpg}",
        "  \\caption{|}",
        "  \\label{fig:a}",
        "\\end{figure}",
      ].join("\n"),
    );
  });

  it("dentro de una figura: solo \\includegraphics", () => {
    const doc = "\\begin{figure}\n  \\centering\n  |\n\\end{figure}\n\\begin{figure}\\end{figure}";
    expect(paste(doc, "b.png")).toBe(
      "\\begin{figure}\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{b.png}|\n\\end{figure}\n\\begin{figure}\\end{figure}",
    );
    // After a closed figure, a new one.
    expect(paste("\\begin{figure}\\end{figure}\n|", "c.png")).toContain("\\label{fig:c}");
  });
});
