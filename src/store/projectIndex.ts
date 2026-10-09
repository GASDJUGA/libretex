import { create } from "zustand";
import { getBackend } from "../lib/tauri";
import type { ProjectIndex } from "./types";

type IndexState = ProjectIndex & {
  projectId: string | null;
  /** (Re)builds the index of labels and bibliography entries. */
  load: (projectId: string) => Promise<void>;
};

export const useProjectIndex = create<IndexState>()((set) => ({
  projectId: null,
  labels: [],
  citations: [],
  load: async (projectId) => {
    const index = await getBackend().projectIndex(projectId);
    set({ projectId, ...index });
  },
}));

export const initialIndexState = { projectId: null, labels: [], citations: [] };
