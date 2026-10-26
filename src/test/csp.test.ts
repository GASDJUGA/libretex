import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Tests run from the repository root.
const conf = JSON.parse(readFileSync(join(process.cwd(), "src-tauri/tauri.conf.json"), "utf8")) as {
  app: { security: { csp: Record<string, string> | null } };
};

describe("Content-Security-Policy de la webview", () => {
  const csp = conf.app.security.csp;

  it("existe y no permite código evaluado ni orígenes de internet", () => {
    expect(csp).not.toBeNull();
    const all = Object.values(csp!).join(" ");
    expect(all).not.toContain("'unsafe-eval'");
    expect(all).not.toMatch(/https?:\/\/(?!(asset|ipc)\.localhost)/);
    expect(csp!["script-src"]).not.toContain("'unsafe-inline'");
  });

  it("cierra lo que la app no usa", () => {
    expect(csp!["default-src"]).toBe("'self'");
    expect(csp!["object-src"]).toBe("'none'");
    expect(csp!["frame-src"]).toBe("'none'");
    expect(csp!["base-uri"]).toBe("'none'");
  });
});
