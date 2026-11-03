import { create } from "zustand";
import { getBackend } from "../lib/tauri";
import type { Compiler, TexStatus } from "./types";

type TexState = {
  status: TexStatus | null;
  loading: boolean;
  /** Detects the TeX tools (`refresh` ignores the backend's cache). */
  load: (refresh?: boolean) => Promise<void>;
};

export const useTex = create<TexState>()((set) => ({
  status: null,
  loading: false,
  load: async (refresh = false) => {
    set({ loading: true });
    try {
      set({ status: await getBackend().texStatus(refresh) });
    } finally {
      set({ loading: false });
    }
  },
}));

/** Whether the engine for `compiler` is installed (unknown status counts as installed). */
export function hasEngine(status: TexStatus | null, compiler: Compiler) {
  return status === null || status[compiler] !== null;
}

export const initialTexState = { status: null, loading: false };
