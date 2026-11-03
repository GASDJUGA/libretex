import { Cloud, CloudDownload, CloudUpload, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useT, type TranslationKey } from "../../i18n";
import { INSTALL_COMMAND } from "../../lib/platform";
import { errorText, notifyError, notifyInfo } from "../../lib/errors";
import { getBackend } from "../../lib/tauri";
import { useBackup } from "../../store/backup";
import { useProjects } from "../../store/projects";
import { ConnectDialog } from "./ConnectDialog";

/** git's progress steps, in words. */
const PHASES: [string, TranslationKey][] = [
  ["Enumerating", "backup.phase.enumerating"],
  ["Counting", "backup.phase.counting"],
  ["Compressing", "backup.phase.compressing"],
  ["Writing", "backup.phase.writing"],
  ["Receiving", "backup.phase.receiving"],
  ["Resolving", "backup.phase.resolving"],
];

/** `https://github.com/ana/tesis.git` → `github.com/ana/tesis`. */
function shortUrl(url: string) {
  return url
    .replace(/^https:\/\//, "")
    .replace(/^git@([^:]+):/, "$1/")
    .replace(/\.git$/, "");
}

const button =
  "flex flex-1 items-center justify-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-sm hover:bg-hover disabled:opacity-50";

/** The GitHub part of the backup panel: connect, push, pull, with progress and errors. */
export function GitHubSection() {
  const t = useT();
  const { status, tools, working, progress, remoteError, projectId } = useBackup();
  const projectName = useProjects((s) => s.projects.find((p) => p.id === projectId)?.name ?? "");
  const [connecting, setConnecting] = useState(false);

  // Progress of this project's push or pull.
  useEffect(
    () =>
      getBackend().onBackupProgress((p) => {
        if (p.projectId === useBackup.getState().projectId) useBackup.setState({ progress: p });
      }),
    [],
  );

  if (!status?.enabled) return null;
  const remoteBusy = working === "push" || working === "pull" || working === "connect";
  const error = remoteError ? errorText(remoteError) : null;

  const push = () =>
    useBackup
      .getState()
      .push()
      .then(() => notifyInfo(t("backup.pushDone")))
      .catch(() => {});
  const pull = () =>
    useBackup
      .getState()
      .pull()
      .then((pulled) => {
        if (!pulled) return;
        notifyInfo(
          pulled.commits > 0
            ? t("backup.pullDone", { count: pulled.commits })
            : t("backup.pullNothing"),
        );
      })
      .catch(() => {});

  const phase = progress
    ? t(PHASES.find(([prefix]) => progress.phase.startsWith(prefix))?.[1] ?? "backup.phase.other")
    : null;

  return (
    <div className="flex flex-col gap-2 border-t border-line px-3 py-3 text-sm">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-fg-muted uppercase">
        <Cloud size={13} aria-hidden /> {t("backup.github")}
      </h3>
      {tools && !tools.git ? (
        <p className="text-xs text-fg-muted">
          {t("backup.noGit", { command: INSTALL_COMMAND.git })}
        </p>
      ) : !status.remote ? (
        <>
          <p className="text-xs text-fg-muted">{t("backup.githubIntro")}</p>
          <button type="button" onClick={() => setConnecting(true)} className={button}>
            <Cloud size={14} aria-hidden /> {t("backup.connectButton")}
          </button>
        </>
      ) : (
        <>
          <p className="truncate font-mono text-xs" title={status.remote}>
            {shortUrl(status.remote)}
          </p>
          <p className="text-xs text-fg-muted">
            {!status.tracking
              ? t("backup.neverPushed")
              : status.ahead === 0 && status.behind === 0
                ? t("backup.upToDate")
                : [
                    status.ahead > 0 && t("backup.ahead", { count: status.ahead }),
                    status.behind > 0 && t("backup.behind", { count: status.behind }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={push}
              disabled={remoteBusy || !!working}
              className={button}
            >
              {working === "push" ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <CloudUpload size={14} aria-hidden />
              )}
              {working === "push" ? t("backup.pushing") : t("backup.push")}
            </button>
            <button
              type="button"
              onClick={pull}
              disabled={remoteBusy || !!working}
              className={button}
            >
              {working === "pull" ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <CloudDownload size={14} aria-hidden />
              )}
              {working === "pull" ? t("backup.pulling") : t("backup.pull")}
            </button>
          </div>
          {(working === "push" || working === "pull") && (
            <div className="flex items-center gap-2">
              <div
                className="h-1.5 flex-1 overflow-hidden rounded bg-black/30"
                role="progressbar"
                aria-label={phase ?? undefined}
                aria-valuenow={progress?.percent ?? undefined}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`h-full bg-accent transition-[width] ${progress?.percent == null ? "w-1/3 animate-pulse" : ""}`}
                  style={progress?.percent != null ? { width: `${progress.percent}%` } : undefined}
                />
              </div>
              <span className="w-24 truncate text-xs text-fg-muted">
                {phase} {progress?.percent != null && `${progress.percent}%`}
              </span>
              <button
                type="button"
                onClick={() => void useBackup.getState().cancel().catch(notifyError)}
                title={t("backup.cancelRemote")}
                aria-label={t("backup.cancelRemote")}
                className="rounded p-0.5 text-fg-muted hover:bg-hover hover:text-fg"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
          )}
          <label className="flex items-center gap-1.5 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={status.pushAfterBackup}
              onChange={(e) =>
                void useBackup.getState().setPushAfterBackup(e.target.checked).catch(notifyError)
              }
              className="h-3.5 w-3.5 accent-accent"
            />
            {t("backup.pushAfter")}
          </label>
        </>
      )}
      {error && (
        <div
          role="alert"
          className="rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs"
        >
          <p>{error.text}</p>
          {error.detail && (
            <details className="mt-1 text-fg-muted">
              <summary className="cursor-pointer">{t("backup.details")}</summary>
              <pre className="mt-1 font-mono text-[11px] break-all whitespace-pre-wrap">
                {error.detail}
              </pre>
            </details>
          )}
        </div>
      )}
      {connecting && (
        <ConnectDialog
          projectName={projectName}
          hasGh={tools?.gh ?? false}
          onClose={() => setConnecting(false)}
        />
      )}
    </div>
  );
}
