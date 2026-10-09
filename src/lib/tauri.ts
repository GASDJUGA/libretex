import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  BackendError,
  FileNode,
  OpenFolderResult,
  ProjectSummary,
  TemplateInfo,
  TextFile,
  TrashedProject,
} from "../store/types";
import { createMockBackend } from "./mockBackend";

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
