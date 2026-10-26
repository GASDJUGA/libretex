import {
  acceptCompletion,
  completionStatus,
  currentCompletions,
  startCompletion,
} from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectEnvironments,
  extractEnvironments,
  specArguments,
} from "../lib/macros/environments";
import type { PackageDefinition } from "../store/types";
import { completionProject, resetCompletionUsage } from "./completionUsage";
import { environmentSource, packageCommandSource } from "./latexCompletion";
import { COMPLETION_INTERACTION_DELAY_MS } from "./mathTab";
import { editorExtensions } from "./setup";

/** As in the user's notes of electromagnetism. */
const PREAMBLE = String.raw`\usepackage[most,theorems]{tcolorbox}
% ==== tcolorboxes personalizados ====
\newtcbtheorem[number within=chapter]{ejemplo}{Ejemplo}{
  colback=blue!5, colframe=blue!50!black, fonttitle=\bfseries
}{ej}
\newtcolorbox{definicion}{
  colback=green!5, colframe=green!40!black
}
\newtcolorbox{caja}[2][]{title=#2, #1}
% \newtcolorbox{comentada}{}
\NewDocumentEnvironment{nota}{ O{} m }{}{}
\newenvironment{prueba}[1][Demostración]{}{}
\newtheorem{teorema}{Teorema}
`;

const DEFINITIONS: PackageDefinition[] = [
  { name: "hslash", kind: "command", args: 0, math: true, package: "amssymb" },
  { name: "mathbb", kind: "command", args: 1, math: true, package: "amsfonts" },
  { name: "tcbset", kind: "command", args: 1, math: false, package: "tcolorbox" },
  { name: "tcolorbox", kind: "environment", args: 0, math: false, package: "tcolorbox" },
  // Known by the language: not repeated.
  { name: "align", kind: "environment", args: 0, math: false, package: "amsmath" },
  { name: "frac", kind: "command", args: 2, math: true, package: "amsmath" },
];

let view: EditorView | null = null;
beforeEach(() => {
  resetCompletionUsage();
  localStorage.clear();
});
afterEach(() => {
  view?.destroy();
  view = null;
});

function editor(doc: string) {
  const cursor = doc.indexOf("|");
  view = new EditorView({
    state: EditorState.create({
      doc: doc.replace("|", ""),
      selection: { anchor: cursor },
      extensions: [
        completionProject.of("proyecto"),
        editorExtensions(
          { onChange() {}, onCursorLine() {}, onSave() {} },
          [],
          [
            packageCommandSource(
              () => new Set(["amssymb", "tcolorbox"]),
              () => DEFINITIONS,
            ),
            environmentSource(
              () => extractEnvironments(PREAMBLE),
              () => DEFINITIONS,
              () => "entorno del documento",
            ),
          ],
        ),
      ],
    }),
    parent: document.body,
  });
  return view;
}

async function list(v: EditorView) {
  startCompletion(v);
  await waitFor(() => expect(completionStatus(v.state)).toBe("active"));
  return currentCompletions(v.state);
}

async function accept(v: EditorView) {
  await new Promise((r) => setTimeout(r, COMPLETION_INTERACTION_DELAY_MS + 5));
  acceptCompletion(v);
}

describe("entornos del preámbulo", () => {
  it("tcolorbox, tcbtheorem (con y sin número), newenvironment, xparse y teoremas", () => {
    expect(extractEnvironments(PREAMBLE)).toEqual([
      { name: "ejemplo", args: 2 },
      { name: "ejemplo*", args: 1 },
      { name: "definicion", args: 0 },
      { name: "caja", args: 1 },
      { name: "nota", args: 1 },
      { name: "prueba", args: 0 },
      { name: "teorema", args: 0 },
    ]);
    expect(specArguments("O{} m m")).toBe(2);
    expect(specArguments("s t\\big d() m")).toBe(1);
  });

  it("también los de archivos incluidos en el preámbulo", () => {
    const files: Record<string, string> = {
      "main.tex": "\\input{estilo}\n\\begin{document}\\newtcolorbox{tarde}{}",
      "estilo.tex": "\\newtcolorbox{resultado}{}",
    };
    expect(collectEnvironments("main.tex", (p) => files[p] ?? null)).toEqual([
      { name: "resultado", args: 0 },
    ]);
  });

  it("\\begin{ej… sugiere el propio y lo inserta con sus argumentos y su \\end", async () => {
    const v = editor("\\begin{document}\n\\begin{ej|}\n\\end{document}");
    const options = await list(v);
    expect(options[0].label).toBe("ejemplo");
    expect(options[0].detail).toBe("entorno del documento");
    expect(options.map((o) => o.label)).toContain("ejemplo*");
    await accept(v);
    const doc = v.state.doc.toString();
    expect(doc).toBe(
      "\\begin{document}\n\\begin{ejemplo}{}{}\n  \n\\end{ejemplo}\n\\end{document}",
    );
    // The cursor in the title, the first field.
    expect(v.state.selection.main.head).toBe(doc.indexOf("{}{}") + 1);
  });

  it("\\begin{def… y el entorno tcolorbox del paquete", async () => {
    let v = editor("\\begin{document}\n\\begin{def|}\n\\end{document}");
    expect((await list(v)).map((o) => o.label)).toContain("definicion");
    v.destroy();
    v = editor("\\begin{document}\n\\begin{tcol|}\n\\end{document}");
    const options = await list(v);
    expect(options[0].label).toBe("tcolorbox");
    expect(options[0].detail).toBe("tcolorbox");
    // `align` is the language's: it is not offered twice.
    v.destroy();
    v = editor("\\begin{document}\n\\begin{alig|}\n\\end{document}");
    expect((await list(v)).filter((o) => o.label === "align")).toHaveLength(1);
  });
});

describe("comandos leídos de los paquetes", () => {
  it("\\hslash de amssymb en matemáticas", async () => {
    const v = editor("\\begin{document}\n$E = \\hsl|$\n\\end{document}");
    const options = await list(v);
    expect(options[0].label).toBe("\\hslash");
    expect(options[0].detail).toBe("amssymb");
    await accept(v);
    expect(v.state.doc.toString()).toContain("$E = \\hslash$");
  });

  it("con su argumento y sin repetir los que ya conoce el lenguaje", async () => {
    const v = editor("\\begin{document}\n$\\mathb|$\n\\end{document}");
    const options = await list(v);
    expect(options.filter((o) => o.label === "\\mathbb")).toHaveLength(1);
    v.destroy();
    const w = editor("\\begin{document}\n\\tcbse|\n\\end{document}");
    expect((await list(w))[0].label).toBe("\\tcbset");
    await accept(w);
    expect(w.state.doc.toString()).toContain("\\tcbset{}");
    expect(w.state.sliceDoc(w.state.selection.main.head - 1, w.state.selection.main.head + 1)).toBe(
      "{}",
    );
  });
});
