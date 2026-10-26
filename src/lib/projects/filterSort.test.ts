import { describe, expect, it } from "vitest";
import type { ProjectSummary } from "../../store/types";
import { filterAndSortProjects, normalize } from "./filterSort";

const project = (
  id: string,
  name: string,
  modifiedAt: string,
  openedAt: string,
  path = `~/LibreTeX/${id}`,
): ProjectSummary => ({
  id,
  name,
  path,
  displayPath: path,
  modifiedAt: new Date(modifiedAt).getTime(),
  openedAt: new Date(openedAt).getTime(),
  compiler: "xelatex",
  mainFile: "main.tex",
  spellLang: "es",
  missing: false,
  trusted: true,
  figuresDir: "",
});

const projects = [
  project("a", "Álgebra lineal", "2026-01-03T10:00:00", "2026-01-01T10:00:00"),
  project("b", "Tesis", "2026-01-01T10:00:00", "2026-01-05T10:00:00"),
  project("c", "electromagnetismo", "2026-01-02T10:00:00", "2026-01-02T10:00:00", "~/uni/em"),
];

const ids = (list: ProjectSummary[]) => list.map((p) => p.id);

describe("normalize", () => {
  it("quita tildes y mayúsculas", () => {
    expect(normalize("Álgebra ÑANDÚ")).toBe("algebra nandu");
  });
});

describe("filterAndSortProjects", () => {
  it("ordena por apertura más reciente", () => {
    expect(ids(filterAndSortProjects(projects, "", "recent"))).toEqual(["b", "c", "a"]);
  });

  it("ordena por fecha de modificación", () => {
    expect(ids(filterAndSortProjects(projects, "", "modified"))).toEqual(["a", "c", "b"]);
  });

  it("ordena por nombre ignorando tildes y mayúsculas", () => {
    expect(ids(filterAndSortProjects(projects, "", "name"))).toEqual(["a", "c", "b"]);
  });

  it("busca sin distinguir tildes", () => {
    expect(ids(filterAndSortProjects(projects, "algebra", "name"))).toEqual(["a"]);
  });

  it("busca también en la ruta y exige todas las palabras", () => {
    expect(ids(filterAndSortProjects(projects, "uni em", "name"))).toEqual(["c"]);
    expect(ids(filterAndSortProjects(projects, "tesis em", "name"))).toEqual([]);
  });

  it("no modifica la lista original", () => {
    const copy = [...projects];
    filterAndSortProjects(projects, "", "name");
    expect(projects).toEqual(copy);
  });
});
