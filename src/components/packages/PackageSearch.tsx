import { Loader2, RefreshCw, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n, useT } from "../../i18n";
import { notifyError } from "../../lib/errors";
import { usePackages } from "../../store/packages";
import type { PackageHit } from "../../store/types";
import { PackageCard } from "./PackageCard";

/** Pause after typing before searching. */
const SEARCH_DELAY_MS = 200;

const badge: Record<PackageHit["status"], string> = {
  installed: "bg-accent/25 text-fg",
  missing: "bg-panel-raised text-fg-muted",
  unknown: "bg-panel-raised text-fg-muted",
};

/**
 * Search in TeX Live and CTAN (5.6) with each package's status. Works offline with the
 * TeX Live database; CTAN's index is downloaded only when the user asks. Clicking a result
 * opens its card.
 */
export function PackageSearch({
  compact = false,
  inProject = false,
}: {
  compact?: boolean;
  /** In the project view: cards offer «Agregar al preámbulo». */
  inProject?: boolean;
}) {
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const { query, results, searching, catalog, refreshingCatalog } = usePackages();
  const search = usePackages((s) => s.search);
  const selected = usePackages((s) => s.selected);
  const select = usePackages((s) => s.select);
  const [text, setText] = useState(query);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!usePackages.getState().catalog)
      usePackages.getState().loadCatalogInfo().catch(notifyError);
    return () => clearTimeout(timer.current);
  }, []);

  const onChange = (value: string) => {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => search(value).catch(notifyError), SEARCH_DELAY_MS);
  };

  const date = (ms: number) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(ms));
  const pad = compact ? "px-3" : "px-8";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`${pad} pt-4`}>
        <label className="relative block">
          <span className="sr-only">{t("packages.search")}</span>
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted"
            aria-hidden
          />
          <input
            type="search"
            value={text}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t("packages.searchPlaceholder")}
            className="h-9 w-full rounded border border-line bg-panel pr-8 pl-9 text-sm text-fg placeholder:text-fg-muted"
          />
          {searching && (
            <Loader2
              size={14}
              className="absolute top-1/2 right-3 -translate-y-1/2 animate-spin text-fg-muted"
              aria-hidden
            />
          )}
        </label>
        {catalog && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
            <span>
              {catalog.ctan.savedAt
                ? t("packages.catalog.ctanFrom", {
                    date: date(catalog.ctan.savedAt),
                    count: catalog.ctan.packages,
                  })
                : t("packages.catalog.noCtan")}
            </span>
            <button
              type="button"
              disabled={refreshingCatalog}
              onClick={() => usePackages.getState().refreshCatalog().catch(notifyError)}
              className="flex items-center gap-1 rounded px-1 text-fg underline-offset-2 hover:underline disabled:opacity-50"
            >
              <RefreshCw
                size={12}
                className={refreshingCatalog ? "animate-spin" : ""}
                aria-hidden
              />
              {catalog.ctan.savedAt ? t("packages.catalog.update") : t("packages.catalog.download")}
            </button>
          </p>
        )}
      </div>

      {query.trim() === "" ? (
        <p className={`${pad} py-4 text-sm text-fg-muted`}>{t("packages.searchHint")}</p>
      ) : results.length === 0 && !searching ? (
        <p className={`${pad} py-4 text-sm text-fg-muted`}>{t("packages.noResults", { query })}</p>
      ) : (
        <ul
          className={`min-h-0 flex-1 overflow-auto ${pad} pb-8 pt-2`}
          aria-label={t("packages.results")}
        >
          {results.map((pkg) => (
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
      )}
    </div>
  );
}
