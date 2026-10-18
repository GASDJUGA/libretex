import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Project } from "../app/Project";
import { createMockBackend, type MockBackend } from "../lib/mockBackend";
import { setBackend } from "../lib/tauri";
import { resetApp } from "../test/reset";
import { useBuffers } from "./buffers";
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

describe("panel de historial", () => {
  async function versionsOfTwoEdits() {
    await renderProject();
    await act(() => autoSnapshot(["tesis"]));
    act(() => editorView().dispatch({ changes: { from: 0, insert: "% segunda\n" } }));
    await act(() => autoSnapshot(["tesis"]));
    fireEvent.click(screen.getByRole("button", { name: /Historial/ }));
    return screen.findByRole("region", { name: "Historial" });
  }

  it("lista las versiones, muestra qué cambió y su diferencia", async () => {
    const panel = await versionsOfTwoEdits();
    const items = await within(panel).findAllByRole("button", { name: /Versión automática/ });
    expect(items).toHaveLength(2);
    fireEvent.click(items[0]);
    const file = await within(panel).findByRole("tab", { name: /main\.tex/ });
    expect(file).toHaveAttribute("aria-selected", "true");
    const diff = await within(panel).findByTestId("history-diff");
    await waitFor(() =>
      expect(diff.querySelector(".cm-insertedLine, .cm-changedLine")).not.toBeNull(),
    );
    expect(diff.textContent).toContain("% segunda");
  });

  it("restaurar el proyecto vuelve al contenido de esa versión y guarda antes lo actual", async () => {
    const panel = await versionsOfTwoEdits();
    const items = await within(panel).findAllByRole("button", { name: /Versión automática/ });
    // The oldest: before «% segunda».
    fireEvent.click(items[1]);
    fireEvent.click(await within(panel).findByRole("button", { name: "Restaurar el proyecto" }));
    const dialog = await screen.findByRole("dialog", { name: "¿Restaurar el proyecto?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Restaurar el proyecto" }));
    await waitFor(async () =>
      expect((await backend.readTextFile("tesis", "main.tex")).content).not.toMatch(/^% segunda/),
    );
    // The open file shows it too, and the history keeps what there was.
    await waitFor(() =>
      expect(useBuffers.getState().buffers["main.tex"].content).not.toMatch(/^% segunda/),
    );
    expect((await backend.historyList("tesis"))[0].name).toBe("Antes de restaurar el proyecto");
    expect(await within(panel).findByText("Antes de restaurar el proyecto")).toBeInTheDocument();
  });

  it("restaurar un archivo y volver al editor", async () => {
    const panel = await versionsOfTwoEdits();
    const items = await within(panel).findAllByRole("button", { name: /Versión automática/ });
    fireEvent.click(items[1]);
    fireEvent.click(await within(panel).findByRole("tab", { name: /^A ?main\.tex$/ }));
    await waitFor(() =>
      expect(within(panel).getByRole("tab", { name: /^A ?main\.tex$/ })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    fireEvent.click(await within(panel).findByRole("button", { name: "Restaurar este archivo" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Restaurar este archivo",
      }),
    );
    await waitFor(async () =>
      expect((await backend.readTextFile("tesis", "main.tex")).content).not.toMatch(/^% segunda/),
    );
    fireEvent.click(within(panel).getByRole("button", { name: "Volver al editor" }));
    await waitFor(() => expect(editorView().state.doc.toString()).not.toMatch(/^% segunda/));
  });
});
