/**
 * Imperative wrapper around pdf.js's PDFViewer: lazy page rendering, zoom, page navigation
 * and text search. Loaded on demand (dynamic import) so pdf.js stays out of the main bundle
 * and out of the unit tests, which mock this module.
 *
 * Each loaded PDF gets its own layer (scroll container + PDFViewer). A new version of the
 * document is prepared in a hidden layer at the same zoom and position, and only shown once
 * the visible page is drawn: recompiling never jumps or flickers.
 */
import "pdfjs-dist/web/pdf_viewer.css";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  cssRect,
  pdfToSyncTex,
  restoreDestination,
  syncTexToPdf,
  whenRendered,
  type PdfLocation,
} from "../../lib/pdf/location";
import { wordAt, wordBounds, type PdfWord } from "../../lib/pdf/sourceWord";
import type { PdfRect } from "../../store/types";
import { toScaleValue, type ZoomValue } from "../../lib/pdf/zoom";

type PdfjsLib = typeof import("pdfjs-dist");
type ViewerLib = typeof import("pdfjs-dist/web/pdf_viewer.mjs");
type LoadingTask = import("pdfjs-dist").PDFDocumentLoadingTask;

/** State shown by the toolbar. */
export type PdfViewState = {
  pageNumber: number;
  pagesCount: number;
  /** Current scale (1 = 100 %), also when a fit mode is active. */
  scale: number;
  zoom: ZoomValue;
};

export type FindStatus = "idle" | "pending" | "found" | "notFound" | "wrapped";
export type FindResult = { status: FindStatus; current: number; total: number };

export type PdfControllerOptions = {
  onState: (state: PdfViewState) => void;
  onFind: (result: FindResult) => void;
  /**
   * Double click on a page: the point in SyncTeX coordinates (points from the top-left) and
   * the clicked word, to find it in the source line that SyncTeX reports.
   */
  onInverseSync: (point: { page: number; x: number; y: number; word: PdfWord | null }) => void;
};

/** How long a SyncTeX highlight stays on the page. */
const MARK_MS = 2500;

/** The parts of pdf.js's PDFPageView used here. */
type PageView = {
  div: HTMLDivElement;
  viewport: {
    viewBox: number[];
    convertToViewportPoint(x: number, y: number): number[];
    convertToPdfPoint(x: number, y: number): number[];
  };
};

/** Longest wait for the new version's visible page before showing it anyway. */
const RENDER_WAIT_MS = 1500;

let libs: Promise<{ pdfjs: PdfjsLib; viewer: ViewerLib }> | null = null;

/** pdf.js defines `globalThis.pdfjsLib`, which the viewer module reads: load them in order. */
function loadLibs() {
  libs ??= (async () => {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const viewer = await import("pdfjs-dist/web/pdf_viewer.mjs");
    return { pdfjs, viewer };
  })();
  return libs;
}

/** pdf.js runtime data bundled with the app (see vite/pdfjsAssets.ts): never the network. */
const assetUrl = (dir: string) => new URL(`pdfjs/${dir}/`, document.baseURI).href;

type Layer = {
  element: HTMLDivElement;
  viewer: InstanceType<ViewerLib["PDFViewer"]>;
  eventBus: InstanceType<ViewerLib["EventBus"]>;
  linkService: InstanceType<ViewerLib["PDFLinkService"]>;
  task: LoadingTask;
  /** Last reading position reported by pdf.js. */
  location: PdfLocation | null;
};

export class PdfController {
  /** The layer the user sees. */
  private front: Layer | null = null;
  private zoom: ZoomValue = "page-width";
  private query = "";
  /** Increases with each load: an older load that finishes late is dropped. */
  private generation = 0;
  private disposed = false;

  /** `host`: an element (positioned) that the layers fill. */
  constructor(
    private readonly host: HTMLElement,
    private readonly options: PdfControllerOptions,
  ) {}

  /** Shows `data` (a whole PDF file), keeping the current zoom and reading position. */
  async load(data: Uint8Array): Promise<void> {
    const generation = ++this.generation;
    const { pdfjs, viewer: lib } = await loadLibs();
    const task = pdfjs.getDocument({
      data,
      cMapUrl: assetUrl("cmaps"),
      cMapPacked: true,
      standardFontDataUrl: assetUrl("standard_fonts"),
      wasmUrl: assetUrl("wasm"),
      iccUrl: assetUrl("iccs"),
      enableXfa: false,
    });
    let document;
    try {
      document = await task.promise;
    } catch (error) {
      await task.destroy();
      throw error;
    }
    if (this.isStale(generation)) {
      await task.destroy();
      return;
    }

    const layer = this.createLayer(lib, task);
    const pagesInit = new Promise<void>((resolve) => layer.eventBus.on("pagesinit", resolve));
    layer.viewer.setDocument(document);
    layer.linkService.setDocument(document);
    await pagesInit;
    if (this.isStale(generation)) return this.destroyLayer(layer);

    layer.viewer.currentScaleValue = toScaleValue(this.zoom);
    const location = this.front?.location;
    const target = location
      ? restoreDestination(location, layer.viewer.pagesCount)
      : { pageNumber: 1, destArray: undefined };
    if (location) layer.viewer.scrollPageIntoView(target);
    await whenRendered(layer.eventBus, target.pageNumber, RENDER_WAIT_MS);
    if (this.isStale(generation)) return this.destroyLayer(layer);

    // Swap: show the new version, then drop the old one.
    const previous = this.front;
    this.front = layer;
    layer.element.removeAttribute("data-pending");
    if (previous) await this.destroyLayer(previous);
    this.emitState();
    if (this.query) this.find(this.query, { fresh: true });
  }

