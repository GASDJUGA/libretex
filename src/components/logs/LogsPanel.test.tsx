import { EditorView } from "@codemirror/view";
import { forEachDiagnostic } from "@codemirror/lint";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Project } from "../../app/Project";
import { useCompile } from "../../store/compile";
import { useProjectView } from "../../store/project";
import { resetApp } from "../../test/reset";

function editorView() {
  const dom = screen.getByTestId("code-editor").querySelector<HTMLElement>(".cm-editor")!;
  return EditorView.findFromDOM(dom)!;
}

async function compileWithError() {
  render(<Project projectId="tesis" />);
  await screen.findByText(/Este documento es un ejemplo/);
  const view = editorView();
  // Line 3 of main.tex becomes an undefined command.
  act(() => {
    const line = view.state.doc.line(3);
    view.dispatch({ changes: { from: line.from, to: line.to, insert: "\\comandoinexistente" } });
  });
  fireEvent.click(screen.getByRole("button", { name: /Recompilar/ }));
  await waitFor(() => expect(useCompile.getState().last?.status).toBe("failed"));
}

describe("Registros y diagnósticos", () => {
  beforeEach(resetApp);

  it("el contador muestra los errores del log y abre el panel", async () => {
    await compileWithError();
    fireEvent.click(screen.getByRole("button", { name: /Registros: 1 errores, 0 advertencias/ }));
    const errors = screen.getByRole("region", { name: "Errores" });
    expect(within(errors).getByText("Undefined control sequence.")).toBeInTheDocument();
    expect(within(errors).getByText("main.tex:3")).toBeInTheDocument();
    expect(screen.getByText("La compilación falló")).toBeInTheDocument();
  });

  it("el error queda marcado en la línea del editor", async () => {
    await compileWithError();
    const found: [string, number][] = [];
    forEachDiagnostic(editorView().state, (d, from) =>
      found.push([d.severity, editorView().state.doc.lineAt(from).number]),
    );
    expect(found).toEqual([["error", 3]]);
  });

  it("clic en un problema salta a su línea", async () => {
    await compileWithError();
    useProjectView.getState().toggleSidePanel("logs");
    fireEvent.click(await screen.findByRole("button", { name: /Undefined control sequence/ }));
    const view = editorView();
    expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(3);
  });

  it("el log completo se puede ver", async () => {
    await compileWithError();
    useProjectView.getState().toggleSidePanel("logs");
    fireEvent.click(await screen.findByRole("tab", { name: "Log completo" }));
    expect(screen.getByText(/This is XeTeX/)).toBeInTheDocument();
  });
});
