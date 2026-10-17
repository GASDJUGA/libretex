import { mockProjectFiles } from "../mocks/projectFiles";
import samplePdfUrl from "../../tests/fixtures/pdf/ejemplo.pdf?url";
import { mockCatalog } from "../mocks/packages";
import { mockProjects } from "../mocks/projects";
import { MockFiles } from "./mockFiles";
import { mockTemplates } from "../mocks/templates";
import type {
  BackendError,
  ProjectIndex,
  ProjectSummary,
  Replaced,
  TrashedProject,
} from "../store/types";
import { replaceText, searchFiles } from "./projectSearch";
import type { Backend, FilesChangedEvent } from "./tauri";
import type {
  CompileEvent,
  PackageBackends,
  TexChoice,
  TexliveInstallProgress,
} from "../store/types";

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
  /** Simulates `sudo pacman -S <pkg>` run by the user: visible after `reloadPackageStatus`. */
  pacmanInstall: (pacmanPackage: string) => void;
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
  /** The personal dictionary of the spell checker. */
  let dictionary: string[] = [];
  let counter = 0;
  const listeners = new Set<(event: FilesChangedEvent) => void>();
  const compileListeners = new Set<(event: CompileEvent) => void>();
  const emitCompile = (event: CompileEvent) => compileListeners.forEach((l) => l(event));
  let runCounter = 0;
  const running = new Map<string, ReturnType<typeof setTimeout>>();
  let managedInstalled = false;
  let texChoice: TexChoice = "auto";
  /** LibreTeX's TeX Live is the one in use (installed and not set aside by the user). */
  const managedActive = () => managedInstalled && texChoice !== "system";
  /** pacman packages installed "outside LibreTeX" since the last status reload. */
  const pacmanInstalled = new Set<string>();
  let operationCancelled = false;
  const operationListeners = new Set<(p: TexliveInstallProgress) => void>();
  // A copy per backend: operations change statuses.
  const catalog = mockCatalog.map((p) => ({ ...p, styles: [...p.styles] }));
  let catalogCtan: { savedAt: number | null; packages: number } = { savedAt: null, packages: 0 };
  let installCancelled = false;
  const installListeners = new Set<(p: TexliveInstallProgress) => void>();
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
              // Like the blank project of the Rust side: the name as the title.
              [project.mainFile]: `\\documentclass{article}\n\\title{${project.name.replace(/[_&%#$]/g, "\\$&")}}\n\\begin{document}\n\\maketitle\n\n\\end{document}\n`,
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
    spellLang: "es",
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

  // Like this developer's machine: TeX Live from pacman (read-only), until the managed
  // one is "installed"; then the user can choose between both.
  const currentBackends = (): PackageBackends => {
    const pacman = {
      kind: "pacman" as const,
      root: "/usr/bin",
      year: null,
      tlmgr: "/usr/bin/tlmgr",
      writable: false,
    };
    const managed = {
      kind: "managed" as const,
      root: "~/.local/share/libretex/texlive/2026",
      year: "2026",
      tlmgr: "~/.local/share/libretex/texlive/2026/bin/x86_64-linux/tlmgr",
      writable: true,
    };
    return managedInstalled
      ? {
          active: managedActive() ? managed : pacman,
          available: [managed, pacman],
          choice: texChoice,
        }
      : { active: pacman, available: [pacman], choice: texChoice };
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
      if (changes.spellLang && !["es", "en", "off"].includes(changes.spellLang)) {
        fail("forbidden", `idioma de ortografía «${changes.spellLang}»`);
      }
      if (changes.compiler) project.compiler = changes.compiler;
      if (changes.spellLang) project.spellLang = changes.spellLang;
      return { ...project };
    },
    personalDictionary: async () => [...dictionary],
    addToDictionary: async (word) => {
      if (!/^[\p{L}\p{N}'’.-]{1,64}$/u.test(word) || !/\p{L}/u.test(word)) {
        fail("invalidName", `no es una palabra: ${word}`);
      }
      dictionary = [...new Set([...dictionary, word])].sort();
      return [...dictionary];
    },
    removeFromDictionary: async (word) => {
      dictionary = dictionary.filter((w) => w !== word);
      return [...dictionary];
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
      const lines = source.split("\n");
      let bad = lines.findIndex((l) => l.includes("\\comandoinexistente"));
      // Or a \usepackage of a package of the catalog that is not installed (missing .sty).
      const missingSty = lines
        .map((l) => /\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/.exec(l)?.[1].trim())
        .map((name) =>
          catalog.find(
            (p) => p.status === "missing" && (p.name === name || p.styles.includes(`${name}.sty`)),
          )
            ? `${name}.sty`
            : null,
        )
        .find((sty) => sty !== null);
      if (bad < 0 && missingSty) {
        bad = lines.findIndex((l) => l.includes("\\begin{document}"));
      }
      const log =
        bad >= 0 && missingSty
          ? `This is XeTeX\n! LaTeX Error: File \`${missingSty}' not found.\n\n./${main}:${bad + 1}: Emergency stop.\n`
          : bad >= 0
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
    packageBackends: async () => currentBackends(),
    setTexDistribution: async (choice) => {
      texChoice = choice;
      return currentBackends();
    },
    // A quick simulated installation (a few steps per phase, ~40 ms apart).
    installManagedTexlive: async () => {
      if (managedInstalled) fail("alreadyExists", "ya está instalado");
      installCancelled = false;
      const steps: TexliveInstallProgress[] = [
        { step: "download", done: 2_500_000, total: 5_300_000 },
        { step: "download", done: 5_300_000, total: 5_300_000 },
        { step: "extract" },
        ...["hyphen-base", "kpathsea", "amsmath", "babel"].map(
          (pkg, i): TexliveInstallProgress => ({
            step: "install",
            done: i + 1,
            total: 4,
            package: pkg,
          }),
        ),
        { step: "line", line: "running mktexlsr ..." },
        ...["xetex", "fontspec", "latexmk"].map((pkg, i): TexliveInstallProgress => ({
          step: "packages",
          done: i + 1,
          total: 3,
          package: pkg,
        })),
      ];
      for (const step of steps) {
        await new Promise((r) => setTimeout(r, 40));
        if (installCancelled) fail("cancelled", "operación cancelada");
        installListeners.forEach((l) => l(step));
      }
      managedInstalled = true;
      return "~/.local/share/libretex/texlive/2026";
    },
    searchPackages: async (query) => {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      return (
        catalog
          .filter((p) => p.name.includes(q) || p.caption.toLowerCase().includes(q))
          .sort((a, b) => Number(b.name.startsWith(q)) - Number(a.name.startsWith(q)))
          // Like the catalog: the pacman package is suggested only with pacman's TeX Live.
          .map((p) => (managedActive() ? { ...p, pacmanPackage: null } : { ...p }))
      );
    },
    installedPackages: async (filter, limit) => {
      const f = filter.trim().toLowerCase();
      const all = catalog
        .filter((p) => p.inTexlive && p.status === "installed")
        .filter((p) => !f || p.name.includes(f) || p.caption.toLowerCase().includes(f))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => (managedActive() ? { ...p, pacmanPackage: null } : { ...p }));
      return { total: all.length, packages: all.slice(0, limit) };
    },
    packageForFile: async (file) =>
      catalog.find((p) => p.styles.includes(file.split("/").pop() ?? file)) ?? null,
    packageOperation: async (operation, name) => {
      if (!managedActive()) fail("forbidden", "el TeX Live activo es de solo lectura");
      const pkg = catalog.find((p) => p.name === name) ?? fail("notFound", name);
      for (const [i, step] of ["download", "unpack"].entries()) {
        await new Promise((r) => setTimeout(r, 30));
        if (operationCancelled) {
          operationCancelled = false;
          fail("cancelled", "operación cancelada");
        }
        operationListeners.forEach((l) =>
          l({ step: "packages", done: i + 1, total: 2, package: `${name} (${step})` }),
        );
      }
      pkg.status = operation === "remove" ? "missing" : "installed";
    },
    cancelPackageOperation: async () => {
      operationCancelled = true;
    },
    onPackageOperation: (callback) => {
      operationListeners.add(callback);
      return () => operationListeners.delete(callback);
    },
    checkPackageUpdate: async (name) => name === "physics",
    openPackageDocs: async () => "ctan" as const,
    packageCatalogInfo: async () => ({ ctan: catalogCtan, texliveSavedAt: null }),
    pacmanInstall: (pacmanPackage) => {
      pacmanInstalled.add(pacmanPackage);
    },
    reloadPackageStatus: async () => {
      for (const pkg of catalog) {
        if (pkg.pacmanPackage && pacmanInstalled.has(pkg.pacmanPackage)) {
          pkg.status = "installed";
          pkg.pacmanPackage = null;
        }
      }
      pacmanInstalled.clear();
    },
    refreshPackageCatalog: async () => {
      catalogCtan = { savedAt: Date.now(), packages: 7104 };
      return { ctan: catalogCtan, texliveSavedAt: null };
    },
    cancelManagedTexlive: async () => {
      installCancelled = true;
    },
    onTexliveInstall: (callback) => {
      installListeners.add(callback);
      return () => installListeners.delete(callback);
    },
    // SyncTeX stand-in: 30 lines per page, 20 pt apart, from 80 pt below the top.
    synctexForward: async (id, file, line) => {
      builtPdf(id);
      files(id).read(file);
      const index = Math.max(0, line - 1);
      return [
        {
          page: Math.min(3, 1 + Math.floor(index / 30)),
          left: 72,
          top: 80 + (index % 30) * 20,
          width: 450,
          height: 12,
        },
      ];
    },
    synctexInverse: async (id, page, _x, y) => {
      builtPdf(id);
      const line = (page - 1) * 30 + Math.max(0, Math.floor((y - 80) / 20)) + 1;
      return { file: find(id).mainFile, line };
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
    searchProject: async (id, query) => {
      try {
        return searchFiles(files(id).textFiles(), query);
      } catch (error) {
        return fail("invalidSearch", error instanceof Error ? error.message : String(error));
      }
    },
    replaceInProject: async (id, query, replacement, paths) => {
      const done: Replaced[] = [];
      for (const path of paths) {
        const { content } = files(id).read(path);
        let changed;
        try {
          changed = replaceText(content, query, replacement);
        } catch (error) {
          return fail("invalidSearch", error instanceof Error ? error.message : String(error));
        }
        if (changed.count === 0) continue;
        files(id).write(path, changed.text);
        done.push({ path, count: changed.count });
      }
      return done;
    },
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
