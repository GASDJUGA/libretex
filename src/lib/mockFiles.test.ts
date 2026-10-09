import { describe, expect, it } from "vitest";
import { MockFiles } from "./mockFiles";

const fs = () => new MockFiles({ "main.tex": "Hola", "caps/intro.tex": "Intro", "fig.png": null });

describe("MockFiles (mismas reglas que src-tauri/src/files)", () => {
  it("árbol con carpetas primero", () => {
    expect(
      fs()
        .tree()
        .map((n) => n.name),
    ).toEqual(["caps", "fig.png", "main.tex"]);
  });

  it("lee, escribe y rechaza binarios", () => {
    const f = fs();
    expect(f.read("caps/intro.tex").content).toBe("Intro");
    f.write("caps/intro.tex", "Nuevo");
    expect(f.read("caps/intro.tex").content).toBe("Nuevo");
    expect(() => f.read("fig.png")).toThrow(expect.objectContaining({ code: "notText" }));
  });

  it("protege rutas y no pisa", () => {
    const f = fs();
    expect(() => f.read("../x")).toThrow(expect.objectContaining({ code: "invalidPath" }));
    expect(() => f.rename("", "x")).toThrow(expect.objectContaining({ code: "forbidden" }));
    expect(() => f.createFile("main.tex")).toThrow(
      expect.objectContaining({ code: "alreadyExists" }),
    );
    expect(() => f.move("caps", "caps")).toThrow(expect.objectContaining({ code: "forbidden" }));
  });

  it("renombra, mueve, duplica y borra carpetas con su contenido", () => {
    const f = fs();
    expect(f.rename("caps", "capitulos")).toBe("capitulos");
    expect(f.read("capitulos/intro.tex").content).toBe("Intro");
    f.createFolder("otra");
    expect(f.move("capitulos", "otra")).toBe("otra/capitulos");
    expect(f.duplicate("main.tex")).toBe("main (copia).tex");
    expect(f.duplicate("main.tex")).toBe("main (copia 2).tex");
    f.delete("otra");
    expect(f.tree().map((n) => n.name)).toEqual([
      "fig.png",
      "main (copia 2).tex",
      "main (copia).tex",
      "main.tex",
    ]);
  });
});
