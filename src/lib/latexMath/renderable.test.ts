import { describe, expect, it } from "vitest";
import { renderTex } from "../mathjax/render";
import { renderableTex } from "./renderable";

const env = (name: string | null) => ({ env: name });

describe("renderableTex", () => {
  it("delimitadores y equation: el cuerpo tal cual (sin numeración)", () => {
    expect(renderableTex(env(null), " a+b ")).toBe("a+b");
    expect(renderableTex(env("equation"), " E = mc^2 \\label{eq:e} ")).toBe("E = mc^2");
    expect(renderableTex(env("displaymath"), "x")).toBe("x");
  });

  it("entornos con alineación pasan a su equivalente interno", () => {
    expect(renderableTex(env("align*"), " a &= b \\\\ c &= d \\nonumber ")).toBe(
      "\\begin{aligned}a &= b \\\\ c &= d\\end{aligned}",
    );
    expect(renderableTex(env("flalign"), "a&=b")).toBe("\\begin{aligned}a&=b\\end{aligned}");
    expect(renderableTex(env("gather"), "a \\\\ b \\tag{1}")).toBe(
      "\\begin{gathered}a \\\\ b\\end{gathered}",
    );
    expect(renderableTex(env("multline*"), "a \\\\ b")).toBe(
      "\\begin{multlined}a \\\\ b\\end{multlined}",
    );
    expect(renderableTex(env("alignat"), "{2} a &= b & c &= d")).toBe(
      "\\begin{alignedat}{2} a &= b & c &= d\\end{alignedat}",
    );
    expect(renderableTex(env("eqnarray*"), "a &=& b \\notag")).toBe(
      "\\begin{array}{rcl}a &=& b\\end{array}",
    );
  });

  it("todos se renderizan con MathJax sin errores", async () => {
    const cases: [string, string][] = [
      [
        "align*",
        String.raw`\vec{F} &= m\vec{a} \\ \nabla \cdot \vec{E} &= \frac{\rho}{\varepsilon_0} \label{eq:x}`,
      ],
      ["gather", String.raw`a = b \\ c = d \nonumber`],
      ["multline", String.raw`a + b + c \\ + d + e`],
      ["alignat*", String.raw`{2} x &= 1 &\quad y &= 2`],
      ["eqnarray", String.raw`a &=& b \\ c &=& d`],
      ["flalign*", String.raw`a &= b & c &= d`],
    ];
    for (const [name, body] of cases) {
      const svg = await renderTex(renderableTex(env(name), body), true);
      expect([name, svg.includes("data-mjx-error")]).toEqual([name, false]);
    }
  });
});
