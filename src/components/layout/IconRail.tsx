import {
  CircleHelp,
  Files,
  Package,
  ScrollText,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useAppStore } from "../../store/app";
import { useProjectView, type SidePanel } from "../../store/project";

const panels: [SidePanel, string, LucideIcon][] = [
  ["files", "Archivos", Files],
  ["search", "Buscar en el proyecto", Search],
  ["packages", "Paquetes", Package],
  ["logs", "Registros y errores", ScrollText],
];

type IconRailProps = {
  errorCount: number;
};

const buttonClass =
  "relative flex h-10 w-10 items-center justify-center rounded text-fg-muted hover:bg-hover hover:text-fg";

export function IconRail({ errorCount }: IconRailProps) {
  const { sidePanel, sidePanelOpen, toggleSidePanel } = useProjectView();
  const goHome = useAppStore((s) => s.goHome);

  return (
    <nav
      aria-label="Paneles"
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-black/30 bg-rail py-2"
    >
      {panels.map(([id, label, Icon]) => {
        const active = sidePanelOpen && sidePanel === id;
        return (
          <button
            key={id}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active}
            onClick={() => toggleSidePanel(id)}
            className={`${buttonClass} ${active ? "bg-hover text-fg before:absolute before:top-2 before:bottom-2 before:-left-1 before:w-0.5 before:rounded before:bg-accent" : ""}`}
          >
            <Icon size={20} aria-hidden />
            {id === "logs" && errorCount > 0 && (
              <span className="absolute top-1 right-1 min-w-4 rounded-full bg-danger px-1 text-[10px] leading-4 font-semibold text-white">
                {errorCount}
              </span>
            )}
          </button>
        );
      })}
      <div className="mt-auto flex flex-col items-center gap-1">
        <button type="button" title="Ayuda" aria-label="Ayuda" className={buttonClass}>
          <CircleHelp size={20} aria-hidden />
        </button>
        <button
          type="button"
          title="Ajustes"
          aria-label="Ajustes"
          className={buttonClass}
          onClick={() => goHome("settings")}
        >
          <Settings size={20} aria-hidden />
        </button>
      </div>
    </nav>
  );
}
