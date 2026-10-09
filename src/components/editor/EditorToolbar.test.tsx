import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Project } from "../../app/Project";
import { resetApp } from "../../test/reset";

function editorView() {
  const dom = screen.getByTestId("code-editor").querySelector<HTMLElement>(".cm-editor")!;
  return EditorView.findFromDOM(dom)!;
}

/** Puts `text` alone in the editor and selects `from..to`. */
function setDoc(text: string, from: number, to = from) {
  const view = editorView();
  act(() => {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      selection: { anchor: from, head: to },
    });
  });
}

const doc = () => editorView().state.doc.toString();

async function renderEditor() {
  render(<Project projectId="tesis" />);
  await screen.findByText(/Este documento es un ejemplo/);
}

describe("Barra de herramientas y menús", () => {
  beforeEach(resetApp);

  it("negrita envuelve la selección", async () => {
    await renderEditor();
    setDoc("hola mundo", 5, 10);
    fireEvent.click(screen.getByRole("button", { name: "Negrita" }));
    expect(doc()).toBe("hola \\textbf{mundo}");
  });

  it("el selector de título convierte la línea y sigue al cursor", async () => {
    await renderEditor();
    setDoc("Introducción", 3);
    fireEvent.change(screen.getByRole("combobox", { name: "Nivel de título" }), {
      target: { value: "section" },
    });
    expect(doc()).toBe("\\section{Introducción}");
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Nivel de título" })).toHaveValue("section"),
    );
  });

  it("la paleta de símbolos inserta el comando", async () => {
    await renderEditor();
    setDoc("$$", 1);
    fireEvent.click(screen.getByRole("button", { name: "Símbolos" }));
    const palette = screen.getByRole("dialog", { name: "Símbolos" });
    fireEvent.click(within(palette).getByRole("button", { name: "\\alpha" }));
    expect(doc()).toBe("$\\alpha$");
    expect(screen.queryByRole("dialog", { name: "Símbolos" })).not.toBeInTheDocument();
  });

  it("el selector de tabla inserta filas × columnas", async () => {
    await renderEditor();
    setDoc("", 0);
    fireEvent.click(screen.getByRole("button", { name: "Insertar tabla" }));
    fireEvent.click(screen.getByRole("button", { name: "Tabla de 2 × 3" }));
    expect(doc()).toContain("\\begin{tabular}{|c|c|c|}");
  });

  it("los menús Insertar y Formato actúan sobre el editor", async () => {
    await renderEditor();
    setDoc("x", 1);
    fireEvent.click(screen.getByRole("button", { name: "Insertar" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Lista numerada" }));
    expect(doc()).toContain("\\begin{enumerate}");

    setDoc("Título", 2);
    fireEvent.click(screen.getByRole("button", { name: "Formato" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Subsección" }));
    expect(doc()).toBe("\\subsection{Título}");
  });

  it("Archivo → Nuevo archivo abre el diálogo del árbol", async () => {
    await renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Archivo" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Nuevo archivo" }));
    expect(await screen.findByRole("dialog", { name: "Nuevo archivo" })).toBeInTheDocument();
  });

  it("con una imagen abierta la barra queda deshabilitada", async () => {
    await renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "figuras" }));
    fireEvent.click(screen.getByRole("button", { name: "montaje.png" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Negrita" })).toBeDisabled());
  });

  it("interruptor Código / Visual: Visual deshabilitado y marcado «Próximamente»", async () => {
    await renderEditor();
    const modes = screen.getByRole("radiogroup", { name: "Modo del editor" });
    expect(within(modes).getByRole("radio", { name: "Código" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const visual = within(modes).getByRole("radio", { name: "Visual" });
    expect(visual).toBeDisabled();
    expect(visual).toHaveAccessibleDescription("Próximamente");
  });
});
