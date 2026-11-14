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
import legacyWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import {
  cssRect,
  pdfToSyncTex,
  restoreDestination,
  syncTexToPdf,
  whenAllRendered,
  type PdfLocation,
} from "../../lib/pdf/location";
import { installAbortSignalAny } from "../../lib/pdf/abortSignalAny";
import { installStreamIterator } from "../../lib/pdf/streamIterator";
import { IS_MAC, IS_WINDOWS } from "../../lib/platform";
import { wordAt, wordBounds, type PdfWord } from "../../lib/pdf/sourceWord";
import type { PdfRect } from "../../store/types";
import {
  axisTranslate,
  clampZoom,
  cssTransform,
  fitScale,
  IDENTITY,
  toScaleValue,
  underPoint,
  visibleArea,
  wheelZoomFactor,
  type ScrollArea,
  type ZoomAxis,
  type ZoomTransform,
  type ZoomValue,
} from "../../lib/pdf/zoom";

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
  /** The reading place changed (scroll, page, zoom): to come back to it in the next session. */
  onPlace?: (place: PdfPlace) => void;
};

/** Where the reader is and at which zoom. */
export type PdfPlace = { location: PdfLocation; zoom: ZoomValue };

/**
 * Pause after the last zoom step before preparing the new zoom: until then the drawn pages
 * are only scaled by the compositor, so fast Ctrl+wheel zooming draws once at the end.
 */
const ZOOM_SETTLE_MS = 200;

/** A point on the screen (client coordinates). */
export type ScreenPoint = { x: number; y: number };

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

/** What pdf.js's viewer uses to choose the pages to draw (internal, stable in pdf.js 4–6). */
type VisiblePagesSource = {
  container: HTMLElement | ScrollArea;
  _getVisiblePages(): { views: { view: { renderingState: number } }[] };
};

/** Longest wait for the new version's visible pages before showing it anyway. */
const RENDER_WAIT_MS = 1500;

let libs: Promise<{
  pdfjs: PdfjsLib;
  viewer: ViewerLib;
  worker: InstanceType<PdfjsLib["PDFWorker"]>;
}> | null = null;

/**
 * Whether pdf.js's modern build can run here. It uses JavaScript that WebKit added after
 * Safari 18.4 (macOS 15.4's WKWebView lacks `Map.prototype.getOrInsertComputed` and
 * `Math.sumPrecise`; WebKitGTK 2.52 has them); elsewhere the legacy build, the same API with
 * polyfills, is loaded instead.
 */
export const supportsModernPdfjs = () =>
  "getOrInsertComputed" in Map.prototype && "sumPrecise" in Math;

/** pdf.js defines `globalThis.pdfjsLib`, which the viewer module reads: load them in order. */
function loadLibs() {
  libs ??= (async () => {
    installStreamIterator();
    installAbortSignalAny();
    const modern = supportsModernPdfjs();
    const pdfjs: PdfjsLib = modern
      ? await import("pdfjs-dist")
      : await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = modern ? workerUrl : legacyWorkerUrl;
    const viewer: ViewerLib = modern
      ? await import("pdfjs-dist/web/pdf_viewer.mjs")
      : await import("pdfjs-dist/legacy/web/pdf_viewer.mjs");
    // One worker for every document (each compilation is a new one, and each tab in the
    // background keeps its own): without it pdf.js starts a worker per document, which
    // loads and compiles its ~1 MB script and its fonts again each time. Measured: opening
    // the PDF took ~1 s with a new worker and ~30 ms with the shared one.
    const worker = new pdfjs.PDFWorker();
    return { pdfjs, viewer, worker };
  })();
  return libs;
}

/** pdf.js runtime data bundled with the app (see vite/pdfjsAssets.ts): never the network. */
const assetUrl = (dir: string) => new URL(`pdfjs/${dir}/`, document.baseURI).href;

