import type { Compiler, ProjectSummary } from "../store/types";

const at = (iso: string) => new Date(iso).getTime();

/** Sample projects for the browser preview and tests (the app reads them from disk). */
export const mockProjects: ProjectSummary[] = [
  {
    id: "tesis",
    name: "Tesis de magíster",
    path: "/home/usuario/LibreTeX/Tesis de magíster",
    displayPath: "~/LibreTeX/Tesis de magíster",
    modifiedAt: at("2026-10-07T18:42:00"),
    openedAt: at("2026-10-08T10:20:00"),
    compiler: "xelatex",
    mainFile: "main.tex",
    missing: false,
    autoCompile: true,
  },
  {
    id: "mecanica",
    name: "Apuntes de Mecánica Clásica",
    path: "/home/usuario/LibreTeX/Apuntes de Mecánica Clásica",
    displayPath: "~/LibreTeX/Apuntes de Mecánica Clásica",
    modifiedAt: at("2026-10-05T09:15:00"),
    openedAt: at("2026-10-02T11:00:00"),
    compiler: "xelatex",
    mainFile: "main.tex",
    missing: false,
    autoCompile: true,
  },
  {
    id: "tarea-3",
    name: "Tarea 3 — Electromagnetismo",
    path: "/home/usuario/Documentos/universidad/tarea-3",
    displayPath: "~/Documentos/universidad/tarea-3",
    modifiedAt: at("2026-09-28T22:03:00"),
    openedAt: at("2026-10-06T19:45:00"),
    compiler: "pdflatex",
    mainFile: "tarea.tex",
    missing: false,
    autoCompile: true,
  },
  {
    id: "charla",
    name: "Presentación seminario",
    path: "/home/usuario/LibreTeX/Presentación seminario",
    displayPath: "~/LibreTeX/Presentación seminario",
    modifiedAt: null,
    openedAt: at("2026-09-12T16:31:00"),
    compiler: "lualatex",
    mainFile: "main.tex",
    missing: true,
    autoCompile: true,
  },
];

export const compilerLabels: Record<Compiler, string> = {
  pdflatex: "pdfLaTeX",
  xelatex: "XeLaTeX",
  lualatex: "LuaLaTeX",
};
