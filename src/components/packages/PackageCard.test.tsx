import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockBackend, type MockBackend } from "../../lib/mockBackend";
import { setBackend } from "../../lib/tauri";
import { useBuffers } from "../../store/buffers";
import { usePackages } from "../../store/packages";
import { useProjectView } from "../../store/project";
import { useProjects } from "../../store/projects";
import { useToasts } from "../../store/toasts";
import { resetApp } from "../../test/reset";
import { PackageSearch } from "./PackageSearch";

let backend: MockBackend;

/** Searches `query` and opens the card of `name`; returns the card's list item. */
async function openCard(query: string, name: string) {
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: query } });
  const list = await screen.findByRole("list", { name: "Resultados de la búsqueda" });
  const item = within(list).getByText(name).closest("li")!;
  fireEvent.click(within(item).getAllByRole("button")[0]);
  return item as HTMLElement;
}

const lastToast = () => useToasts.getState().toasts.at(-1)?.title;

async function withManagedTexlive() {
  await backend.installManagedTexlive();
  await usePackages.getState().loadBackends();
}

describe("ficha de paquete", () => {
  beforeEach(async () => {
    resetApp();
    backend = createMockBackend();
    setBackend(backend);
    await usePackages.getState().loadBackends();
  });

  it("con el TeX Live de pacman solo ofrece documentación y copiar", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<PackageSearch />);
    const item = await openCard("physics", "physics");
    expect(within(item).getByText("Licencia")).toBeInTheDocument();
    expect(within(item).queryByRole("button", { name: "Instalar" })).not.toBeInTheDocument();
    expect(within(item).queryByRole("button", { name: "Desinstalar" })).not.toBeInTheDocument();
    // «Agregar al preámbulo» only in the project view.
    expect(
      within(item).queryByRole("button", { name: "Agregar al preámbulo" }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(item).getByRole("button", { name: "Copiar \\usepackage" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("\\usepackage{physics}"));
    fireEvent.click(within(item).getByRole("button", { name: "Documentación" }));
    await waitFor(() => expect(lastToast()).toMatch(/página del paquete en CTAN/));

    // Clicking the result again closes the card.
    fireEvent.click(within(item).getAllByRole("button")[0]);
    expect(within(item).queryByText("Licencia")).not.toBeInTheDocument();
  });

  it("instala un paquete con progreso y el estado pasa a instalado", async () => {
    await withManagedTexlive();
    const operation = vi.spyOn(backend, "packageOperation");
    render(<PackageSearch />);
    const item = await openCard("ctex", "ctex");
    fireEvent.click(within(item).getByRole("button", { name: "Instalar" }));
    expect(await within(item).findByRole("progressbar")).toBeInTheDocument();
    expect(await within(item).findByText("Instalado.")).toBeInTheDocument();
    expect(operation).toHaveBeenCalledWith("install", "ctex");
    // The search was refreshed: the badge now says installed and the card offers removal.
    await waitFor(() => expect(within(item).getAllByText("Instalado")).toHaveLength(1));
    expect(within(item).getByRole("button", { name: "Desinstalar" })).toBeInTheDocument();
  });

  it("buscar actualización, actualizar y desinstalar (con confirmación)", async () => {
    await withManagedTexlive();
    const operation = vi.spyOn(backend, "packageOperation");
    render(<PackageSearch />);
    const item = await openCard("physics", "physics");
    fireEvent.click(within(item).getByRole("button", { name: "Buscar actualización" }));
    expect(await within(item).findByText("Hay una actualización disponible.")).toBeInTheDocument();
    fireEvent.click(within(item).getByRole("button", { name: "Actualizar" }));
    expect(await within(item).findByText("Actualizado.")).toBeInTheDocument();
    expect(operation).toHaveBeenCalledWith("update", "physics");

    fireEvent.click(within(item).getByRole("button", { name: "Desinstalar" }));
    expect(screen.getByText("¿Desinstalar «physics»?")).toBeInTheDocument();
    expect(operation).toHaveBeenCalledTimes(1);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Desinstalar" }),
    );
    expect(await within(item).findByText("Desinstalado.")).toBeInTheDocument();
    expect(operation).toHaveBeenLastCalledWith("remove", "physics");
    await waitFor(() =>
      expect(within(item).getByRole("button", { name: "Instalar" })).toBeInTheDocument(),
    );
  });

  it("cancelar una instalación", async () => {
    await withManagedTexlive();
    render(<PackageSearch />);
    const item = await openCard("ctex", "ctex");
    fireEvent.click(within(item).getByRole("button", { name: "Instalar" }));
    fireEvent.click(await within(item).findByRole("button", { name: "Cancelar" }));
    expect(await within(item).findByText("Operación cancelada.")).toBeInTheDocument();
    expect(within(item).getByRole("button", { name: "Instalar" })).toBeEnabled();
  });

  it("un paquete solo de CTAN no se puede instalar con tlmgr", async () => {
    await withManagedTexlive();
    render(<PackageSearch />);
    const item = await openCard("tcolorbox", "tcolorbox-extra");
    expect(within(item).queryByRole("button", { name: "Instalar" })).not.toBeInTheDocument();
    expect(within(item).getByText(/no está en TeX Live/)).toBeInTheDocument();
  });

  it("agrega \\usepackage al preámbulo del archivo principal del proyecto", async () => {
    await useProjects.getState().open("tesis");
    useBuffers.getState().reset("tesis");
    const write = vi.spyOn(backend, "writeTextFile");
    render(<PackageSearch inProject />);
    const item = await openCard("physics", "physics");
    fireEvent.click(within(item).getByRole("button", { name: "Agregar al preámbulo" }));
    await waitFor(() =>
      expect(lastToast()).toBe(
        "Se agregó \\usepackage{physics} al preámbulo del archivo principal.",
      ),
    );
    const text = useBuffers.getState().buffers["main.tex"].content;
    const lines = text.split("\n");
    const at = lines.indexOf("\\usepackage{physics}");
    expect(lines[at - 1]).toBe("\\usepackage{hyperref}");
    expect(write).toHaveBeenCalledWith("tesis", "main.tex", text);
    expect(useProjectView.getState().goto).toMatchObject({ path: "main.tex", line: at + 1 });

    // A second time it is already there.
    fireEvent.click(within(item).getByRole("button", { name: "Agregar al preámbulo" }));
    await waitFor(() => expect(lastToast()).toBe("El archivo principal ya carga «physics»."));
  });

  it("con pacman: comando para copiar y volver a comprobar sin red", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const reload = vi.spyOn(backend, "reloadPackageStatus");
    render(<PackageSearch />);
    const item = await openCard("ctex", "ctex");
    expect(within(item).getByLabelText("Comando para la terminal")).toHaveTextContent(
      "sudo pacman -S texlive-langchinese",
    );
    expect(within(item).getByText(/JuTeX nunca ejecuta sudo/)).toBeInTheDocument();
    fireEvent.click(within(item).getByRole("button", { name: "Copiar" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("sudo pacman -S texlive-langchinese"),
    );

    // The user ran it in a terminal; checking again reads the status (no network).
    backend.pacmanInstall("texlive-langchinese");
    fireEvent.click(within(item).getByRole("button", { name: "Volver a comprobar" }));
    await waitFor(() => expect(within(item).getByText("Instalado")).toBeInTheDocument());
    expect(reload).toHaveBeenCalledTimes(1);
    expect(within(item).queryByLabelText("Comando para la terminal")).not.toBeInTheDocument();
    expect(within(item).getByText(/Se actualiza junto con el sistema/)).toBeInTheDocument();
  });

  it("con MacTeX (TeX Live oficial de solo lectura): sudo tlmgr install", async () => {
    const macTex = {
      kind: "officialReadOnly" as const,
      root: "/usr/local/texlive/2026",
      year: "2026",
      tlmgr: "/Library/TeX/texbin/tlmgr",
      writable: false,
    };
    const backends = { active: macTex, available: [macTex], choice: "auto" as const };
    vi.spyOn(backend, "packageBackends").mockResolvedValue(backends);
    usePackages.setState({ backends });
    render(<PackageSearch />);
    const item = await openCard("ctex", "ctex");
    expect(within(item).getByLabelText("Comando para la terminal")).toHaveTextContent(
      "sudo /Library/TeX/texbin/tlmgr install ctex",
    );
    expect(
      within(item).getByText(/solo se modifica con permisos de administrador/),
    ).toBeInTheDocument();
    expect(within(item).queryByRole("button", { name: "Instalar" })).not.toBeInTheDocument();
  });

  function withMiktex() {
    const miktex = {
      kind: "miktex" as const,
      root: "C:\\Users\\ana\\AppData\\Local\\Programs\\MiKTeX",
      year: null,
      tlmgr: "C:\\Users\\ana\\AppData\\Local\\Programs\\MiKTeX\\miktex\\bin\\x64\\miktex.exe",
      writable: true,
    };
    const backends = { active: miktex, available: [miktex], choice: "auto" as const };
    vi.spyOn(backend, "packageBackends").mockResolvedValue(backends);
    usePackages.setState({ backends });
  }

  it("con MiKTeX (Windows): se instala desde la ficha, sin comandos para copiar", async () => {
    withMiktex();
    render(<PackageSearch />);
    const item = await openCard("ctex", "ctex");
    expect(within(item).getByRole("button", { name: "Instalar" })).toBeEnabled();
    expect(within(item).queryByLabelText("Comando para la terminal")).not.toBeInTheDocument();
  });

  it("con MiKTeX: un paquete que no está en MiKTeX lo dice así", async () => {
    withMiktex();
    render(<PackageSearch />);
    const item = await openCard("tcolorbox", "tcolorbox-extra");
    expect(within(item).queryByRole("button", { name: "Instalar" })).not.toBeInTheDocument();
    expect(within(item).getByText(/no está en MiKTeX/)).toBeInTheDocument();
  });

  it("con pacman: paquetes que no están en TeX Live", async () => {
    render(<PackageSearch />);
    const item = await openCard("tcolorbox", "tcolorbox-extra");
    expect(within(item).getByText(/solo se puede instalar a mano desde CTAN/)).toBeInTheDocument();
    expect(within(item).queryByLabelText("Comando para la terminal")).not.toBeInTheDocument();
  });
});
