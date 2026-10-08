import type { ReactNode } from "react";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-6 py-2.5 text-sm">
      <span>{label}</span>
      {children}
    </label>
  );
}

const control = "h-8 w-56 rounded border border-line bg-panel px-2 text-sm text-fg";

export function SettingsTab() {
  return (
    <section aria-labelledby="settings-title" className="flex h-full flex-col">
      <header className="border-b border-line px-8 py-5">
        <h1 id="settings-title" className="text-xl font-semibold">
          Ajustes
        </h1>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-8 py-4">
        <div className="flex max-w-2xl flex-col gap-6">
          <fieldset>
            <legend className="mb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
              Interfaz
            </legend>
            <Field label="Idioma">
              <select className={control} defaultValue="es">
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </Field>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
              Editor
            </legend>
            <Field label="Tema del editor">
              <select className={control} defaultValue="light">
                <option value="light">Claro</option>
                <option value="dark">Oscuro</option>
              </select>
            </Field>
            <Field label="Tamaño de fuente">
              <input type="number" className={control} defaultValue={14} min={8} max={32} />
            </Field>
            <Field label="Atajos de teclado">
              <select className={control} defaultValue="default">
                <option value="default">Normal</option>
                <option value="vim">Vim</option>
                <option value="emacs">Emacs</option>
              </select>
            </Field>
            <Field label="Preview de matemáticas">
              <input type="checkbox" defaultChecked className="h-4 w-4 accent-accent" />
            </Field>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
              Compilación
            </legend>
            <Field label="Compilador por defecto">
              <select className={control} defaultValue="xelatex">
                <option value="pdflatex">pdfLaTeX</option>
                <option value="xelatex">XeLaTeX</option>
                <option value="lualatex">LuaLaTeX</option>
              </select>
            </Field>
            <Field label="Retardo de compilación automática (s)">
              <input type="number" className={control} defaultValue={1.5} step={0.5} min={0.5} />
            </Field>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
              Rutas
            </legend>
            <Field label="Directorio de proyectos">
              <input type="text" className={control} defaultValue="~/LibreTeX" />
            </Field>
          </fieldset>
          <p className="text-xs text-fg-muted">
            Los ajustes se guardarán y aplicarán en la Fase 9.
          </p>
        </div>
      </div>
    </section>
  );
}
