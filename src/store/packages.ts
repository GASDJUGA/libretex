import { create } from "zustand";
import { getBackend } from "../lib/tauri";
import { useTex } from "./tex";
import type { PackageBackends, TexliveInstallProgress } from "./types";

/** Lines of installer output kept for the log view. */
const MAX_LOG_LINES = 300;

export type TexliveInstall = {
  running: boolean;
  /** Last progress step (download, extract, install, packages). */
  progress: Exclude<TexliveInstallProgress, { step: "line" }> | null;
  log: string[];
  /** Translated error code of the last attempt, if it failed («cancelled» if cancelled). */
  error: unknown;
  done: boolean;
};

const idleInstall: TexliveInstall = {
  running: false,
  progress: null,
  log: [],
  error: null,
  done: false,
};

type PackagesState = {
  backends: PackageBackends | null;
  /** Detects the package backends (again). */
  loadBackends: () => Promise<void>;
  install: TexliveInstall;
  /** Installs LibreTeX's TeX Live; afterwards the backends and the TeX tools are detected again. */
  installManaged: () => Promise<void>;
  cancelInstall: () => Promise<void>;
};

export const usePackages = create<PackagesState>()((set, get) => ({
  backends: null,
  loadBackends: async () => {
    set({ backends: await getBackend().packageBackends() });
  },
  install: idleInstall,
  installManaged: async () => {
    if (get().install.running) return;
    set({ install: { ...idleInstall, running: true } });
    const backend = getBackend();
    const stop = backend.onTexliveInstall((progress) =>
      set((s) => ({
        install:
          progress.step === "line"
            ? { ...s.install, log: [...s.install.log, progress.line].slice(-MAX_LOG_LINES) }
            : { ...s.install, progress },
      })),
    );
    try {
      await backend.installManagedTexlive();
      set((s) => ({ install: { ...s.install, running: false, done: true } }));
      await Promise.all([get().loadBackends(), useTex.getState().load(true)]);
    } catch (error) {
      set((s) => ({ install: { ...s.install, running: false, error } }));
    } finally {
      stop();
    }
  },
  cancelInstall: async () => {
    await getBackend().cancelManagedTexlive();
  },
}));

export const initialPackagesState = { backends: null, install: idleInstall };
