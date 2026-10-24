import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockBackend, type MockBackend } from "../../lib/mockBackend";
import { setBackend } from "../../lib/tauri";
import { usePackages } from "../../store/packages";
import type { PackageHit } from "../../store/types";
import { resetApp } from "../../test/reset";
import { PackageBrowser } from "./PackageBrowser";

let backend: MockBackend;

const names = (list: HTMLElement) =>
  within(list)
    .getAllByRole("button", { expanded: false })
    .map((b) => b.querySelector(".font-mono")?.textContent);

async function openInstalled() {
  render(<PackageBrowser />);
  fireEvent.click(screen.getByRole("button", { name: "Paquetes instalados" }));
  return screen.findByRole("list", { name: "Paquetes instalados" });
}

describe("paquetes instalados", () => {
  beforeEach(async () => {
    resetApp();
    backend = createMockBackend();
    setBackend(backend);
    await usePackages.getState().loadBackends();
  });

  it("dos botones: buscar e instalados, con la lista por nombre", async () => {
    render(<PackageBrowser />);
    expect(screen.getByRole("button", { name: "Buscar paquetes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("searchbox")).toHaveAttribute(
      "placeholder",
      "Buscar en CTAN y TeX Live…",
    );
    fireEvent.click(screen.getByRole("button", { name: "Paquetes instalados" }));
    const list = await screen.findByRole("list", { name: "Paquetes instalados" });
    expect(names(list)).toEqual([
      "amsmath",
      "babel-spanish",
      "minted",
      "physics",
      "siunitx",
      "tikz-feynman",
    ]);
    expect(
      screen.getByText(/6 paquetes instalados\. Con pacman se instalan por colecciones/),
    ).toBeInTheDocument();
  });

  it("se filtra por nombre o descripción", async () => {
    await openInstalled();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "phys" } });
    expect(await screen.findByText(/^1 paquete instalado coincide\./)).toBeInTheDocument();
    expect(names(screen.getByRole("list", { name: "Paquetes instalados" }))).toEqual(["physics"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ornitorrinco" } });
    expect(
      await screen.findByText("Ningún paquete instalado coincide con «ornitorrinco»."),
    ).toBeInTheDocument();
  });

  it("las listas largas llegan por partes", async () => {
    const pkg = (i: number): PackageHit => ({
      name: `paquete${String(i).padStart(3, "0")}`,
      caption: "",
      version: null,
      license: null,
      inTexlive: true,
      inCtan: true,
      status: "installed",
      pacmanPackage: null,
      styles: [],
    });
    const list = vi
      .spyOn(backend, "installedPackages")
      .mockImplementation(async (_filter, limit) => ({
        total: 450,
        packages: Array.from({ length: Math.min(limit, 450) }, (_, i) => pkg(i)),
      }));
    await openInstalled();
    fireEvent.click(await screen.findByRole("button", { name: "Mostrar más (200 de 450)" }));
    expect(
      await screen.findByRole("button", { name: "Mostrar más (400 de 450)" }),
    ).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith("", 400);
    // Renders a few hundred rows: about 2 s alone, more with the whole suite in parallel.
  }, 15_000);

  it("al desinstalar desde la ficha, sale de la lista", async () => {
    await backend.installManagedTexlive();
    await usePackages.getState().loadBackends();
    const list = await openInstalled();
    fireEvent.click(within(list).getByText("physics"));
    fireEvent.click(within(list).getByRole("button", { name: "Desinstalar" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Desinstalar" }),
    );
    await waitFor(() => expect(within(list).queryByText("physics")).not.toBeInTheDocument());
    expect(screen.getByText("5 paquetes instalados.")).toBeInTheDocument();
  });

  it("«Ver en Paquetes» vuelve a la búsqueda con la ficha abierta", async () => {
    await openInstalled();
    await usePackages.getState().show("ctex");
    expect(await screen.findByRole("button", { name: "Documentación" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buscar paquetes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
