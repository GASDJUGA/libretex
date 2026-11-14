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
import { collectPackages, extractPackages } from "../lib/macros/extract";
import { completionProject, recordCompletion, resetCompletionUsage } from "./completionUsage";
import { packageCommandSource } from "./latexCompletion";
import { COMPLETION_INTERACTION_DELAY_MS } from "./mathTab";
import { commandSnippet, PACKAGE_COMMANDS } from "./packageCommands";
import { editorExtensions } from "./setup";

let view: EditorView | null = null;
beforeEach(() => {
  resetCompletionUsage();
  localStorage.clear();
});
afterEach(() => {
  view?.destroy();
  view = null;
});

/** An editor like the app's, with `packages` loaded, `doc` and the cursor at `|`. */
function editor(doc: string, packages: string[] = []) {
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
          [packageCommandSource(() => new Set(packages))],
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
  return currentCompletions(v.state).map((c) => c.label);
}

async function accept(v: EditorView) {
  await new Promise((r) => setTimeout(r, COMPLETION_INTERACTION_DELAY_MS + 5));
  acceptCompletion(v);
}

describe("paquetes del preámbulo", () => {
  it("lee los \\usepackage, también varios a la vez y con opciones, sin comentarios", () => {
    expect(
      extractPackages(
        "\\usepackage[utf8]{inputenc}\n\\usepackage{amsmath, physics}\n% \\usepackage{tikz}\n\\RequirePackage{siunitx}",
      ),
    ).toEqual(["inputenc", "amsmath", "physics", "siunitx"]);
    const files: Record<string, string> = {
      "main.tex": "\\usepackage{xcolor}\n\\input{preambulo}\n\\begin{document}\\usepackage{nada}",
      "preambulo.tex": "\\usepackage{braket}",
    };
    expect([...collectPackages("main.tex", (p) => files[p] ?? null)]).toEqual(["xcolor", "braket"]);
  });

  it("plantilla con un campo por argumento", () => {
    expect(commandSnippet("\\braket{}{}")).toBe("\\braket{${1}}{${2}}");
    expect(commandSnippet("\\hyperref[]{}")).toBe("\\hyperref[${1}]{${2}}");
    expect(commandSnippet("\\cross")).toBe("\\cross");
    expect(PACKAGE_COMMANDS.get("physics")?.some((c) => c.label === "\\ket")).toBe(true);
  });
});

describe("autocompletado de comandos de paquetes", () => {
  it("con physics cargado ofrece \\ket y \\braket con sus llaves", async () => {
    const v = editor("$\\ke|$", ["physics"]);
    expect((await list(v))[0]).toBe("\\ket");
    await accept(v);
    expect(v.state.doc.toString()).toBe("$\\ket{}$");
    expect(v.state.selection.main.head).toBe("$\\ket{".length);

    const w = editor("$\\brak|$", ["physics"]);
    expect((await list(w))[0]).toBe("\\braket");
    await accept(w);
    expect(w.state.doc.toString()).toBe("$\\braket{}{}$");
  });

  it("sin el paquete no aparecen sus comandos", async () => {
    const v = editor("$\\ke|$");
    expect(await list(v).catch(() => [])).not.toContain("\\ket");
  });
});

describe("\\begin en matemáticas", () => {
  it("primero \\begin solo, antes que los atajos \\begin{align}", async () => {
    expect((await list(editor("\\[ \\beg| \\]")))[0]).toBe("\\begin");
  });

  it("dentro de \\begin{…} en una fórmula, primero los entornos de fórmulas", async () => {
    const labels = await list(editor("\\[ \\begin{|} \\]"));
    expect([
      "aligned",
      "cases",
      "pmatrix",
      "bmatrix",
      "matrix",
      "array",
      "gathered",
      "split",
    ]).toContain(labels[0]);
    expect(labels.indexOf("abstract")).toBeGreaterThan(5);
  });
});

describe("memoria de los autocompletados elegidos", () => {
  it("lo que se elige más sube en la lista del proyecto", async () => {
    const before = await list(editor("\\tex|"));
    const target = "\\textsc";
    expect(before.indexOf(target)).toBeGreaterThan(0);
    for (let i = 0; i < 4; i++) recordCompletion("proyecto", target);
    const after = await list(editor("\\tex|"));
    expect(after.indexOf(target)).toBeLessThan(before.indexOf(target));
    expect(after[0]).toBe(target);
  });

  it("aceptar un autocompletado lo cuenta y se recuerda", async () => {
    const v = editor("\\textsc|");
    await list(v);
    await accept(v);
    await new Promise((r) => setTimeout(r, 1100));
    const stored = JSON.parse(localStorage.getItem("jutex:proyecto:completions") ?? "{}");
    expect(stored["\\textsc"]).toBe(1);
  });
});
