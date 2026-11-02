import { describe, expect, it } from "vitest";
import { ARCH_TEXLIVE_COMMAND, texInstallCommand } from "./tex";

describe("texInstallCommand", () => {
  it("en Windows, MiKTeX y Strawberry Perl con winget (sin administrador)", () => {
    const command = texInstallCommand(true);
    expect(command).toContain("winget install --id MiKTeX.MiKTeX -e");
    expect(command).toContain("winget install --id StrawberryPerl.StrawberryPerl -e");
    expect(command).not.toMatch(/sudo|runas/);
  });

  it("en los demás sistemas, el de Arch como hasta ahora", () => {
    expect(texInstallCommand(false)).toBe(ARCH_TEXLIVE_COMMAND);
  });
});
