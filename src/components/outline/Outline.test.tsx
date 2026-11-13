import { EditorView } from "@codemirror/view";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Project } from "../../app/Project";
import { createMockBackend, type MockBackend } from "../../lib/mockBackend";
import { flushSessions } from "../../lib/session";
import { setBackend } from "../../lib/tauri";
import { useProjectView } from "../../store/project";
import { resetApp } from "../../test/reset";

let backend: MockBackend;

function editorView() {
  const dom = screen.getByTestId("code-editor").querySelector<HTMLElement>(".cm-editor")!;
  return EditorView.findFromDOM(dom)!;
}

const outline = () => screen.getByRole("region", { name: "Esquema del archivo" });
/** Titles shown in the outline, in order (the header buttons are not titles). */
// Subsections are lists nested in their section's: the outer list has them all.
const titles = () =>
  within(within(outline()).getAllByRole("list")[0])
    .getAllByRole("button")
    .map((b) => b.textContent);

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
    expect(titles()).toEqual([
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

  it("colapsa y expande secciones, y lo recuerda en el proyecto", async () => {
    await renderProject();
    const heading = within(outline()).getByRole("button", { name: "Introducción" });
    expect(heading).toHaveAttribute("aria-expanded", "true");
    // With the keyboard: ← collapses, → expands.
    fireEvent.keyDown(heading, { key: "ArrowLeft" });
    expect(titles()).toEqual([
      "Introducción",
      "Marco teórico",
      "Vectores unitarios",
      "Ejemplo en coordenadas cartesianas",
      "Resultados",
    ]);
    expect(heading).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(heading, { key: "ArrowRight" });
    expect(titles()).toContain("Motivación");

    // With the mouse, the arrow collapses without jumping to the heading.
    const marco = within(outline()).getByRole("button", { name: "Marco teórico" });
    const before = useProjectView.getState().goto;
    fireEvent.click(within(marco).getByTestId("outline-toggle"));
    expect(titles()).not.toContain("Vectores unitarios");
    expect(useProjectView.getState().goto).toBe(before);

    // Collapse all / expand all.
    fireEvent.click(within(outline()).getByRole("button", { name: "Colapsar todo" }));
    expect(titles()).toEqual(["Introducción", "Marco teórico", "Resultados"]);

    // Remembered when the project is opened again.
    flushSessions();
    cleanup();
    await renderProject();
    expect(titles()).toEqual(["Introducción", "Marco teórico", "Resultados"]);
    fireEvent.click(within(outline()).getByRole("button", { name: "Expandir todo" }));
    expect(titles()).toContain("Ejemplo en coordenadas cartesianas");
  });

  it("si el cursor está en una sección colapsada, se resalta la que la contiene", async () => {
    await renderProject();
    fireEvent.click(within(outline()).getByRole("button", { name: "Vectores unitarios" }));
    fireEvent.keyDown(within(outline()).getByRole("button", { name: "Marco teórico" }), {
      key: "ArrowLeft",
    });
    await waitFor(() =>
      expect(within(outline()).getByRole("button", { name: "Marco teórico" })).toHaveAttribute(
        "aria-current",
        "location",
      ),
    );
  });
});
