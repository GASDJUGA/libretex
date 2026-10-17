import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SettingsTab } from "../components/home/SettingsTab";
import { useI18n } from "../i18n";
import { applyEditorAppearance } from "../lib/appearance";
import { createMockBackend, type MockBackend } from "../lib/mockBackend";
import { setBackend } from "../lib/tauri";
import { resetApp } from "../test/reset";
import { initialSettingsState, LEGACY_STORAGE_KEY, useSettings } from "./settings";
import { useToasts } from "./toasts";

let backend: MockBackend;

beforeEach(() => {
  resetApp();
  backend = createMockBackend();
  setBackend(backend);
});

/** As after restarting the app: fresh store, same settings file. */
async function restart() {
  useSettings.setState(initialSettingsState);
  await act(() => useSettings.getState().load());
}

describe("ajustes", () => {
  it("se guardan y siguen ahí al reiniciar", async () => {
    await useSettings.getState().load();
    await useSettings.getState().update({ keymap: "vim", editorFontSize: 17, liveCheck: false });
    await restart();
    const s = useSettings.getState();
    expect([s.keymap, s.editorFontSize, s.liveCheck, s.loaded]).toEqual(["vim", 17, false, true]);
    expect((await backend.getSettings()).settings.keymap).toBe("vim");
  });

  it("un valor no válido se rechaza, se avisa y se vuelve al guardado", async () => {
    await useSettings.getState().load();
    await useSettings.getState().update({ editorFontSize: 99 });
    expect(useSettings.getState().editorFontSize).toBe(14);
    expect(useToasts.getState().toasts.at(-1)?.kind).toBe("error");
  });

  it("lo que versiones anteriores guardaban en el navegador pasa a settings.json una vez", async () => {
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({ state: { indentMode: "full", pdfDarkMode: true, raro: 1 }, version: 0 }),
    );
    await useSettings.getState().load();
    expect((await backend.getSettings()).settings).toMatchObject({
      indentMode: "full",
      pdfDarkMode: true,
    });
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("el idioma de la interfaz se aplica al cargar y al cambiarlo", async () => {
    await backend.updateSettings({ locale: "en" });
    await useSettings.getState().load();
    expect(useI18n.getState().locale).toBe("en");
  });

  it("tema y fuente del editor como CSS", () => {
    const root = document.createElement("div");
    applyEditorAppearance(
      { editorTheme: "dark", editorFontFamily: "Fira Code", editorFontSize: 16 },
      root,
    );
    expect(root.dataset.editorTheme).toBe("dark");
    expect(root.style.getPropertyValue("--lt-editor-font")).toBe('"Fira Code", var(--font-mono)');
    expect(root.style.getPropertyValue("--lt-editor-font-size")).toBe("16px");
    applyEditorAppearance({ editorTheme: "light", editorFontFamily: "", editorFontSize: 14 }, root);
    expect(root.style.getPropertyValue("--lt-editor-font")).toBe("");
  });
});

describe("pantalla de Ajustes", () => {
  it("cada opción se guarda al cambiarla", async () => {
    render(<SettingsTab />);
    await act(() => useSettings.getState().load());
    fireEvent.change(screen.getByRole("combobox", { name: "Tema del editor" }), {
      target: { value: "dark" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /Atajos de teclado/ }), {
      target: { value: "emacs" },
    });
    fireEvent.change(await screen.findByRole("combobox", { name: "Fuente" }), {
      target: { value: "Fira Code" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Tamaño de fuente" }), {
      target: { value: "18" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /Compilador por defecto/ }), {
      target: { value: "lualatex" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /Idioma de los proyectos nuevos/ }), {
      target: { value: "en" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Páginas en modo oscuro/ }));
    await waitFor(async () =>
      expect((await backend.getSettings()).settings).toMatchObject({
        editorTheme: "dark",
        keymap: "emacs",
        editorFontFamily: "Fira Code",
        editorFontSize: 18,
        defaultCompiler: "lualatex",
        defaultSpellLang: "en",
        pdfDarkMode: true,
      }),
    );
    // A new blank project gets the defaults.
    const project = await backend.createProject("Nuevo", null);
    expect([project.compiler, project.spellLang]).toEqual(["lualatex", "en"]);
  });

  it("cambiar la carpeta de proyectos usa el diálogo del sistema", async () => {
    render(<SettingsTab />);
    await act(() => useSettings.getState().load());
    expect(screen.getByText("~/LibreTeX")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar…" }));
    expect(await screen.findByText("~/Documentos/Proyectos LaTeX")).toBeInTheDocument();
  });

  it("el idioma de la interfaz cambia en vivo", async () => {
    render(<SettingsTab />);
    await act(() => useSettings.getState().load());
    fireEvent.change(screen.getByRole("combobox", { name: "Idioma" }), {
      target: { value: "en" },
    });
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });
});
