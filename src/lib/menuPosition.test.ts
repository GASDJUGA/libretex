import { describe, expect, it } from "vitest";
import { menuPosition } from "./menuPosition";

const viewport = { width: 1000, height: 800 };
const menu = { width: 200, height: 300 };
const trigger = (top: number, left: number) => ({ top, bottom: top + 30, left, right: left + 40 });

describe("menuPosition", () => {
  it("abre hacia abajo alineado al inicio del botón", () => {
    expect(menuPosition(trigger(100, 50), menu, viewport, "start")).toEqual({ top: 134, left: 50 });
  });

  it("alineado al final, el borde derecho coincide con el del botón", () => {
    expect(menuPosition(trigger(100, 500), menu, viewport, "end")).toEqual({ top: 134, left: 340 });
  });

  it("abre hacia arriba si no cabe abajo", () => {
    expect(menuPosition(trigger(700, 50), menu, viewport, "start")).toEqual({ top: 396, left: 50 });
  });

  it("si no cabe ni arriba ni abajo se desplaza para quedar dentro de la ventana", () => {
    const tall = { width: 200, height: 780 };
    // 800 - 8 (margen) - 780 = 12: el borde inferior queda en el margen.
    expect(menuPosition(trigger(300, 50), tall, viewport, "start").top).toBe(12);
  });

  it("no se sale por los lados", () => {
    expect(menuPosition(trigger(100, 950), menu, viewport, "start").left).toBe(792);
    expect(menuPosition(trigger(100, 0), menu, viewport, "end").left).toBe(8);
  });

  it("al lado del botón del riel, desde su borde superior", () => {
    const trigger = { top: 100, bottom: 140, left: 0, right: 48 };
    expect(menuPosition(trigger, { width: 200, height: 150 }, viewport, "right")).toEqual({
      top: 100,
      left: 52,
    });
    // Near the bottom: moved up to fit.
    expect(
      menuPosition(
        { ...trigger, top: 700, bottom: 740 },
        { width: 200, height: 150 },
        viewport,
        "right",
      ),
    ).toEqual({ top: viewport.height - 8 - 150, left: 52 });
  });
});
