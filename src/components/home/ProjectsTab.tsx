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

const dateFormat = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });

const sortLabels: Record<ProjectSort, string> = {
  recent: "Abiertos recientemente",
  name: "Nombre",
  modified: "Última modificación",
};

const secondaryButton =
  "flex h-9 items-center gap-2 rounded border border-line bg-panel px-3 text-sm hover:bg-hover";

export function ProjectsTab() {
  const openProject = useAppStore((s) => s.openProject);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProjectSort>("recent");
  const projects = useMemo(() => filterAndSortProjects(mockProjects, query, sort), [query, sort]);

  const newProjectEntries: MenuEntry[] = [
    { label: "Proyecto vacío" },
    { kind: "separator" },
    { kind: "label", label: "Desde plantilla" },
    ...mockTemplates.map((t, i): MenuEntry => ({
      label: t.name,
      hint: i === 0 ? "Por defecto" : undefined,
    })),
  ];

  return (
    <section aria-labelledby="projects-title" className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-8 py-5">
        <h1 id="projects-title" className="mr-auto text-xl font-semibold">
          Proyectos
        </h1>
        <Menu
          trigger={
            <>
              <Plus size={16} aria-hidden /> Nuevo proyecto <ChevronDown size={14} aria-hidden />
            </>
          }
          entries={newProjectEntries}
          align="end"
          triggerClassName="flex h-9 items-center gap-2 rounded bg-accent px-3 text-sm font-medium text-accent-fg hover:bg-accent-hover"
        />
        <button type="button" className={secondaryButton}>
          <FolderOpen size={16} aria-hidden /> Abrir carpeta
        </button>
        <button type="button" className={secondaryButton}>
          <FileArchive size={16} aria-hidden /> Importar ZIP
        </button>
      </header>

      <div className="flex items-center gap-3 px-8 py-4">
        <label className="relative flex-1">
          <span className="sr-only">Buscar proyectos</span>
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o ruta…"
            className="h-9 w-full rounded border border-line bg-panel pr-3 pl-9 text-sm text-fg placeholder:text-fg-muted"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          Ordenar por
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as ProjectSort)}
            className="h-9 rounded border border-line bg-panel px-2 text-fg"
          >
            {(Object.keys(sortLabels) as ProjectSort[]).map((s) => (
              <option key={s} value={s}>
                {sortLabels[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-8 pb-8">
        {projects.length === 0 ? (
          <p className="py-12 text-center text-sm text-fg-muted">
            Ningún proyecto coincide con «{query}».
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
                  aria-label={`Abrir ${p.name}`}
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
                      <span>{dateFormat.format(new Date(p.modifiedAt))}</span>
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
                    label={`Acciones de ${p.name}`}
                    align="end"
                    triggerClassName="flex h-7 w-7 items-center justify-center rounded bg-panel/80 text-fg-muted hover:bg-hover hover:text-fg aria-expanded:bg-hover"
                    entries={[
                      { label: "Abrir", onSelect: () => openProject(p.id) },
                      { label: "Renombrar…" },
                      { label: "Duplicar" },
                      { label: "Mostrar en el gestor de archivos" },
                      { kind: "separator" },
                      { label: "Mover a la papelera…" },
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
