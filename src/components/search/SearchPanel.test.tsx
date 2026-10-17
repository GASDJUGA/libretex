import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Project } from "../../app/Project";
import { createMockBackend, type MockBackend } from "../../lib/mockBackend";
import { setBackend } from "../../lib/tauri";
import { useBuffers } from "../../store/buffers";
import { useProjectView } from "../../store/project";
import { resetApp } from "../../test/reset";

let backend: MockBackend;

function editorView() {
  const dom = screen.getByTestId("code-editor").querySelector<HTMLElement>(".cm-editor")!;
  return EditorView.findFromDOM(dom)!;
}

async function openSearch() {
  render(<Project projectId="tesis" />);
  await screen.findByText(/Este documento es un ejemplo/);
  fireEvent.keyDown(window, { key: "F", code: "KeyF", ctrlKey: true, shiftKey: true });
  return screen.findByRole("region", { name: "Buscar en el proyecto" });
}

async function searchFor(panel: HTMLElement, text: string) {
  const input = within(panel).getByRole("searchbox", { name: "Buscar en el proyecto…" });
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
}

describe("Buscar en el proyecto", () => {
  beforeEach(() => {
    resetApp();
    backend = createMockBackend();
    setBackend(backend);
  });

  it("Ctrl+Shift+F abre el panel con el campo listo para escribir", async () => {
    const panel = await openSearch();
    expect(useProjectView.getState().sidePanel).toBe("search");
    await waitFor(() =>
      expect(
        within(panel).getByRole("searchbox", { name: "Buscar en el proyecto…" }),
      ).toHaveFocus(),
    );
    expect(within(panel).getByText(/Busca en todos los archivos de texto/)).toBeInTheDocument();
  });

  it("muestra las coincidencias por archivo y un clic las selecciona en el editor", async () => {
    const panel = await openSearch();
    await searchFor(panel, "introducción");
    expect(await within(panel).findByText("3 resultados en 2 archivos")).toBeInTheDocument();
    const file = within(panel).getByRole("button", {
      name: /^capitulos\/introduccion\.tex\s*\d+$/,
    });
    expect(file).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(within(panel).getAllByTitle("Ir a la línea 2")[0]);
    await waitFor(() =>
      expect(useProjectView.getState().activeFile).toBe("capitulos/introduccion.tex"),
    );
    await waitFor(() => {
      const { state } = editorView();
      const { from, to } = state.selection.main;
      expect(state.sliceDoc(from, to)).toBe("introducción");
      expect(state.doc.lineAt(from).number).toBe(2);
    });

    // A file's matches can be collapsed.
    fireEvent.click(file);
    expect(file).toHaveAttribute("aria-expanded", "false");
    expect(within(panel).queryAllByTitle("Ir a la línea 2")).toHaveLength(0);
  });

  it("busca también lo escrito y aún no guardado", async () => {
    const panel = await openSearch();
    const view = editorView();
    act(() => view.dispatch({ changes: { from: 0, insert: "% palabraNueva\n" } }));
    await searchFor(panel, "palabranueva");
    expect(await within(panel).findByText("1 resultado en 1 archivo")).toBeInTheDocument();
    expect((await backend.readTextFile("tesis", "main.tex")).content).toMatch(/^% palabraNueva/);
  });

  it("una expresión regular no válida se explica", async () => {
    const panel = await openSearch();
    fireEvent.click(within(panel).getByRole("button", { name: "Usar expresión regular" }));
    await searchFor(panel, "(sin cerrar");
    expect(
      await within(panel).findByText("La búsqueda no es válida: revisa la expresión regular."),
    ).toBeInTheDocument();
  });

  it("reemplazar todo pide confirmación, cambia los archivos y los abiertos", async () => {
    const panel = await openSearch();
    await searchFor(panel, "introducción");
    await within(panel).findByText("3 resultados en 2 archivos");
    fireEvent.change(within(panel).getByRole("textbox", { name: "Reemplazar por…" }), {
      target: { value: "presentación" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Reemplazar todo" }));
    const dialog = await screen.findByRole("dialog", { name: "¿Reemplazar en el proyecto?" });
    expect(dialog).toHaveTextContent(
      "Se reemplazarán 3 coincidencias de «introducción» por «presentación» en 2 archivos.",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Reemplazar todo" }));

    await within(panel).findByText("Sin resultados.");
    expect((await backend.readTextFile("tesis", "capitulos/introduccion.tex")).content).toBe(
      "\\section{presentación}\nTexto de la presentación.\n",
    );
    // The open file (main.tex) shows the new text.
    await waitFor(() =>
      expect(useBuffers.getState().buffers["main.tex"]?.content).toMatch(/presentación/),
    );
    expect(editorView().state.doc.toString()).toMatch(/\\section\{presentación\}/);
  });

  it("reemplazar en un solo archivo", async () => {
    const panel = await openSearch();
    await searchFor(panel, "introducción");
    await within(panel).findByText("3 resultados en 2 archivos");
    fireEvent.change(within(panel).getByRole("textbox", { name: "Reemplazar por…" }), {
      target: { value: "X" },
    });
    fireEvent.click(
      within(panel).getByRole("button", {
        name: "Reemplazar en este archivo: capitulos/introduccion.tex",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("en 1 archivo.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reemplazar todo" }));
    expect(await within(panel).findByText("1 resultado en 1 archivo")).toBeInTheDocument();
    expect((await backend.readTextFile("tesis", "main.tex")).content).toMatch(/Introducción/);
  });

  it("con texto seleccionado en el editor, Ctrl+Shift+F lo busca", async () => {
    render(<Project projectId="tesis" />);
    await screen.findByText(/Este documento es un ejemplo/);
    const view = editorView();
    const at = view.state.doc.toString().indexOf("Motivación");
    act(() => view.dispatch({ selection: { anchor: at, head: at + "Motivación".length } }));
    fireEvent.keyDown(view.contentDOM, { key: "F", code: "KeyF", ctrlKey: true, shiftKey: true });
    const panel = await screen.findByRole("region", { name: "Buscar en el proyecto" });
    expect(within(panel).getByRole("searchbox")).toHaveValue("Motivación");
    expect(await within(panel).findByText(/1 resultado/)).toBeInTheDocument();
  });
});
