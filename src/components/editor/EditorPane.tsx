import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { notifyError } from "../../lib/errors";
import { isImage, isPdf } from "../../lib/paths";
import { isDirty, useBuffers } from "../../store/buffers";
import { FileViewer } from "./FileViewer";
import { useProjectView } from "../../store/project";
import { CodeEditor } from "./CodeEditor";
import { EditorToolbar } from "./EditorToolbar";
import { onTabKey } from "../../lib/tabKeys";
import { useT } from "../../i18n";

function basename(path: string) {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function EditorPane() {
  const t = useT();
  const { openFiles, activeFile, openFile, closeFile } = useProjectView();
  const { buffers, errors, load, close } = useBuffers();
  const projectId = useBuffers((s) => s.projectId);

  const buffer = activeFile ? buffers[activeFile] : undefined;
  const error = activeFile ? errors[activeFile] : undefined;

  /** Closing a tab saves pending edits first: work is never lost. */
  const closeTab = async (path: string) => {
    try {
      if (isDirty(useBuffers.getState().buffers[path])) await useBuffers.getState().save(path);
      closeFile(path);
      close(path);
    } catch (error) {
      notifyError(error);
    }
  };

  const binary = activeFile !== null && (isImage(activeFile) || isPdf(activeFile));

  useEffect(() => {
    if (activeFile && !binary) load(activeFile);
  }, [projectId, activeFile, binary, load, error]);

  // The text file shown in the editor. The editor stays mounted (keeping every tab's undo
  // history) while another tab shows an image, an error or is still loading.
  const [shown, setShown] = useState<string | null>(null);
  if (activeFile && buffer && !binary && shown !== activeFile) setShown(activeFile);
  const shownBuffer = shown && openFiles.includes(shown) ? buffers[shown] : undefined;
  const editorVisible = shownBuffer !== undefined && shown === activeFile;
  useEffect(() => {
    useProjectView.setState({ editorActive: editorVisible });
  }, [editorVisible]);

  return (
    <section className="flex h-full flex-col bg-panel" aria-label={t("editor.region")}>
      <div
        role="tablist"
        aria-label={t("editor.openFiles")}
        className="flex h-9 shrink-0 items-end gap-px overflow-x-auto bg-topbar px-1"
      >
        {openFiles.map((path) => {
          const active = path === activeFile;
          return (
            <div
              key={path}
              role="presentation"
              className={`group flex h-8 shrink-0 items-center rounded-t ${
                active ? "bg-panel text-fg" : "text-fg-muted hover:bg-panel/60"
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                title={`${path} — ${t("editor.tabKeys")}`}
                onClick={() => openFile(path)}
                onKeyDown={(e) => onTabKey(e, () => void closeTab(path))}
                className="h-full pr-1 pl-3 text-sm"
              >
                {basename(path)}
                {isDirty(buffers[path]) && (
                  <span className="ml-1.5 text-accent-text" aria-hidden>
                    ●
                  </span>
                )}
              </button>
              {/* Mouse only: from the keyboard, Delete on the tab closes it. */}
              <span
                aria-hidden
                title={t("common.close", { name: basename(path) })}
                onClick={() => void closeTab(path)}
                className={`mr-1 rounded p-0.5 hover:bg-hover ${active ? "" : "opacity-0 group-hover:opacity-100"}`}
              >
                <X size={13} />
              </span>
            </div>
          );
        })}
      </div>
      <EditorToolbar />
      <div className="relative min-h-0 flex-1">
        {shown && shownBuffer && (
          <div className={editorVisible ? "h-full" : "hidden"}>
            <CodeEditor path={shown} content={shownBuffer.content} />
          </div>
        )}
        {editorVisible ? null : activeFile && binary ? (
          <FileViewer path={activeFile} />
        ) : activeFile && error ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-fg-muted">
            {error}
          </div>
        ) : activeFile ? (
          <div className="flex h-full items-center justify-center text-sm text-fg-muted">
            {t("common.loading")}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-fg-muted">
            {t("editor.noFile")}
          </div>
        )}
      </div>
    </section>
  );
}
