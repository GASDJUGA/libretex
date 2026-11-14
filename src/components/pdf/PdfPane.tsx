import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Crosshair,
  FileText,
  Loader2,
  MoreVertical,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { translate, useI18n, useT, type TranslationKey, type TranslationParams } from "../../i18n";
import { notifyError, notifyInfo } from "../../lib/errors";
import { keyLabel } from "../../lib/platform";
import { formatZoom, ZOOM_PRESETS, zoomIn, zoomOut, type ZoomValue } from "../../lib/pdf/zoom";
import { loadSession, rememberPdf } from "../../lib/session";
import { isFindKey } from "../../lib/shortcuts";
import { getBackend, isBackendError } from "../../lib/tauri";
import { useCompile } from "../../store/compile";
import { useProjectView } from "../../store/project";
import { useLoading } from "../../store/loading";
import { useProjects } from "../../store/projects";
import { useSettings } from "../../store/settings";
import { Menu, type MenuEntry } from "../common/Menu";
import type { FindResult, PdfController, PdfViewState } from "./pdfController";
import {
  attachPdf,
  detachPdf,
  pdfEntry,
  setPdfClasses,
  setPdfLoaded,
  type PdfStatus,
} from "./pdfPool";

/** Text in the current language, for callbacks outside React rendering. */
/** WebKit's pinch events (Safari and macOS's WKWebView only). */
const GESTURE_EVENTS = ["gesturestart", "gesturechange", "gestureend"];
type PinchGesture = { scale: number; clientX: number; clientY: number };

const translateNow = (key: TranslationKey, params?: TranslationParams) =>
  translate(useI18n.getState().locale, key, params);

const iconButton =
  "rounded p-1 text-fg-muted hover:bg-hover hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent";

type Status = PdfStatus;

const INITIAL_VIEW: PdfViewState = { pageNumber: 1, pagesCount: 0, scale: 1, zoom: "page-width" };

/**
 * Built-in PDF viewer (pdf.js): pages are rendered lazily, with zoom, page navigation,
 * search and an optional dark mode. It shows the project's compiled PDF and reloads it
 * after each compilation that produces a new one. Each project keeps its viewer, already
 * drawn, while another tab is on screen (`pdfPool.ts`).
 */
export function PdfPane() {
  const projectId = useProjects((s) => s.current?.id ?? null);
  return <ProjectPdf key={projectId ?? ""} projectId={projectId} />;
}

