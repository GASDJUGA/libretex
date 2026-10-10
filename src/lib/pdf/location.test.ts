import { afterEach, describe, expect, it, vi } from "vitest";
import { cssRect, pdfToSyncTex, restoreDestination, syncTexToPdf, whenRendered } from "./location";

describe("restoreDestination", () => {
  it("vuelve al mismo punto de la misma página sin cambiar el zoom", () => {
    expect(restoreDestination({ pageNumber: 2, left: 30, top: 700 }, 5)).toEqual({
      pageNumber: 2,
      destArray: [null, { name: "XYZ" }, 30, 700, null],
      allowNegativeOffset: true,
      ignoreDestinationZoom: true,
    });
  });

  it("si el documento nuevo tiene menos páginas, va a la última", () => {
    expect(restoreDestination({ pageNumber: 9, left: 0, top: 0 }, 3).pageNumber).toBe(3);
    expect(restoreDestination({ pageNumber: 0, left: 0, top: 0 }, 3).pageNumber).toBe(1);
  });
});

describe("whenRendered", () => {
  afterEach(() => vi.useRealTimers());

  /** Minimal pdf.js-like event bus. */
  function bus() {
    const listeners = new Set<(e: { pageNumber: number }) => void>();
    return {
      on: (_: string, l: (e: { pageNumber: number }) => void) => listeners.add(l),
      off: (_: string, l: (e: { pageNumber: number }) => void) => listeners.delete(l),
      emit: (pageNumber: number) => [...listeners].forEach((l) => l({ pageNumber })),
      size: () => listeners.size,
    };
  }

  it("espera a que se dibuje la página pedida", async () => {
    const b = bus();
    let done = false;
    const promise = whenRendered(b, 2, 5000).then(() => (done = true));
    b.emit(1);
    await Promise.resolve();
    expect(done).toBe(false);
    b.emit(2);
    await promise;
    expect(done).toBe(true);
    expect(b.size()).toBe(0);
  });

  it("no se queda esperando si la página tarda demasiado", async () => {
    vi.useFakeTimers();
    const b = bus();
    const promise = whenRendered(b, 1, 1500);
    vi.advanceTimersByTime(1500);
    await promise;
    expect(b.size()).toBe(0);
  });
});

describe("coordenadas de SyncTeX", () => {
  const a4 = [0, 0, 595.28, 841.89];

  it("SyncTeX mide desde arriba; el PDF, desde abajo", () => {
    const close = (actual: number[], expected: number[]) =>
      actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]));
    close(syncTexToPdf(100, 41.89, a4), [100, 800]);
    close(pdfToSyncTex(100, 800, a4), [100, 41.89]);
    // A page box that does not start at the origin.
    expect(syncTexToPdf(10, 10, [20, 30, 620, 870])).toEqual([30, 860]);
    expect(pdfToSyncTex(30, 860, [20, 30, 620, 870])).toEqual([10, 10]);
  });

  it("rectángulo CSS en la página con el conversor de pdf.js", () => {
    // pdf.js at scale 2 without rotation: CSS x = 2·x, CSS y = 2·(height − y).
    const toViewport = (x: number, y: number) => [2 * x, 2 * (841.89 - y)];
    const rect = cssRect({ left: 72, top: 100, width: 300, height: 12 }, a4, toViewport);
    expect(rect.left).toBeCloseTo(144);
    expect(rect.top).toBeCloseTo(200);
    expect(rect.width).toBeCloseTo(600);
    expect(rect.height).toBeCloseTo(24);
  });
});
