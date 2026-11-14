import { beforeEach, describe, expect, it } from "vitest";
import { migrateStorage } from "./storageMigration";

describe("migrateStorage (LibreTeX → JuTeX)", () => {
  beforeEach(() => localStorage.clear());

  it("lo de cada proyecto pasa a la clave nueva con el mismo valor", () => {
    localStorage.setItem("libretex:p:session", '{"tabs":["main.tex"]}');
    migrateStorage(localStorage);
    expect(localStorage.getItem("jutex:p:session")).toBe('{"tabs":["main.tex"]}');
    expect(localStorage.getItem("libretex:p:session")).toBeNull();
  });

  it("también los tamaños de los paneles, que la librería guarda con su propio prefijo", () => {
    localStorage.setItem("react-resizable-panels:libretex:p:main:side:editor:pdf", "[20,40,40]");
    migrateStorage(localStorage);
    expect(localStorage.getItem("react-resizable-panels:jutex:p:main:side:editor:pdf")).toBe(
      "[20,40,40]",
    );
    expect(
      localStorage.getItem("react-resizable-panels:libretex:p:main:side:editor:pdf"),
    ).toBeNull();
  });

  it("si la clave nueva ya existe, se conserva y la vieja se borra", () => {
    localStorage.setItem("jutex:p:session", "nueva");
    localStorage.setItem("libretex:p:session", "vieja");
    migrateStorage(localStorage);
    expect(localStorage.getItem("jutex:p:session")).toBe("nueva");
    expect(localStorage.getItem("libretex:p:session")).toBeNull();
  });

  it("deja los ajustes viejos de octubre, que lee su propia migración", () => {
    localStorage.setItem("libretex:settings", '{"editorTheme":"dark"}');
    migrateStorage(localStorage);
    expect(localStorage.getItem("libretex:settings")).toBe('{"editorTheme":"dark"}');
    expect(localStorage.getItem("jutex:settings")).toBeNull();
  });

  it("no toca claves ajenas", () => {
    localStorage.setItem("otra:cosa", "1");
    localStorage.setItem("xlibretex:p", "2");
    migrateStorage(localStorage);
    expect(localStorage.getItem("otra:cosa")).toBe("1");
    expect(localStorage.getItem("xlibretex:p")).toBe("2");
  });

  it("un almacenamiento bloqueado no impide arrancar", () => {
    const blocked = {
      get length(): number {
        throw new Error("SecurityError");
      },
    } as unknown as Storage;
    expect(() => migrateStorage(blocked)).not.toThrow();
  });
});