  private isStale(generation: number) {
    return this.disposed || generation !== this.generation;
  }

  private createLayer(lib: ViewerLib, task: LoadingTask): Layer {
    const element = document.createElement("div");
    element.className = "lt-pdf-layer";
    element.setAttribute("data-pending", "");
    const inner = document.createElement("div");
    inner.className = "pdfViewer";
    element.append(inner);
    this.host.append(element);

    const eventBus = new lib.EventBus();
    const linkService = new lib.PDFLinkService({ eventBus });
    // External links would open web pages inside the app: disabled until there is a safe
    // «open in the browser» path.
    linkService.externalLinkEnabled = false;
    const findController = new lib.PDFFindController({ eventBus, linkService });
    const viewer = new lib.PDFViewer({
      container: element,
      viewer: inner,
      eventBus,
      linkService,
      findController,
    });
    linkService.setViewer(viewer);
    const layer: Layer = { element, viewer, eventBus, linkService, task, location: null };

    const isFront = () => this.front === layer;
    element.addEventListener("dblclick", (event) => {
      if (isFront()) this.inverseSync(layer, event);
    });
    eventBus.on("updateviewarea", (e: { location: PdfLocation }) => {
      layer.location = {
        pageNumber: e.location.pageNumber,
        left: e.location.left,
        top: e.location.top,
      };
    });
    eventBus.on("pagechanging", () => isFront() && this.emitState());
    eventBus.on("scalechanging", () => isFront() && this.emitState());
    eventBus.on(
      "updatefindcontrolstate",
      (e: { state: number; matchesCount: { current: number; total: number } }) => {
        if (isFront()) this.options.onFind(findResult(lib, e.state, e.matchesCount));
      },
    );
    eventBus.on(
      "updatefindmatchescount",
      (e: { matchesCount: { current: number; total: number } }) => {
        if (isFront()) {
          this.options.onFind({
            status: e.matchesCount.total > 0 ? "found" : "pending",
            ...e.matchesCount,
          });
        }
      },
    );
    return layer;
  }

  /** Double click → the clicked point of the page, for SyncTeX (PDF → source). */
  private inverseSync(layer: Layer, event: MouseEvent) {
    const pageDiv = (event.target as HTMLElement).closest<HTMLElement>(".page");
    const page = Number(pageDiv?.dataset.pageNumber);
    if (!pageDiv || !page) return;
    const view = layer.viewer.getPageView(page - 1) as PageView | undefined;
    if (!view) return;
    const bounds = pageDiv.getBoundingClientRect();
    const [px, py] = view.viewport.convertToPdfPoint(
      event.clientX - bounds.left - pageDiv.clientLeft,
      event.clientY - bounds.top - pageDiv.clientTop,
    );
    const [x, y] = pdfToSyncTex(px, py, view.viewport.viewBox);
    const word = clickedWord(pageDiv, event);
    // The double click also selected the word in the text layer: not wanted here.
    window.getSelection()?.removeAllRanges();
    this.options.onInverseSync({ page, x, y, word });
  }

  /** SyncTeX source → PDF: scrolls to the first box and highlights them all for a moment. */
  showRects(rects: PdfRect[]) {
    const layer = this.front;
    const first = rects[0];
    if (!layer || !first) return;
    const firstView = layer.viewer.getPageView(first.page - 1) as PageView | undefined;
    if (!firstView) return;
    const [x, y] = syncTexToPdf(first.left, first.top, firstView.viewport.viewBox);
    layer.viewer.scrollPageIntoView({
      pageNumber: first.page,
      destArray: [null, { name: "XYZ" }, x, y, null],
      allowNegativeOffset: true,
      ignoreDestinationZoom: true,
    });
    // Leave some context above the place instead of pinning it to the top edge.
    layer.element.scrollTop = Math.max(0, layer.element.scrollTop - layer.element.clientHeight / 3);
    layer.element.scrollLeft = 0;

    for (const rect of rects) {
      const view = layer.viewer.getPageView(rect.page - 1) as PageView | undefined;
      if (!view) continue;
      const css = cssRect(rect, view.viewport.viewBox, (px, py) =>
        view.viewport.convertToViewportPoint(px, py),
      );
      const mark = document.createElement("div");
      mark.className = "lt-synctex-mark";
      Object.assign(mark.style, {
        left: `${css.left}px`,
        top: `${css.top}px`,
        width: `${Math.max(css.width, 4)}px`,
        height: `${Math.max(css.height, 4)}px`,
      });
      view.div.append(mark);
      setTimeout(() => mark.remove(), MARK_MS);
    }
  }

