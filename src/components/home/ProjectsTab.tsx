import {
  ChevronDown,
  CloudDownload,
  EllipsisVertical,
  FileArchive,
  FileText,
  FolderOpen,
  FolderX,
  Plus,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useI18n, useT } from "../../i18n";
import { IS_MAC } from "../../lib/platform";
import { notifyError, notifyInfo } from "../../lib/errors";
import { filterAndSortProjects, type ProjectSort } from "../../lib/projects/filterSort";
import { compilerLabels } from "../../mocks/projects";
import { useWorkspaces } from "../../store/workspaces";
import { useProjects } from "../../store/projects";
import type { OpenFolderResult, ProjectSummary } from "../../store/types";
import { Menu, type MenuEntry } from "../common/Menu";
import { CloneDialog } from "./CloneDialog";
import { MainFileDialog, NewProjectDialog, RenameDialog, TrashDialog } from "./ProjectDialogs";

const sorts: ProjectSort[] = ["recent", "name", "modified"];

const secondaryButton =
  "flex h-9 items-center gap-2 rounded border border-line bg-panel px-3 text-sm hover:bg-hover";

type DialogState =
  | { kind: "new"; template: string | null }
  | { kind: "clone" }
  | { kind: "rename"; project: ProjectSummary }
  | { kind: "trash"; project: ProjectSummary }
  | { kind: "main"; result: OpenFolderResult }
  | null;

