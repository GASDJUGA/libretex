/**
 * The PDF viewer of each open project, kept while another tab is on screen (pedido del
 * usuario: al cambiar de pestaña el PDF se volvía a leer y dibujar). Coming back puts the
 * same viewer, already drawn, back on the page; it is only loaded again if a compilation
 * produced a new PDF meanwhile. Each one holds its drawn pages in memory: the most recently
 * used are kept within a share of the machine's memory (pedido del usuario: más pestañas
 * abiertas en el fondo en un equipo con más memoria); the others are read again on coming
 * back, at the same place.
 */
import { getBackend } from "../../lib/tauri";
import type { PdfController, PdfControllerOptions, PdfViewState } from "./pdfController";

/** Share of the machine's memory for the PDFs of the tabs in the background. */
export const MEMORY_SHARE = 0.05;
/** The budget when the machine's memory is unknown. */
export const DEFAULT_PDF_BUDGET = 512 * 1024 * 1024;

let budget = DEFAULT_PDF_BUDGET;
let budgetAsked = false;

/** The budget from the machine's memory (asked once, when the first viewer is created). */
function askBudget() {
  if (budgetAsked) return;
  budgetAsked = true;
  getBackend()
    .totalMemory()
    .then((total) => {
      if (total) budget = total * MEMORY_SHARE;
    })
    .catch(() => {});
}

/** The memory the PDFs in the background may hold, in bytes. */
export const pdfBudget = () => budget;

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
  /** On screen (never dropped to make room). */
  attached: boolean;
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
  askBudget();
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
    attached: false,
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
  entry.attached = true;
  entry.instance?.reattach();
}

/**
 * The pane stops showing `entry` (another tab, or the project view closes): the viewer keeps
 * its drawn pages. Then, once the next tab is on screen, the least recently used ones that
 * do not fit in the budget are dropped.
 */
export function detachPdf(entry: PdfEntry) {
  entry.instance?.detach();
  entry.handlers = NO_HANDLERS;
  entry.attached = false;
  entry.element.remove();
  setTimeout(fitInBudget);
}

/**
 * Drops the least recently used viewers in the background beyond the budget. The one left
 * last is always kept (going back and forth between two tabs).
 */
export function fitInBudget() {
  const background = [...entries.values()]
    .filter((e) => !e.attached)
    .sort((a, b) => b.usedAt - a.usedAt);
  let used = 0;
  background.forEach((entry, i) => {
    used += entry.instance?.memoryBytes() ?? 0;
    if (i > 0 && used > budget) dropPdf(entry.projectId);
  });
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
export function resetPdfPool(bytes = DEFAULT_PDF_BUDGET) {
  for (const id of [...entries.keys()]) dropPdf(id);
  budget = bytes;
  budgetAsked = bytes !== DEFAULT_PDF_BUDGET;
}
