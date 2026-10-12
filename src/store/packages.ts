import { create } from "zustand";
import { getBackend } from "../lib/tauri";
import { useTex } from "./tex";
import type {
  CatalogInfo,
  PackageBackends,
  PackageHit,
  PackageOperation,
  TexChoice,
  TexliveInstallProgress,
} from "./types";

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
  /** Uses LibreTeX's TeX Live or the system's (compiling and packages); saved. */
  setDistribution: (choice: TexChoice) => Promise<void>;
  install: TexliveInstall;
  /** Installs LibreTeX's TeX Live; afterwards the backends and the TeX tools are detected again. */
  installManaged: () => Promise<void>;
  cancelInstall: () => Promise<void>;

  query: string;
  results: PackageHit[];
  searching: boolean;
  /** Searches the catalog; answers to older queries are dropped. */
  search: (query: string) => Promise<void>;
  catalog: CatalogInfo | null;
  refreshingCatalog: boolean;
  loadCatalogInfo: () => Promise<void>;
  /** Downloads CTAN's index (network) and searches again. */
  refreshCatalog: () => Promise<void>;
  /** Reads again what is installed (after installing with pacman) and searches again. */
  recheckStatus: () => Promise<void>;
  /** Grows whenever what is installed may have changed (to resolve packages again). */
  statusVersion: number;
  /** Searches `name` and opens its card. */
  show: (name: string) => Promise<void>;

  /** The package whose card is open. */
  selected: string | null;
  select: (name: string | null) => void;
  operation: OperationState;
  /** tlmgr install/remove/update of one package; the search is refreshed afterwards. */
  runOperation: (operation: PackageOperation, name: string) => Promise<void>;
  cancelOperation: () => Promise<void>;
  /** Result of «Buscar actualización» per package. */
  updates: Record<string, "checking" | "available" | "current" | "failed">;
  checkUpdate: (name: string) => Promise<void>;
};

export type OperationState = {
  running: boolean;
  name: string | null;
  kind: PackageOperation | null;
  progress: Extract<TexliveInstallProgress, { step: "packages" }> | null;
  log: string[];
  error: unknown;
  /** The last operation finished well. */
  done: boolean;
};

const idleOperation: OperationState = {
  running: false,
  name: null,
  kind: null,
  progress: null,
  log: [],
  error: null,
  done: false,
};

/** Identifies the latest search, to drop late answers. */
let searchSeq = 0;

export const usePackages = create<PackagesState>()((set, get) => ({
  backends: null,
  loadBackends: async () => {
    set({ backends: await getBackend().packageBackends() });
  },
  setDistribution: async (choice) => {
    const backends = await getBackend().setTexDistribution(choice);
    set((s) => ({ backends, updates: {}, statusVersion: s.statusVersion + 1 }));
    // Other tools and other packages installed: detect and search again.
    await Promise.all([useTex.getState().load(true), get().search(get().query)]);
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
      set((s) => ({
        install: { ...s.install, running: false, done: true },
        statusVersion: s.statusVersion + 1,
      }));
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

  query: "",
  results: [],
  searching: false,
  search: async (query) => {
    const seq = ++searchSeq;
    set({ query, searching: true });
    try {
      const results = query.trim() ? await getBackend().searchPackages(query) : [];
      if (seq === searchSeq) set({ results });
    } finally {
      if (seq === searchSeq) set({ searching: false });
    }
  },
  catalog: null,
  refreshingCatalog: false,
  loadCatalogInfo: async () => {
    set({ catalog: await getBackend().packageCatalogInfo() });
  },
  selected: null,
  select: (selected) => set({ selected }),
  operation: idleOperation,
  runOperation: async (kind, name) => {
    if (get().operation.running || get().install.running) return;
    set({ operation: { ...idleOperation, running: true, name, kind } });
    const backend = getBackend();
    const stop = backend.onPackageOperation((progress) =>
      set((s) => ({
        operation:
          progress.step === "line"
            ? { ...s.operation, log: [...s.operation.log, progress.line].slice(-MAX_LOG_LINES) }
            : progress.step === "packages"
              ? { ...s.operation, progress }
              : s.operation,
      })),
    );
    try {
      await backend.packageOperation(kind, name);
      set((s) => ({ operation: { ...s.operation, running: false, done: true } }));
    } catch (error) {
      set((s) => ({ operation: { ...s.operation, running: false, error } }));
    } finally {
      stop();
      set((s) => {
        const updates = { ...s.updates };
        delete updates[name];
        return { updates, statusVersion: s.statusVersion + 1 };
      });
      await get().search(get().query);
    }
  },
  cancelOperation: async () => {
    await getBackend().cancelPackageOperation();
  },
  updates: {},
  checkUpdate: async (name) => {
    set((s) => ({ updates: { ...s.updates, [name]: "checking" } }));
    try {
      const available = await getBackend().checkPackageUpdate(name);
      set((s) => ({ updates: { ...s.updates, [name]: available ? "available" : "current" } }));
    } catch {
      set((s) => ({ updates: { ...s.updates, [name]: "failed" } }));
    }
  },
  recheckStatus: async () => {
    await getBackend().reloadPackageStatus();
    set((s) => ({ statusVersion: s.statusVersion + 1 }));
    await get().search(get().query);
  },
  statusVersion: 0,
  show: async (name) => {
    set({ selected: name });
    await get().search(name);
  },
  refreshCatalog: async () => {
    set({ refreshingCatalog: true });
    try {
      set({ catalog: await getBackend().refreshPackageCatalog() });
      await get().search(get().query);
    } finally {
      set({ refreshingCatalog: false });
    }
  },
}));

export const initialPackagesState = {
  backends: null,
  install: idleInstall,
  query: "",
  results: [],
  searching: false,
  catalog: null,
  refreshingCatalog: false,
  selected: null,
  operation: idleOperation,
  updates: {},
  statusVersion: 0,
};
