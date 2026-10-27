import { openSearchPanel } from "@codemirror/search";
import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Project } from "../../app/Project";
import { resetApp } from "../../test/reset";

function editorView() {
  const dom = screen.getByTestId("code-editor").querySelector<HTMLElement>(".cm-editor")!;
  return EditorView.findFromDOM(dom)!;
}

async function openBar() {
  render(<Project projectId="tesis" />);
  await screen.findByText(/Este documento es un ejemplo/);
  const view = editorView();
  act(() => {
    openSearchPanel(view);
  });
  return { view, bar: await screen.findByRole("search", { name: "Buscar en el archivo" }) };
}

const selected = (view: EditorView) => {
  const { from, to } = view.state.selection.main;
  return view.state.sliceDoc(from, to);
};

describe("barra de búsqueda del editor", () => {
  beforeEach(resetApp);

  it("busca, cuenta y salta con Enter / Mayús+Enter", async () => {
    const { view, bar } = await openBar();
    const input = within(bar).getByRole("textbox", { name: "Buscar" });
    // Ready to type: the text goes to the bar, not to the document.
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.change(input, { target: { value: "\\vec" } });
    await within(bar).findByText(/de 5$/);
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(selected(view)).toBe("\\vec"));
    expect(within(bar).getByText(/^\d de 5$/)).toBeInTheDocument();
    const first = view.state.selection.main.from;
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(view.state.selection.main.from).toBeGreaterThan(first));
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    await waitFor(() => expect(view.state.selection.main.from).toBe(first));
  });

  it("una barra invertida se busca tal cual (\\nabla no es un salto de línea)", async () => {
    const { bar } = await openBar();
    fireEvent.change(within(bar).getByRole("textbox", { name: "Buscar" }), {
      target: { value: "\\nabla" },
    });
    expect(await within(bar).findByText(/de 1$/)).toBeInTheDocument();
  });

  it("distingue mayúsculas por defecto; «Aa» lo desactiva", async () => {
    const { bar } = await openBar();
    const matchCase = within(bar).getByRole("button", {
      name: "Distinguir mayúsculas y minúsculas",
    });
    expect(matchCase).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(within(bar).getByRole("textbox", { name: "Buscar" }), {
      target: { value: "\\VEC" },
    });
    expect(await within(bar).findByText(/Sin resultados/)).toBeInTheDocument();
    fireEvent.click(matchCase);
    expect(await within(bar).findByText(/de 5$/)).toBeInTheDocument();
  });

  it("opciones, expresión no válida y sin resultados", async () => {
    const { bar } = await openBar();
    const input = within(bar).getByRole("textbox", { name: "Buscar" });
    fireEvent.click(within(bar).getByRole("button", { name: "Usar expresión regular" }));
    fireEvent.change(input, { target: { value: "(sin" } });
    expect(await within(bar).findByText("Expresión no válida")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "zzzz" } });
    expect(await within(bar).findByText("Sin resultados")).toBeInTheDocument();
  });

  it("reemplazar todo desde la fila de reemplazo; Esc cierra", async () => {
    const { view, bar } = await openBar();
    fireEvent.change(within(bar).getByRole("textbox", { name: "Buscar" }), {
      target: { value: "\\vec" },
    });
    fireEvent.click(within(bar).getByRole("button", { name: "Mostrar u ocultar reemplazar" }));
    fireEvent.change(within(bar).getByRole("textbox", { name: "Reemplazar por" }), {
      target: { value: "\\vb" },
    });
    fireEvent.click(within(bar).getByRole("button", { name: "Reemplazar todo" }));
    await waitFor(() => expect(view.state.doc.toString()).not.toContain("\\vec"));
    expect(view.state.doc.toString().match(/\\vb\b/g)).toHaveLength(5);
    fireEvent.keyDown(within(bar).getByRole("textbox", { name: "Buscar" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("search")).toBeNull());
  });
});
