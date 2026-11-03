import { completionStatus, currentCompletions, startCompletion } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { editorExtensions } from "./setup";

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

/** The completion list at the end of `doc` (null: none). */
async function listAtEnd(doc: string) {
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: editorExtensions({ onChange() {}, onCursorLine() {}, onSave() {} }),
    }),
    parent: document.body,
  });
  startCompletion(view);
  await new Promise((r) => setTimeout(r, 60));
  return completionStatus(view.state) === "active" ? currentCompletions(view.state) : null;
}

describe("\\\\ (salto de línea) no abre el autocompletado", () => {
  it("ni con la segunda barra ni con lo que se escribe pegado a ella", async () => {
    expect(await listAtEnd("a \\\\")).toBeNull();
    view!.destroy();
    expect(await listAtEnd("a \\\\al")).toBeNull();
  });

  it("una barra sola, o la tercera tras un salto de línea, sí: es un comando", async () => {
    const one = await listAtEnd("$\\al");
    await waitFor(() => expect(one?.some((o) => o.label === "\\alpha")).toBe(true));
    view!.destroy();
    const third = await listAtEnd("a \\\\\\al");
    expect(third?.some((o) => o.label === "\\alpha")).toBe(true);
  });
});
