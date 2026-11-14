import { IS_MAC, IS_WINDOWS } from "./platform";

/** What JuTeX uses from outside the app and the user may have to install. */
export type InstallCommands = { tex: string; git: string; gh: string };

/**
 * How to install those on this system, to copy into a terminal (JuTeX never runs them):
 * pacman on Arch Linux, Homebrew and Xcode's tools on macOS, winget on Windows (PowerShell,
 * for the user: no administrator).
 */
export function installCommands(mac = IS_MAC, windows = IS_WINDOWS): InstallCommands {
  if (windows)
    return {
      // MiKTeX for the user, and the Perl its `latexmk` needs.
      tex: "winget install --id MiKTeX.MiKTeX -e; winget install --id StrawberryPerl.StrawberryPerl -e",
      git: "winget install --id Git.Git -e",
      gh: "winget install --id GitHub.cli -e",
    };
  return mac
    ? {
        tex: "brew install --cask mactex-no-gui",
        git: "xcode-select --install",
        gh: "brew install gh",
      }
    : {
        tex: "sudo pacman -S --needed texlive-basic texlive-latex texlive-latexrecommended texlive-latexextra texlive-xetex texlive-luatex texlive-langspanish texlive-binextra",
        git: "sudo pacman -S git",
        gh: "sudo pacman -S github-cli",
      };
}
