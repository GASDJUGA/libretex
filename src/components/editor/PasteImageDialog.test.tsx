import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Project } from "../../app/Project";
import { createMockBackend, type MockBackend } from "../../lib/mockBackend";
import { setBackend } from "../../lib/tauri";
import { useProjects } from "../../store/projects";
import { resetApp } from "../../test/reset";

let backend: MockBackend;

beforeEach(() => {
  resetApp();
  backend = createMockBackend();
  setBackend(backend);
});

/** The editor of main.tex, with the cursor at the end of the line with `text`. */
async function openEditor(text: string) {
  render(<Project projectId="tesis" />);
  const content = await screen.findByRole("textbox", { name: /Editor: main\.tex/ });
  const view = EditorView.findFromDOM(content)!;
  const line = view.state.doc
    .toString()
    .split("\n")
    .findIndex((l) => l.includes(text));
  act(() => view.dispatch({ selection: { anchor: view.state.doc.line(line + 1).to } }));
  return { view, content };
}

/** Ctrl+V with what the page gets from WebKitGTK when an image is copied: no data. */
function pasteNothing(content: HTMLElement) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { types: [], getData: () => "" } });
  fireEvent(content, event);
}

describe("pegar una imagen", () => {
  it("pide el nombre, la guarda en el proyecto e inserta la figura", async () => {
    const { view, content } = await openEditor("\\begin{document}");
    backend.setClipboardImage({ extension: "png", bytes: 1234 });
    pasteNothing(content);

    const dialog = await screen.findByRole("dialog", { name: "Pegar imagen" });
    const name = screen.getByRole("textbox", { name: "Nombre" });
    expect((name as HTMLInputElement).value).toMatch(/^captura-\d{4}-\d\d-\d\d-\d{6}$/);
    fireEvent.change(name, { target: { value: "Diagrama espín" } });
    expect(dialog).toHaveTextContent("Se guardará como diagrama-espin.png");
    fireEvent.click(within(dialog).getByRole("button", { name: "Insertar" }));

    await waitFor(() => expect(view.state.doc.toString()).toContain("{diagrama-espin.png}"));
    expect(view.state.doc.toString()).toContain("\\label{fig:diagrama-espin}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // In the project (the tree shows it).
    expect(
      await screen.findByRole("treeitem", { name: /diagrama-espin\.png/ }),
    ).toBeInTheDocument();

    // The same name again: said in the dialog, nothing overwritten nor inserted.
    pasteNothing(content);
    const again = await screen.findByRole("dialog", { name: "Pegar imagen" });
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre" }), {
      target: { value: "diagrama-espin" },
    });
    fireEvent.click(within(again).getByRole("button", { name: "Insertar" }));
    expect(await screen.findByText(/ya existe/i)).toBeInTheDocument();
    expect(view.state.doc.toString().match(/diagrama-espin\.png/g)).toHaveLength(1);
  });

  it("sin imagen en el portapapeles no pasa nada", async () => {
    const { content } = await openEditor("\\begin{document}");
    pasteNothing(content);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("se guarda en la carpeta elegida en el menú del proyecto", async () => {
    const { view, content } = await openEditor("\\begin{document}");
    fireEvent.click(screen.getByRole("button", { name: "Proyecto Tesis de magíster" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Carpeta de imágenes pegadas…" }));
    const dialog = await screen.findByRole("dialog", { name: "Carpeta de imágenes pegadas" });
    expect(screen.getByRole("radio", { name: "Raíz del proyecto" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "figuras/" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(useProjects.getState().current?.figuresDir).toBe("figuras");

    backend.setClipboardImage({ extension: "jpg", bytes: 10 });
    pasteNothing(content);
    const paste = await screen.findByRole("dialog", { name: "Pegar imagen" });
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre" }), {
      target: { value: "foto" },
    });
    expect(screen.getByText("Se guardará como figuras/foto.jpg")).toBeInTheDocument();
    fireEvent.click(within(paste).getByRole("button", { name: "Insertar" }));
    await waitFor(() => expect(view.state.doc.toString()).toContain("{figuras/foto.jpg}"));
  });
});