function ProjectPdf({ projectId }: { projectId: string | null }) {
  const t = useT();
  const mainFile = useProjects((s) => s.current?.mainFile ?? "main.tex");
  // A new PDF arrives with each compilation that wrote one.
  const pdfRun = useCompile((s) => (s.last?.pdf ? s.last.runId : 0));
  const running = useCompile((s) => s.running);
  const dark = useSettings((s) => s.pdfDarkMode);
  const setDark = useSettings((s) => s.setPdfDarkMode);

  // This project's viewer: the one kept from the last time its tab was shown, or a new one.
  const [entry] = useState(() => (projectId ? pdfEntry(projectId) : null));
  const slotRef = useRef<HTMLDivElement>(null);
  const controller = useRef<Promise<PdfController> | null>(entry?.controller ?? null);
  const [status, setStatus] = useState<Status>(entry?.status ?? "loading");
  const [view, setView] = useState<PdfViewState>(entry?.view ?? INITIAL_VIEW);
  const [pageInput, setPageInput] = useState(String(entry?.view?.pageNumber ?? 1));
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<FindResult | null>(null);
  const findInput = useRef<HTMLInputElement>(null);

  // The viewer goes into the pane (before it is painted, at its place) and back out when the
  // tab is left; it keeps its drawn pages meanwhile.
  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!entry || !slot) return;
    slot.prepend(entry.element);
    attachPdf(entry, {
      onState: (state) => {
        setView(state);
        setPageInput(String(state.pageNumber));
      },
      onFind: setFound,
      onPlace: (place) => {
        const id = useProjects.getState().current?.id;
        if (id) rememberPdf(id, place);
      },
      onInverseSync: ({ page, x, y, word }) => {
        const id = useProjects.getState().current?.id;
        if (!id) return;
        getBackend()
          .synctexInverse(id, page, x, y)
          .then((location) => {
            if (location) {
              useProjectView.getState().goToLine(location.file, location.line, word ?? undefined);
            } else notifyInfo(translateNow("pdf.syncOutside"));
          })
          .catch(notifyError);
      },
    });
    return () => detachPdf(entry);
  }, [entry]);

  // Load the PDF when the project opens and after each compilation that produced one (not
  // when coming back to the tab: the kept viewer already shows it).
  useEffect(() => {
    if (!entry || !projectId) return;
    if (entry.loadedRun === pdfRun && entry.status !== "loading") return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getBackend().readPdf(projectId);
        // The first time, back to where the last session was left.
        await (await entry.controller).load(data, loadSession(projectId)?.pdf);
        setPdfLoaded(entry, pdfRun, "ready");
        if (!cancelled) setStatus("ready");
      } catch (error) {
        const failed =
          isBackendError(error) && error.code === "notFound" ? "empty" : ("error" as const);
        if (failed === "error") console.error(error);
        setPdfLoaded(entry, pdfRun, failed);
        if (!cancelled) setStatus(failed);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry, projectId, pdfRun]);

  // For the «Cargando proyecto» bar: the PDF is drawn (or there is none).
  useEffect(() => {
    if (projectId && status !== "loading") useLoading.getState().mark(projectId, "pdf");
  }, [projectId, status]);

  // Fit modes follow the panel size.
  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => controller.current?.then((c) => c.refit()));
    observer.observe(slot);
    return () => observer.disconnect();
  }, []);

  // SyncTeX source → PDF (Ctrl+J in the editor, the toolbar button, the «Ver» menu).
  const pdfSync = useProjectView((s) => s.pdfSync);
  useEffect(() => {
    if (!pdfSync || !projectId) return;
    let cancelled = false;
    getBackend()
      .synctexForward(projectId, pdfSync.path, pdfSync.line, 1)
      .then(async (rects) => {
        if (cancelled) return;
        if (rects.length === 0) notifyInfo(translateNow("pdf.syncNoMatch"));
        else (await controller.current)?.showRects(rects);
      })
      .catch((error) => {
        if (isBackendError(error) && error.code === "notFound")
          notifyInfo(translateNow("pdf.missing", { key: keyLabel("Mod+Enter") }));
        else notifyError(error);
      });
    return () => {
      cancelled = true;
    };
  }, [pdfSync, projectId]);

  const withController = (action: (c: PdfController) => void) => {
    controller.current?.then(action);
  };
  const setZoom = (zoom: ZoomValue) => withController((c) => c.setZoom(zoom));

  // Ctrl+wheel (also ⌘ on macOS) zooms (needs a non-passive listener to stop the page zoom).
  useEffect(() => {
    const container = slotRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // Around the pointer, like in other viewers.
      const around = { x: e.clientX, y: e.clientY };
      controller.current?.then((c) => c.zoomByWheel(e.deltaY, e.deltaMode, around));
    };
    // A pinch on a Mac trackpad: WebKit sends its own gesture events (with the scale since
    // the pinch began), not Ctrl+wheel as Chromium and WebKitGTK do.
    // The steps of one animation frame are applied together (a trackpad can send more
    // events than frames).
    let pinched = 1;
    let pending: { factor: number; x: number; y: number } | null = null;
    const applyPinch = () => {
      const step = pending;
      pending = null;
      if (step) controller.current?.then((c) => c.zoomBy(step.factor, { x: step.x, y: step.y }));
    };
    const onGesture = (e: Event) => {
      e.preventDefault();
      const { scale, clientX, clientY } = e as Event & PinchGesture;
      if (e.type === "gesturestart") pinched = 1;
      else if (e.type === "gesturechange" && scale > 0) {
        if (!pending) requestAnimationFrame(applyPinch);
        pending = { factor: (pending?.factor ?? 1) * (scale / pinched), x: clientX, y: clientY };
        pinched = scale;
      }
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    for (const type of GESTURE_EVENTS) container.addEventListener(type, onGesture);
    return () => {
      container.removeEventListener("wheel", onWheel);
      for (const type of GESTURE_EVENTS) container.removeEventListener(type, onGesture);
    };
  }, []);

  const openFind = () => {
    setFindOpen(true);
    requestAnimationFrame(() => findInput.current?.select());
  };
  const closeFind = () => {
    setFindOpen(false);
    setFound(null);
    withController((c) => c.closeFind());
  };
  const search = (text: string, previous = false) => {
    if (!text) {
      setFound(null);
      withController((c) => c.closeFind());
      return;
    }
    withController((c) => c.find(text, { previous }));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (isFindKey(e.nativeEvent)) {
      e.preventDefault();
      openFind();
    }
  };

  const run = (action: (id: string) => Promise<void>) => {
    if (!projectId) return;
    action(projectId).catch((error) => {
      if (isBackendError(error) && error.code === "notFound")
        notifyInfo(t("pdf.missing", { key: keyLabel("Mod+Enter") }));
      else notifyError(error);
    });
  };

  const ready = status === "ready" && view.pagesCount > 0;
  // The viewer element is not rendered by React: its classes are set here.
  useEffect(() => {
    if (entry) setPdfClasses(entry, { "jt-pdf-dark": dark, invisible: !ready });
  }, [entry, dark, ready]);
  // Always a percentage (also in fit modes): short enough for a narrow panel.
  const zoomLabel = formatZoom(view.scale);
  const zoomEntries: MenuEntry[] = [
    {
      label: t("pdf.fitWidth"),
      checked: view.zoom === "page-width",
      radio: true,
      onSelect: () => setZoom("page-width"),
    },
    {
      label: t("pdf.fitPage"),
      checked: view.zoom === "page-fit",
      radio: true,
      onSelect: () => setZoom("page-fit"),
    },
    { kind: "separator" },
    ...ZOOM_PRESETS.map((scale): MenuEntry => ({
      label: formatZoom(scale),
      checked: view.zoom === scale,
      radio: true,
      onSelect: () => setZoom(scale),
    })),
  ];
  const moreEntries: MenuEntry[] = [
    { kind: "label", label: t("pdf.syncHint") },
    { kind: "separator" },
    { label: t("pdf.darkMode"), checked: dark, onSelect: () => setDark(!dark) },
    { kind: "separator" },
    { label: t("pdf.open"), onSelect: () => run((id) => getBackend().openPdf(id)) },
    { label: t("pdf.reveal"), onSelect: () => run((id) => getBackend().revealPdf(id)) },
  ];
  const pdfPath = `.jutex/build/${mainFile.replace(/^.*\//, "").replace(/\.[^.]*$/, "")}.pdf`;

  return (
    <section
      className="flex h-full flex-col bg-pdf-bg"
      aria-label={t("pdf.region")}
      onKeyDown={onKeyDown}
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line bg-panel px-2 text-sm">
        <button
          type="button"
          aria-label={t("pdf.prevPage")}
          title={t("pdf.prevPage")}
          className={iconButton}
          disabled={!ready || view.pageNumber <= 1}
          onClick={() => withController((c) => c.goToPage(view.pageNumber - 1))}
        >
          <ChevronLeft size={16} aria-hidden />
        </button>
        <input
          aria-label={t("pdf.pageNumber")}
          className="w-10 rounded border border-line bg-transparent px-1 text-center tabular-nums disabled:opacity-40"
          value={ready ? pageInput : ""}
          disabled={!ready}
          inputMode="numeric"
          onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") withController((c) => c.goToPage(Number(pageInput) || 1));
          }}
          onBlur={() => setPageInput(String(view.pageNumber))}
        />
        <span className="whitespace-nowrap text-fg-muted tabular-nums">
          {t("pdf.ofPages", { total: ready ? view.pagesCount : "–" })}
        </span>
        <button
          type="button"
          aria-label={t("pdf.nextPage")}
          title={t("pdf.nextPage")}
          className={iconButton}
          disabled={!ready || view.pageNumber >= view.pagesCount}
          onClick={() => withController((c) => c.goToPage(view.pageNumber + 1))}
        >
          <ChevronRight size={16} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={t("pdf.syncToPdf")}
          title={`${t("pdf.syncToPdf")} (${keyLabel("Mod+J")})`}
          className={iconButton}
          disabled={!ready}
          onClick={() => useProjectView.getState().syncToPdf()}
        >
          <Crosshair size={16} aria-hidden />
        </button>
        {running && <Loader2 size={14} className="ml-1 animate-spin text-fg-muted" aria-hidden />}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label={t("pdf.search", { key: keyLabel("Mod+F") })}
            title={t("pdf.search", { key: keyLabel("Mod+F") })}
            aria-pressed={findOpen}
            className={iconButton}
            disabled={!ready}
            onClick={() => (findOpen ? closeFind() : openFind())}
          >
            <Search size={16} aria-hidden />
          </button>
          <span className="mx-1 h-5 border-l border-line" />
          <button
            type="button"
            aria-label={t("pdf.zoomOut")}
            title={t("pdf.zoomOut")}
            className={iconButton}
            disabled={!ready}
            onClick={() => setZoom(zoomOut(view.scale))}
          >
            <ZoomOut size={16} aria-hidden />
          </button>
          <Menu
            trigger={<span className="min-w-12 text-center tabular-nums">{zoomLabel}</span>}
            label={t("pdf.zoom")}
            entries={zoomEntries}
            align="end"
            triggerClassName="rounded px-1.5 py-0.5 text-fg-muted hover:bg-hover hover:text-fg"
          />
          <button
            type="button"
            aria-label={t("pdf.zoomIn")}
            title={t("pdf.zoomIn")}
            className={iconButton}
            disabled={!ready}
            onClick={() => setZoom(zoomIn(view.scale))}
          >
            <ZoomIn size={16} aria-hidden />
          </button>
          <Menu
            trigger={<MoreVertical size={16} aria-hidden />}
            label={t("pdf.more")}
            entries={moreEntries}
            align="end"
            triggerClassName={iconButton}
          />
        </div>
      </div>

      {findOpen && (
        <div className="flex shrink-0 items-center gap-1 border-b border-line bg-panel px-2 py-1 text-sm">
          <input
            ref={findInput}
            type="search"
            aria-label={t("pdf.findPlaceholder")}
            placeholder={t("pdf.findPlaceholder")}
            className="min-w-0 flex-1 rounded border border-line bg-transparent px-2 py-0.5"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              search(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") search(query, e.shiftKey);
              if (e.key === "Escape") closeFind();
            }}
          />
          <span
            className="min-w-20 text-center text-xs text-fg-muted tabular-nums"
            aria-live="polite"
          >
            {found && query
              ? found.status === "notFound"
                ? t("pdf.findNone")
                : found.total > 0
                  ? t("pdf.findCount", { current: found.current, total: found.total })
                  : ""
              : ""}
          </span>
          <button
            type="button"
            aria-label={t("pdf.findPrevious")}
            title={t("pdf.findPrevious")}
            className={iconButton}
            onClick={() => search(query, true)}
          >
            <ChevronUp size={16} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={t("pdf.findNext")}
            title={t("pdf.findNext")}
            className={iconButton}
            onClick={() => search(query)}
          >
            <ChevronDown size={16} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={t("pdf.findClose")}
            title={t("pdf.findClose")}
            className={iconButton}
            onClick={closeFind}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {/* The project's viewer goes here (one scroll layer per loaded version of the PDF). */}
        <div ref={slotRef} className="absolute inset-0" />
        {status !== "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            {status === "loading" || running ? (
              <Loader2 size={36} className="animate-spin text-fg-muted" aria-hidden />
            ) : (
              <FileText size={36} className="text-fg-muted" aria-hidden />
            )}
            <p className="font-medium">
              {status === "loading"
                ? t("pdf.loading")
                : status === "error"
                  ? t("pdf.loadError")
                  : t("pdf.notYet", { key: keyLabel("Mod+Enter") })}
            </p>
            {status !== "loading" && (
              <p className="max-w-sm text-sm text-fg-muted">
                {t("pdf.location", { path: pdfPath })}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
