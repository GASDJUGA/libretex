import { describe, expect, it } from "vitest";
import {
  clampZoom,
  fitScale,
  formatZoom,
  toScaleValue,
  wheelZoomFactor,
  zoomIn,
  zoomOrigin,
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

  it("el punto bajo el mouse, en las coordenadas que espera pdf.js", () => {
    // Container at (700, 90) on screen, offsetTop/Left (0, 0) inside its parent.
    expect(zoomOrigin({ x: 900, y: 300 }, { left: 700, top: 90 }, [0, 0])).toEqual([200, 210]);
    // pdf.js subtracts containerTopLeft = [top, left].
    expect(zoomOrigin({ x: 900, y: 300 }, { left: 700, top: 90 }, [40, 10])).toEqual([210, 250]);
  });

  it("una muesca de la rueda es un 10 %; el touchpad, pasos pequeños", () => {
    expect(wheelZoomFactor(-100)).toBeCloseTo(1.1);
    expect(wheelZoomFactor(100)).toBeCloseTo(1 / 1.1);
    expect(wheelZoomFactor(-3, 1)).toBeCloseTo(Math.pow(1.1, 0.99));
    expect(wheelZoomFactor(-4)).toBeGreaterThan(1);
    expect(wheelZoomFactor(-4)).toBeLessThan(1.01);
    expect(wheelZoomFactor(-5000)).toBe(1.5);
  });
});
