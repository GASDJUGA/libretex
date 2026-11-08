/**
 * TeX → SVG with MathJax 4, bundled with the app: no CDN. The SVG font's glyph ranges are
 * loaded on demand from the bundle (`mathjax.asyncLoad`). Loaded lazily by the math preview.
 */
import { mathjax } from "@mathjax/src/js/mathjax.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import { SVG } from "@mathjax/src/js/output/svg.js";
import { liteAdaptor } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";
import "@mathjax/src/js/input/tex/base/BaseConfiguration.js";
import "@mathjax/src/js/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js";
import "@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js";
import "@mathjax/src/js/input/tex/physics/PhysicsConfiguration.js";
import "@mathjax/src/js/input/tex/braket/BraketConfiguration.js";
import "@mathjax/src/js/input/tex/cancel/CancelConfiguration.js";
import "@mathjax/src/js/input/tex/color/ColorConfiguration.js";
import "@mathjax/src/js/input/tex/mathtools/MathtoolsConfiguration.js";
import "@mathjax/src/js/input/tex/textmacros/TextMacrosConfiguration.js";
import "@mathjax/src/js/input/tex/configmacros/ConfigMacrosConfiguration.js";
import { MathJaxNewcmFont } from "@mathjax/mathjax-newcm-font/js/svg.js";
import type { MathJaxMacros } from "../macros/extract";

/** TeX packages of the preview (5.5). */
export const PACKAGES = [
  "base",
  "ams",
  "newcommand",
  "boldsymbol",
  "physics",
  "braket",
  "cancel",
  "color",
  "mathtools",
  "textmacros",
  "configmacros",
];

/** Glyph ranges of the SVG font, bundled. MathJax asks for them by module name. */
const FONT_PREFIX = "@mathjax/mathjax-newcm-font/js/svg/dynamic/";
const dynamicFont = import.meta.glob(
  "../../../node_modules/@mathjax/mathjax-newcm-font/mjs/svg/dynamic/*.js",
);
const dynamicByName = new Map(
  Object.entries(dynamicFont).map(([path, load]) => [
    path.slice(path.lastIndexOf("/") + 1, -".js".length),
    load,
  ]),
);

mathjax.asyncLoad = (name: string) => {
  const file = name.startsWith(FONT_PREFIX)
    ? name.slice(FONT_PREFIX.length).replace(/\.js$/, "")
    : null;
  const load = file ? dynamicByName.get(file) : undefined;
  // Anything else would come from the network: never.
  return load ? load() : Promise.reject(new Error(`MathJax: recurso no empaquetado: ${name}`));
};

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
// One SVG per formula: MathJax 4 splits inline math at break points by default.
const output = new SVG({
  fontCache: "local",
  fontData: MathJaxNewcmFont,
  linebreaks: { inline: false },
});

/**
 * Text commands MathJax does not know: the dotless `\i` and `\j` (used in text mode, e.g.
 * `\textbf{\i}`) become their Unicode characters.
 */
export function normalizeTex(tex: string): string {
  return tex.replace(/\\([ij])(?![a-zA-Z@])\s*/g, (_, letter: string) =>
    letter === "i" ? "\u0131" : "\u0237",
  );
}

/**
 * Font switches of LaTeX's text mode that MathJax does not know (`\text{\normalfont…}` in the
 * user's macros), as the ones it does. The user's own definitions win.
 */
const TEXT_SWITCHES: MathJaxMacros = {
  normalfont: "\\rm",
  rmfamily: "\\rm",
  upshape: "\\rm",
  sffamily: "\\sf",
  ttfamily: "\\tt",
  bfseries: "\\bf",
  itshape: "\\it",
  slshape: "\\it",
  mdseries: "",
  scshape: "",
};

function normalizeMacros(user: MathJaxMacros): MathJaxMacros {
  const macros = { ...TEXT_SWITCHES, ...user };
  return Object.fromEntries(
    Object.entries(macros).map(([name, def]) => [
      name,
      typeof def === "string"
        ? normalizeTex(def)
        : ([normalizeTex(def[0]), ...def.slice(1)] as typeof def),
    ]),
  );
}

/** A TeX error (syntax, undefined control sequence…). */
export class TexError extends Error {}

type MathDocument = ReturnType<typeof mathjax.document>;

/** One MathJax document per set of macros (the TeX input jax keeps them). */
let cached: { key: string; document: MathDocument } | null = null;

function documentFor(macros: MathJaxMacros): MathDocument {
  const key = JSON.stringify(macros);
  if (cached?.key !== key) {
    const tex = new TeX({
      packages: PACKAGES,
      macros: normalizeMacros(macros),
      // Errors are reported as a message, not rendered as red TeX.
      formatError: (_jax: unknown, error: Error) => {
        throw new TexError(error.message);
      },
    });
    cached = { key, document: mathjax.document("", { InputJax: tex, OutputJax: output }) };
  }
  return cached.document;
}

/**
 * Renders `tex` as an SVG string. Throws `TexError` with MathJax's message for invalid TeX
 * (it never breaks the caller with other errors: those become a `TexError` too).
 */
export async function renderTex(
  tex: string,
  display: boolean,
  macros: MathJaxMacros = {},
): Promise<string> {
  let document: MathDocument;
  try {
    document = documentFor(macros);
  } catch (error) {
    // An invalid macro definition must not break the preview.
    throw new TexError(error instanceof Error ? error.message : String(error));
  }
  try {
    const node = await mathjax.handleRetriesFor(() =>
      document.convert(normalizeTex(tex), { display }),
    );
    return adaptor.outerHTML(node);
  } catch (error) {
    if (error instanceof TexError) throw error;
    throw new TexError(error instanceof Error ? error.message : String(error));
  } finally {
    // The document keeps converted items; the preview renders one formula at a time.
    document.clear();
  }
}
