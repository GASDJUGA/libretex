import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
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

  it("abre un proyecto y vuelve al inicio con el logo", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir Tesis de magíster" }));
    expect(useAppStore.getState().route).toEqual({ name: "project", projectId: "tesis" });
    expect(
      await screen.findByRole("button", { name: "Proyecto Tesis de magíster" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Volver al inicio"));
    expect(useAppStore.getState().route).toEqual({ name: "home" });
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
