import { describe, expect, it } from "vitest";
import {
  visibleArea,
  axisTranslate,
  clampZoom,
  cssTransform,
  IDENTITY,
  underPoint,
  fitScale,
  formatZoom,
  toScaleValue,
  wheelZoomFactor,
  zoomIn,
  zoomOut,
} from "./zoom";

describe("zoom del visor PDF", () => {
  it("acercar y alejar van al paso siguiente", () => {
    expect(zoomIn(1)).toBe(1.1);
    expect(zoomOut(1)).toBe(0.9);
    // From a scale computed by «fit to width» (not a step).
    expect(zoomIn(1.137)).toBe(1.25);
    expect(zoomOut(1.137)).toBe(1.1);
    // Rounding noise does not skip a step.
    expect(zoomIn(1.0999)).toBe(1.25);
  });

  it("no pasa de los límites", () => {
    expect(zoomIn(4)).toBe(4);
    expect(zoomOut(0.25)).toBe(0.25);
    expect(clampZoom(10)).toBe(4);
    expect(clampZoom(0.01)).toBe(0.25);
  });

  it("formato y valor para pdf.js", () => {
    expect(formatZoom(1.25)).toBe("125\u00a0%");
    expect(formatZoom(0.6667)).toBe("67\u00a0%");
    expect(toScaleValue("page-width")).toBe("page-width");
    expect(toScaleValue(1.5)).toBe("1.5");
    expect(toScaleValue(9)).toBe("4");
  });
});

describe("ajustes, origen y rueda", () => {
  it("ajustar al ancho y a la página como pdf.js", () => {
    // A4 page view at scale 1: 794×1123 CSS px.
    const page = { width: 794, height: 1123, scale: 1 };
    expect(fitScale("page-width", { width: 834, height: 600 }, page)).toBeCloseTo(1);
    expect(fitScale("page-fit", { width: 834, height: 600 }, page)).toBeCloseTo(595 / 1123);
    // The same at another current scale.
    const zoomed = { width: 1588, height: 2246, scale: 2 };
    expect(fitScale("page-width", { width: 834, height: 600 }, zoomed)).toBeCloseTo(1);
  });

  it("una muesca de la rueda es un 10 %; el touchpad, pasos pequeños", () => {
    expect(wheelZoomFactor(-100)).toBeCloseTo(1.1);
    expect(wheelZoomFactor(100)).toBeCloseTo(1 / 1.1);
    expect(wheelZoomFactor(-3, 1)).toBeCloseTo(Math.pow(1.1, 0.99));
    expect(wheelZoomFactor(-4)).toBeGreaterThan(1);
    expect(wheelZoomFactor(-4)).toBeLessThan(1.01);
    expect(wheelZoomFactor(-5000)).toBe(1.5);
  });

  it("zoom visual: la transformación y el punto de contenido bajo el mouse", () => {
    const t = { k: 2, tx: -100, ty: 50 };
    expect(underPoint(IDENTITY, { x: 30, y: 40 })).toEqual({ x: 30, y: 40 });
    expect(underPoint(t, { x: 100, y: 250 })).toEqual({ x: 100, y: 100 });
    expect(cssTransform(t)).toBe("translate(-100px, 50px) scale(2)");
  });

  it("zoom visual: anticipa el centrado y los bordes del documento", () => {
    // View 800 px; pages 600 px wide from x = 100 (centered), no scroll.
    const x = { start: 100, length: 600, view: 800, scroll: 0, offset: 0, center: true };
    // k = 1: nothing moves.
    expect(axisTranslate(x, 1, 400, 400)).toBeCloseTo(0);
    // Zooming out to 0.5: the pages (300 px) end up centered, wherever the pointer was.
    const t = axisTranslate(x, 0.5, 150, 50);
    expect(t + 0.5 * 100).toBeCloseTo(250); // left edge at (800 - 300) / 2
    // Zooming in (2×) around x = 400: the point stays (scroll can reach it).
    expect(axisTranslate(x, 2, 400, 400) + 2 * 400).toBeCloseTo(400);
    // Wider than the view, the pages start at 0 and scroll can't pass their right edge:
    // 1.5× around x = 650 (pointer at 700) leaves that point at 725.
    expect(axisTranslate(x, 1.5, 650, 700) + 1.5 * 650).toBeCloseTo(725);
    // Vertical axis, near the top: never centered, scroll stops at 0.
    const y = { start: 12, length: 5000, view: 900, scroll: 0, offset: 0, center: false };
    expect(axisTranslate(y, 0.5, 300, 300) + 0.5 * 12).toBeCloseTo(12);
    // In the middle of the document, the point stays.
    const mid = { ...y, scroll: 2000 };
    expect(axisTranslate(mid, 1.5, 2400, 400) + 1.5 * 2400 - 2000).toBeCloseTo(400);
  });

  it("zoom visual: los márgenes entre páginas no se escalan", () => {
    // Page 4 of pages 1000 px tall with 30 px of margins/borders each (stride 1030).
    const y = { start: 12, length: 50000, view: 900, scroll: 3000, offset: 0, center: false };
    const content = 12 + 3 * 1030 + 400; // inside page 4
    const k = 0.5;
    // After zooming, page 4 starts at 12 + 3 · (500 + 30) and the point is 200 px below.
    const final = 12 + 3 * 530 + 200;
    const t = axisTranslate({ ...y, fixedBefore: 3 * 30 }, k, content, 450);
    const scroll = Math.min(Math.max(final - 450, 0), 2 * 12 + k * 50000 - 900);
    expect(t + k * content - 3000).toBeCloseTo(final - scroll);
  });
});

describe("lo que se ve durante el zoom visual", () => {
  const view = { scrollLeft: 0, scrollTop: 1000, clientWidth: 800, clientHeight: 600 };
  const offset = { left: 0, top: 12 };

  it("sin zoom, la vista de siempre (desde el elemento de las páginas)", () => {
    expect(visibleArea(view, offset, { k: 1, tx: 0, ty: 0 })).toEqual({
      scrollLeft: 0,
      scrollTop: 988,
      clientWidth: 800,
      clientHeight: 600,
    });
  });

  it("alejando a la mitad se ve el doble de páginas", () => {
    // screen = offset + t + k·p − scroll: the top of the view shows p = (1000 − 12 − 400) / 0.5.
    const area = visibleArea(view, offset, { k: 0.5, tx: 100, ty: 400 });
    expect(area).toEqual({
      scrollLeft: -200,
      scrollTop: 1176,
      clientWidth: 1600,
      clientHeight: 1200,
    });
    // A point at the top of the view in the area is on screen at y = 0.
    expect(offset.top + 400 + 0.5 * area.scrollTop - view.scrollTop).toBe(0);
  });
});
