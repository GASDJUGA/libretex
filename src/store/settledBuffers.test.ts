import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialBuffersState, useBuffers } from "./buffers";
import { SETTLE_MS, useSettledBuffers } from "./settledBuffers";

const buffer = (content: string) => ({ content, saved: content });

describe("useSettledBuffers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useBuffers.setState({
      ...initialBuffersState,
      projectId: "p",
      buffers: { "main.tex": buffer("hola") },
    });
  });
  afterEach(() => vi.useRealTimers());

  it("las ediciones llegan cuando se deja de escribir, sin un render por tecla", () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useSettledBuffers();
    });
    const before = renders;
    act(() => {
      for (const text of ["hola m", "hola mu", "hola mun", "hola mundo"]) {
        useBuffers.getState().setContent("main.tex", text);
        vi.advanceTimersByTime(SETTLE_MS - 50);
      }
    });
    expect(result.current["main.tex"].content).toBe("hola");
    expect(renders).toBe(before);
    act(() => vi.advanceTimersByTime(SETTLE_MS));
    expect(result.current["main.tex"].content).toBe("hola mundo");
    expect(renders).toBe(before + 1);
  });

  it("un archivo cargado o cerrado aparece al instante", () => {
    const { result } = renderHook(() => useSettledBuffers());
    act(() => useBuffers.setState((s) => ({ buffers: { ...s.buffers, "cap1.tex": buffer("x") } })));
    expect(Object.keys(result.current).sort()).toEqual(["cap1.tex", "main.tex"]);
    act(() => useBuffers.getState().close("cap1.tex"));
    expect(Object.keys(result.current)).toEqual(["main.tex"]);
  });
});
