import { ListChecks, Search } from "lucide-react";
import { useT } from "../../i18n";
import { usePackages, type PackagesView } from "../../store/packages";
import { InstalledPackages } from "./InstalledPackages";
import { PackageSearch } from "./PackageSearch";

/** «Buscar paquetes» and «Paquetes instalados», one at a time. */
export function PackageBrowser({
  compact = false,
  inProject = false,
}: {
  compact?: boolean;
  inProject?: boolean;
}) {
  const t = useT();
  const view = usePackages((s) => s.view);
  const setView = usePackages((s) => s.setView);
  const pad = compact ? "px-3" : "px-8";

  const tab = (value: PackagesView, Icon: typeof Search, label: string) => (
    <button
      type="button"
      aria-pressed={view === value}
      onClick={() => setView(value)}
      className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-sm ${
        view === value ? "bg-accent text-accent-fg" : "text-fg-muted hover:bg-hover hover:text-fg"
      }`}
    >
      <Icon size={15} aria-hidden />
      {label}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="group"
        aria-label={t("packages.title")}
        className={`${pad} flex flex-wrap gap-1 pt-4`}
      >
        {tab("search", Search, t("packages.views.search"))}
        {tab("installed", ListChecks, t("packages.views.installed"))}
      </div>
      {view === "search" ? (
        <PackageSearch compact={compact} inProject={inProject} />
      ) : (
        <InstalledPackages compact={compact} inProject={inProject} />
      )}
    </div>
  );
}
