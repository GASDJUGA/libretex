import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { useT } from "../../i18n";
import { buildOutline, currentHeading, hasChildren, headingKeys, shownAs } from "../../lib/outline";
import { outlineCollapsed, rememberOutline } from "../../lib/session";
import { useBuffers } from "../../store/buffers";
import { useSettledBuffers } from "../../store/settledBuffers";
import { useProjectView } from "../../store/project";
import { useProjects } from "../../store/projects";
import { Collapsible } from "../common/Collapsible";
import { IconButton, PanelHeader } from "../common/PanelHeader";

/** Collapsed headings of a project, as remembered in its session. */
const collapsedOf = (projectId: string | null) => ({
  projectId,
  keys: new Set(projectId ? outlineCollapsed(projectId) : []),
});

/**
 * Sections of the active file (and of the files it includes), updated when typing pauses; the
 * section containing the cursor is highlighted and clicking a title jumps to it. A heading
 * with subsections can be collapsed (pedido del usuario), remembered per project; its
 * subsections are nested under it and fold with an animation.
 */
export function Outline() {
  const t = useT();
  const activeFile = useProjectView((s) => s.activeFile);
  const cursorLine = useProjectView((s) => s.cursorLine);
  const goToLine = useProjectView((s) => s.goToLine);
  const buffers = useSettledBuffers();
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

  const projectId = useProjects((s) => s.current?.id ?? null);
  const [collapsed, setCollapsed] = useState(() => collapsedOf(projectId));
  if (collapsed.projectId !== projectId) setCollapsed(collapsedOf(projectId));
  const setKeys = (keys: Set<string>) => {
    setCollapsed({ projectId, keys });
    if (projectId) rememberOutline(projectId, [...keys]);
  };

  const keys = useMemo(() => headingKeys(headings), [headings]);
  const shown = shownAs(headings, keys, collapsed.keys);
  const expandable = headings.map((_, i) => hasChildren(headings, i));
  // Inside a collapsed heading, the cursor's section shows as that heading.
  const cursorAt = activeFile ? currentHeading(headings, activeFile, cursorLine) : -1;
  const current = cursorAt >= 0 ? shown[cursorAt] : -1;
  const minLevel = Math.min(...headings.map((h) => h.level));

  const setOpen = (i: number, open: boolean) => {
    if (!expandable[i] || collapsed.keys.has(keys[i]) === !open) return;
    const next = new Set(collapsed.keys);
    if (open) next.delete(keys[i]);
    else next.add(keys[i]);
    setKeys(next);
  };
  const collapseAll = () =>
    setKeys(new Set([...collapsed.keys, ...keys.filter((_, i) => expandable[i])]));
  const expandAll = () => {
    const here = new Set(keys);
    setKeys(new Set([...collapsed.keys].filter((k) => !here.has(k))));
  };
  const onKeyDown = (i: number) => (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setOpen(i, e.key === "ArrowRight");
  };

  /** Headings `start`…`end - 1`, each with its subsections nested under it (they fold). */
  const renderRange = (start: number, end: number): ReactNode[] => {
    const rows: ReactNode[] = [];
    for (let i = start; i < end;) {
      let next = i + 1;
      while (next < end && headings[next].level > headings[i].level) next++;
      rows.push(row(i, next));
      i = next;
    }
    return rows;
  };

  const row = (i: number, subsectionsEnd: number) => {
    const heading = headings[i];
    const open = !collapsed.keys.has(keys[i]);
    return (
      <li key={`${heading.file}:${heading.line}:${i}`}>
        <button
          type="button"
          title={heading.file === activeFile ? undefined : heading.file}
          style={{ paddingLeft: `${(heading.level - minLevel) * 14 + 4}px` }}
          aria-current={i === current ? "location" : undefined}
          aria-expanded={expandable[i] ? open : undefined}
          onClick={() => goToLine(heading.file, heading.line)}
          onKeyDown={onKeyDown(i)}
          className={`flex h-7 w-full items-center gap-1 pr-2 text-left text-sm ${
            i === current ? "bg-accent/25 text-fg" : "text-fg-muted hover:bg-hover hover:text-fg"
          }`}
        >
          {/* Mouse only: with the keyboard, ← and → on the title. */}
          <span
            aria-hidden
            title={expandable[i] ? t("outline.toggle") : undefined}
            data-testid={expandable[i] ? "outline-toggle" : undefined}
            onClick={(e) => {
              if (!expandable[i]) return;
              e.stopPropagation();
              setOpen(i, !open);
            }}
            className="flex h-5 w-4 shrink-0 items-center justify-center rounded hover:text-fg"
          >
            {expandable[i] && (open ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
          </span>
          <span className="truncate">{heading.title}</span>
          {heading.file !== activeFile && (
            <span className="ml-auto shrink-0 font-mono text-[10px] text-fg-muted">
              {heading.file.split("/").pop()}
            </span>
          )}
        </button>
        {expandable[i] && (
          <Collapsible open={open}>
            {() => <ul>{renderRange(i + 1, subsectionsEnd)}</ul>}
          </Collapsible>
        )}
      </li>
    );
  };

  return (
    <section className="flex h-full flex-col bg-panel" aria-label={t("outline.title")}>
      <PanelHeader title={t("outline.title")}>
        {expandable.some(Boolean) && (
          <>
            <IconButton label={t("outline.expandAll")} onClick={expandAll}>
              <ChevronsUpDown size={15} aria-hidden />
            </IconButton>
            <IconButton label={t("outline.collapseAll")} onClick={collapseAll}>
              <ChevronsDownUp size={15} aria-hidden />
            </IconButton>
          </>
        )}
      </PanelHeader>
      {headings.length === 0 ? (
        <p className="px-3 py-2 text-sm text-fg-muted">
          {activeFile && !isTex ? t("outline.notTex") : t("outline.empty")}
        </p>
      ) : (
        <ul className="flex-1 overflow-auto py-1">{renderRange(0, headings.length)}</ul>
      )}
    </section>
  );
}
