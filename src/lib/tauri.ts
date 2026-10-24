import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type {
  Backup,
  BackupPending,
  BackupProgress,
  BackupStatus,
  BackupTools,
  GithubRepo,
  Pulled,
  Identity,
  BackendError,
  Compiler,
  CompileEvent,
  CompileRequest,
  FileNode,
  OpenFolderResult,
  CatalogInfo,
  InstalledList,
  PackageBackends,
  TexChoice,
  PackageDefinition,
  PackageHit,
  OtherWindow,
  WindowRequest,
  WindowStart,
  PackageOperation,
  TexliveInstallProgress,
  PdfRect,
  ProjectIndex,
  Replaced,
  SearchQuery,
  SearchResults,
  SettingsInfo,
  EditableSettings,
  Version,
  FileChange,
  VersionFile,
  SpellLang,
  ProjectSummary,
  SourceLocation,
  TemplateInfo,
  TexStatus,
  TextFile,
  TrashedProject,
} from "../store/types";
import { createMockBackend } from "./mockBackend";

/** Payload of the `project-files-changed` event (files changed outside LibreTeX). */
export type FilesChangedEvent = {
  projectId: string;
  /** Relative paths created, modified, renamed or deleted. */
  paths: string[];
};

/** Files dragged from the system over the window. Positions are CSS pixels in the viewport. */
export type DropEvent =
  | { type: "over"; x: number; y: number }
  | { type: "drop"; x: number; y: number; paths: string[] }
  | { type: "leave" };

