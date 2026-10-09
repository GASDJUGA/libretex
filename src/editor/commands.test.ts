import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  bold,
  bulletList,
  displayMath,
  headingAt,
  inlineMath,
  insertSymbol,
  link,
  setHeading,
  table,
  type EditCommand,
} from "./commands";

/** Applies a command to `doc`, where `[` `]` mark the selection (or `|` the cursor). */
function apply(command: EditCommand, marked: string) {
  const from = marked.search(/[|[]/);
  const clean = marked.replace(/[|[\]]/g, "");
  const to = marked.includes("]") ? marked.indexOf("]") - 1 : from;
  const state = EditorState.create({
    doc: clean,
    selection: EditorSelection.range(from, to),
    extensions: EditorState.allowMultipleSelections.of(true),
  });
  const spec = command(state);
  const next = state.update(spec!).state;
  const { from: f, to: t } = next.selection.main;
  const doc = next.doc.toString();
  return f === t
    ? doc.slice(0, f) + "|" + doc.slice(f)
    : doc.slice(0, f) + "[" + doc.slice(f, t) + "]" + doc.slice(t);
}

describe("comandos del editor", () => {
  it("negrita envuelve la selección o deja el cursor dentro", () => {
    expect(apply(bold, "hola [mundo]")).toBe("hola \\textbf{[mundo]}");
    expect(apply(bold, "hola |")).toBe("hola \\textbf{|}");
  });

  it("aplicar de nuevo quita el formato", () => {
    expect(apply(bold, "hola \\textbf{[mundo]}")).toBe("hola [mundo]");
  });

  it("matemática en línea", () => {
    expect(apply(inlineMath, "sea [x^2] par")).toBe("sea $[x^2]$ par");
  });

  it("matemática destacada en líneas propias, con sangría", () => {
    expect(apply(displayMath, "  texto |")).toBe("  texto \n  \\[\n    |\n  \\]");
    expect(apply(displayMath, "|")).toBe("\\[\n  |\n\\]");
  });

  it("listas con el cursor en el primer \\item", () => {
    expect(apply(bulletList, "|")).toBe("\\begin{itemize}\n  \\item |\n\\end{itemize}");
  });

  it("enlace: la selección es el texto y el cursor va a la URL", () => {
    expect(apply(link, "ver [la web]")).toBe("ver \\href{|}{la web}");
  });

  it("tabla de filas × columnas con el cursor en la primera celda", () => {
    const result = apply(table(2, 3), "|");
    expect(result).toContain("\\begin{tabular}{|c|c|c|}");
    expect(result.match(/ & {2}& {2}\\\\ \\hline/g)).toHaveLength(2);
    expect(result).toContain("    | &  & ");
  });

  it("nivel de título: aplica, cambia y quita", () => {
    expect(apply(setHeading("section"), "Introducción|")).toBe("\\section{Introducción|}");
    expect(apply(setHeading("subsection"), "\\section{Intro|}")).toBe("\\subsection{Intro|}");
    expect(apply(setHeading("normal"), "  \\section*{Intro|}")).toBe("  Intro|");
  });

  it("detecta el nivel de título de la línea", () => {
    const state = EditorState.create({ doc: "\\subsection{X}\ntexto", selection: { anchor: 3 } });
    expect(headingAt(state)).toBe("subsection");
    expect(headingAt(state.update({ selection: { anchor: 16 } }).state)).toBe("normal");
  });

  it("símbolos: agrega un espacio solo si sigue una letra", () => {
    expect(apply(insertSymbol("\\alpha"), "$|$")).toBe("$\\alpha|$");
    expect(apply(insertSymbol("\\alpha"), "$|x$")).toBe("$\\alpha |x$");
  });
});
