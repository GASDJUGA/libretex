import { beforeEach, describe, expect, it } from "vitest";
import { initialProjectViewState, useProjectView } from "./project";

describe("useProjectView", () => {
  beforeEach(() => {
    useProjectView.setState({
      ...initialProjectViewState,
      openFiles: ["a.tex", "b.tex", "c.tex"],
      activeFile: "b.tex",
    });
  });

  it("cerrar la pestaña activa activa la siguiente", () => {
    useProjectView.getState().closeFile("b.tex");
    expect(useProjectView.getState().openFiles).toEqual(["a.tex", "c.tex"]);
    expect(useProjectView.getState().activeFile).toBe("c.tex");
  });

  it("cerrar la última pestaña activa la anterior", () => {
    useProjectView.setState({ activeFile: "c.tex" });
    useProjectView.getState().closeFile("c.tex");
    expect(useProjectView.getState().activeFile).toBe("b.tex");
  });

  it("cerrar todas las pestañas deja el editor sin archivo activo", () => {
    for (const f of ["a.tex", "b.tex", "c.tex"]) useProjectView.getState().closeFile(f);
    expect(useProjectView.getState().activeFile).toBeNull();
  });

  it("abrir un archivo ya abierto no lo duplica", () => {
    useProjectView.getState().openFile("a.tex");
    expect(useProjectView.getState().openFiles).toEqual(["a.tex", "b.tex", "c.tex"]);
    expect(useProjectView.getState().activeFile).toBe("a.tex");
  });

  it("pulsar el panel lateral abierto lo colapsa y otro panel lo reabre", () => {
    const { toggleSidePanel } = useProjectView.getState();
    toggleSidePanel("files");
    expect(useProjectView.getState().sidePanelOpen).toBe(false);
    toggleSidePanel("search");
    expect(useProjectView.getState()).toMatchObject({ sidePanel: "search", sidePanelOpen: true });
  });

  it("syncToPdf pide el salto con la línea del cursor y muestra el PDF si estaba oculto", () => {
    useProjectView.setState({ layoutMode: "editor", cursorLine: 12 });
    useProjectView.getState().syncToPdf();
    const state = useProjectView.getState();
    expect(state.pdfSync).toMatchObject({ path: "b.tex", line: 12 });
    expect(state.layoutMode).toBe("split");
    // Each request is new, even for the same line.
    const first = state.pdfSync!.nonce;
    useProjectView.getState().syncToPdf();
    expect(useProjectView.getState().pdfSync!.nonce).not.toBe(first);
  });
});
