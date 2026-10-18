import { create } from "zustand";
import { getBackend } from "../lib/tauri";
import type { OpenFolderResult, ProjectSummary, TemplateInfo, TrashedProject } from "./types";

type Status = "idle" | "loading" | "ready" | "error";

type ProjectsState = {
  projects: ProjectSummary[];
  templates: TemplateInfo[];
  /** Projects in the system trash that LibreTeX put there. */
  trashed: TrashedProject[];
  status: Status;
  /** The project open in the project view. */
  current: ProjectSummary | null;

  /** Reloads projects and templates. Errors are rethrown after setting `status`. */
  load: () => Promise<void>;
  create: (name: string, template: string | null) => Promise<ProjectSummary>;
  openFolder: (title: string) => Promise<OpenFolderResult | null>;
  importZip: (title: string, filterName: string) => Promise<OpenFolderResult | null>;
  /** «Desde GitHub»: clones a repository as a new project (network). */
  cloneProject: (url: string) => Promise<OpenFolderResult>;
  setMainFile: (id: string, path: string) => Promise<ProjectSummary>;
  /** Opens a project (updates its «opened at» date) and makes it `current`. */
  open: (id: string) => Promise<ProjectSummary>;
  rename: (id: string, name: string) => Promise<ProjectSummary>;
  updateMeta: (
    id: string,
    changes: { compiler?: ProjectSummary["compiler"]; spellLang?: ProjectSummary["spellLang"] },
  ) => Promise<ProjectSummary>;
  duplicate: (id: string) => Promise<ProjectSummary>;
  trash: (id: string) => Promise<void>;
  forget: (id: string) => Promise<void>;
  reveal: (id: string) => Promise<void>;
  loadTrashed: () => Promise<void>;
  restoreTrashed: (trashId: string) => Promise<ProjectSummary>;
  purgeTrashed: (trashId: string) => Promise<void>;
};

function upsert(list: ProjectSummary[], project: ProjectSummary) {
  return list.some((p) => p.id === project.id)
    ? list.map((p) => (p.id === project.id ? project : p))
    : [...list, project];
}

export const useProjects = create<ProjectsState>()((set) => {
  const store = (project: ProjectSummary) => {
    set((s) => ({
      projects: upsert(s.projects, project),
      current: s.current?.id === project.id ? project : s.current,
    }));
    return project;
  };
  const storeResult = (result: OpenFolderResult | null) => {
    if (result) store(result.project);
    return result;
  };
  const drop = (id: string) =>
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      current: s.current?.id === id ? null : s.current,
    }));

  return {
    projects: [],
    templates: [],
    trashed: [],
    status: "idle",
    current: null,

    load: async () => {
      set({ status: "loading" });
      try {
        const backend = getBackend();
        const [projects, templates] = await Promise.all([
          backend.listProjects(),
          backend.listTemplates(),
        ]);
        set({ projects, templates, status: "ready" });
      } catch (error) {
        set({ status: "error" });
        throw error;
      }
    },
    create: async (name, template) => store(await getBackend().createProject(name, template)),
    openFolder: async (title) => storeResult(await getBackend().openFolderDialog(title)),
    importZip: async (title, filterName) =>
      storeResult(await getBackend().importZipDialog(title, filterName)),
    cloneProject: async (url) => {
      const result = await getBackend().cloneProject(url);
      store(result.project);
      return result;
    },
    setMainFile: async (id, path) => store(await getBackend().setMainFile(id, path)),
    open: async (id) => {
      const project = store(await getBackend().openProject(id));
      set({ current: project });
      return project;
    },
    rename: async (id, name) => store(await getBackend().renameProject(id, name)),
    updateMeta: async (id, changes) => store(await getBackend().updateProjectMeta(id, changes)),
    duplicate: async (id) => store(await getBackend().duplicateProject(id)),
    trash: async (id) => {
      await getBackend().trashProject(id);
      drop(id);
      set({ trashed: await getBackend().listTrashed() });
    },
    forget: async (id) => {
      await getBackend().forgetProject(id);
      drop(id);
    },
    reveal: (id) => getBackend().revealProject(id),
    loadTrashed: async () => set({ trashed: await getBackend().listTrashed() }),
    restoreTrashed: async (trashId) => {
      const project = store(await getBackend().restoreTrashed(trashId));
      set((s) => ({ trashed: s.trashed.filter((t) => t.trashId !== trashId) }));
      return project;
    },
    purgeTrashed: async (trashId) => {
      await getBackend().purgeTrashed(trashId);
      set((s) => ({ trashed: s.trashed.filter((t) => t.trashId !== trashId) }));
    },
  };
});

export const initialProjectsState = {
  projects: [],
  templates: [],
  trashed: [],
  status: "idle" as Status,
  current: null,
};
