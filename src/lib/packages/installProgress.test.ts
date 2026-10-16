import { describe, expect, it } from "vitest";
import { installFraction, megabytes } from "./installProgress";

describe("progreso de la instalación de TeX Live", () => {
  it("avanza por fases sin retroceder", () => {
    const steps = [
      null,
      { step: "download" as const, done: 1_000_000, total: 5_000_000 },
      { step: "download" as const, done: 5_000_000, total: 5_000_000 },
      { step: "extract" as const },
      { step: "install" as const, done: 1, total: 138, package: "a" },
      { step: "install" as const, done: 138, total: 138, package: "z" },
      { step: "packages" as const, done: 4, total: 11, package: "fontspec" },
      { step: "packages" as const, done: 11, total: 11, package: "xetex" },
    ];
    const fractions = steps.map(installFraction);
    expect(fractions[0]).toBe(0);
    expect(fractions.at(-1)).toBeCloseTo(1);
    for (let i = 1; i < fractions.length; i++) {
      expect(fractions[i]).toBeGreaterThanOrEqual(fractions[i - 1]);
    }
    expect(installFraction({ step: "download", done: 10, total: null })).toBeGreaterThan(0);
  });

  it("tamaños en MB", () => {
    expect(megabytes(5_300_000)).toBe("5.3 MB");
  });
});
