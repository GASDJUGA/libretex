import {
  acceptCompletion,
  completionStatus,
  currentCompletions,
  startCompletion,
} from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MathJaxMacros } from "../lib/macros/extract";
import { commandTemplate, userCommandSource } from "./latexCompletion";
import { COMPLETION_INTERACTION_DELAY_MS } from "./mathTab";
import { editorExtensions } from "./setup";

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

const macros: MathJaxMacros = {
  pvec: ["\\vec{#1}\\mkern2mu\\vphantom{#1}", 1],
  ihat: "\\boldsymbol{\\hat{\\textbf{\\i}}}",
  pair: ["(#1, #2)", 2, "x"],
};

/** An editor like the app's, with `doc` and the cursor at `|`. */
function editor(doc: string) {
  const cursor = doc.indexOf("|");
  view = new EditorView({
    state: EditorState.create({
      doc: doc.replace("|", ""),
      selection: { anchor: cursor },
      extensions: editorExtensions(
        { onChange() {}, onCursorLine() {}, onSave() {} },
        [],
        [
          userCommandSource(
            () => macros,
            () => "comando del documento",
          ),
        ],
      ),
    }),
    parent: document.body,
  });
  return view;
}

const tab = (v: EditorView) =>
  runScopeHandlers(v, new KeyboardEvent("keydown", { key: "Tab" }), "editor");

const text = (v: EditorView) => v.state.doc.toString();

describe("autocompletado de LaTeX", () => {
  it("plantilla de los comandos del usuario: un campo por argumento obligatorio", () => {
    expect(commandTemplate("ihat", macros.ihat)).toBe("\\ihat");
    expect(commandTemplate("pvec", macros.pvec)).toBe("\\pvec{${1}}");
    // With an optional first argument, only the mandatory ones get braces.
    expect(commandTemplate("pair", macros.pair)).toBe("\\pair{${1}}");
  });

  it("sugiere los comandos del documento y los inserta con sus llaves", async () => {
    const v = editor("$\\pv|$");
    startCompletion(v);
    await waitFor(() => expect(completionStatus(v.state)).toBe("active"));
    const first = currentCompletions(v.state)[0];
    expect(first.label).toBe("\\pvec");
    expect(first.detail).toBe("comando del documento");
    // CodeMirror ignores accepting right after the list appears.
    await new Promise((r) => setTimeout(r, COMPLETION_INTERACTION_DELAY_MS + 5));
    acceptCompletion(v);
    expect(text(v)).toBe("$\\pvec{}$");
    // The cursor inside the braces.
    expect(v.state.selection.main.head).toBe("$\\pvec{".length);
  });

  it("\\begin viene con sus llaves y abre la lista de entornos", async () => {
    const v = editor("\\[\n\\beg|\n\\]");
    startCompletion(v);
    await waitFor(() => expect(completionStatus(v.state)).toBe("active"));
    const options = currentCompletions(v.state);
    const begin = options.findIndex((o) => o.label === "\\begin");
    expect(begin).toBeGreaterThanOrEqual(0);
    // Select «\begin» and accept it.
    v.dispatch({});
    const { apply } = options[begin];
    expect(typeof apply).toBe("function");
    (apply as (view: EditorView, c: unknown, from: number, to: number) => void)(
      v,
      options[begin],
      3,
      "\\[\n\\beg".length,
    );
    expect(text(v)).toBe("\\[\n\\begin{}\n\\]");
    expect(v.state.selection.main.head).toBe("\\[\n\\begin{".length);
    await waitFor(() => expect(currentCompletions(v.state).map((o) => o.label)).toContain("cases"));
  });

  it("Tab dentro de matemáticas completa y no indenta", async () => {
    const v = editor("Texto $a + \\fra|$");
    expect(tab(v)).toBe(true);
    // The suggestions were requested by Tab and the first one is accepted when it arrives.
    await waitFor(() => expect(text(v)).toMatch(/^Texto \$a \+ \\frac/));
    expect(text(v).startsWith("Texto")).toBe(true);
  });

  it("Tab justo cuando aparece la lista (antes de que se pueda aceptar) no indenta", async () => {
    const v = editor("Texto $a + \\fra|$");
    startCompletion(v);
    await waitFor(() => expect(completionStatus(v.state)).toBe("active"));
    // Within CodeMirror's interaction delay: accepting is refused, Tab must not indent.
    expect(tab(v)).toBe(true);
    expect(text(v)).toBe("Texto $a + \\fra$");
    await waitFor(() => expect(text(v)).toMatch(/^Texto \$a \+ \\frac/));
  });

  it("Tab al inicio de una línea de matemáticas sí indenta", () => {
    const v = editor("\\[\n|a + b\n\\]");
    tab(v);
    expect(text(v)).toMatch(/^\\\[\n\s+a \+ b\n\\\]$/);
  });

  it("fuera de matemáticas, Tab sigue indentando", () => {
    const v = editor("Texto| normal");
    tab(v);
    expect(text(v)).toMatch(/^\s+Texto normal$/);
  });
});
