import { IS_MAC } from "./platform";

/** What LibreTeX uses from outside the app and the user may have to install. */
export type InstallCommands = { tex: string; git: string; gh: string };

/**
 * How to install those on this system, to copy into a terminal (LibreTeX never runs them):
 * pacman on Arch Linux, Homebrew and Xcode's tools on macOS.
 */
export function installCommands(mac = IS_MAC): InstallCommands {
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
