import { currentCompletions, startCompletion } from "@codemirror/autocomplete";
import { insertNewlineAndIndent } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Project } from "../../app/Project";
import { createMockBackend, type MockBackend } from "../../lib/mockBackend";
import { setBackend } from "../../lib/tauri";
import { useBuffers } from "../../store/buffers";
import { useProjectView } from "../../store/project";
import { useProjectIndex } from "../../store/projectIndex";
import { resetApp } from "../../test/reset";
import { AUTOSAVE_MS } from "./CodeEditor";

let backend: MockBackend;

function editorView() {
  const dom = screen.getByTestId("code-editor").querySelector<HTMLElement>(".cm-editor")!;
  return EditorView.findFromDOM(dom)!;
}

function type(text: string) {
  const view = editorView();
  act(() => {
    view.dispatch({ changes: { from: view.state.doc.length, insert: text } });
  });
}

async function renderEditor() {
  render(<Project projectId="tesis" />);
  await screen.findByText(/Este documento es un ejemplo/);
}

describe("CodeEditor", () => {
  beforeEach(() => {
    resetApp();
    backend = createMockBackend();
    setBackend(backend);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("desde el PDF selecciona la palabra cliqueada cerca de la línea de SyncTeX", async () => {
    await renderEditor();
    // SyncTeX reports the paragraph's line (no column); the word is on the next one.
    act(() =>
      useProjectView.getState().goToLine("main.tex", 21, {
        text: "conexion",
        before: "pero dependen de una ",
        after: "",
      }),
    );
    await waitFor(() => {
      const { state } = editorView();
      const { from, to } = state.selection.main;
      expect(state.sliceDoc(from, to)).toBe("conexión");
    });
  });

  it("guarda automáticamente tras dejar de escribir", async () => {
    await renderEditor();
    vi.useFakeTimers();
    type("\n% nuevo");
    expect(useBuffers.getState().buffers["main.tex"].content).toMatch(/% nuevo$/);
    expect(screen.getByRole("tab", { name: /main\.tex/ })).toHaveTextContent("●");

    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_MS + 10);
    });
    vi.useRealTimers();
    await waitFor(async () =>
      expect((await backend.readTextFile("tesis", "main.tex")).content).toMatch(/% nuevo$/),
    );
    expect(screen.getByRole("tab", { name: /main\.tex/ })).not.toHaveTextContent("●");
  });

  it("Ctrl+S guarda al instante", async () => {
    await renderEditor();
    type("\nX");
    fireEvent.keyDown(editorView().contentDOM, { key: "s", ctrlKey: true });
    await waitFor(async () =>
      expect((await backend.readTextFile("tesis", "main.tex")).content).toMatch(/X$/),
    );
  });

  it("cada pestaña conserva su contenido al cambiar", async () => {
    await renderEditor();
    type("\n% en main");
    fireEvent.click(screen.getByRole("button", { name: "preambulo.tex" }));
    await waitFor(() => expect(editorView().state.doc.toString()).toMatch(/Paquetes y macros/));
    fireEvent.click(screen.getByRole("tab", { name: /main\.tex/ }));
    await waitFor(() => expect(editorView().state.doc.toString()).toMatch(/% en main$/));
  });

  it("una recarga desde el disco actualiza el texto del editor", async () => {
    await renderEditor();
    act(() => backend.externalChange("tesis", "main.tex", "Texto nuevo del disco"));
    await waitFor(() => expect(editorView().state.doc.toString()).toBe("Texto nuevo del disco"));
  });

  it("cerrar la pestaña guarda los cambios pendientes", async () => {
    await renderEditor();
    type("\n% antes de cerrar");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar main.tex" }));
    await waitFor(() => expect(useProjectView.getState().openFiles).not.toContain("main.tex"));
    expect((await backend.readTextFile("tesis", "main.tex")).content).toMatch(/antes de cerrar$/);
  });

  it("autocompleta \\ref con las etiquetas y \\cite con la bibliografía del proyecto", async () => {
    await renderEditor();
    await waitFor(() => expect(useProjectIndex.getState().labels.length).toBeGreaterThan(0));
    const completionsAfter = async (text: string) => {
      const view = editorView();
      act(() => {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          selection: { anchor: text.length },
        });
        startCompletion(view);
      });
      await waitFor(() => expect(currentCompletions(view.state).length).toBeGreaterThan(0));
      return currentCompletions(view.state).map((c) => c.label);
    };
    expect(await completionsAfter("Ver \\ref{")).toContain("sec:marco");
    expect(await completionsAfter("\\cite{")).toContain("knuth1984");
  });

  it("Tab acepta la sugerencia seleccionada", async () => {
    await renderEditor();
    await waitFor(() => expect(useProjectIndex.getState().labels.length).toBeGreaterThan(0));
    const view = editorView();
    act(() => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: "\\ref{sec:ma" },
        selection: { anchor: 11 },
      });
      startCompletion(view);
    });
    await waitFor(() => expect(currentCompletions(view.state).length).toBeGreaterThan(0));
    // Completions become selectable after a short delay in CodeMirror.
    await new Promise((r) => setTimeout(r, 150));
    fireEvent.keyDown(view.contentDOM, { key: "Tab" });
    await waitFor(() => expect(view.state.doc.toString()).toBe("\\ref{sec:marco"));
  });

  it("Enter tras \\section no sangra salvo en el modo «También en secciones»", async () => {
    await renderEditor();
    const view = editorView();
    const enterAfter = (text: string) => {
      act(() => {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          selection: { anchor: text.length },
        });
        insertNewlineAndIndent(view);
      });
      return view.state.doc.lineAt(view.state.selection.main.head).text;
    };
    const doc = "\\begin{document}\n\\section{A}";
    expect(enterAfter(doc)).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "También en secciones" }));
    expect(enterAfter(doc)).toBe("  ");
  });
});
