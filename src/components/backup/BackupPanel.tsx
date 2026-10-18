import {
  ArchiveRestore,
  CloudCheck,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  Save,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useI18n, useT } from "../../i18n";
import { notifyError, notifyInfo } from "../../lib/errors";
import { getBackend } from "../../lib/tauri";
import { useBackup } from "../../store/backup";
import { useBuffers } from "../../store/buffers";
import { useProjectFiles } from "../../store/files";
import { useHistory } from "../../store/history";
import { useProjectView } from "../../store/project";
import type { FileChange } from "../../store/types";
import { PanelHeader } from "../common/PanelHeader";
import { EnableBackupDialog } from "./EnableBackupDialog";
import { GitHubSection } from "./GitHubSection";

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

  // What changed since the last backup follows the disk: other programs (the watcher), and
  // the editor's saves and file operations.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        useBackup
          .getState()
          .refresh()
          .catch(() => {});
      }, REFRESH_DELAY);
    };
    const stops = [
      getBackend().onFilesChanged(later),
      useBuffers.subscribe((now, before) => {
        if (now.buffers === before.buffers) return;
        const paths = new Set([...Object.keys(now.buffers), ...Object.keys(before.buffers)]);
        if ([...paths].some((p) => now.buffers[p]?.saved !== before.buffers[p]?.saved)) later();
      }),
      useProjectFiles.subscribe((now, before) => {
        if (now.tree !== before.tree) later();
      }),
    ];
    return () => {
      clearTimeout(timer);
      stops.forEach((stop) => stop());
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
          <>
            <div className="flex flex-col gap-1 border-b border-line px-3 py-2 text-xs text-fg-muted">
              <p className="flex items-center gap-1.5">
                <GitBranch size={13} aria-hidden />
                {status.branch
                  ? t("backup.branch", { branch: status.branch })
                  : t("backup.detached")}
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
            <PendingChanges />
            <GitHubSection />
            <RecentBackups />
          </>
        )}
      </div>
      {enabling && status && (
        <EnableBackupDialog status={status} onClose={() => setEnabling(false)} />
      )}
    </section>
  );
}

const CHANGE_STYLE: Record<FileChange["kind"], string> = {
  added: "text-success",
  modified: "text-warning",
  deleted: "text-danger",
};

/** Backups shown in the panel; the rest are in the backups pane. */
const RECENT = 5;

function useDateFormat() {
  const locale = useI18n((s) => s.locale);
  return useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );
}

/** What changed since the last backup, and «Respaldar» with a message. */
function PendingChanges() {
  const t = useT();
  const { pending, working } = useBackup();
  const [message, setMessage] = useState("");
  const dateFormat = useDateFormat();
  const changes = pending?.changes ?? [];
  // The default message names the moment of the backup; the placeholder, of opening.
  const [openedAt] = useState(() => Date.now());
  const defaultMessage = (time: number) =>
    t("backup.defaultMessage", { date: dateFormat.format(time) });

  const open = (change: FileChange) => {
    if (change.kind === "deleted") return;
    useProjectView.getState().setHistoryOpen(false);
    useProjectView.getState().openFile(change.path);
  };

  const backup = () => {
    const text = message.trim() || defaultMessage(Date.now());
    useBackup
      .getState()
      .backup(text)
      .then((done) => {
        if (done) {
          setMessage("");
          notifyInfo(t("backup.done", { message: done.message }));
        } else notifyInfo(t("backup.nothing"));
      })
      .catch(notifyError);
  };

  return (
    <div className="flex flex-col border-b border-line">
      <h3 className="px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
        {t("backup.changes")} {changes.length > 0 && `(${changes.length})`}
      </h3>
      {changes.length === 0 ? (
        <p className="px-3 pb-2 text-sm text-fg-muted">{t("backup.noPending")}</p>
      ) : (
        <ul className="max-h-48 overflow-auto pb-1" aria-label={t("backup.changes")}>
          {changes.map((change) => (
            <li key={change.path}>
              <button
                type="button"
                onClick={() => open(change)}
                disabled={change.kind === "deleted"}
                title={t(`backup.change.${change.kind}`)}
                className="flex w-full items-center gap-2 px-3 py-0.5 text-left font-mono text-xs hover:bg-hover disabled:hover:bg-transparent"
              >
                <span className={`w-3 font-sans font-semibold ${CHANGE_STYLE[change.kind]}`}>
                  {t(`history.changeLetter.${change.kind}`)}
                </span>
                <span className={`truncate ${change.kind === "deleted" ? "line-through" : ""}`}>
                  {change.path}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pending && pending.tooBig.length > 0 && (
        <p className="mx-3 mb-2 rounded border border-warning/40 bg-warning/10 px-2 py-1 text-xs">
          {t("backup.tooBig", { files: pending.tooBig.join(", ") })}
        </p>
      )}
      <form
        className="flex flex-col gap-2 px-3 pt-1 pb-3"
        onSubmit={(e) => {
          e.preventDefault();
          backup();
        }}
      >
        <input
          type="text"
          value={message}
          maxLength={1000}
          aria-label={t("backup.message")}
          placeholder={defaultMessage(openedAt)}
          onChange={(e) => setMessage(e.target.value)}
          className="h-8 rounded border border-line bg-topbar px-2 text-sm text-fg outline-none placeholder:text-fg-muted focus:border-accent-text"
        />
        <button
          type="submit"
          disabled={working !== null || changes.length === 0}
          className="flex items-center justify-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {working === "backup" ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <Save size={14} aria-hidden />
          )}
          {working === "backup" ? t("backup.backingUp") : t("backup.backupNow")}
        </button>
      </form>
    </div>
  );
}

/** The last backups; a click shows one in the backups pane (diff and restore). */
function RecentBackups() {
  const t = useT();
  const backups = useBackup((s) => s.backups);
  const dateFormat = useDateFormat();
  if (backups.length === 0) return null;

  const show = (id?: string) => {
    useProjectView.getState().setHistoryOpen(true, "backup");
    if (!id) return;
    const projectId = useBuffers.getState().projectId;
    if (!projectId) return;
    useHistory
      .getState()
      .load(projectId, "backup")
      .then(() => useHistory.getState().select(id))
      .catch(notifyError);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center px-3 pt-3 pb-1">
        <h3 className="flex-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
          {t("backup.history")}
        </h3>
        <button
          type="button"
          onClick={() => show()}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-fg-muted hover:bg-hover hover:text-fg"
        >
          <ArchiveRestore size={12} aria-hidden /> {t("backup.showAll")}
        </button>
      </div>
      <ul aria-label={t("backup.history")}>
        {backups.slice(0, RECENT).map((b) => {
          const Icon = b.pushed ? CloudCheck : GitCommitHorizontal;
          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => show(b.id)}
                className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-hover"
              >
                <Icon
                  size={13}
                  className={`mt-0.5 shrink-0 ${b.pushed ? "text-success" : "text-fg-muted"}`}
                  aria-label={
                    b.pushed === null
                      ? undefined
                      : b.pushed
                        ? t("backup.pushed")
                        : t("backup.notPushed")
                  }
                  aria-hidden={b.pushed === null}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm">{b.message}</span>
                  <span className="block text-xs text-fg-muted">{dateFormat.format(b.time)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
