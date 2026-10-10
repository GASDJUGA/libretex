import { ExternalLink, FileText, FolderOpen, Loader2 } from "lucide-react";
import { useT } from "../../i18n";
import { notifyError, notifyInfo } from "../../lib/errors";
import { getBackend, isBackendError } from "../../lib/tauri";
import { useCompile } from "../../store/compile";
import { useProjects } from "../../store/projects";

const button =
  "flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-hover";

/**
 * PDF area. Until the built-in viewer (phase 6) it tells where the compiled PDF is and opens
 * it with the system's viewer or in the file manager.
 */
export function PdfPane() {
  const t = useT();
  const running = useCompile((s) => s.running);
  const compiled = useCompile((s) => s.last?.status === "success");
  const mainFile = useProjects((s) => s.current?.mainFile ?? "main.tex");
  // latexmk names the PDF after the main file, in the build folder.
  const pdfPath = `.libretex/build/${mainFile.replace(/^.*\//, "").replace(/\.[^.]*$/, "")}.pdf`;

  const run = (action: (id: string) => Promise<void>) => {
    const id = useProjects.getState().current?.id;
    if (!id) return;
    action(id).catch((error) => {
      if (isBackendError(error) && error.code === "notFound") notifyInfo(t("pdf.missing"));
      else notifyError(error);
    });
  };

  return (
    <section className="flex h-full flex-col bg-pdf-bg" aria-label={t("pdf.region")}>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        {running ? (
          <Loader2 size={40} className="animate-spin text-fg-muted" aria-hidden />
        ) : (
          <FileText size={40} className="text-fg-muted" aria-hidden />
        )}
        <div className="max-w-sm space-y-1">
          <p className="font-medium">{compiled ? t("pdf.compiled") : t("pdf.notYet")}</p>
          <p className="text-sm text-fg-muted">{t("pdf.location", { path: pdfPath })}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className={button}
            onClick={() => run((id) => getBackend().openPdf(id))}
          >
            <ExternalLink size={15} aria-hidden /> {t("pdf.open")}
          </button>
          <button
            type="button"
            className={button}
            onClick={() => run((id) => getBackend().revealPdf(id))}
          >
            <FolderOpen size={15} aria-hidden /> {t("pdf.reveal")}
          </button>
        </div>
        <p className="max-w-sm text-xs text-fg-muted">{t("pdf.viewerSoon")}</p>
      </div>
    </section>
  );
}
