import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  argumentContext,
  labelsIn,
  projectCompletionSource,
  type CompletionData,
} from "./completion";

describe("argumentContext", () => {
  it("detecta el argumento de \\ref y \\cite", () => {
    expect(argumentContext("ver \\ref{sec:")).toEqual({ kind: "ref", from: 9, prefix: "sec:" });
    expect(argumentContext("\\eqref{")).toEqual({ kind: "ref", from: 7, prefix: "" });
    expect(argumentContext("\\cite{knuth, ein")).toEqual({ kind: "cite", from: 13, prefix: "ein" });
    expect(argumentContext("\\citep[p.~3]{a")).toEqual({ kind: "cite", from: 13, prefix: "a" });
  });

  it("rutas en \\includegraphics con opciones e \\input", () => {
    expect(argumentContext("\\includegraphics[width=3cm]{fig/a")).toEqual({
      kind: "graphics",
      from: 28,
      prefix: "fig/a",
    });
    expect(argumentContext("\\input{cap")?.kind).toBe("input");
  });

  it("nada fuera de un argumento o en comandos desconocidos", () => {
    expect(argumentContext("\\ref{a} y")).toBeNull();
    expect(argumentContext("\\textbf{x")).toBeNull();
    expect(argumentContext("hola")).toBeNull();
  });
});

describe("labelsIn", () => {
  it("ignora etiquetas comentadas", () => {
    expect(labelsIn("\\label{a}\n% \\label{b}\n50\\% \\label{c}")).toEqual(["a", "c"]);
  });
});

describe("projectCompletionSource", () => {
  const data: CompletionData = {
    labels: () => [{ key: "sec:intro", file: "main.tex", line: 3 }],
    citations: () => [{ key: "knuth1984", kind: "book", title: "The TeXbook" }],
    files: () => ["main.tex", "caps/uno.tex", "fig/a.png", "refs.bib", "notas.txt"],
    describe: { label: (file, line) => `${file}:${line}` },
  };
  const source = projectCompletionSource(data);

  function complete(doc: string) {
    const state = EditorState.create({ doc });
    return source(new CompletionContext(state, doc.length, true));
  }

  it("\\ref ofrece etiquetas del proyecto y del documento abierto", () => {
    const result = complete("\\label{eq:nueva}\n\\ref{");
    expect(result?.options.map((o) => [o.label, o.detail])).toEqual([
      ["sec:intro", "main.tex:3"],
      ["eq:nueva", undefined],
    ]);
  });

  it("\\cite ofrece las claves con su título", () => {
    expect(complete("\\cite{")?.options[0]).toMatchObject({
      label: "knuth1984",
      detail: "The TeXbook",
    });
  });

  it("rutas según el comando", () => {
    expect(complete("\\includegraphics{")?.options.map((o) => o.label)).toEqual(["fig/a.png"]);
    expect(complete("\\input{")?.options.map((o) => o.label)).toEqual(["main", "caps/uno"]);
    expect(complete("\\bibliography{")?.options.map((o) => o.label)).toEqual(["refs"]);
    expect(complete("\\addbibresource{")?.options.map((o) => o.label)).toEqual(["refs.bib"]);
  });
});
