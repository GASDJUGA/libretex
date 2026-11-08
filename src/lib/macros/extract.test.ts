import { describe, expect, it } from "vitest";
import {
  collectMacros,
  extractMacros,
  preambleOf,
  stripComments,
  extractFontFamilies,
} from "./extract";

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

  it("los comentarios del preámbulo no cortan la última macro (\\pvec del usuario)", () => {
    const main = [
      "\\documentclass[11pt,a4paper]{article}",
      "",
      "% Idioma y fuentes (compilar con XeLaTeX)",
      "\\usepackage{fontspec}",
      "% Matemáticas, figuras y enlaces",
      "\\usepackage{amsmath, amssymb}",
      "",
      "\\newcommand{\\pvec}[1]{\\vec{#1}\\mkern2mu\\vphantom{#1}}",
      "",
      "\\title{Guía I2}",
      "\\begin{document}",
      "x",
      "\\end{document}",
    ].join("\n");
    expect(preambleOf(main)).toBe(main.slice(0, main.indexOf("\\begin{document}")));
    expect(collectMacros("main.tex", () => main)).toEqual({
      pvec: ["\\vec{#1}\\mkern2mu\\vphantom{#1}", 1],
    });
  });
});

/** The script r of Griffiths, as the user wrote it (fontspec + a font of the system). */
const GRIFFITHS = String.raw`
\newfontfamily{\griffiths}{Kaufmann Regular}[%
  Scale    = MatchLowercase,%
  BoldFont = Kaufmann Bold,%
]%
% r cursiva normal
\DeclareRobustCommand{\rc}{\mathord{\text{\normalfont\griffiths r}}}
% r cursiva en negrita (el vector)
\DeclareRobustCommand{\brc}{\mathord{\text{\normalfont\griffiths\bfseries r}}}
\newfontfamily\sans{Fira Sans}
\newcommand{\etiqueta}{\text{\sans A}}
`;

describe("fuentes propias", () => {
  it("\\DeclareRobustCommand se lee como \\newcommand", () => {
    expect(extractMacros(String.raw`\DeclareRobustCommand{\v}[1]{\mathbf{#1}}`)).toEqual({
      v: [String.raw`\mathbf{#1}`, 1],
    });
  });

  it("las familias de fontspec, con las de guion reconocidas por su nombre", () => {
    expect(extractFontFamilies(GRIFFITHS)).toEqual({ griffiths: "script", sans: "text" });
  });

  it("la r de Griffiths se ve como \\mathscr en el preview (en negrita con \\boldsymbol)", () => {
    const macros = collectMacros("main.tex", () => GRIFFITHS);
    expect(macros.rc).toBe(String.raw`\mathord{\mathscr{r}}`);
    expect(macros.brc).toBe(String.raw`\mathord{\boldsymbol{\mathscr{r}}}`);
    // Another font of the system stays as text; its command means nothing to the preview.
    expect(macros.etiqueta).toBe(String.raw`\text{\sans A}`);
    expect(macros.sans).toBe("");
  });
});
