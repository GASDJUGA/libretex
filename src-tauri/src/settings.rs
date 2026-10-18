//! `~/.config/libretex/settings.json` (5.8). Read leniently: a missing, unknown or invalid
//! value falls back to its default (a hand-edited file never stops the app), and keys this
//! version does not know are kept when saving.

use crate::error::{AppError, AppResult};
use crate::projects::meta::{Compiler, SPELL_LANGS};
use crate::tex::backends::TexChoice;
use crate::util::fs::{read_json, write_json};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

pub const MIN_FONT_SIZE: u32 = 8;
pub const MAX_FONT_SIZE: u32 = 32;
pub const MAX_HISTORY_MINUTES: u32 = 120;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum EditorTheme {
    #[default]
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Keymap {
    #[default]
    Default,
    Vim,
    Emacs,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum IndentMode {
    #[default]
    Environments,
    Full,
    None,
}

/// Every setting, with its default.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Interface language (`es`, `en`).
    pub locale: String,
    /// Editor font family; empty = the default monospace fonts.
    pub editor_font_family: String,
    pub editor_font_size: u32,
    pub editor_theme: EditorTheme,
    pub keymap: Keymap,
    pub indent_mode: IndentMode,
    pub live_check: bool,
    pub math_preview: bool,
    pub math_preview_hover: bool,
    pub pdf_dark_mode: bool,
    /// Compiler of new blank projects.
    pub default_compiler: Compiler,
    /// Spelling language of new projects (`es`, `en`, `off`).
    pub default_spell_lang: String,
    /// Minutes between automatic versions of the history (0: only manual and after compiling).
    pub history_minutes: u32,
    /// Where new projects are created (default `~/LibreTeX`).
    pub projects_dir: Option<PathBuf>,
    pub tex_distribution: TexChoice,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            locale: "es".into(),
            editor_font_family: String::new(),
            editor_font_size: 14,
            editor_theme: EditorTheme::default(),
            keymap: Keymap::default(),
            indent_mode: IndentMode::default(),
            live_check: true,
            math_preview: true,
            math_preview_hover: false,
            pdf_dark_mode: false,
            default_compiler: Compiler::default(),
            default_spell_lang: "es".into(),
            history_minutes: 10,
            projects_dir: None,
            tex_distribution: TexChoice::default(),
        }
    }
}

/// Keys the webview may change with `update`; the others have their own commands
/// (the projects folder is chosen in a native dialog, the TeX with `set_tex_distribution`).
const EDITABLE: [&str; 13] = [
    "locale",
    "editorFontFamily",
    "editorFontSize",
    "editorTheme",
    "keymap",
    "indentMode",
    "liveCheck",
    "mathPreview",
    "mathPreviewHover",
    "pdfDarkMode",
    "defaultCompiler",
    "defaultSpellLang",
    "historyMinutes",
];

fn valid(key: &str, settings: &Settings) -> bool {
    match key {
        "locale" => matches!(settings.locale.as_str(), "es" | "en"),
        "editorFontFamily" => {
            settings.editor_font_family.chars().count() <= 100
                && !settings
                    .editor_font_family
                    .chars()
                    .any(|c| c.is_control() || matches!(c, ';' | '{' | '}' | '"' | '\\'))
        }
        "editorFontSize" => (MIN_FONT_SIZE..=MAX_FONT_SIZE).contains(&settings.editor_font_size),
        "defaultSpellLang" => SPELL_LANGS.contains(&settings.default_spell_lang.as_str()),
        "historyMinutes" => settings.history_minutes <= MAX_HISTORY_MINUTES,
        "projectsDir" => settings
            .projects_dir
            .as_ref()
            .is_none_or(|p| p.is_absolute()),
        _ => true,
    }
}

impl Settings {
    /// Settings from a JSON object, field by field: what is missing or invalid gets its
    /// default.
    pub fn from_map(map: &Map<String, Value>) -> Self {
        let defaults = Self::default();
        let mut out = serde_json::to_value(&defaults)
            .ok()
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default();
        for (key, value) in out.iter_mut() {
            let Some(stored) = map.get(key) else { continue };
            // Try the stored value alone on top of the defaults.
            let mut candidate = serde_json::to_value(&defaults).unwrap_or_default();
            candidate[key.as_str()] = stored.clone();
            if let Ok(parsed) = serde_json::from_value::<Settings>(candidate)
                && valid(key, &parsed)
            {
                *value = stored.clone();
            }
        }
        serde_json::from_value(Value::Object(out)).unwrap_or(defaults)
    }

    /// The setting `key` as JSON.
    fn get(&self, key: &str) -> Value {
        serde_json::to_value(self)
            .ok()
            .and_then(|v| v.get(key).cloned())
            .unwrap_or(Value::Null)
    }
}

/// The stored file as a JSON object (empty if it does not exist).
fn read_map(path: &Path) -> AppResult<Map<String, Value>> {
    Ok(read_json::<Map<String, Value>>(path)?.unwrap_or_default())
}

pub fn load(path: &Path) -> AppResult<Settings> {
    Ok(Settings::from_map(&read_map(path)?))
}

