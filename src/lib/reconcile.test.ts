import { describe, expect, it } from "vitest";
import { reconcile } from "./reconcile";

const clean = { content: "A", saved: "A" };
const dirty = { content: "A editado", saved: "A" };

describe("reconcile", () => {
  it("ignora nuestro propio guardado", () => {
    expect(reconcile(clean, "A")).toBe("none");
    expect(reconcile(dirty, "A")).toBe("none");
  });

  it("recarga en silencio si no hay cambios sin guardar", () => {
    expect(reconcile(clean, "B")).toBe("reload");
  });

  it("pregunta si hay cambios sin guardar y el disco es distinto", () => {
    expect(reconcile(dirty, "B")).toBe("conflict");
  });

  it("si el disco quedó igual que el buffer no hay conflicto", () => {
    expect(reconcile(dirty, "A editado")).toBe("none");
  });

  it("archivo borrado", () => {
    expect(reconcile(clean, null)).toBe("deleted");
    expect(reconcile(dirty, null)).toBe("deletedConflict");
  });
});
