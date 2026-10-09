/** What to do with an open buffer when its file changed on disk. */
export type Reconcile =
  /** Nothing to do (e.g. the change was our own save, or disk now equals the buffer). */
  | "none"
  /** No unsaved changes: silently load the disk version. */
  | "reload"
  /** Unsaved changes and a different disk version: ask the user. */
  | "conflict"
  /** Deleted on disk, no unsaved changes: close it. */
  | "deleted"
  /** Deleted on disk with unsaved changes: ask the user. */
  | "deletedConflict";

/**
 * Decides how to apply a disk change to a buffer. `saved` is the content last loaded from or
 * written to disk; `disk` is the new content, or `null` if the file no longer exists.
 */
export function reconcile(
  buffer: { content: string; saved: string },
  disk: string | null,
): Reconcile {
  const dirty = buffer.content !== buffer.saved;
  if (disk === null) return dirty ? "deletedConflict" : "deleted";
  if (disk === buffer.saved || disk === buffer.content) return "none";
  return dirty ? "conflict" : "reload";
}
