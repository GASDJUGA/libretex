import { Download, Loader2, Package, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { errorText, notifyError } from "../../lib/errors";
import { getBackend, isBackendError } from "../../lib/tauri";
import { useCompile } from "../../store/compile";
import { usePackages } from "../../store/packages";
import { useProjectView } from "../../store/project";
import type { PackageHit } from "../../store/types";
import { InstallCommand } from "./ReadOnlyHelp";

type Resolved = { file: string; version: number; hit: PackageHit | null };

/**
 * A `.sty` that TeX could not find (5.3/5.6): which package provides it and, with one click,
 * install it and compile again. With a TeX JuTeX can't modify (pacman's, MacTeX), the
 * command to run by hand.
 */
export function MissingPackage({ file }: { file: string }) {
  const t = useT();
  const statusVersion = usePackages((s) => s.statusVersion);
  const writable = usePackages((s) => s.backends?.active?.writable ?? false);
  const kind = usePackages((s) => s.backends?.active?.kind ?? null);
  const tlmgr = usePackages((s) => s.backends?.active?.tlmgr ?? null);
  const operation = usePackages((s) => s.operation);
  const busy = usePackages((s) => s.operation.running || s.install.running);
  const [resolved, setResolved] = useState<Resolved | null>(null);

  useEffect(() => {
    if (!usePackages.getState().backends)
      usePackages
        .getState()
        .loadBackends()
        .catch(() => {});
  }, []);

  useEffect(() => {
    let live = true;
    getBackend()
      .packageForFile(file)
      .then((hit) => live && setResolved({ file, version: statusVersion, hit }))
      .catch(() => live && setResolved({ file, version: statusVersion, hit: null }));
    return () => {
      live = false;
    };
  }, [file, statusVersion]);

  const showInPanel = (name: string) => {
    useProjectView.getState().openSidePanel("packages");
    usePackages.getState().show(name).catch(notifyError);
  };

  const installAndCompile = async (name: string) => {
    await usePackages.getState().runOperation("install", name);
    if (usePackages.getState().operation.done) {
      await useCompile.getState().compileNow().catch(notifyError);
    }
  };

  // Only the answer for the current file (a stale one is replaced as soon as it arrives).
  const hit = resolved?.file === file ? resolved.hit : undefined;
  if (hit === undefined) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-fg-muted">
        <Loader2 size={12} className="animate-spin" aria-hidden /> {t("logs.missing.resolving")}
      </p>
    );
  }
  if (hit === null) {
    const stem = file.replace(/\.[^.]+$/, "");
    return (
      <div className="text-xs">
        <p className="text-fg-muted">{t("logs.missing.unknown", { file })}</p>
        <LinkButton onClick={() => showInPanel(stem)}>{t("logs.missing.search")}</LinkButton>
      </div>
    );
  }

  const mine = operation.name === hit.name && operation.kind === "install";
  const failed = mine && !operation.running && operation.error !== null;
  const cancelled =
    failed && isBackendError(operation.error) && operation.error.code === "cancelled";

  return (
    <div className="text-xs">
      <p className="text-fg-muted">
        {t("logs.missing.provides", { file, name: hit.name })}
        {hit.status === "installed" && ` ${t("logs.missing.installed")}`}
      </p>
      {writable && hit.inTexlive && hit.status !== "installed" && (
        <div className="mt-1.5">
          {mine && operation.running ? (
            <p className="flex items-center gap-1.5" aria-live="polite">
              <Loader2 size={12} className="animate-spin" aria-hidden />
              {operation.progress
                ? t("packages.card.progress", {
                    package: operation.progress.package,
                    done: operation.progress.done,
                    total: operation.progress.total,
                  })
                : t("packages.card.running.install")}
            </p>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void installAndCompile(hit.name)}
              className="flex h-7 items-center gap-1.5 rounded-md bg-accent px-2 font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
            >
              <Download size={13} aria-hidden />
              {t("logs.missing.install", { name: hit.name })}
            </button>
          )}
          {failed && (
            <p
              role="alert"
              className={`mt-1 flex items-center gap-1.5 ${cancelled ? "text-fg-muted" : "text-danger"}`}
            >
              <XCircle size={12} aria-hidden />
              {cancelled ? t("packages.card.cancelled") : errorText(operation.error).text}
            </p>
          )}
        </div>
      )}
      {!writable && hit.status === "missing" && (
        <InstallCommand
          pkg={hit.name}
          kind={kind}
          pacmanPackage={hit.pacmanPackage}
          tlmgr={tlmgr}
        />
      )}
      <LinkButton onClick={() => showInPanel(hit.name)}>{t("logs.missing.show")}</LinkButton>
    </div>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 flex items-center gap-1 rounded text-fg underline-offset-2 hover:underline"
    >
      <Package size={12} aria-hidden />
      {children}
    </button>
  );
}
