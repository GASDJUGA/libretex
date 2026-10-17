import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Project } from "../app/Project";
import { createMockBackend, type MockBackend } from "../lib/mockBackend";
import { setBackend } from "../lib/tauri";
import { resetApp } from "../test/reset";
import { useCompile } from "./compile";
import { autoSnapshot } from "./history";
import { useToasts } from "./toasts";

let backend: MockBackend;

beforeEach(() => {
  resetApp();
  backend = createMockBackend();
  setBackend(backend);
});

function editorView() {
  const dom = screen.getByTestId("code-editor").querySelector<HTMLElement>(".cm-editor")!;
  return EditorView.findFromDOM(dom)!;
}

async function renderProject() {
  render(<Project projectId="tesis" />);
  await screen.findByText(/Este documento es un ejemplo/);
}

describe("historial del proyecto", () => {
  it("Archivo → Guardar versión… guarda los cambios y una versión con nombre", async () => {
    await renderProject();
    act(() => editorView().dispatch({ changes: { from: 0, insert: "% cambio\n" } }));
    fireEvent.click(screen.getByRole("button", { name: "Archivo" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Guardar versión…" }));
    const dialog = await screen.findByRole("dialog", { name: "Guardar versión" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Nombre de la versión" }), {
      target: { value: "  Entrega 1 " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(useToasts.getState().toasts.at(-1)?.title).toBe("Versión «Entrega 1» guardada."),
    );
    const [version] = await backend.historyList("tesis");
    expect(version).toMatchObject({ kind: "manual", name: "Entrega 1" });
    // The edit was saved before recording it.
    expect((await backend.readTextFile("tesis", "main.tex")).content).toMatch(/^% cambio/);
  });

  it("las automáticas solo cuando algo cambió", async () => {
    await renderProject();
    await act(() => autoSnapshot(["tesis"]));
    await act(() => autoSnapshot(["tesis"]));
    expect(await backend.historyList("tesis")).toHaveLength(1);
    act(() => editorView().dispatch({ changes: { from: 0, insert: "% otro\n" } }));
    await act(() => autoSnapshot(["tesis"]));
    const versions = await backend.historyList("tesis");
    expect(versions.map((v) => v.kind)).toEqual(["auto", "auto"]);
  });

  it("una compilación correcta deja una versión", async () => {
    await renderProject();
    fireEvent.click(screen.getByRole("button", { name: /Recompilar/ }));
    await waitFor(() => expect(useCompile.getState().last?.status).toBe("success"));
    await waitFor(async () =>
      expect((await backend.historyList("tesis")).map((v) => v.kind)).toEqual(["compile"]),
    );
  });
});
