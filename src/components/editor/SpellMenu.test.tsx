import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Project } from "../../app/Project";
import { createMockBackend, type MockBackend } from "../../lib/mockBackend";
import { makeChecker } from "../../lib/spell/checker";
import { setBackend } from "../../lib/tauri";
import { useProjects } from "../../store/projects";
import { setCheckerFactory } from "../../store/spell";
import { resetApp } from "../../test/reset";
import { SettingsTab } from "../home/SettingsTab";

let backend: MockBackend;
/** Words the fake dictionary does not know. */
const UNKNOWN = new Set(["Palabrra"]);

beforeEach(() => {
  resetApp();
  backend = createMockBackend();
  setBackend(backend);
  setCheckerFactory(() => {
    const personal = new Set<string>();
    return makeChecker({
      async request(type, payload) {
        if (type === "add") (payload as string[]).forEach((w) => personal.add(w));
        if (type === "remove") (payload as string[]).forEach((w) => personal.delete(w));
        if (type === "suggest") return ["Palabra", "Palabras"];
        if (type === "wrong")
          return (payload as string[]).filter((w) => UNKNOWN.has(w) && !personal.has(w));
        return [];
      },
      dispose() {},
    });
  });
});
afterAll(() => setCheckerFactory(() => makeChecker({ request: async () => [], dispose() {} })));

function editorView() {
  const dom = screen.getByTestId("code-editor").querySelector<HTMLElement>(".cm-editor")!;
  return EditorView.findFromDOM(dom)!;
}

const marks = () => [...document.querySelectorAll(".cm-spell-error")].map((e) => e.textContent);

async function openWithTypo() {
  render(<Project projectId="tesis" />);
  await screen.findByText(/Este documento es un ejemplo/);
  const view = editorView();
  act(() => view.dispatch({ changes: { from: 0, insert: "% x\nPalabrra y texto.\n" } }));
  await waitFor(() => expect(marks()).toEqual(["Palabrra"]));
  return view;
}

function rightClick(view: EditorView, pos: number) {
  vi.spyOn(view, "posAtCoords").mockReturnValue(pos);
  fireEvent.contextMenu(view.contentDOM, { clientX: 50, clientY: 60 });
}

describe("ortografía en el proyecto", () => {
  it("clic derecho: sugerencias que reemplazan la palabra", async () => {
    const view = await openWithTypo();
    rightClick(view, 6);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Palabra" }));
    expect(view.state.doc.toString().startsWith("% x\nPalabra y texto.")).toBe(true);
    await waitFor(() => expect(marks()).toEqual([]));
  });

  it("agregar al diccionario personal la acepta en adelante (y se puede quitar en Ajustes)", async () => {
    const view = await openWithTypo();
    rightClick(view, 6);
    await screen.findByRole("menuitem", { name: "Palabra" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Agregar «Palabrra» al diccionario" }));
    await waitFor(() => expect(marks()).toEqual([]));
    expect(await backend.personalDictionary()).toEqual(["Palabrra"]);

    render(<SettingsTab />);
    fireEvent.click(await screen.findByRole("button", { name: "Quitar «Palabrra»" }));
    await waitFor(() => expect(marks()).toEqual(["Palabrra"]));
    expect(await backend.personalDictionary()).toEqual([]);
  });

  it("el idioma se elige por proyecto en el menú Ver; «Sin revisión» quita las marcas", async () => {
    await openWithTypo();
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Sin revisión" }));
    await waitFor(() => expect(marks()).toEqual([]));
    expect(useProjects.getState().current?.spellLang).toBe("off");
    expect((await backend.listProjects()).find((p) => p.id === "tesis")?.spellLang).toBe("off");
  });
});
