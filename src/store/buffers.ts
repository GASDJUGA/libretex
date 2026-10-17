import { create } from "zustand";
import { errorText } from "../lib/errors";
import { isWithin, remap } from "../lib/paths";
import { reconcile } from "../lib/reconcile";
import { getBackend, isBackendError } from "../lib/tauri";

export type Buffer = {
  /** Current text (with unsaved edits). */
  content: string;
  /** Text last read from or written to disk. */
  saved: string;
};

export type Conflict = {
  path: string;
  /** `changed`: the disk version differs; `deleted`: the file no longer exists. */
  kind: "changed" | "deleted";
  /** Disk content for `changed`. */
  disk?: string;
};

type BuffersState = {
  projectId: string | null;
  buffers: Record<string, Buffer>;
  /** Files that could not be opened as text, with a translated error. */
  errors: Record<string, string>;
  conflicts: Conflict[];

  /** Forgets every buffer (another project was opened). */
  reset: (projectId: string) => void;
  /** Loads a file into a buffer if it is not loaded yet. */
  load: (path: string) => Promise<void>;
  setContent: (path: string, content: string) => void;
  save: (path: string) => Promise<void>;
  /** Saves every buffer with unsaved edits (before compiling, searching the project…). */
  saveAll: () => Promise<void>;
  close: (path: string) => void;
  /** Re-keys buffers after `from` (a file or folder) was renamed or moved to `to`. */
  renamePath: (from: string, to: string) => void;
  /** Drops the buffers of `path` and everything inside it. */
  closeWithin: (path: string) => void;
  /**
   * Applies changes reported by the watcher to the open buffers. Returns the paths whose
   * buffer was closed because the file was deleted on disk.
   */
  applyDiskChanges: (paths: string[]) => Promise<string[]>;
  resolveConflict: (path: string, keep: "disk" | "mine") => void;
};

export const isDirty = (buffer: Buffer | undefined) =>
  buffer !== undefined && buffer.content !== buffer.saved;

const isNotFound = (error: unknown) => isBackendError(error) && error.code === "notFound";

export const useBuffers = create<BuffersState>()((set, get) => {
  const withoutPath = <T>(record: Record<string, T>, path: string) => {
    const copy = { ...record };
    delete copy[path];
    return copy;
  };

  return {
    projectId: null,
    buffers: {},
    errors: {},
    conflicts: [],

    reset: (projectId) => set({ projectId, buffers: {}, errors: {}, conflicts: [] }),

    load: async (path) => {
      const { projectId, buffers, errors } = get();
      // Already loaded, or known to fail (the watcher clears the error when the file changes).
      if (!projectId || buffers[path] || errors[path]) return;
      try {
        const file = await getBackend().readTextFile(projectId, path);
        if (get().projectId !== projectId) return;
        set((s) => ({
          buffers: { ...s.buffers, [path]: { content: file.content, saved: file.content } },
          errors: withoutPath(s.errors, path),
        }));
      } catch (error) {
        set((s) => ({ errors: { ...s.errors, [path]: errorText(error).text } }));
      }
    },

    setContent: (path, content) =>
      set((s) =>
        s.buffers[path]
          ? { buffers: { ...s.buffers, [path]: { ...s.buffers[path], content } } }
          : s,
      ),

    save: async (path) => {
      const { projectId, buffers } = get();
      const buffer = buffers[path];
      if (!projectId || !buffer) return;
      const content = buffer.content;
      await getBackend().writeTextFile(projectId, path, content);
      // Another project's tab may be on screen by now: its buffers are not this one's.
      if (get().projectId !== projectId) return;
      set((s) =>
        s.buffers[path]
          ? { buffers: { ...s.buffers, [path]: { ...s.buffers[path], saved: content } } }
          : {},
      );
    },

    saveAll: async () => {
      await Promise.all(
        Object.entries(get().buffers)
          .filter(([, buffer]) => isDirty(buffer))
          .map(([path]) => get().save(path)),
      );
    },

    close: (path) =>
      set((s) => ({
        buffers: withoutPath(s.buffers, path),
        errors: withoutPath(s.errors, path),
        conflicts: s.conflicts.filter((c) => c.path !== path),
      })),

    renamePath: (from, to) => {
      const rekey = <T>(record: Record<string, T>) =>
        Object.fromEntries(Object.entries(record).map(([p, v]) => [remap(p, from, to), v]));
      set((s) => ({
        buffers: rekey(s.buffers),
        errors: rekey(s.errors),
        conflicts: s.conflicts.map((c) => ({ ...c, path: remap(c.path, from, to) })),
      }));
    },

    closeWithin: (path) => {
      const keep = <T>(record: Record<string, T>) =>
        Object.fromEntries(Object.entries(record).filter(([p]) => !isWithin(p, path)));
      set((s) => ({
        buffers: keep(s.buffers),
        errors: keep(s.errors),
        conflicts: s.conflicts.filter((c) => !isWithin(c.path, path)),
      }));
    },

    applyDiskChanges: async (paths) => {
      const { projectId } = get();
      if (!projectId) return [];
      const closed: string[] = [];
      for (const path of paths) {
        const buffer = get().buffers[path];
        if (!buffer) {
          // A file that failed to open (e.g. binary) may be readable now: retry on next view.
          if (get().errors[path]) set((s) => ({ errors: withoutPath(s.errors, path) }));
          continue;
        }
        let disk: string | null;
        try {
          disk = (await getBackend().readTextFile(projectId, path)).content;
        } catch (error) {
          if (!isNotFound(error)) continue;
          disk = null;
        }
        if (get().projectId !== projectId) return closed;
        const current = get().buffers[path];
        if (!current) continue;
        switch (reconcile(current, disk)) {
          case "none":
            if (disk !== null && disk !== current.saved) {
              set((s) => ({ buffers: { ...s.buffers, [path]: { ...current, saved: disk } } }));
            }
            break;
          case "reload":
            set((s) => ({ buffers: { ...s.buffers, [path]: { content: disk!, saved: disk! } } }));
            break;
          case "deleted":
            get().close(path);
            closed.push(path);
            break;
          case "conflict":
          case "deletedConflict":
            set((s) => ({
              conflicts: [
                ...s.conflicts.filter((c) => c.path !== path),
                disk === null ? { path, kind: "deleted" } : { path, kind: "changed", disk },
              ],
            }));
            break;
        }
      }
      return closed;
    },

    resolveConflict: (path, keep) => {
      const conflict = get().conflicts.find((c) => c.path === path);
      const buffer = get().buffers[path];
      if (!conflict || !buffer) return;
      const conflicts = get().conflicts.filter((c) => c.path !== path);
      if (conflict.kind === "changed") {
        const disk = conflict.disk ?? "";
        // «mine» keeps the edits; the disk version becomes the saved baseline, so the buffer
        // stays dirty and the next save overwrites the disk.
        const next = keep === "disk" ? { content: disk, saved: disk } : { ...buffer, saved: disk };
        set((s) => ({ conflicts, buffers: { ...s.buffers, [path]: next } }));
      } else if (keep === "disk") {
        get().close(path);
      } else {
        // Keep the text; saving will recreate the file.
        set((s) => ({ conflicts, buffers: { ...s.buffers, [path]: { ...buffer, saved: "" } } }));
      }
    },
  };
});

export const initialBuffersState = {
  projectId: null,
  buffers: {},
  errors: {},
  conflicts: [],
};
