import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Project } from "../../app/Project";
import { useProjectView } from "../../store/project";
import { useProjects } from "../../store/projects";
import { resetApp } from "../../test/reset";

async function renderTree() {
  render(<Project projectId="tesis" />);
  await screen.findByRole("button", { name: "referencias.bib" });
}

const row = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

function contextMenu(name: string | null) {
  const target = name === null ? screen.getByRole("tree").parentElement! : row(name);
  fireEvent.contextMenu(target, { clientX: 50, clientY: 50 });
  return screen.getByRole("menu");
}

/** Minimal DataTransfer for HTML5 drag & drop in jsdom. */
function dataTransfer() {
  const data: Record<string, string> = {};
  return {
    setData: (type: string, value: string) => (data[type] = value),
    getData: (type: string) => data[type] ?? "",
    get types() {
      return Object.keys(data);
    },
    dropEffect: "",
    effectAllowed: "",
  };
}

describe("Árbol de archivos", () => {
  beforeEach(resetApp);

  it("crea un archivo en una carpeta desde el menú contextual y lo abre", async () => {
    await renderTree();
    const menu = contextMenu("capitulos");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Nuevo archivo…" }));

    const dialog = screen.getByRole("dialog", { name: "Nuevo archivo" });
    expect(dialog).toHaveTextContent("En capitulos");
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "conclusiones.tex" },
    });
    fireEvent.submit(dialog);

    expect(await screen.findByRole("button", { name: "conclusiones.tex" })).toBeInTheDocument();
    expect(useProjectView.getState().activeFile).toBe("capitulos/conclusiones.tex");
  });

  it("un nombre repetido muestra el error dentro del diálogo", async () => {
    await renderTree();
    fireEvent.click(screen.getByRole("button", { name: "Nueva carpeta" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "figuras" } });
    fireEvent.submit(dialog);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Ya existe");
  });

  it("F2 renombra y la pestaña abierta sigue al archivo", async () => {
    await renderTree();
    fireEvent.click(row("preambulo.tex"));
    fireEvent.keyDown(row("preambulo.tex"), { key: "F2" });
    const dialog = screen.getByRole("dialog", { name: "Renombrar «preambulo.tex»" });
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "macros.tex" } });
    fireEvent.submit(dialog);

    expect(await screen.findByRole("button", { name: "macros.tex" })).toBeInTheDocument();
    expect(useProjectView.getState().openFiles).toContain("macros.tex");
    expect(useProjectView.getState().openFiles).not.toContain("preambulo.tex");
  });

  it("renombrar el archivo principal actualiza el proyecto", async () => {
    await renderTree();
    fireEvent.keyDown(row("main.tex"), { key: "F2" });
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "tesis.tex" } });
    fireEvent.submit(dialog);
    await waitFor(() => expect(useProjects.getState().current?.mainFile).toBe("tesis.tex"));
    expect(within(row("tesis.tex")).getByLabelText("Archivo principal")).toBeInTheDocument();
  });

  it("marca otro .tex como archivo principal", async () => {
    await renderTree();
    const menu = contextMenu("preambulo.tex");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Marcar como archivo principal" }));
    await waitFor(() => expect(useProjects.getState().current?.mainFile).toBe("preambulo.tex"));
  });

  it("mueve un archivo arrastrándolo a una carpeta", async () => {
    await renderTree();
    const transfer = dataTransfer();
    fireEvent.dragStart(row("referencias.bib"), { dataTransfer: transfer });
    fireEvent.dragOver(row("figuras"), { dataTransfer: transfer });
    fireEvent.drop(row("figuras"), { dataTransfer: transfer });

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "referencias.bib" })).toBeInTheDocument(),
    );
    const figuras = row("figuras").closest("li")!;
    expect(within(figuras).getByRole("button", { name: "referencias.bib" })).toBeInTheDocument();
  });

  it("mover una carpeta con un archivo abierto actualiza su pestaña", async () => {
    await renderTree();
    fireEvent.click(row("capitulos"));
    fireEvent.click(await screen.findByRole("button", { name: "introduccion.tex" }));
    const transfer = dataTransfer();
    fireEvent.dragStart(row("capitulos"), { dataTransfer: transfer });
    fireEvent.drop(row("figuras"), { dataTransfer: transfer });
    await waitFor(() =>
      expect(useProjectView.getState().activeFile).toBe("figuras/capitulos/introduccion.tex"),
    );
  });

  it("mueve a la papelera tras confirmar y cierra la pestaña", async () => {
    await renderTree();
    fireEvent.click(row("preambulo.tex"));
    expect(useProjectView.getState().openFiles).toContain("preambulo.tex");
    fireEvent.keyDown(row("preambulo.tex"), { key: "Delete" });
    const dialog = screen.getByRole("dialog", { name: "¿Mover «preambulo.tex» a la papelera?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Mover a la papelera" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "preambulo.tex" })).not.toBeInTheDocument(),
    );
    expect(useProjectView.getState().openFiles).not.toContain("preambulo.tex");
  });

  it("duplica desde el menú contextual", async () => {
    await renderTree();
    const menu = contextMenu("referencias.bib");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Duplicar" }));
    expect(
      await screen.findByRole("button", { name: "referencias (copia).bib" }),
    ).toBeInTheDocument();
  });

  it("sube archivos a la raíz desde el menú del fondo del árbol", async () => {
    await renderTree();
    const menu = contextMenu(null);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Subir archivos…" }));
    expect(await screen.findByRole("button", { name: "datos.csv" })).toBeInTheDocument();
  });
});
