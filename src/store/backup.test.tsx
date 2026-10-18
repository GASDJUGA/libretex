import { EditorView } from "@codemirror/view";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Project } from "../app/Project";
import { createMockBackend, type MockBackend } from "../lib/mockBackend";
import { repoNameFor, validRemoteUrl, validRepoName } from "../lib/remote";
import { cleanIdentity } from "../lib/settings";
import { setBackend } from "../lib/tauri";
import { resetApp } from "../test/reset";
import { useBackup } from "./backup";
import { useBuffers } from "./buffers";
import { useProjectView } from "./project";
import { useToasts } from "./toasts";

let backend: MockBackend;

beforeEach(() => {
  resetApp();
  backend = createMockBackend();
  setBackend(backend);
});

function editorView() {
  const dom = screen.getByTestId("code-editor").querySelector<HTMLElement>(".cm-editor")!;
  return EditorView.findFromDOM(dom)!;
}

async function openBackupPanel() {
  render(<Project projectId="tesis" />);
  await screen.findByText(/Este documento es un ejemplo/);
  fireEvent.click(screen.getByRole("button", { name: "Respaldo con Git" }));
  return screen.findByRole("region", { name: "Respaldo con Git" });
}

describe("autor de los respaldos", () => {
  it("acepta lo que acepta Rust", () => {
    expect(cleanIdentity({ name: " Ana ", email: " ana@x.cl " })).toEqual({
      name: "Ana",
      email: "ana@x.cl",
    });
    for (const [name, email] of [
      ["", "a@b"],
      ["A<b>", "a@b"],
      ["Ana", "sin-arroba"],
      ["Ana", "a@b@c"],
      ["Ana", "a b@c"],
      ["Ana", "-a@b"],
    ]) {
      expect(cleanIdentity({ name, email }), `${name} ${email}`).toBeNull();
    }
  });
});

