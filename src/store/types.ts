export type Compiler = "pdflatex" | "xelatex" | "lualatex";

/** Mirrors `ProjectSummary` in src-tauri/src/projects/ops.rs. */
export type ProjectSummary = {
  id: string;
  name: string;
  /** Absolute path. */
  path: string;
  /** Path for display, with `~` for the home folder. */
  displayPath: string;
  /** Milliseconds since the Unix epoch of the last change on disk. */
  modifiedAt: number | null;
  /** Milliseconds since the Unix epoch of the last time it was opened in LibreTeX. */
  openedAt: number | null;
  compiler: Compiler;
  mainFile: string;
  /** The folder no longer exists on disk. */
  missing: boolean;
};

export type OpenFolderResult = {
  project: ProjectSummary;
  /** `.tex` files with `\documentclass`; when there are several the user picks one. */
  candidates: string[];
};

export type Localized = { es: string; en: string };

export type TemplateInfo = {
  id: string;
  name: Localized;
  description: Localized;
  mainFile: string;
  compiler: Compiler;
  default: boolean;
};

/** A file or folder of a project (mirrors `FileNode` in src-tauri/src/files). */
export type FileNode =
  | { kind: "file"; name: string; path: string }
  | { kind: "folder"; name: string; path: string; children: FileNode[] };

export type TextFile = {
  content: string;
  /** Milliseconds since the Unix epoch. */
  modifiedAt: number;
};

/** Labels and bibliography of a project (mirrors `ProjectIndex` in src-tauri/src/files). */
export type ProjectIndex = {
  labels: { key: string; file: string; line: number }[];
  citations: { key: string; kind: string; title: string | null; file: string }[];
};

export type TexTool = { path: string; version: string | null };

/** TeX tools found on the system (mirrors `TexStatus` in src-tauri/src/tex/detect.rs). */
export type TexStatus = {
  latexmk: TexTool | null;
  pdflatex: TexTool | null;
  xelatex: TexTool | null;
  lualatex: TexTool | null;
  synctex: TexTool | null;
  biber: TexTool | null;
  bibtex: TexTool | null;
  distribution: string | null;
};

/** Options chosen in the UI for a compilation (shell escape comes from project.json). */
export type CompileRequest = { compiler: Compiler; draft: boolean; haltOnError: boolean };

export type CompileStatus = "success" | "failed" | "cancelled";

/** Events of a compilation (mirror src-tauri/src/commands/compile.rs). */
export type CompileEvent =
  | { type: "started"; projectId: string; runId: number }
  | { type: "output"; projectId: string; runId: number; lines: string[] }
  | {
      type: "finished";
      projectId: string;
      runId: number;
      status: CompileStatus;
      durationMs: number;
      /** Contents of the engine's .log. */
      log: string;
      /** PDF relative to the project root, when this run produced or updated it. */
      pdf: string | null;
      mainFile: string;
      error: string | null;
    };

/** A project LibreTeX sent to the system trash (mirrors `TrashedProject` in Rust). */
export type TrashedProject = {
  /** Identifier of the item in the system trash. */
  trashId: string;
  name: string;
  originalPath: string;
  displayPath: string;
  /** Milliseconds since the Unix epoch. */
  trashedAt: number;
};

/** Error returned by a Tauri command (`AppError` in Rust). */
export type BackendError = {
  code: string;
  message: string;
};

/** A box in a PDF page, in PDF points from the top-left corner (SyncTeX). */
export type PdfRect = { page: number; left: number; top: number; width: number; height: number };

/** A line of a project file (path relative to the project root). */
export type SourceLocation = { file: string; line: number };

/** Package backends (5.6). */
export type BackendKind = "managed" | "official" | "pacman" | "readOnly";

export type PackageBackend = {
  kind: BackendKind;
  root: string | null;
  year: string | null;
  tlmgr: string | null;
  writable: boolean;
};

export type PackageBackends = { active: PackageBackend | null; available: PackageBackend[] };

/** Progress of the installation of LibreTeX's TeX Live (event `texlive-install`). */
export type TexliveInstallProgress =
  | { step: "download"; done: number; total: number | null }
  | { step: "extract" }
  | { step: "install"; done: number; total: number; package: string }
  | { step: "packages"; done: number; total: number; package: string }
  | { step: "line"; line: string };
