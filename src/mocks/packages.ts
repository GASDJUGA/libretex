export type PackageStatus = "installed" | "missing" | "update";

export type PackageInfo = {
  name: string;
  description: string;
  version: string;
  status: PackageStatus;
};

/** Sample data for the package manager skeleton (Phase 8). */
export const mockPackages: PackageInfo[] = [
  {
    name: "amsmath",
    description: "Mejoras de AMS para fórmulas matemáticas",
    version: "2.17t",
    status: "installed",
  },
  {
    name: "babel-spanish",
    description: "Soporte de babel para el español",
    version: "5.0x",
    status: "installed",
  },
  {
    name: "physics",
    description: "Macros para notación de física",
    version: "1.3",
    status: "update",
  },
  {
    name: "siunitx",
    description: "Sistema completo de unidades del SI",
    version: "3.4.6",
    status: "installed",
  },
  {
    name: "minted",
    description: "Resaltado de código con Pygments",
    version: "3.6.0",
    status: "missing",
  },
  {
    name: "tcolorbox",
    description: "Cajas de color configurables",
    version: "6.7.0",
    status: "missing",
  },
];
