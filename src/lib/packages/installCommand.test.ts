import { describe, expect, it } from "vitest";
import { installCommand } from "./installCommand";

describe("installCommand", () => {
  it("pacman: el paquete de pacman que lo trae", () => {
    expect(installCommand("ctex", "pacman", { pacmanPackage: "texlive-langchinese" })).toBe(
      "sudo pacman -S texlive-langchinese",
    );
    expect(installCommand("ctex", "pacman", {})).toBeNull();
  });

  it("TeX Live oficial de solo lectura (MacTeX): sudo tlmgr", () => {
    expect(
      installCommand("physics", "officialReadOnly", { tlmgr: "/Library/TeX/texbin/tlmgr" }),
    ).toBe("sudo /Library/TeX/texbin/tlmgr install physics");
    expect(installCommand("physics", "officialReadOnly", { tlmgr: null })).toBeNull();
  });

  it("los demás no tienen comando", () => {
    expect(installCommand("physics", "readOnly", { tlmgr: "/usr/bin/tlmgr" })).toBeNull();
    expect(installCommand("physics", "managed", { tlmgr: "/x/tlmgr" })).toBeNull();
  });
});
