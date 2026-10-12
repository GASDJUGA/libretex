import { Loader2, RefreshCw, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n, useT } from "../../i18n";
import { notifyError } from "../../lib/errors";
import { usePackages } from "../../store/packages";
import { PackageList } from "./PackageList";

/** Pause after typing before searching. */
const SEARCH_DELAY_MS = 200;

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
        <PackageList
          packages={results}
          label={t("packages.results")}
          compact={compact}
          inProject={inProject}
        />
      )}
    </div>
  );
}
