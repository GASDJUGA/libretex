import { FolderOpen, Package, Settings, Trash2, type LucideIcon } from "lucide-react";
import { Logo } from "../components/common/Logo";
import { PackagesTab } from "../components/home/PackagesTab";
import { ProjectsTab } from "../components/home/ProjectsTab";
import { SettingsTab } from "../components/home/SettingsTab";
import { TrashTab } from "../components/home/TrashTab";
import { useAppStore, type HomeTab } from "../store/app";
import { useT } from "../i18n";
import { holdUntilDrawn, useEntrance } from "../lib/transition";

const tabs: [HomeTab, LucideIcon][] = [
  ["projects", FolderOpen],
  ["trash", Trash2],
  ["packages", Package],
  ["settings", Settings],
];

export function Home() {
  const t = useT();
  const { homeTab, setHomeTab } = useAppStore();
  // A section comes in from above or below, as in the list on the left.
  const entrance = useEntrance(
    homeTab,
    tabs.findIndex(([id]) => id === homeTab),
  );

  return (
    <div className="flex h-full bg-topbar text-fg">
      <aside className="flex w-56 shrink-0 flex-col border-r border-black/30 bg-rail">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <Logo size={30} />
          <span className="text-lg font-semibold">JuTeX</span>
        </div>
        <nav aria-label={t("home.sections")} className="flex flex-col gap-0.5 px-2">
          {tabs.map(([id, Icon]) => (
            <button
              key={id}
              type="button"
              aria-current={homeTab === id ? "page" : undefined}
              onClick={() => setHomeTab(id)}
              className="flex h-9 items-center gap-3 rounded px-3 text-sm text-fg-muted hover:bg-hover hover:text-fg aria-[current=page]:bg-hover aria-[current=page]:text-fg"
            >
              <Icon size={17} aria-hidden />
              {t(`home.tabs.${id}`)}
            </button>
          ))}
        </nav>
        <p className="mt-auto px-5 py-4 text-xs text-fg-muted">
          {t("home.footer", { version: __APP_VERSION__ })}
        </p>
      </aside>
      <main className="min-w-0 flex-1 overflow-hidden bg-topbar">
        <div key={homeTab} ref={holdUntilDrawn} className={`lt-section-${entrance} lt-hold h-full`}>
          {homeTab === "projects" && <ProjectsTab />}
          {homeTab === "trash" && <TrashTab />}
          {homeTab === "packages" && <PackagesTab />}
          {homeTab === "settings" && <SettingsTab />}
        </div>
      </main>
    </div>
  );
}
