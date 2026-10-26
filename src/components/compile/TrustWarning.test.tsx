import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../../App";
import { createMockBackend, type MockBackend } from "../../lib/mockBackend";
import { setBackend } from "../../lib/tauri";
import { resetApp } from "../../test/reset";
import { useCompile } from "../../store/compile";
import { useProjects } from "../../store/projects";

let backend: MockBackend;

beforeEach(() => {
  resetApp();
  backend = createMockBackend();
  setBackend(backend);
});

describe("proyectos que no son de confianza", () => {
  it("se compilan sin su .latexmkrc y avisan; confiar en ellos lo permite", async () => {
    // A ZIP from elsewhere, with a latexmk configuration (Perl that latexmk would run).
    const { project } = (await backend.importZipDialog("", ""))!;
    await backend.writeTextFile(
      project.id,
      "main.tex",
      "\\documentclass{article}\n\\begin{document}\nHola\n\\end{document}\n",
    );
    await backend.createFile(project.id, ".latexmkrc");
    expect(project.trusted).toBe(false);

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: `Abrir ${project.name}` }));
    await screen.findByText("Hola");
    await act(() => useCompile.getState().compileNow());
    const notice = (await screen.findByText(/se compiló sin/)).closest("[role=alert]")!;
    expect(notice).toHaveTextContent(/se compiló sin su archivo \.latexmkrc/);

    fireEvent.click(screen.getByRole("button", { name: "Confiar en este proyecto…" }));
    const dialog = await screen.findByRole("dialog", { name: "¿Confiar en este proyecto?" });
    expect(dialog).toHaveTextContent(/ejecutar cualquier programa/);
    fireEvent.click(screen.getByRole("button", { name: "Confiar y recompilar" }));

    await waitFor(() => expect(useProjects.getState().current?.trusted).toBe(true));
    await waitFor(() => expect(useCompile.getState().last?.blocked).toEqual([]));
    expect(screen.queryByText(/se compiló sin/)).not.toBeInTheDocument();
  });

  it("los proyectos creados en LibreTeX no muestran el aviso", async () => {
    const created = await backend.createProject("Nuevo", null);
    await backend.createFile(created.id, ".latexmkrc");
    expect(created.trusted).toBe(true);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir Nuevo" }));
    await waitFor(() => expect(useCompile.getState().projectId).toBe(created.id));
    await act(() => useCompile.getState().compileNow());
    await waitFor(() => expect(useCompile.getState().last).not.toBeNull());
    expect(useCompile.getState().last?.blocked).toEqual([]);
    expect(screen.queryByText(/se compiló sin/)).not.toBeInTheDocument();
  });
});
