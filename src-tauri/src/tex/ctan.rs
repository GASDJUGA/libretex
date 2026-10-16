//! CTAN's package index (`https://ctan.org/json/2.0/packages`), cached in
//! `~/.cache/libretex/ctan/packages.json` so searching works offline. It is downloaded only
//! when the user asks for it.

use crate::error::{AppError, AppResult};
use crate::util::fs::atomic_write;
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub const INDEX_URL: &str = "https://ctan.org/json/2.0/packages";
/// TeX Live's full package database, for systems without one (the managed TeX Live only has
/// the installed packages in its own).
pub const TLPDB_URL: &str = "https://mirror.ctan.org/systems/texlive/tlnet/tlpkg/texlive.tlpdb";
/// Biggest download accepted (the tlpdb is ≈ 20 MB).
const MAX_DOWNLOAD: u64 = 100 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CtanEntry {
    /// The CTAN key (usually the TeX Live name too).
    pub key: String,
    /// Display name (`AAAI`).
    pub name: String,
    /// One-line description, without HTML.
    pub caption: String,
}

#[derive(Deserialize)]
struct RawEntry {
    key: String,
    name: String,
    #[serde(default)]
    caption: Option<String>,
}

/// Removes HTML tags and the few entities CTAN uses in captions.
pub fn strip_html(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut in_tag = false;
    for c in text.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Parses the JSON index.
pub fn parse_index(json: &str) -> AppResult<Vec<CtanEntry>> {
    let raw: Vec<RawEntry> =
        serde_json::from_str(json).map_err(|e| AppError::Other(format!("índice de CTAN: {e}")))?;
    Ok(raw
        .into_iter()
        .map(|e| CtanEntry {
            caption: strip_html(e.caption.as_deref().unwrap_or("")),
            key: e.key,
            name: e.name,
        })
        .collect())
}

pub fn index_file(cache_dir: &Path) -> PathBuf {
    cache_dir.join("ctan").join("packages.json")
}

pub fn tlpdb_file(cache_dir: &Path) -> PathBuf {
    cache_dir.join("texlive.tlpdb")
}

/// When a cached file was saved (ms since epoch).
pub fn saved_at(path: &Path) -> Option<u64> {
    let modified = path.metadata().ok()?.modified().ok()?;
    Some(modified.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64)
}

/// Downloads `url` into `dest` (atomically: a failed download keeps the previous copy).
pub fn download(url: &str, dest: &Path) -> AppResult<()> {
    let mut response = ureq::get(url)
        .call()
        .map_err(|e| AppError::Network(e.to_string()))?;
    let mut bytes = Vec::new();
    response
        .body_mut()
        .as_reader()
        .take(MAX_DOWNLOAD)
        .read_to_end(&mut bytes)
        .map_err(|e| AppError::Network(e.to_string()))?;
    if let Some(dir) = dest.parent() {
        std::fs::create_dir_all(dir).map_err(|e| AppError::io(dir, e))?;
    }
    atomic_write(dest, &bytes)
}

/// The cached index, or an empty list if it was never downloaded (or is unreadable).
pub fn load_index(cache_dir: &Path) -> Vec<CtanEntry> {
    std::fs::read_to_string(index_file(cache_dir))
        .ok()
        .and_then(|json| parse_index(&json).ok())
        .unwrap_or_default()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexInfo {
    /// When the CTAN index was downloaded (ms), or null if never.
    pub saved_at: Option<u64>,
    pub packages: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = include_str!("../../../tests/fixtures/ctan/packages.json");

    #[test]
    fn indice_real_sin_html() {
        let index = parse_index(SAMPLE).unwrap();
        assert!(index.len() >= 10);
        let a4wide = index.iter().find(|e| e.key == "a4wide").unwrap();
        assert_eq!(a4wide.caption, "Wide a4 layout");
        let physics = index.iter().find(|e| e.key == "physics").unwrap();
        assert_eq!(
            physics.caption,
            "Macros supporting the Mathematics of Physics"
        );
    }

    #[test]
    fn html_y_entidades() {
        assert_eq!(
            strip_html("LaTeX class for <i>Aalok</i> &amp; more"),
            "LaTeX class for Aalok & more"
        );
        assert_eq!(strip_html("  a\n  b  "), "a b");
    }

    #[test]
    fn sin_indice_descargado_la_lista_esta_vacia() {
        let tmp = tempfile::TempDir::new().unwrap();
        assert!(load_index(tmp.path()).is_empty());
        assert_eq!(saved_at(&index_file(tmp.path())), None);
        std::fs::create_dir_all(tmp.path().join("ctan")).unwrap();
        std::fs::write(index_file(tmp.path()), SAMPLE).unwrap();
        assert!(!load_index(tmp.path()).is_empty());
        assert!(saved_at(&index_file(tmp.path())).is_some());
    }

    #[test]
    fn json_roto_es_un_error() {
        assert!(parse_index("{no").is_err());
    }
}
