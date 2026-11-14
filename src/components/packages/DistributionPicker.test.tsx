import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockBackend, type MockBackend } from "../../lib/mockBackend";
import { setBackend } from "../../lib/tauri";
import { usePackages } from "../../store/packages";
import { useTex } from "../../store/tex";
import { resetApp } from "../../test/reset";
import { BackendInfo } from "./BackendInfo";

let backend: MockBackend;

describe("elegir la distribución TeX", () => {
  beforeEach(() => {
    resetApp();
    backend = createMockBackend();
    setBackend(backend);
  });

  it("solo con el TeX del sistema no hay nada que elegir", async () => {
    render(<BackendInfo />);
    expect(await screen.findByText("TeX Live de pacman (solo lectura)")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("con los dos, se puede volver al de pacman y otra vez al de JuTeX", async () => {
    await backend.installManagedTexlive();
    const choose = vi.spyOn(backend, "setTexDistribution");
    const texReload = vi.spyOn(useTex.getState(), "load");
    render(<BackendInfo />);
    const jutexOption = await screen.findByRole("radio", { name: /TeX Live de JuTeX 2026/ });
    const pacman = screen.getByRole("radio", { name: /TeX Live de pacman/ });
    expect(jutexOption).toBeChecked();
    // Both are in the picker: no «También encontrado» nor the install button.
    expect(screen.queryByText(/También encontrado/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Instalar el TeX Live/ })).toBeNull();

    fireEvent.click(pacman);
    await waitFor(() => expect(pacman).toBeChecked());
    expect(choose).toHaveBeenCalledWith("system");
    expect(usePackages.getState().backends?.active?.kind).toBe("pacman");
    expect(texReload).toHaveBeenCalledWith(true);
    expect(screen.getByText(/JuTeX no puede modificar este TeX/)).toBeInTheDocument();

    fireEvent.click(jutexOption);
    await waitFor(() => expect(jutexOption).toBeChecked());
    expect(choose).toHaveBeenLastCalledWith("jutex");
    expect(usePackages.getState().backends?.active?.kind).toBe("managed");
  });

  it("no se cambia mientras se instala un paquete", async () => {
    await backend.installManagedTexlive();
    render(<BackendInfo />);
    const pacman = await screen.findByRole("radio", { name: /TeX Live de pacman/ });
    usePackages.setState((s) => ({ operation: { ...s.operation, running: true } }));
    await waitFor(() => expect(pacman).toBeDisabled());
  });
});
