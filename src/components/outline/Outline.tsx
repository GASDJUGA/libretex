import { useEffect, useMemo } from "react";
import { useT } from "../../i18n";
import { buildOutline, currentHeading } from "../../lib/outline";
import { useBuffers } from "../../store/buffers";
import { useProjectView } from "../../store/project";
import { PanelHeader } from "../common/PanelHeader";

/**
 * Sections of the active file (and of the files it includes), updated while typing; the
 * section containing the cursor is highlighted and clicking a title jumps to it.
 */
export function Outline() {
  const t = useT();
  const { activeFile, cursorLine, goToLine } = useProjectView();
  const buffers = useBuffers((s) => s.buffers);
  const load = useBuffers((s) => s.load);
  const isTex = activeFile?.endsWith(".tex") ?? false;

  const { headings, pending } = useMemo(
    () =>
      activeFile && isTex
        ? buildOutline(activeFile, (path) => buffers[path]?.content)
        : { headings: [], pending: [] },
    [activeFile, isTex, buffers],
  );

  // Included files are loaded in the background (as buffers, without opening tabs).
  const pendingKey = pending.join("\n");
  useEffect(() => {
    for (const path of pendingKey.split("\n")) if (path) load(path);
  }, [pendingKey, load]);

  const current = activeFile ? currentHeading(headings, activeFile, cursorLine) : -1;
  const minLevel = Math.min(...headings.map((h) => h.level));

  return (
    <section className="flex h-full flex-col bg-panel" aria-label={t("outline.title")}>
      <PanelHeader title={t("outline.title")} />
      {headings.length === 0 ? (
        <p className="px-3 py-2 text-sm text-fg-muted">
          {activeFile && !isTex ? t("outline.notTex") : t("outline.empty")}
        </p>
      ) : (
        <ul className="flex-1 overflow-auto py-1">
          {headings.map((heading, i) => (
            <li key={`${heading.file}:${heading.line}:${i}`}>
              <button
                type="button"
                title={heading.file === activeFile ? undefined : heading.file}
                style={{ paddingLeft: `${(heading.level - minLevel) * 14 + 12}px` }}
                aria-current={i === current ? "location" : undefined}
                onClick={() => goToLine(heading.file, heading.line)}
                className={`flex h-7 w-full items-center gap-2 pr-2 text-left text-sm ${
                  i === current
                    ? "bg-accent/25 text-fg"
                    : "text-fg-muted hover:bg-hover hover:text-fg"
                }`}
              >
                <span className="truncate">{heading.title}</span>
                {heading.file !== activeFile && (
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-fg-muted">
                    {heading.file.split("/").pop()}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