/// Applies `changes` (only editable keys, each one valid) and saves; unknown keys of the
/// file are kept. Returns the new settings.
pub fn update(path: &Path, changes: &Map<String, Value>) -> AppResult<Settings> {
    let mut map = read_map(path)?;
    for (key, value) in changes {
        if !EDITABLE.contains(&key.as_str()) {
            return Err(AppError::Forbidden(format!("ajuste «{key}»")));
        }
        map.insert(key.clone(), value.clone());
    }
    let settings = Settings::from_map(&map);
    for (key, value) in changes {
        if &settings.get(key) != value {
            return Err(AppError::Forbidden(format!("valor no válido para «{key}»")));
        }
    }
    write_json(path, &map)?;
    Ok(settings)
}

/// Sets one key that has its own command (`texDistribution`, `projectsDir`), keeping the
/// rest.
pub fn set(path: &Path, key: &str, value: Value) -> AppResult<Settings> {
    let mut map = read_map(path)?;
    map.insert(key.to_owned(), value);
    write_json(path, &map)?;
    Ok(Settings::from_map(&map))
}

/// Monospace font families installed (`fc-list`), sorted; empty if unavailable.
pub fn monospace_fonts() -> Vec<String> {
    let Ok(output) = std::process::Command::new("fc-list")
        .args([":spacing=mono", "family"])
        .output()
    else {
        return Vec::new();
    };
    let mut families: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        // «Noto Sans Mono,Noto Sans Mono CJK»: the first name.
        .filter_map(|line| line.split(',').next())
        .map(str::trim)
        .filter(|f| !f.is_empty() && !f.contains("Emoji"))
        .map(str::to_owned)
        .collect();
    families.sort_by_key(|f| f.to_lowercase());
    families.dedup();
    families
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    fn changes(value: Value) -> Map<String, Value> {
        value.as_object().unwrap().clone()
    }

    #[test]
    fn sin_archivo_todo_por_defecto() {
        let dir = TempDir::new().unwrap();
        assert_eq!(
            load(&dir.path().join("settings.json")).unwrap(),
            Settings::default()
        );
    }

    #[test]
    fn un_valor_invalido_no_tumba_los_demas() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(
            &path,
            r#"{ "keymap": "vim", "editorFontSize": 400, "editorTheme": "neón",
                 "liveCheck": "sí", "texDistribution": "system", "futuro": 1 }"#,
        )
        .unwrap();
        let s = load(&path).unwrap();
        assert_eq!(s.keymap, Keymap::Vim);
        assert_eq!(s.editor_font_size, 14);
        assert_eq!(s.editor_theme, EditorTheme::Light);
        assert!(s.live_check);
        assert_eq!(s.tex_distribution, TexChoice::System);
    }

    #[test]
    fn guarda_cambios_validos_y_conserva_las_claves_desconocidas() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config/settings.json");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, r#"{ "futuro": 1, "texDistribution": "libretex" }"#).unwrap();
        let s = update(
            &path,
            &changes(
                json!({ "editorTheme": "dark", "editorFontSize": 16, "keymap": "emacs",
                             "defaultCompiler": "lualatex", "locale": "en" }),
            ),
        )
        .unwrap();
        assert_eq!(
            (
                s.editor_theme,
                s.editor_font_size,
                s.keymap,
                s.default_compiler,
                s.locale.as_str()
            ),
            (
                EditorTheme::Dark,
                16,
                Keymap::Emacs,
                Compiler::Lualatex,
                "en"
            )
        );
        let stored: Map<String, Value> =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(stored["futuro"], json!(1));
        assert_eq!(stored["texDistribution"], json!("libretex"));
        // A restart reads the same.
        assert_eq!(load(&path).unwrap(), s);
    }

    #[test]
    fn rechaza_valores_invalidos_y_claves_ajenas() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("settings.json");
        for bad in [
            json!({ "editorFontSize": 2 }),
            json!({ "keymap": "nano" }),
            json!({ "locale": "fr" }),
            json!({ "defaultSpellLang": "de" }),
            json!({ "editorFontFamily": "x; background: red" }),
            json!({ "projectsDir": "/tmp" }),
            json!({ "texDistribution": "system" }),
            json!({ "liveCheck": "no" }),
            json!({ "historyMinutes": 500 }),
        ] {
            assert!(
                matches!(
                    update(&path, &changes(bad.clone())),
                    Err(AppError::Forbidden(_))
                ),
                "{bad}"
            );
        }
        // Nothing was written.
        assert!(!path.exists());
    }

    #[test]
    fn una_carpeta_de_proyectos_relativa_se_ignora() {
        let mut map = Map::new();
        map.insert("projectsDir".into(), json!("relativa"));
        assert_eq!(Settings::from_map(&map).projects_dir, None);
        map.insert("projectsDir".into(), json!("/home/x/Proyectos"));
        assert_eq!(
            Settings::from_map(&map).projects_dir,
            Some(PathBuf::from("/home/x/Proyectos"))
        );
    }

    #[test]
    fn la_distribucion_tex_se_guarda_aparte() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("settings.json");
        update(&path, &changes(json!({ "keymap": "vim" }))).unwrap();
        let s = set(&path, "texDistribution", json!("system")).unwrap();
        assert_eq!(
            (s.keymap, s.tex_distribution),
            (Keymap::Vim, TexChoice::System)
        );
    }
}
