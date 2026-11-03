import {
  BookOpen,
  CheckCircle2,
  Copy,
  Download,
  FilePlus2,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useT } from "../../i18n";
import { copyText } from "../../lib/clipboard";
import { errorText, notifyError, notifyInfo } from "../../lib/errors";
import { addToProjectPreamble } from "../../lib/packages/addToProject";
import { packageToLoad } from "../../lib/packages/preamble";
import { getBackend, isBackendError } from "../../lib/tauri";
import { usePackages } from "../../store/packages";
import type { PackageHit } from "../../store/types";
import { Dialog } from "../common/Dialog";
import { ReadOnlyHelp } from "./ReadOnlyHelp";

/** Style files listed in the card before «y N más». */
const MAX_FILES = 8;

/**
 * Card of a package (5.6): details and actions. Installing, removing and updating need a
 * writable backend and run one at a time in the background; with a read-only one the card
 * says how to install it (pacman). The rest always works.
 */
export function PackageCard({ pkg, inProject }: { pkg: PackageHit; inProject: boolean }) {
  const t = useT();
  const writable = usePackages((s) => s.backends?.active?.writable ?? false);
  const kind = usePackages((s) => s.backends?.active?.kind ?? null);
  const tlmgr = usePackages((s) => s.backends?.active?.tlmgr ?? null);
  const operation = usePackages((s) => s.operation);
  const installing = usePackages((s) => s.install.running);
  const update = usePackages((s) => s.updates[pkg.name]);
  const { runOperation, cancelOperation, checkUpdate } = usePackages.getState();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const mine = operation.name === pkg.name;
  const busy = operation.running || installing;
  const usepackage = `\\usepackage{${packageToLoad(pkg)}}`;
  const files = pkg.styles.slice(0, MAX_FILES);

  const copy = () =>
    copyText(usepackage)
      .then(() => notifyInfo(t("packages.card.copied", { text: usepackage })))
      .catch(notifyError);

  const docs = () =>
    getBackend()
      .openPackageDocs(pkg.name)
      .then((where) => where === "ctan" && notifyInfo(t("packages.card.docsCtan")))
      .catch(notifyError);

  const addToPreamble = () =>
    addToProjectPreamble(packageToLoad(pkg))
      .then((result) =>
        notifyInfo(t(`packages.card.preamble.${result}`, { name: packageToLoad(pkg) })),
      )
      .catch(notifyError);

  return (
    <div className="mt-2 rounded border border-line bg-panel-raised/40 p-3 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-fg-muted">{t("packages.card.version")}</dt>
        <dd>{pkg.version ?? "—"}</dd>
        <dt className="text-fg-muted">{t("packages.card.license")}</dt>
        <dd>{pkg.license ?? "—"}</dd>
        {files.length > 0 && (
          <>
            <dt className="text-fg-muted">{t("packages.card.files")}</dt>
            <dd className="font-mono break-words">
              {files.join(", ")}
              {pkg.styles.length > MAX_FILES &&
                ` ${t("packages.card.more", { count: pkg.styles.length - MAX_FILES })}`}
            </dd>
          </>
        )}
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        {writable && pkg.inTexlive && pkg.status === "missing" && (
          <Action
            primary
            icon={<Download size={14} />}
            disabled={busy}
            onClick={() => void runOperation("install", pkg.name)}
          >
            {t("packages.card.install")}
          </Action>
        )}
        {writable && pkg.status === "installed" && (
          <>
            {update === "available" ? (
              <Action
                primary
                icon={<RefreshCw size={14} />}
                disabled={busy}
                onClick={() => void runOperation("update", pkg.name)}
              >
                {t("packages.card.update")}
              </Action>
            ) : (
              <Action
                icon={
                  update === "checking" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Search size={14} />
                  )
                }
                disabled={busy || update === "checking"}
                onClick={() => void checkUpdate(pkg.name)}
              >
                {t("packages.card.checkUpdate")}
              </Action>
            )}
            <Action
              icon={<Trash2 size={14} />}
              disabled={busy}
              onClick={() => setConfirmRemove(true)}
            >
              {t("packages.card.remove")}
            </Action>
          </>
        )}
        <Action icon={<BookOpen size={14} />} onClick={() => void docs()}>
          {t("packages.card.docs")}
        </Action>
        <Action icon={<Copy size={14} />} onClick={() => void copy()}>
          {t("packages.card.copy")}
        </Action>
        {inProject && (
          <Action icon={<FilePlus2 size={14} />} onClick={() => void addToPreamble()}>
            {t("packages.card.addToPreamble")}
          </Action>
        )}
      </div>

      {writable ? (
        !pkg.inTexlive && (
          <p className="mt-2 text-xs text-fg-muted">
            {t(
              kind === "miktex"
                ? "packages.readOnly.notInMiktex"
                : "packages.readOnly.notInTexlive",
            )}
          </p>
        )
      ) : (
        <ReadOnlyHelp pkg={pkg} kind={kind} tlmgr={tlmgr} />
      )}
      {update === "current" && (
        <p className="mt-2 text-xs text-fg-muted">{t("packages.card.upToDate")}</p>
      )}
      {update === "available" && !mine && (
        <p className="mt-2 text-xs">{t("packages.card.updateAvailable")}</p>
      )}
      {update === "failed" && (
        <p className="mt-2 text-xs text-danger">{t("packages.card.updateFailed")}</p>
      )}

      {mine && (
        <OperationStatus
          showLog={showLog}
          onToggleLog={() => setShowLog(!showLog)}
          onCancel={() => void cancelOperation()}
        />
      )}

      {confirmRemove && (
        <Dialog
          title={t("packages.card.removeTitle", { name: pkg.name })}
          submitLabel={t("packages.card.remove")}
          danger
          onClose={() => setConfirmRemove(false)}
          onSubmit={() => {
            setConfirmRemove(false);
            void runOperation("remove", pkg.name);
          }}
        >
          <p className="text-sm leading-relaxed">{t("packages.card.removeText")}</p>
        </Dialog>
      )}
    </div>
  );
}

