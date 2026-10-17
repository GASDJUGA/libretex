import { describe, expect, it } from "vitest";
import { proseWords } from "./words";

const words = (text: string) => proseWords(text).map((w) => w.word);

describe("palabras que revisa la ortografía", () => {
  it("prosa con tildes y apóstrofos; posiciones en el texto", () => {
    const text = "El campo eléctrico, don't l’eau.";
    expect(words(text)).toEqual(["El", "campo", "eléctrico", "don't", "l’eau"]);
    const [, campo] = proseWords(text);
    expect(text.slice(campo.from, campo.to)).toBe("campo");
  });

  it("ni comandos ni matemáticas ni comentarios", () => {
    expect(
      words(
        "\\section{Introducción} Sea $\\vec{v} = a\\ihat$ y \\[ \\frac{x}{y} \\] fin % comentario malo\n" +
          "\\begin{align*} x &= \\text{palabra} \\end{align*} otra",
      ),
    ).toEqual(["Introducción", "Sea", "fin", "otra"]);
  });

  it("los argumentos con nombres no son prosa, los de texto sí", () => {
    expect(
      words(
        "\\label{sec:intro} ver \\ref{sec:intro} y \\cite[p.~3]{knuth1984} " +
          "\\usepackage[spanish]{babel} \\includegraphics[width=0.8\\linewidth]{figuras/montaje} " +
          "\\textbf{negrita} \\emph{énfasis} \\caption[corta]{Leyenda larga} \\href{https://x.org}{sitio}",
      ),
    ).toEqual(["ver", "negrita", "énfasis", "Leyenda", "larga", "sitio"]);
  });

  it("entornos: el nombre y sus parámetros no; el contenido de código tampoco", () => {
    expect(
      words(
        "\\begin{figure}[htbp] \\centering texto \\end{figure} " +
          "\\begin{tabular}{|c|l|} Medición & Resultado \\\\ \\end{tabular} " +
          "\\begin{verbatim} codigo raro \\end{verbatim} " +
          "\\begin{tikzpicture} \\node[draw] {nodo}; \\end{tikzpicture} \\verb|literal| \\lstinline{x} final",
      ),
    ).toEqual(["texto", "Medición", "Resultado", "final"]);
  });

  it("siglas, nombres con mayúsculas internas, letras sueltas y trozos de acentos", () => {
    expect(words("El PDF de LaTeX y XeLaTeX: a b Introducci\\'on bien")).toEqual([
      "El",
      "de",
      "bien",
    ]);
  });

  it("palabras pegadas a números o guiones bajos no se revisan", () => {
    expect(words("x2 a_b paso 3a figura")).toEqual(["paso", "figura"]);
  });

  it("un salto de línea \\\\ no se lleva la palabra anterior", () => {
    expect(words("primera\\\\segunda línea")).toEqual(["primera", "línea"]);
  });
});

describe("comandos con nombres y luego texto", () => {
  it("\\href, \\textcolor, \\multicolumn", () => {
    expect(
      words("\\href{https://x.org}{sitio} \\textcolor{red}{rojo} \\multicolumn{2}{c}{Título}"),
    ).toEqual(["sitio", "rojo", "Título"]);
  });
});
