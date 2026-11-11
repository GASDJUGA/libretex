import { mathjax } from "@mathjax/src/js/mathjax.js";
import { describe, expect, it } from "vitest";
import { normalizeTex, renderTex, TexError } from "./render";

const userMacros = {
  ihat: String.raw`\boldsymbol{\hat{\textbf{\i}}}`,
  jhat: String.raw`\boldsymbol{\hat{\textbf{\j}}}`,
};

describe("renderTex (MathJax 4 → SVG, sin red)", () => {
  it("las macros del usuario (\\ihat, \\jhat) se renderizan sin errores", async () => {
    const svg = await renderTex(String.raw`\vec v = 3\ihat + 4\jhat`, true, userMacros);
    expect(svg).toMatch(/^<mjx-container[^>]*><svg/);
    // A single SVG (inline line breaking is off).
    expect(svg.match(/<svg/g)).toHaveLength(1);
    expect(svg).not.toContain("merror");
    expect(svg).not.toContain("data-mjx-error");
  });

  it("la r de Griffiths del usuario y los cambios de fuente de texto de LaTeX", async () => {
    const macros = {
      rc: String.raw`\mathord{\mathscr{r}}`,
      etiqueta: String.raw`\text{\normalfont\bfseries A \itshape b}`,
    };
    await expect(
      renderTex(String.raw`\frac{q}{4\pi\epsilon_0 \rc^2}`, false, macros),
    ).resolves.toContain("<svg");
    await expect(renderTex(String.raw`\etiqueta`, false, macros)).resolves.toContain("<svg");
  });

  it("\\i y \\j sin punto pasan a sus caracteres Unicode", () => {
    expect(normalizeTex(String.raw`\textbf{\i} + \j x + \int`)).toBe(
      "\\textbf{\u0131} + \u0237x + \\int",
    );
  });

  it("las extensiones de 5.5", async () => {
    const samples = [
      String.raw`\begin{aligned} a &= b \\ c &= d \end{aligned}`, // ams
      String.raw`\boldsymbol{\alpha}`, // boldsymbol
      String.raw`\dv{f}{x} + \abs{x}`, // physics
      String.raw`\bra{\psi}\ket{\phi}`, // braket
      String.raw`\cancel{x}`, // cancel
      String.raw`{\color{red} x}`, // color
      String.raw`a \coloneqq b`, // mathtools
      String.raw`\text{si $x > 0$}`, // textmacros
      String.raw`\newcommand{\R}{\mathbb{R}} x \in \R`, // newcommand + dynamic font range
    ];
    for (const tex of samples) {
      const svg = await renderTex(tex, true);
      expect([tex, svg.includes("data-mjx-error")]).toEqual([tex, false]);
    }
  });

  it("una prima justo antes del paréntesis de una función de physics", async () => {
    // physics closes `\cos(` at its `)`; a prime right before it left that `)` unmatched
    // (pedido del usuario: `\div(J(r',t'))`, `\cos(\omega t')`).
    const samples = [
      String.raw`\cos(\omega t')`,
      String.raw`\div(J(r',t'))`,
      String.raw`\sin(x'')`,
      String.raw`\exp(-t') + \ln(x')`,
      String.raw`\cos[t'] + \sin(\cos(t'))`,
      String.raw`\cos(a \over b') + \qty|x'|`,
    ];
    for (const tex of samples) {
      const svg = await renderTex(tex, false);
      expect([tex, svg.includes("data-mjx-error")]).toEqual([tex, false]);
    }
  });

  it("un error de TeX se informa como mensaje", async () => {
    await expect(renderTex(String.raw`\frac{1}{`, false)).rejects.toThrow(TexError);
    await expect(renderTex(String.raw`\frac{1}{`, false)).rejects.toThrow(/close brace/i);
    await expect(renderTex(String.raw`\noexiste`, false)).rejects.toThrow(/noexiste/);
    // After an error the next formula renders normally.
    expect(await renderTex("x^2", false)).toContain("<svg");
  });

  it("nunca pide recursos fuera del paquete", async () => {
    await expect(mathjax.asyncLoad!("https://cdn.jsdelivr.net/npm/@mathjax/x.js")).rejects.toThrow(
      /no empaquetado/,
    );
    await expect(
      mathjax.asyncLoad!("@mathjax/mathjax-newcm-font/js/svg/dynamic/double-struck"),
    ).resolves.toBeDefined();
  });
});
