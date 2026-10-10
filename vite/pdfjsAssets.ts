import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, normalize, sep } from "node:path";
import type { Plugin } from "vite";

/** pdf.js data the viewer loads at runtime: CMaps, standard fonts, color profiles, decoders. */
const DIRS = ["cmaps", "standard_fonts", "iccs", "wasm"];
/** Not needed: PDF scripting is disabled. */
const SKIP = /^quickjs/;
/** URL prefix (dev server and build output). */
export const PDFJS_ASSETS = "pdfjs";

const root = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));

function files(dir: string): string[] {
  return readdirSync(join(root, dir)).filter(
    (name) => !SKIP.test(name) && statSync(join(root, dir, name)).isFile(),
  );
}

/**
 * Serves pdf.js runtime data from node_modules in development and copies it into the build,
 * so the viewer never fetches anything from the network.
 */
export function pdfjsAssets(): Plugin {
  return {
    name: "libretex-pdfjs-assets",
    configureServer(server) {
      server.middlewares.use(`/${PDFJS_ASSETS}/`, (req, res, next) => {
        const path = normalize(decodeURIComponent((req.url ?? "").split("?")[0]));
        const [dir, name, ...rest] = path.split(/[/\\]/).filter(Boolean);
        if (!DIRS.includes(dir) || !name || rest.length || name.includes(sep) || SKIP.test(name)) {
          return next();
        }
        try {
          const body = readFileSync(join(root, dir, name));
          if (name.endsWith(".wasm")) res.setHeader("Content-Type", "application/wasm");
          res.end(body);
        } catch {
          next();
        }
      });
    },
    generateBundle() {
      for (const dir of DIRS) {
        for (const name of files(dir)) {
          this.emitFile({
            type: "asset",
            fileName: `${PDFJS_ASSETS}/${dir}/${name}`,
            source: readFileSync(join(root, dir, name)),
          });
        }
      }
    },
  };
}
