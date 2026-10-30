/**
 * Exportar (5.7): the compiled PDF and a ZIP of the sources of the open project, saved where
 * the user picks in the system's dialog.
 */
import { translate, useI18n } from "../i18n";
import { useBuffers } from "../store/buffers";
import { notifyError, notifyInfo } from "./errors";
import { keyLabel } from "./platform";
import { getBackend, isBackendError } from "./tauri";

const text = (key: Parameters<typeof translate>[1], params?: Record<string, string>) =>
  translate(useI18n.getState().locale, key, params);

/** Ctrl+Shift+S / Exportar → PDF. */
export async function exportPdf() {
  const id = useBuffers.getState().projectId;
  if (!id) return;
  try {
    const path = await getBackend().exportPdf(id, text("export.pdfTitle"));
    if (path) notifyInfo(text("export.saved", { path }));
  } catch (error) {
    if (isBackendError(error) && error.code === "notFound")
      notifyInfo(text("export.noPdf", { key: keyLabel("Mod+Enter") }));
    else notifyError(error);
  }
}

/** Exportar → ZIP de fuentes (saves the edited files first: the ZIP reads the disk). */
export async function exportZip() {
  const id = useBuffers.getState().projectId;
  if (!id) return;
  try {
    await useBuffers.getState().saveAll();
    const path = await getBackend().exportZip(id, text("export.zipTitle"));
    if (path) notifyInfo(text("export.saved", { path }));
  } catch (error) {
    notifyError(error);
  }
}
