import axe from "axe-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../App";
import { resetApp } from "./reset";
import { useAppStore } from "../store/app";
import { useWorkspaces } from "../store/workspaces";
import { act } from "react";

/**
 * Automatic accessibility check (axe-core) of the main screens: names of buttons and fields,
 * roles, ARIA. Colour contrast is not measured here (jsdom does not lay out); the tokens are
 * checked in tokens.test.ts.
 */
async function violations() {
  const result = await axe.run(document.body, {
    rules: {
      "color-contrast": { enabled: false },
      // A desktop app window: no <main> landmark or page title is expected.
      region: { enabled: false },
      "page-has-heading-one": { enabled: false },
      "landmark-one-main": { enabled: false },
    },
  });
  return result.violations.map(
    (v) =>
      `${v.id}: ${v.help}\n${v.nodes
        .map(
          (n) =>
            `  ${n.html.slice(0, 160)}${n.any
              .flatMap((c) => c.relatedNodes ?? [])
              .map((r) => `\n    ↔ ${r.html.slice(0, 160)}`)
              .join("")}`,
        )
        .join("\n")}`,
  );
}

describe("accesibilidad", () => {
  beforeEach(resetApp);

  it("inicio sin problemas de accesibilidad", async () => {
    render(<App />);
    await screen.findByRole("button", { name: "Abrir Tesis de magíster" });
    expect(await violations()).toEqual([]);
  });

  it("vista de proyecto sin problemas de accesibilidad", async () => {
    render(<App />);
    await screen.findByRole("button", { name: "Abrir Tesis de magíster" });
    act(() => useWorkspaces.getState().open("tesis"));
    await screen.findByText(/Este documento es un ejemplo/);
    expect(useAppStore.getState().route.name).toBe("project");
    expect(await violations()).toEqual([]);
  });

  it("los atajos se abren con F1 y el diálogo es accesible", async () => {
    render(<App />);
    await screen.findByRole("button", { name: "Abrir Tesis de magíster" });
    fireEvent.keyDown(window, { key: "F1" });
    const dialog = await screen.findByRole("dialog", { name: "Atajos de teclado" });
    expect(dialog).toHaveTextContent("Ctrl+Enter");
    expect(dialog).toHaveTextContent("Ctrl+AvPág");
    expect(await violations()).toEqual([]);
  });

  it("pestañas del inicio sin problemas de accesibilidad", async () => {
    render(<App />);
    await screen.findByRole("button", { name: "Abrir Tesis de magíster" });
    const problems: string[] = [];
    for (const tab of ["Papelera", "Paquetes", "Ajustes"]) {
      fireEvent.click(screen.getByRole("button", { name: tab }));
      await new Promise((r) => setTimeout(r, 150));
      problems.push(...(await violations()).map((v) => `${tab} → ${v}`));
    }
    expect(problems).toEqual([]);
  });

  it("paneles del proyecto e historial sin problemas de accesibilidad", async () => {
    render(<App />);
    await screen.findByRole("button", { name: "Abrir Tesis de magíster" });
    act(() => useWorkspaces.getState().open("tesis"));
    await screen.findByText(/Este documento es un ejemplo/);
    const problems: string[] = [];
    for (const panel of [
      "Buscar en el proyecto",
      "Paquetes",
      "Registros y errores",
      "Respaldo con Git",
    ]) {
      fireEvent.click(screen.getByRole("button", { name: panel }));
      await new Promise((r) => setTimeout(r, 150));
      problems.push(...(await violations()).map((v) => `${panel} → ${v}`));
    }
    fireEvent.click(screen.getByRole("button", { name: "Historial" }));
    await screen.findByRole("region", { name: "Historial" });
    problems.push(...(await violations()).map((v) => `Historial → ${v}`));
    expect(problems).toEqual([]);
  });
});
