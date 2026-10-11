import type { PackageHit } from "../store/types";

const hit = (name: string, caption: string, extra: Partial<PackageHit> = {}): PackageHit => ({
  name,
  caption,
  version: null,
  license: "lppl",
  inTexlive: true,
  inCtan: true,
  status: "installed",
  pacmanPackage: null,
  styles: [`${name}.sty`],
  ...extra,
});

/** Sample catalog for the browser preview and tests (like pacman's TeX Live). */
export const mockCatalog: PackageHit[] = [
  hit("amsmath", "AMS mathematical facilities for LaTeX", { version: "2.17t" }),
  hit("babel-spanish", "Babel support for Spanish", { version: "5.0x", styles: [] }),
  hit("physics", "Macros supporting the Mathematics of Physics", { version: "1.3" }),
  hit("siunitx", "A comprehensive (SI) units package", { version: "3.4.6" }),
  hit("minted", "Highlighted source code for LaTeX", { version: "3.6.0" }),
  hit("ctex", "LaTeX classes and packages for Chinese typesetting", {
    version: "2.5.10",
    status: "missing",
    pacmanPackage: "texlive-langchinese",
    styles: ["ctex.sty", "ctexart.cls"],
  }),
  hit("tikz-feynman", "Feynman diagrams with TikZ", { version: "1.1.0" }),
  hit("musixtex-fonts", "Fonts used by MusiXTeX", {
    status: "missing",
    pacmanPackage: "texlive-music",
    styles: [],
  }),
  hit("tcolorbox-extra", "Only on CTAN (example)", {
    inTexlive: false,
    status: "unknown",
    styles: [],
  }),
];
