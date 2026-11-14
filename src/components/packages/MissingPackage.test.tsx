import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Project } from "../../app/Project";
import type { MockBackend } from "../../lib/mockBackend";
import { getBackend } from "../../lib/tauri";
import { useCompile } from "../../store/compile";
import { usePackages } from "../../store/packages";
import { useProjectView } from "../../store/project";
import { resetApp } from "../../test/reset";
import { MissingPackage } from "./MissingPackage";

const backend = () => getBackend() as MockBackend;

/** Opens «tesis», adds `\usepackage{ctex}` (not installed) and compiles: ctex.sty is missing. */
async function compileWithMissingPackage() {
  render(<Project projectId="tesis" />);
  await screen.findByText(/Este documento es un ejemplo/);
  const dom = screen.getByTestId("code-editor").querySelector<HTMLElement>(".cm-editor")!;
  const view = EditorView.findFromDOM(dom)!;
  act(() => {
    const line = view.state.doc.line(2);
    view.dispatch({ changes: { from: line.from, insert: "\\usepackage{ctex}\n" } });
  });
  fireEvent.click(screen.getByRole("button", { name: /Recompilar/ }));
  await waitFor(() => expect(useCompile.getState().last?.status).toBe("failed"));
  act(() => useProjectView.getState().openSidePanel("logs"));
}

describe(".sty faltante → instalar → recompilar", () => {
  beforeEach(resetApp);

  it("con el TeX Live de JuTeX: un clic instala el paquete y vuelve a compilar", async () => {
    await backend().installManagedTexlive();
    const operation = vi.spyOn(backend(), "packageOperation");
    const compile = vi.spyOn(backend(), "compileProject");
    await compileWithMissingPackage();
    expect(await screen.findByText("ctex.sty es parte del paquete «ctex».")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Instalar «ctex» y recompilar" }));
    // The simulated install takes a few steps: with the whole suite running it can pass 1 s.
    await waitFor(() => expect(compile).toHaveBeenCalledTimes(2), { timeout: 5000 });
    expect(operation).toHaveBeenCalledWith("install", "ctex");
    await waitFor(() => expect(useCompile.getState().last?.status).toBe("success"), {
      timeout: 5000,
    });
  });

  it("con pacman: el comando para copiar y, tras instalarlo, «ya está instalado»", async () => {
    await compileWithMissingPackage();
    expect(await screen.findByLabelText("Comando para la terminal")).toHaveTextContent(
      "sudo pacman -S texlive-langchinese",
    );
    expect(screen.queryByRole("button", { name: /Instalar «ctex»/ })).not.toBeInTheDocument();
    backend().pacmanInstall("texlive-langchinese");
    fireEvent.click(screen.getByRole("button", { name: "Volver a comprobar" }));
    expect(await screen.findByText(/Ya está instalado: vuelve a compilar/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Comando para la terminal")).not.toBeInTheDocument();
  });

  it("«Ver en Paquetes» abre el panel con la ficha del paquete", async () => {
    await compileWithMissingPackage();
    fireEvent.click(await screen.findByRole("button", { name: "Ver en Paquetes" }));
    expect(useProjectView.getState().sidePanel).toBe("packages");
    expect(await screen.findByRole("button", { name: "Documentación" })).toBeInTheDocument();
    expect(usePackages.getState().selected).toBe("ctex");
  });

  it("un archivo que ningún paquete conocido trae: buscarlo en el gestor", async () => {
    render(<MissingPackage file="rarisimo.sty" />);
    expect(
      await screen.findByText("No se sabe qué paquete trae rarisimo.sty."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Buscar en Paquetes" }));
    expect(useProjectView.getState().sidePanel).toBe("packages");
    await waitFor(() => expect(usePackages.getState().query).toBe("rarisimo"));
  });
});
