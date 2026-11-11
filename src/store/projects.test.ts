import { beforeEach, describe, expect, it } from "vitest";
import { createMockBackend } from "../lib/mockBackend";
import { setBackend } from "../lib/tauri";
import { mockProjects } from "../mocks/projects";
import { initialProjectsState, useProjects } from "./projects";
import { filterAndSortProjects } from "../lib/projects/filterSort";

const names = () => useProjects.getState().projects.map((p) => p.name);

describe("useProjects", () => {
  beforeEach(async () => {
    setBackend(createMockBackend());
    useProjects.setState(initialProjectsState);
    await useProjects.getState().load();
  });

  it("carga proyectos y plantillas", () => {
    const s = useProjects.getState();
    expect(s.status).toBe("ready");
    expect(s.projects).toHaveLength(mockProjects.length);
    expect(s.templates.find((t) => t.default)?.id).toBe("articulo-xelatex-es");
  });

  it("crear agrega el proyecto y respeta la plantilla", async () => {
    const p = await useProjects.getState().create("Nuevo", "beamer");
    expect(p.compiler).toBe("xelatex");
    expect(names()).toContain("Nuevo");
  });

  it("los errores del backend se propagan con su código", async () => {
    await expect(useProjects.getState().create("Tesis de magíster", null)).rejects.toMatchObject({
      code: "alreadyExists",
    });
    await expect(useProjects.getState().create("a/b", null)).rejects.toMatchObject({
      code: "invalidName",
    });
  });

  it("abrir marca el proyecto como actual y actualiza su fecha", async () => {
    const before = useProjects.getState().projects.find((p) => p.id === "mecanica")!.openedAt!;
    const p = await useProjects.getState().open("mecanica");
    expect(useProjects.getState().current?.id).toBe("mecanica");
    expect(p.openedAt!).toBeGreaterThan(before);
  });

  it("renombra, duplica y quita de la lista", async () => {
    const { rename, duplicate, trash, forget } = useProjects.getState();
    await rename("tesis", "Tesis final");
    const copy = await duplicate("tesis");
    expect(copy.name).toBe("Tesis final (copia)");
    // The copy goes first among the recent ones (pedido del usuario).
    expect(filterAndSortProjects(useProjects.getState().projects, "", "recent")[0].id).toBe(
      copy.id,
    );
    await trash(copy.id);
    await forget("charla");
    expect(names()).toEqual([
      "Tesis final",
      "Apuntes de Mecánica Clásica",
      "Tarea 3 — Electromagnetismo",
    ]);
  });

  it("abrir carpeta devuelve los candidatos a archivo principal", async () => {
    const r = await useProjects.getState().openFolder("t");
    expect(r?.candidates).toEqual(["main.tex", "anexo.tex"]);
    const p = await useProjects.getState().setMainFile(r!.project.id, "anexo.tex");
    expect(p.mainFile).toBe("anexo.tex");
  });
});
