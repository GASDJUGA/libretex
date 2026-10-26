import { undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../App";
import { createMockBackend, type MockBackend } from "../lib/mockBackend";
import { setBackend } from "../lib/tauri";
import { resetApp } from "../test/reset";
import { useAppStore } from "./app";
import { useBuffers } from "./buffers";
import { useCompile } from "./compile";
import { useProjectView } from "./project";
import { handleBackgroundCompileEvent, TABS_STORAGE_KEY, useWorkspaces } from "./workspaces";

let backend: MockBackend;

beforeEach(() => {
  resetApp();
  backend = createMockBackend();
  setBackend(backend);
});

function editorView() {
  const dom = screen.getByTestId("code-editor").querySelector<HTMLElement>(".cm-editor")!;
  return EditorView.findFromDOM(dom)!;
}

const tabStrip = () => screen.getByRole("tablist", { name: "Proyectos abiertos" });
const tab = (name: RegExp | string) => within(tabStrip()).getByRole("tab", { name });

/** Opens a project from the home screen. */
async function openFromHome(name: string, text: RegExp) {
  act(() => useAppStore.getState().goHome("projects"));
  fireEvent.click(await screen.findByRole("button", { name: `Abrir ${name}` }));
  await screen.findByText(text);
}

describe("varios proyectos abiertos en pestañas", () => {
  it("cada pestaña conserva sus archivos, sus cambios y su historial de deshacer", async () => {
    render(<App />);
    await openFromHome("Tesis de magíster", /Este documento es un ejemplo/);
    // In the thesis: another file open and an edit.
    act(() => useProjectView.getState().openFile("preambulo.tex"));
    await waitFor(() => expect(editorView().state.doc.toString()).toMatch(/^% Paquetes/));
    act(() => editorView().dispatch({ changes: { from: 0, insert: "% nuevo\n" } }));

    // Another project, straight from the home screen.
    await openFromHome("Apuntes de Mecánica Clásica", /Este documento es un ejemplo/);
    expect(within(tabStrip()).getAllByRole("tab")).toHaveLength(3);
    expect(tab(/Mecánica Clásica/)).toHaveAttribute("aria-selected", "true");
    expect(useProjectView.getState().openFiles).not.toContain("preambulo.tex");

    // Back to the thesis by its tab: same files, the edit, and Ctrl+Z still undoes it.
    fireEvent.click(tab(/Tesis de magíster/));
    await waitFor(() => expect(useProjectView.getState().openFiles).toContain("preambulo.tex"));
    await waitFor(() => expect(editorView().state.doc.toString()).toMatch(/^% nuevo\n% Paquetes/));
    act(() => {
      undo(editorView());
    });
    expect(editorView().state.doc.toString()).toMatch(/^% Paquetes/);
    // The edit was saved to disk when the tab went to the background.
    expect((await backend.readTextFile("tesis", "preambulo.tex")).content).toMatch(/^% nuevo/);
  });

  it("volver a una pestaña la muestra al instante, sin esperar al backend", async () => {
    render(<App />);
    await openFromHome("Tesis de magíster", /Este documento es un ejemplo/);
    act(() => useProjectView.getState().openFile("preambulo.tex"));
    await waitFor(() => expect(editorView().state.doc.toString()).toMatch(/^% Paquetes/));
    await openFromHome("Apuntes de Mecánica Clásica", /Este documento es un ejemplo/);

    // The backend takes its time to answer (it records the project as recently opened).
    let answer = () => {};
    const open = backend.openProject;
    backend.openProject = (id) =>
      new Promise((resolve) => {
        answer = () => resolve(open(id));
      });
    fireEvent.click(tab(/Tesis de magíster/));
    expect(screen.queryByText("Abriendo proyecto…")).not.toBeInTheDocument();
    expect(editorView().state.doc.toString()).toMatch(/^% Paquetes/);
    expect(screen.getByRole("button", { name: /Tesis de magíster/ })).toBeInTheDocument();
    await act(async () => answer());
    expect(editorView().state.doc.toString()).toMatch(/^% Paquetes/);
  });

  it("cerrar una pestaña muestra la siguiente; Ctrl+Tab recorre Inicio y los proyectos", async () => {
    render(<App />);
    await openFromHome("Tesis de magíster", /Este documento es un ejemplo/);
    await openFromHome("Apuntes de Mecánica Clásica", /Este documento es un ejemplo/);
    fireEvent.keyDown(window, { key: "Tab", ctrlKey: true });
    await waitFor(() => expect(useAppStore.getState().route).toEqual({ name: "home" }));
    fireEvent.keyDown(window, { key: "Tab", ctrlKey: true });
    await waitFor(() => expect(tab(/Tesis de magíster/)).toHaveAttribute("aria-selected", "true"));
    fireEvent.keyDown(window, { key: "Tab", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(useAppStore.getState().route).toEqual({ name: "home" }));

    fireEvent.click(tab(/Tesis de magíster/));
    await screen.findByText(/Este documento es un ejemplo/);
    // From the keyboard, Delete on the tab closes it (the cross is for the mouse).
    fireEvent.keyDown(within(tabStrip()).getByRole("tab", { name: /Tesis de magíster/ }), {
      key: "Delete",
    });
    await waitFor(() =>
      expect(useAppStore.getState().route).toEqual({ name: "project", projectId: "mecanica" }),
    );
    expect(useWorkspaces.getState().tabs).toEqual(["mecanica"]);
    expect(JSON.parse(localStorage.getItem(TABS_STORAGE_KEY)!)).toEqual(["mecanica"]);
  });

  it("una compilación de una pestaña en segundo plano termina en esa pestaña", async () => {
    render(<App />);
    await openFromHome("Tesis de magíster", /Este documento es un ejemplo/);
    await openFromHome("Apuntes de Mecánica Clásica", /Este documento es un ejemplo/);
    const event = { projectId: "tesis", runId: 77 };
    act(() => {
      handleBackgroundCompileEvent({ ...event, type: "started" });
    });
    expect(useWorkspaces.getState().compiling).toEqual(["tesis"]);
    expect(within(tab(/Tesis de magíster/)).getByLabelText("Compilando")).toBeInTheDocument();
    act(() => {
      handleBackgroundCompileEvent({
        ...event,
        type: "finished",
        status: "success",
        durationMs: 10,
        log: "This is XeTeX\nOutput written on main.pdf (1 page).\n",
        pdf: "/x/main.pdf",
        mainFile: "main.tex",
        error: null,
        blocked: [],
      });
    });
    expect(useWorkspaces.getState().compiling).toEqual([]);
    // The thesis on screen again: its result is there; the other project's is not.
    expect(useCompile.getState().last).toBeNull();
    fireEvent.click(tab(/Tesis de magíster/));
    await waitFor(() => expect(useCompile.getState().last?.runId).toBe(77));
  });

  it("guardar un archivo que termina tras cambiar de pestaña no toca el otro proyecto", async () => {
    render(<App />);
    await openFromHome("Tesis de magíster", /Este documento es un ejemplo/);
    act(() => editorView().dispatch({ changes: { from: 0, insert: "% a\n" } }));
    const save = useBuffers.getState().save("main.tex");
    await openFromHome("Apuntes de Mecánica Clásica", /Este documento es un ejemplo/);
    await save;
    const main = useBuffers.getState().buffers["main.tex"];
    expect(main.content.startsWith("% a")).toBe(false);
    expect(main.saved).toBe(main.content);
  });
});
