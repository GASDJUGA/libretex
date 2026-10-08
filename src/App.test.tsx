import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { useAppStore } from "./store/app";

describe("App", () => {
  beforeEach(() => {
    useAppStore.setState({ route: { name: "home" } });
  });

  it("empieza en la pantalla de inicio", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /LibreTeX/ })).toBeInTheDocument();
  });

  it("abre un proyecto y vuelve al inicio con el logo", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Tesis de magíster" }));
    expect(useAppStore.getState().route).toEqual({ name: "project", projectId: "tesis" });
    expect(screen.getByRole("button", { name: "Proyecto Tesis de magíster" })).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Volver al inicio"));
    expect(useAppStore.getState().route).toEqual({ name: "home" });
  });
});
