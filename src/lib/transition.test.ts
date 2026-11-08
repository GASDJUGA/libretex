import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { entranceFor, playOnFirstFrame, useEntrance } from "./transition";

describe("entrada de una vista", () => {
  it("viene del lado de la que reemplaza", () => {
    expect(entranceFor(null, 2)).toBe("none");
    expect(entranceFor(0, 2)).toBe("forward");
    expect(entranceFor(2, 0)).toBe("back");
    // Home is −1: going to the first project comes from the right.
    expect(entranceFor(-1, 0)).toBe("forward");
  });

  it("cambia solo cuando cambia la vista", () => {
    const { result, rerender } = renderHook(({ key, order }) => useEntrance(key, order), {
      initialProps: { key: "home", order: -1 },
    });
    expect(result.current).toBe("none");
    act(() => rerender({ key: "project:b", order: 1 }));
    expect(result.current).toBe("forward");
    // The same view re-rendered (its tab moved): no new entrance.
    act(() => rerender({ key: "project:b", order: 0 }));
    expect(result.current).toBe("forward");
    act(() => rerender({ key: "home", order: -1 }));
    expect(result.current).toBe("back");
  });
});

describe("animación de entrada hasta el primer cuadro", () => {
  it("queda en pausa hasta que se dibuja", async () => {
    const view = document.createElement("div");
    view.className = "lt-view-forward lt-hold";
    playOnFirstFrame(view);
    expect(view.classList.contains("lt-hold")).toBe(true);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(view.classList.contains("lt-hold")).toBe(false);
  });

  it("nunca queda invisible: sin cuadros, arranca igual", () => {
    vi.useFakeTimers();
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockReturnValue(1);
    const view = document.createElement("div");
    view.className = "lt-section-forward lt-hold";
    playOnFirstFrame(view);
    vi.advanceTimersByTime(500);
    expect(view.classList.contains("lt-hold")).toBe(false);
    raf.mockRestore();
    vi.useRealTimers();
  });
});
