import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { pdfjsAssets } from "./vite/pdfjsAssets.ts";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as {
  version: string;
};

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), pdfjsAssets()],

  // The app's version (package.json), for «Acerca de» and the home screen.
  define: { __APP_VERSION__: JSON.stringify(version) },

  resolve: {
    alias: [
      // The Hunspell dictionaries, bundled with the app (their packages only export a
      // Node.js loader): `@dictionaries/es.aff?url` → node_modules/dictionary-es/index.aff.
      {
        find: /^@dictionaries\/(es|en)\.(aff|dic)/,
        replacement: fileURLToPath(
          new URL("./node_modules/dictionary-$1/index.$2", import.meta.url),
        ),
      },
    ],
  },

  optimizeDeps: {
    // The font's glyph ranges (loaded on demand) register themselves in the font class they
    // import by relative path; pre-bundling the font would give the app another copy of that
    // class and every range would "fail to load" (\ell, \mathbb…) in development.
    exclude: ["@mathjax/mathjax-newcm-font"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    // The tests that mount the whole project view can pass the default 5 s with the full
    // suite running, more so on Windows (jsdom is slower there).
    testTimeout: 20_000,
  },
}));
