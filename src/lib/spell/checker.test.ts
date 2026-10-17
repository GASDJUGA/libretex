import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { directChecker } from "./checker";
import { createSpeller, rankSuggestions, typingDistance } from "./speller";

const dictionary = (lang: string) =>
  createSpeller(
    readFileSync(`node_modules/dictionary-${lang}/index.aff`, "utf8"),
    readFileSync(`node_modules/dictionary-${lang}/index.dic`, "utf8"),
  );

const es = dictionary("es");
const en = dictionary("en");

describe("verificador ortográfico", () => {
  it("español: acepta palabras y formas comunes, marca errores y sugiere", async () => {
    const checker = directChecker(es);
    expect(
      await checker.wrong([
        "El",
        "campo",
        "eléctrico",
        "ecuacion",
        "Calculamos",
        "partículas",
        "vectoress",
      ]),
    ).toEqual(["ecuacion", "vectoress"]);
    expect((await checker.suggest("ecuacion"))[0]).toBe("ecuación");
    // Answers are kept.
    expect(checker.known("campo")).toBe(true);
    expect(checker.known("ecuacion")).toBe(false);
  });

  it("inglés", async () => {
    const checker = directChecker(en);
    expect(await checker.wrong(["The", "electric", "field", "teh"])).toEqual(["teh"]);
    expect((await checker.suggest("teh"))[0]).toBe("the");
  });

  it("el diccionario personal también vale (y se puede quitar)", async () => {
    const checker = directChecker(dictionary("es"));
    expect(await checker.wrong(["autovalores", "Kirchhoff"])).toEqual(["autovalores", "Kirchhoff"]);
    checker.setPersonal(["autovalores", "Kirchhoff"]);
    expect(await checker.wrong(["autovalores", "Kirchhoff"])).toEqual([]);
    checker.setPersonal(["Kirchhoff"]);
    expect(await checker.wrong(["autovalores", "Kirchhoff"])).toEqual(["autovalores"]);
  });
});

describe("orden de las sugerencias", () => {
  it("primero lo que más se parece al escribir", () => {
    expect(typingDistance("teh", "the")).toBe(0.5);
    expect(typingDistance("ecuacion", "ecuación")).toBe(0.25);
    expect(typingDistance("ten", "the")).toBe(2);
    expect(rankSuggestions("teh", ["ten", "eh", "tea", "the"])[0]).toBe("the");
  });
});
