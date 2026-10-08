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
});
