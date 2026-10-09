import { ImageOff } from "lucide-react";
import { useT } from "../../i18n";
import { basename, isPdf } from "../../lib/paths";
import { getBackend } from "../../lib/tauri";
import { useProjects } from "../../store/projects";

/** Shows a non-text project file (images; PDF figures arrive with the PDF viewer). */
export function FileViewer({ path }: { path: string }) {
  const t = useT();
  const projectPath = useProjects((s) => s.current?.path);
  const url = projectPath && !isPdf(path) ? getBackend().fileUrl(projectPath, path) : null;

  if (!url) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-fg-muted">
        <ImageOff size={32} aria-hidden />
        <p>{isPdf(path) ? t("viewer.pdfLater") : t("viewer.imageUnavailable")}</p>
        <p className="font-mono text-xs">{path}</p>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-[repeating-conic-gradient(var(--lt-panel-raised)_0_25%,var(--lt-panel)_0_50%)] bg-[length:20px_20px] p-6">
      <img
        src={url}
        alt={t("viewer.imageAlt", { name: basename(path) })}
        className="max-h-full max-w-full object-contain shadow-lg"
      />
    </div>
  );
}
