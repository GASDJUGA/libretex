import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type {
  BackendError,
  Compiler,
  CompileEvent,
  CompileRequest,
  FileNode,
  OpenFolderResult,
  PdfRect,
  ProjectIndex,
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
  updateProjectMeta(id: string, changes: { compiler: Compiler }): Promise<ProjectSummary>;
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
  /** SyncTeX source → PDF: boxes produced by `line` of `file`. */
  synctexForward(id: string, file: string, line: number, column: number): Promise<PdfRect[]>;
  /** SyncTeX PDF → source: the project file and line behind a point, or null. */
  synctexInverse(id: string, page: number, x: number, y: number): Promise<SourceLocation | null>;
  /** Subscribes to compile-started/output/finished events; returns the unsubscribe function. */
  onCompileEvent(callback: (event: CompileEvent) => void): () => void;
  /** TeX tools found (cached by the backend; `refresh` detects them again). */
  texStatus(refresh: boolean): Promise<TexStatus>;
  /** `\label`s and `.bib` entries of the project, for autocompletion. */
  projectIndex(id: string): Promise<ProjectIndex>;
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
  texStatus: (refresh) => invoke("tex_status", { refresh }),
  compileProject: (id, request) => invoke("compile_project", { id, request }),
  cancelCompile: (id) => invoke("cancel_compile", { id }),
  cleanBuild: (id) => invoke("clean_build", { id }),
  openPdf: (id) => invoke("open_pdf", { id }),
  revealPdf: (id) => invoke("reveal_pdf", { id }),
  readPdf: async (id) => new Uint8Array(await invoke<ArrayBuffer>("read_pdf", { id })),
  synctexForward: (id, file, line, column) => invoke("synctex_forward", { id, file, line, column }),
  synctexInverse: (id, page, x, y) => invoke("synctex_inverse", { id, page, x, y }),
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
};

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
