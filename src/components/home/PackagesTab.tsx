import { Info, Search } from "lucide-react";
import { mockPackages, type PackageStatus } from "../../mocks/packages";

const statusLabels: Record<PackageStatus, [string, string]> = {
  installed: ["Instalado", "bg-accent/25 text-fg"],
  missing: ["No instalado", "bg-panel-raised text-fg-muted"],
  update: ["Actualizable", "bg-warning/25 text-fg"],
};

export function PackagesTab() {
  return (
    <section aria-labelledby="packages-title" className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-8 py-5">
        <h1 id="packages-title" className="mr-auto text-xl font-semibold">
          Paquetes
        </h1>
        <span className="flex items-center gap-2 rounded bg-panel px-3 py-1.5 text-xs text-fg-muted">
          <Info size={14} aria-hidden />
          Backend activo: <strong className="text-fg">TeX Live de pacman (solo lectura)</strong>
        </span>
      </header>
      <div className="px-8 py-4">
        <label className="relative block">
          <span className="sr-only">Buscar paquetes</span>
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted"
            aria-hidden
          />
          <input
            type="search"
            placeholder="Buscar en CTAN y TeX Live…"
            className="h-9 w-full rounded border border-line bg-panel pr-3 pl-9 text-sm text-fg placeholder:text-fg-muted"
          />
        </label>
      </div>
      <ul className="min-h-0 flex-1 overflow-auto px-8 pb-8">
        {mockPackages.map((pkg) => {
          const [label, cls] = statusLabels[pkg.status];
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
              <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