function Action({
  children,
  icon,
  onClick,
  disabled,
  primary,
}: {
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs disabled:opacity-50 ${
        primary
          ? "bg-accent font-medium text-accent-fg hover:bg-accent-hover"
          : "border border-line hover:bg-hover"
      }`}
    >
      <span aria-hidden>{icon}</span>
      {children}
    </button>
  );
}

/** Progress, result and log of the operation running (or last run) on this package. */
function OperationStatus({
  showLog,
  onToggleLog,
  onCancel,
}: {
  showLog: boolean;
  onToggleLog: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const operation = usePackages((s) => s.operation);
  const kind = operation.kind ?? "install";
  const p = operation.progress;
  const fraction = p && p.total > 0 ? p.done / p.total : 0;
  const cancelled = isBackendError(operation.error) && operation.error.code === "cancelled";

  return (
    <div className="mt-3" aria-live="polite">
      {operation.running ? (
        <>
          <p className="flex items-center gap-2 text-xs">
            <Loader2 size={13} className="animate-spin" aria-hidden />
            {p
              ? t("packages.card.progress", { package: p.package, done: p.done, total: p.total })
              : t(`packages.card.running.${kind}`)}
          </p>
          <div
            role="progressbar"
            aria-label={t(`packages.card.running.${kind}`)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(fraction * 100)}
            className="mt-2 h-1.5 overflow-hidden rounded bg-panel-raised"
          >
            <div
              className="h-full bg-accent transition-[width] duration-200"
              style={{ width: `${fraction * 100}%` }}
            />
          </div>
        </>
      ) : operation.done ? (
        <p className="flex items-center gap-2 text-xs text-success">
          <CheckCircle2 size={14} aria-hidden /> {t(`packages.card.done.${kind}`)}
        </p>
      ) : operation.error !== null ? (
        <div role="alert" className="text-xs">
          <p className={`flex items-center gap-2 ${cancelled ? "text-fg-muted" : "text-danger"}`}>
            <XCircle size={14} aria-hidden />
            {cancelled ? t("packages.card.cancelled") : t(`packages.card.failed.${kind}`)}
          </p>
          {!cancelled && <p className="mt-1 text-fg-muted">{errorText(operation.error).text}</p>}
        </div>
      ) : null}
      <div className="mt-2 flex gap-2">
        {operation.running && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-line px-2.5 py-1 text-xs hover:bg-hover"
          >
            {t("packages.card.cancel")}
          </button>
        )}
        {operation.log.length > 0 && (
          <button
            type="button"
            onClick={onToggleLog}
            aria-expanded={showLog}
            className="rounded px-2.5 py-1 text-xs text-fg-muted hover:bg-hover hover:text-fg"
          >
            {showLog ? t("packages.install.hideLog") : t("packages.install.showLog")}
          </button>
        )}
      </div>
      {showLog && operation.log.length > 0 && (
        <pre
          aria-label={t("packages.card.log")}
          className="mt-2 max-h-40 overflow-auto rounded bg-topbar p-2 font-mono text-xs text-fg-muted"
        >
          {operation.log.join("\n")}
        </pre>
      )}
    </div>
  );
}
