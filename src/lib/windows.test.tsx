import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { useAppStore } from "../store/app";
import { useBuffers } from "../store/buffers";
import type { WindowRequest } from "../store/types";
import { useWorkspaces } from "../store/workspaces";
import { resetApp } from "../test/reset";
import { createMockBackend } from "./mockBackend";
import { setBackend, type Backend } from "./tauri";
import { tabDragEnded, tabDragStarted, TAB_MIME } from "./windows";

/** The mock backend as in the app: several windows, with the window calls recorded. */
function windowedBackend(
  start: { main: boolean; project: string | null } = { main: true, project: null },
) {
  let onRequest: ((request: WindowRequest) => void) | null = null;
  const backend = {
    ...createMockBackend(),
    multiWindow: true,
    windowStart: vi.fn(async () => ({ label: start.main ? "main" : "w-1", ...start })),
    setWindowProjects: vi.fn(async () => {}),
    claimProject: vi.fn(async () => true),
    openProjectWindow: vi.fn(async () => {}),
    prepareWindow: vi.fn(async () => {}),
    otherWindows: vi.fn(async () => [{ label: "w-2", projects: ["mecanica"] }]),
    requestProject: vi.fn(async () => {}),
    giveProject: vi.fn(async () => {}),
    closeWindow: vi.fn(async () => {}),
    setWindowTitle: vi.fn(async () => {}),
    onWindowRequest: (callback: (request: WindowRequest) => void) => {
      onRequest = callback;
      return () => {
        onRequest = null;
      };
    },
  } satisfies Backend;
  setBackend(backend);
  return { backend, request: (r: WindowRequest) => act(() => onRequest?.(r)) };
}

const tabStrip = () => screen.getByRole("tablist", { name: "Proyectos abiertos" });
const tabs = () =>
  within(tabStrip())
    .getAllByRole("tab")
    .map((t) => t.textContent);

beforeEach(resetApp);

