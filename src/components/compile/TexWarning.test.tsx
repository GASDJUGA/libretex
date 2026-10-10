import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useTex } from "../../store/tex";
import type { TexStatus } from "../../store/types";
import { resetApp } from "../../test/reset";
import { TexWarning } from "./TexWarning";

const tool = { path: "/usr/bin/x", version: "1" };
const full: TexStatus = {
  latexmk: tool,
  pdflatex: tool,
  xelatex: tool,
  lualatex: tool,
  synctex: tool,
  biber: tool,
  bibtex: tool,
  distribution: "TeX Live 2026",
};

describe("TexWarning", () => {
  beforeEach(resetApp);

  it("no aparece si está todo instalado o aún no se detectó", () => {
    const { container, rerender } = render(<TexWarning compiler="xelatex" />);
    expect(container).toBeEmptyDOMElement();
    useTex.setState({ status: full });
    rerender(<TexWarning compiler="xelatex" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("avisa si falta latexmk o el motor del proyecto, con el comando de pacman", () => {
    useTex.setState({ status: { ...full, latexmk: null, xelatex: null } });
    render(<TexWarning compiler="xelatex" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No se encontró latexmk");
    expect(alert).toHaveTextContent("No se encontró XeLaTeX");
    expect(alert).toHaveTextContent("sudo pacman -S --needed texlive-basic");
    fireEvent.click(screen.getByRole("button", { name: "Ocultar aviso" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("solo importa el motor del proyecto", () => {
    useTex.setState({ status: { ...full, lualatex: null } });
    const { container } = render(<TexWarning compiler="xelatex" />);
    expect(container).toBeEmptyDOMElement();
  });
});
