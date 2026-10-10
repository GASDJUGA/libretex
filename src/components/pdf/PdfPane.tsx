import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileText,
  Loader2,
  MoreVertical,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useT } from "../../i18n";
import { notifyError, notifyInfo } from "../../lib/errors";
import { formatZoom, ZOOM_PRESETS, zoomIn, zoomOut, type ZoomValue } from "../../lib/pdf/zoom";
import { getBackend, isBackendError } from "../../lib/tauri";
import { useCompile } from "../../store/compile";
import { useProjects } from "../../store/projects";
import { useSettings } from "../../store/settings";
import { Menu, type MenuEntry } from "../common/Menu";
import type { FindResult, PdfController, PdfViewState } from "./pdfController";

const iconButton =
  "rounded p-1 text-fg-muted hover:bg-hover hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent";

type Status = "loading" | "empty" | "ready" | "error";

const INITIAL_VIEW: PdfViewState = { pageNumber: 1, pagesCount: 0, scale: 1, zoom: "page-width" };

/**
 * Built-in PDF viewer (pdf.js): pages are rendered lazily, with zoom, page navigation,
 * search and an optional dark mode. It shows the project's compiled PDF and reloads it
 * after each compilation that produces a new one.
 */
export function PdfPane() {
  const t = useT();
  const projectId = useProjects((s) => s.current?.id ?? null);
  const mainFile = useProjects((s) => s.current?.mainFile ?? "main.tex");
  // A new PDF arrives with each compilation that wrote one.
  const pdfRun = useCompile((s) => (s.last?.pdf ? s.last.runId : 0));
  const running = useCompile((s) => s.running);
  const dark = useSettings((s) => s.pdfDarkMode);
  const setDark = useSettings((s) => s.setPdfDarkMode);

  const containerRef = useRef<HTMLDivElement>(null);
  const controller = useRef<Promise<PdfController> | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [view, setView] = useState<PdfViewState>(INITIAL_VIEW);
  const [pageInput, setPageInput] = useState("1");
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<FindResult | null>(null);
  const findInput = useRef<HTMLInputElement>(null);

  /** The pdf.js controller, created on first use (pdf.js is loaded on demand). */
  const getController = useCallback(() => {
    controller.current ??= import("./pdfController").then(
      ({ PdfController }) =>
        new PdfController(containerRef.current!, {
          onState: (state) => {
            setView(state);
            setPageInput(String(state.pageNumber));
          },
          onFind: setFound,
        }),
    );
    return controller.current;
  }, []);

  useEffect(
    () => () => {
      controller.current?.then((c) => c.destroy());
      controller.current = null;
    },
    [],
  );

  // Load the PDF when the project opens and after each compilation that produced one.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getBackend().readPdf(projectId);
        if (cancelled) return;
        await (await getController()).load(data);
        if (!cancelled) setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        if (isBackendError(error) && error.code === "notFound") {
          setStatus("empty");
        } else {
          console.error(error);
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, pdfRun, getController]);

  // Fit modes follow the panel size.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => controller.current?.then((c) => c.refit()));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const withController = (action: (c: PdfController) => void) => {
    controller.current?.then(action);
  };
  const setZoom = (zoom: ZoomValue) => withController((c) => c.setZoom(zoom));

  // Ctrl+wheel zooms like in other viewers (needs a non-passive listener).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      controller.current?.then((c) => {
        const scale = c.currentScale();
        c.setZoom(e.deltaY < 0 ? zoomIn(scale) : zoomOut(scale));
      });
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
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
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      openFind();
    }
  };

  const run = (action: (id: string) => Promise<void>) => {
    if (!projectId) return;
    action(projectId).catch((error) => {
      if (isBackendError(error) && error.code === "notFound") notifyInfo(t("pdf.missing"));
      else notifyError(error);
    });
  };

  const ready = status === "ready" && view.pagesCount > 0;
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
    { label: t("pdf.darkMode"), checked: dark, onSelect: () => setDark(!dark) },
    { kind: "separator" },
    { label: t("pdf.open"), onSelect: () => run((id) => getBackend().openPdf(id)) },
    { label: t("pdf.reveal"), onSelect: () => run((id) => getBackend().revealPdf(id)) },
  ];
  const pdfPath = `.libretex/build/${mainFile.replace(/^.*\//, "").replace(/\.[^.]*$/, "")}.pdf`;

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
        <span className="text-fg-muted tabular-nums">
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
        {running && <Loader2 size={14} className="ml-1 animate-spin text-fg-muted" aria-hidden />}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label={t("pdf.search")}
            title={t("pdf.search")}
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
        {/* The controller fills this with one scroll layer per loaded version of the PDF. */}
        <div
          ref={containerRef}
          data-testid="pdf-viewer"
          className={`lt-pdf-viewer absolute inset-0 ${dark ? "lt-pdf-dark" : ""} ${ready ? "" : "invisible"}`}
        />
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
                  : t("pdf.notYet")}
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
