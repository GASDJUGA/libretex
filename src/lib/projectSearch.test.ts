import { describe, expect, it } from "vitest";
import type { SearchQuery } from "../store/types";
import { findInText, MAX_MATCHES, replaceText, searchFiles, searchRegExp } from "./projectSearch";

const query = (text: string, options: Partial<SearchQuery> = {}): SearchQuery => ({
  text,
  regex: false,
  caseSensitive: false,
  wholeWord: false,
  ...options,
});

const found = (q: SearchQuery, text: string) =>
  findInText(searchRegExp(q), text, 100).map((m) => [m.line, m.column, m.endLine, m.endColumn]);

// The same cases as src-tauri/src/files/search.rs: the preview behaves like the app.
describe("búsqueda en el proyecto (vista previa)", () => {
  it("texto literal, mayúsculas y caracteres especiales", () => {
    const text = "Campo eléctrico\nEL CAMPO y el campo.";
    expect(found(query("campo"), text)).toEqual([
      [1, 0, 1, 5],
      [2, 3, 2, 8],
      [2, 14, 2, 19],
    ]);
    expect(found(query("campo", { caseSensitive: true }), text)).toEqual([[2, 14, 2, 19]]);
    expect(found(query("$x^2$"), "a $x^2$ b")).toEqual([[1, 2, 1, 7]]);
  });

  it("columnas en unidades UTF-16 y CRLF", () => {
    const text = "é𝐱 tensión\r\ntensión";
    expect(found(query("tensión"), text)).toEqual([
      [1, 4, 1, 11],
      [2, 0, 2, 7],
    ]);
    const [m] = findInText(searchRegExp(query("tensión")), text, 10);
    expect([m.before, m.text, m.after]).toEqual(["é𝐱 ", "tensión", ""]);
  });

  it("palabra completa, también comandos y letras con tilde", () => {
    const whole = (t: string) => query(t, { wholeWord: true });
    expect(found(whole("vec"), "\\vec{v} vector v_vec vec")).toEqual([
      [1, 1, 1, 4],
      [1, 21, 1, 24],
    ]);
    expect(found(whole("\\frac"), "\\frac{1}{2} \\fracs")).toEqual([[1, 0, 1, 5]]);
    expect(found(whole("tensi"), "tensión tensi")).toEqual([[1, 8, 1, 13]]);
  });

  it("expresiones regulares: por línea, entre líneas, vacías y no válidas", () => {
    expect(found(query("^%", { regex: true }), "a % b\n% c\n%d")).toEqual([
      [2, 0, 2, 1],
      [3, 0, 3, 1],
    ]);
    expect(found(query("a\\s+b", { regex: true }), "xa\n  b")).toEqual([[1, 1, 2, 3]]);
    expect(found(query("x*", { regex: true }), "ab x")).toEqual([[1, 3, 1, 4]]);
    expect(() => searchRegExp(query("(sin cerrar", { regex: true }))).toThrow();
    expect(() => searchRegExp(query(""))).toThrow();
  });

  it("solo archivos del usuario, ordenados, con límite", () => {
    const results = searchFiles(
      [
        ["main.tex", "campo"],
        ["capitulos/a.tex", "Campo y campo"],
        ["main.log", "campo"],
        [".jutex/x.tex", "campo"],
      ],
      query("campo"),
    );
    expect(results.files.map((f) => [f.path, f.matches.length])).toEqual([
      ["capitulos/a.tex", 2],
      ["main.tex", 1],
    ]);
    const many = searchFiles(
      [
        ["a.tex", "x\n".repeat(MAX_MATCHES)],
        ["b.tex", "x x"],
      ],
      query("x"),
    );
    expect(many.truncated).toBe(true);
    expect(many.files.reduce((n, f) => n + f.matches.length, 0)).toBe(MAX_MATCHES);
  });

  it("reemplazo literal y con grupos", () => {
    expect(replaceText("Campo, campo y $campo$.", query("campo"), "$E$")).toEqual({
      text: "$E$, $E$ y $$E$$.",
      count: 3,
    });
    expect(
      replaceText(
        "\\textbf{a} y \\textbf{b c}",
        query("\\\\textbf\\{([^}]*)\\}", { regex: true, caseSensitive: true }),
        "\\emph{$1}",
      ).text,
    ).toBe("\\emph{a} y \\emph{b c}");
  });
});