type Layer = {
  element: HTMLDivElement;
  /** pdf.js's `.pdfViewer` (the pages), inside the scroll container. */
  inner: HTMLDivElement;
  viewer: InstanceType<ViewerLib["PDFViewer"]>;
  eventBus: InstanceType<ViewerLib["EventBus"]>;
  linkService: InstanceType<ViewerLib["PDFLinkService"]>;
  task: LoadingTask;
  /** Last reading position reported by pdf.js. */
  location: PdfLocation | null;
  /** Visual zoom shown while the new zoom is prepared in another layer. */
  zoom: ZoomTransform;
  /** The scale it is being zoomed to, if any. */
  pendingScale: number | null;
  /** What stays still: a point of the view (container coordinates) and the content under it. */
  anchor: { local: { x: number; y: number }; content: { x: number; y: number } } | null;
};

export class PdfController {
  /** The layer the user sees. */
  private front: Layer | null = null;
  private zoom: ZoomValue = "page-width";
  private query = "";
  /** Increases with each load: an older load that finishes late is dropped. */
  private generation = 0;
  /** A layer at the new zoom being prepared (hidden). */
  private building: Layer | null = null;
  /** Increases with each zoom step: an older preparation is dropped. */
  private zoomSeq = 0;
  private zoomTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  /** Scroll of the visible layer while the viewer is out of the page (see `detach`). */
  private savedScroll: { top: number; left: number } | null = null;
  /** Size of the PDF file shown (pdf.js keeps it and what it parses from it). */
  private documentBytes = 0;

  /** `host`: an element (positioned) that the layers fill. */
  constructor(
    private readonly host: HTMLElement,
    private readonly options: PdfControllerOptions,
  ) {}