describe("varias ventanas", () => {
  it("una ventana nueva abre el proyecto con el que se creó e informa sus pestañas", async () => {
    const { backend } = windowedBackend({ main: false, project: "tesis" });
    render(<App />);
    await waitFor(() =>
      expect(useAppStore.getState().route).toEqual({ name: "project", projectId: "tesis" }),
    );
    await waitFor(() => expect(backend.setWindowProjects).toHaveBeenLastCalledWith(["tesis"]));
    // The title names the project on screen (task bar, Alt+Tab).
    await waitFor(() =>
      expect(backend.setWindowTitle).toHaveBeenLastCalledWith("Tesis de magíster — JuTeX"),
    );
  });

  it("un proyecto que ya está en otra ventana no se abre aquí", async () => {
    const { backend } = windowedBackend();
    backend.claimProject.mockResolvedValueOnce(false);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir Tesis de magíster" }));
    await waitFor(() => expect(backend.claimProject).toHaveBeenCalledWith("tesis"));
    expect(useWorkspaces.getState().tabs).toEqual([]);
    expect(useAppStore.getState().route.name).toBe("home");
  });

  it("arrastrada fuera de la ventana, la pestaña pasa a una ventana nueva (guardando antes)", async () => {
    const { backend } = windowedBackend();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir Tesis de magíster" }));
    await screen.findByText(/Este documento es un ejemplo/);
    const saveAll = vi.spyOn(useBuffers.getState(), "saveAll");
    // The new window is asked for before this one goes on to its next tab (both at once).
    let tabsWhenAsked: string[] = [];
    backend.openProjectWindow.mockImplementation(async () => {
      tabsWhenAsked = useWorkspaces.getState().tabs;
    });

    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => data.set(type, value),
      effectAllowed: "",
      dropEffect: "none",
    } as unknown as DataTransfer;
    tabDragStarted({ dataTransfer }, "tesis");
    expect(data.get(TAB_MIME)).toBe("tesis");
    // The pointer leaves the page; nothing takes the drop.
    fireEvent.dragLeave(document, { relatedTarget: null });
    tabDragEnded({ dataTransfer }, "tesis");

    await waitFor(() => expect(backend.openProjectWindow).toHaveBeenCalledWith("tesis"));
    expect(saveAll).toHaveBeenCalled();
    expect(tabsWhenAsked).toEqual(["tesis"]);
    await waitFor(() => expect(useWorkspaces.getState().tabs).toEqual([]));
  });

  it("en Wayland (WebKitGTK informa «move» aunque nadie la tome): fuera de todas las ventanas, a una nueva", async () => {
    const { backend } = windowedBackend();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir Tesis de magíster" }));
    await screen.findByText(/Este documento es un ejemplo/);
    // What the user's Wayland session reported: left the page, released on the desktop.
    const dataTransfer = { setData() {}, dropEffect: "move" } as unknown as DataTransfer;
    tabDragStarted({ dataTransfer }, "tesis");
    fireEvent.dragLeave(document, { relatedTarget: null });
    tabDragEnded({ dataTransfer }, "tesis");
    await waitFor(() => expect(backend.openProjectWindow).toHaveBeenCalledWith("tesis"));
  });

  it("en Wayland, soltada sobre otra ventana de JuTeX: esa la pide y no se abre otra", async () => {
    const { backend, request } = windowedBackend();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir Tesis de magíster" }));
    await screen.findByText(/Este documento es un ejemplo/);
    const dataTransfer = { setData() {}, dropEffect: "move" } as unknown as DataTransfer;
    tabDragStarted({ dataTransfer }, "tesis");
    fireEvent.dragLeave(document, { relatedTarget: null });
    tabDragEnded({ dataTransfer }, "tesis");
    request({ kind: "give", to: "main", id: "tesis", target: "w-2" });
    await waitFor(() => expect(backend.giveProject).toHaveBeenCalledWith("tesis", "w-2"));
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(backend.openProjectWindow).not.toHaveBeenCalled();
  });

  it("soltada dentro de la misma ventana no se mueve", async () => {
    const { backend } = windowedBackend();
    render(<App />);
    const dataTransfer = { setData() {}, dropEffect: "move" } as unknown as DataTransfer;
    tabDragStarted({ dataTransfer }, "tesis");
    tabDragEnded({ dataTransfer }, "tesis");
    expect(backend.openProjectWindow).not.toHaveBeenCalled();
  });

  it("otra ventana pide la pestaña: se cierra aquí y se le entrega", async () => {
    const { backend, request } = windowedBackend();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir Tesis de magíster" }));
    await screen.findByText(/Este documento es un ejemplo/);
    request({ kind: "give", to: "main", id: "tesis", target: "w-2" });
    await waitFor(() => expect(backend.giveProject).toHaveBeenCalledWith("tesis", "w-2"));
    expect(useWorkspaces.getState().tabs).toEqual([]);
    // Requests for another window are not for this one.
    request({ kind: "show", to: "w-9", id: "mecanica" });
    expect(useWorkspaces.getState().tabs).toEqual([]);
  });

  it("menú de la pestaña: a una ventana nueva o a otra ventana", async () => {
    const { backend } = windowedBackend();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir Tesis de magíster" }));
    await screen.findByText(/Este documento es un ejemplo/);
    fireEvent.contextMenu(within(tabStrip()).getByRole("tab", { name: /Tesis/ }));
    // A window is prepared in advance, in case the tab goes to a new one.
    expect(backend.prepareWindow).toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: "Mover a la ventana de Apuntes de Mecánica Clásica",
      }),
    );
    await waitFor(() => expect(backend.giveProject).toHaveBeenCalledWith("tesis", "w-2"));
    expect(tabs()).toEqual(["Inicio"]);
  });

  it("al cerrar la ventana se guarda antes", async () => {
    const { backend, request } = windowedBackend();
    render(<App />);
    await screen.findByRole("button", { name: "Abrir Tesis de magíster" });
    const saveAll = vi.spyOn(useBuffers.getState(), "saveAll");
    request({ kind: "close", to: "main" });
    await waitFor(() => expect(backend.closeWindow).toHaveBeenCalled());
    expect(saveAll).toHaveBeenCalled();
  });
});
