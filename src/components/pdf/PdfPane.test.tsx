import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockBackend, type MockBackend } from "../../lib/mockBackend";
import { flushSessions, loadSession, rememberPdf, resetSessions } from "../../lib/session";
import { setBackend } from "../../lib/tauri";
import { useCompile } from "../../store/compile";
import { useProjectView } from "../../store/project";
import { useProjects } from "../../store/projects";
import { useSettings } from "../../store/settings";
import { useToasts } from "../../store/toasts";
import { resetApp } from "../../test/reset";
import type { PdfRect } from "../../store/types";
import type { FindResult, PdfControllerOptions, PdfViewState } from "./pdfController";
import { PdfPane } from "./PdfPane";

/** Stand-in for the pdf.js controller (jsdom cannot render PDFs). */
class FakeController {
  static last: FakeController | null = null;
  loads: Uint8Array[] = [];
  starts: unknown[] = [];
  calls: unknown[][] = [];
  state: PdfViewState = { pageNumber: 1, pagesCount: 3, scale: 0.8, zoom: "page-width" };

  constructor(
    public container: HTMLDivElement,
    public options: PdfControllerOptions,
  ) {
    FakeController.last = this;
  }
  async load(data: Uint8Array, start?: unknown) {
    this.loads.push(data);
    this.starts.push(start);
    this.options.onState(this.state);
  }
  setZoom(zoom: PdfViewState["zoom"]) {
    this.calls.push(["setZoom", zoom]);
    this.state = { ...this.state, zoom, scale: typeof zoom === "number" ? zoom : 0.8 };
    this.options.onState(this.state);
  }
  refit() {}
  goToPage(page: number) {
    this.calls.push(["goToPage", page]);
    this.state = { ...this.state, pageNumber: page };
    this.options.onState(this.state);
  }
  find(query: string, options?: { previous?: boolean }) {
    this.calls.push(["find", query, options?.previous ?? false]);
    const result: FindResult = { status: "found", current: 1, total: 2 };
    this.options.onFind(result);
  }
  closeFind() {
    this.calls.push(["closeFind"]);
  }
  showRects(rects: PdfRect[]) {
    this.calls.push(["showRects", rects]);
  }
  async destroy() {}
}

vi.mock("./pdfController", () => ({ PdfController: FakeController }));

let backend: MockBackend;

async function openProject() {
  const project = await useProjects.getState().open("tesis");
  useCompile.getState().reset(project.id);
  backend.onCompileEvent((e) => useCompile.getState().handleEvent(e));
}

