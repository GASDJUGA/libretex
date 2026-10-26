import {
  acceptCompletion,
  completionStatus,
  currentCompletions,
  setSelectedCompletion,
  startCompletion,
} from "@codemirror/autocomplete";
import { undo } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { COMPLETION_INTERACTION_DELAY_MS } from "./mathTab";
import { editorExtensions } from "./setup";

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

/** An editor with `doc`, `|` as the cursor. */
function editor(doc: string) {
  view = new EditorView({
    state: EditorState.create({
      doc: doc.replace("|", ""),
      selection: { anchor: doc.indexOf("|") },
      extensions: editorExtensions({ onChange() {}, onCursorLine() {}, onSave() {} }),
    }),
    parent: document.body,
  });
  return view;
}

/** The text with `|` at the cursor. */
function shown(v: EditorView) {
  const text = v.state.doc.toString();
  const at = v.state.selection.main.head;
  return `${text.slice(0, at)}|${text.slice(at)}`;
}

describe("itemize y enumerate traen su primer \\item", () => {
  it("al elegir el entorno de la lista", async () => {
    const v = editor("\\begin{document}\n  \\begin{item|}\n\\end{document}");
    startCompletion(v);
    await waitFor(() => expect(completionStatus(v.state)).toBe("active"));
    const index = currentCompletions(v.state).findIndex((o) => o.label === "itemize");
    expect(index).toBeGreaterThanOrEqual(0);
    v.dispatch({ effects: setSelectedCompletion(index) });
    await new Promise((r) => setTimeout(r, COMPLETION_INTERACTION_DELAY_MS + 5));
    acceptCompletion(v);
    expect(shown(v)).toBe(
      "\\begin{document}\n  \\begin{itemize}\n    \\item |\n  \\end{itemize}\n\\end{document}",
    );
  });

  it("al cerrar la llave a mano, y deshacer no lo vuelve a poner", () => {
    // The `}` closed automatically when `{` was typed is replaced, not doubled.
    const v = editor("\\begin{enumerate|}");
    runScopeHandlers(v, new KeyboardEvent("keydown", { key: "}" }), "editor");
    expect(shown(v)).toBe("\\begin{enumerate}\n  \\item |\n\\end{enumerate}");
    undo(v);
    expect(v.state.doc.toString()).not.toContain("\\item");
  });

  it("otros entornos quedan como antes", () => {
    const v = editor("\\begin{center|}");
    runScopeHandlers(v, new KeyboardEvent("keydown", { key: "}" }), "editor");
    expect(shown(v)).toBe("\\begin{center}\n  |\n\\end{center}");
  });
});
