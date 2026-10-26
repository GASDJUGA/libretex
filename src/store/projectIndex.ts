import { create } from "zustand";
import { getBackend } from "../lib/tauri";
import { isStale } from "./loadedProject";
import type { ProjectIndex } from "./types";

type IndexState = ProjectIndex & {
  projectId: string | null;
  /** Version of the index loaded (the backend sends nothing while it does not change). */
  version: string | null;
  /** (Re)builds the index of labels and bibliography entries. */
  load: (projectId: string) => Promise<void>;
};

export const useProjectIndex = create<IndexState>()((set, get) => ({
  projectId: null,
  version: null,
  labels: [],
  citations: [],
  load: async (projectId) => {
    // After an autosave the index rarely changes: then nothing comes back and nothing that
    // uses it (completion) is updated.
    const known = get().projectId === projectId ? get().version : null;
    const { version, index } = await getBackend().projectIndex(projectId, known);
    if (isStale(projectId) || !index) return;
    set({ projectId, version, ...index });
  },
}));

export const initialIndexState = { projectId: null, version: null, labels: [], citations: [] };
