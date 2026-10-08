import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { initialProjectViewState, useProjectView } from "../store/project";
import { Project } from "./Project";

function chooseLayout(label: string) {
  fireEvent.click(screen.getByRole("button", { name: /Diseño/ }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: label }));
}

describe("Project", () => {
  beforeEach(() => {
    useProjectView.setState(initialProjectViewState);
  });

  it("muestra las regiones principales del layout", () => {
    render(<Project projectId="tesis" />);

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

  it("cambia entre los modos de diseño", () => {
    render(<Project projectId="tesis" />);

    chooseLayout("Solo editor");
    expect(screen.queryByRole("region", { name: "Vista previa PDF" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Editor" })).toBeInTheDocument();

    chooseLayout("Solo PDF");
    expect(screen.queryByRole("region", { name: "Editor" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Vista previa PDF" })).toBeInTheDocument();
  });

  it("el riel abre y cierra el panel lateral", () => {
    render(<Project projectId="tesis" />);

    fireEvent.click(screen.getByRole("button", { name: "Archivos" }));
    expect(screen.queryByRole("tree")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Paquetes" }));
    expect(screen.getByRole("region", { name: "Paquetes" })).toBeInTheDocument();
  });

  it("Recompilar está en la barra superior y sigue visible en «Solo editor»", () => {
    render(<Project projectId="tesis" />);
    chooseLayout("Solo editor");
    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("button", { name: /Recompilar/ })).toBeInTheDocument();
  });

  it("el indicador de compilación abre el panel de registros", () => {
    render(<Project projectId="tesis" />);
    fireEvent.click(screen.getByRole("button", { name: /Registros: 1 errores, 3 advertencias/ }));
    expect(screen.getByRole("region", { name: "Registros y errores" })).toBeInTheDocument();
  });

  it("el PDF ya no tiene botón de descarga: se exporta desde Exportar", () => {
    render(<Project projectId="tesis" />);
    expect(screen.queryByRole("button", { name: "Descargar PDF" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Exportar/ }));
    expect(screen.getByRole("menuitem", { name: "Descargar PDF" })).toBeInTheDocument();
  });

  it("el desplegable de Recompilar cambia el compilador", () => {
    render(<Project projectId="tesis" />);

    fireEvent.click(screen.getByRole("button", { name: "Opciones de compilación" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "LuaLaTeX" }));
    expect(useProjectView.getState().compiler).toBe("lualatex");
  });

  it("abrir un archivo del árbol crea una pestaña", () => {
    render(<Project projectId="tesis" />);

    fireEvent.click(screen.getByRole("button", { name: "preambulo.tex" }));
    expect(screen.getByRole("tab", { name: "preambulo.tex" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
