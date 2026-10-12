import type { ReactNode } from "react";
import { useT } from "../../i18n";
import { usePackages } from "../../store/packages";
import type { PackageHit } from "../../store/types";
import { PackageCard } from "./PackageCard";

const badge: Record<PackageHit["status"], string> = {
  installed: "bg-accent/25 text-fg",
  missing: "bg-panel-raised text-fg-muted",
  unknown: "bg-panel-raised text-fg-muted",
};

/** Packages with their status; clicking one opens its card. */
export function PackageList({
  packages,
  label,
  compact,
  inProject,
  footer,
}: {
  packages: PackageHit[];
  label: string;
  compact: boolean;
  inProject: boolean;
  /** Shown after the list (e.g. «Mostrar más»). */
  footer?: ReactNode;
}) {
  const t = useT();
  const selected = usePackages((s) => s.selected);
  const select = usePackages((s) => s.select);
  const pad = compact ? "px-3" : "px-8";

  return (
    <div className={`min-h-0 flex-1 overflow-auto ${pad} pt-2 pb-8`}>
      <ul aria-label={label}>
        {packages.map((pkg) => (
          <li key={pkg.name} className="border-b border-line py-2 last:border-b-0">
            <button
              type="button"
              aria-expanded={selected === pkg.name}
              onClick={() => select(selected === pkg.name ? null : pkg.name)}
              className="-mx-1 flex w-[calc(100%+0.5rem)] items-start gap-3 rounded px-1 py-0.5 text-left hover:bg-hover"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-sm font-medium">{pkg.name}</span>
                  {pkg.version && <span className="text-xs text-fg-muted">{pkg.version}</span>}
                  {!pkg.inTexlive && (
                    <span className="text-xs text-fg-muted">{t("packages.onlyCtan")}</span>
                  )}
                </span>
                <span
                  className={`block text-sm text-fg-muted ${compact || selected === pkg.name ? "" : "truncate"}`}
                >
                  {pkg.caption}
                </span>
                {pkg.status === "missing" && pkg.pacmanPackage && (
                  <span className="mt-0.5 block text-xs text-fg-muted">
                    {t("packages.withPacman", { package: pkg.pacmanPackage })}
                  </span>
                )}
              </span>
              <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${badge[pkg.status]}`}>
                {t(`packages.status.${pkg.status}`)}
              </span>
            </button>
            {selected === pkg.name && <PackageCard pkg={pkg} inProject={inProject} />}
          </li>
        ))}
      </ul>
      {footer}
    </div>
  );
}
