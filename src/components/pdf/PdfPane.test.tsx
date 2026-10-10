import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockBackend, type MockBackend } from "../../lib/mockBackend";
import { setBackend } from "../../lib/tauri";
import { useCompile } from "../../store/compile";
import { useProjects } from "../../store/projects";
import { useToasts } from "../../store/toasts";
import { resetApp } from "../../test/reset";
import { PdfPane } from "./PdfPane";

let backend: MockBackend;

describe("PdfPane (hasta el visor integrado)", () => {
  beforeEach(async () => {
    resetApp();
    backend = createMockBackend();
    setBackend(backend);
    const project = await useProjects.getState().open("tesis");
    useCompile.getState().reset(project.id);
    backend.onCompileEvent((e) => useCompile.getState().handleEvent(e));
  });

  it("dice dónde está el PDF y avisa si todavía no se compiló", async () => {
    render(<PdfPane />);
    expect(screen.getByText(/\.libretex\/build\/main\.pdf/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir PDF" }));
    await waitFor(() =>
      expect(useToasts.getState().toasts.map((t) => t.title)).toContain(
        "Todavía no hay un PDF compilado. Compila con Ctrl+Enter.",
      ),
    );
  });

  it("tras compilar abre el PDF con el visor del sistema y lo muestra en la carpeta", async () => {
    const open = vi.spyOn(backend, "openPdf");
    const reveal = vi.spyOn(backend, "revealPdf");
    render(<PdfPane />);
    await act(() => useCompile.getState().compileNow());
    expect(await screen.findByText("PDF compilado")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Mostrar en la carpeta" }));
    expect(open).toHaveBeenCalledWith("tesis");
    expect(reveal).toHaveBeenCalledWith("tesis");
    expect(useToasts.getState().toasts).toEqual([]);
  });
});
