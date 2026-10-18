import { create } from "zustand";
import { getBackend } from "../lib/tauri";
import { useBackup } from "./backup";
import { useBuffers } from "./buffers";
import { useProjectFiles } from "./files";
import { useProjectView, type HistorySource } from "./project";
import { useProjectIndex } from "./projectIndex";
import type { Backup, FileChange, Version, VersionFile } from "./types";

/** A version of the history, or a backup (`author`, `pushed`; its message is the name). */
export type HistoryEntry = Version & { author?: string; pushed?: boolean | null };

/** The backend calls of each source. */
type Source = {
  list: (id: string) => Promise<HistoryEntry[]>;
  changes: (id: string, version: string) => Promise<FileChange[]>;
  file: (id: string, version: string, path: string) => Promise<VersionFile>;
  restoreFile: (id: string, version: string, path: string) => Promise<void>;
  restore: (id: string, version: string) => Promise<string[]>;
};

const backupEntry = (b: Backup): HistoryEntry => ({
  id: b.id,
  kind: "manual",
  name: b.message,
  time: b.time,
  author: b.author,
  pushed: b.pushed,
});

function api(source: HistorySource): Source {
  const backend = getBackend();
  return source === "history"
    ? {
        list: (id) => backend.historyList(id),
        changes: (id, v) => backend.historyChanges(id, v),
        file: (id, v, path) => backend.historyFile(id, v, path),
        restoreFile: (id, v, path) => backend.historyRestoreFile(id, v, path),
        restore: (id, v) => backend.historyRestore(id, v),
      }
    : {
        list: async (id) => (await backend.backupList(id)).map(backupEntry),
        changes: (id, v) => backend.backupChanges(id, v),
        file: (id, v, path) => backend.backupFile(id, v, path),
        restoreFile: (id, v, path) => backend.backupRestoreFile(id, v, path),
        restore: (id, v) => backend.backupRestore(id, v),
      };
}

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
  /** LibreTeX's versions or the Git backups. */
  source: HistorySource;
  versions: HistoryEntry[];
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

  /** Reads the versions (or backups) of `projectId`. */
  load: (projectId: string, source?: HistorySource) => Promise<void>;
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
  source: "history" as HistorySource,
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
  // What changed since the last backup.
  if (useBackup.getState().projectId === projectId) {
    useBackup
      .getState()
      .refresh()
      .catch(() => {});
  }
}

export const useHistory = create<HistoryState>()((set, get) => ({
  ...initialHistoryState,

  load: async (projectId, source = get().source) => {
    if (get().projectId !== projectId || get().source !== source) {
      set({ ...initialHistoryState, projectId, source });
    }
    const current = () => get().projectId === projectId && get().source === source;
    set({ loading: true });
    try {
      const versions = await api(source).list(projectId);
      if (current()) set({ versions });
    } finally {
      if (current()) set({ loading: false });
    }
  },

  saveVersion: async (name) => {
    const projectId = project();
    if (!projectId) return null;
    await useBuffers.getState().saveAll();
    const version = await getBackend().historySnapshot(projectId, "manual", name);
    if (get().projectId === projectId && get().source === "history") await get().load(projectId);
    return version;
  },

  select: async (versionId) => {
    const projectId = project();
    if (!projectId) return;
    set({ selected: versionId, changes: [], selectedFile: null, diff: null });
    const changes = await api(get().source).changes(projectId, versionId);
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
    const source = api(get().source);
    const [after, before] = await Promise.all([
      source.file(projectId, selected, path),
      previous ? source.file(projectId, previous.id, path) : null,
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
      await api(get().source).restoreFile(projectId, selected, selectedFile);
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
      const changed = await api(get().source).restore(projectId, selected);
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
      const shown = useHistory.getState();
      if (version && shown.projectId === id && shown.source === "history") await shown.load(id);
    } catch (error) {
      console.error(error);
    }
  }
}