describe("activar el respaldo con Git", () => {
  it("pide el autor una vez, sugiere el de GitHub y crea el .gitignore", async () => {
    const panel = await openBackupPanel();
    fireEvent.click(
      await within(panel).findByRole("button", { name: "Activar el respaldo con Git" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Activar el respaldo con Git" });
    const submit = within(dialog).getByRole("button", { name: "Activar" });
    // Without an author it cannot be turned on.
    expect(submit).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Usar mi cuenta de GitHub" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("textbox", { name: "Correo" })).toHaveValue(
        "1234567+ana@users.noreply.github.com",
      ),
    );
    expect(within(dialog).getByRole("textbox", { name: "Nombre" })).toHaveValue("Ana Pérez");
    fireEvent.click(submit);
    await within(panel).findByText("Rama «main»");
    expect(within(panel).getByText(/Ana Pérez <1234567\+ana@/)).toBeInTheDocument();

    const status = await backend.backupStatus("tesis");
    expect(status).toMatchObject({ enabled: true, identitySource: "libretex" });
    expect((await backend.readTextFile("tesis", ".gitignore")).content).toMatch(/\.libretex\//);
    // Kept for the next projects.
    const { settings } = await backend.getSettings();
    expect(settings).toMatchObject({ gitName: "Ana Pérez" });
  });

  it("con un autor ya conocido no lo pide", async () => {
    await backend.updateSettings({ gitName: "Bea", gitEmail: "bea@x.cl" });
    const panel = await openBackupPanel();
    fireEvent.click(
      await within(panel).findByRole("button", { name: "Activar el respaldo con Git" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Activar el respaldo con Git" });
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Bea <bea@x.cl>")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Activar" }));
    await within(panel).findByText("Rama «main»");
  });

  it("el panel es del proyecto en pantalla y se recuerda", async () => {
    await openBackupPanel();
    expect(useProjectView.getState().sidePanel).toBe("backup");
    await act(() => useBackup.getState().load("tesis"));
    expect(useBackup.getState().status?.enabled).toBe(false);
  });
});

describe("respaldar y restaurar", () => {
  async function enabledPanel() {
    await backend.updateSettings({ gitName: "Ana", gitEmail: "ana@x.cl" });
    await backend.backupEnable("tesis");
    return openBackupPanel();
  }

  it("lista los cambios, respalda con el mensaje por defecto y sigue lo que se guarda", async () => {
    const panel = await enabledPanel();
    const changes = await within(panel).findByRole("list", { name: "Cambios sin respaldar" });
    expect(within(changes).getByText("main.tex")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Respaldar" }));
    await within(panel).findByText("No hay cambios desde el último respaldo.");
    const [first] = await backend.backupList("tesis");
    expect(first.message).toMatch(/^Respaldo del /);
    expect(within(panel).getByRole("list", { name: "Respaldos anteriores" })).toHaveTextContent(
      first.message,
    );

    // A save in the editor shows up as a change.
    act(() => editorView().dispatch({ changes: { from: 0, insert: "% cambio\n" } }));
    await act(() => useBuffers.getState().saveAll());
    await waitFor(
      () =>
        expect(
          within(panel).getByRole("list", { name: "Cambios sin respaldar" }),
        ).toHaveTextContent("main.tex"),
      { timeout: 2000 },
    );
    fireEvent.change(within(panel).getByRole("textbox", { name: "Mensaje del respaldo" }), {
      target: { value: "Capítulo 1" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Respaldar" }));
    await waitFor(() =>
      expect(useToasts.getState().toasts.at(-1)?.title).toBe("Respaldo «Capítulo 1» hecho."),
    );
  });

  it("un respaldo se ve en el panel central y se restaura respaldando antes lo actual", async () => {
    const panel = await enabledPanel();
    await act(async () => {
      await backend.backupCreate("tesis", "v1");
    });
    act(() => editorView().dispatch({ changes: { from: 0, insert: "% después\n" } }));
    await act(() => useBuffers.getState().saveAll());
    await act(() => useBackup.getState().refresh());
    fireEvent.click(await within(panel).findByRole("button", { name: /^v1/ }));
    const pane = await screen.findByRole("region", { name: "Respaldos" });
    fireEvent.click(await within(pane).findByRole("button", { name: "Restaurar el proyecto" }));
    const dialog = await screen.findByRole("dialog", { name: "¿Restaurar el proyecto?" });
    expect(dialog).toHaveTextContent("Antes se hace un respaldo con lo que hay ahora");
    fireEvent.click(within(dialog).getByRole("button", { name: "Restaurar el proyecto" }));
    await waitFor(async () =>
      expect((await backend.readTextFile("tesis", "main.tex")).content).not.toMatch(/^% después/),
    );
    const messages = (await backend.backupList("tesis")).map((b) => b.message);
    expect(messages).toEqual(["Antes de restaurar el proyecto", "v1"]);
    // The open file shows what was restored.
    await waitFor(() =>
      expect(useBuffers.getState().buffers["main.tex"].content).not.toMatch(/^% después/),
    );
    // The Historial button shows LibreTeX's versions again.
    fireEvent.click(screen.getByRole("button", { name: "Historial" }));
    await screen.findByRole("region", { name: "Historial" });
  });
});

describe("GitHub", () => {
  it("direcciones y nombres como en Rust", () => {
    expect(validRemoteUrl("https://github.com/ana/tesis.git")).toBe(true);
    expect(validRemoteUrl("git@github.com:ana/tesis.git")).toBe(true);
    for (const bad of [
      "http://github.com/a/b",
      "https://ana:token@github.com/a/b",
      "file:///tmp/x",
      "--upload-pack=x",
      "https://github.com/../x",
      "git@github.com:-x",
    ]) {
      expect(validRemoteUrl(bad), bad).toBe(false);
    }
    expect(repoNameFor("Tesis de magíster")).toBe("Tesis-de-magister");
    expect(repoNameFor("¿?")).toBe("proyecto-latex");
    expect(validRepoName("Tesis-de-magister")).toBe(true);
    expect(validRepoName("con espacio")).toBe(false);
  });

  async function connectedPanel() {
    await backend.updateSettings({ gitName: "Ana", gitEmail: "ana@x.cl" });
    await backend.backupEnable("tesis");
    await backend.backupCreate("tesis", "v1");
    const panel = await openBackupPanel();
    fireEvent.click(await within(panel).findByRole("button", { name: "Conectar con GitHub…" }));
    const dialog = await screen.findByRole("dialog", { name: "Conectar con GitHub" });
    expect(within(dialog).getByRole("textbox", { name: "Nombre del repositorio" })).toHaveValue(
      "Tesis-de-magister",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Crear y conectar" }));
    await within(panel).findByText("github.com/ana/Tesis-de-magister");
    expect(within(panel).getByText("Todavía no se subió nada.")).toBeInTheDocument();
    return panel;
  }

  it("crea el repositorio, sube y trae al editor un cambio hecho en otro clon", async () => {
    const panel = await connectedPanel();
    fireEvent.click(within(panel).getByRole("button", { name: "Subir" }));
    await within(panel).findByText(/Al día con el remoto/);
    expect((await backend.backupList("tesis"))[0].pushed).toBe(true);

    backend.remoteBackup("tesis", "desde otro clon", { "main.tex": "% del otro clon\n" });
    fireEvent.click(within(panel).getByRole("button", { name: "Traer cambios" }));
    await waitFor(() =>
      expect(useToasts.getState().toasts.at(-1)?.title).toBe("Se trajo 1 respaldo del remoto."),
    );
    // The open file shows what was pulled.
    await waitFor(() => expect(editorView().state.doc.toString()).toBe("% del otro clon\n"));
    expect((await backend.backupList("tesis"))[0].message).toBe("desde otro clon");
  });

  it("si ambos lados cambiaron lo explica y no mezcla nada", async () => {
    const panel = await connectedPanel();
    fireEvent.click(within(panel).getByRole("button", { name: "Subir" }));
    await within(panel).findByText(/Al día con el remoto/);
    backend.remoteBackup("tesis", "remoto", { "main.tex": "remoto\n" });
    act(() => editorView().dispatch({ changes: { from: 0, insert: "% local\n" } }));
    await act(() => useBuffers.getState().saveAll());
    await act(async () => {
      await backend.backupCreate("tesis", "local");
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Traer cambios" }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      "Hay respaldos nuevos aquí y también en el remoto",
    );
    expect(editorView().state.doc.toString()).toMatch(/^% local/);
  });

  it("sube después de cada respaldo si se pide", async () => {
    const panel = await connectedPanel();
    fireEvent.click(
      within(panel).getByRole("checkbox", { name: "Subir después de cada respaldo" }),
    );
    await waitFor(() => expect(useBackup.getState().status?.pushAfterBackup).toBe(true));
    act(() => editorView().dispatch({ changes: { from: 0, insert: "% nuevo\n" } }));
    await act(() => useBuffers.getState().saveAll());
    await act(() => useBackup.getState().refresh());
    fireEvent.click(within(panel).getByRole("button", { name: "Respaldar" }));
    await waitFor(async () =>
      expect((await backend.backupList("tesis")).every((b) => b.pushed)).toBe(true),
    );
  });
});
