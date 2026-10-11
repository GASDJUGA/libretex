/**
 * MathJax's SVG output as safe DOM. The TeX comes from project files (maybe from someone
 * else's ZIP), so the SVG is parsed and rebuilt with an allowlist: only the elements and
 * attributes MathJax produces, internal references only, no scripts or event handlers.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

const ELEMENTS = new Set([
  "svg",
  "g",
  "path",
  "use",
  "defs",
  "rect",
  "text",
  "line",
  "title",
  "desc",
]);

const ATTRIBUTES = new Set([
  "d",
  "transform",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "viewBox",
  "preserveAspectRatio",
  "id",
  "class",
  "role",
  "focusable",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "style",
]);

function allowedAttribute(name: string, value: string): boolean {
  if (name === "href" || name === "xlink:href") return value.startsWith("#");
  if (name.startsWith("data-") || name.startsWith("aria-")) return true;
  if (name === "style") return !/url\s*\(|expression|@import|javascript:/i.test(value);
  return ATTRIBUTES.has(name);
}

function copy(node: Element, into: Element) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      into.append(child.textContent ?? "");
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const element = child as Element;
      if (!ELEMENTS.has(element.localName)) continue;
      const clean = document.createElementNS(SVG_NS, element.localName);
      for (const attribute of Array.from(element.attributes)) {
        if (allowedAttribute(attribute.name, attribute.value)) {
          if (attribute.name === "xlink:href") clean.setAttribute("href", attribute.value);
          else clean.setAttribute(attribute.name, attribute.value);
        }
      }
      copy(element, clean);
      into.append(clean);
    }
  }
}

/** The first `<svg>` of MathJax's output as a sanitized SVG element, or null. */
export function sanitizeSvg(markup: string): SVGSVGElement | null {
  const start = markup.indexOf("<svg");
  const end = markup.lastIndexOf("</svg>");
  if (start < 0 || end < 0) return null;
  const parsed = new DOMParser().parseFromString(
    markup.slice(start, end + "</svg>".length),
    "image/svg+xml",
  );
  const root = parsed.documentElement;
  if (root.localName !== "svg" || parsed.getElementsByTagName("parsererror").length) return null;
  const holder = document.createElementNS(SVG_NS, "g");
  const wrapper = parsed.createElementNS(SVG_NS, "wrapper");
  wrapper.append(root);
  copy(wrapper, holder);
  return holder.firstElementChild as SVGSVGElement | null;
}
