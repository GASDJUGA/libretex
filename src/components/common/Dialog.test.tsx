import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { onTabKey } from "../../lib/tabKeys";
import { Dialog } from "./Dialog";

function Opener() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      {open && (
        <Dialog
          title="Prueba"
          submitLabel="Aceptar"
          onSubmit={() => {}}
          onClose={() => setOpen(false)}
        >
          <input aria-label="Campo" type="text" />
        </Dialog>
      )}
    </>
  );
}

describe("diálogo modal", () => {
  it("Tab no sale del diálogo y al cerrar el foco vuelve a quien lo abrió", () => {
    render(<Opener />);
    const opener = screen.getByRole("button", { name: "Abrir" });
    opener.focus();
    fireEvent.click(opener);
    const field = screen.getByRole("textbox", { name: "Campo" });
    expect(field).toHaveFocus();
    const submit = screen.getByRole("button", { name: "Aceptar" });
    submit.focus();
    fireEvent.keyDown(submit, { key: "Tab" });
    expect(field).toHaveFocus();
    fireEvent.keyDown(field, { key: "Tab", shiftKey: true });
    expect(submit).toHaveFocus();
    fireEvent.keyDown(submit, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe("pestañas con el teclado", () => {
  it("las flechas recorren las pestañas y Supr cierra", () => {
    const closed: string[] = [];
    render(
      <div role="tablist">
        {["a", "b", "c"].map((name) => (
          <button
            key={name}
            role="tab"
            type="button"
            onKeyDown={(e) => onTabKey(e, () => closed.push(name))}
          >
            {name}
          </button>
        ))}
      </div>,
    );
    const [a, b, c] = screen.getAllByRole("tab");
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(b).toHaveFocus();
    fireEvent.keyDown(b, { key: "End" });
    expect(c).toHaveFocus();
    fireEvent.keyDown(c, { key: "ArrowRight" });
    expect(a).toHaveFocus();
    fireEvent.keyDown(a, { key: "Delete" });
    expect(closed).toEqual(["a"]);
  });
});
