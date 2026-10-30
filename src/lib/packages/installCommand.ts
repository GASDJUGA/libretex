import type { BackendKind } from "../../store/types";

/** The command that installs `pkg` in a TeX LibreTeX can't modify, if there is one. */
export function installCommand(
  pkg: string,
  kind: BackendKind | null,
  { pacmanPackage, tlmgr }: { pacmanPackage?: string | null; tlmgr?: string | null },
): string | null {
  if (kind === "pacman" && pacmanPackage) return `sudo pacman -S ${pacmanPackage}`;
  if (kind === "officialReadOnly" && tlmgr) return `sudo ${tlmgr} install ${pkg}`;
  return null;
}
