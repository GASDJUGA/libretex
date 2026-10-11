import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockBackend, type MockBackend } from "../../lib/mockBackend";
import { setBackend } from "../../lib/tauri";
import { resetApp } from "../../test/reset";
import { PackageSearch } from "./PackageSearch";

let backend: MockBackend;

describe("PackageSearch", () => {
  beforeEach(() => {
    resetApp();
    backend = createMockBackend();
    setBackend(backend);
  });

  it("busca por nombre o descripción y muestra el estado de cada paquete", async () => {
    render(<PackageSearch />);
    expect(screen.getByText(/Escribe el nombre de un paquete/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "chinese" } });
    const list = await screen.findByRole("list", { name: "Resultados de la búsqueda" });
    const ctex = within(list).getByText("ctex").closest("li")!;
    expect(within(ctex).getByText("No instalado")).toBeInTheDocument();
    expect(
      within(ctex).getByText("Se instala con pacman: texlive-langchinese"),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "physics" } });
    await waitFor(() => expect(screen.queryByText("ctex")).not.toBeInTheDocument());
    const physics = screen.getByText("physics").closest("li")!;
    expect(within(physics).getByText("Instalado")).toBeInTheDocument();
  });

  it("espera a que se deje de escribir y descarta respuestas viejas", async () => {
    const search = vi.spyOn(backend, "searchPackages");
    render(<PackageSearch />);
    const box = screen.getByRole("searchbox");
    for (const value of ["s", "si", "siu", "siunitx"]) fireEvent.change(box, { target: { value } });
    await screen.findByText("siunitx");
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("siunitx");
  });

  it("sin resultados y paquetes solo de CTAN", async () => {
    render(<PackageSearch />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ornitorrinco" } });
    expect(await screen.findByText("Sin resultados para «ornitorrinco».")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "tcolorbox" } });
    expect(await screen.findByText("solo en CTAN")).toBeInTheDocument();
  });

  it("el índice de CTAN se descarga solo a pedido", async () => {
    const refresh = vi.spyOn(backend, "refreshPackageCatalog");
    render(<PackageSearch />);
    expect(
      await screen.findByText("Sin índice de CTAN: se busca solo en TeX Live."),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Descargar índice de CTAN" }));
    expect(
      await screen.findByText(/Índice de CTAN del .* \(7104 paquetes\)\./),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar" })).toBeInTheDocument();
  });
});
