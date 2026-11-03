import { CheckCircle2, Download, Loader2, XCircle } from "lucide-react";
import { useState } from "react";
import { useT } from "../../i18n";
import { errorText } from "../../lib/errors";
import { IS_WINDOWS } from "../../lib/platform";
import { isBackendError } from "../../lib/tauri";
import { usePackages } from "../../store/packages";
import { installFraction, megabytes as MB } from "../../lib/packages/installProgress";
import { Dialog } from "../common/Dialog";

/**
 * Installs LibreTeX's TeX Live (5.6, backend 1): asks first (it downloads from CTAN), then
 * shows the progress, the log and a cancel button.
 */
export function InstallManaged() {
  const t = useT();
  const install = usePackages((s) => s.install);
  const installManaged = usePackages((s) => s.installManaged);
  const cancelInstall = usePackages((s) => s.cancelInstall);
  const [confirming, setConfirming] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const stepText = (() => {
    const p = install.progress;
    if (!p) return t("packages.install.starting");
    switch (p.step) {
      case "download":
        return p.total
          ? t("packages.install.download", { done: MB(p.done), total: MB(p.total) })
          : t("packages.install.downloadNoTotal", { done: MB(p.done) });
      case "extract":
        return t("packages.install.extract");
      case "install":
        return t("packages.install.install", { package: p.package, done: p.done, total: p.total });
      case "packages":
        return t("packages.install.packages", { package: p.package, done: p.done, total: p.total });
    }
  })();

  const cancelled = isBackendError(install.error) && install.error.code === "cancelled";

  return (
    <div className="mt-3">
      {install.running ? (
        <div aria-live="polite">
          <p className="flex items-center gap-2 text-sm">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            {stepText}
          </p>
          <div
            role="progressbar"
            aria-label={t("packages.install.progress")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(installFraction(install.progress) * 100)}
            className="mt-2 h-1.5 overflow-hidden rounded bg-panel-raised"
          >
            <div
              className="h-full bg-accent transition-[width] duration-200"
              style={{ width: `${installFraction(install.progress) * 100}%` }}
            />
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void cancelInstall()}
              className="rounded border border-line px-3 py-1 text-sm hover:bg-hover"
            >
              {t("packages.install.cancel")}
            </button>
            <button
              type="button"
              onClick={() => setShowLog(!showLog)}
              aria-expanded={showLog}
              className="rounded px-3 py-1 text-sm text-fg-muted hover:bg-hover hover:text-fg"
            >
              {showLog ? t("packages.install.hideLog") : t("packages.install.showLog")}
            </button>
          </div>
        </div>
      ) : install.done ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 size={16} aria-hidden /> {t("packages.install.done")}
        </p>
      ) : (
        <>
          {install.error !== null && (
            <div className="mb-2 text-sm" role="alert">
              <p
                className={`flex items-center gap-2 ${cancelled ? "text-fg-muted" : "text-danger"}`}
              >
                <XCircle size={16} aria-hidden />
                {cancelled ? t("packages.install.cancelled") : t("packages.install.failed")}
              </p>
              {!cancelled && (
                <p className="mt-1 text-fg-muted">
                  {isBackendError(install.error) && install.error.code === "missingTool"
                    ? t(
                        IS_WINDOWS
                          ? "packages.install.needsGpgWindows"
                          : "packages.install.needsGpg",
                      )
                    : errorText(install.error).text}
                </p>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover"
          >
            <Download size={15} aria-hidden />
            {install.error !== null ? t("packages.install.retry") : t("packages.installManaged")}
          </button>
        </>
      )}
      {showLog && install.log.length > 0 && (
        <pre
          aria-label={t("packages.install.log")}
          className="mt-2 max-h-48 overflow-auto rounded bg-topbar p-2 font-mono text-xs text-fg-muted"
        >
          {install.log.join("\n")}
        </pre>
      )}
      {confirming && (
        <Dialog
          title={t("packages.installManaged")}
          submitLabel={t("packages.install.confirm")}
          onClose={() => setConfirming(false)}
          onSubmit={() => {
            setConfirming(false);
            void installManaged();
          }}
        >
          <p className="text-sm leading-relaxed">{t("packages.install.explain")}</p>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            {t(IS_WINDOWS ? "packages.install.whereWindows" : "packages.install.where")}
          </p>
        </Dialog>
      )}
    </div>
  );
}
