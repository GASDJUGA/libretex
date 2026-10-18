import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../../App";
import { createMockBackend, type MockBackend } from "../../lib/mockBackend";
import { repoKey, repoNameOf } from "../../lib/remote";
import { setBackend } from "../../lib/tauri";
import { useAppStore } from "../../store/app";
import { resetApp } from "../../test/reset";

let backend: MockBackend;

beforeEach(() => {
  resetApp();
  backend = createMockBackend();
  setBackend(backend);
});

async function openCloneDialog() {
  render(<App />);
  await screen.findByRole("button", { name: "Abrir Tesis de magíster" });
  fireEvent.click(screen.getByRole("button", { name: "Desde GitHub" }));
  return screen.findByRole("dialog", { name: "Importar desde GitHub" });
}

describe("importar desde GitHub", () => {
  it("la misma dirección en sus formas, como en Rust", () => {
    for (const url of [
      "https://github.com/ana/tesis",
      "https://github.com/Ana/Tesis.git",
      "git@github.com:ana/tesis.git",
      "ssh://git@github.com/ana/tesis.git",
    ]) {
      expect(repoKey(url), url).toBe("github.com/ana/tesis");
    }
    expect(repoKey("/home/ana/tesis")).toBeNull();
    expect(repoNameOf("git@github.com:ana/Tesis-2.git")).toBe("Tesis-2");
  });

  it("lista los repositorios, importa uno y lo abre con el respaldo conectado", async () => {
    const dialog = await openCloneDialog();
    const list = await within(dialog).findByRole("list", { name: "Tus repositorios en GitHub" });
    await within(list).findByText("ana/apuntes-calculo");
    const submit = within(dialog).getByRole("button", { name: "Importar" });
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Filtrar repositorios" }), {
      target: { value: "cálculo" },
    });
    expect(within(list).queryByText("ana/dotfiles")).not.toBeInTheDocument();
    fireEvent.click(within(list).getByRole("button", { name: /ana\/apuntes-calculo/ }));
    fireEvent.click(submit);

    expect(
      await screen.findByRole("button", { name: "Proyecto apuntes-calculo" }),
    ).toBeInTheDocument();
    const route = useAppStore.getState().route;
    expect(route).toMatchObject({ name: "project" });
    const id = route.name === "project" ? route.projectId : "";
    expect(await backend.backupStatus(id)).toMatchObject({
      enabled: true,
      remote: "https://github.com/ana/apuntes-calculo",
      ahead: 0,
      behind: 0,
    });
  });

  it("un repositorio que ya está en LibreTeX se abre en vez de importarse", async () => {
    await backend.updateSettings({ gitName: "Ana", gitEmail: "ana@x.cl" });
    await backend.backupEnable("tesis");
    await backend.backupConnectUrl("tesis", "git@github.com:ana/Tesis-de-magister.git");
    const dialog = await openCloneDialog();
    const list = await within(dialog).findByRole("list", { name: "Tus repositorios en GitHub" });
    const row = (await within(list).findByText("ana/Tesis-de-magister")).closest("li")!;
    expect(row).toHaveTextContent("Ya está en LibreTeX");
    fireEvent.click(within(row).getByRole("button", { name: "Abrir" }));
    await waitFor(() =>
      expect(useAppStore.getState().route).toEqual({ name: "project", projectId: "tesis" }),
    );
  });

  it("acepta una dirección escrita y rechaza las que no son https ni git@", async () => {
    const dialog = await openCloneDialog();
    const input = within(dialog).getByRole("textbox", { name: /O la dirección/ });
    const submit = within(dialog).getByRole("button", { name: "Importar" });
    fireEvent.change(input, { target: { value: "file:///home/ana/tesis" } });
    expect(submit).toBeDisabled();
    fireEvent.change(input, { target: { value: "git@github.com:otra/informe.git" } });
    fireEvent.click(submit);
    expect(await screen.findByRole("button", { name: "Proyecto informe" })).toBeInTheDocument();
  });
});
