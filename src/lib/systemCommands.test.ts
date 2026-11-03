import { describe, expect, it } from "vitest";
import { installCommands } from "./systemCommands";

describe("installCommands", () => {
  it("en Linux, pacman", () => {
    const commands = installCommands(false);
    expect(commands.gh).toBe("sudo pacman -S github-cli");
    expect(commands.tex).toMatch(/^sudo pacman -S --needed texlive-basic/);
  });

  it("en macOS, Homebrew y Xcode, sin pacman", () => {
    const commands = installCommands(true);
    expect(commands).toEqual({
      tex: "brew install --cask mactex-no-gui",
      git: "xcode-select --install",
      gh: "brew install gh",
    });
    expect(Object.values(commands).join(" ")).not.toMatch(/pacman|sudo/);
  });
});
