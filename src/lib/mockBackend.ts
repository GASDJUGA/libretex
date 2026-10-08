import { mockProjects } from "../mocks/projects";
import { mockTemplates } from "../mocks/templates";
import type { BackendError, ProjectSummary } from "../store/types";
import type { Backend } from "./tauri";

const fail = (code: string, message: string): never => {
  throw { code, message } satisfies BackendError;
};

/**
 * In-memory backend with the same behaviour as the Rust commands, for the browser preview
 * and tests. Nothing touches the disk.
 */
export function createMockBackend(seed: ProjectSummary[] = mockProjects): Backend {
  let projects = seed.map((p) => ({ ...p }));
  let counter = 0;

  const find = (id: string) =>
    projects.find((p) => p.id === id) ?? fail("unknownProject", `proyecto desconocido: ${id}`);
  const validName = (name: string) => {
    if (
      !name.trim() ||
      name !== name.trim() ||
      /[/\\\0]/.test(name) ||
      name === "." ||
      name === ".."
    ) {
      fail("invalidName", `nombre no válido «${name}»`);
    }
  };
  const nameTaken = (name: string) => projects.some((p) => p.name === name);
  const make = (name: string, extra: Partial<ProjectSummary> = {}): ProjectSummary => ({
    id: `mock-${++counter}`,
    name,
    path: `/home/usuario/LibreTeX/${name}`,
    displayPath: `~/LibreTeX/${name}`,
    modifiedAt: Date.now(),
    openedAt: null,
    compiler: "xelatex",
    mainFile: "main.tex",
    missing: false,
    ...extra,
  });
  const add = (project: ProjectSummary) => {
    projects = [...projects, project];
    return { ...project };
  };
  const uniqueName = (base: string, suffix?: string) => {
    const first = suffix ? `${base} (${suffix})` : base;
    if (!nameTaken(first)) return first;
    for (let n = 2; ; n++) {
      const name = suffix ? `${base} (${suffix} ${n})` : `${base} (${n})`;
      if (!nameTaken(name)) return name;
    }
  };

  return {
    listProjects: async () => projects.map((p) => ({ ...p })),
    listTemplates: async () => mockTemplates.map((t) => ({ ...t })),
    createProject: async (name, template) => {
      validName(name);
      if (nameTaken(name)) fail("alreadyExists", `ya existe: ${name}`);
      const info = template ? mockTemplates.find((t) => t.id === template) : undefined;
      if (template && !info) fail("unknownTemplate", `plantilla desconocida: ${template}`);
      return add(make(name, info ? { compiler: info.compiler, mainFile: info.mainFile } : {}));
    },
    openFolderDialog: async () => ({
      project: add(make(uniqueName("Carpeta de ejemplo"), { displayPath: "~/Documentos/ejemplo" })),
      candidates: ["main.tex", "anexo.tex"],
    }),
    importZipDialog: async () => ({
      project: add(make(uniqueName("Proyecto importado"), { compiler: "pdflatex" })),
      candidates: ["main.tex"],
    }),
    setMainFile: async (id, path) => {
      const project = find(id);
      if (!path.endsWith(".tex") || path.includes("..")) fail("invalidPath", path);
      project.mainFile = path;
      return { ...project };
    },
    openProject: async (id) => {
      const project = find(id);
      if (project.missing) fail("notFound", `no existe: ${project.path}`);
      project.openedAt = Date.now();
      return { ...project };
    },
    renameProject: async (id, name) => {
      validName(name);
      const project = find(id);
      if (project.name !== name && nameTaken(name)) fail("alreadyExists", `ya existe: ${name}`);
      project.name = name;
      project.displayPath = project.displayPath.replace(/[^/]+$/, name);
      return { ...project };
    },
    duplicateProject: async (id) => {
      const project = find(id);
      return add(make(uniqueName(project.name, "copia"), { compiler: project.compiler }));
    },
    trashProject: async (id) => {
      find(id);
      projects = projects.filter((p) => p.id !== id);
    },
    forgetProject: async (id) => {
      find(id);
      projects = projects.filter((p) => p.id !== id);
    },
    revealProject: async (id) => {
      find(id);
    },
  };
}
