/**
 * Several projects open at once, as tabs (pedido del usuario: pasar de un proyecto a otro sin
 * volver al inicio). The project stores (view, buffers, compilation, files, index, search)
 * hold the project on screen; switching tabs keeps a snapshot of the one left and restores
 * the other's, so each tab keeps its open files, edits, logs and search. A compilation of a
 * tab in the background keeps going and its result is stored in that tab's snapshot.
 */
import { create } from "zustand";
import { dropEditorStates } from "../editor/stateCache";
import { getBackend } from "../lib/tauri";
import { useAppStore } from "./app";
import { useBuffers } from "./buffers";
import { applyCompileEvent, useCompile } from "./compile";
import { useProjectFiles } from "./files";
import { loadedProject, setLoadedProject } from "./loadedProject";
import { useProjectView } from "./project";
import { useProjectIndex } from "./projectIndex";
import { useProjects } from "./projects";
import { useSearch } from "./search";
import type { CompileEvent } from "./types";

/** Everything a project tab keeps while another one is on screen. */
export type Workspace = {
  view: ReturnType<typeof useProjectView.getState>;
  buffers: ReturnType<typeof useBuffers.getState>;
  compile: ReturnType<typeof useCompile.getState>;
  files: ReturnType<typeof useProjectFiles.getState>;
  index: ReturnType<typeof useProjectIndex.getState>;
  search: ReturnType<typeof useSearch.getState>;
};

type WorkspacesState = {
  /** Open project tabs, in order (project ids). */
  tabs: string[];
  /** Projects whose snapshot has a compilation running (shown in their tab). */
  compiling: string[];

  /** Opens `projectId` in its tab (adding it if needed) and shows it. */
  open: (projectId: string) => void;
  /** Closes a tab; if it is on screen, shows the next one (or the home screen). */
  close: (projectId: string) => Promise<void>;
  /** Next/previous tab (Ctrl+Tab / Ctrl+Shift+Tab); the home screen counts as the first. */
  cycle: (step: 1 | -1) => void;
  /** Moves a tab to position `to`. */
  move: (projectId: string, to: number) => void;
};

/** Where the open tabs are remembered between sessions. */
export const TABS_STORAGE_KEY = "libretex:tabs";

const snapshots = new Map<string, Workspace>();

function readTabs(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(TABS_STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeTabs(tabs: string[]) {
  try {
    localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
  } catch {
    // Not remembered: they still work in this session.
  }
}

function capture(): Workspace {
  return {
    view: useProjectView.getState(),
    buffers: useBuffers.getState(),
    compile: useCompile.getState(),
    files: useProjectFiles.getState(),
    index: useProjectIndex.getState(),
    search: useSearch.getState(),
  };
}

function restore(workspace: Workspace) {
  useProjectView.setState(workspace.view);
  useBuffers.setState(workspace.buffers);
  useCompile.setState(workspace.compile);
  useProjectFiles.setState(workspace.files);
  useProjectIndex.setState(workspace.index);
  useSearch.setState(workspace.search);
}

/**
 * Called when a project is about to be shown: keeps the stores' current project as a
 * snapshot and, if `projectId` was open before, puts its snapshot back. Returns whether it
 * was restored (otherwise the caller opens the project from scratch).
 */
export function activateWorkspace(projectId: string): boolean {
  const loaded = loadedProject();
  if (loaded === projectId) return useBuffers.getState().projectId === projectId;
  if (loaded) snapshots.set(loaded, capture());
  setLoadedProject(projectId);
  const snapshot = snapshots.get(projectId);
  if (!snapshot) return false;
  snapshots.delete(projectId);
  restore(snapshot);
  return true;
}

/** A compilation event of a project that is not on screen: into its snapshot. */
export function handleBackgroundCompileEvent(event: CompileEvent): boolean {
  if (event.projectId === useCompile.getState().projectId) return false;
  const snapshot = snapshots.get(event.projectId);
  if (!snapshot) return false;
  snapshot.compile = { ...snapshot.compile, ...applyCompileEvent(snapshot.compile, event) };
  useWorkspaces.setState((s) => {
    const compiling = s.compiling.filter((id) => id !== event.projectId);
    return { compiling: snapshot.compile.running ? [...compiling, event.projectId] : compiling };
  });
  return true;
}

/** Projects with a compilation running, from the snapshots (when switching tabs). */
function compilingNow(): string[] {
  return [...snapshots.entries()].filter(([, w]) => w.compile.running).map(([id]) => id);
}

const showProject = (projectId: string) => useAppStore.getState().openProject(projectId);

export const initialWorkspacesState = { tabs: [] as string[], compiling: [] as string[] };

export const useWorkspaces = create<WorkspacesState>()((set, get) => ({
  tabs: readTabs(),
  compiling: [],

  open: (projectId) => {
    if (!get().tabs.includes(projectId)) {
      const tabs = [...get().tabs, projectId];
      writeTabs(tabs);
      set({ tabs });
    }
    showProject(projectId);
  },

  close: async (projectId) => {
    const { tabs } = get();
    const index = tabs.indexOf(projectId);
    if (index < 0) return;
    const route = useAppStore.getState().route;
    const onScreen = route.name === "project" && route.projectId === projectId;
    const loaded = loadedProject();
    if (loaded === projectId) {
      // Nothing is lost: what was typed is saved before the tab goes away.
      await useBuffers
        .getState()
        .saveAll()
        .catch(() => {});
    }
    snapshots.delete(projectId);
    dropEditorStates(projectId);
    const rest = tabs.filter((id) => id !== projectId);
    writeTabs(rest);
    set({ tabs: rest, compiling: get().compiling.filter((id) => id !== projectId) });
    if (onScreen) {
      const next = rest[Math.min(index, rest.length - 1)];
      if (next) showProject(next);
      else useAppStore.getState().goHome();
    }
    if (loaded === projectId) {
      setLoadedProject(null);
      if (!onScreen)
        getBackend()
          .unwatchProject()
          .catch(() => {});
    }
  },

  cycle: (step) => {
    const { tabs } = get();
    const route = useAppStore.getState().route;
    // Position 0 is the home screen.
    const current = route.name === "project" ? tabs.indexOf(route.projectId) + 1 : 0;
    const count = tabs.length + 1;
    const next = (current + step + count) % count;
    if (next === 0) useAppStore.getState().goHome();
    else showProject(tabs[next - 1]);
  },

  move: (projectId, to) => {
    const tabs = get().tabs.filter((id) => id !== projectId);
    tabs.splice(Math.max(0, Math.min(to, tabs.length)), 0, projectId);
    writeTabs(tabs);
    set({ tabs });
  },
}));

/** After switching: which background tabs are compiling. */
export function refreshCompiling() {
  useWorkspaces.setState({ compiling: compilingNow() });
}

/** Projects removed or trashed elsewhere lose their tab. */
export function dropMissingTabs() {
  const known = new Set(useProjects.getState().projects.map((p) => p.id));
  for (const id of useWorkspaces.getState().tabs) {
    if (!known.has(id)) void useWorkspaces.getState().close(id);
  }
}

/** For tests: forget every tab and snapshot. */
export function resetWorkspaces() {
  snapshots.clear();
  setLoadedProject(null);
  useWorkspaces.setState(initialWorkspacesState);
}