  private async destroyLayer(layer: Layer) {
    layer.viewer.cleanup();
    layer.viewer.setDocument(null);
    layer.linkService.setDocument(null);
    layer.element.remove();
    await layer.task.destroy();
  }

  private get viewer() {
    return this.front?.viewer ?? null;
  }

  private emitState() {
    const viewer = this.viewer;
    if (!viewer) return;
    this.options.onState({
      pageNumber: viewer.currentPageNumber,
      pagesCount: viewer.pagesCount,
      scale: viewer.currentScale,
      zoom: this.zoom,
    });
  }

  currentScale(): number {
    return this.viewer?.currentScale ?? 1;
  }

  setZoom(zoom: ZoomValue) {
    this.zoom = zoom;
    if (this.viewer?.pagesCount) this.viewer.currentScaleValue = toScaleValue(zoom);
    this.emitState();
  }

  /** Re-applies a fit mode after the panel is resized. */
  refit() {
    if (typeof this.zoom === "string" && this.viewer?.pagesCount) {
      this.viewer.currentScaleValue = this.zoom;
    }
  }

  goToPage(pageNumber: number) {
    const viewer = this.viewer;
    if (!viewer?.pagesCount) return;
    viewer.currentPageNumber = Math.min(Math.max(1, Math.round(pageNumber)), viewer.pagesCount);
  }

  /**
   * Searches `query` (case and accent insensitive). Repeating the same query moves to the
   * next match (or the previous one); `fresh` searches again from the start.
   */
  find(
    query: string,
    { previous = false, fresh = false }: { previous?: boolean; fresh?: boolean } = {},
  ) {
    if (!this.front) return;
    const again = !fresh && query === this.query;
    this.query = query;
    this.front.eventBus.dispatch("find", {
      source: null,
      type: again ? "again" : "",
      query,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: previous,
      matchDiacritics: false,
    });
  }

  /** Clears search highlights. */
  closeFind() {
    this.query = "";
    this.front?.eventBus.dispatch("findbarclose", { source: null });
  }

  async destroy() {
    this.disposed = true;
    const front = this.front;
    this.front = null;
    if (front) await this.destroyLayer(front);
  }
}

function findResult(
  lib: ViewerLib,
  state: number,
  matchesCount: { current: number; total: number },
): FindResult {
  const status: FindStatus =
    state === lib.FindState.NOT_FOUND
      ? "notFound"
      : state === lib.FindState.PENDING
        ? "pending"
        : state === lib.FindState.WRAPPED
          ? "wrapped"
          : "found";
  return { status, ...matchesCount };
}

/** Text of the text-layer spans next to `node` on the same PDF line (for context). */
function siblingText(node: Node, direction: "previous" | "next"): string {
  const span = node.parentElement;
  const sibling =
    direction === "previous" ? span?.previousElementSibling : span?.nextElementSibling;
  return sibling?.tagName === "SPAN" ? (sibling.textContent ?? "") : "";
}

/**
 * The word under a double click in pdf.js's text layer: the one the double click selected,
 * or else the word at the pointer, with the text around it.
 */
function clickedWord(pageDiv: HTMLElement, event: MouseEvent): PdfWord | null {
  let node: Node | null = null;
  let offset = 0;
  let selected = "";
  const selection = window.getSelection();
  if (selection?.rangeCount && pageDiv.contains(selection.anchorNode)) {
    const range = selection.getRangeAt(0);
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      node = range.startContainer;
      offset = range.startOffset;
      selected = range.toString();
    }
  }
  if (!node) {
    const caret = document.caretPositionFromPoint?.(event.clientX, event.clientY);
    if (
      caret &&
      caret.offsetNode.nodeType === Node.TEXT_NODE &&
      pageDiv.contains(caret.offsetNode)
    ) {
      node = caret.offsetNode;
      const text = node.textContent ?? "";
      const { start, end } = wordBounds(text, caret.offset);
      offset = start;
      selected = text.slice(start, end);
    }
  }
  if (!node) return null;
  const word = wordAt(node.textContent ?? "", offset, selected);
  return (
    word && {
      ...word,
      before: `${siblingText(node, "previous")} ${word.before}`,
      after: `${word.after} ${siblingText(node, "next")}`,
    }
  );
}
