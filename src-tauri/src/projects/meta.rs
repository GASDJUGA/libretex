//! Per-project metadata stored in `<project>/.libretex/project.json`.

use crate::error::AppResult;
use crate::util::fs::{read_json, write_json};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Folder with LibreTeX's per-project data (metadata, build output, history).
pub const META_DIR: &str = ".libretex";

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
}

impl Default for ProjectMeta {
    fn default() -> Self {
        Self {
            main_file: default_main_file(),
            compiler: Compiler::default(),
            shell_escape: false,
            spell_lang: default_spell_lang(),
        }
    }
}

pub fn meta_path(project: &Path) -> PathBuf {
    project.join(META_DIR).join("project.json")
}

/// Reads the project's metadata; missing fields (or a missing file) take their defaults.
pub fn read_meta(project: &Path) -> AppResult<Option<ProjectMeta>> {
    read_json(&meta_path(project))
}

pub fn write_meta(project: &Path, meta: &ProjectMeta) -> AppResult<()> {
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
}
