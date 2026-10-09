import { useT } from "../../i18n";
import { useBuffers } from "../../store/buffers";
import { useProjectView } from "../../store/project";
import { Dialog } from "../common/Dialog";

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/**
 * Asks what to do when an open file with unsaved changes was modified or deleted by another
 * program. Escape keeps the user's changes: work is never lost by default.
 */
export function ConflictDialog() {
  const t = useT();
  const conflict = useBuffers((s) => s.conflicts[0]);
  const resolve = useBuffers((s) => s.resolveConflict);
  const closeFile = useProjectView((s) => s.closeFile);
  if (!conflict) return null;

  const name = basename(conflict.path);
  const changed = conflict.kind === "changed";

  return (
    <Dialog
      key={conflict.path}
      title={t(changed ? "conflict.changedTitle" : "conflict.deletedTitle", { name })}
      submitLabel={t(changed ? "conflict.loadDisk" : "conflict.closeFile")}
      cancelLabel={t("conflict.keepMine")}
      onSubmit={() => {
        resolve(conflict.path, "disk");
        if (!changed) closeFile(conflict.path);
      }}
      onClose={() => resolve(conflict.path, "mine")}
    >
      <p>{t(changed ? "conflict.changedText" : "conflict.deletedText")}</p>
      <p className="font-mono text-xs break-all text-fg-muted">{conflict.path}</p>
    </Dialog>
  );
}
