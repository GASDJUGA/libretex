import { describe, expect, it } from "vitest";
import { checkLatex } from "./check";

/** Codes and the text each problem points at. */
const found = (text: string) =>
  checkLatex(text).map((p) => [p.code, text.slice(p.from, p.to)] as const);

describe("checkLatex", () => {
  it("un documento correcto no tiene problemas", () => {
    const doc = String.raw`\documentclass{article}
\usepackage[spanish]{babel}
\newcommand{\ihat}{\boldsymbol{\hat{\textbf{\i}}}}
\newcommand{\jhat}{\boldsymbol{\hat{\textbf{\j}}}}
\newenvironment{caja}{\begin{center}\itshape}{\end{center}}
\newcommand{\be}{\begin{equation}}
\def\pesos#1{\$#1}
\begin{document}
\section{Introducción}
Cuesta \$100 y el 50\,\% de $x^2$ es $\frac{x^2}{2}$. % un comentario con { y $
\[ \ihat + \jhat \text{ si $x>0$} \]
\begin{align*}
  a &= b \\[2pt]
  c &= \left\{ d \right.
\end{align*}
Ver \url{https://ejemplo.org/a%20b} y \verb|{$| o \lstinline{x = {1}}.
\begin{verbatim}
  { $ \begin{itemize}
\end{verbatim}
$x$$y$ y $$ z $$ y \(w\).
\end{document}
`;
    expect(found(doc)).toEqual([]);
  });

  it("llaves sin cerrar y sin abrir", () => {
    expect(found(String.raw`\textbf{hola \emph{mundo}`)).toEqual([["unclosedBrace", "{"]]);
    const text = "a}b";
    expect(checkLatex(text)).toEqual([{ code: "extraBrace", from: 1, to: 2 }]);
  });

  it("entornos sin cerrar, sobrantes y cruzados", () => {
    expect(found(String.raw`\begin{itemize} \item a`)).toEqual([
      ["unclosedEnv", String.raw`\begin{itemize}`],
    ]);
    expect(found(String.raw`texto \end{center}`)).toEqual([["extraEnd", String.raw`\end{center}`]]);
    const crossed = String.raw`\begin{figure}\begin{center}x\end{figure}`;
    expect(checkLatex(crossed)).toEqual([
      expect.objectContaining({ code: "mismatchedEnv", name: "figure", expected: "center" }),
    ]);
  });

  it("una fórmula sin cerrar se marca en su apertura y no afecta al párrafo siguiente", () => {
    const text = "La masa $m = 3 kg.\n\nOtro párrafo con $x$ bien.";
    expect(checkLatex(text)).toEqual([
      { code: "unclosedMath", from: 8, to: 9, open: "$", close: "$" },
    ]);
    expect(found(String.raw`\[ a + b`)).toEqual([["unclosedMath", String.raw`\[`]]);
  });

  it("delimitadores de fórmula cruzados o sobrantes", () => {
    expect(checkLatex(String.raw`\( a \]`)).toEqual([
      expect.objectContaining({ code: "mismatchedMath", open: "\\(", expected: "\\)" }),
    ]);
    expect(found(String.raw`texto \] más`)).toEqual([["extraMathClose", String.raw`\]`]]);
  });

  it("lo que está en comentarios, \\verb o verbatim no cuenta", () => {
    expect(found("% \\begin{itemize} {\n\\verb+}+ texto")).toEqual([]);
    expect(found("\\begin{lstlisting}\n}}}\n\\end{lstlisting}")).toEqual([]);
    expect(found("\\begin{verbatim}\nsin fin")).toEqual([
      ["unclosedEnv", String.raw`\begin{verbatim}`],
    ]);
  });

  it("los problemas salen en orden del documento", () => {
    const problems = checkLatex("{ \\begin{x} }");
    expect(problems.map((p) => p.code)).toEqual(["unclosedEnv"]);
    const many = checkLatex("} $a\n\n\\end{y} {");
    expect(many.map((p) => p.code)).toEqual([
      "extraBrace",
      "unclosedMath",
      "extraEnd",
      "unclosedBrace",
    ]);
  });
});

describe("checkLatex sobre documentos reales", () => {
  it("las plantillas y las fuentes de los fixtures correctos no dan falsas alarmas", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const files = [
      ...readdirSync("templates", { recursive: true, encoding: "utf8" })
        .filter((f) => f.endsWith(".tex"))
        .map((f) => join("templates", f)),
      ...["pdflatex-ok", "xelatex-babel-es", "multifile", "multifile-uno"].map(
        (name) => `tests/fixtures/logs/sources/${name}.tex`,
      ),
    ];
    expect(files.length).toBeGreaterThan(4);
    for (const file of files) {
      expect([file, checkLatex(readFileSync(file, "utf8"))]).toEqual([file, []]);
    }
  });

  it("el error de llaves del fixture se marca en su línea, antes de compilar", async () => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync("tests/fixtures/logs/sources/error-braces.tex", "utf8");
    const [problem, ...rest] = checkLatex(text);
    expect(rest).toEqual([]);
    expect(problem.code).toBe("unclosedBrace");
    expect(text.slice(0, problem.from).split("\n").length).toBe(3);
  });
});
