import { mockProjectFiles } from "../mocks/projectFiles";
import samplePdfUrl from "../../tests/fixtures/pdf/ejemplo.pdf?url";
import { mockProjects } from "../mocks/projects";
import { MockFiles } from "./mockFiles";
import { mockTemplates } from "../mocks/templates";
import type { BackendError, ProjectIndex, ProjectSummary, TrashedProject } from "../store/types";
import type { Backend, FilesChangedEvent } from "./tauri";
import type { CompileEvent } from "../store/types";

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

/** The sample PDF shown in the browser preview (a real 3-page XeLaTeX document). */
async function samplePdf(): Promise<Uint8Array> {
  try {
    return new Uint8Array(await (await fetch(samplePdfUrl)).arrayBuffer());
  } catch {
    // Unit tests (no server): any bytes will do, the viewer is mocked there.
    return new TextEncoder().encode("%PDF-1.7\n% LibreTeX mock\n");
  }
}

export function createMockBackend(seed: ProjectSummary[] = mockProjects): MockBackend {
  let projects = seed.map((p) => ({ ...p }));
  let trashed: (TrashedProject & { project: ProjectSummary })[] = [];
  let counter = 0;
  const listeners = new Set<(event: FilesChangedEvent) => void>();
  const compileListeners = new Set<(event: CompileEvent) => void>();
  const emitCompile = (event: CompileEvent) => compileListeners.forEach((l) => l(event));
  let runCounter = 0;
  const running = new Map<string, ReturnType<typeof setTimeout>>();
  /** Projects with a compiled PDF. */
  const pdfs = new Set<string>();
  const builtPdf = (id: string) => {
    find(id);
    if (!pdfs.has(id)) fail("notFound", "no existe: .libretex/build/main.pdf");
  };
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
    updateProjectMeta: async (id, changes) => {
      const project = find(id);
      project.compiler = changes.compiler;
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
    compileProject: async (id) => {
      const project = find(id);
      if (running.has(id)) return { runId: null };
      const runId = ++runCounter;
      const main = project.mainFile;
      const source = (() => {
        try {
          return files(id).read(main).content;
        } catch {
          return "";
        }
      })();
      // A failing document: an undefined command reported with file:line, like -file-line-error.
      const bad = source.split("\n").findIndex((l) => l.includes("\\comandoinexistente"));
      const log =
        bad >= 0
          ? `This is XeTeX\n./${main}:${bad + 1}: Undefined control sequence.\nl.${bad + 1} \\comandoinexistente\n`
          : "This is XeTeX\nOutput written on main.pdf (1 page).\n";
      setTimeout(() => {
        emitCompile({ type: "started", projectId: id, runId });
        emitCompile({
          type: "output",
          projectId: id,
          runId,
          lines: ["Rc files read:", "Latexmk: Run number 1 of rule 'xelatex'"],
        });
      }, 0);
      running.set(
        id,
        setTimeout(() => {
          running.delete(id);
          pdfs.add(id);
          emitCompile({
            type: "finished",
            projectId: id,
            runId,
            status: bad >= 0 ? "failed" : "success",
            durationMs: 1234,
            log,
            pdf: ".libretex/build/main.pdf",
            mainFile: main,
            error: null,
          });
        }, 30),
      );
      return { runId };
    },
    cancelCompile: async (id) => {
      const timer = running.get(id);
      if (!timer) return;
      clearTimeout(timer);
      running.delete(id);
      emitCompile({
        type: "finished",
        projectId: id,
        runId: runCounter,
        status: "cancelled",
        durationMs: 10,
        log: "",
        pdf: null,
        mainFile: find(id).mainFile,
        error: null,
      });
    },
    cleanBuild: async (id) => {
      find(id);
      return 3;
    },
    openPdf: async (id) => builtPdf(id),
    readPdf: async (id) => {
      builtPdf(id);
      return samplePdf();
    },
    revealPdf: async (id) => builtPdf(id),
    onCompileEvent: (callback) => {
      compileListeners.add(callback);
      return () => compileListeners.delete(callback);
    },
    texStatus: async () => {
      const tool = (path: string, version: string) => ({ path, version });
      return {
        latexmk: tool("/usr/bin/latexmk", "4.87"),
        pdflatex: tool("/usr/bin/pdflatex", "pdfTeX 3.141592653-2.6-1.40.29"),
        xelatex: tool("/usr/bin/xelatex", "XeTeX 3.141592653-2.6-0.999998"),
        lualatex: tool("/usr/bin/lualatex", "1.24.0"),
        synctex: tool("/usr/bin/synctex", "1.5"),
        biber: tool("/usr/bin/biber", "2.22"),
        bibtex: tool("/usr/bin/bibtex", "BibTeX 0.99e"),
        distribution: "TeX Live 2026/Arch Linux",
      };
    },
    projectIndex: async (id) => {
      // Same idea as src-tauri/src/files/index.rs, simplified.
      const index: ProjectIndex = { labels: [], citations: [] };
      for (const [path, content] of files(id).textFiles()) {
        if (path.endsWith(".tex")) {
          content.split("\n").forEach((line, i) => {
            for (const m of line.replace(/(^|[^\\])%.*$/, "$1").matchAll(/\\label\{([^{}]+)\}/g)) {
              index.labels.push({ key: m[1], file: path, line: i + 1 });
            }
          });
        } else if (path.endsWith(".bib")) {
          for (const m of content.matchAll(/@(\w+)\s*\{\s*([^,\s]+)\s*,([^@]*)/g)) {
            const title = /title\s*=\s*\{([^}]*)\}/i.exec(m[3])?.[1] ?? null;
            index.citations.push({ key: m[2], kind: m[1].toLowerCase(), title, file: path });
          }
        }
      }
      return index;
    },
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
