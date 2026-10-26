import { describe, expect, it } from "vitest";
import { renderTex } from "./render";
import { sanitizeSvg } from "./sanitize";

describe("sanitizeSvg", () => {
  it("conserva lo que produce MathJax", async () => {
    const markup = await renderTex(String.raw`\frac{a}{b} + \sqrt{x}`, true);
    const svg = sanitizeSvg(markup)!;
    expect(svg.localName).toBe("svg");
    expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
    expect(svg.getAttribute("viewBox")).toBeTruthy();
    // Glyphs referenced from <defs> keep their internal links.
    for (const use of svg.querySelectorAll("use")) {
      expect(use.getAttribute("href")).toMatch(/^#/);
    }
  });

  it("fórmulas con <, > y & (MathJax no escapa data-latex)", async () => {
    for (const tex of [
      "a < b",
      String.raw`x > 0 \land y<1`,
      String.raw`\begin{aligned} a &< b \\ c &> d \end{aligned}`,
      String.raw`\langle a \rangle \leq 1`,
    ]) {
      const svg = sanitizeSvg(await renderTex(tex, true));
      expect(svg, tex).not.toBeNull();
      expect(svg!.querySelectorAll("use, path").length, tex).toBeGreaterThan(0);
    }
  });

  it("quita scripts, objetos externos, eventos y enlaces externos", () => {
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" onload="alert(1)">
      <script>alert(1)</script>
      <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
      <a href="https://example.org"><path d="M0 0"/></a>
      <use xlink:href="https://example.org/x.svg#a"/>
      <use xlink:href="#ok"/>
      <path d="M1 1" onclick="alert(1)" style="fill: url(https://example.org/x)"/>
      <text style="font-size: 2px">texto</text>
    </svg>`;
    const svg = sanitizeSvg(markup)!;
    expect(svg.outerHTML).not.toMatch(/script|foreignObject|onload|onclick|example\.org|alert/);
    expect(svg.querySelectorAll("use")).toHaveLength(2);
    expect(svg.querySelector('use[href="#ok"]')).not.toBeNull();
    expect(svg.querySelectorAll("use:not([href])")).toHaveLength(1);
    expect(svg.querySelector("text")?.getAttribute("style")).toBe("font-size: 2px");
  });

  it("entrada rota o sin svg: null", () => {
    expect(sanitizeSvg("<div>hola</div>")).toBeNull();
    expect(sanitizeSvg("<svg><path></svg>")).toBeNull();
  });
});
