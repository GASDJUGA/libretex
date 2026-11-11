import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inactiveWindow } from "./inactiveWindow";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const DOC = "alfa beta gamma\ndelta épsilon";

/** An editor with "beta gamma" selected, focused, in a window that then loses the focus. */
function editorInInactiveWindow(withExtension: boolean) {
  const view = new EditorView({
    state: EditorState.create({
      doc: DOC,
      selection: { anchor: 5, head: 15 },
      extensions: withExtension ? inactiveWindow : [],
    }),
    parent: document.body,
  });
  view.focus();
  const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
  window.dispatchEvent(new FocusEvent("blur"));
  return { view, hasFocus };
}

/**
 * What WebKitGTK does when another window (or app) takes the PRIMARY selection: it collapses
 * the selection of the page that had it.
 */
async function primarySelectionTakenElsewhere(view: EditorView) {
  document.getSelection()!.collapse(view.contentDOM.querySelector(".cm-line")!.firstChild!, 0);
  document.dispatchEvent(new Event("selectionchange"));
  await new Promise((resolve) => setTimeout(resolve, 20));
  view.requestMeasure();
  view.dispatch({}); // anything that makes the editor update (spellcheck, a tooltip…)
}

describe("editor en una ventana que no está activa", () => {
  it("no vuelve a seleccionar en la página cuando otra ventana toma la selección", async () => {
    // Otherwise each of the two windows takes the selection back from the other one: the
    // selection being made in the other window flickers between all and nothing.
    const { view } = editorInInactiveWindow(true);
    await primarySelectionTakenElsewhere(view);
    expect(document.getSelection()!.isCollapsed).toBe(true);
    expect(view.state.selection.main).toMatchObject({ anchor: 5, head: 15 });
    view.destroy();
  });

  it("sin el arreglo, CodeMirror la vuelve a seleccionar", async () => {
    const { view } = editorInInactiveWindow(false);
    await primarySelectionTakenElsewhere(view);
    expect(document.getSelection()!.isCollapsed).toBe(false);
    view.destroy();
  });

  it("al volver a la ventana, el editor tiene el foco y su selección", async () => {
    const { view, hasFocus } = editorInInactiveWindow(true);
    await primarySelectionTakenElsewhere(view);
    hasFocus.mockReturnValue(true);
    window.dispatchEvent(new FocusEvent("focus"));
    expect(document.activeElement).toBe(view.contentDOM);
    expect(document.getSelection()!.toString()).toBe("beta gamma");
    expect(view.state.selection.main).toMatchObject({ anchor: 5, head: 15 });
    view.destroy();
  });

  it("al volver, no le quita el foco a otro control que lo tomó", () => {
    const { view, hasFocus } = editorInInactiveWindow(true);
    const input = document.body.appendChild(document.createElement("input"));
    input.focus();
    hasFocus.mockReturnValue(true);
    window.dispatchEvent(new FocusEvent("focus"));
    expect(document.activeElement).toBe(input);
    view.destroy();
  });

  it("un editor sin el foco no se toca", () => {
    const view = new EditorView({
      state: EditorState.create({ doc: DOC, extensions: inactiveWindow }),
      parent: document.body,
    });
    const input = document.body.appendChild(document.createElement("input"));
    input.focus();
    window.dispatchEvent(new FocusEvent("blur"));
    window.dispatchEvent(new FocusEvent("focus"));
    expect(document.activeElement).toBe(input);
    view.destroy();
  });
});
