import { describe, expect, it } from "vitest";
import { basename, isImage, isWithin, joinPath, parentOf, remap } from "./paths";

describe("paths", () => {
  it("partes de una ruta", () => {
    expect(basename("a/b/c.tex")).toBe("c.tex");
    expect(parentOf("a/b/c.tex")).toBe("a/b");
    expect(parentOf("c.tex")).toBe("");
    expect(joinPath("", "x")).toBe("x");
    expect(joinPath("a", "x")).toBe("a/x");
  });

  it("isWithin no confunde prefijos", () => {
    expect(isWithin("caps/1.tex", "caps")).toBe(true);
    expect(isWithin("caps", "caps")).toBe(true);
    expect(isWithin("capsula.tex", "caps")).toBe(false);
  });

  it("remap tras renombrar o mover", () => {
    expect(remap("caps/1.tex", "caps", "capitulos")).toBe("capitulos/1.tex");
    expect(remap("main.tex", "caps", "capitulos")).toBe("main.tex");
    expect(remap("caps", "caps", "x/caps")).toBe("x/caps");
  });

  it("detecta imágenes", () => {
    expect(isImage("fig/a.PNG")).toBe(true);
    expect(isImage("a.tex")).toBe(false);
  });
});
