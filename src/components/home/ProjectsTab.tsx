import {
  ChevronDown,
  EllipsisVertical,
  FileArchive,
  FileText,
  FolderOpen,
  Plus,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { filterAndSortProjects, type ProjectSort } from "../../lib/projects/filterSort";
import { compilerLabels, mockProjects } from "../../mocks/projects";
import { mockTemplates } from "../../mocks/templates";
import { useAppStore } from "../../store/app";
import { Menu, type MenuEntry } from "../common/Menu";
import { useI18n, useT } from "../../i18n";

const sorts: ProjectSort[] = ["recent", "name", "modified"];

const secondaryButton =
  "flex h-9 items-center gap-2 rounded border border-line bg-panel px-3 text-sm hover:bg-hover";

export function ProjectsTab() {
  const t = useT();
  const openProject = useAppStore((s) => s.openProject);
  const locale = useI18n((s) => s.locale);
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProjectSort>("recent");
  const projects = useMemo(() => filterAndSortProjects(mockProjects, query, sort), [query, sort]);

  const newProjectEntries: MenuEntry[] = [
    { label: t("projects.empty") },
    { kind: "separator" },
    { kind: "label", label: t("projects.fromTemplate") },
    ...mockTemplates.map((template, i): MenuEntry => ({
      label: template.name[locale],
      hint: i === 0 ? t("projects.default") : undefined,
    })),
  ];

  return (
    <section aria-labelledby="projects-title" className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-8 py-5">
        <h1 id="projects-title" className="mr-auto text-xl font-semibold">
          {t("projects.title")}
        </h1>
        <Menu
          trigger={
            <>
              <Plus size={16} aria-hidden /> {t("projects.new")}{" "}
              <ChevronDown size={14} aria-hidden />
            </>
          }
          entries={newProjectEntries}
          align="end"
          triggerClassName="flex h-9 items-center gap-2 rounded bg-accent px-3 text-sm font-medium text-accent-fg hover:bg-accent-hover"
        />
        <button type="button" className={secondaryButton}>
          <FolderOpen size={16} aria-hidden /> {t("projects.openFolder")}
        </button>
        <button type="button" className={secondaryButton}>
          <FileArchive size={16} aria-hidden /> {t("projects.importZip")}
        </button>
      </header>

      <div className="flex items-center gap-3 px-8 py-4">
        <label className="relative flex-1">
          <span className="sr-only">{t("projects.search")}</span>
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("projects.searchPlaceholder")}
            className="h-9 w-full rounded border border-line bg-panel pr-3 pl-9 text-sm text-fg placeholder:text-fg-muted"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          {t("projects.sortBy")}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as ProjectSort)}
            className="h-9 rounded border border-line bg-panel px-2 text-fg"
          >
            {sorts.map((s) => (
              <option key={s} value={s}>
                {t(`projects.sort.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-8 pb-8">
        {projects.length === 0 ? (
          <p className="py-12 text-center text-sm text-fg-muted">
            {t("projects.noMatch", { query })}
          </p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            {projects.map((p) => (
              <li
                key={p.id}
                className="group relative flex flex-col overflow-hidden rounded-lg border border-line bg-panel hover:border-accent"
              >
                <button
                  type="button"
                  onClick={() => openProject(p.id)}
                  className="flex flex-1 flex-col text-left"
                  aria-label={t("projects.open", { name: p.name })}
                >
                  <div className="flex h-28 items-center justify-center bg-panel-raised">
                    <div className="flex h-24 w-[68px] flex-col gap-1 bg-white p-2 shadow">
                      <div className="mx-auto mb-1 h-1.5 w-8 bg-neutral-400" />
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="h-0.5 bg-neutral-300" />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 p-3">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="truncate text-xs text-fg-muted" title={p.path}>
                      {p.path}
                    </span>
                    <span className="mt-1 flex items-center justify-between text-xs text-fg-muted">
                      <span>
                        {p.modifiedAt === null ? "—" : dateFormat.format(new Date(p.modifiedAt))}
                      </span>
                      <span className="flex items-center gap-1 rounded bg-topbar px-1.5 py-0.5">
                        <FileText size={11} aria-hidden />
                        {compilerLabels[p.compiler]}
                      </span>
                    </span>
                  </div>
                </button>
                <div className="absolute top-2 right-2">
                  <Menu
                    trigger={<EllipsisVertical size={16} aria-hidden />}
                    label={t("projects.actions", { name: p.name })}
                    align="end"
                    triggerClassName="flex h-7 w-7 items-center justify-center rounded bg-panel/80 text-fg-muted hover:bg-hover hover:text-fg aria-expanded:bg-hover"
                    entries={[
                      { label: t("projects.actionOpen"), onSelect: () => openProject(p.id) },
                      { label: t("projects.rename") },
                      { label: t("projects.duplicate") },
                      { label: t("projects.reveal") },
                      { kind: "separator" },
                      { label: t("projects.trash") },
                    ]}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
