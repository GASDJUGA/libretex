import { describe, expect, it } from "vitest";
import { imageName, suggestedImageName } from "./imageName";

describe("nombre de una imagen pegada", () => {
  it("queda en algo que LaTeX lee sin problemas", () => {
    expect(imageName("Diagrama espín (v2)")).toBe("diagrama-espin-v2");
    expect(imageName("  Ñandú.png  ")).toBe("nandu-png");
    expect(imageName("../fuera")).toBe("fuera");
    expect(imageName("-_opción_")).toBe("opcion_");
    expect(imageName("¿?")).toBe("");
    expect(imageName("a".repeat(100))).toHaveLength(80);
  });

  it("el sugerido lleva la fecha y la hora", () => {
    expect(suggestedImageName(new Date(2026, 9, 5, 9, 3, 7))).toBe("captura-2026-10-05-090307");
  });
});
