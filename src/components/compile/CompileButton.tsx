import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Play,
  Square,
  XCircle,
} from "lucide-react";
import { useT } from "../../i18n";
import { compilerLabels } from "../../mocks/projects";
import { notifyError, notifyInfo } from "../../lib/errors";
import { useCompile } from "../../store/compile";
import { useProjectView } from "../../store/project";
import { hasEngine, useTex } from "../../store/tex";
import { Menu, type MenuEntry } from "../common/Menu";

type CompileButtonProps = {
  errorCount: number;
  warningCount: number;
};

/** Compile split button plus a status chip that opens the logs panel. */
export function CompileButton({ errorCount, warningCount }: CompileButtonProps) {
  const t = useT();
  const texStatus = useTex((s) => s.status);
  const {
    compiler,
    setCompiler,
    autoCompile,
    setAutoCompile,
    draftMode,
    setDraftMode,
    haltOnError,
    setHaltOnError,
    toggleSidePanel,
  } = useProjectView();

  const entries: MenuEntry[] = [
    {
      label: t("compile.autoCompile"),
      checked: autoCompile,
      onSelect: () => setAutoCompile(!autoCompile),
    },
    { kind: "separator" },
    { kind: "label", label: t("compile.compiler") },
    ...(Object.keys(compilerLabels) as (keyof typeof compilerLabels)[]).map((c): MenuEntry => ({
      label: compilerLabels[c],
      checked: compiler === c,
      radio: true,
      hint: hasEngine(texStatus, c) ? undefined : t("tex.notInstalled"),
      onSelect: () => setCompiler(c),
    })),
    { kind: "separator" },
    { label: t("compile.draft"), checked: draftMode, onSelect: () => setDraftMode(!draftMode) },
    {
      label: t("compile.haltOnError"),
      checked: haltOnError,
      onSelect: () => setHaltOnError(!haltOnError),
    },
    { kind: "separator" },
    {
      label: t("compile.cleanAux"),
      onSelect: () =>
        useCompile
          .getState()
          .cleanBuild()
          .then((count) => notifyInfo(t("compile.cleaned", { count })))
          .catch(notifyError),
    },
  ];

  const running = useCompile((s) => s.running);
  const queued = useCompile((s) => s.queued);
  const compile = () => {
    useCompile.getState().compile({ compiler, draft: draftMode, haltOnError }).catch(notifyError);
  };

  const clean = errorCount === 0 && warningCount === 0;

  return (
    <div className="flex items-center gap-1">
      <div className="flex h-8 items-stretch rounded-md bg-accent text-accent-fg shadow-sm">
        {running ? (
          <button
            type="button"
            title={t("compile.stop")}
            onClick={() => useCompile.getState().cancel().catch(notifyError)}
            className="flex items-center gap-1.5 rounded-l-md px-3 text-sm font-medium hover:bg-accent-hover"
          >
            <Loader2 size={14} className="animate-spin" aria-hidden />
            <span aria-live="polite">{queued ? t("compile.queued") : t("compile.compiling")}</span>
            <Square
              size={11}
              className="ml-1 fill-current opacity-80"
              aria-label={t("compile.stop")}
            />
          </button>
        ) : (
          <button
            type="button"
            title={`${t("compile.recompile")} (Ctrl+Enter)`}
            onClick={compile}
            className="flex items-center gap-1.5 rounded-l-md px-3 text-sm font-medium hover:bg-accent-hover"
          >
            <Play size={14} className="fill-current" aria-hidden /> {t("compile.recompile")}
          </button>
        )}
        <Menu
          trigger={<ChevronDown size={15} aria-hidden />}
          label={t("compile.options")}
          entries={entries}
          align="end"
          triggerClassName="flex h-8 items-center rounded-r-md border-l border-black/15 px-1.5 hover:bg-accent-hover aria-expanded:bg-accent-hover"
        />
      </div>
      <button
        type="button"
        onClick={() => toggleSidePanel("logs")}
        title={clean ? t("compile.clean") : undefined}
        aria-label={t("compile.status", { errors: errorCount, warnings: warningCount })}
        className="flex h-8 items-center gap-2 rounded-md px-2 text-xs font-semibold hover:bg-hover"
      >
        {clean ? (
          <CheckCircle2 size={16} className="text-success" aria-hidden />
        ) : (
          <>
            <span className="flex items-center gap-1 text-danger">
              <XCircle size={15} aria-hidden /> {errorCount}
            </span>
            <span className="flex items-center gap-1 text-warning">
              <AlertTriangle size={15} aria-hidden /> {warningCount}
            </span>
          </>
        )}
      </button>
    </div>
  );
}
