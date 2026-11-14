import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { useAppStore } from "./store/app";
import { barTarget, useLoading } from "./store/loading";
import { ProjectLoading } from "./components/layout/ProjectLoading";
import { resetApp } from "./test/reset";

describe("App", () => {
  beforeEach(resetApp);

  it("empieza en la pantalla de inicio, pestaña Proyectos, y carga los proyectos", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Proyectos" })).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Abrir Tesis de magíster" }),
    ).toBeInTheDocument();
  });

  it("cambia entre las pestañas del inicio", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Paquetes" }));
    expect(screen.getByRole("heading", { name: "Paquetes" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ajustes" }));
    expect(screen.getByRole("heading", { name: "Ajustes" })).toBeInTheDocument();
  });

  it("el botón Ajustes del editor abre la pestaña Ajustes del inicio", async () => {
    useAppStore.setState({ route: { name: "project", projectId: "tesis" } });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Ajustes" }));
    expect(screen.getByRole("heading", { name: "Ajustes" })).toBeInTheDocument();
  });

  it("abre un proyecto y vuelve al inicio con la pestaña Inicio", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir Tesis de magíster" }));
    expect(useAppStore.getState().route).toEqual({ name: "project", projectId: "tesis" });
    expect(
      await screen.findByRole("button", { name: "Proyecto Tesis de magíster" }),
    ).toBeInTheDocument();

    // The logo button was the same as the Inicio tab above it (pedido del usuario).
    expect(screen.queryByTitle("Volver al inicio")).not.toBeInTheDocument();
    // Compile is only the play icon; history and layout are in the rail.
    expect(screen.getByRole("button", { name: "Recompilar" })).not.toHaveTextContent(/\S/);
    const rail = screen.getByRole("navigation", { name: "Paneles" });
    expect(within(rail).getByRole("button", { name: "Historial" })).toBeInTheDocument();
    expect(within(rail).getByRole("button", { name: "Diseño" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Inicio" }));
    expect(useAppStore.getState().route).toEqual({ name: "home" });
  });

  it("cambia el tema de la interfaz en vivo desde Ajustes", async () => {
    render(<App />);
    expect(document.documentElement.dataset.uiTheme).toBe("indigo");
    fireEvent.click(screen.getByRole("button", { name: "Ajustes" }));
    const themes = screen.getByRole("radiogroup", { name: "Tema de la interfaz" });
    expect(within(themes).getAllByRole("radio")).toHaveLength(5);
    expect(within(themes).getByRole("radio", { name: /Índigo/ })).toBeChecked();
    fireEvent.click(within(themes).getByRole("radio", { name: /Claro/ }));
    await waitFor(() => expect(document.documentElement.dataset.uiTheme).toBe("light"));
    expect(within(themes).getByRole("radio", { name: /Claro/ })).toBeChecked();
  });

  it("cambia el idioma de la interfaz en vivo desde Ajustes", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Ajustes" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Idioma" }), {
      target: { value: "en" },
    });
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Projects" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });
});

describe("App con animaciones", () => {
  beforeEach(() => {
    resetApp();
    // jsdom has no Web Animations: with them, changing tabs is animated.
    Object.defineProperty(Element.prototype, "getAnimations", {
      configurable: true,
      writable: true,
      value: () => [],
    });
  });
  afterEach(() => {
    delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
  });

  it("al cambiar de pestaña la vista actual se va primero y la nueva entra en su primer cuadro", async () => {
    render(<App />);
    await screen.findByRole("button", { name: "Abrir Tesis de magíster" });
    const home = screen.getByRole("heading", { name: "Proyectos" }).closest("[class*='jt-view']")!;
    act(() => useAppStore.getState().openProject("tesis"));
    // The click shows at once: home fades out toward the left; the project is not mounted yet.
    expect(home.className).toContain("jt-view-out-forward");
    expect(screen.queryByRole("button", { name: "Proyecto Tesis de magíster" })).toBeNull();
    const button = await screen.findByRole("button", { name: "Proyecto Tesis de magíster" });
    const view = button.closest("[class*='jt-view']")!;
    expect(view.className).toContain("jt-view-forward");
    // Held at its start, covered by «Cargando proyecto», until the project is loaded.
    expect(view.className).toContain("jt-hold");
    expect(
      screen.getByRole("progressbar", { name: "Cargando «Tesis de magíster»…" }),
    ).toBeVisible();
    await waitFor(() => expect(view.className).not.toContain("jt-hold"));
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(useLoading.getState().done).toEqual(
      expect.arrayContaining(["opened", "files", "editor", "pdf"]),
    );
  });

  it("la barra va hacia el paso siguiente sin llegar hasta que ese termina", () => {
    expect(barTarget(0)).toBeGreaterThan(0);
    expect(barTarget(0)).toBeLessThan(1 / 4);
    expect(barTarget(1)).toBeGreaterThan(1 / 4);
    expect(barTarget(3)).toBeLessThan(1);
    expect(barTarget(4)).toBe(1);
  });

  it("la barra avanza con cada parte que termina de cargar", () => {
    useLoading.getState().begin("tesis");
    render(<ProjectLoading projectId="tesis" />);
    const bar = () => Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"));
    const start = bar();
    act(() => useLoading.getState().mark("tesis", "opened"));
    const opened = bar();
    act(() => useLoading.getState().mark("tesis", "files"));
    // A mark for another project doesn't count.
    act(() => useLoading.getState().mark("otro", "editor"));
    expect(start).toBe(0);
    expect(opened).toBeGreaterThan(start);
    expect(bar()).toBeGreaterThan(opened);
    expect(bar()).toBeLessThan(100);
    act(() => {
      useLoading.getState().mark("tesis", "editor");
      useLoading.getState().mark("tesis", "pdf");
    });
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
