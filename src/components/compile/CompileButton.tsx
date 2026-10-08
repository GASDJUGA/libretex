import { AlertTriangle, CheckCircle2, ChevronDown, Play, XCircle } from "lucide-react";
import { useT } from "../../i18n";
import { compilerLabels } from "../../mocks/projects";
import { useProjectView } from "../../store/project";
import { Menu, type MenuEntry } from "../common/Menu";

type CompileButtonProps = {
  errorCount: number;
  warningCount: number;
};

/** Compile split button plus a status chip that opens the logs panel. */
export function CompileButton({ errorCount, warningCount }: CompileButtonProps) {
  const t = useT();
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
    { label: t("compile.cleanAux") },
  ];

  const clean = errorCount === 0 && warningCount === 0;

  return (
    <div className="flex items-center gap-1">
      <div className="flex h-8 items-stretch rounded-md bg-accent text-accent-fg shadow-sm">
        <button
          type="button"
          title={`${t("compile.recompile")} (Ctrl+Enter)`}
          className="flex items-center gap-1.5 rounded-l-md px-3 text-sm font-medium hover:bg-accent-hover"
        >
          <Play size={14} className="fill-current" aria-hidden /> {t("compile.recompile")}
        </button>
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
