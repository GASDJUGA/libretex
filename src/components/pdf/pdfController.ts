/**
 * Imperative wrapper around pdf.js's PDFViewer: lazy page rendering, zoom, page navigation
 * and text search. Loaded on demand (dynamic import) so pdf.js stays out of the main bundle
 * and out of the unit tests, which mock this module.
 */
import "pdfjs-dist/web/pdf_viewer.css";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
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

/** Where the reader is: first visible page and the point at its top-left, in PDF units. */
export type PdfLocation = { pageNumber: number; left: number; top: number; zoom: ZoomValue };

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

export type PdfControllerOptions = {
  onState: (state: PdfViewState) => void;
  onFind: (result: FindResult) => void;
};

type Parts = {
  viewer: InstanceType<ViewerLib["PDFViewer"]>;
  eventBus: InstanceType<ViewerLib["EventBus"]>;
  linkService: InstanceType<ViewerLib["PDFLinkService"]>;
};

export class PdfController {
  private parts: Parts | null = null;
  /** Loading task of the shown document (destroying it frees the document). */
  private task: LoadingTask | null = null;
  private zoom: ZoomValue = "page-width";
  private query = "";
  private disposed = false;

  constructor(
    private readonly container: HTMLDivElement,
    private readonly options: PdfControllerOptions,
  ) {}

  /** Shows `data` (a whole PDF file). */
  async load(data: Uint8Array): Promise<void> {
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
    if (this.disposed) {
      await task.destroy();
      return;
    }
    this.parts ??= this.createViewer(lib);
    const previous = this.task;
    this.task = task;
    this.parts.viewer.setDocument(document);
    this.parts.linkService.setDocument(document);
    await previous?.destroy();
  }

  private get viewer() {
    return this.parts?.viewer ?? null;
  }

  private createViewer(lib: ViewerLib): Parts {
    const eventBus = new lib.EventBus();
    const linkService = new lib.PDFLinkService({ eventBus });
    // External links would open web pages inside the app: disabled until there is a safe
    // «open in the browser» path.
    linkService.externalLinkEnabled = false;
    const findController = new lib.PDFFindController({ eventBus, linkService });
    const viewer = new lib.PDFViewer({
      container: this.container,
      eventBus,
      linkService,
      findController,
      removePageBorders: false,
    });
    linkService.setViewer(viewer);

    eventBus.on("pagesinit", () => {
      viewer.currentScaleValue = toScaleValue(this.zoom);
      this.emitState();
    });
    eventBus.on("pagechanging", () => this.emitState());
    eventBus.on("scalechanging", () => this.emitState());
    eventBus.on(
      "updatefindcontrolstate",
      (e: { state: number; matchesCount: { current: number; total: number } }) =>
        this.options.onFind(findResult(lib, e.state, e.matchesCount)),
    );
    eventBus.on(
      "updatefindmatchescount",
      (e: { matchesCount: { current: number; total: number } }) =>
        this.options.onFind({
          status: e.matchesCount.total > 0 ? "found" : "pending",
          ...e.matchesCount,
        }),
    );
    return { viewer, eventBus, linkService };
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

  /** Searches `query` (case and accent insensitive); `again` moves to the next/previous match. */
  find(query: string, { previous = false }: { previous?: boolean } = {}) {
    if (!this.parts) return;
    const again = query === this.query;
    this.query = query;
    this.parts.eventBus.dispatch("find", {
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
    this.parts?.eventBus.dispatch("findbarclose", { source: null });
  }

  async destroy() {
    this.disposed = true;
    this.parts?.viewer.cleanup();
    this.parts?.viewer.setDocument(null);
    this.parts = null;
    await this.task?.destroy();
    this.task = null;
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