/** Typed access to the Rust commands (src-tauri/src/commands). */
export type Backend = {
  listProjects(): Promise<ProjectSummary[]>;
  listTemplates(): Promise<TemplateInfo[]>;
  createProject(name: string, template: string | null): Promise<ProjectSummary>;
  /** Native folder picker; `null` if cancelled. */
  openFolderDialog(title: string): Promise<OpenFolderResult | null>;
  /** Native ZIP picker; `null` if cancelled. */
  importZipDialog(title: string, filterName: string): Promise<OpenFolderResult | null>;
  setMainFile(id: string, path: string): Promise<ProjectSummary>;
  openProject(id: string): Promise<ProjectSummary>;
  renameProject(id: string, name: string): Promise<ProjectSummary>;
  /** Changes the compiler in project.json. */
  updateProjectMeta(
    id: string,
    changes: { compiler?: Compiler; spellLang?: SpellLang },
  ): Promise<ProjectSummary>;
  /** Records a version (`auto`: only if something changed, else null). */
  historySnapshot(id: string, kind: "manual" | "auto", name?: string): Promise<Version | null>;
  /** The project's versions, newest first. */
  historyList(id: string): Promise<Version[]>;
  /** What a version changed, compared with the one before it. */
  historyChanges(id: string, version: string): Promise<FileChange[]>;
  historyFile(id: string, version: string, path: string): Promise<VersionFile>;
  /** Brings back a file as it was (what is there now is kept as a version first). */
  historyRestoreFile(id: string, version: string, path: string): Promise<void>;
  /** Brings the project back to a version; returns the paths that changed. */
  historyRestore(id: string, version: string): Promise<string[]>;
  /** Where the project's backup with Git stands (no network). */
  backupStatus(id: string): Promise<BackupStatus>;
  /** Turns the backup on; `author` only when `git config` has none (kept for next time). */
  backupEnable(id: string, author?: Identity): Promise<BackupStatus>;
  /** The signed-in GitHub account (`gh`) with its private noreply address (network). */
  githubIdentity(): Promise<Identity>;
  backupPending(id: string): Promise<BackupPending>;
  /** Backs up with `message`; null if nothing changed. */
  backupCreate(id: string, message: string): Promise<Backup | null>;
  backupList(id: string): Promise<Backup[]>;
  backupChanges(id: string, version: string): Promise<FileChange[]>;
  backupFile(id: string, version: string, path: string): Promise<VersionFile>;
  /** Brings back a file from a backup (what is there now is backed up first). */
  backupRestoreFile(id: string, version: string, path: string): Promise<void>;
  /** Brings the project back to a backup; returns the paths that changed. */
  backupRestore(id: string, version: string): Promise<string[]>;
  /** Opens a fixed help page (`latex`: the LaTeX manual) in the system browser. */
  openHelpLink(topic: "latex", locale: string): Promise<void>;
  backupTools(): Promise<BackupTools>;
  /** «Subir después de cada respaldo». */
  backupSetPush(id: string, value: boolean): Promise<BackupStatus>;
  /** Connects with an existing remote (`https://` or `git@` URL). */
  backupConnectUrl(id: string, url: string): Promise<BackupStatus>;
  /** Creates a private GitHub repository with `gh` and connects with it (network). */
  backupCreateGithub(id: string, name: string): Promise<BackupStatus>;
  /** Pushes the backups (network; progress as `backup-progress`). */
  backupPush(id: string): Promise<BackupStatus>;
  /** Fetches and fast-forwards (network); never merges diverged work. */
  backupPull(id: string): Promise<Pulled>;
  /** Cancels a push/pull of a project, or the clone (id `clone`). */
  backupCancel(id: string): Promise<void>;
  /** The signed-in account's GitHub repositories (network, `gh`). */
  githubRepos(): Promise<GithubRepo[]>;
  /** Clones a repository into the projects folder and opens it as a project (network). */
  cloneProject(url: string): Promise<OpenFolderResult>;
  onBackupProgress(callback: (progress: BackupProgress) => void): () => void;
  /** «Save as» dialog for the compiled PDF; where it was saved, or null if cancelled. */
  exportPdf(id: string, title: string): Promise<string | null>;
  /** «Save as» dialog for a ZIP of the sources (importable in Overleaf). */
  exportZip(id: string, title: string): Promise<string | null>;
  getSettings(): Promise<SettingsInfo>;
  /** Saves the given settings (each one validated); returns all of them. */
  updateSettings(changes: Partial<EditableSettings>): Promise<SettingsInfo>;
  /** Native folder picker for new projects; `null` if cancelled. */
  chooseProjectsDir(title: string): Promise<SettingsInfo | null>;
  /** Installed monospace font families. */
  monospaceFonts(): Promise<string[]>;
  /** Words of the personal dictionary (`~/.config/libretex/dictionary.txt`). */
  personalDictionary(): Promise<string[]>;
  /** Adds a word; returns the dictionary. */
  addToDictionary(word: string): Promise<string[]>;
  removeFromDictionary(word: string): Promise<string[]>;
  duplicateProject(id: string): Promise<ProjectSummary>;
  trashProject(id: string): Promise<void>;
  forgetProject(id: string): Promise<void>;
  revealProject(id: string): Promise<void>;
  /** Projects LibreTeX sent to the system trash that are still there. */
  listTrashed(): Promise<TrashedProject[]>;
  restoreTrashed(trashId: string): Promise<ProjectSummary>;
  /** Permanently deletes a trashed project. */
  purgeTrashed(trashId: string): Promise<void>;

  // Files of a project (paths relative to its root, `/`-separated).
  listTree(id: string): Promise<FileNode[]>;
  readTextFile(id: string, path: string): Promise<TextFile>;
  /** Saves atomically; returns the new modification time (ms). */
  writeTextFile(id: string, path: string, content: string): Promise<number>;
  createFile(id: string, path: string): Promise<void>;
  createFolder(id: string, path: string): Promise<void>;
  /** Returns the new relative path. */
  renameEntry(id: string, path: string, newName: string): Promise<string>;
  /** Moves into `destFolder` (`""` = root); returns the new relative path. */
  moveEntry(id: string, path: string, destFolder: string): Promise<string>;
  duplicateEntry(id: string, path: string): Promise<string>;
  /** Sends a file or folder to the system trash. */
  deleteEntry(id: string, path: string): Promise<void>;
  /** Native file picker; copies the chosen files into `folder`. Returns the new paths. */
  uploadFilesDialog(id: string, folder: string, title: string): Promise<string[]>;

  /** Starts watching a project for external changes (replaces the previous watch). */
  watchProject(id: string): Promise<void>;
  unwatchProject(): Promise<void>;
  /** Subscribes to external file changes; returns the unsubscribe function. */
  onFilesChanged(callback: (event: FilesChangedEvent) => void): () => void;

  /** Subscribes to files dragged from the system; returns the unsubscribe function. */
  onFilesDropped(callback: (event: DropEvent) => void): () => void;
  /** Copies dropped files (exactly the paths of the last drop) into `folder`. */
  importDropped(id: string, folder: string, paths: string[]): Promise<string[]>;
  /** Compiles (or queues behind the running compilation: `runId` null). */
  compileProject(id: string, request: CompileRequest): Promise<{ runId: number | null }>;
  /** Stops the running compilation and drops the pending one. */
  cancelCompile(id: string): Promise<void>;
  /** Removes auxiliary files from .libretex/build (keeps the PDF). */
  cleanBuild(id: string): Promise<number>;
  /** Opens the compiled PDF with the system's viewer (`notFound` if there is none yet). */
  openPdf(id: string): Promise<void>;
  /** Shows the compiled PDF in the file manager. */
  revealPdf(id: string): Promise<void>;
  /** Bytes of the compiled PDF, for the built-in viewer (`notFound` if there is none yet). */
  readPdf(id: string): Promise<Uint8Array>;
  /** Package backends found and the active one (5.6). */
  packageBackends(): Promise<PackageBackends>;
  /** Uses LibreTeX's TeX Live or the system's (to compile and to manage packages). */
  setTexDistribution(choice: TexChoice): Promise<PackageBackends>;
  /**
   * Downloads and installs LibreTeX's TeX Live (network: only on the user's request).
   * Resolves with the installation folder when it finishes.
   */
  installManagedTexlive(): Promise<string>;
  cancelManagedTexlive(): Promise<void>;
  /** Packages matching `query` in TeX Live and CTAN, with their status. */
  searchPackages(query: string): Promise<PackageHit[]>;
  /** Installed packages of the active TeX matching `filter`, by name (first `limit`). */
  installedPackages(filter: string, limit: number): Promise<InstalledList>;
  /** The package that provides a style/class file (`physics.sty`). */
  packageForFile(file: string): Promise<PackageHit | null>;
  /**
   * Commands and environments defined by `packages` and the packages they load (read from
   * their style files; the project's own `.sty` too), for completion.
   */
  packageDefinitions(id: string, packages: string[]): Promise<PackageDefinition[]>;
  packageCatalogInfo(): Promise<CatalogInfo>;
  /** Downloads CTAN's index (network: only on the user's request). */
  refreshPackageCatalog(): Promise<CatalogInfo>;
  /** Reads again what is installed (e.g. after installing with pacman). No network. */
  reloadPackageStatus(): Promise<void>;
  /** tlmgr install/remove/update (writable backend; progress as `package-operation`). */
  packageOperation(operation: PackageOperation, name: string): Promise<void>;
  cancelPackageOperation(): Promise<void>;
  onPackageOperation(callback: (progress: TexliveInstallProgress) => void): () => void;
  /** Whether the repository has a newer version (network). */
  checkPackageUpdate(name: string): Promise<boolean>;
  /** Opens the local documentation, or the CTAN page: `"local"` or `"ctan"`. */
  openPackageDocs(name: string): Promise<"local" | "ctan">;
  /** Subscribes to the installation progress; returns the unsubscribe function. */
  onTexliveInstall(callback: (progress: TexliveInstallProgress) => void): () => void;
  /** SyncTeX source → PDF: boxes produced by `line` of `file`. */
  synctexForward(id: string, file: string, line: number, column: number): Promise<PdfRect[]>;
  /** SyncTeX PDF → source: the project file and line behind a point, or null. */
  synctexInverse(id: string, page: number, x: number, y: number): Promise<SourceLocation | null>;
  /** Subscribes to compile-started/output/finished events; returns the unsubscribe function. */
  onCompileEvent(callback: (event: CompileEvent) => void): () => void;
  /** TeX tools found (cached by the backend; `refresh` detects them again). */
  texStatus(refresh: boolean): Promise<TexStatus>;
  /** Whether projects can be moved to other windows (the app, not the browser preview). */
  readonly multiWindow: boolean;
  /** What this window starts with. */
  windowStart(): Promise<WindowStart>;
  /** The project tabs this window has now. */
  setWindowProjects(ids: string[]): Promise<void>;
  /** Before opening a project here: false if another window has it (it comes to the front). */
  claimProject(id: string): Promise<boolean>;
  /** Opens a project (its files saved) in a new window; this window then closes its tab. */
  openProjectWindow(id: string): Promise<void>;
  /** Loads a hidden window in advance, so the next tab moved to a new window shows at once. */
  prepareWindow(): Promise<void>;
  otherWindows(): Promise<OtherWindow[]>;
  /** A tab of another window was dropped here: ask that window to give it. */
  requestProject(id: string): Promise<void>;
  /** This window closed `id` (files saved): window `target` opens it. */
  giveProject(id: string, target: string): Promise<void>;
  /** Closes this window (after saving). */
  closeWindow(): Promise<void>;
  /** This window's title (the project on screen). */
  setWindowTitle(title: string): Promise<void>;
  /** Requests for some window (filter by `to`). */
  onWindowRequest(callback: (request: WindowRequest) => void): () => void;
  /** `\label`s and `.bib` entries of the project, for autocompletion. */
  projectIndex(id: string): Promise<ProjectIndex>;
  /** Every occurrence of `query` in the project's text files (saved content). */
  searchProject(id: string, query: SearchQuery): Promise<SearchResults>;
  /** Replaces the occurrences in `paths`; returns what changed in each file. */
  replaceInProject(
    id: string,
    query: SearchQuery,
    replacement: string,
    paths: string[],
  ): Promise<Replaced[]>;
  /** URL to display a project file in an <img>; `null` when not available (browser preview). */
  fileUrl(projectPath: string, path: string): string | null;
};

