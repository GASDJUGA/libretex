//! Per-project metadata stored in `<project>/.jutex/project.json`.

use crate::error::AppResult;
use crate::util::fs::{read_json, write_json};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Folder with JuTeX's per-project data (metadata, build output, history).
pub const META_DIR: &str = ".jutex";
/// The same folder as LibreTeX (before 2.0.0) named it: renamed when the project is opened
/// ([`migrate_legacy`]); if both exist, the old one stays hidden and out of everything.
pub const LEGACY_META_DIR: &str = ".libretex";

/// Whether a name (the first component of a project path) is JuTeX's own folder, under its
/// name or the old one.
pub fn is_meta_dir(name: impl AsRef<std::ffi::OsStr>) -> bool {
    let name = name.as_ref();
    name == META_DIR || name == LEGACY_META_DIR
}

/// A project used by LibreTeX: its `.libretex/` becomes `.jutex/` (unless that already
/// exists), and a `.gitignore` that ignored `.libretex/` ignores `.jutex/` too.
pub fn migrate_legacy(root: &Path) -> AppResult<()> {
    let legacy = root.join(LEGACY_META_DIR);
    let current = root.join(META_DIR);
    if legacy.is_dir() && !current.exists() {
        std::fs::rename(&legacy, &current).map_err(|e| crate::error::AppError::io(&legacy, e))?;
    }
    let ignore = root.join(".gitignore");
    let Ok(text) = std::fs::read_to_string(&ignore) else {
        return Ok(());
    };
    let is_line = |line: &str, dir: &str| {
        let line = line.trim().trim_start_matches('/').trim_end_matches('/');
        line == dir
    };
    if text.lines().any(|l| is_line(l, META_DIR)) {
        return Ok(());
    }
    let Some(at) = text.lines().position(|l| is_line(l, LEGACY_META_DIR)) else {
        return Ok(());
    };
    let mut lines: Vec<&str> = text.lines().collect();
    let added = format!("{META_DIR}/");
    lines.insert(at + 1, &added);
    let mut out = lines.join("\n");
    if text.ends_with('\n') {
        out.push('\n');
    }
    crate::util::fs::atomic_write(&ignore, out.as_bytes())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Compiler {
    Pdflatex,
    #[default]
    Xelatex,
    Lualatex,
}

fn default_main_file() -> String {
    "main.tex".to_owned()
}

fn default_spell_lang() -> String {
    "es".to_owned()
}

/// Spelling languages of a project: Spanish, English or no checking.
pub const SPELL_LANGS: [&str; 3] = ["es", "en", "off"];

/// A stored `spellLang`, or the default if it is not one of [`SPELL_LANGS`].
pub fn spell_lang_or_default(lang: &str) -> String {
    if SPELL_LANGS.contains(&lang) {
        lang.to_owned()
    } else {
        default_spell_lang()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMeta {
    #[serde(default = "default_main_file")]
    pub main_file: String,
    #[serde(default)]
    pub compiler: Compiler,
    #[serde(default)]
    pub shell_escape: bool,
    #[serde(default = "default_spell_lang")]
    pub spell_lang: String,
    /// «Subir después de cada respaldo» (Git backup, 5.9).
    #[serde(default)]
    pub backup_push: bool,
    /// Where pasted images are saved, relative to the root (`""`: the root itself).
    #[serde(default)]
    pub figures_dir: String,
}

impl Default for ProjectMeta {
    fn default() -> Self {
        Self {
            main_file: default_main_file(),
            compiler: Compiler::default(),
            shell_escape: false,
            spell_lang: default_spell_lang(),
            backup_push: false,
            figures_dir: String::new(),
        }
    }
}

pub fn meta_path(project: &Path) -> PathBuf {
    project.join(META_DIR).join("project.json")
}

/// Reads the project's metadata; missing fields (or a missing file) take their defaults.
/// A project of LibreTeX is migrated first ([`migrate_legacy`]); if that fails, its old file is
/// read as it is.
pub fn read_meta(project: &Path) -> AppResult<Option<ProjectMeta>> {
    if let Err(error) = migrate_legacy(project) {
        eprintln!("no se pudo migrar {}: {error}", project.display());
        let legacy = project.join(LEGACY_META_DIR).join("project.json");
        if !meta_path(project).exists() && legacy.is_file() {
            return read_json(&legacy);
        }
    }
    read_json(&meta_path(project))
}

pub fn write_meta(project: &Path, meta: &ProjectMeta) -> AppResult<()> {
    // Never a new `.jutex/` beside the old folder: its build and history would stay behind.
    migrate_legacy(project)?;
    write_json(&meta_path(project), meta)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn campos_ausentes_toman_valores_por_defecto() {
        let tmp = TempDir::new().unwrap();
        std::fs::create_dir_all(tmp.path().join(META_DIR)).unwrap();
        std::fs::write(meta_path(tmp.path()), r#"{ "compiler": "pdflatex" }"#).unwrap();
        let meta = read_meta(tmp.path()).unwrap().unwrap();
        assert_eq!(meta.compiler, Compiler::Pdflatex);
        assert_eq!(meta.main_file, "main.tex");
        assert!(!meta.shell_escape);
    }

    #[test]
    fn ida_y_vuelta_en_camel_case() {
        let tmp = TempDir::new().unwrap();
        let meta = ProjectMeta {
            main_file: "tesis.tex".into(),
            ..Default::default()
        };
        write_meta(tmp.path(), &meta).unwrap();
        let raw = std::fs::read_to_string(meta_path(tmp.path())).unwrap();
        assert!(raw.contains("\"mainFile\": \"tesis.tex\""), "{raw}");
        assert!(raw.contains("\"shellEscape\": false"), "{raw}");
        assert_eq!(read_meta(tmp.path()).unwrap(), Some(meta));
    }

    #[test]
    fn la_carpeta_del_proyecto_es_jutex() {
        assert_eq!(META_DIR, ".jutex");
        assert!(is_meta_dir(".jutex") && is_meta_dir(".libretex"));
        assert!(!is_meta_dir(".git") && !is_meta_dir("jutex"));
    }

    #[test]
    fn migra_la_carpeta_vieja() {
        let tmp = TempDir::new().unwrap();
        std::fs::create_dir_all(tmp.path().join(".libretex/build")).unwrap();
        std::fs::write(
            tmp.path().join(".libretex/project.json"),
            r#"{"mainFile":"t.tex"}"#,
        )
        .unwrap();
        migrate_legacy(tmp.path()).unwrap();
        assert!(!tmp.path().join(".libretex").exists());
        assert!(tmp.path().join(".jutex/build").is_dir());
        assert_eq!(read_meta(tmp.path()).unwrap().unwrap().main_file, "t.tex");
    }

    #[test]
    fn con_las_dos_se_queda_la_nueva() {
        let tmp = TempDir::new().unwrap();
        for dir in [".libretex", ".jutex"] {
            std::fs::create_dir_all(tmp.path().join(dir)).unwrap();
            std::fs::write(tmp.path().join(dir).join("project.json"), dir).unwrap();
        }
        migrate_legacy(tmp.path()).unwrap();
        let read = |d: &str| std::fs::read_to_string(tmp.path().join(d).join("project.json"));
        assert_eq!(read(".libretex").unwrap(), ".libretex");
        assert_eq!(read(".jutex").unwrap(), ".jutex");
    }

    #[test]
    fn agrega_jutex_al_gitignore_de_un_respaldo() {
        let tmp = TempDir::new().unwrap();
        std::fs::create_dir_all(tmp.path().join(".libretex")).unwrap();
        std::fs::write(
            tmp.path().join(".gitignore"),
            "# LibreTeX\n.libretex/\n*.aux\n",
        )
        .unwrap();
        migrate_legacy(tmp.path()).unwrap();
        let ignore = std::fs::read_to_string(tmp.path().join(".gitignore")).unwrap();
        assert_eq!(ignore, "# LibreTeX\n.libretex/\n.jutex/\n*.aux\n");
        // Twice changes nothing.
        migrate_legacy(tmp.path()).unwrap();
        assert_eq!(
            std::fs::read_to_string(tmp.path().join(".gitignore")).unwrap(),
            ignore
        );
    }

    #[test]
    fn leer_o_escribir_los_datos_migra_el_proyecto() {
        // The home screen reads every project's data before any is opened.
        let tmp = TempDir::new().unwrap();
        std::fs::create_dir_all(tmp.path().join(".libretex/history.git")).unwrap();
        std::fs::write(
            tmp.path().join(".libretex/project.json"),
            r#"{"compiler":"lualatex"}"#,
        )
        .unwrap();
        assert_eq!(
            read_meta(tmp.path()).unwrap().unwrap().compiler,
            Compiler::Lualatex
        );
        assert!(tmp.path().join(".jutex/history.git").is_dir());
        let other = TempDir::new().unwrap();
        std::fs::create_dir_all(other.path().join(".libretex/build")).unwrap();
        write_meta(other.path(), &ProjectMeta::default()).unwrap();
        assert!(other.path().join(".jutex/build").is_dir());
        assert!(!other.path().join(".libretex").exists());
    }

    #[test]
    fn un_gitignore_sin_libretex_no_cambia() {
        let tmp = TempDir::new().unwrap();
        std::fs::write(tmp.path().join(".gitignore"), "*.aux").unwrap();
        migrate_legacy(tmp.path()).unwrap();
        assert_eq!(
            std::fs::read_to_string(tmp.path().join(".gitignore")).unwrap(),
            "*.aux"
        );
    }
}
