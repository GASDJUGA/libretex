import { create } from "zustand";
import { getBackend } from "../lib/tauri";
import { useBuffers } from "./buffers";
import { useHistory } from "./history";
import type { Backup, BackupPending, BackupStatus, Identity } from "./types";

/**
 * The backup with Git (5.9) of the project on screen: where it stands, what changed since
 * the last backup and the list of backups. Nothing here runs by itself.
 */
type BackupState = {
  projectId: string | null;
  status: BackupStatus | null;
  pending: BackupPending | null;
  backups: Backup[];
  loading: boolean;
  /** What is running (one thing at a time). */
  working: "enable" | "backup" | null;

  /** Reads everything for `projectId`. */
  load: (projectId: string) => Promise<void>;
  /** Reads it again (after files changed, for instance). */
  refresh: () => Promise<void>;
  /** Turns the backup on; `author` only if `git config` has none. */
  enable: (author?: Identity) => Promise<void>;
  /** Saves what is typed and backs up with `message`; null if nothing changed. */
  backup: (message: string) => Promise<Backup | null>;
};

export const initialBackupState = {
  projectId: null,
  status: null,
  pending: null,
  backups: [],
  loading: false,
  working: null,
};

export const useBackup = create<BackupState>()((set, get) => {
  /** Runs `job` as `working`, for the project it started with. */
  const work = async <T>(
    kind: NonNullable<BackupState["working"]>,
    job: (id: string) => Promise<T>,
  ) => {
    const projectId = get().projectId;
    if (!projectId || get().working) return null;
    set({ working: kind });
    try {
      return await job(projectId);
    } finally {
      if (get().projectId === projectId) set({ working: null });
    }
  };

  const read = async (projectId: string) => {
    const backend = getBackend();
    const status = await backend.backupStatus(projectId);
    const [pending, backups] = status.enabled
      ? await Promise.all([backend.backupPending(projectId), backend.backupList(projectId)])
      : [null, []];
    if (get().projectId === projectId) set({ status, pending, backups });
  };

  return {
    ...initialBackupState,

    load: async (projectId) => {
      if (get().projectId !== projectId) set({ ...initialBackupState, projectId });
      set({ loading: true });
      try {
        await read(projectId);
      } finally {
        if (get().projectId === projectId) set({ loading: false });
      }
    },

    refresh: async () => {
      const projectId = get().projectId;
      if (projectId) await read(projectId);
    },

    enable: async (author) => {
      await work("enable", async (projectId) => {
        // The .gitignore and the first list of changes see what is typed.
        await useBuffers.getState().saveAll();
        await getBackend().backupEnable(projectId, author);
        await read(projectId);
      });
    },

    backup: async (message) =>
      await work("backup", async (projectId) => {
        await useBuffers.getState().saveAll();
        const done = await getBackend().backupCreate(projectId, message);
        await read(projectId);
        // The list of backups, if it is on screen.
        const shown = useHistory.getState();
        if (shown.projectId === projectId && shown.source === "backup") await shown.load(projectId);
        return done;
      }),
  };
});
