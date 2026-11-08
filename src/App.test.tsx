import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { useAppStore } from "./store/app";
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
    const home = screen.getByRole("heading", { name: "Proyectos" }).closest("[class*='lt-view']")!;
    act(() => useAppStore.getState().openProject("tesis"));
    // The click shows at once: home fades out toward the left; the project is not mounted yet.
    expect(home.className).toContain("lt-view-out-forward");
    expect(screen.queryByRole("button", { name: "Proyecto Tesis de magíster" })).toBeNull();
    const button = await screen.findByRole("button", { name: "Proyecto Tesis de magíster" });
    const view = button.closest("[class*='lt-view']")!;
    expect(view.className).toContain("lt-view-forward");
    // Held at its start until the first frame is drawn, then it plays.
    await waitFor(() => expect(view.className).not.toContain("lt-hold"));
  });
});
