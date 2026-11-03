import { HardDrive, Lock, PackageX } from "lucide-react";
import { useEffect } from "react";
import { useT } from "../../i18n";
import { IS_WINDOWS } from "../../lib/platform";
import { notifyError } from "../../lib/errors";
import { usePackages } from "../../store/packages";
import { DistributionPicker } from "./DistributionPicker";
import { InstallManaged } from "./InstallManaged";
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
  const install = usePackages((s) => s.install);

  useEffect(() => {
    if (!usePackages.getState().backends) loadBackends().catch(notifyError);
  }, [loadBackends]);

  if (!backends) return null;
  const active = backends.active;
  const Icon = !active ? PackageX : active.writable ? HardDrive : Lock;
  const hasManaged = backends.available.some((b) => b.kind === "managed");
  // With both installed the picker lists them; otherwise, what else was found.
  const others = hasManaged
    ? []
    : backends.available.filter((b) => b !== active && b.root !== active?.root);

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
      <p className="mt-1.5 text-fg-muted">
        {hasManaged && active && active.kind !== "managed"
          ? t("packages.backendHelp.systemChosen")
          : t(`packages.backendHelp.${active?.kind ?? (IS_WINDOWS ? "noneWindows" : "none")}`)}
      </p>
      {others.length > 0 && (
        <p className="mt-1.5 text-xs text-fg-muted">
          {t("packages.otherBackends", { list: others.map(backendName).join(", ") })}
        </p>
      )}
      <DistributionPicker />
      {(!hasManaged || install.running || (install.done && active?.kind === "managed")) && (
        <InstallManaged />
      )}
    </div>
  );
}
