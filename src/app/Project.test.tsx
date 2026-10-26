import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockBackend } from "../lib/mockBackend";
import { flushSessions, loadSession, rememberView, resetSessions } from "../lib/session";
import { setBackend } from "../lib/tauri";
import { useAppStore } from "../store/app";
import { useBuffers } from "../store/buffers";
import { useProjectView } from "../store/project";
import { useProjectIndex } from "../store/projectIndex";
import { useProjects } from "../store/projects";
import { useToasts } from "../store/toasts";
import { resetApp } from "../test/reset";
import { Project } from "./Project";

/** Renders the project view and waits until the project has been opened. */
async function renderProject() {
  render(<Project projectId="tesis" />);
  await screen.findByRole("button", { name: "Proyecto Tesis de magíster" });
}

function chooseLayout(label: string) {
  fireEvent.click(screen.getByRole("button", { name: /Diseño/ }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: label }));
}

describe("Project", () => {
  beforeEach(resetApp);

  it("muestra las regiones principales del layout", async () => {
    await renderProject();

    const menubar = screen.getByRole("navigation", { name: "Menú principal" });
    for (const menu of ["Archivo", "Editar", "Insertar", "Ver", "Formato", "Ayuda"]) {
      expect(within(menubar).getByRole("button", { name: menu })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Proyecto Tesis de magíster" })).toBeInTheDocument();
    expect(screen.getByRole("tree", { name: "Archivos del proyecto" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Esquema del archivo" })).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Herramientas del editor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Recompilar/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Visual/ })).toBeDisabled();
  });

  it("cambia entre los modos de diseño", async () => {
    await renderProject();

    chooseLayout("Solo editor");
    expect(screen.queryByRole("region", { name: "Vista previa PDF" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Editor" })).toBeInTheDocument();

    chooseLayout("Solo PDF");
    expect(screen.queryByRole("region", { name: "Editor" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Vista previa PDF" })).toBeInTheDocument();
  });

  it("el riel abre y cierra el panel lateral", async () => {
    await renderProject();

    fireEvent.click(screen.getByRole("button", { name: "Archivos" }));
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Paquetes" }));
    expect(screen.getByRole("region", { name: "Paquetes" })).toBeInTheDocument();
  });

  it("Recompilar está en la barra superior y sigue visible en «Solo editor»", async () => {
    await renderProject();
    chooseLayout("Solo editor");
    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("button", { name: /Recompilar/ })).toBeInTheDocument();
  });

  it("el indicador de compilación abre el panel de registros", async () => {
    await renderProject();
    fireEvent.click(screen.getByRole("button", { name: /Registros: 0 errores, 0 advertencias/ }));
    expect(screen.getByRole("region", { name: "Registros y errores" })).toBeInTheDocument();
  });

  it("el PDF ya no tiene botón de descarga: se exporta desde Exportar", async () => {
    await renderProject();
    expect(screen.queryByRole("button", { name: "Descargar PDF" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Exportar/ }));
    expect(screen.getByRole("menuitem", { name: "Descargar PDF" })).toBeInTheDocument();
  });

  it("el desplegable de Recompilar cambia el compilador", async () => {
    await renderProject();

    fireEvent.click(screen.getByRole("button", { name: "Opciones de compilación" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "LuaLaTeX" }));
    expect(useProjectView.getState().compiler).toBe("lualatex");
  });

  it("al abrir actualiza la fecha de apertura y abre el archivo principal", async () => {
    await renderProject();
    expect(useProjects.getState().current?.openedAt).toBeGreaterThan(Date.now() - 5000);
    expect(screen.getByRole("tab", { name: "main.tex" })).toHaveAttribute("aria-selected", "true");
  });

  it("si la carpeta no existe vuelve al inicio con un aviso", async () => {
    useAppStore.setState({ route: { name: "project", projectId: "charla" } });
    render(<Project projectId="charla" />);
    await waitFor(() => expect(useAppStore.getState().route).toEqual({ name: "home" }));
    expect(useToasts.getState().toasts.at(-1)).toMatchObject({
      kind: "error",
      title: "El archivo o la carpeta no existe.",
    });
  });

  it("el árbol y el editor muestran los archivos del proyecto", async () => {
    await renderProject();
    expect(await screen.findByRole("button", { name: "referencias.bib" })).toBeInTheDocument();
    const editor = screen.getByRole("region", { name: "Editor" });
    expect(await within(editor).findByText(/Este documento es un ejemplo/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "figuras" }));
    fireEvent.click(screen.getByRole("button", { name: "montaje.png" }));
    // In the browser preview there is no asset protocol: the viewer explains it.
    expect(await within(editor).findByText(/solo está disponible en la app/)).toBeInTheDocument();
  });

  it("un cambio externo actualiza el árbol y el archivo abierto", async () => {
    const backend = createMockBackend();
    setBackend(backend);
    await renderProject();
    const editor = screen.getByRole("region", { name: "Editor" });
    await within(editor).findByText(/Este documento es un ejemplo/);

    backend.externalChange("tesis", "main.tex", "Contenido editado en otro programa");
    backend.externalChange("tesis", "nuevo.tex", "x");
    expect(await within(editor).findByText(/editado en otro programa/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "nuevo.tex" })).toBeInTheDocument();
  });

  it("un cambio de contenido (como un autoguardado) no vuelve a leer el árbol ni el índice", async () => {
    const backend = createMockBackend();
    setBackend(backend);
    const listTree = vi.spyOn(backend, "listTree");
    await renderProject();
    await waitFor(() => expect(listTree).toHaveBeenCalled());
    await waitFor(() => expect(useProjectIndex.getState().version).not.toBeNull());
    await new Promise((r) => setTimeout(r, 50));
    const index = useProjectIndex.getState().labels;
    const reads = listTree.mock.calls.length;

    // Contents only, labels unchanged: neither the tree nor the index are replaced.
    const main = (await backend.readTextFile("tesis", "main.tex")).content;
    backend.externalChange("tesis", "main.tex", `${main}\nOtra línea.`);
    await new Promise((r) => setTimeout(r, 50));
    expect(listTree.mock.calls.length).toBe(reads);
    expect(useProjectIndex.getState().labels).toBe(index);

    // A new file and a removed one: the tree is read again.
    backend.externalChange("tesis", "nuevo.tex", "\\label{nueva}");
    await waitFor(() => expect(listTree.mock.calls.length).toBe(reads + 1));
    await waitFor(() =>
      expect(useProjectIndex.getState().labels.map((l) => l.key)).toContain("nueva"),
    );
    backend.externalChange("tesis", "nuevo.tex", null);
    await waitFor(() => expect(listTree.mock.calls.length).toBe(reads + 2));
  });

  it("si el archivo abierto tiene cambios sin guardar pregunta qué conservar", async () => {
    const backend = createMockBackend();
    setBackend(backend);
    await renderProject();
    await waitFor(() => expect(useBuffers.getState().buffers["main.tex"]).toBeDefined());
    useBuffers.getState().setContent("main.tex", "mis cambios");

    backend.externalChange("tesis", "main.tex", "cambios de otro");
    const dialog = await screen.findByRole("dialog", { name: "«main.tex» cambió en el disco" });
    expect(screen.getByRole("tab", { name: /main\.tex/ })).toHaveTextContent("●");
    fireEvent.click(within(dialog).getByRole("button", { name: "Conservar mis cambios" }));
    expect(useBuffers.getState().buffers["main.tex"]).toEqual({
      content: "mis cambios",
      saved: "cambios de otro",
    });
  });

  it("abrir un archivo del árbol crea una pestaña", async () => {
    await renderProject();

    fireEvent.click(screen.getByRole("button", { name: "preambulo.tex" }));
    expect(screen.getByRole("tab", { name: "preambulo.tex" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("vuelve a las pestañas y al diseño de la sesión anterior", async () => {
    rememberView("tesis", {
      openFiles: ["main.tex", "capitulos/borrado.tex", "capitulos/introduccion.tex"],
      activeFile: "capitulos/introduccion.tex",
      layoutMode: "editor",
      sidePanel: "files",
      sidePanelOpen: true,
    });
    flushSessions();
    resetSessions();
    await renderProject();
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "introduccion.tex" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    // The file that no longer exists is not reopened.
    expect(useProjectView.getState().openFiles).toEqual(["main.tex", "capitulos/introduccion.tex"]);
    expect(useProjectView.getState().layoutMode).toBe("editor");

    // And what changes now is remembered for the next time.
    chooseLayout("Editor y PDF");
    await waitFor(() => expect(loadSession("tesis")?.layoutMode).toBe("split"));
  });
});
