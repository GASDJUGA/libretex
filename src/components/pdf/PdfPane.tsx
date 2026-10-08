import { ChevronLeft, ChevronRight, Search, ZoomIn, ZoomOut } from "lucide-react";
import { useT } from "../../i18n";

const iconButton = "rounded p-1 text-fg-muted hover:bg-hover hover:text-fg";

/** PDF viewer: reading controls only; compiling and exporting live in the top bar. */
export function PdfPane() {
  const t = useT();

  return (
    <section className="flex h-full flex-col bg-pdf-bg" aria-label={t("pdf.region")}>
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line bg-panel px-2 text-sm">
        <button type="button" aria-label={t("pdf.prevPage")} className={iconButton}>
          <ChevronLeft size={16} aria-hidden />
        </button>
        <span className="px-1 text-fg-muted tabular-nums">1 / 12</span>
        <button type="button" aria-label={t("pdf.nextPage")} className={iconButton}>
          <ChevronRight size={16} aria-hidden />
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button type="button" aria-label={t("pdf.search")} className={iconButton}>
            <Search size={16} aria-hidden />
          </button>
          <span className="mx-1 h-5 border-l border-line" />
          <button type="button" aria-label={t("pdf.zoomOut")} className={iconButton}>
            <ZoomOut size={16} aria-hidden />
          </button>
          <span className="w-12 text-center text-fg-muted tabular-nums">100 %</span>
          <button type="button" aria-label={t("pdf.zoomIn")} className={iconButton}>
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
  const t = useT();
  return (
    <article
      aria-label={t("pdf.page", { page: 1 })}
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
