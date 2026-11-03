import { Loader2, Lock, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useI18n, useT } from "../../i18n";
import { errorText } from "../../lib/errors";
import { validRemoteUrl } from "../../lib/remote";
import { installCommands } from "../../lib/systemCommands";
import { getBackend } from "../../lib/tauri";
import { useProjects } from "../../store/projects";
import type { BackupProgress, BackupTools, GithubRepo, OpenFolderResult } from "../../store/types";
import { Dialog } from "../common/Dialog";

const inputClass = "h-9 rounded border border-line bg-panel px-2 text-sm text-fg";

/**
 * «Desde GitHub» (5.9): brings a project backed up on GitHub (from another machine, for
 * instance) into the projects folder, with its backup already connected. The account's
 * repositories are listed with `gh`; any `https://`/`git@` address also works.
 */
export function CloneDialog({
  onClose,
  onCloned,
  onOpen,
}: {
  onClose: () => void;
  onCloned: (result: OpenFolderResult) => void;
  /** Opens a project that is already in LibreTeX. */
  onOpen: (projectId: string) => void;
}) {
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const [tools, setTools] = useState<BackupTools | null>(null);
  const [repos, setRepos] = useState<GithubRepo[] | null>(null);
  const [listError, setListError] = useState<string>();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [cloning, setCloning] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [error, setError] = useState<string>();
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
    [locale],
  );

  // Opening this dialog is asking for the GitHub repositories: they are listed right away.
  useEffect(() => {
    let alive = true;
    const backend = getBackend();
    backend
      .backupTools()
      .then(async (found) => {
        if (!alive) return;
        setTools(found);
        if (!found.gh) return;
        const list = await backend.githubRepos();
        if (alive) setRepos(list);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const { text, detail } = errorText(e);
        setListError(detail ? `${text} (${detail})` : text);
      });
    const stop = backend.onBackupProgress((p) => {
      if (p.operation === "clone") setProgress(p);
    });
    return () => {
      alive = false;
      stop();
    };
  }, []);

  const shown = useMemo(() => {
    const words = filter.trim().toLowerCase();
    return (repos ?? []).filter(
      (r) =>
        !words ||
        r.nameWithOwner.toLowerCase().includes(words) ||
        (r.description ?? "").toLowerCase().includes(words),
    );
  }, [repos, filter]);

  const target = url.trim() || selected;
  const valid = !!target && validRemoteUrl(target) && tools?.git !== false;

  const submit = () => {
    if (!target) return;
    setCloning(true);
    setError(undefined);
    setProgress(null);
    useProjects
      .getState()
      .cloneProject(target)
      .then(onCloned)
      .catch((e: unknown) => {
        const { text, detail } = errorText(e);
        setError(detail ? `${text} (${detail})` : text);
        setCloning(false);
      });
  };

  return (
    <Dialog
      title={t("clone.title")}
      submitLabel={cloning ? t("clone.cloning") : t("clone.submit")}
      submitDisabled={cloning || !valid}
      error={error}
      onClose={() => {
        if (cloning) void getBackend().backupCancel("clone");
        onClose();
      }}
      onSubmit={submit}
      wide
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-fg-muted">{t("clone.intro")}</p>
        {tools && !tools.git && (
          <p className="text-danger">{t("backup.noGit", { command: installCommands().git })}</p>
        )}
        {tools && !tools.gh && (
          <p className="text-xs text-fg-muted">
            {t("clone.noGh", { command: installCommands().gh })}
          </p>
        )}
        {tools?.gh && (
          <div className="flex flex-col gap-2">
            <input
              type="search"
              value={filter}
              aria-label={t("clone.filter")}
              placeholder={t("clone.filter")}
              onChange={(e) => setFilter(e.target.value)}
              className={inputClass}
            />
            <ul
              className="h-64 overflow-auto rounded border border-line"
              aria-label={t("clone.repos")}
              aria-busy={repos === null && !listError}
            >
              {listError ? (
                <li className="px-3 py-2 text-xs text-danger">{listError}</li>
              ) : repos === null ? (
                <li className="flex items-center gap-2 px-3 py-2 text-fg-muted">
                  <Loader2 size={14} className="animate-spin" aria-hidden /> {t("clone.loading")}
                </li>
              ) : shown.length === 0 ? (
                <li className="px-3 py-2 text-fg-muted">{t("clone.none")}</li>
              ) : (
                shown.map((repo) => {
                  const active = !url.trim() && selected === repo.url;
                  return (
                    <li key={repo.url} className="border-b border-line/50 last:border-b-0">
                      {repo.projectId ? (
                        <div className="flex items-center gap-2 px-3 py-2 text-fg-muted">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{repo.nameWithOwner}</span>
                            <span className="block text-xs">{t("clone.alreadyHere")}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => onOpen(repo.projectId!)}
                            className="rounded border border-line px-2 py-0.5 text-xs text-fg hover:bg-hover"
                          >
                            {t("clone.open")}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            setSelected(repo.url);
                            setUrl("");
                          }}
                          className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-hover ${active ? "bg-accent/20" : ""}`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate font-medium">{repo.nameWithOwner}</span>
                              {repo.isPrivate && (
                                <Lock
                                  size={12}
                                  className="shrink-0 text-fg-muted"
                                  aria-label={t("clone.private")}
                                />
                              )}
                            </span>
                            {repo.description && (
                              <span className="block truncate text-xs text-fg-muted">
                                {repo.description}
                              </span>
                            )}
                          </span>
                          {repo.updatedAt && (
                            <span className="shrink-0 text-xs text-fg-muted">
                              {dateFormat.format(new Date(repo.updatedAt))}
                            </span>
                          )}
                        </button>
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}
        <label className="flex flex-col gap-1">
          {t("clone.url")}
          <input
            type="text"
            value={url}
            maxLength={500}
            placeholder="https://github.com/usuario/repositorio.git"
            onChange={(e) => setUrl(e.target.value)}
            className={inputClass}
          />
        </label>
        {cloning && (
          <div className="flex items-center gap-2">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded bg-black/30"
              role="progressbar"
              aria-label={t("clone.cloning")}
              aria-valuenow={progress?.percent ?? undefined}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`h-full bg-accent transition-[width] ${progress?.percent == null ? "w-1/3 animate-pulse" : ""}`}
                style={progress?.percent != null ? { width: `${progress.percent}%` } : undefined}
              />
            </div>
            <span className="w-10 text-right text-xs text-fg-muted">
              {progress?.percent != null && `${progress.percent}%`}
            </span>
            <button
              type="button"
              onClick={() => void getBackend().backupCancel("clone")}
              title={t("backup.cancelRemote")}
              aria-label={t("backup.cancelRemote")}
              className="rounded p-0.5 text-fg-muted hover:bg-hover hover:text-fg"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        )}
        <p className="text-xs text-fg-muted">{t("clone.where")}</p>
      </div>
    </Dialog>
  );
}
