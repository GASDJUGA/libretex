import { describe, expect, it } from "vitest";
import { fold, locateWord, wordAt, wordBounds } from "./sourceWord";

const source = [
  "\\section{Resultados}", // 1
  "Segunda página con la palabra clave \\emph{murciélago} para la búsqueda.", // 2
  "El murciélago vuela de noche; el murciélago come insectos.", // 3
  "", // 4
  "La ﬁgura muestra el campo eléctrico~$\\vec{E}$ y la carga.", // 5
];

/** The text of the line and range found. */
const found = (line: number, text: string, before = "", after = "") => {
  const at = locateWord(source, line, { text, before, after });
  return at && [at.line + 1, source[at.line].slice(at.from, at.to)];
};

describe("fold", () => {
  it("quita tildes, mayúsculas y ligaduras, y recuerda las posiciones", () => {
    const { text, map } = fold("Él ﬁjó");
    expect(text).toBe("el fijo");
    // «f» and «i» both come from the ligature at index 3.
    expect(map.slice(3, 5)).toEqual([3, 3]);
    expect(map[5]).toBe(4);
  });
});

describe("wordAt", () => {
  it("la palabra del doble clic con sus vecinas", () => {
    const line = "el murciélago come insectos";
    expect(wordAt(line, 3, "murciélago")).toEqual({
      text: "murciélago",
      before: "el ",
      after: " come insectos",
    });
  });

  it("quita el guion de una palabra cortada y descarta selecciones sin letras", () => {
    expect(wordAt("murcié-", 0, "murcié-")?.text).toBe("murcié");
    expect(wordAt("a = b", 2, "=")).toBeNull();
    expect(wordAt("texto", 0, "  ")).toBeNull();
  });
});

describe("wordBounds", () => {
  it("la palabra bajo el puntero, con tildes", () => {
    const text = "el murciélago, vuela";
    const { start, end } = wordBounds(text, 6);
    expect(text.slice(start, end)).toBe("murciélago");
    expect(wordBounds(text, 13)).toEqual({ start: 3, end: 13 });
    expect(wordBounds(text, 14)).toEqual({ start: 14, end: 14 });
  });
});

describe("locateWord", () => {
  it("encuentra la palabra dentro de comandos, sin tildes ni mayúsculas", () => {
    expect(found(2, "MURCIELAGO")).toEqual([2, "murciélago"]);
  });

  it("entre repeticiones elige la que tiene las mismas vecinas", () => {
    // SyncTeX says line 2, but the clicked one is the second of line 3 («el … come»).
    expect(found(2, "murciélago", "noche; el ", " come insectos")).toEqual([3, "murciélago"]);
    const second = locateWord(source, 2, { text: "murciélago", before: "el ", after: " come" });
    expect(second?.from).toBe(source[2].lastIndexOf("murciélago"));
  });

  it("sin contexto, la más cercana a la línea de SyncTeX", () => {
    expect(found(3, "murciélago")?.[0]).toBe(3);
    expect(found(1, "murciélago")?.[0]).toBe(2);
  });

  it("ligaduras del PDF y palabras enteras", () => {
    expect(found(5, "figura")).toEqual([5, "ﬁgura"]);
    // «la» as a whole word, not inside «palabra».
    const at = locateWord(source, 5, { text: "la", before: "", after: " carga" });
    expect(source[at!.line].slice(at!.from - 1, at!.to + 6)).toBe(" la carga");
  });

  it("si no está, null (y el editor va al comienzo de la línea)", () => {
    expect(found(2, "ornitorrinco")).toBeNull();
    expect(locateWord([], 1, { text: "x", before: "", after: "" })).toBeNull();
  });
});
