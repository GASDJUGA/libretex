import { Filter, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import { notifyError } from "../../lib/errors";
import { INSTALLED_PAGE, usePackages } from "../../store/packages";
import { PackageList } from "./PackageList";

/** Pause after typing before filtering. */
const FILTER_DELAY_MS = 200;

/**
 * The packages installed in the TeX JuTeX uses, by name, with a filter. Long lists
 * (pacman's TeX Live has thousands) arrive in pages.
 */
export function InstalledPackages({
  compact = false,
  inProject = false,
}: {
  compact?: boolean;
  inProject?: boolean;
}) {
  const t = useT();
  const installed = usePackages((s) => s.installed);
  const kind = usePackages((s) => s.backends?.active?.kind ?? null);
  const [text, setText] = useState(installed.filter);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!usePackages.getState().installed.loaded) {
      usePackages.getState().loadInstalled().catch(notifyError);
    }
    return () => clearTimeout(timer.current);
  }, []);

  const onChange = (value: string) => {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => usePackages.getState().loadInstalled(value, INSTALLED_PAGE).catch(notifyError),
      FILTER_DELAY_MS,
    );
  };

  const pad = compact ? "px-3" : "px-8";
  const more = installed.total - installed.packages.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`${pad} pt-4`}>
        <label className="relative block">
          <span className="sr-only">{t("packages.installed.filter")}</span>
          <Filter
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted"
            aria-hidden
          />
          <input
            type="search"
            value={text}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t("packages.installed.filterPlaceholder")}
            className="h-9 w-full rounded border border-line bg-panel pr-8 pl-9 text-sm text-fg placeholder:text-fg-muted"
          />
          {installed.loading && (
            <Loader2
              size={14}
              className="absolute top-1/2 right-3 -translate-y-1/2 animate-spin text-fg-muted"
              aria-hidden
            />
          )}
        </label>
        {installed.loaded && installed.total > 0 && (
          <p className="mt-2 text-xs text-fg-muted">
            {installed.filter.trim()
              ? t("packages.installed.countFiltered", { count: installed.total })
              : t("packages.installed.count", { count: installed.total })}
            {kind === "pacman" && ` ${t("packages.installed.pacmanNote")}`}
          </p>
        )}
      </div>

      {!installed.loaded ? null : installed.total === 0 ? (
        <p className={`${pad} py-4 text-sm text-fg-muted`}>
          {kind === "readOnly"
            ? t("packages.installed.unknown")
            : installed.filter.trim()
              ? t("packages.installed.noMatch", { filter: installed.filter })
              : t("packages.installed.none")}
        </p>
      ) : (
        <PackageList
          packages={installed.packages}
          label={t("packages.installed.list")}
          compact={compact}
          inProject={inProject}
          footer={
            more > 0 && (
              <button
                type="button"
                disabled={installed.loading}
                onClick={() =>
                  usePackages
                    .getState()
                    .loadInstalled(undefined, installed.limit + INSTALLED_PAGE)
                    .catch(notifyError)
                }
                className="mt-3 rounded border border-line px-3 py-1 text-sm hover:bg-hover disabled:opacity-50"
              >
                {t("packages.installed.more", {
                  shown: installed.packages.length,
                  total: installed.total,
                })}
              </button>
            )
          }
        />
      )}
    </div>
  );
}
