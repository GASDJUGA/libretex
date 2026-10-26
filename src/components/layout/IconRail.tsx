import {
  CircleHelp,
  Columns2,
  Files,
  History,
  GitBranch,
  Package,
  ScrollText,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useAppStore } from "../../store/app";
import { useHelp } from "../../store/help";
import { useProjectView, type SidePanel } from "../../store/project";
import { useT, type TranslationKey } from "../../i18n";
import { Menu } from "../common/Menu";
import { useLayoutEntries } from "./useLayoutEntries";

const panels: [SidePanel, TranslationKey, LucideIcon][] = [
  ["files", "rail.files", Files],
  ["search", "rail.search", Search],
];
/** After the history and layout buttons (pedido del usuario: no arriba a la derecha). */
const lowerPanels: [SidePanel, TranslationKey, LucideIcon][] = [
  ["packages", "rail.packages", Package],
  ["logs", "rail.logs", ScrollText],
  ["backup", "rail.backup", GitBranch],
];

type IconRailProps = {
  errorCount: number;
};

const buttonClass =
  "relative flex h-10 w-10 items-center justify-center rounded text-fg-muted hover:bg-hover hover:text-fg";
const activeClass =
  "bg-hover text-fg before:absolute before:top-2 before:bottom-2 before:-left-1 before:w-0.5 before:rounded before:bg-accent";

export function IconRail({ errorCount }: IconRailProps) {
  const t = useT();
  const { sidePanel, sidePanelOpen, toggleSidePanel } = useProjectView();
  const goHome = useAppStore((s) => s.goHome);
  const historyOpen = useProjectView((s) => s.historyOpen && s.historySource === "history");
  const layoutEntries = useLayoutEntries();

  const panelButton = ([id, labelKey, Icon]: (typeof panels)[number]) => {
    const label = t(labelKey);
    const active = sidePanelOpen && sidePanel === id;
    return (
      <button
        key={id}
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={active}
        onClick={() => toggleSidePanel(id)}
        className={`${buttonClass} ${active ? activeClass : ""}`}
      >
        <Icon size={20} aria-hidden />
        {id === "logs" && errorCount > 0 && (
          <span className="absolute top-1 right-1 min-w-4 rounded-full bg-danger px-1 text-[10px] leading-4 font-semibold text-topbar">
            {errorCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <nav
      aria-label={t("rail.panels")}
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-black/30 bg-rail py-2"
    >
      {panels.map(panelButton)}
      <button
        type="button"
        title={t("project.history")}
        aria-label={t("project.history")}
        aria-pressed={historyOpen}
        onClick={() => useProjectView.getState().setHistoryOpen(!historyOpen)}
        className={`${buttonClass} ${historyOpen ? activeClass : ""}`}
      >
        <History size={20} aria-hidden />
      </button>
      <Menu
        trigger={<Columns2 size={20} aria-hidden />}
        label={t("layout.title")}
        title={t("layout.title")}
        entries={layoutEntries}
        align="right"
        triggerClassName={`${buttonClass} aria-expanded:bg-hover aria-expanded:text-fg`}
      />
      {lowerPanels.map(panelButton)}
      <div className="mt-auto flex flex-col items-center gap-1">
        <button
          type="button"
          title={`${t("rail.help")} (F1)`}
          aria-label={t("rail.help")}
          className={buttonClass}
          onClick={() => useHelp.getState().show("shortcuts")}
        >
          <CircleHelp size={20} aria-hidden />
        </button>
        <button
          type="button"
          title={t("rail.settings")}
          aria-label={t("rail.settings")}
          className={buttonClass}
          onClick={() => goHome("settings")}
        >
          <Settings size={20} aria-hidden />
        </button>
      </div>
    </nav>
  );
}
