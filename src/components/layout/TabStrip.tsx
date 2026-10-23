import { House, Loader2, X } from "lucide-react";
import { useState, type DragEvent, type MouseEvent } from "react";
import { onTabKey } from "../../lib/tabKeys";
import { useT } from "../../i18n";
import { useAppStore } from "../../store/app";
import { useCompile } from "../../store/compile";
import { useProjects } from "../../store/projects";
import { useWorkspaces } from "../../store/workspaces";

const tabBase =
  "group flex h-full min-w-0 items-center gap-1.5 border-r border-black/25 px-3 text-xs select-none";

/**
 * The window's tabs, like a browser: the home screen first, then each open project
 * (pedido del usuario). Click to switch, the cross or a middle click to close, drag to
 * reorder; Ctrl+Tab / Ctrl+Shift+Tab go through them.
 */
export function TabStrip() {
  const t = useT();
  const route = useAppStore((s) => s.route);
  const goHome = useAppStore((s) => s.goHome);
  const { tabs, compiling, open, close, move } = useWorkspaces();
  const projects = useProjects((s) => s.projects);
  const current = useProjects((s) => s.current);
  const compilingHere = useCompile((s) => (s.running ? s.projectId : null));
  const [dragged, setDragged] = useState<string | null>(null);

  const nameOf = (id: string) =>
    (current?.id === id ? current.name : projects.find((p) => p.id === id)?.name) ?? "…";
  const onHome = route.name !== "project";

  const onAuxClick = (e: MouseEvent, id: string) => {
    if (e.button === 1) {
      e.preventDefault();
      void close(id);
    }
  };
  const onDrop = (e: DragEvent, index: number) => {
    e.preventDefault();
    if (dragged) move(dragged, index);
    setDragged(null);
  };

  return (
    <nav
      aria-label={t("tabs.label")}
      className="flex h-8 shrink-0 items-stretch overflow-x-auto bg-tabstrip text-fg-muted"
    >
      <div role="tablist" aria-label={t("tabs.label")} className="flex min-w-0 items-stretch">
        <button
          type="button"
          role="tab"
          aria-selected={onHome}
          title={t("tabs.home")}
          onClick={() => goHome()}
          className={`${tabBase} ${onHome ? "bg-topbar text-fg" : "hover:bg-hover hover:text-fg"}`}
        >
          <House size={14} aria-hidden />
          <span>{t("tabs.home")}</span>
        </button>
        {tabs.map((id, index) => {
          const active = route.name === "project" && route.projectId === id;
          const busy = compiling.includes(id) || compilingHere === id;
          const name = nameOf(id);
          return (
            <div
              key={id}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              title={`${name} — ${t("editor.tabKeys")}`}
              draggable
              onDragStart={() => setDragged(id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, index)}
              onClick={() => open(id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") open(id);
                else onTabKey(e, () => void close(id));
              }}
              onAuxClick={(e) => onAuxClick(e, id)}
              className={`${tabBase} max-w-56 cursor-default ${
                active ? "bg-topbar text-fg" : "hover:bg-hover hover:text-fg"
              } ${dragged === id ? "opacity-50" : ""}`}
            >
              {busy && (
                <Loader2
                  size={12}
                  className="shrink-0 animate-spin text-accent-text"
                  aria-label={t("tabs.compiling")}
                />
              )}
              <span className="truncate">{name}</span>
              {/* Mouse only: from the keyboard, Delete on the tab closes it. */}
              <span
                aria-hidden
                title={t("tabs.close", { name })}
                onClick={(e) => {
                  e.stopPropagation();
                  void close(id);
                }}
                className={`ml-1 rounded p-0.5 hover:bg-panel-raised hover:text-fg ${
                  active ? "" : "opacity-0 group-hover:opacity-100"
                }`}
              >
                <X size={12} />
              </span>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
