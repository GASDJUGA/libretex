import { describe, expect, it } from "vitest";
import { dictionaries, translate, type TranslationKey } from ".";

function leafPaths(node: unknown, prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
    leafPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe("diccionarios", () => {
  const es = leafPaths(dictionaries.es).sort();
  const en = leafPaths(dictionaries.en).sort();

  it("es y en tienen exactamente las mismas claves", () => {
    expect(en).toEqual(es);
  });

  it("cada traducción usa los mismos marcadores {…}", () => {
    for (const path of es) {
      const key = path as TranslationKey;
      const get = (d: unknown) =>
        path.split(".").reduce((n, p) => (n as Record<string, unknown>)[p], d) as string;
      expect(placeholders(get(dictionaries.en)), key).toEqual(placeholders(get(dictionaries.es)));
    }
  });

  it("no hay textos vacíos", () => {
    for (const path of es) {
      const value = path
        .split(".")
        .reduce<unknown>((n, p) => (n as Record<string, unknown>)[p], dictionaries.en);
      expect(String(value).trim(), path).not.toBe("");
    }
  });
});

describe("translate", () => {
  it("traduce según el idioma", () => {
    expect(translate("es", "menu.file")).toBe("Archivo");
    expect(translate("en", "menu.file")).toBe("File");
  });

  it("interpola parámetros", () => {
    expect(translate("es", "projects.open", { name: "Tesis" })).toBe("Abrir Tesis");
    expect(translate("en", "pdf.page", { page: 3 })).toBe("Page 3");
  });

  it("deja intactos los marcadores sin valor", () => {
    expect(translate("es", "projects.open", {})).toBe("Abrir {name}");
  });

  it("elige la forma plural", () => {
    expect(translate("es", "projects.count", { count: 1 })).toBe("1 proyecto");
    expect(translate("es", "projects.count", { count: 0 })).toBe("0 proyectos");
    expect(translate("en", "projects.count", { count: 2 })).toBe("2 projects");
  });

  it("devuelve la clave si no existe", () => {
    expect(translate("en", "no.existe" as TranslationKey)).toBe("no.existe");
  });
});
