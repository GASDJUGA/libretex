import { EditorState } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { waitFor } from "@testing-library/react";
import { latex } from "codemirror-lang-latex";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mathPreview, previewShown } from "./mathPreview";

let enabled = true;
const views: EditorView[] = [];

function view(doc: string, cursor: number) {
  const v = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [
        latex(),
        mathPreview({
          enabled: () => enabled,
          macros: () => ({ ihat: String.raw`\boldsymbol{\hat{\textbf{\i}}}` }),
          errorLabel: () => "Error en la fórmula",
        }),
      ],
    }),
    parent: document.body,
  });
  views.push(v);
  return v;
}

const tooltip = (v: EditorView) => v.dom.querySelector(".lt-math-preview");

describe("mathPreview", () => {
  // MathJax is loaded on demand; the first load is slow under the test runner.
  beforeAll(() => import("../lib/mathjax/render"), 30_000);

  afterEach(() => {
    enabled = true;
    views.splice(0).forEach((v) => v.destroy());
  });

  it("dentro de una fórmula muestra el SVG, con las macros del usuario", async () => {
    const doc = "Sea $3\\ihat + x^2$ el vector.";
    const v = view(doc, doc.indexOf("x^2"));
    await waitFor(() => expect(v.dom.querySelector(".lt-math-preview svg")).not.toBeNull(), {
      timeout: 3000,
    });
    expect(tooltip(v)!.classList.contains("lt-math-error")).toBe(false);
  });

  it("se actualiza mientras se escribe y muestra los errores en rojo", async () => {
    const doc = "Sea $x$ fin";
    const v = view(doc, 5);
    await waitFor(() => expect(v.dom.querySelector(".lt-math-preview svg")).not.toBeNull(), {
      timeout: 3000,
    });
    v.dispatch({ changes: { from: 5, insert: "\\frac{1}{" }, selection: { anchor: 14 } });
    await waitFor(() => expect(tooltip(v)?.classList.contains("lt-math-error")).toBe(true), {
      timeout: 3000,
    });
    expect(tooltip(v)!.textContent).toMatch(/^Error en la fórmula: /);
  });

  it("Esc lo cierra y fuera de la fórmula no aparece", async () => {
    const doc = "Texto $a+b$ y $c$ fin";
    const v = view(doc, doc.indexOf("a+b") + 1);
    await waitFor(() => expect(previewShown(v.state)).toBe(true), { timeout: 3000 });
    const escape = new KeyboardEvent("keydown", { key: "Escape" });
    expect(runScopeHandlers(v, escape, "editor")).toBe(true);
    expect(previewShown(v.state)).toBe(false);
    // Moving inside the same formula keeps it closed.
    v.dispatch({ selection: { anchor: doc.indexOf("a+b") + 2 } });
    await new Promise((r) => setTimeout(r, 250));
    expect(previewShown(v.state)).toBe(false);
    // Another formula shows it again; text outside hides it.
    v.dispatch({ selection: { anchor: doc.indexOf("$c") + 1 } });
    await waitFor(() => expect(previewShown(v.state)).toBe(true), { timeout: 3000 });
    v.dispatch({ selection: { anchor: doc.length } });
    await waitFor(() => expect(previewShown(v.state)).toBe(false), { timeout: 3000 });
  });

  it("desactivado no muestra nada", async () => {
    enabled = false;
    const v = view("Sea $x$ fin", 5);
    await new Promise((r) => setTimeout(r, 250));
    expect(previewShown(v.state)).toBe(false);
  });
});
