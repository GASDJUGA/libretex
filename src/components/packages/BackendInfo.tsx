import { HardDrive, Lock, PackageX } from "lucide-react";
import { useEffect } from "react";
import { useT } from "../../i18n";
import { notifyError } from "../../lib/errors";
import { usePackages } from "../../store/packages";
import { useBackendName } from "./useBackendName";

/**
 * The active package backend (5.6) with what it means for installing packages. Detected
 * when first shown.
 */
export function BackendInfo({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const backendName = useBackendName();
  const backends = usePackages((s) => s.backends);
  const loadBackends = usePackages((s) => s.loadBackends);

  useEffect(() => {
    if (!usePackages.getState().backends) loadBackends().catch(notifyError);
  }, [loadBackends]);

  if (!backends) return null;
  const active = backends.active;
  const Icon = !active ? PackageX : active.writable ? HardDrive : Lock;
  const others = backends.available.filter((b) => b !== active && b.root !== active?.root);

  return (
    <div
      className={`rounded border border-line bg-panel text-sm ${compact ? "p-3" : "p-4"}`}
      aria-label={t("packages.activeBackend")}
    >
      <p className="flex items-center gap-2">
        <Icon size={16} className="shrink-0 text-fg-muted" aria-hidden />
        <span className="text-fg-muted">{t("packages.activeBackend")}</span>
        <strong className="font-medium">{backendName(active)}</strong>
      </p>
      <p className="mt-1.5 text-fg-muted">{t(`packages.backendHelp.${active?.kind ?? "none"}`)}</p>
      {others.length > 0 && (
        <p className="mt-1.5 text-xs text-fg-muted">
          {t("packages.otherBackends", { list: others.map(backendName).join(", ") })}
        </p>
      )}
      {!active?.writable && (
        <button
          type="button"
          disabled
          title={t("common.comingSoon")}
          className="mt-3 rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-50"
        >
          {t("packages.installManaged")} · {t("common.comingSoon")}
        </button>
      )}
    </div>
  );
}
