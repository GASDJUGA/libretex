import { RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useI18n, useT } from "../../i18n";
import { errorText, notifyError, notifyInfo } from "../../lib/errors";
import { useProjects } from "../../store/projects";
import type { TrashedProject } from "../../store/types";
import { Dialog } from "../common/Dialog";

export function TrashTab() {
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const { trashed, loadTrashed, restoreTrashed, purgeTrashed } = useProjects();
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState<TrashedProject | null>(null);
  const [purgeError, setPurgeError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadTrashed()
      .catch(notifyError)
      .finally(() => setLoading(false));
  }, [loadTrashed]);

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );

  const restore = (item: TrashedProject) => {
    restoreTrashed(item.trashId)
      .then(() => notifyInfo(t("trash.restored", { name: item.name, path: item.displayPath })))
      .catch(notifyError);
  };

  const purge = async () => {
    if (!purging) return;
    setBusy(true);
    setPurgeError(undefined);
    try {
      await purgeTrashed(purging.trashId);
      notifyInfo(t("trash.purged", { name: purging.name }));
      setPurging(null);
    } catch (e) {
      setPurgeError(errorText(e).text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="trash-title" className="flex h-full flex-col">
      <header className="border-b border-line px-8 py-5">
        <h1 id="trash-title" className="text-xl font-semibold">
          {t("trash.title")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-fg-muted">{t("trash.intro")}</p>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-8 py-4">
        {loading && trashed.length === 0 ? (
          <p className="py-12 text-center text-sm text-fg-muted">{t("trash.loading")}</p>
        ) : trashed.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-fg-muted">
            <Trash2 size={36} aria-hidden />
            <p className="text-sm">{t("trash.empty")}</p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {trashed.map((item) => (
              <li
                key={item.trashId}
                className="flex items-center gap-4 border-b border-line py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.name}</p>
                  <p className="truncate text-xs text-fg-muted" title={item.originalPath}>
                    {item.displayPath}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {t("trash.trashedAt", { date: dateFormat.format(new Date(item.trashedAt)) })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => restore(item)}
                  aria-label={`${t("trash.restore")}: ${item.name}`}
                  className="flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-sm hover:bg-hover"
                >
                  <RotateCcw size={14} aria-hidden /> {t("trash.restore")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPurgeError(undefined);
                    setPurging(item);
                  }}
                  aria-label={`${t("trash.purge")}: ${item.name}`}
                  className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-danger hover:bg-danger/15"
                >
                  <Trash2 size={14} aria-hidden /> {t("trash.purge")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {purging && (
        <Dialog
          title={t("trash.purgeDialog.title")}
          submitLabel={t("trash.purgeDialog.submit")}
          submitDisabled={busy}
          danger
          error={purgeError}
          onClose={() => setPurging(null)}
          onSubmit={purge}
        >
          <p>{t("trash.purgeDialog.text", { name: purging.name })}</p>
          <p className="text-xs break-all text-fg-muted">{purging.displayPath}</p>
        </Dialog>
      )}
    </section>
  );
}