describe("PdfPane", () => {
  beforeEach(async () => {
    resetApp();
    FakeController.last = null;
    backend = createMockBackend();
    setBackend(backend);
    await openProject();
  });

  it("sin PDF compilado muestra cómo generarlo y dónde quedará", async () => {
    render(<PdfPane />);
    expect(
      await screen.findByText("Compila con Ctrl+Enter para generar el PDF."),
    ).toBeInTheDocument();
    expect(screen.getByText(/\.libretex\/build\/main\.pdf/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acercar" })).toBeDisabled();
  });

  it("muestra el PDF tras compilar y lo recarga en cada compilación", async () => {
    render(<PdfPane />);
    await screen.findByText("Compila con Ctrl+Enter para generar el PDF.");
    await act(() => useCompile.getState().compileNow());
    await waitFor(() => expect(FakeController.last?.loads).toHaveLength(1));
    await waitFor(() =>
      expect(
        screen.queryByText("Compila con Ctrl+Enter para generar el PDF."),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("de 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom" })).toHaveTextContent(/^80\s%$/);

    await act(() => useCompile.getState().compileNow());
    await waitFor(() => expect(FakeController.last?.loads).toHaveLength(2));
  });

  it("si al abrir el proyecto ya hay un PDF, lo muestra sin compilar", async () => {
    await act(() => useCompile.getState().compileNow());
    await waitFor(() => expect(useCompile.getState().last).not.toBeNull());
    useCompile.getState().reset("tesis");
    render(<PdfPane />);
    await waitFor(() => expect(FakeController.last?.loads).toHaveLength(1));
  });

  it("abre el PDF en la página y el zoom de la sesión anterior y recuerda los nuevos", async () => {
    const place = { location: { pageNumber: 4, left: 10, top: 600 }, zoom: 1.5 };
    rememberPdf("tesis", place);
    flushSessions();
    resetSessions();
    await act(() => useCompile.getState().compileNow());
    render(<PdfPane />);
    await waitFor(() => expect(FakeController.last?.starts).toEqual([place]));

    const next = { location: { pageNumber: 2, left: 0, top: 300 }, zoom: "page-width" as const };
    act(() => FakeController.last!.options.onPlace?.(next));
    expect(loadSession("tesis")?.pdf).toEqual(next);
  });

  it("páginas, zoom, búsqueda y modo oscuro", async () => {
    await act(() => useCompile.getState().compileNow());
    render(<PdfPane />);
    await waitFor(() => expect(FakeController.last?.loads.length).toBeGreaterThan(0));
    const fake = FakeController.last!;
    // Controller calls go through a promise (pdf.js is loaded on demand).
    const called = (call: unknown[]) => waitFor(() => expect(fake.calls).toContainEqual(call));

    fireEvent.click(await screen.findByRole("button", { name: "Página siguiente" }));
    await called(["goToPage", 2]);
    const pageInput = screen.getByRole("textbox", { name: "Número de página" });
    fireEvent.change(pageInput, { target: { value: "3" } });
    fireEvent.keyDown(pageInput, { key: "Enter" });
    await called(["goToPage", 3]);

    fireEvent.click(screen.getByRole("button", { name: "Acercar" }));
    await called(["setZoom", 0.9]);
    fireEvent.click(screen.getByRole("button", { name: "Zoom" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Ajustar a la página" }));
    await called(["setZoom", "page-fit"]);

    fireEvent.keyDown(screen.getByTestId("pdf-viewer"), { key: "f", ctrlKey: true });
    const search = await screen.findByRole("searchbox", { name: "Buscar en el PDF" });
    fireEvent.change(search, { target: { value: "murciélago" } });
    await called(["find", "murciélago", false]);
    expect(await screen.findByText("1 de 2")).toBeInTheDocument();
    fireEvent.keyDown(search, { key: "Enter", shiftKey: true });
    await called(["find", "murciélago", true]);
    fireEvent.keyDown(search, { key: "Escape" });
    await called(["closeFind"]);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Más opciones del PDF" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Modo oscuro" }));
    expect(useSettings.getState().pdfDarkMode).toBe(true);
    expect(screen.getByTestId("pdf-viewer")).toHaveClass("lt-pdf-dark");
  });

  it("abrir con el visor del sistema avisa si todavía no hay PDF", async () => {
    render(<PdfPane />);
    fireEvent.click(screen.getByRole("button", { name: "Más opciones del PDF" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Abrir con el visor del sistema" }));
    await waitFor(() =>
      expect(useToasts.getState().toasts.map((t) => t.title)).toContain(
        "Todavía no hay un PDF compilado. Compila con Ctrl+Enter.",
      ),
    );
  });

  describe("SyncTeX", () => {
    async function readyPane() {
      await act(() => useCompile.getState().compileNow());
      render(<PdfPane />);
      await waitFor(() => expect(FakeController.last?.loads.length).toBeGreaterThan(0));
      return FakeController.last!;
    }
    const toastTitles = () => useToasts.getState().toasts.map((t) => t.title);

    it("del cursor al PDF: pide las cajas y las resalta", async () => {
      const fake = await readyPane();
      const forward = vi.spyOn(backend, "synctexForward");
      useProjectView.setState({ activeFile: "main.tex", cursorLine: 31 });
      act(() => useProjectView.getState().syncToPdf());
      await waitFor(() =>
        expect(fake.calls).toContainEqual([
          "showRects",
          [{ page: 2, left: 72, top: 80, width: 450, height: 12 }],
        ]),
      );
      expect(forward).toHaveBeenCalledWith("tesis", "main.tex", 31, 1);
    });

    it("el botón de la barra hace lo mismo, y avisa si no hay coincidencias", async () => {
      await readyPane();
      backend.synctexForward = async () => [];
      fireEvent.click(
        await screen.findByRole("button", { name: "Ir al lugar del cursor en el PDF" }),
      );
      await waitFor(() =>
        expect(toastTitles()).toContain(
          "No se encontró ese lugar en el PDF. Si cambiaste el texto, recompila.",
        ),
      );
    });

    it("doble clic en el PDF lleva al archivo y la línea", async () => {
      const fake = await readyPane();
      act(() => fake.options.onInverseSync({ page: 2, x: 100, y: 120, word: null }));
      await waitFor(() =>
        expect(useProjectView.getState().goto).toMatchObject({ path: "main.tex", line: 33 }),
      );
    });

    it("si el punto no viene del proyecto (la clase, un paquete), lo dice", async () => {
      const fake = await readyPane();
      backend.synctexInverse = async () => null;
      act(() => fake.options.onInverseSync({ page: 1, x: 5, y: 5, word: null }));
      await waitFor(() =>
        expect(toastTitles()).toContain("Ese lugar del PDF no viene de un archivo del proyecto."),
      );
    });
  });
});
