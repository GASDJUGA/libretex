import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { createMockBackend } from "../../lib/mockBackend";
import { setBackend } from "../../lib/tauri";
import type { PackageBackend } from "../../store/types";
import { resetApp } from "../../test/reset";
import { BackendInfo } from "./BackendInfo";

const managed: PackageBackend = {
  kind: "managed",
  root: "/home/u/.local/share/libretex/texlive/2026",
  year: "2026",
  tlmgr: "/home/u/.local/share/libretex/texlive/2026/bin/x86_64-linux/tlmgr",
  writable: true,
};

describe("BackendInfo", () => {
  beforeEach(() => resetApp());

  it("TeX Live de pacman: solo lectura, explica cómo instalar paquetes", async () => {
    render(<BackendInfo />);
    expect(await screen.findByText("TeX Live de pacman (solo lectura)")).toBeInTheDocument();
    expect(screen.getByText(/se instalan con pacman \(necesita sudo\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Instalar el TeX Live de LibreTeX" })).toBeEnabled();
  });

  it("TeX Live gestionado: activo, sin botón de instalar, y lista los demás", async () => {
    const backend = createMockBackend();
    const pacman = (await backend.packageBackends()).active!;
    backend.packageBackends = async () => ({ active: managed, available: [managed, pacman] });
    setBackend(backend);
    render(<BackendInfo />);
    expect(await screen.findByText("TeX Live de LibreTeX 2026")).toBeInTheDocument();
    expect(screen.getByText(/sin permisos de administrador/)).toBeInTheDocument();
    expect(
      screen.getByText("También encontrado: TeX Live de pacman (solo lectura)"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("sin TeX", async () => {
    const backend = createMockBackend();
    backend.packageBackends = async () => ({ active: null, available: [] });
    setBackend(backend);
    render(<BackendInfo />);
    expect(await screen.findByText("No se encontró una distribución TeX")).toBeInTheDocument();
  });
});
