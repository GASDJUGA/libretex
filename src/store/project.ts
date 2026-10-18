import { create } from "zustand";
import { isWithin, remap } from "../lib/paths";
import type { PdfWord } from "../lib/pdf/sourceWord";
import type { Compiler } from "./types";

export type LayoutMode = "split" | "editor" | "pdf" | "detached";
export type SidePanel = "files" | "search" | "packages" | "logs" | "backup";
export type EditorMode = "code" | "visual";
export type TextRange = { line: number; column: number; endLine: number; endColumn: number };

type ProjectViewState = {
  layoutMode: LayoutMode;
  sidePanel: SidePanel;
  sidePanelOpen: boolean;
  openFiles: string[];
  activeFile: string | null;
  editorMode: EditorMode;
  /** Line of the cursor in the active file (1-based), for the outline. */
  cursorLine: number;
  /** The text editor is visible (not an image or error), so editing commands apply. */
  editorActive: boolean;
  /** Pending jump of the editor to a line (from the outline, logs, SyncTeX…). */
  goto: {
    path: string;
    line: number;
    word?: PdfWord;
    /** Text to select (a search result): 1-based lines, columns in UTF-16 units. */
    range?: TextRange;
    nonce: number;
  } | null;
  /** The history (5.7) is shown in place of the editor. */
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
  /** Pending SyncTeX jump from the editor's cursor to the PDF. */
  pdfSync: { path: string; line: number; nonce: number } | null;
  /** Asks the file tree to open one of its dialogs (from the «Archivo» menu). */
  treeRequest: { kind: "newFile" | "newFolder" | "upload"; nonce: number } | null;
  compiler: Compiler;
  draftMode: boolean;
  haltOnError: boolean;

  setLayoutMode: (mode: LayoutMode) => void;
  setCursorLine: (line: number) => void;
  requestTree: (kind: "newFile" | "newFolder" | "upload") => void;
  /**
   * Opens `path` and moves the editor's cursor to `line` (1-based). With `word` (a word
   * clicked in the PDF), it selects that word near the line instead.
   */
  goToLine: (path: string, line: number, word?: PdfWord) => void;
  /** Opens `path` and selects `range` (a search result). */
  goToRange: (path: string, range: TextRange) => void;
  /** Shows in the PDF the place produced by the cursor's line (SyncTeX). */
  syncToPdf: () => void;
  /** Selects a side panel; selecting the open one collapses the side area. */
  toggleSidePanel: (panel: SidePanel) => void;
  openSidePanel: (panel: SidePanel) => void;
  setSidePanelOpen: (open: boolean) => void;
  openFile: (path: string) => void;
  closeFile: (path: string) => void;
  /** Updates open tabs after `from` (a file or folder) was renamed or moved to `to`. */
  renamePath: (from: string, to: string) => void;
  /** Closes the tabs of `path` and everything inside it (it was deleted). */
  closeWithin: (path: string) => void;
  setCompiler: (compiler: Compiler) => void;
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
  cursorLine: 1,
  editorActive: false,
  historyOpen: false,
  treeRequest: null as ProjectViewState["treeRequest"],
  goto: null as ProjectViewState["goto"],
  pdfSync: null as ProjectViewState["pdfSync"],
  compiler: "xelatex" as Compiler,
  draftMode: false,
  haltOnError: false,
};

export const useProjectView = create<ProjectViewState>()((set) => ({
  ...initialProjectViewState,

  setLayoutMode: (layoutMode) => set({ layoutMode }),
  setHistoryOpen: (historyOpen) =>
    // The history replaces the editor: in «solo PDF» it would not be seen.
    set((s) => ({
      historyOpen,
      layoutMode: historyOpen && s.layoutMode === "pdf" ? "split" : s.layoutMode,
    })),
  setCursorLine: (cursorLine) => set({ cursorLine }),
  requestTree: (kind) => set({ treeRequest: { kind, nonce: Date.now() } }),
  goToLine: (path, line, word) =>
    set((s) => ({
      historyOpen: false,
      openFiles: s.openFiles.includes(path) ? s.openFiles : [...s.openFiles, path],
      activeFile: path,
      goto: { path, line, word, nonce: Date.now() + Math.random() },
    })),
  goToRange: (path, range) =>
    set((s) => ({
      historyOpen: false,
      openFiles: s.openFiles.includes(path) ? s.openFiles : [...s.openFiles, path],
      activeFile: path,
      goto: { path, line: range.line, range, nonce: Date.now() + Math.random() },
    })),
  syncToPdf: () =>
    set((s) =>
      s.activeFile
        ? {
            // The PDF must be visible to show the place.
            layoutMode: s.layoutMode === "editor" ? "split" : s.layoutMode,
            pdfSync: { path: s.activeFile, line: s.cursorLine, nonce: Date.now() + Math.random() },
          }
        : {},
    ),
  toggleSidePanel: (panel) =>
    set((s) =>
      s.sidePanel === panel && s.sidePanelOpen
        ? { sidePanelOpen: false }
        : { sidePanel: panel, sidePanelOpen: true },
    ),
  openSidePanel: (sidePanel) => set({ sidePanel, sidePanelOpen: true }),
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
  setDraftMode: (draftMode) => set({ draftMode }),
  setHaltOnError: (haltOnError) => set({ haltOnError }),
}));
