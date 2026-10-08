import { ChevronDown, Download, RefreshCw, ScrollText, ZoomIn, ZoomOut } from "lucide-react";
import { compilerLabels } from "../../mocks/projects";
import { useProjectView } from "../../store/project";
import { Menu, type MenuEntry } from "../common/Menu";

type PdfPaneProps = {
  errorCount: number;
  warningCount: number;
};

export function PdfPane({ errorCount, warningCount }: PdfPaneProps) {
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

  const compileEntries: MenuEntry[] = [
    {
      label: "Compilación automática",
      checked: autoCompile,
      onSelect: () => setAutoCompile(!autoCompile),
    },
    { kind: "separator" },
    { kind: "label", label: "Compilador" },
    ...(Object.keys(compilerLabels) as (keyof typeof compilerLabels)[]).map((c): MenuEntry => ({
      label: compilerLabels[c],
      checked: compiler === c,
      radio: true,
      onSelect: () => setCompiler(c),
    })),
    { kind: "separator" },
    { label: "Modo borrador", checked: draftMode, onSelect: () => setDraftMode(!draftMode) },
    {
      label: "Detener en el primer error",
      checked: haltOnError,
      onSelect: () => setHaltOnError(!haltOnError),
    },
    { kind: "separator" },
    { label: "Limpiar archivos auxiliares" },
  ];

  return (
    <section className="flex h-full flex-col bg-pdf-bg" aria-label="Vista previa PDF">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-panel px-2">
        <div className="flex h-8 items-stretch overflow-visible rounded bg-accent text-accent-fg">
          <button
            type="button"
            title="Recompilar (Ctrl+Enter)"
            className="flex items-center gap-1.5 rounded-l px-3 text-sm font-medium hover:bg-accent-hover"
          >
            <RefreshCw size={15} aria-hidden /> Recompilar
          </button>
          <Menu
            trigger={<ChevronDown size={15} aria-hidden />}
            label="Opciones de compilación"
            entries={compileEntries}
            triggerClassName="flex h-8 items-center rounded-r border-l border-black/20 px-1.5 hover:bg-accent-hover aria-expanded:bg-accent-hover"
          />
        </div>

        <button
          type="button"
          onClick={() => toggleSidePanel("logs")}
          title="Registros y errores"
          aria-label={`Registros: ${errorCount} errores, ${warningCount} advertencias`}
          className="flex h-8 items-center gap-1.5 rounded px-2 text-sm hover:bg-hover"
        >
          <ScrollText size={16} aria-hidden />
          <span className="rounded bg-danger px-1.5 text-xs font-semibold text-white">
            {errorCount}
          </span>
          <span className="rounded bg-warning px-1.5 text-xs font-semibold text-black">
            {warningCount}
          </span>
        </button>

        <button
          type="button"
          title="Descargar PDF"
          aria-label="Descargar PDF"
          className="flex h-8 w-8 items-center justify-center rounded hover:bg-hover"
        >
          <Download size={16} aria-hidden />
        </button>

        <div className="ml-auto flex items-center gap-1 text-sm text-fg-muted">
          <span className="mr-2 tabular-nums">1 / 12</span>
          <button
            type="button"
            aria-label="Alejar"
            className="rounded p-1 hover:bg-hover hover:text-fg"
          >
            <ZoomOut size={16} aria-hidden />
          </button>
          <span className="w-12 text-center tabular-nums">100 %</span>
          <button
            type="button"
            aria-label="Acercar"
            className="rounded p-1 hover:bg-hover hover:text-fg"
          >
            <ZoomIn size={16} aria-hidden />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <FakePage />
      </div>
    </section>
  );
}

/** A static stand-in for a rendered PDF page (Phase 1). */
function FakePage() {
  return (
    <article
      aria-label="Página 1"
      className="mx-auto aspect-[210/297] w-full max-w-[640px] bg-white px-[9%] py-[10%] font-serif text-[#111] shadow-lg"
    >
      <h1 className="text-center text-2xl">Tesis de magíster</h1>
      <p className="mt-2 text-center text-sm">Autora o autor</p>
      <p className="text-center text-sm">8 de octubre de 2026</p>
      <h2 className="mt-8 text-lg font-bold">1 Introducción</h2>
      <p className="mt-2 text-sm leading-relaxed">
        Este documento es un ejemplo para el esqueleto de LibreTeX.
      </p>
      <h3 className="mt-4 font-bold">1.1 Motivación</h3>
      <p className="mt-2 text-sm leading-relaxed">
        Los editores en línea son cómodos, pero dependen de una conexión y de un servidor ajeno.
        LibreTeX compila todo de forma local.
      </p>
      <p className="mt-2 text-sm leading-relaxed">Ver la sección 2 y la referencia [1].</p>
      <h3 className="mt-4 font-bold">1.2 Objetivos</h3>
      <ul className="mt-2 list-disc pl-6 text-sm leading-relaxed">
        <li>Editar con vista previa del PDF.</li>
        <li>Ver errores enlazados al código.</li>
      </ul>
    </article>
  );
}
