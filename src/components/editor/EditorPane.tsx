import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { errorText } from "../../lib/errors";
import { getBackend } from "../../lib/tauri";
import { useProjectView } from "../../store/project";
import { useProjects } from "../../store/projects";
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
  const projectId = useProjects((s) => s.current?.id);
  // Read-only view of the active file until the CodeMirror editor arrives (phase 4).
  const [file, setFile] = useState<{ path: string; content?: string; error?: string }>();

  useEffect(() => {
    if (!projectId || !activeFile) return;
    let cancelled = false;
    getBackend()
      .readTextFile(projectId, activeFile)
      .then((f) => !cancelled && setFile({ path: activeFile, content: f.content }))
      .catch((e) => !cancelled && setFile({ path: activeFile, error: errorText(e).text }));
    return () => {
      cancelled = true;
    };
  }, [projectId, activeFile]);
  const current = file?.path === activeFile ? file : undefined;

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
              </button>
              <button
                type="button"
                aria-label={t("common.close", { name: basename(path) })}
                onClick={() => closeFile(path)}
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
        {activeFile && current?.error ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-fg-muted">
            {current.error}
          </div>
        ) : activeFile && current?.content !== undefined ? (
          <CodePreview source={current.content} activeLine={cursorLine} />
        ) : activeFile ? null : (
          <div className="flex h-full items-center justify-center text-sm text-fg-muted">
            {t("editor.noFile")}
          </div>
        )}
      </div>
    </section>
  );
}
