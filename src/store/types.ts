export type Compiler = "pdflatex" | "xelatex" | "lualatex";

/** Mirrors `ProjectSummary` in src-tauri/src/projects/ops.rs. */
export type SpellLang = "es" | "en" | "off";

export type EditorTheme = "light" | "dark";
export type Keymap = "default" | "vim" | "emacs";
export type IndentMode = "environments" | "full" | "none";

/** `~/.config/libretex/settings.json` (5.8). */
export type Settings = {
  locale: "es" | "en";
  /** Empty: the default monospace fonts. */
  editorFontFamily: string;
  editorFontSize: number;
  editorTheme: EditorTheme;
  keymap: Keymap;
  indentMode: IndentMode;
  liveCheck: boolean;
  mathPreview: boolean;
  mathPreviewHover: boolean;
  pdfDarkMode: boolean;
  /** Compiler of new blank projects. */
  defaultCompiler: Compiler;
  /** Spelling language of new projects. */
  defaultSpellLang: SpellLang;
  /** Minutes between automatic versions of the history (0: off). */
  historyMinutes: number;
  /** Author of the Git backups when `git config` has none (empty: not set). */
  gitName: string;
  gitEmail: string;
  projectsDir: string | null;
  texDistribution: TexChoice;
};

/** Settings the webview can change directly (the rest have their own commands). */
export type EditableSettings = Omit<Settings, "projectsDir" | "texDistribution">;

export type SettingsInfo = {
  settings: Settings;
  /** Where new projects go now (with `~`). */
  projectsDir: string;
};

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
  /** Spelling language of the project (`off`: no checking). */
  spellLang: SpellLang;
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

/** What to look for in the whole project. */
export type SearchQuery = {
  text: string;
  /** `text` is a regular expression (Rust syntax in the app). */
  regex: boolean;
  caseSensitive: boolean;
  /** Not preceded or followed by a letter, digit or `_` (also `\frac`). */
  wholeWord: boolean;
};

/** An occurrence: 1-based lines, columns in UTF-16 units (like the editor). */
export type SearchMatch = {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  /** The line around it: text before, the match (to the end of the line) and after. */
  before: string;
  text: string;
  after: string;
};

export type SearchResults = {
  files: { path: string; matches: SearchMatch[] }[];
  /** More matches than listed. */
  truncated: boolean;
};

export type Replaced = { path: string; count: number };

export type VersionKind = "manual" | "auto" | "compile";

/** How a file changed in a version, compared with the one before. */
export type FileChange = { path: string; kind: "added" | "modified" | "deleted" };

/** A file as it was in a version (`content` null: it did not exist, or it is binary). */
export type VersionFile = { content: string | null; binary: boolean };

/** A version of the project's history (5.7). */
export type Version = {
  id: string;
  kind: VersionKind;
  /** The user's name for manual versions; empty for automatic ones. */
  name: string;
  /** Milliseconds since the epoch. */
  time: number;
};

/** Author of the Git backups. */
export type Identity = { name: string; email: string };

/** Where a project's backup with Git stands (mirrors `BackupStatus` in src-tauri/src/backup). */
export type BackupStatus = {
  /** The project has its own repository (`.git`). */
  enabled: boolean;
  /** Not enabled, but inside another repository (turning it on makes a separate one). */
  insideOtherRepo: boolean;
  branch: string | null;
  identity: Identity | null;
  /** `git`: from `git config`; `libretex`: the one LibreTeX asked for. */
  identitySource: "git" | "libretex" | null;
  /** URL of `origin`. */
  remote: string | null;
  /** There is a remote branch to compare with. */
  tracking: boolean;
  /** Backups not pushed / remote commits not brought (as last fetched). */
  ahead: number;
  behind: number;
  /** Files changed since the last backup. */
  pending: number;
  pushAfterBackup: boolean;
};

/** `git` and `gh` installed (the backup needs `git` to push and pull; `gh` to create repos). */
export type BackupTools = { git: boolean; gh: boolean };

/** A repository of the signed-in GitHub account (`gh repo list`). */
export type GithubRepo = {
  name: string;
  nameWithOwner: string;
  url: string;
  description: string | null;
  isPrivate: boolean;
  /** ISO date of the last change. */
  updatedAt: string;
  /** The LibreTeX project already backed up there, if any. */
  projectId: string | null;
};

/** What «Traer cambios» brought. */
export type Pulled = { commits: number; changed: string[] };

/** Progress of a push, pull or repository creation (event `backup-progress`). */
export type BackupProgress = {
  projectId: string;
  operation: "push" | "pull" | "create" | "clone";
  /** git's name for the step («Writing objects»…). */
  phase: string;
  percent: number | null;
};

/** Changes since the last backup. */
export type BackupPending = { changes: FileChange[]; tooBig: string[] };

/** A backup (a commit of the project's repository). */
export type Backup = {
  id: string;
  message: string;
  author: string;
  time: number;
  /** In the remote branch already (null: there is none). */
  pushed: boolean | null;
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

/** Which TeX LibreTeX uses: its own TeX Live, the system's, or automatic (its own if installed). */
export type TexChoice = "auto" | "libretex" | "system";

export type PackageBackends = {
  /** The TeX in use (to compile and to manage packages). */
  active: PackageBackend | null;
  available: PackageBackend[];
  choice: TexChoice;
};

/** Progress of the installation of LibreTeX's TeX Live (event `texlive-install`). */
export type TexliveInstallProgress =
  | { step: "download"; done: number; total: number | null }
  | { step: "extract" }
  | { step: "install"; done: number; total: number; package: string }
  | { step: "packages"; done: number; total: number; package: string }
  | { step: "line"; line: string };

/** A package of the catalog (TeX Live + CTAN) with its status for the active backend. */
/** A command (`hslash`) or environment (`tcolorbox`) a package defines. */
export type PackageDefinition = {
  /** Without the backslash. */
  name: string;
  kind: "command" | "environment";
  /** Mandatory arguments in braces. */
  args: number;
  math: boolean;
  package: string;
};

export type PackageHit = {
  name: string;
  caption: string;
  version: string | null;
  license: string | null;
  inTexlive: boolean;
  inCtan: boolean;
  status: "installed" | "missing" | "unknown";
  /** pacman's TeX Live: the system package that ships it. */
  pacmanPackage: string | null;
  styles: string[];
};

export type CatalogInfo = {
  ctan: { savedAt: number | null; packages: number };
  texliveSavedAt: number | null;
};

/** A page of the installed packages and how many match in all. */
export type InstalledList = { total: number; packages: PackageHit[] };

export type PackageOperation = "install" | "remove" | "update";
