import { create } from "zustand";
import { isWithin, remap } from "../lib/paths";
import type { Compiler } from "./types";

export type LayoutMode = "split" | "editor" | "pdf" | "detached";
export type SidePanel = "files" | "search" | "packages" | "logs";
export type EditorMode = "code" | "visual";

type ProjectViewState = {
  layoutMode: LayoutMode;
  sidePanel: SidePanel;
  sidePanelOpen: boolean;
  openFiles: string[];
  activeFile: string | null;
  editorMode: EditorMode;
  compiler: Compiler;
  autoCompile: boolean;
  draftMode: boolean;
  haltOnError: boolean;

  setLayoutMode: (mode: LayoutMode) => void;
  /** Selects a side panel; selecting the open one collapses the side area. */
  toggleSidePanel: (panel: SidePanel) => void;
  setSidePanelOpen: (open: boolean) => void;
  openFile: (path: string) => void;
  closeFile: (path: string) => void;
  /** Updates open tabs after `from` (a file or folder) was renamed or moved to `to`. */
  renamePath: (from: string, to: string) => void;
  /** Closes the tabs of `path` and everything inside it (it was deleted). */
  closeWithin: (path: string) => void;
  setCompiler: (compiler: Compiler) => void;
  setAutoCompile: (on: boolean) => void;
  setDraftMode: (on: boolean) => void;
  setHaltOnError: (on: boolean) => void;
};

export const initialProjectViewState = {
  layoutMode: "split" as LayoutMode,
  sidePanel: "files" as SidePanel,
  sidePanelOpen: true,
  openFiles: ["main.tex", "capitulos/introduccion.tex"],
  activeFile: "main.tex" as string | null,
  editorMode: "code" as EditorMode,
  compiler: "xelatex" as Compiler,
  autoCompile: true,
  draftMode: false,
  haltOnError: false,
};

export const useProjectView = create<ProjectViewState>()((set) => ({
  ...initialProjectViewState,

  setLayoutMode: (layoutMode) => set({ layoutMode }),
  toggleSidePanel: (panel) =>
    set((s) =>
      s.sidePanel === panel && s.sidePanelOpen
        ? { sidePanelOpen: false }
        : { sidePanel: panel, sidePanelOpen: true },
    ),
  setSidePanelOpen: (sidePanelOpen) => set({ sidePanelOpen }),
  openFile: (path) =>
    set((s) => ({
      openFiles: s.openFiles.includes(path) ? s.openFiles : [...s.openFiles, path],
      activeFile: path,
    })),
  closeFile: (path) =>
    set((s) => {
      const index = s.openFiles.indexOf(path);
      const openFiles = s.openFiles.filter((p) => p !== path);
      const activeFile =
        s.activeFile === path
          ? (openFiles[Math.min(index, openFiles.length - 1)] ?? null)
          : s.activeFile;
      return { openFiles, activeFile };
    }),
  renamePath: (from, to) =>
    set((s) => ({
      openFiles: s.openFiles.map((p) => remap(p, from, to)),
      activeFile: s.activeFile === null ? null : remap(s.activeFile, from, to),
    })),
  closeWithin: (path) =>
    set((s) => {
      const openFiles = s.openFiles.filter((p) => !isWithin(p, path));
      const activeFile =
        s.activeFile !== null && isWithin(s.activeFile, path)
          ? (openFiles[openFiles.length - 1] ?? null)
          : s.activeFile;
      return { openFiles, activeFile };
    }),
  setCompiler: (compiler) => set({ compiler }),
  setAutoCompile: (autoCompile) => set({ autoCompile }),
  setDraftMode: (draftMode) => set({ draftMode }),
  setHaltOnError: (haltOnError) => set({ haltOnError }),
}));
