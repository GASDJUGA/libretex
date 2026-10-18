import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Project } from "../app/Project";
import { useCompile } from "../store/compile";
import { useToasts } from "../store/toasts";
import { resetApp } from "../test/reset";

const lastToast = () => useToasts.getState().toasts.at(-1)?.title;

async function renderProject() {
  render(<Project projectId="tesis" />);
  await screen.findByText(/Este documento es un ejemplo/);
}

describe("exportar", () => {
  beforeEach(resetApp);

  it("Ctrl+Shift+S sin PDF pide compilar; después guarda una copia", async () => {
    await renderProject();
    fireEvent.keyDown(window, { key: "S", code: "KeyS", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(lastToast()).toBe("Todavía no hay PDF: compila con Ctrl+Enter."));
    await act(() => useCompile.getState().compileNow());
    await waitFor(() => expect(useCompile.getState().last?.status).toBe("success"));
    fireEvent.keyDown(window, { key: "S", code: "KeyS", ctrlKey: true, shiftKey: true });
    await waitFor(() =>
      expect(lastToast()).toBe("Guardado en ~/Documentos/Tesis de magíster.pdf."),
    );
  });

  it("Exportar → ZIP de fuentes", async () => {
    await renderProject();
    fireEvent.click(screen.getByRole("button", { name: /Exportar/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "ZIP de fuentes" }));
    await waitFor(() =>
      expect(lastToast()).toBe("Guardado en ~/Documentos/Tesis de magíster.zip."),
    );
  });

  it("también desde el menú Archivo", async () => {
    await renderProject();
    fireEvent.click(screen.getByRole("button", { name: "Archivo" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Exportar ZIP de fuentes/ }));
    await waitFor(() => expect(lastToast()).toMatch(/\.zip\.$/));
  });
});
