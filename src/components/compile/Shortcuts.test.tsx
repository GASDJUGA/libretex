import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Project } from "../../app/Project";
import { createMockBackend, type MockBackend } from "../../lib/mockBackend";
import { setBackend } from "../../lib/tauri";
import { useBuffers } from "../../store/buffers";
import { useProjectView } from "../../store/project";
import { useProjects } from "../../store/projects";
import { resetApp } from "../../test/reset";

let backend: MockBackend;
let compiles: number;

function editorView() {
  const dom = screen.getByTestId("code-editor").querySelector<HTMLElement>(".cm-editor")!;
  return EditorView.findFromDOM(dom)!;
}

async function renderProject() {
  render(<Project projectId="tesis" />);
  await screen.findByText(/Este documento es un ejemplo/);
}

describe("Atajos de compilación", () => {
  beforeEach(() => {
    resetApp();
    backend = createMockBackend();
    compiles = 0;
    const compileProject = backend.compileProject;
    backend.compileProject = (id, request) => {
      compiles++;
      return compileProject(id, request);
    };
    setBackend(backend);
  });
  afterEach(() => vi.useRealTimers());

  it("Ctrl+Enter compila desde cualquier parte y desde el editor", async () => {
    await renderProject();
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(compiles).toBe(1));
    await waitFor(() => expect(useProjectView.getState()).toBeTruthy());
    fireEvent.keyDown(editorView().contentDOM, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(compiles).toBe(2));
    expect(editorView().state.doc.toString()).toMatch(/\\end\{document\}\n$/);
  });

  it("guardar (Ctrl+S) no compila: la compilación es siempre manual", async () => {
    await renderProject();
    vi.useFakeTimers();
    act(() => {
      const view = editorView();
      view.dispatch({ changes: { from: view.state.doc.length, insert: "\n% nuevo" } });
    });
    await act(async () => {
      fireEvent.keyDown(editorView().contentDOM, { key: "s", ctrlKey: true });
      vi.advanceTimersByTime(5000);
    });
    expect(useBuffers.getState().buffers["main.tex"].saved).toMatch(/% nuevo$/);
    expect(compiles).toBe(0);
  });

  it("el compilador elegido se guarda en el proyecto", async () => {
    await renderProject();
    fireEvent.click(screen.getByRole("button", { name: "Opciones de compilación" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "LuaLaTeX" }));
    await waitFor(() => expect(useProjects.getState().current?.compiler).toBe("lualatex"));
  });

  it("Ctrl+J va al PDF desde cualquier parte; si llega como «Enter», no compila", async () => {
    await renderProject();
    fireEvent.keyDown(window, { key: "j", code: "KeyJ", ctrlKey: true });
    expect(useProjectView.getState().pdfSync).not.toBeNull();
    const first = useProjectView.getState().pdfSync!.nonce;
    // GTK may report Ctrl+J as the line-feed control character.
    fireEvent.keyDown(editorView().contentDOM, { key: "Enter", code: "KeyJ", ctrlKey: true });
    expect(useProjectView.getState().pdfSync!.nonce).not.toBe(first);
    await act(async () => {});
    expect(compiles).toBe(0);
  });
});
