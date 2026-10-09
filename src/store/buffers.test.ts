import { beforeEach, describe, expect, it } from "vitest";
import { createMockBackend, type MockBackend } from "../lib/mockBackend";
import { setBackend } from "../lib/tauri";
import { initialBuffersState, useBuffers } from "./buffers";

let backend: MockBackend;
const state = () => useBuffers.getState();

describe("useBuffers", () => {
  beforeEach(async () => {
    backend = createMockBackend();
    setBackend(backend);
    useBuffers.setState(initialBuffersState);
    state().reset("tesis");
    await state().load("preambulo.tex");
  });

  it("carga, edita y guarda", async () => {
    const original = state().buffers["preambulo.tex"].content;
    state().setContent("preambulo.tex", "nuevo");
    expect(state().buffers["preambulo.tex"]).toEqual({ content: "nuevo", saved: original });
    await state().save("preambulo.tex");
    expect(state().buffers["preambulo.tex"].saved).toBe("nuevo");
    expect((await backend.readTextFile("tesis", "preambulo.tex")).content).toBe("nuevo");
  });

  it("recarga en silencio un archivo sin cambios", async () => {
    backend.externalChange("tesis", "preambulo.tex", "desde fuera");
    await state().applyDiskChanges(["preambulo.tex"]);
    expect(state().buffers["preambulo.tex"].content).toBe("desde fuera");
    expect(state().conflicts).toEqual([]);
  });

  it("nuestro propio guardado no genera conflicto", async () => {
    state().setContent("preambulo.tex", "mío");
    await state().save("preambulo.tex");
    await state().applyDiskChanges(["preambulo.tex"]);
    expect(state().conflicts).toEqual([]);
  });

  it("conflicto con cambios sin guardar: conservar los míos o cargar el disco", async () => {
    state().setContent("preambulo.tex", "mío");
    backend.externalChange("tesis", "preambulo.tex", "suyo");
    await state().applyDiskChanges(["preambulo.tex"]);
    expect(state().conflicts).toEqual([{ path: "preambulo.tex", kind: "changed", disk: "suyo" }]);

    state().resolveConflict("preambulo.tex", "mine");
    expect(state().buffers["preambulo.tex"]).toEqual({ content: "mío", saved: "suyo" });
    expect(state().conflicts).toEqual([]);

    backend.externalChange("tesis", "preambulo.tex", "otra vez");
    await state().applyDiskChanges(["preambulo.tex"]);
    state().resolveConflict("preambulo.tex", "disk");
    expect(state().buffers["preambulo.tex"]).toEqual({ content: "otra vez", saved: "otra vez" });
  });

  it("archivo borrado: se cierra si no hay cambios, si los hay pregunta", async () => {
    await state().load("main.tex");
    state().setContent("main.tex", "editado");
    backend.externalChange("tesis", "preambulo.tex", null);
    backend.externalChange("tesis", "main.tex", null);
    const closed = await state().applyDiskChanges(["preambulo.tex", "main.tex"]);
    expect(closed).toEqual(["preambulo.tex"]);
    expect(state().buffers["preambulo.tex"]).toBeUndefined();
    expect(state().conflicts).toEqual([{ path: "main.tex", kind: "deleted" }]);

    state().resolveConflict("main.tex", "mine");
    expect(state().buffers["main.tex"].content).toBe("editado");
  });

  it("los archivos binarios guardan el error y no se reintentan en bucle", async () => {
    await state().load("figuras/montaje.png");
    expect(state().errors["figuras/montaje.png"]).toMatch(/no es de texto/);
    await state().load("figuras/montaje.png");
    expect(state().buffers["figuras/montaje.png"]).toBeUndefined();
  });
});
