import { X } from "lucide-react";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useT, type Locale } from "../../i18n";
import { notifyError } from "../../lib/errors";
import { keyLabel } from "../../lib/platform";
import { MAX_FONT_SIZE, MIN_FONT_SIZE, UI_THEMES } from "../../lib/settings";
import { getBackend } from "../../lib/tauri";
import { useSettings, type IndentMode } from "../../store/settings";
import type { Compiler, EditorTheme, Keymap, SpellLang, UiTheme } from "../../store/types";
import { DistributionPicker } from "../packages/DistributionPicker";
import { useSpell } from "../../store/spell";
import { useTex } from "../../store/tex";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-6 py-2.5 text-sm">
      <span>
        {label}
        {hint && <span className="block text-xs text-fg-muted">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const control = "h-8 w-56 rounded border border-line bg-panel px-2 text-sm text-fg";

/** Colors of each theme's sample: bar, panel, accent (the same as styles/index.css). */
const THEME_SAMPLES: Record<UiTheme, [string, string, string]> = {
  indigo: ["#191b2a", "#242840", "#6b5ce7"],
  graphite: ["#1b1b1e", "#27272b", "#2f64c8"],
  forest: ["#141f1a", "#1d2d26", "#257048"],
  ocean: ["#0f1c29", "#16283a", "#0b6f78"],
  light: ["#eeeef5", "#f6f6fa", "#6b5ce7"],
};

/** The interface themes as samples to choose from (a radio group). */
function ThemePicker({ value, onChange }: { value: UiTheme; onChange: (theme: UiTheme) => void }) {
  const t = useT();
  return (
    <div className="py-2.5 text-sm">
      <span id="ui-theme-label">{t("settings.uiTheme")}</span>
      <div
        role="radiogroup"
        aria-labelledby="ui-theme-label"
        className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2"
      >
        {UI_THEMES.map((theme) => {
          const [bar, panel, accent] = THEME_SAMPLES[theme];
          const checked = value === theme;
          return (
            <button
              key={theme}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onChange(theme)}
              className={`flex flex-col gap-1.5 rounded-md border p-1.5 text-left text-xs hover:bg-hover ${
                checked ? "border-accent-text bg-hover" : "border-line"
              }`}
            >
              <span
                aria-hidden
                className="flex h-10 overflow-hidden rounded border border-line"
                style={{ background: panel }}
              >
                <span className="w-3" style={{ background: bar }} />
                <span className="flex flex-1 items-end justify-end p-1">
                  <span className="h-3 w-6 rounded-sm" style={{ background: accent }} />
                </span>
              </span>
              <span className="px-0.5">
                {t(`settings.theme.${theme}`)}
                {theme === UI_THEMES[0] && (
                  <span className="block text-fg-muted">{t("settings.themeDefault")}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsTab() {
  const t = useT();
  const settings = useSettings();
  const appDirs = settings.appDirs;
  const { update } = settings;
  const [fonts, setFonts] = useState<string[]>([]);
  useEffect(() => {
    getBackend()
      .monospaceFonts()
      .then(setFonts)
      .catch(() => {});
  }, []);
  const fontChoices =
    settings.editorFontFamily && !fonts.includes(settings.editorFontFamily)
      ? [settings.editorFontFamily, ...fonts]
      : fonts;

  return (
    <section aria-labelledby="settings-title" className="flex h-full flex-col">
      <header className="border-b border-line px-8 py-5">
        <h1 id="settings-title" className="text-xl font-semibold">
          {t("settings.title")}
        </h1>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-8 py-4">
        <div className="flex max-w-2xl flex-col gap-6">
          <Section title={t("settings.interface")}>
            <Field label={t("settings.language")}>
              <select
                className={control}
                value={settings.locale}
                onChange={(e) => void update({ locale: e.target.value as Locale })}
              >
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </Field>
            <ThemePicker
              value={settings.uiTheme}
              onChange={(uiTheme) => void update({ uiTheme })}
            />
          </Section>

          <Section title={t("settings.editor")}>
            <Field label={t("settings.fontFamily")}>
              <select
                className={control}
                value={settings.editorFontFamily}
                onChange={(e) => void update({ editorFontFamily: e.target.value })}
              >
                <option value="">{t("settings.fontDefault")}</option>
                {fontChoices.map((family) => (
                  <option key={family} value={family}>
                    {family}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("settings.fontSize")}>
              <FontSize
                value={settings.editorFontSize}
                onChange={(editorFontSize) => void update({ editorFontSize })}
              />
            </Field>
            <Field label={t("settings.editorTheme")}>
              <select
                className={control}
                value={settings.editorTheme}
                onChange={(e) => void update({ editorTheme: e.target.value as EditorTheme })}
              >
                <option value="light">{t("settings.themeLight")}</option>
                <option value="dark">{t("settings.themeDark")}</option>
              </select>
            </Field>
            <Field
              label={t("settings.keymap")}
              hint={t("settings.keymapHint", {
                keys: ["Mod+S", "Mod+Enter", "Mod+J", "Mod+B", "Mod+I"]
                  .map((k) => keyLabel(k))
                  .join(", "),
              })}
            >
              <select
                className={control}
                value={settings.keymap}
                onChange={(e) => void update({ keymap: e.target.value as Keymap })}
              >
                <option value="default">{t("settings.keymapDefault")}</option>
                <option value="vim">Vim</option>
                <option value="emacs">Emacs</option>
              </select>
            </Field>
            <Field label={t("settings.indent")}>
              <select
                className={control}
                value={settings.indentMode}
                onChange={(e) => void update({ indentMode: e.target.value as IndentMode })}
              >
                <option value="environments">{t("settings.indentEnvironments")}</option>
                <option value="full">{t("settings.indentFull")}</option>
                <option value="none">{t("settings.indentNone")}</option>
              </select>
            </Field>
            <Check
              label={t("settings.liveCheck")}
              checked={settings.liveCheck}
              onChange={(liveCheck) => void update({ liveCheck })}
            />
            <Check
              label={t("settings.mathPreview")}
              checked={settings.mathPreview}
              onChange={(mathPreview) => void update({ mathPreview })}
            />
            <Check
              label={t("settings.mathPreviewHover")}
              checked={settings.mathPreviewHover}
              disabled={!settings.mathPreview}
              onChange={(mathPreviewHover) => void update({ mathPreviewHover })}
            />
          </Section>

          <Section title={t("settings.spelling")}>
            <Field label={t("settings.defaultSpellLang")} hint={t("settings.defaultSpellLangHint")}>
              <select
                className={control}
                value={settings.defaultSpellLang}
                onChange={(e) => void update({ defaultSpellLang: e.target.value as SpellLang })}
              >
                <option value="es">{t("spell.es")}</option>
                <option value="en">{t("spell.en")}</option>
                <option value="off">{t("spell.off")}</option>
              </select>
            </Field>
            <DictionarySection />
          </Section>

          <Section title={t("settings.history")}>
            <Field label={t("settings.historyMinutes")} hint={t("settings.historyHint")}>
              <select
                className={control}
                value={settings.historyMinutes}
                onChange={(e) => void update({ historyMinutes: Number(e.target.value) })}
              >
                <option value={0}>{t("settings.historyOff")}</option>
                {[5, 10, 15, 30, 60].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {t("settings.everyMinutes", { count: minutes })}
                  </option>
                ))}
              </select>
            </Field>
          </Section>

          <Section title={t("settings.pdf")}>
            <Check
              label={t("settings.pdfDarkMode")}
              checked={settings.pdfDarkMode}
              onChange={(pdfDarkMode) => void update({ pdfDarkMode })}
            />
          </Section>

          <Section title={t("settings.compilation")}>
            <Field label={t("settings.defaultCompiler")} hint={t("settings.defaultCompilerHint")}>
              <select
                className={control}
                value={settings.defaultCompiler}
                onChange={(e) => void update({ defaultCompiler: e.target.value as Compiler })}
              >
                <option value="pdflatex">pdfLaTeX</option>
                <option value="xelatex">XeLaTeX</option>
                <option value="lualatex">LuaLaTeX</option>
              </select>
            </Field>
          </Section>

          <TexSection />

          <Section title={t("settings.paths")}>
            <div className="flex items-center justify-between gap-6 py-2.5 text-sm">
              <div>
                <p>{t("settings.projectsDir")}</p>
                <p className="font-mono text-xs text-fg-muted">{settings.projectsDir}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  settings.chooseProjectsDir(t("settings.chooseProjectsDir")).catch(notifyError)
                }
                className="h-8 shrink-0 rounded-md border border-line px-3 text-sm hover:bg-hover"
              >
                {t("settings.change")}
              </button>
            </div>
            <p className="text-xs text-fg-muted">{t("settings.projectsDirHint")}</p>
            {appDirs && (
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {(["config", "data", "cache"] as const).map((dir) => (
                  <Fragment key={dir}>
                    <dt>{t(`settings.appDirs.${dir}`)}</dt>
                    <dd className="font-mono text-xs break-all text-fg-muted">{appDirs[dir]}</dd>
                  </Fragment>
                ))}
              </dl>
            )}
          </Section>

          <p className="text-xs text-fg-muted">{t("settings.note")}</p>
        </div>
      </div>
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Check(props: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Field label={props.label}>
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
        className="h-4 w-4 accent-accent disabled:opacity-40"
      />
    </Field>
  );
}

/** Font size: typed freely, saved when it is a valid size. */
function FontSize({ value, onChange }: { value: number; onChange: (size: number) => void }) {
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(String(value));
  }
  return (
    <input
      type="number"
      className={control}
      min={MIN_FONT_SIZE}
      max={MAX_FONT_SIZE}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const size = Number(e.target.value);
        if (Number.isInteger(size) && size >= MIN_FONT_SIZE && size <= MAX_FONT_SIZE)
          onChange(size);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

/** The personal dictionary of the spell checker: its words, each one removable. */
function DictionarySection() {
  const t = useT();
  const { personal, loadPersonal, removeWord } = useSpell();
  useEffect(() => {
    loadPersonal().catch(notifyError);
  }, [loadPersonal]);
  return (
    <div className="py-2.5">
      <p className="text-sm">{t("settings.dictionary")}</p>
      <p className="mb-2 text-xs text-fg-muted">{t("settings.dictionaryHint")}</p>
      {personal.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("settings.dictionaryEmpty")}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {personal.map((word) => (
            <li
              key={word}
              className="flex items-center gap-1 rounded border border-line bg-panel py-0.5 pr-1 pl-2 text-sm"
            >
              {word}
              <button
                type="button"
                title={t("settings.removeWord", { word })}
                aria-label={t("settings.removeWord", { word })}
                onClick={() => void removeWord(word)}
                className="rounded p-0.5 text-fg-muted hover:bg-hover hover:text-fg"
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
      <div className="mb-3 max-w-xl text-sm">
        <DistributionPicker />
      </div>
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
