import { create } from "zustand";
import { getBackend } from "../lib/tauri";
import type { FileNode } from "./types";

type FilesState = {
  /** Project whose tree is loaded. */
  projectId: string | null;
  tree: FileNode[];
  /** Loads (or reloads) the file tree of a project. */
  loadTree: (projectId: string) => Promise<void>;
};

export const useProjectFiles = create<FilesState>()((set) => ({
  projectId: null,
  tree: [],
  loadTree: async (projectId) => {
    const tree = await getBackend().listTree(projectId);
    set({ projectId, tree });
  },
}));

export const initialFilesState = { projectId: null, tree: [] };
