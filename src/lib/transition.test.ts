import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { entranceFor, useEntrance } from "./transition";

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
