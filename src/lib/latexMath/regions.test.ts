import { describe, expect, it } from "vitest";
import { MATH_CASES, withCursor } from "./cases";
import { MATH_ENVS, mathRegionAt, mathRegions } from "./regions";

describe("mathRegionAt (escáner de texto)", () => {
  for (const c of MATH_CASES) {
    it(c.name, () => {
      const { text, pos } = withCursor(c.text);
      const region = mathRegionAt(text, pos);
      if (!c.expected) {
        expect(region).toBeNull();
        return;
      }
      expect(region).not.toBeNull();
      expect(text.slice(region!.bodyFrom, region!.bodyTo)).toBe(c.expected.body);
      expect(region!.display).toBe(c.expected.display);
      expect(region!.env).toBe(c.expected.env ?? null);
      expect(region!.unclosed).toBe(c.expected.unclosed ?? false);
    });
  }

  it("todos los entornos matemáticos, con y sin asterisco", () => {
    for (const env of MATH_ENVS) {
      for (const name of [env, `${env}*`]) {
        const text = `\\begin{${name}} a \\end{${name}}`;
        expect(mathRegionAt(text, text.indexOf(" a ") + 1)?.env).toBe(name);
      }
    }
    // Not a math environment.
    expect(mathRegionAt("\\begin{itemize} a \\end{itemize}", 17)).toBeNull();
  });

  it("los bordes del cuerpo cuentan como dentro", () => {
    const text = "x $ab$ y";
    expect(mathRegionAt(text, 3)).not.toBeNull();
    expect(mathRegionAt(text, 5)).not.toBeNull();
    expect(mathRegionAt(text, 2)).toBeNull();
    expect(mathRegionAt(text, 6)).toBeNull();
  });

  it("entornos anidados del mismo nombre y un entorno sin cerrar", () => {
    const nested = "\\begin{equation} \\begin{equation} a \\end{equation} b \\end{equation}";
    expect(mathRegions(nested)).toHaveLength(1);
    expect(mathRegions(nested)[0].to).toBe(nested.length);
    const open = "\\begin{align} x &= 1";
    expect(mathRegions(open)[0]).toMatchObject({ unclosed: true, to: open.length });
  });

  it("un % dentro de la fórmula no la cierra", () => {
    const text = "\\[ a % comentario $ \\]\n b \\]";
    const [region] = mathRegions(text);
    expect(text.slice(region.bodyFrom, region.bodyTo)).toBe(" a % comentario $ \\]\n b ");
  });
});
