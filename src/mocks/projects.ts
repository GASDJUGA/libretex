import type { Compiler, ProjectSummary } from "../store/types";

/** Sample data for the UI skeleton (Phase 1). Replaced by Tauri commands in Phase 2. */
export const mockProjects: ProjectSummary[] = [
  {
    id: "tesis",
    name: "Tesis de magíster",
    path: "~/LibreTeX/tesis",
    modifiedAt: "2026-10-07T18:42:00",
    compiler: "xelatex",
  },
  {
    id: "mecanica",
    name: "Apuntes de Mecánica Clásica",
    path: "~/LibreTeX/mecanica",
    modifiedAt: "2026-10-05T09:15:00",
    compiler: "xelatex",
  },
  {
    id: "tarea-3",
    name: "Tarea 3 — Electromagnetismo",
    path: "~/Documentos/universidad/tarea-3",
    modifiedAt: "2026-09-28T22:03:00",
    compiler: "pdflatex",
  },
  {
    id: "charla",
    name: "Presentación seminario",
    path: "~/LibreTeX/charla",
    modifiedAt: "2026-09-12T16:30:00",
    compiler: "lualatex",
  },
];

export const compilerLabels: Record<Compiler, string> = {
  pdflatex: "pdfLaTeX",
  xelatex: "XeLaTeX",
  lualatex: "LuaLaTeX",
};
