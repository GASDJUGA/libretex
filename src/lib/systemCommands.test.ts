import { describe, expect, it } from "vitest";
import { installCommands } from "./systemCommands";

describe("installCommands", () => {
  it("en Linux, pacman", () => {
    const commands = installCommands(false, false);
    expect(commands.gh).toBe("sudo pacman -S github-cli");
    expect(commands.tex).toMatch(/^sudo pacman -S --needed texlive-basic/);
  });

  it("en macOS, Homebrew y Xcode, sin pacman", () => {
    const commands = installCommands(true, false);
    expect(commands).toEqual({
      tex: "brew install --cask mactex-no-gui",
      git: "xcode-select --install",
      gh: "brew install gh",
    });
    expect(Object.values(commands).join(" ")).not.toMatch(/pacman|sudo/);
  });

  it("en Windows, winget (sin administrador): MiKTeX con el Perl de latexmk", () => {
    const commands = installCommands(false, true);
    expect(commands.tex).toContain("winget install --id MiKTeX.MiKTeX -e");
    expect(commands.tex).toContain("winget install --id StrawberryPerl.StrawberryPerl -e");
    expect(commands.git).toBe("winget install --id Git.Git -e");
    expect(commands.gh).toBe("winget install --id GitHub.cli -e");
    expect(Object.values(commands).join(" ")).not.toMatch(/pacman|sudo|brew|runas/);
  });
});
