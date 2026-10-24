import { ShieldAlert, X } from "lucide-react";
import { useState } from "react";
import { useT } from "../../i18n";
import { notifyError } from "../../lib/errors";
import { useCompile } from "../../store/compile";
import { useProjects } from "../../store/projects";
import type { BlockedFeature } from "../../store/types";
import { Dialog } from "../common/Dialog";

/** Stable empty list (a new `[]` in the selector would re-render forever). */
const NONE: BlockedFeature[] = [];

/**
 * Notice shown when a project that is not trusted (imported, cloned, opened from a folder)
 * asked to run programs when compiling (shell escape, its `.latexmkrc`) and was compiled
 * without them. Trusting it is the user's decision, after a warning.
 */
export function TrustWarning() {
  const t = useT();
  const blocked = useCompile((s) => s.last?.blocked ?? NONE);
  const project = useProjects((s) => s.current);
  const [dismissed, setDismissed] = useState(false);
  const [asking, setAsking] = useState(false);
  if (!project || project.trusted || blocked.length === 0 || dismissed) return null;

  const what = blocked.map((feature) => t(`trust.${feature}`)).join(t("trust.and"));
  const trust = () => {
    setAsking(false);
    useProjects
      .getState()
      .trust(project.id)
      .then(() => useCompile.getState().compileNow())
      .catch(notifyError);
  };

  return (
    <div
      role="alert"
      className="flex shrink-0 items-start gap-3 border-b border-warning/40 bg-warning/10 px-4 py-2.5 text-sm"
    >
      <ShieldAlert size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
      <p className="min-w-0 flex-1">{t("trust.notice", { what })}</p>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="flex h-8 items-center rounded px-2 hover:bg-hover"
        >
          {t("trust.trust")}
        </button>
        <button
          type="button"
          aria-label={t("trust.dismiss")}
          onClick={() => setDismissed(true)}
          className="flex h-8 w-8 items-center justify-center rounded hover:bg-hover"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
      {asking && (
        <Dialog
          title={t("trust.dialogTitle")}
          submitLabel={t("trust.confirm")}
          danger
          onSubmit={trust}
          onClose={() => setAsking(false)}
        >
          <p className="text-sm">{t("trust.dialogBody", { what })}</p>
        </Dialog>
      )}
    </div>
  );
}
