import { Search } from "lucide-react";
import { mockPackages, type PackageStatus } from "../../mocks/packages";
import { useT } from "../../i18n";
import { BackendInfo } from "../packages/BackendInfo";

const statusClasses: Record<PackageStatus, string> = {
  installed: "bg-accent/25 text-fg",
  missing: "bg-panel-raised text-fg-muted",
  update: "bg-warning/25 text-fg",
};

export function PackagesTab() {
  const t = useT();
  return (
    <section aria-labelledby="packages-title" className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-8 py-5">
        <h1 id="packages-title" className="mr-auto text-xl font-semibold">
          {t("packages.title")}
        </h1>
      </header>
      <div className="px-8 pt-4">
        <BackendInfo />
      </div>
      <div className="px-8 py-4">
        <label className="relative block">
          <span className="sr-only">{t("packages.search")}</span>
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted"
            aria-hidden
          />
          <input
            type="search"
            placeholder={t("packages.searchPlaceholder")}
            className="h-9 w-full rounded border border-line bg-panel pr-3 pl-9 text-sm text-fg placeholder:text-fg-muted"
          />
        </label>
      </div>
      <ul className="min-h-0 flex-1 overflow-auto px-8 pb-8">
        {mockPackages.map((pkg) => {
          const cls = statusClasses[pkg.status];
          return (
            <li
              key={pkg.name}
              className="flex items-center gap-4 border-b border-line py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-sm font-medium">{pkg.name}</span>
                  <span className="text-xs text-fg-muted">{pkg.version}</span>
                </div>
                <p className="truncate text-sm text-fg-muted">{pkg.description}</p>
              </div>
              <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>
                {t(`packages.status.${pkg.status}`)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
