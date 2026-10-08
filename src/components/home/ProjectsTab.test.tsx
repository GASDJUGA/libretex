import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../../App";
import { createMockBackend } from "../../lib/mockBackend";
import { setBackend } from "../../lib/tauri";
import { useAppStore } from "../../store/app";
import { useProjects } from "../../store/projects";
import { resetApp } from "../../test/reset";

async function renderHome() {
  render(<App />);
  await screen.findByRole("button", { name: "Abrir Tesis de magíster" });
}

function cardMenu(name: string) {
  fireEvent.click(screen.getByRole("button", { name: `Acciones de ${name}` }));
}

describe("Proyectos", () => {
  beforeEach(resetApp);

  it("crea un proyecto desde una plantilla y lo abre", async () => {
    await renderHome();
    fireEvent.click(screen.getByRole("button", { name: /Nuevo proyecto/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Apuntes de curso" }));

    const dialog = screen.getByRole("dialog", { name: "Nuevo proyecto" });
    expect(within(dialog).getByRole("combobox", { name: "Plantilla" })).toHaveValue("apuntes");
    const create = within(dialog).getByRole("button", { name: "Crear proyecto" });
    expect(create).toBeDisabled();

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Nombre del proyecto" }), {
      target: { value: "Cálculo II" },
    });
    fireEvent.click(create);

    expect(await screen.findByRole("button", { name: "Proyecto Cálculo II" })).toBeInTheDocument();
    expect(useAppStore.getState().route).toMatchObject({ name: "project" });
  });

  it("muestra el error de nombre repetido dentro del diálogo", async () => {
    await renderHome();
    fireEvent.click(screen.getByRole("button", { name: /Nuevo proyecto/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Proyecto vacío" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "Tesis de magíster" },
    });
    fireEvent.submit(dialog);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Ya existe un proyecto o una carpeta con ese nombre.",
    );
  });

  it("al abrir una carpeta con varios .tex pide elegir el archivo principal", async () => {
    await renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Abrir carpeta" }));
    const dialog = await screen.findByRole("dialog", { name: "Elige el archivo principal" });
    fireEvent.click(within(dialog).getByRole("radio", { name: "anexo.tex" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Abrir proyecto" }));

    expect(
      await screen.findByRole("button", { name: "Proyecto Carpeta de ejemplo" }),
    ).toBeInTheDocument();
    expect(useProjects.getState().current?.mainFile).toBe("anexo.tex");
  });

  it("importar un ZIP con un solo candidato abre el proyecto directamente", async () => {
    await renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Importar ZIP" }));
    expect(
      await screen.findByRole("button", { name: "Proyecto Proyecto importado" }),
    ).toBeInTheDocument();
  });

  it("cancelar el diálogo del sistema no hace nada", async () => {
    const backend = createMockBackend();
    setBackend({ ...backend, openFolderDialog: async () => null });
    await renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Abrir carpeta" }));
    await waitFor(() => expect(useAppStore.getState().route).toEqual({ name: "home" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renombra un proyecto", async () => {
    await renderHome();
    cardMenu("Tesis de magíster");
    fireEvent.click(screen.getByRole("menuitem", { name: "Renombrar…" }));
    const dialog = screen.getByRole("dialog", { name: "Renombrar proyecto" });
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Tesis final" } });
    fireEvent.submit(dialog);
    expect(await screen.findByRole("button", { name: "Abrir Tesis final" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mueve a la papelera tras confirmar", async () => {
    await renderHome();
    cardMenu("Tesis de magíster");
    fireEvent.click(screen.getByRole("menuitem", { name: "Mover a la papelera…" }));
    const dialog = screen.getByRole("dialog", { name: "¿Mover a la papelera?" });
    expect(dialog).toHaveTextContent("~/LibreTeX/Tesis de magíster");
    fireEvent.click(within(dialog).getByRole("button", { name: "Mover a la papelera" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Abrir Tesis de magíster" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("se movió a la papelera");
  });

  it("duplica un proyecto", async () => {
    await renderHome();
    cardMenu("Tesis de magíster");
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicar" }));
    expect(
      await screen.findByRole("button", { name: "Abrir Tesis de magíster (copia)" }),
    ).toBeInTheDocument();
  });

  it("un proyecto cuya carpeta desapareció solo se puede quitar de la lista", async () => {
    await renderHome();
    expect(screen.getByRole("button", { name: "Abrir Presentación seminario" })).toBeDisabled();
    expect(screen.getByText("Carpeta no encontrada")).toBeInTheDocument();
    cardMenu("Presentación seminario");
    const items = screen.getAllByRole("menuitem").map((i) => i.textContent);
    expect(items).toEqual(["Quitar de la lista"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Quitar de la lista" }));
    await waitFor(() =>
      expect(screen.queryByText("Presentación seminario")).not.toBeInTheDocument(),
    );
  });

  it("sin proyectos muestra un estado vacío con un botón para crear", async () => {
    setBackend(createMockBackend([]));
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Todavía no hay proyectos" }),
    ).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: /Nuevo proyecto/ });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(screen.getByRole("combobox", { name: "Plantilla" })).toHaveValue("articulo-xelatex-es");
  });
});