export function ProjectsTab() {
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const goToProject = useWorkspaces((s) => s.open);
  const { projects, templates, status, load, openFolder, importZip, duplicate, forget, reveal } =
    useProjects();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProjectSort>("recent");
  const [dialog, setDialog] = useState<DialogState>(null);

  useEffect(() => {
    load().catch(notifyError);
  }, [load]);

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );
  const visible = useMemo(
    () => filterAndSortProjects(projects, query, sort),
    [projects, query, sort],
  );

  const attempt = (action: () => Promise<unknown>) => {
    action().catch(notifyError);
  };

  /** After opening a folder or importing a ZIP: pick the main file if needed, then open. */
  const afterOpen = (result: OpenFolderResult | null) => {
    if (!result) return;
    if (result.candidates.length > 1) {
      setDialog({ kind: "main", result });
      return;
    }
    if (result.candidates.length === 0) notifyInfo(t("projects.noMainFile"));
    goToProject(result.project.id);
  };

  const newProjectEntries: MenuEntry[] = [
    { label: t("projects.empty"), onSelect: () => setDialog({ kind: "new", template: null }) },
    { kind: "separator" },
    { kind: "label", label: t("projects.fromTemplate") },
    ...templates.map((template): MenuEntry => ({
      label: template.name[locale],
      hint: template.default ? t("projects.default") : undefined,
      onSelect: () => setDialog({ kind: "new", template: template.id }),
    })),
  ];

  const actions = (p: ProjectSummary): MenuEntry[] =>
    p.missing
      ? [{ label: t("projects.forget"), onSelect: () => attempt(() => forgetProject(p)) }]
      : [
          { label: t("projects.actionOpen"), onSelect: () => goToProject(p.id) },
          {
            label: t("projects.rename"),
            onSelect: () => setDialog({ kind: "rename", project: p }),
          },
          {
            label: t("projects.duplicate"),
            onSelect: () =>
              attempt(async () => {
                const copy = await duplicate(p.id);
                notifyInfo(t("projects.duplicated", { name: copy.name }));
              }),
          },
          {
            label: t(IS_MAC ? "projects.revealFinder" : "projects.reveal"),
            onSelect: () => attempt(() => reveal(p.id)),
          },
          { kind: "separator" },
          { label: t("projects.forget"), onSelect: () => attempt(() => forgetProject(p)) },
          { label: t("projects.trash"), onSelect: () => setDialog({ kind: "trash", project: p }) },
        ];

  const forgetProject = async (p: ProjectSummary) => {
    await forget(p.id);
    notifyInfo(t("projects.forgotten", { name: p.name }));
  };

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
        <button
          type="button"
          className={secondaryButton}
          onClick={() =>
            attempt(async () => afterOpen(await openFolder(t("projects.openFolderTitle"))))
          }
        >
          <FolderOpen size={16} aria-hidden /> {t("projects.openFolder")}
        </button>
        <button
          type="button"
          className={secondaryButton}
          onClick={() =>
            attempt(async () =>
              afterOpen(await importZip(t("projects.importZipTitle"), t("projects.zipFilter"))),
            )
          }
        >
          <FileArchive size={16} aria-hidden /> {t("projects.importZip")}
        </button>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => setDialog({ kind: "clone" })}
        >
          <CloudDownload size={16} aria-hidden /> {t("projects.fromGithub")}
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
        {status === "loading" && projects.length === 0 ? (
          <p className="py-12 text-center text-sm text-fg-muted">{t("projects.loading")}</p>
        ) : projects.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
            <h2 className="text-lg font-semibold">{t("projects.emptyTitle")}</h2>
            <p className="text-sm text-fg-muted">{t("projects.emptyText")}</p>
            <button
              type="button"
              onClick={() =>
                setDialog({
                  kind: "new",
                  template: templates.find((tpl) => tpl.default)?.id ?? null,
                })
              }
              className="mt-2 flex h-9 items-center gap-2 rounded bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent-hover"
            >
              <Plus size={16} aria-hidden /> {t("projects.new")}
            </button>
          </div>
        ) : visible.length === 0 ? (
          <p className="py-12 text-center text-sm text-fg-muted">
            {t("projects.noMatch", { query })}
          </p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            {visible.map((p) => (
              <li
                key={p.id}
                className={`group relative flex flex-col overflow-hidden rounded-lg border bg-panel ${
                  p.missing
                    ? "border-dashed border-line opacity-75"
                    : "border-line hover:border-accent"
                }`}
              >
                <button
                  type="button"
                  onClick={() => goToProject(p.id)}
                  disabled={p.missing}
                  className="flex flex-1 flex-col text-left disabled:cursor-default"
                  aria-label={t("projects.open", { name: p.name })}
                >
                  <div className="flex h-28 items-center justify-center bg-panel-raised">
                    {p.missing ? (
                      <FolderX size={40} className="text-fg-muted" aria-hidden />
                    ) : (
                      <div className="flex h-24 w-[68px] flex-col gap-1 bg-white p-2 shadow">
                        <div className="mx-auto mb-1 h-1.5 w-8 bg-neutral-400" />
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                          <div key={i} className="h-0.5 bg-neutral-300" />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 p-3">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="truncate text-xs text-fg-muted" title={p.path}>
                      {p.displayPath}
                    </span>
                    {p.missing ? (
                      <span className="mt-1 text-xs text-warning" title={t("projects.missingHint")}>
                        {t("projects.missing")}
                      </span>
                    ) : (
                      <span className="mt-1 flex items-center justify-between text-xs text-fg-muted">
                        <span>
                          {p.modifiedAt === null
                            ? t("projects.neverModified")
                            : dateFormat.format(new Date(p.modifiedAt))}
                        </span>
                        <span className="flex items-center gap-1 rounded bg-topbar px-1.5 py-0.5">
                          <FileText size={11} aria-hidden />
                          {compilerLabels[p.compiler]}
                        </span>
                      </span>
                    )}
                  </div>
                </button>
                <div className="absolute top-2 right-2">
                  <Menu
                    trigger={<EllipsisVertical size={16} aria-hidden />}
                    label={t("projects.actions", { name: p.name })}
                    align="end"
                    triggerClassName="flex h-7 w-7 items-center justify-center rounded bg-panel/80 text-fg-muted hover:bg-hover hover:text-fg aria-expanded:bg-hover"
                    entries={actions(p)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {dialog?.kind === "new" && (
        <NewProjectDialog
          initialTemplate={dialog.template}
          onClose={() => setDialog(null)}
          onCreated={(p) => {
            setDialog(null);
            goToProject(p.id);
          }}
        />
      )}
      {dialog?.kind === "clone" && (
        <CloneDialog
          onClose={() => setDialog(null)}
          onOpen={(id) => {
            setDialog(null);
            goToProject(id);
          }}
          onCloned={(result) => {
            setDialog(null);
            notifyInfo(t("clone.done", { name: result.project.name }));
            afterOpen(result);
          }}
        />
      )}
      {dialog?.kind === "rename" && (
        <RenameDialog project={dialog.project} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "trash" && (
        <TrashDialog
          project={dialog.project}
          onClose={() => setDialog(null)}
          onTrashed={() => {
            notifyInfo(t("projects.trashed", { name: dialog.project.name }));
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "main" && (
        <MainFileDialog
          result={dialog.result}
          onClose={() => setDialog(null)}
          onChosen={(p) => {
            setDialog(null);
            goToProject(p.id);
          }}
        />
      )}
    </section>
  );
}
