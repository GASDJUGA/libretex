/**
 * Where the user left each project (pedido del usuario): open tabs, the cursor and scroll of
 * each file, the PDF's page and zoom, and the panels. Kept in localStorage per project (like
 * the panel sizes) and written shortly after each change: closing the window gives no
 * reliable last chance to save.
 */
import { remap } from "./paths";
import type { PdfLocation } from "./pdf/location";
import type { ZoomValue } from "./pdf/zoom";

/** Place in a file: cursor (1-based line, 0-based column) and the first visible line. */
export type FilePosition = { line: number; column: number; topLine: number };

export type ProjectSession = {
  openFiles: string[];
  activeFile: string | null;
  layoutMode?: "split" | "editor" | "pdf" | "detached";
  sidePanel?: "files" | "search" | "packages" | "logs";
  sidePanelOpen?: boolean;
  /** By file path, the most recently used last. */
  files: Record<string, FilePosition>;
  pdf?: { location: PdfLocation; zoom: ZoomValue };
};

/** Files whose position is kept (the least recently used are forgotten). */
export const MAX_FILES = 100;
/** Pause after the last change before writing. */
export const SAVE_DELAY_MS = 400;

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

const key = (projectId: string) => `libretex:${projectId}:session`;

let storage: Storage | null = typeof window === "undefined" ? null : window.localStorage;
/** Sessions read or changed in this run, by project. */
const sessions = new Map<string, ProjectSession>();
const dirty = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;

/** For tests: another storage, and forget what was read. */
export function resetSessions(next: Storage | null = storage) {
  clearTimeout(timer);
  timer = undefined;
  storage = next;
  sessions.clear();
  dirty.clear();
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isCount = (value: unknown, min: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min;
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function position(value: unknown): FilePosition | null {
  if (!isObject(value)) return null;
  const { line, column, topLine } = value;
  return isCount(line, 1) && isCount(column, 0) && isCount(topLine, 1)
    ? { line, column, topLine }
    : null;
}

function pdfState(value: unknown): ProjectSession["pdf"] | undefined {
  if (!isObject(value) || !isObject(value.location)) return undefined;
  const { pageNumber, left, top } = value.location;
  const zoom = value.zoom;
  const zoomOk =
    zoom === "page-width" || zoom === "page-fit" || (isNumber(zoom) && zoom > 0 && zoom <= 10);
  if (!isCount(pageNumber, 1) || !isNumber(left) || !isNumber(top) || !zoomOk) return undefined;
  return { location: { pageNumber, left, top }, zoom: zoom as ZoomValue };
}

const LAYOUTS = ["split", "editor", "pdf", "detached"];
const PANELS = ["files", "search", "packages", "logs"];

/** A stored session, keeping only well-formed values (it may come from an older version). */
export function parseSession(text: string | null): ProjectSession | null {
  if (!text) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(data)) return null;
  const openFiles = Array.isArray(data.openFiles)
    ? [...new Set(data.openFiles.filter((p): p is string => typeof p === "string"))]
    : [];
  const activeFile =
    typeof data.activeFile === "string" && openFiles.includes(data.activeFile)
      ? data.activeFile
      : (openFiles[0] ?? null);
  const files: Record<string, FilePosition> = {};
  if (isObject(data.files)) {
    for (const [path, value] of Object.entries(data.files)) {
      const p = position(value);
      if (p) files[path] = p;
    }
  }
  return {
    openFiles,
    activeFile,
    layoutMode: LAYOUTS.includes(data.layoutMode as string)
      ? (data.layoutMode as ProjectSession["layoutMode"])
      : undefined,
    sidePanel: PANELS.includes(data.sidePanel as string)
      ? (data.sidePanel as ProjectSession["sidePanel"])
      : undefined,
    sidePanelOpen: typeof data.sidePanelOpen === "boolean" ? data.sidePanelOpen : undefined,
    files,
    pdf: pdfState(data.pdf),
  };
}

function read(projectId: string): ProjectSession {
  let session = sessions.get(projectId);
  if (!session) {
    let text: string | null = null;
    try {
      text = storage?.getItem(key(projectId)) ?? null;
    } catch {
      // Storage unavailable: the session only lasts this run.
    }
    session = parseSession(text) ?? { openFiles: [], activeFile: null, files: {} };
    sessions.set(projectId, session);
  }
  return session;
}

/** The session saved for `projectId`, or null if there is none. */
export function loadSession(projectId: string): ProjectSession | null {
  const session = read(projectId);
  const empty =
    session.openFiles.length === 0 && !session.pdf && Object.keys(session.files).length === 0;
  return empty ? null : structuredClone(session);
}

/** Writes every changed session now. */
export function flushSessions() {
  clearTimeout(timer);
  timer = undefined;
  for (const projectId of dirty) {
    const session = sessions.get(projectId);
    try {
      if (session) storage?.setItem(key(projectId), JSON.stringify(session));
    } catch {
      // Full or unavailable storage: nothing else to do.
    }
  }
  dirty.clear();
}

function change(projectId: string, update: (session: ProjectSession) => void) {
  update(read(projectId));
  dirty.add(projectId);
  clearTimeout(timer);
  timer = setTimeout(flushSessions, SAVE_DELAY_MS);
}

export function rememberView(
  projectId: string,
  view: Pick<
    ProjectSession,
    "openFiles" | "activeFile" | "layoutMode" | "sidePanel" | "sidePanelOpen"
  >,
) {
  change(projectId, (session) => Object.assign(session, view));
}

export function rememberFile(projectId: string, path: string, at: FilePosition) {
  change(projectId, (session) => {
    // Most recently used last, so the oldest are the first ones dropped.
    delete session.files[path];
    session.files[path] = at;
    const paths = Object.keys(session.files);
    for (const old of paths.slice(0, Math.max(0, paths.length - MAX_FILES))) {
      delete session.files[old];
    }
  });
}

export function rememberPdf(projectId: string, pdf: NonNullable<ProjectSession["pdf"]>) {
  change(projectId, (session) => {
    session.pdf = pdf;
  });
}

/** Where `path` was left, if known. */
export function filePosition(projectId: string, path: string): FilePosition | null {
  return read(projectId).files[path] ?? null;
}

/** The file was renamed or moved (`from` may be a folder). */
export function renameInSession(projectId: string, from: string, to: string) {
  const session = read(projectId);
  if (!Object.keys(session.files).some((p) => remap(p, from, to) !== p)) return;
  change(projectId, (s) => {
    s.files = Object.fromEntries(
      Object.entries(s.files).map(([p, at]) => [remap(p, from, to), at]),
    );
  });
}

/**
 * The tabs to reopen: the saved ones that still exist (in their order), or the main file.
 */
export function restoredTabs(
  session: ProjectSession | null,
  exists: (path: string) => boolean,
  mainFile: string,
): { openFiles: string[]; activeFile: string } {
  const openFiles = (session?.openFiles ?? []).filter(exists);
  if (openFiles.length === 0) return { openFiles: [mainFile], activeFile: mainFile };
  const active = session?.activeFile;
  return { openFiles, activeFile: active && openFiles.includes(active) ? active : openFiles[0] };
}

if (typeof window !== "undefined") {
  // Best effort when the window goes away (not always delivered).
  window.addEventListener("pagehide", flushSessions);
  window.addEventListener("beforeunload", flushSessions);
}
