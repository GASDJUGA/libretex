import { GitBranch, Loader2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { notifyError } from "../../lib/errors";
import { getBackend } from "../../lib/tauri";
import { useBackup } from "../../store/backup";
import { useBuffers } from "../../store/buffers";
import { PanelHeader } from "../common/PanelHeader";
import { EnableBackupDialog } from "./EnableBackupDialog";

/** Files changed on disk: the panel reads the repository again after this pause. */
const REFRESH_DELAY = 600;

/** «Respaldo con Git» side panel (5.9). */
export function BackupPanel() {
  const t = useT();
  const projectId = useBuffers((s) => s.projectId);
  const { status, loading } = useBackup();
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    if (projectId) useBackup.getState().load(projectId).catch(notifyError);
  }, [projectId]);

  // What changed since the last backup follows the disk (saves, other programs).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = getBackend().onFilesChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        useBackup
          .getState()
          .refresh()
          .catch(() => {});
      }, REFRESH_DELAY);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, []);

  return (
    <section className="flex h-full flex-col bg-panel text-fg" aria-label={t("rail.backup")}>
      <PanelHeader title={t("rail.backup")} />
      <div className="min-h-0 flex-1 overflow-auto">
        {!status ? (
          loading && (
            <p className="flex items-center gap-2 px-3 py-3 text-sm text-fg-muted">
              <Loader2 size={14} className="animate-spin" aria-hidden /> {t("backup.loading")}
            </p>
          )
        ) : !status.enabled ? (
          <div className="flex flex-col gap-3 px-3 py-3 text-sm">
            <p>{t("backup.intro")}</p>
            <p className="text-xs text-fg-muted">{t("backup.differs")}</p>
            {status.insideOtherRepo && (
              <p className="rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                {t("backup.insideOtherRepo")}
              </p>
            )}
            <button
              type="button"
              onClick={() => setEnabling(true)}
              className="flex items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              <GitBranch size={15} aria-hidden /> {t("backup.enable")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1 border-b border-line px-3 py-2 text-xs text-fg-muted">
            <p className="flex items-center gap-1.5">
              <GitBranch size={13} aria-hidden />
              {status.branch ? t("backup.branch", { branch: status.branch }) : t("backup.detached")}
            </p>
            {status.identity && (
              <p className="flex min-w-0 items-center gap-1.5" title={status.identity.email}>
                <UserRound size={13} className="shrink-0" aria-hidden />
                <span className="truncate">
                  {status.identity.name} &lt;{status.identity.email}&gt;
                </span>
              </p>
            )}
          </div>
        )}
      </div>
      {enabling && status && (
        <EnableBackupDialog status={status} onClose={() => setEnabling(false)} />
      )}
    </section>
  );
}
