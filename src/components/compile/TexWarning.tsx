import { AlertTriangle, Copy, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { useT } from "../../i18n";
import { notifyError, notifyInfo } from "../../lib/errors";
import { compilerLabels } from "../../mocks/projects";
import { ARCH_TEXLIVE_COMMAND, hasEngine, useTex } from "../../store/tex";
import type { Compiler } from "../../store/types";

/** Notice shown in the project view when latexmk or the project's engine is missing. */
export function TexWarning({ compiler }: { compiler: Compiler }) {
  const t = useT();
  const { status, loading, load } = useTex();
  const [dismissed, setDismissed] = useState(false);
  if (!status || dismissed) return null;

  const problems: string[] = [];
  if (!status.latexmk) problems.push(t("tex.missingLatexmk"));
  if (!hasEngine(status, compiler)) {
    problems.push(t("tex.missingEngine", { engine: compilerLabels[compiler] }));
  }
  if (problems.length === 0) return null;

  const copy = () => {
    navigator.clipboard
      .writeText(ARCH_TEXLIVE_COMMAND)
      .then(() => notifyInfo(t("tex.copied")))
      .catch(notifyError);
  };

  return (
    <div
      role="alert"
      className="flex shrink-0 items-start gap-3 border-b border-warning/40 bg-warning/10 px-4 py-2.5 text-sm"
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 flex-1">
        {problems.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <p className="mt-1 text-fg-muted">{t("tex.installHint")}</p>
        <code className="mt-1 block rounded bg-topbar px-2 py-1 font-mono text-xs break-all select-text">
          {ARCH_TEXLIVE_COMMAND}
        </code>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={copy}
          className="flex h-8 items-center gap-1.5 rounded px-2 hover:bg-hover"
        >
          <Copy size={14} aria-hidden /> {t("tex.copy")}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => load(true).catch(notifyError)}
          className="flex h-8 items-center gap-1.5 rounded px-2 hover:bg-hover disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden />
          {t("tex.redetect")}
        </button>
        <button
          type="button"
          aria-label={t("tex.dismiss")}
          onClick={() => setDismissed(true)}
          className="flex h-8 w-8 items-center justify-center rounded hover:bg-hover"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
}
