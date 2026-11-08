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
import { keyLabel } from "../../lib/platform";
import { useCompile } from "../../store/compile";
import { useProjectView } from "../../store/project";
import { useProjects } from "../../store/projects";
import { hasEngine, useTex } from "../../store/tex";
import { Menu, type MenuEntry } from "../common/Menu";
import { useShallow } from "zustand/react/shallow";

type CompileButtonProps = {
  errorCount: number;
  warningCount: number;
};

/** Compile button (play icon) with its options, plus a status chip that opens the logs panel. */
export function CompileButton({ errorCount, warningCount }: CompileButtonProps) {
  const t = useT();
  const texStatus = useTex((s) => s.status);
  const {
    compiler,
    setCompiler,
    draftMode,
    setDraftMode,
    haltOnError,
    setHaltOnError,
    toggleSidePanel,
  } = useProjectView(
    useShallow(
      ({
        compiler,
        setCompiler,
        draftMode,
        setDraftMode,
        haltOnError,
        setHaltOnError,
        toggleSidePanel,
      }) => ({
        compiler,
        setCompiler,
        draftMode,
        setDraftMode,
        haltOnError,
        setHaltOnError,
        toggleSidePanel,
      }),
    ),
  );

  const entries: MenuEntry[] = [
    { kind: "label", label: t("compile.compiler") },
    ...(Object.keys(compilerLabels) as (keyof typeof compilerLabels)[]).map((c): MenuEntry => ({
      label: compilerLabels[c],
      checked: compiler === c,
      radio: true,
      hint: hasEngine(texStatus, c) ? undefined : t("tex.notInstalled"),
      onSelect: () => {
        setCompiler(c);
        const id = useProjects.getState().current?.id;
        // The compiler is saved in project.json.
        if (id) useProjects.getState().updateMeta(id, { compiler: c }).catch(notifyError);
      },
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
    useCompile.getState().compileNow().catch(notifyError);
  };

  const clean = errorCount === 0 && warningCount === 0;

  return (
    <div className="flex items-center gap-1">
      {/* Only the play icon (pedido del usuario: menos parecido a Overleaf); while it runs, a
          spinner that turns into «stop» under the pointer. */}
      <div className="flex h-8 items-stretch">
        {running ? (
          <button
            type="button"
            title={t("compile.stop")}
            aria-label={t("compile.stop")}
            onClick={() => useCompile.getState().cancel().catch(notifyError)}
            className="group flex w-8 items-center justify-center rounded-md bg-accent text-accent-fg hover:bg-accent-hover"
          >
            <Loader2 size={16} className="animate-spin group-hover:hidden" aria-hidden />
            <Square size={12} className="hidden fill-current group-hover:block" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            title={`${t("compile.recompile")} (${keyLabel("Mod+Enter")})`}
            aria-label={t("compile.recompile")}
            onClick={compile}
            className="flex w-8 items-center justify-center rounded-md bg-accent text-accent-fg hover:bg-accent-hover"
          >
            <Play size={15} className="fill-current" aria-hidden />
          </button>
        )}
        <span className="sr-only" aria-live="polite">
          {running ? (queued ? t("compile.queued") : t("compile.compiling")) : ""}
        </span>
        <Menu
          trigger={<ChevronDown size={14} aria-hidden />}
          label={t("compile.options")}
          title={t("compile.options")}
          entries={entries}
          align="end"
          triggerClassName="flex h-8 items-center rounded px-0.5 text-fg-muted hover:bg-hover hover:text-fg aria-expanded:bg-hover"
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
