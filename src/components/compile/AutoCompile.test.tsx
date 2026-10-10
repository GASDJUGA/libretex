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

describe("Compilación automática y atajos", () => {
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

  it("compila solo 1,5 s después de guardar, una sola vez", async () => {
    await renderProject();
    vi.useFakeTimers();
    act(() => {
      const view = editorView();
      view.dispatch({ changes: { from: view.state.doc.length, insert: "\n% nuevo" } });
    });
    await act(async () => {
      await useBuffers.getState().save("main.tex");
    });
    await act(async () => {
      vi.advanceTimersByTime(1400);
    });
    expect(compiles).toBe(0);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(compiles).toBe(1);
    // The compilation's own save must not trigger another one.
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(compiles).toBe(1);
  });

  it("desactivada no compila al guardar, y la elección se guarda en el proyecto", async () => {
    await renderProject();
    fireEvent.click(screen.getByRole("button", { name: "Opciones de compilación" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Compilación automática" }));
    await waitFor(async () => expect((await backend.openProject("tesis")).autoCompile).toBe(false));
    vi.useFakeTimers();
    await act(async () => {
      await useBuffers.getState().save("main.tex");
      vi.advanceTimersByTime(3000);
    });
    expect(compiles).toBe(0);
  });

  it("el compilador elegido se guarda en el proyecto", async () => {
    await renderProject();
    fireEvent.click(screen.getByRole("button", { name: "Opciones de compilación" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "LuaLaTeX" }));
    await waitFor(() => expect(useProjects.getState().current?.compiler).toBe("lualatex"));
  });
});
