import { X } from "lucide-react";
import { useEffect } from "react";
import { isDirty, useBuffers } from "../../store/buffers";
import { useProjectView } from "../../store/project";
import { CodePreview } from "./CodePreview";
import { EditorToolbar } from "./EditorToolbar";
import { useT } from "../../i18n";

type EditorPaneProps = {
  cursorLine: number;
};

function basename(path: string) {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function EditorPane({ cursorLine }: EditorPaneProps) {
  const t = useT();
  const { openFiles, activeFile, openFile, closeFile } = useProjectView();
  const { buffers, errors, load, close } = useBuffers();
  const projectId = useBuffers((s) => s.projectId);

  const buffer = activeFile ? buffers[activeFile] : undefined;
  const error = activeFile ? errors[activeFile] : undefined;

  // Read-only view of the active file until the CodeMirror editor arrives (phase 4).
  useEffect(() => {
    if (activeFile) load(activeFile);
  }, [projectId, activeFile, load, error]);

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
              className={`group flex h-8 shrink-0 items-center rounded-t ${
                active ? "bg-panel text-fg" : "text-fg-muted hover:bg-panel/60"
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                title={path}
                onClick={() => openFile(path)}
                className="h-full pr-1 pl-3 text-sm"
              >
                {basename(path)}
                {isDirty(buffers[path]) && (
                  <span className="ml-1.5 text-accent" aria-hidden>
                    ●
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-label={t("common.close", { name: basename(path) })}
                onClick={() => {
                  closeFile(path);
                  close(path);
                }}
                className={`mr-1 rounded p-0.5 hover:bg-hover ${active ? "" : "opacity-0 group-hover:opacity-100"}`}
              >
                <X size={13} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
      <EditorToolbar />
      <div className="min-h-0 flex-1">
        {activeFile && error ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-fg-muted">
            {error}
          </div>
        ) : buffer ? (
          <CodePreview source={buffer.content} activeLine={cursorLine} />
        ) : activeFile ? null : (
          <div className="flex h-full items-center justify-center text-sm text-fg-muted">
            {t("editor.noFile")}
          </div>
        )}
      </div>
    </section>
  );
}
