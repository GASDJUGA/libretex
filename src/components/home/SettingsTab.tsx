import type { ReactNode } from "react";
import { useI18n, useT, type Locale } from "../../i18n";
import { notifyError } from "../../lib/errors";
import { useSettings, type IndentMode } from "../../store/settings";
import { useTex } from "../../store/tex";

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
  const t = useT();
  const { locale, setLocale } = useI18n();
  const {
    indentMode,
    setIndentMode,
    liveCheck,
    setLiveCheck,
    mathPreview,
    setMathPreview,
    mathPreviewHover,
    setMathPreviewHover,
  } = useSettings();
  return (
    <section aria-labelledby="settings-title" className="flex h-full flex-col">
      <header className="border-b border-line px-8 py-5">
        <h1 id="settings-title" className="text-xl font-semibold">
          {t("settings.title")}
        </h1>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-8 py-4">
        <div className="flex max-w-2xl flex-col gap-6">
          <fieldset>
            <legend className="mb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
              {t("settings.interface")}
            </legend>
            <Field label={t("settings.language")}>
              <select
                className={control}
                value={locale}
                onChange={(e) => setLocale(e.target.value as Locale)}
              >
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </Field>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
              {t("settings.editor")}
            </legend>
            <Field label={t("settings.indent")}>
              <select
                className={control}
                value={indentMode}
                onChange={(e) => setIndentMode(e.target.value as IndentMode)}
              >
                <option value="environments">{t("settings.indentEnvironments")}</option>
                <option value="full">{t("settings.indentFull")}</option>
                <option value="none">{t("settings.indentNone")}</option>
              </select>
            </Field>
            <Field label={t("settings.liveCheck")}>
              <input
                type="checkbox"
                checked={liveCheck}
                onChange={(e) => setLiveCheck(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
            </Field>
            <Field label={t("settings.mathPreview")}>
              <input
                type="checkbox"
                checked={mathPreview}
                onChange={(e) => setMathPreview(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
            </Field>
            <Field label={t("settings.mathPreviewHover")}>
              <input
                type="checkbox"
                checked={mathPreviewHover}
                disabled={!mathPreview}
                onChange={(e) => setMathPreviewHover(e.target.checked)}
                className="h-4 w-4 accent-accent disabled:opacity-40"
              />
            </Field>
            <Field label={t("settings.editorTheme")}>
              <select className={control} defaultValue="light">
                <option value="light">{t("settings.themeLight")}</option>
                <option value="dark">{t("settings.themeDark")}</option>
              </select>
            </Field>
            <Field label={t("settings.fontSize")}>
              <input type="number" className={control} defaultValue={14} min={8} max={32} />
            </Field>
            <Field label={t("settings.keymap")}>
              <select className={control} defaultValue="default">
                <option value="default">{t("settings.keymapDefault")}</option>
                <option value="vim">Vim</option>
                <option value="emacs">Emacs</option>
              </select>
            </Field>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
              {t("settings.compilation")}
            </legend>
            <Field label={t("settings.defaultCompiler")}>
              <select className={control} defaultValue="xelatex">
                <option value="pdflatex">pdfLaTeX</option>
                <option value="xelatex">XeLaTeX</option>
                <option value="lualatex">LuaLaTeX</option>
              </select>
            </Field>
          </fieldset>
          <TexSection />
          <fieldset>
            <legend className="mb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
              {t("settings.paths")}
            </legend>
            <Field label={t("settings.projectsDir")}>
              <input type="text" className={control} defaultValue="~/LibreTeX" />
            </Field>
          </fieldset>
          <p className="text-xs text-fg-muted">{t("settings.note")}</p>
        </div>
      </div>
    </section>
  );
}

const TOOLS = ["latexmk", "pdflatex", "xelatex", "lualatex", "biber", "bibtex", "synctex"] as const;

/** Tools found by the backend, with their versions. */
function TexSection() {
  const t = useT();
  const { status, loading, load } = useTex();
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
        {t("tex.title")}
      </legend>
      <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-fg-muted">{t("tex.distribution")}</dt>
        <dd>{status?.distribution ?? "—"}</dd>
        {TOOLS.map((tool) => {
          const found = status?.[tool];
          return (
            <div key={tool} className="contents">
              <dt className="font-mono text-fg-muted">{tool}</dt>
              <dd className={found ? "" : "text-warning"}>
                {found ? (
                  <>
                    {found.version ?? t("tex.unknownVersion")}{" "}
                    <span className="font-mono text-xs text-fg-muted">{found.path}</span>
                  </>
                ) : status ? (
                  t("tex.notFound")
                ) : (
                  "…"
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      <button
        type="button"
        disabled={loading}
        onClick={() => load(true).catch(notifyError)}
        className="mt-2 h-8 rounded-md border border-line px-3 text-sm hover:bg-hover disabled:opacity-50"
      >
        {t("tex.redetect")}
      </button>
    </fieldset>
  );
}
