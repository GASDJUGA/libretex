import { EditorState, type TransactionSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pasteCursor } from "./pasteCursor";

afterEach(() => {
  vi.restoreAllMocks();
});

const DOC = "$a + b$\n\\begin{equation}\n  \n\\end{equation}";
const PASTED = "a + \\frac{b}{c}";

/**
 * Runs `spec` on a focused editor, with or without `pasteCursor`. Returns the places where
 * the browser's selection was collapsed (CodeMirror also does it when it sees a difference).
 */
function collapses(spec: TransactionSpec, withExtension: boolean) {
  const view = new EditorView({
    state: EditorState.create({
      doc: DOC,
      selection: { anchor: 27 },
      extensions: withExtension ? pasteCursor : [],
    }),
    parent: document.body,
  });
  view.focus();
  expect(view.hasFocus).toBe(true);
  const collapse = vi.spyOn(document.getSelection()!, "collapse");
  view.dispatch(spec);
  const places = collapse.mock.calls.map(([node, offset]) => view.posAtDOM(node!, offset));
  collapse.mockRestore();
  view.destroy();
  return places;
}

describe("cursor del navegador tras pegar", () => {
  it("se vuelve a poner al final de lo pegado, donde se dibuja el de CodeMirror", () => {
    const paste: TransactionSpec = {
      changes: { from: 27, insert: PASTED },
      selection: { anchor: 27 + PASTED.length },
      userEvent: "input.paste",
    };
    const before = collapses(paste, false);
    const after = collapses(paste, true);
    // Written once more, even where CodeMirror would trust the browser's report.
    expect(after).toEqual([...before, 27 + PASTED.length]);
  });

  it("no hace nada al escribir ni si lo pegado queda seleccionado", () => {
    const typing: TransactionSpec = {
      changes: { from: 27, insert: "x" },
      selection: { anchor: 28 },
      userEvent: "input.type",
    };
    expect(collapses(typing, true)).toEqual(collapses(typing, false));
    const selected: TransactionSpec = {
      changes: { from: 27, insert: PASTED },
      selection: { anchor: 27, head: 27 + PASTED.length },
      userEvent: "input.paste",
    };
    expect(collapses(selected, true)).toEqual(collapses(selected, false));
  });
});