  /**
   * Shows `data` (a whole PDF file), keeping the current zoom and reading position. The
   * first time, it opens at `start` if given (where the last session was left).
   */
  async load(data: Uint8Array, start?: PdfPlace | null): Promise<void> {
    const generation = ++this.generation;
    this.documentBytes = data.byteLength;
    // A zoom being prepared belongs to the old version (the new one opens at the new zoom).
    clearTimeout(this.zoomTimer);
    this.abortBuilding();
    const { pdfjs, viewer: lib, worker } = await loadLibs();
    const task = pdfjs.getDocument({
      data,
      worker,
      cMapUrl: assetUrl("cmaps"),
      cMapPacked: true,
      standardFontDataUrl: assetUrl("standard_fonts"),
      wasmUrl: assetUrl("wasm"),
      iccUrl: assetUrl("iccs"),
      enableXfa: false,
      // GPU canvases except on Linux. In WebKitGTK 2.52 the first drawing of a new document
      // often loses everything after a TikZ figure in XeLaTeX PDFs (xdvipdfmx), e.g. the rest
      // of a page below «Figura 1.1»: 5 of 6 first drawings with GPU, none without it. In
      // macOS's WKWebView the same pages come out identical either way, and with CPU canvases
      // each zoom step and each new drawing stalled the pinch (up to ~150 ms at 2× pixels).
      // In WebView2 that page comes out whole with GPU too, and zooming is a little smoother.
      enableHWA: IS_MAC || IS_WINDOWS,
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

    const first = !this.front && start ? start : null;
    if (first) this.zoom = first.zoom;
    layer.viewer.currentScaleValue = toScaleValue(this.zoom);
    const location = this.front?.location ?? first?.location;
    const target = location
      ? restoreDestination(location, layer.viewer.pagesCount)
      : { pageNumber: 1, destArray: undefined };
    if (location) layer.viewer.scrollPageIntoView(target);
    await this.visibleDrawn(layer, lib);
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
    element.className = "jt-pdf-layer";
    element.setAttribute("data-pending", "");
    // With a version on screen it is prepared behind it; the first one, hidden.
    if (!this.front) element.setAttribute("data-first", "");
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
    // During the visual zoom, pdf.js draws what is on screen *with* the transform: zooming
    // out brings pages into view that it would otherwise leave blank until the new zoom is
    // ready (the flicker of a fast zoom out).
    const source = viewer as unknown as VisiblePagesSource;
    const visiblePages = source._getVisiblePages.bind(viewer);
    source._getVisiblePages = () => {
      const t = layer.zoom;
      if (t === IDENTITY) return visiblePages();
      const real = source.container;
      source.container = visibleArea(element, { left: inner.offsetLeft, top: inner.offsetTop }, t);
      try {
        return visiblePages();
      } finally {
        source.container = real;
      }
    };
    const layer: Layer = {
      element,
      inner,
      viewer,
      eventBus,
      linkService,
      task,
      location: null,
      zoom: IDENTITY,
      pendingScale: null,
      anchor: null,
    };

    const isFront = () => this.front === layer;
    element.addEventListener("dblclick", (event) => {
      if (isFront()) this.inverseSync(layer, event);
    });
    eventBus.on("updateviewarea", (e: { location: PdfLocation }) => {
      // During the visual zoom pdf.js looks at the transformed pages (see above): its
      // location would mix both; the new layer reports the right one when it is shown.
      if (layer.zoom !== IDENTITY) return;
      layer.location = {
        pageNumber: e.location.pageNumber,
        left: e.location.left,
        top: e.location.top,
      };
      if (isFront()) this.emitPlace();
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
      mark.className = "jt-synctex-mark";
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

  /** Removes a layer; its document too, unless another layer shows it (zoom). */
  private async destroyLayer(layer: Layer) {
    const shared = [this.front, this.building].some(
      (other) => other && other !== layer && other.task === layer.task,
    );
    if (!shared) layer.viewer.cleanup();
    layer.viewer.setDocument(null);
    layer.linkService.setDocument(null);
    layer.element.remove();
    if (!shared) await layer.task.destroy();
  }

  private abortBuilding() {
    const building = this.building;
    if (!building) return;
    this.building = null;
    this.zoomSeq++;
    void this.destroyLayer(building);
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
      scale: this.front?.pendingScale ?? viewer.currentScale,
      zoom: this.zoom,
    });
    this.emitPlace();
  }

  private emitPlace() {
    const location = this.front?.location;
    if (location) this.options.onPlace?.({ location, zoom: this.zoom });
  }

  /**
   * Zooms to `zoom` keeping `around` (a screen point; the center of the view by default)
   * still. The drawn pages are scaled at once by the compositor; the sharp version is
   * prepared in a hidden layer and swapped in when drawn, like a new version of the PDF.
   */
  setZoom(zoom: ZoomValue, around?: ScreenPoint) {
    this.zoom = zoom;
    const target = typeof zoom === "number" ? clampZoom(zoom) : this.fitScaleFor(zoom);
    if (target !== null) this.scaleTo(target, around);
    this.emitState();
  }

  /** Ctrl+wheel: zooms around the pointer, proportionally to the wheel movement. */
  zoomByWheel(deltaY: number, deltaMode: number, around: ScreenPoint) {
    this.zoomBy(wheelZoomFactor(deltaY, deltaMode), around);
  }

  /** Multiplies the zoom by `factor` around `around` (a pinch on the trackpad). */
  zoomBy(factor: number, around: ScreenPoint) {
    const viewer = this.viewer;
    if (!viewer?.pagesCount) return;
    const current = this.front?.pendingScale ?? viewer.currentScale;
    this.zoom = clampZoom(current * factor);
    this.scaleTo(this.zoom, around);
  }

  private fitScaleFor(mode: "page-width" | "page-fit"): number | null {
    const viewer = this.viewer;
    const page = viewer?.getPageView(viewer.currentPageNumber - 1) as
      { width: number; height: number; scale: number } | undefined;
    if (!this.front || !page) return null;
    const { clientWidth: width, clientHeight: height } = this.front.element;
    return fitScale(mode, { width, height }, page);
  }

  private scaleTo(target: number, around?: ScreenPoint) {
    const layer = this.front;
    const viewer = layer?.viewer;
    if (!layer || !viewer?.pagesCount) return;
    if (target === (layer.pendingScale ?? viewer.currentScale)) return;
    const { element, inner } = layer;
    const rect = element.getBoundingClientRect();
    const screen = around ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const local = {
      x: screen.x - rect.left - element.clientLeft,
      y: screen.y - rect.top - element.clientTop,
    };
    // The content under that point (pages element, drawn scale) and where it ends up.
    const content = underPoint(layer.zoom, {
      x: local.x + element.scrollLeft - inner.offsetLeft,
      y: local.y + element.scrollTop - inner.offsetTop,
    });
    const k = target / viewer.currentScale;
    const firstDiv = (viewer.getPageView(0) as PageView).div;
    const first = pageBox(layer, firstDiv);
    const last = pageBox(layer, (viewer.getPageView(viewer.pagesCount - 1) as PageView).div);
    // Margins and borders don't scale: how much of that lies above the content (pages of
    // the same size, the usual case).
    const second =
      viewer.pagesCount > 1 ? pageBox(layer, (viewer.getPageView(1) as PageView).div) : null;
    const stride = second ? second.y - first.y : first.height;
    const pagesAbove = Math.min(
      Math.max(Math.floor((content.y - first.y) / stride), 0),
      viewer.pagesCount - 1,
    );
    const fixedBefore = pagesAbove * (stride - firstDiv.clientHeight) + firstDiv.clientTop;
    const fixedTotal =
      (viewer.pagesCount - 1) * (stride - firstDiv.clientHeight) +
      (firstDiv.offsetHeight - firstDiv.clientHeight);
    const axis = (horizontal: boolean): ZoomAxis => {
      const offset = horizontal ? inner.offsetLeft : inner.offsetTop;
      return horizontal
        ? {
            start: first.x + offset,
            length: first.width,
            view: element.clientWidth,
            scroll: element.scrollLeft,
            offset,
            center: true,
          }
        : {
            start: first.y + offset,
            length: last.y + last.height - first.y,
            view: element.clientHeight,
            scroll: element.scrollTop,
            offset,
            center: false,
            fixedBefore,
            fixedTotal,
          };
    };
    layer.zoom = {
      k,
      tx: axisTranslate(axis(true), k, content.x + inner.offsetLeft, local.x),
      ty: axisTranslate(axis(false), k, content.y + inner.offsetTop, local.y),
    };
    layer.pendingScale = target;
    layer.anchor = { local, content };
    inner.style.transform = cssTransform(layer.zoom);
    // Draw the pages that the transform brings into view (see createLayer).
    viewer.update();

    this.abortBuilding();
    clearTimeout(this.zoomTimer);
    this.zoomTimer = setTimeout(() => void this.commitZoom(), ZOOM_SETTLE_MS);
  }

  /** Draws the pending zoom in a hidden layer at the same place, then swaps it in. */
  private async commitZoom() {
    const front = this.front;
    const document = front?.viewer.pdfDocument;
    if (!front || !document || front.pendingScale === null || !front.anchor) return;
    const seq = ++this.zoomSeq;
    const generation = this.generation;
    const stale = () =>
      this.disposed ||
      generation !== this.generation ||
      seq !== this.zoomSeq ||
      this.front !== front;
    const { viewer: lib } = await loadLibs();
    if (stale()) return;
    const { local, content } = front.anchor;
    const anchor = pdfPointAt(front, content);

    const layer = this.createLayer(lib, front.task);
    this.building = layer;
    const pagesInit = new Promise<void>((resolve) => layer.eventBus.on("pagesinit", resolve));
    layer.viewer.setDocument(document);
    layer.linkService.setDocument(document);
    await pagesInit;
    if (stale()) return this.dropBuilt(layer);

    layer.viewer.currentScaleValue =
      typeof this.zoom === "string" ? toScaleValue(this.zoom) : String(front.pendingScale);
    if (anchor) {
      const view = layer.viewer.getPageView(anchor.pageNumber - 1) as PageView | undefined;
      if (view) {
        const [vx, vy] = view.viewport.convertToViewportPoint(anchor.x, anchor.y);
        const page = pagePosition(layer, view.div);
        layer.element.scrollLeft = page.x + vx + layer.inner.offsetLeft - local.x;
        layer.element.scrollTop = page.y + vy + layer.inner.offsetTop - local.y;
      }
    }
    await this.visibleDrawn(layer, lib);
    if (stale()) return this.dropBuilt(layer);

    this.building = null;
    this.front = layer;
    layer.element.removeAttribute("data-pending");
    await this.destroyLayer(front);
    this.emitState();
    if (this.query) this.find(this.query, { fresh: true });
  }

  /**
   * Waits until every page visible in `layer` is drawn (or RENDER_WAIT_MS): swapping in a
   * layer with blank pages showed them popping in afterwards.
   */
  private visibleDrawn(layer: Layer, lib: ViewerLib) {
    const source = layer.viewer as unknown as VisiblePagesSource;
    const finished = lib.RenderingStates.FINISHED;
    return whenAllRendered(
      layer.eventBus,
      () => source._getVisiblePages().views.some((v) => v.view.renderingState !== finished),
      RENDER_WAIT_MS,
    );
  }

  private dropBuilt(layer: Layer) {
    if (this.building === layer) this.building = null;
    return this.destroyLayer(layer);
  }

  /** Re-applies a fit mode after the panel is resized. */
  refit() {
    // A pending zoom is prepared at the new size anyway.
    if (this.front?.pendingScale != null) return;
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

  /**
   * The viewer is about to be taken out of the page (its project's tab is left: the drawn
   * PDF is kept for when it comes back). Out of the page an element loses its scroll.
   */
  detach() {
    const front = this.front;
    this.savedScroll = front
      ? { top: front.element.scrollTop, left: front.element.scrollLeft }
      : null;
    // A zoom about to be drawn waits until the viewer is back: out of the page nothing is
    // visible, so the new layer would be swapped in with its pages undrawn.
    clearTimeout(this.zoomTimer);
  }

  /**
   * Back on the page: at the same place. The visible pages are checked again: out of the
   * page pdf.js may have let go of some of them (a page left blank, pedido del usuario), and
   * only those are drawn again.
   */
  reattach() {
    const front = this.front;
    const saved = this.savedScroll;
    this.savedScroll = null;
    if (!front || !saved) return;
    front.element.scrollTop = saved.top;
    front.element.scrollLeft = saved.left;
    front.viewer.update();
    if (front.pendingScale !== null) {
      this.zoomTimer = setTimeout(() => void this.commitZoom(), ZOOM_SETTLE_MS);
    }
    this.emitState();
  }

  /**
   * About how much memory this viewer holds: the drawn pages (4 bytes per pixel of their
   * canvases) and twice the file (pdf.js's copy and what it parses).
   */
  memoryBytes(): number {
    let bytes = 2 * this.documentBytes;
    for (const canvas of this.host.querySelectorAll("canvas")) {
      bytes += canvas.width * canvas.height * 4;
    }
    return bytes;
  }

  async destroy() {
    this.disposed = true;
    clearTimeout(this.zoomTimer);
    this.abortBuilding();
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

/** A page's box inside the layer's pages element, unscaled (border included). */
function pageBox(layer: Layer, div: HTMLElement) {
  const page = div.getBoundingClientRect();
  const inner = layer.inner.getBoundingClientRect();
  return {
    x: (page.left - inner.left) / layer.zoom.k,
    y: (page.top - inner.top) / layer.zoom.k,
    width: div.offsetWidth,
    height: div.offsetHeight,
  };
}

/** Where a page's drawing starts inside the layer's pages element, unscaled. */
function pagePosition(layer: Layer, div: HTMLElement) {
  const page = div.getBoundingClientRect();
  const inner = layer.inner.getBoundingClientRect();
  return {
    x: (page.left - inner.left) / layer.zoom.k + div.clientLeft,
    y: (page.top - inner.top) / layer.zoom.k + div.clientTop,
  };
}

/** The page and PDF point at `content` (unscaled coordinates of the pages element). */
function pdfPointAt(layer: Layer, content: { x: number; y: number }) {
  const viewer = layer.viewer;
  let best: { pageNumber: number; view: PageView; dy: number } | null = null;
  for (let i = 0; i < viewer.pagesCount; i++) {
    const view = viewer.getPageView(i) as PageView | undefined;
    if (!view) continue;
    const { y } = pagePosition(layer, view.div);
    const height = view.div.clientHeight;
    // Distance from the page (0 inside it): between pages, the nearest one.
    const dy = content.y < y ? y - content.y : Math.max(0, content.y - (y + height));
    if (!best || dy < best.dy) best = { pageNumber: i + 1, view, dy };
    if (dy === 0) break;
  }
  if (!best) return null;
  const page = pagePosition(layer, best.view.div);
  const [x, y] = best.view.viewport.convertToPdfPoint(content.x - page.x, content.y - page.y);
  return { pageNumber: best.pageNumber, x, y };
}
