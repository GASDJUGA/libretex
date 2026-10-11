import { create } from "zustand";
import { getBackend } from "../lib/tauri";
import type { PackageBackends } from "./types";

type PackagesState = {
  backends: PackageBackends | null;
  /** Detects the package backends (again). */
  loadBackends: () => Promise<void>;
};

export const usePackages = create<PackagesState>()((set) => ({
  backends: null,
  loadBackends: async () => {
    set({ backends: await getBackend().packageBackends() });
  },
}));

export const initialPackagesState = { backends: null };
