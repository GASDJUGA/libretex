import { Bookmark, Clock, FileDiff, Hammer, Loader2, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { translate, useI18n, useT } from "../../i18n";
import { notifyError, notifyInfo } from "../../lib/errors";
import { useBuffers } from "../../store/buffers";
import { useHistory } from "../../store/history";
import { useProjectView } from "../../store/project";
import type { FileChange, Version } from "../../store/types";
import { Dialog } from "../common/Dialog";
import { SaveVersionDialog } from "./SaveVersionDialog";
import { DiffView } from "./DiffView";

const KIND_ICON = { manual: Bookmark, auto: Clock, compile: Hammer } as const;

const CHANGE_STYLE: Record<FileChange["kind"], string> = {
  added: "text-success",
  modified: "text-warning",
  deleted: "text-danger",
};

const TEXT_FILE = /\.(tex|ltx|sty|cls|bib|bbx|cbx|txt|md|cfg|def|dtx|ins)$/i;

function versionTitle(version: Version, locale: "es" | "en") {
  if (version.kind === "manual") return version.name;
  return translate(locale, version.kind === "compile" ? "history.afterCompile" : "history.auto");
}

/**
 * The project's history (5.7) in place of the editor: versions on the left (named ones
 * stand out), and for the selected one the files it changed, a diff of each and «restore».
 * Restoring keeps what is there now as a version first, so it can be undone.
 */
export function HistoryPane() {
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const projectId = useBuffers((s) => s.projectId);
  const { versions, loading, selected, changes, selectedFile, diff, restoring } = useHistory();
  const { load, select, selectFile, restoreFile, restoreProject } = useHistory.getState();
  const [onlyNamed, setOnlyNamed] = useState(false);
  const [confirm, setConfirm] = useState<"file" | "project" | null>(null);
  const [saving, setSaving] = useState(false);
  const close = () => useProjectView.getState().setHistoryOpen(false);

  useEffect(() => {
    if (projectId) load(projectId).catch(notifyError);
  }, [projectId, load]);

  const shown = onlyNamed ? versions.filter((v) => v.kind === "manual") : versions;
  const current = versions.find((v) => v.id === selected) ?? null;
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );

  const runRestore = () => {
    const what = confirm;
    setConfirm(null);
    if (what === "file") {
      restoreFile()
        .then(() => notifyInfo(t("history.fileRestored", { path: selectedFile ?? "" })))
        .catch(notifyError);
    } else if (what === "project") {
      restoreProject()
        .then((changed) => notifyInfo(t("history.projectRestored", { count: changed.length })))
        .catch(notifyError);
    }
  };

  return (
    <section className="flex h-full min-w-0 bg-panel text-fg" aria-label={t("history.title")}>
      <div className="flex w-56 shrink-0 flex-col border-r border-line">
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-3">
          <h2 className="flex-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
            {t("history.title")}
          </h2>
          <button
            type="button"
            onClick={close}
            title={t("history.close")}
            aria-label={t("history.close")}
            className="rounded p-1 text-fg-muted hover:bg-hover hover:text-fg"
          >
            <X size={15} aria-hidden />
          </button>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
          <label className="flex items-center gap-1.5 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={onlyNamed}
              onChange={(e) => setOnlyNamed(e.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            {t("history.onlyNamed")}
          </label>
          <button
            type="button"
            onClick={() => setSaving(true)}
            className="rounded-md border border-line px-2 py-1 text-xs whitespace-nowrap hover:bg-hover"
          >
            {t("history.saveVersion")}
          </button>
        </div>
        <ul className="min-h-0 flex-1 overflow-auto" aria-label={t("history.versions")}>
          {loading && versions.length === 0 && (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-fg-muted">
              <Loader2 size={14} className="animate-spin" aria-hidden /> {t("history.loading")}
            </li>
          )}
          {!loading && shown.length === 0 && (
            <li className="px-3 py-2 text-sm text-fg-muted">
              {onlyNamed ? t("history.noNamed") : t("history.empty")}
            </li>
          )}
          {shown.map((version) => {
            const Icon = KIND_ICON[version.kind];
            const active = version.id === selected;
            return (
              <li key={version.id}>
                <button
                  type="button"
                  aria-current={active}
                  onClick={() => select(version.id).catch(notifyError)}
                  className={`flex w-full items-start gap-2 border-b border-line/50 px-3 py-2 text-left hover:bg-hover ${
                    active ? "bg-accent/20" : ""
                  }`}
                >
                  <Icon
                    size={14}
                    className={`mt-0.5 shrink-0 ${version.kind === "manual" ? "text-accent" : "text-fg-muted"}`}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span
                      className={`block truncate text-sm ${version.kind === "manual" ? "font-medium" : "text-fg-muted"}`}
                    >
                      {versionTitle(version, locale)}
                    </span>
                    <span className="block text-xs text-fg-muted">
                      {dateFormat.format(version.time)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {!current ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-fg-muted">
            <FileDiff size={28} aria-hidden />
            <p>{t("history.pick")}</p>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{versionTitle(current, locale)}</p>
                <p className="text-xs text-fg-muted">{dateFormat.format(current.time)}</p>
              </div>
              <button
                type="button"
                disabled={restoring}
                onClick={() => setConfirm("project")}
                className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-hover disabled:opacity-50"
              >
                <RotateCcw size={14} aria-hidden /> {t("history.restoreProject")}
              </button>
            </div>
            {changes.length === 0 ? (
              <p className="px-4 py-3 text-sm text-fg-muted">{t("history.noChanges")}</p>
            ) : (
              <div
                className="flex shrink-0 flex-wrap gap-1 border-b border-line px-4 py-2"
                role="tablist"
                aria-label={t("history.changedFiles")}
              >
                {changes.map((change) => (
                  <button
                    key={change.path}
                    type="button"
                    role="tab"
                    aria-selected={change.path === selectedFile}
                    onClick={() => selectFile(change.path).catch(notifyError)}
                    title={t(`history.change.${change.kind}`)}
                    className="flex items-center gap-1.5 rounded border border-line px-2 py-0.5 font-mono text-xs hover:bg-hover aria-selected:border-accent aria-selected:bg-accent/20"
                  >
                    <span className={`font-sans font-semibold ${CHANGE_STYLE[change.kind]}`}>
                      {t(`history.changeLetter.${change.kind}`)}
                    </span>
                    {change.path}
                  </button>
                ))}
              </div>
            )}
            {diff && (
              <>
                <div className="flex shrink-0 items-center gap-2 px-4 py-1.5 text-xs text-fg-muted">
                  <span className="flex-1">
                    {diff.after === null && !diff.binary
                      ? t("history.deletedHere")
                      : diff.before === null && !diff.binary
                        ? t("history.addedHere")
                        : t("history.diffHint")}
                  </span>
                  <button
                    type="button"
                    disabled={restoring}
                    onClick={() => setConfirm("file")}
                    className="flex items-center gap-1 rounded px-2 py-1 text-fg hover:bg-hover disabled:opacity-50"
                  >
                    <RotateCcw size={13} aria-hidden /> {t("history.restoreFile")}
                  </button>
                </div>
                <div className="min-h-0 flex-1 border-t border-line">
                  {diff.binary ? (
                    <p className="p-4 text-sm text-fg-muted">{t("history.binary")}</p>
                  ) : (
                    <DiffView
                      before={diff.before ?? ""}
                      after={diff.after ?? ""}
                      latexSyntax={TEXT_FILE.test(diff.path)}
                    />
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {confirm && current && (
        <Dialog
          title={
            confirm === "file" ? t("history.confirmFileTitle") : t("history.confirmProjectTitle")
          }
          submitLabel={confirm === "file" ? t("history.restoreFile") : t("history.restoreProject")}
          onSubmit={runRestore}
          onClose={() => setConfirm(null)}
        >
          <p className="text-sm">
            {confirm === "file"
              ? t("history.confirmFile", {
                  path: selectedFile ?? "",
                  version: `${versionTitle(current, locale)}, ${dateFormat.format(current.time)}`,
                })
              : t("history.confirmProject", {
                  version: `${versionTitle(current, locale)}, ${dateFormat.format(current.time)}`,
                })}
          </p>
          <p className="mt-2 text-xs text-fg-muted">{t("history.confirmSafe")}</p>
        </Dialog>
      )}
      {saving && <SaveVersionDialog onClose={() => setSaving(false)} />}
    </section>
  );
}
