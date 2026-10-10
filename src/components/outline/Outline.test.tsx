import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Project } from "../../app/Project";
import { createMockBackend, type MockBackend } from "../../lib/mockBackend";
import { setBackend } from "../../lib/tauri";
import { useProjectView } from "../../store/project";
import { resetApp } from "../../test/reset";

let backend: MockBackend;

function editorView() {
  const dom = screen.getByTestId("code-editor").querySelector<HTMLElement>(".cm-editor")!;
  return EditorView.findFromDOM(dom)!;
}

const outline = () => screen.getByRole("region", { name: "Esquema del archivo" });

async function renderProject() {
  render(<Project projectId="tesis" />);
  await screen.findByText(/Este documento es un ejemplo/);
}

describe("Esquema del archivo", () => {
  beforeEach(() => {
    resetApp();
    backend = createMockBackend();
    setBackend(backend);
  });

  it("muestra las secciones reales del archivo activo", async () => {
    await renderProject();
    const titles = within(outline())
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(titles).toEqual([
      "Introducción",
      "Motivación",
      "Objetivos",
      "Marco teórico",
      "Vectores unitarios",
      "Ejemplo en coordenadas cartesianas",
      "Resultados",
    ]);
  });

  it("resalta la sección del cursor y salta al hacer clic", async () => {
    await renderProject();
    fireEvent.click(within(outline()).getByRole("button", { name: "Resultados" }));
    const view = editorView();
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    expect(line.text).toBe("\\section{Resultados}");
    await waitFor(() =>
      expect(within(outline()).getByRole("button", { name: "Resultados" })).toHaveAttribute(
        "aria-current",
        "location",
      ),
    );
  });

  it("se actualiza al escribir", async () => {
    await renderProject();
    const view = editorView();
    act(() => {
      view.dispatch({ changes: { from: view.state.doc.length, insert: "\n\\section{Anexo}" } });
    });
    expect(await within(outline()).findByRole("button", { name: "Anexo" })).toBeInTheDocument();
  });

  it("incluye las secciones de los archivos de \\input y abre el archivo al hacer clic", async () => {
    await renderProject();
    const view = editorView();
    act(() => {
      view.dispatch({
        changes: { from: view.state.doc.length, insert: "\n\\input{capitulos/marco-teorico}" },
      });
    });
    const included = await within(outline()).findByRole("button", {
      name: /Marco teórico.*marco-teorico\.tex/,
    });
    fireEvent.click(included);
    await waitFor(() =>
      expect(useProjectView.getState().activeFile).toBe("capitulos/marco-teorico.tex"),
    );
  });
});
