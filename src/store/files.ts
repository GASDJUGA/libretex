import { create } from "zustand";
import { joinPath } from "../lib/paths";
import { getBackend } from "../lib/tauri";
import { useBuffers } from "./buffers";
import { useProjectView } from "./project";
import type { FileNode } from "./types";
import { renameInSession } from "../lib/session";
import { isStale } from "./loadedProject";

type FilesState = {
  /** Project whose tree is loaded. */
  projectId: string | null;
  tree: FileNode[];
  /** Loads (or reloads) the file tree of a project. */
  loadTree: (projectId: string) => Promise<void>;

  // Operations on the loaded project. They reload the tree and keep tabs and buffers in sync.
  createFile: (folder: string, name: string) => Promise<string>;
  createFolder: (folder: string, name: string) => Promise<string>;
  rename: (path: string, newName: string) => Promise<string>;
  move: (path: string, destFolder: string) => Promise<string>;
  duplicate: (path: string) => Promise<string>;
  remove: (path: string) => Promise<void>;
  upload: (folder: string, title: string) => Promise<string[]>;
  importDropped: (folder: string, paths: string[]) => Promise<string[]>;
};

export const useProjectFiles = create<FilesState>()((set, get) => {
  const project = () => {
    const id = get().projectId;
    if (!id) throw new Error("no hay un proyecto abierto");
    return id;
  };
  const reload = () => get().loadTree(project());
  const renamed = (from: string, to: string) => {
    useProjectView.getState().renamePath(from, to);
    useBuffers.getState().renamePath(from, to);
    renameInSession(project(), from, to);
  };

  return {
    projectId: null,
    tree: [],
    loadTree: async (projectId) => {
      const tree = await getBackend().listTree(projectId);
      if (!isStale(projectId)) set({ projectId, tree });
    },

    createFile: async (folder, name) => {
      const path = joinPath(folder, name);
      await getBackend().createFile(project(), path);
      await reload();
      useProjectView.getState().openFile(path);
      return path;
    },
    createFolder: async (folder, name) => {
      const path = joinPath(folder, name);
      await getBackend().createFolder(project(), path);
      await reload();
      return path;
    },
    rename: async (path, newName) => {
      const to = await getBackend().renameEntry(project(), path, newName);
      renamed(path, to);
      await reload();
      return to;
    },
    move: async (path, destFolder) => {
      const to = await getBackend().moveEntry(project(), path, destFolder);
      renamed(path, to);
      await reload();
      return to;
    },
    duplicate: async (path) => {
      const copy = await getBackend().duplicateEntry(project(), path);
      await reload();
      return copy;
    },
    remove: async (path) => {
      await getBackend().deleteEntry(project(), path);
      useProjectView.getState().closeWithin(path);
      useBuffers.getState().closeWithin(path);
      await reload();
    },
    upload: async (folder, title) => {
      const added = await getBackend().uploadFilesDialog(project(), folder, title);
      if (added.length) await reload();
      return added;
    },
    importDropped: async (folder, paths) => {
      const added = await getBackend().importDropped(project(), folder, paths);
      if (added.length) await reload();
      return added;
    },
  };
});

export const initialFilesState = { projectId: null, tree: [] };
