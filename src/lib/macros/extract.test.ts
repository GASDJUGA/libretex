import { describe, expect, it } from "vitest";
import { collectMacros, extractMacros, preambleOf, stripComments } from "./extract";

describe("extractMacros", () => {
  it("las macros reales del usuario (\\ihat, \\jhat)", () => {
    const preamble = String.raw`\newcommand{\ihat}{\boldsymbol{\hat{\textbf{\i}}}}
\newcommand{\jhat}{\boldsymbol{\hat{\textbf{\j}}}}`;
    expect(extractMacros(preamble)).toEqual({
      ihat: String.raw`\boldsymbol{\hat{\textbf{\i}}}`,
      jhat: String.raw`\boldsymbol{\hat{\textbf{\j}}}`,
    });
  });

  it("argumentos, argumento opcional, asterisco y nombre sin llaves", () => {
    const text = String.raw`
\newcommand{\abs}[1]{\left|#1\right|}
\newcommand*{\pd}[2]{\frac{\partial #1}{\partial #2}}
\newcommand{\vect}[1][v]{\mathbf{#1}}
\renewcommand\R{\mathbb{R}}
\providecommand{\N}{\mathbb{N}}`;
    expect(extractMacros(text)).toEqual({
      abs: [String.raw`\left|#1\right|`, 1],
      pd: [String.raw`\frac{\partial #1}{\partial #2}`, 2],
      vect: [String.raw`\mathbf{#1}`, 1, "v"],
      R: String.raw`\mathbb{R}`,
      N: String.raw`\mathbb{N}`,
    });
  });

  it("\\DeclareMathOperator y \\def simples", () => {
    const text = String.raw`\DeclareMathOperator{\tr}{tr}
\DeclareMathOperator*{\argmax}{arg\,max}
\def\e{\mathrm{e}}
\def\par#1#2{(#1, #2)}
\def\raro#2#1{x}`;
    expect(extractMacros(text)).toEqual({
      tr: String.raw`\operatorname{tr}`,
      argmax: String.raw`\operatorname*{arg\,max}`,
      e: String.raw`\mathrm{e}`,
      par: ["(#1, #2)", 2],
    });
  });

  it("llaves anidadas y escapadas en el cuerpo", () => {
    expect(extractMacros(String.raw`\newcommand{\set}[1]{\{ #1 \}}`)).toEqual({
      set: [String.raw`\{ #1 \}`, 1],
    });
  });

  it("ignora comentarios, comandos parecidos y definiciones incompletas", () => {
    const text = String.raw`% \newcommand{\no}{x}
\newcommand{\si}{y} % \newcommand{\tampoco}{z}
\newcommandx{\otro}{w}
\newcommand{\roto}{sin cerrar`;
    expect(extractMacros(text)).toEqual({ si: "y" });
  });

  it("la última definición gana; \\providecommand no reemplaza", () => {
    const text = String.raw`\newcommand{\x}{1}\renewcommand{\x}{2}\providecommand{\x}{3}`;
    expect(extractMacros(text)).toEqual({ x: "2" });
  });
});

describe("preámbulo y archivos incluidos", () => {
  it("stripComments respeta \\%", () => {
    expect(stripComments("50\\% % comentario\nb")).toBe("50\\% \nb");
  });

  it("solo el preámbulo del archivo principal", () => {
    const main = "\\newcommand{\\a}{1}\n\\begin{document}\n\\newcommand{\\b}{2}\n";
    expect(preambleOf(main)).toBe("\\newcommand{\\a}{1}\n");
    expect(collectMacros("main.tex", () => main)).toEqual({ a: "1" });
  });

  it("sigue los \\input del preámbulo, en orden y sin ciclos", () => {
    const files: Record<string, string> = {
      "main.tex":
        "\\newcommand{\\x}{main}\n\\input{preambulo}\n\\newcommand{\\z}{main}\n\\begin{document}\n\\input{cap}\n",
      "preambulo.tex":
        "\\newcommand{\\x}{pre}\n\\newcommand{\\y}{pre}\n\\input{main}\n\\input{otros/mas}\n",
      "otros/mas.tex": "\\newcommand{\\w}{mas}\n",
      "cap.tex": "\\newcommand{\\cap}{no}\n",
    };
    expect(collectMacros("main.tex", (p) => files[p] ?? null)).toEqual({
      x: "pre",
      y: "pre",
      z: "main",
      w: "mas",
    });
  });

  it("un archivo que no se puede leer no rompe nada", () => {
    expect(collectMacros("main.tex", () => null)).toEqual({});
  });
});
