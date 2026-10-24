/**
 * The PDF viewer of each open project, kept while another tab is on screen (pedido del
 * usuario: al cambiar de pestaña el PDF se volvía a leer y dibujar). Coming back puts the
 * same viewer, already drawn, back on the page; it is only loaded again if a compilation
 * produced a new PDF meanwhile. The most recently used are kept (each one holds its drawn
 * pages in memory).
 */
import type { PdfController, PdfControllerOptions, PdfViewState } from "./pdfController";

/** Viewers kept besides the one on screen. */
export const MAX_KEPT_PDFS = 4;

export type PdfStatus = "loading" | "empty" | "ready" | "error";

/** What the pane on screen wants to hear from its viewer. */
export type PdfHandlers = Required<PdfControllerOptions>;

export type PdfEntry = {
  projectId: string;
  /** The viewer's element: moved in and out of the pane. */
  element: HTMLDivElement;
  controller: Promise<PdfController>;
  /** The controller once created (to save its scroll synchronously when leaving). */
  instance: PdfController | null;
  /** The compilation whose PDF is loaded (0: the one on disk when the project opened). */
  loadedRun: number | null;
  status: PdfStatus;
  view: PdfViewState | null;
  handlers: PdfHandlers;
  usedAt: number;
};

const NO_HANDLERS: PdfHandlers = {
  onState: () => {},
  onFind: () => {},
  onInverseSync: () => {},
  onPlace: () => {},
};

const entries = new Map<string, PdfEntry>();
let clock = 0;

/** The viewer of `projectId`, created the first time (pdf.js is loaded on demand). */
export function pdfEntry(projectId: string): PdfEntry {
  let entry = entries.get(projectId);
  if (entry) return entry;
  const element = document.createElement("div");
  element.dataset.testid = "pdf-viewer";
  element.className = "lt-pdf-viewer absolute inset-0";
  const created: PdfEntry = {
    projectId,
    element,
    controller: null as unknown as Promise<PdfController>,
    instance: null,
    loadedRun: null,
    status: "loading",
    view: null,
    handlers: NO_HANDLERS,
    usedAt: ++clock,
  };
  // The pane on screen changes; the controller calls whichever is there now.
  created.controller = import("./pdfController").then(({ PdfController }) => {
    const controller = new PdfController(element, {
      onState: (state) => {
        created.view = state;
        created.handlers.onState(state);
      },
      onFind: (result) => created.handlers.onFind(result),
      onInverseSync: (point) => created.handlers.onInverseSync(point),
      onPlace: (place) => created.handlers.onPlace(place),
    });
    created.instance = controller;
    return controller;
  });
  entry = created;
  entries.set(projectId, entry);
  return entry;
}

/** What `entry` shows now: the PDF of compilation `run` (or why there is none). */
export function setPdfLoaded(entry: PdfEntry, run: number, status: PdfStatus) {
  entry.loadedRun = run;
  entry.status = status;
}

/** Classes of the viewer element (dark mode, hidden until ready). */
export function setPdfClasses(entry: PdfEntry, classes: Record<string, boolean>) {
  for (const [name, on] of Object.entries(classes)) entry.element.classList.toggle(name, on);
}

/** The pane shows `entry`: it gets the viewer's events. */
export function attachPdf(entry: PdfEntry, handlers: PdfHandlers) {
  entry.handlers = handlers;
  entry.usedAt = ++clock;
  entry.instance?.reattach();
}

/**
 * The pane stops showing `entry` (another tab, or the project view closes): the viewer keeps
 * its drawn pages; the least recently used beyond the limit are dropped.
 */
export function detachPdf(entry: PdfEntry) {
  entry.instance?.detach();
  entry.handlers = NO_HANDLERS;
  entry.element.remove();
  const kept = [...entries.values()].sort((a, b) => b.usedAt - a.usedAt);
  for (const old of kept.slice(MAX_KEPT_PDFS)) dropPdf(old.projectId);
}

/** Forgets a project's viewer (its tab was closed). */
export function dropPdf(projectId: string) {
  const entry = entries.get(projectId);
  if (!entry) return;
  entries.delete(projectId);
  entry.element.remove();
  void entry.controller.then((c) => c.destroy());
}

/** For tests: drop every viewer. */
export function resetPdfPool() {
  for (const id of [...entries.keys()]) dropPdf(id);
}
