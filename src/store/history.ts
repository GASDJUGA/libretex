import { create } from "zustand";
import { getBackend } from "../lib/tauri";
import { useBuffers } from "./buffers";
import { useProjectFiles } from "./files";
import { useProjectView } from "./project";
import { useProjectIndex } from "./projectIndex";
import type { FileChange, Version } from "./types";

/** A file of the selected version next to the version before it. */
export type FileDiff = {
  path: string;
  /** Before this version (null: it did not exist). */
  before: string | null;
  /** In this version (null: deleted in it). */
  after: string | null;
  binary: boolean;
};

type HistoryState = {
  projectId: string | null;
  versions: Version[];
  loading: boolean;
  /** The version shown in the history panel. */
  selected: string | null;
  /** What it changed, compared with the version before. */
  changes: FileChange[];
  /** The changed file shown, and its diff. */
  selectedFile: string | null;
  diff: FileDiff | null;
  /** A restoration is running. */
  restoring: boolean;

  /** Reads the versions of `projectId`. */
  load: (projectId: string) => Promise<void>;
  /**
   * «Guardar versión»: saves the edited files and records a named version of the open
   * project.
   */
  saveVersion: (name: string) => Promise<Version | null>;
  select: (versionId: string) => Promise<void>;
  selectFile: (path: string) => Promise<void>;
  /** Brings back the shown file as it was in the selected version. */
  restoreFile: () => Promise<void>;
  /** Brings the whole project back to the selected version; returns the changed paths. */
  restoreProject: () => Promise<string[]>;
};

export const initialHistoryState = {
  projectId: null,
  versions: [],
  loading: false,
  selected: null,
  changes: [],
  selectedFile: null,
  diff: null,
  restoring: false,
};

const project = () => useBuffers.getState().projectId;

/** The open files and the tree show what a restoration wrote on disk. */
async function reloadAfterRestore(projectId: string, paths: string[]) {
  const closed = await useBuffers.getState().applyDiskChanges(paths);
  for (const path of closed) useProjectView.getState().closeFile(path);
  await useProjectFiles.getState().loadTree(projectId);
  useProjectIndex
    .getState()
    .load(projectId)
    .catch(() => {});
}

export const useHistory = create<HistoryState>()((set, get) => ({
  ...initialHistoryState,

  load: async (projectId) => {
    if (get().projectId !== projectId) set({ ...initialHistoryState, projectId });
    set({ loading: true });
    try {
      const versions = await getBackend().historyList(projectId);
      if (get().projectId === projectId) set({ versions });
    } finally {
      if (get().projectId === projectId) set({ loading: false });
    }
  },

  saveVersion: async (name) => {
    const projectId = project();
    if (!projectId) return null;
    await useBuffers.getState().saveAll();
    const version = await getBackend().historySnapshot(projectId, "manual", name);
    if (get().projectId === projectId) await get().load(projectId);
    return version;
  },

  select: async (versionId) => {
    const projectId = project();
    if (!projectId) return;
    set({ selected: versionId, changes: [], selectedFile: null, diff: null });
    const changes = await getBackend().historyChanges(projectId, versionId);
    if (get().selected !== versionId) return;
    set({ changes });
    // The first changed file, shown right away.
    if (changes[0]) await get().selectFile(changes[0].path);
  },

  selectFile: async (path) => {
    const projectId = project();
    const { selected, versions } = get();
    if (!projectId || !selected) return;
    set({ selectedFile: path, diff: null });
    const index = versions.findIndex((v) => v.id === selected);
    const previous = versions[index + 1];
    const backend = getBackend();
    const [after, before] = await Promise.all([
      backend.historyFile(projectId, selected, path),
      previous ? backend.historyFile(projectId, previous.id, path) : null,
    ]);
    if (get().selected !== selected || get().selectedFile !== path) return;
    set({
      diff: {
        path,
        before: before?.content ?? null,
        after: after.content,
        binary: after.binary || (before?.binary ?? false),
      },
    });
  },

  restoreFile: async () => {
    const projectId = project();
    const { selected, selectedFile } = get();
    if (!projectId || !selected || !selectedFile) return;
    set({ restoring: true });
    try {
      // What is typed and not saved yet goes into the version kept before restoring.
      await useBuffers.getState().saveAll();
      await getBackend().historyRestoreFile(projectId, selected, selectedFile);
      await reloadAfterRestore(projectId, [selectedFile]);
      await get().load(projectId);
    } finally {
      set({ restoring: false });
    }
  },

  restoreProject: async () => {
    const projectId = project();
    const { selected } = get();
    if (!projectId || !selected) return [];
    set({ restoring: true });
    try {
      await useBuffers.getState().saveAll();
      const changed = await getBackend().historyRestore(projectId, selected);
      await reloadAfterRestore(projectId, changed);
      await get().load(projectId);
      return changed;
    } finally {
      set({ restoring: false });
    }
  },
}));

/**
 * An automatic version of each open project (only recorded if something changed since the
 * last one). Edited files of the project on screen are saved first.
 */
export async function autoSnapshot(projectIds: string[]) {
  const loaded = useBuffers.getState().projectId;
  for (const id of projectIds) {
    try {
      if (id === loaded) await useBuffers.getState().saveAll();
      const version = await getBackend().historySnapshot(id, "auto");
      if (version && useHistory.getState().projectId === id) await useHistory.getState().load(id);
    } catch (error) {
      console.error(error);
    }
  }
}