export const tauriBackend: Backend = {
  listProjects: () => invoke("list_projects"),
  listTemplates: () => invoke("list_templates"),
  createProject: (name, template) => invoke("create_project", { name, template }),
  openFolderDialog: (title) => invoke("open_folder_dialog", { title }),
  importZipDialog: (title, filterName) => invoke("import_zip_dialog", { title, filterName }),
  setMainFile: (id, path) => invoke("set_main_file", { id, path }),
  openProject: (id) => invoke("open_project", { id }),
  renameProject: (id, name) => invoke("rename_project", { id, name }),
  updateProjectMeta: (id, changes) => invoke("update_project_meta", { id, ...changes }),
  historySnapshot: (id, kind, name) => invoke("history_snapshot", { id, kind, name }),
  historyList: (id) => invoke("history_list", { id }),
  historyChanges: (id, version) => invoke("history_changes", { id, version }),
  historyFile: (id, version, path) => invoke("history_file", { id, version, path }),
  historyRestoreFile: (id, version, path) => invoke("history_restore_file", { id, version, path }),
  historyRestore: (id, version) => invoke("history_restore", { id, version }),
  backupStatus: (id) => invoke("backup_status", { id }),
  backupEnable: (id, author) => invoke("backup_enable", { id, author: author ?? null }),
  githubIdentity: () => invoke("github_identity"),
  backupPending: (id) => invoke("backup_pending", { id }),
  backupCreate: (id, message) => invoke("backup_create", { id, message }),
  backupList: (id) => invoke("backup_list", { id }),
  backupChanges: (id, version) => invoke("backup_changes", { id, version }),
  backupFile: (id, version, path) => invoke("backup_file", { id, version, path }),
  backupRestoreFile: (id, version, path) => invoke("backup_restore_file", { id, version, path }),
  backupRestore: (id, version) => invoke("backup_restore", { id, version }),
  openHelpLink: (topic, locale) => invoke("open_help_link", { topic, locale }),
  backupTools: () => invoke("backup_tools"),
  backupSetPush: (id, value) => invoke("backup_set_push", { id, value }),
  backupConnectUrl: (id, url) => invoke("backup_connect_url", { id, url }),
  backupCreateGithub: (id, name) => invoke("backup_create_github", { id, name }),
  backupPush: (id) => invoke("backup_push", { id }),
  backupPull: (id) => invoke("backup_pull", { id }),
  backupCancel: (id) => invoke("backup_cancel", { id }),
  githubRepos: () => invoke("github_repos"),
  cloneProject: (url) => invoke("clone_project", { url }),
  onBackupProgress: (callback) => {
    const unlisten = listen<BackupProgress>("backup-progress", (e) => callback(e.payload));
    return () => void unlisten.then((stop) => stop());
  },
  exportPdf: (id, title) => invoke("export_pdf", { id, title }),
  exportZip: (id, title) => invoke("export_zip", { id, title }),
  getSettings: () => invoke("get_settings"),
  updateSettings: (changes) => invoke("update_settings", { changes }),
  chooseProjectsDir: (title) => invoke("choose_projects_dir", { title }),
  monospaceFonts: () => invoke("monospace_fonts"),
  personalDictionary: () => invoke("personal_dictionary"),
  addToDictionary: (word) => invoke("add_to_dictionary", { word }),
  removeFromDictionary: (word) => invoke("remove_from_dictionary", { word }),
  duplicateProject: (id) => invoke("duplicate_project", { id }),
  trashProject: (id) => invoke("trash_project", { id }),
  forgetProject: (id) => invoke("forget_project", { id }),
  revealProject: (id) => invoke("reveal_project", { id }),
  listTrashed: () => invoke("list_trashed"),
  restoreTrashed: (trashId) => invoke("restore_trashed", { trashId }),
  purgeTrashed: (trashId) => invoke("purge_trashed", { trashId }),
  listTree: (id) => invoke("list_tree", { id }),
  readTextFile: (id, path) => invoke("read_text_file", { id, path }),
  writeTextFile: (id, path, content) => invoke("write_text_file", { id, path, content }),
  createFile: (id, path) => invoke("create_file", { id, path }),
  createFolder: (id, path) => invoke("create_folder", { id, path }),
  renameEntry: (id, path, newName) => invoke("rename_entry", { id, path, newName }),
  moveEntry: (id, path, destFolder) => invoke("move_entry", { id, path, destFolder }),
  duplicateEntry: (id, path) => invoke("duplicate_entry", { id, path }),
  deleteEntry: (id, path) => invoke("delete_entry", { id, path }),
  uploadFilesDialog: (id, folder, title) => invoke("upload_files_dialog", { id, folder, title }),
  watchProject: (id) => invoke("watch_project", { id }),
  unwatchProject: () => invoke("unwatch_project"),
  onFilesDropped: (callback) => {
    const unlisten = getCurrentWebview().onDragDropEvent(({ payload }) => {
      const ratio = window.devicePixelRatio || 1;
      if (payload.type === "leave") callback({ type: "leave" });
      else if (payload.type === "drop")
        callback({
          type: "drop",
          x: payload.position.x / ratio,
          y: payload.position.y / ratio,
          paths: payload.paths,
        });
      else callback({ type: "over", x: payload.position.x / ratio, y: payload.position.y / ratio });
    });
    return () => {
      unlisten.then((stop) => stop());
    };
  },
  importDropped: (id, folder, paths) => invoke("import_dropped", { id, folder, paths }),
  fileUrl: (projectPath, path) => convertFileSrc(`${projectPath}/${path}`),
  projectIndex: (id) => invoke("project_index", { id }),
  searchProject: (id, query) => invoke("search_project", { id, query }),
  replaceInProject: (id, query, replacement, paths) =>
    invoke("replace_in_project", { id, query, replacement, paths }),
  texStatus: (refresh) => invoke("tex_status", { refresh }),
  compileProject: (id, request) => invoke("compile_project", { id, request }),
  cancelCompile: (id) => invoke("cancel_compile", { id }),
  cleanBuild: (id) => invoke("clean_build", { id }),
  openPdf: (id) => invoke("open_pdf", { id }),
  revealPdf: (id) => invoke("reveal_pdf", { id }),
  readPdf: async (id) => new Uint8Array(await invoke<ArrayBuffer>("read_pdf", { id })),
  synctexForward: (id, file, line, column) => invoke("synctex_forward", { id, file, line, column }),
  synctexInverse: (id, page, x, y) => invoke("synctex_inverse", { id, page, x, y }),
  packageBackends: () => invoke("package_backends"),
  setTexDistribution: (choice) => invoke("set_tex_distribution", { choice }),
  installManagedTexlive: () => invoke("install_managed_texlive"),
  cancelManagedTexlive: () => invoke("cancel_managed_texlive"),
  searchPackages: (query) => invoke("search_packages", { query }),
  installedPackages: (filter, limit) => invoke("installed_packages", { filter, limit }),
  packageForFile: (file) => invoke("package_for_file", { file }),
  packageDefinitions: (id, packages) => invoke("package_definitions", { id, packages }),
  packageCatalogInfo: () => invoke("package_catalog_info"),
  refreshPackageCatalog: () => invoke("refresh_package_catalog"),
  reloadPackageStatus: () => invoke("reload_package_status"),
  packageOperation: (operation, name) => invoke("package_operation", { operation, name }),
  cancelPackageOperation: () => invoke("cancel_package_operation"),
  onPackageOperation: (callback) => {
    const unlisten = listen<TexliveInstallProgress>("package-operation", (e) =>
      callback(e.payload),
    );
    return () => void unlisten.then((stop) => stop());
  },
  checkPackageUpdate: (name) => invoke("check_package_update", { name }),
  openPackageDocs: (name) => invoke("open_package_docs", { name }),
  onTexliveInstall: (callback) => {
    const unlisten = listen<TexliveInstallProgress>("texlive-install", (e) => callback(e.payload));
    return () => void unlisten.then((stop) => stop());
  },
  onCompileEvent: (callback) => {
    const subscriptions = (["started", "output", "finished"] as const).map((type) =>
      listen<Omit<CompileEvent, "type">>(`compile-${type}`, (e) =>
        callback({ ...e.payload, type } as CompileEvent),
      ),
    );
    return () => {
      subscriptions.forEach((s) => s.then((stop) => stop()));
    };
  },
  onFilesChanged: (callback) => {
    const unlisten = listen<FilesChangedEvent>("project-files-changed", (e) => callback(e.payload));
    return () => {
      unlisten.then((stop) => stop());
    };
  },
  multiWindow: true,
  windowStart: () => invoke("window_start"),
  setWindowProjects: (ids) => invoke("set_window_projects", { ids }),
  claimProject: (id) => invoke("claim_project", { id }),
  openProjectWindow: (id) => invoke("open_project_window", { id }),
  prepareWindow: () => invoke("prepare_window"),
  otherWindows: () => invoke("other_windows"),
  requestProject: (id) => invoke("request_project", { id }),
  giveProject: (id, target) => invoke("give_project", { id, target }),
  closeWindow: () => invoke("close_window"),
  setWindowTitle: (title) => invoke("set_window_title", { title }),
  onWindowRequest: (callback) => {
    const subscriptions = [
      listen<{ to: string; id: string }>("window-show-project", (e) =>
        callback({ kind: "show", ...e.payload }),
      ),
      listen<{ to: string; id: string; target: string }>("window-give-project", (e) =>
        callback({ kind: "give", ...e.payload }),
      ),
      listen<{ to: string }>("window-close-requested", (e) =>
        callback({ kind: "close", ...e.payload }),
      ),
    ];
    return () => {
      subscriptions.forEach((s) => s.then((stop) => stop()));
    };
  },
};

/** This window's label (synchronous: Tauri gives it to the page); "main" outside the app. */
export function windowLabel(): string {
  return isTauri() ? getCurrentWebview().label : "main";
}

let current: Backend | null = null;

/**
 * The Tauri backend inside the app; an in-memory mock in a plain browser (the dev preview)
 * and in tests.
 */
export function getBackend(): Backend {
  current ??= isTauri() ? tauriBackend : createMockBackend();
  return current;
}

/** Replaces the backend (tests). */
export function setBackend(backend: Backend | null) {
  current = backend;
}

export function isBackendError(error: unknown): error is BackendError {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as BackendError).code === "string" &&
    typeof (error as BackendError).message === "string"
  );
}
