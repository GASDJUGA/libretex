import { create } from "zustand";
import { getBackend } from "../lib/tauri";
import { useBuffers } from "./buffers";
import type { Version } from "./types";

type HistoryState = {
  projectId: string | null;
  versions: Version[];
  loading: boolean;

  /** Reads the versions of `projectId`. */
  load: (projectId: string) => Promise<void>;
  /**
   * «Guardar versión»: saves the edited files and records a named version of the open
   * project.
   */
  saveVersion: (name: string) => Promise<Version | null>;
};

export const initialHistoryState = { projectId: null, versions: [], loading: false };

export const useHistory = create<HistoryState>()((set, get) => ({
  ...initialHistoryState,

  load: async (projectId) => {
    set({ projectId, loading: true });
    try {
      const versions = await getBackend().historyList(projectId);
      if (get().projectId === projectId) set({ versions });
    } finally {
      if (get().projectId === projectId) set({ loading: false });
    }
  },

  saveVersion: async (name) => {
    const projectId = useBuffers.getState().projectId;
    if (!projectId) return null;
    await useBuffers.getState().saveAll();
    const version = await getBackend().historySnapshot(projectId, "manual", name);
    if (get().projectId === projectId) await get().load(projectId);
    return version;
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
