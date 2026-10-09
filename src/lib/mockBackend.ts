import { mockProjectFiles } from "../mocks/projectFiles";
import { mockProjects } from "../mocks/projects";
import { MockFiles } from "./mockFiles";
import { mockTemplates } from "../mocks/templates";
import type { BackendError, ProjectSummary, TrashedProject } from "../store/types";
import type { Backend, FilesChangedEvent } from "./tauri";

const fail = (code: string, message: string): never => {
  throw { code, message } satisfies BackendError;
};

/**
 * In-memory backend with the same behaviour as the Rust commands, for the browser preview
 * and tests. Nothing touches the disk.
 */
/** The mock backend, plus a way to simulate external file changes in tests. */
export type MockBackend = Backend & {
  /** Edits a file "outside LibreTeX" (`null` deletes it) and notifies the watchers. */
  externalChange: (projectId: string, path: string, content: string | null) => void;
};

export function createMockBackend(seed: ProjectSummary[] = mockProjects): MockBackend {
  let projects = seed.map((p) => ({ ...p }));
  let trashed: (TrashedProject & { project: ProjectSummary })[] = [];
  let counter = 0;
  const listeners = new Set<(event: FilesChangedEvent) => void>();
  const fileSystems = new Map<string, MockFiles>();
  /** Each project gets its own in-memory files: the sample ones, or a minimal main.tex. */
  const files = (id: string) => {
    const project = find(id);
    let fs = fileSystems.get(project.id);
    if (!fs) {
      fs = new MockFiles(
        seed.some((p) => p.id === project.id)
          ? mockProjectFiles()
          : {
              [project.mainFile]:
                "\\documentclass{article}\n\\begin{document}\n\n\\end{document}\n",
            },
      );
      fileSystems.set(project.id, fs);
    }
    return fs;
  };

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
      const project = find(id);
      projects = projects.filter((p) => p.id !== id);
      if (!project.missing) {
        trashed = [
          {
            trashId: `trash-${++counter}`,
            name: project.name,
            originalPath: project.path,
            displayPath: project.displayPath,
            trashedAt: Date.now(),
            project,
          },
          ...trashed,
        ];
      }
    },
    forgetProject: async (id) => {
      find(id);
      projects = projects.filter((p) => p.id !== id);
    },
    revealProject: async (id) => {
      find(id);
    },
    listTrashed: async () =>
      trashed.map(({ trashId, name, originalPath, displayPath, trashedAt }) => ({
        trashId,
        name,
        originalPath,
        displayPath,
        trashedAt,
      })),
    restoreTrashed: async (trashId) => {
      const item = trashed.find((t) => t.trashId === trashId) ?? fail("unknownProject", trashId);
      if (nameTaken(item.name)) fail("alreadyExists", `ya existe: ${item.originalPath}`);
      trashed = trashed.filter((t) => t.trashId !== trashId);
      return add({ ...item.project });
    },
    watchProject: async (id) => {
      find(id);
    },
    unwatchProject: async () => {},
    onFilesChanged: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    externalChange: (projectId, path, content) => {
      const fs = files(projectId);
      if (content === null) fs.delete(path);
      else fs.write(path, content);
      listeners.forEach((l) => l({ projectId, paths: [path] }));
    },
    onFilesDropped: () => () => {},
    importDropped: async (id, folder, paths) =>
      files(id).import(
        folder,
        paths.map((p) => p.slice(p.lastIndexOf("/") + 1)),
      ),
    fileUrl: () => null,
    listTree: async (id) => files(id).tree(),
    readTextFile: async (id, path) => files(id).read(path),
    writeTextFile: async (id, path, content) => files(id).write(path, content),
    createFile: async (id, path) => files(id).createFile(path),
    createFolder: async (id, path) => files(id).createFolder(path),
    renameEntry: async (id, path, newName) => files(id).rename(path, newName),
    moveEntry: async (id, path, destFolder) => files(id).move(path, destFolder),
    duplicateEntry: async (id, path) => files(id).duplicate(path),
    deleteEntry: async (id, path) => files(id).delete(path),
    uploadFilesDialog: async (id, folder) => files(id).import(folder, ["figura.png", "datos.csv"]),
    purgeTrashed: async (trashId) => {
      if (!trashed.some((t) => t.trashId === trashId)) fail("unknownProject", trashId);
      trashed = trashed.filter((t) => t.trashId !== trashId);
    },
  };
}
