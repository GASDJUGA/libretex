import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Project } from "../../app/Project";
import { createMockBackend, type MockBackend } from "../../lib/mockBackend";
import { setBackend } from "../../lib/tauri";
import { useCompile } from "../../store/compile";
import { useToasts } from "../../store/toasts";
import { resetApp } from "../../test/reset";

let backend: MockBackend;

async function renderProject() {
  render(<Project projectId="tesis" />);
  await screen.findByText(/Este documento es un ejemplo/);
}

describe("Recompilar", () => {
  beforeEach(() => {
    resetApp();
    backend = createMockBackend();
    setBackend(backend);
  });

  it("compila, muestra el estado mientras corre y guarda el resultado", async () => {
    await renderProject();
    // The simulated run lasts a few milliseconds: watch the store instead of hoping to catch
    // the screen in time on a slow machine (the label is checked below with a set state).
    let sawRunning = false;
    const unsubscribe = useCompile.subscribe((state) => {
      if (state.running) sawRunning = true;
    });
    fireEvent.click(screen.getByRole("button", { name: /Recompilar/ }));
    await waitFor(() => expect(useCompile.getState().last?.status).toBe("success"));
    unsubscribe();
    expect(sawRunning).toBe(true);
    expect(screen.getByRole("button", { name: /Recompilar/ })).toBeInTheDocument();
    expect(useCompile.getState().output).toContain("Latexmk: Run number 1 of rule 'xelatex'");
  });

  it("mientras compila el botón lo dice", async () => {
    await renderProject();
    act(() => useCompile.setState({ running: true, runId: 1 }));
    expect(await screen.findByText("Compilando…")).toBeInTheDocument();
  });

  it("guarda los cambios pendientes antes de compilar", async () => {
    await renderProject();
    const dom = screen.getByTestId("code-editor").querySelector<HTMLElement>(".cm-editor")!;
    const view = EditorView.findFromDOM(dom)!;
    act(() => {
      view.dispatch({ changes: { from: view.state.doc.length, insert: "\n\\comandoinexistente" } });
    });
    fireEvent.click(screen.getByRole("button", { name: /Recompilar/ }));
    await waitFor(() => expect(useCompile.getState().last?.status).toBe("failed"));
    expect(useCompile.getState().last?.log).toMatch(/main\.tex:\d+: Undefined control sequence/);
  });

  it("Detener cancela la compilación", async () => {
    await renderProject();
    fireEvent.click(screen.getByRole("button", { name: /Recompilar/ }));
    fireEvent.click(await screen.findByTitle("Detener"));
    await waitFor(() => expect(useCompile.getState().last?.status).toBe("cancelled"));
  });

  it("la salida aparece en el panel de registros", async () => {
    await renderProject();
    fireEvent.click(screen.getByRole("button", { name: "Registros y errores" }));
    fireEvent.click(screen.getByRole("tab", { name: "Salida" }));
    expect(screen.getByText(/Compila el proyecto para ver aquí la salida/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Recompilar/ }));
    expect(await screen.findByText(/Run number 1 of rule/)).toBeInTheDocument();
  });

  it("limpiar archivos auxiliares avisa cuántos se borraron", async () => {
    await renderProject();
    fireEvent.click(screen.getByRole("button", { name: "Opciones de compilación" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Limpiar archivos auxiliares" }));
    // The toast lives in the store (no Toaster rendered here).
    await waitFor(() =>
      expect(useToasts.getState().toasts.at(-1)?.title).toBe(
        "Se eliminaron 3 archivos auxiliares.",
      ),
    );
  });
});
