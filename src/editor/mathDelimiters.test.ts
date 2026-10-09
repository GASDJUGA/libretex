import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { editorExtensions } from "./setup";

const noop = { onChange: () => {}, onCursorLine: () => {}, onSave: () => {} };
let view: EditorView | null = null;

/** Types `chars` one by one (through the input handlers) and returns the text with `|`. */
function typeInto(doc: string, chars: string) {
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: editorExtensions(noop),
    }),
    parent: document.body,
  });
  for (const char of chars) {
    const { from, to } = view.state.selection.main;
    const handled = view.state
      .facet(EditorView.inputHandler)
      .some((handler) =>
        handler(view!, from, to, char, () =>
          view!.state.update({ changes: { from, to, insert: char } }),
        ),
      );
    if (!handled)
      view.dispatch({ changes: { from, to, insert: char }, selection: { anchor: from + 1 } });
  }
  const text = view.state.doc.toString();
  const head = view.state.selection.main.head;
  return text.slice(0, head) + "|" + text.slice(head);
}

afterEach(() => {
  view?.destroy();
  view = null;
});

describe("cierre de \\[ \\] y \\( \\)", () => {
  it("cierra \\[ y \\(", () => {
    expect(typeInto("", "\\[")).toBe("\\[|\\]");
    expect(typeInto("", "\\(")).toBe("\\(|\\)");
  });

  it("no toca el salto de línea \\\\[2pt]", () => {
    expect(typeInto("a \\\\", "[")).toBe("a \\\\[|]");
  });

  it("escribir el cierre a mano pasa por encima del automático", () => {
    expect(typeInto("", "\\(x\\)")).toBe("\\(x\\)|");
  });
});
