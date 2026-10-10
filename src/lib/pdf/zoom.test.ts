import { describe, expect, it } from "vitest";
import { clampZoom, formatZoom, toScaleValue, zoomIn, zoomOut } from "./zoom";

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
