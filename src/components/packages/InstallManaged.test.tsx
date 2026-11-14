import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockBackend, type MockBackend } from "../../lib/mockBackend";
import { setBackend } from "../../lib/tauri";
import { usePackages } from "../../store/packages";
import { useTex } from "../../store/tex";
import { resetApp } from "../../test/reset";
import { BackendInfo } from "./BackendInfo";

let backend: MockBackend;

async function startInstall() {
  render(<BackendInfo />);
  fireEvent.click(await screen.findByRole("button", { name: "Instalar el TeX Live de JuTeX" }));
  // It asks first: it downloads from CTAN.
  expect(
    screen.getByText(/descargará el instalador oficial de TeX Live desde CTAN/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Descargar e instalar" }));
}

describe("Instalar el TeX Live de JuTeX", () => {
  beforeEach(() => {
    resetApp();
    backend = createMockBackend();
    setBackend(backend);
  });

  it("muestra el progreso y al terminar pasa a ser el backend activo", async () => {
    const texReload = vi.spyOn(useTex.getState(), "load");
    await startInstall();
    expect(await screen.findByRole("progressbar")).toBeInTheDocument();
    expect(await screen.findByText(/Instalando TeX Live: \w+/)).toBeInTheDocument();
    expect(await screen.findByText(/TeX Live de JuTeX instalado/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /TeX Live de JuTeX 2026/ })).toBeChecked(),
    );
    expect(usePackages.getState().backends?.active?.kind).toBe("managed");
    expect(texReload).toHaveBeenCalledWith(true);
    // The log kept the installer's output.
    expect(usePackages.getState().install.log).toContain("running mktexlsr ...");
  });

  it("se puede cancelar y luego reintentar", async () => {
    await startInstall();
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar la instalación" }));
    expect(
      await screen.findByText("Instalación cancelada. No quedó nada instalado."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar la instalación" })).toBeInTheDocument();
    expect(screen.getByText("TeX Live de pacman (solo lectura)")).toBeInTheDocument();
  });

  it("un error se informa con su texto", async () => {
    backend.installManagedTexlive = async () => {
      throw { code: "network", message: "dns" };
    };
    await startInstall();
    expect(await screen.findByText("La instalación no se completó.")).toBeInTheDocument();
    expect(
      screen.getByText("No se pudo descargar. Revisa la conexión a internet."),
    ).toBeInTheDocument();
    await act(async () => {});
  });
});
