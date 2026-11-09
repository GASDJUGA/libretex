//! Project index for autocompletion: `\label`s of the `.tex` files and entries of the
//! `.bib` files.

use crate::error::{AppError, AppResult};
use crate::projects::detect::strip_comment;
use crate::projects::meta::is_meta_dir;
use crate::util::paths::to_relative;
use regex::Regex;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::SystemTime;
use walkdir::WalkDir;

/// Files bigger than this are not indexed.
const MAX_FILE_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Label {
    pub key: String,
    pub file: String,
    /// 1-based line.
    pub line: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BibEntry {
    pub key: String,
    /// Entry type in lower case (`article`, `book`…).
    pub kind: String,
    pub title: Option<String>,
    pub file: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct ProjectIndex {
    pub labels: Vec<Label>,
    pub citations: Vec<BibEntry>,
}

static LABEL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\\label\s*\{([^{}]+)\}").unwrap());
static ENTRY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"@([A-Za-z]+)\s*[{(]\s*([^,\s{}()]+)\s*,").unwrap());
static TITLE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?is)\btitle\s*=\s*(?:\{((?:[^{}]|\{[^{}]*\})*)\}|"([^"]*)")"#).unwrap()
});

/// `\label{…}` keys of a LaTeX source, outside comments.
pub fn labels_in(source: &str, file: &str) -> Vec<Label> {
    source
        .lines()
        .enumerate()
        .flat_map(|(i, line)| {
            LABEL
                .captures_iter(strip_comment(line))
                .map(move |c| Label {
                    key: c[1].trim().to_owned(),
                    file: file.to_owned(),
                    line: i + 1,
                })
        })
        .collect()
}

/// Entries of a BibTeX/BibLaTeX file (`@comment`, `@string` and `@preamble` are skipped).
pub fn bib_entries(source: &str, file: &str) -> Vec<BibEntry> {
    let starts: Vec<_> = ENTRY.captures_iter(source).collect();
    starts
        .iter()
        .enumerate()
        .filter_map(|(i, c)| {
            let kind = c[1].to_lowercase();
            if matches!(kind.as_str(), "comment" | "string" | "preamble") {
                return None;
            }
            let body_start = c.get(0).unwrap().end();
            let body_end = starts
                .get(i + 1)
                .map_or(source.len(), |n| n.get(0).unwrap().start());
            let title = TITLE.captures(&source[body_start..body_end]).map(|t| {
                let raw = t.get(1).or_else(|| t.get(2)).map_or("", |m| m.as_str());
                raw.replace(['{', '}'], "")
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ")
            });
            Some(BibEntry {
                key: c[2].to_owned(),
                kind,
                title,
                file: file.to_owned(),
            })
        })
        .collect()
}

/// What one file contributed, and the size and date it had when read.
struct FileIndex {
    modified: Option<SystemTime>,
    len: u64,
    labels: Vec<Label>,
    citations: Vec<BibEntry>,
}

/// Files already read, by absolute path: after an autosave only the saved file is read
/// again, not the whole project.
static CACHE: LazyLock<Mutex<HashMap<PathBuf, FileIndex>>> = LazyLock::new(Default::default);

/// Files kept in [`CACHE`] (several projects); beyond this it starts over.
const MAX_CACHED_FILES: usize = 20_000;

/// The index, or nothing if it did not change since `known` (its `version`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct IndexReply {
    /// Changes when any indexed file is added, removed or changed.
    pub version: String,
    pub index: Option<ProjectIndex>,
}

/// Indexes every `.tex` and `.bib` file of the project (hidden folders and `.jutex/`
/// excluded).
pub fn build(root: &Path) -> AppResult<ProjectIndex> {
    Ok(build_since(root, None)?.index.unwrap_or_default())
}

/// Like [`build`], reading only the files that changed since they were last read, and
/// without the index itself if it is the one the caller has (`known`, its version).
pub fn build_since(root: &Path, known: Option<&str>) -> AppResult<IndexReply> {
    let root = dunce::canonicalize(root).map_err(|e| AppError::io(root, e))?;
    let walker = WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            e.depth() == 0 || {
                let name = e.file_name().to_string_lossy();
                !name.starts_with('.') && !is_meta_dir(name.as_ref())
            }
        });
    let mut files: Vec<(String, PathBuf, Option<SystemTime>, u64)> = Vec::new();
    for entry in walker.filter_map(Result::ok) {
        let path = entry.path();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !entry.file_type().is_file() || !matches!(ext, "tex" | "bib") {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        if meta.len() > MAX_FILE_BYTES {
            continue;
        }
        let rel = to_relative(&root, path)?;
        files.push((rel, path.to_owned(), meta.modified().ok(), meta.len()));
    }
    files.sort_by(|a, b| a.0.cmp(&b.0));
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    for (rel, _, modified, len) in &files {
        (rel, modified, len).hash(&mut hasher);
    }
    let version = format!("{:016x}", hasher.finish());
    if known == Some(version.as_str()) {
        return Ok(IndexReply {
            version,
            index: None,
        });
    }

    let mut cache = CACHE.lock().unwrap_or_else(|p| p.into_inner());
    if cache.len() > MAX_CACHED_FILES {
        cache.clear();
    }
    let mut index = ProjectIndex::default();
    for (rel, path, modified, len) in files {
        let fresh = cache
            .get(&path)
            .is_some_and(|c| c.modified == modified && c.len == len && modified.is_some());
        if !fresh {
            let Ok(bytes) = fs::read(&path) else { continue };
            let source = String::from_utf8_lossy(&bytes);
            let (labels, citations) = if rel.ends_with(".tex") {
                (labels_in(&source, &rel), Vec::new())
            } else {
                (Vec::new(), bib_entries(&source, &rel))
            };
            cache.insert(
                path.clone(),
                FileIndex {
                    modified,
                    len,
                    labels,
                    citations,
                },
            );
        }
        let cached = &cache[&path];
        index.labels.extend(cached.labels.iter().cloned());
        index.citations.extend(cached.citations.iter().cloned());
    }
    index.labels.sort_by(|a, b| a.key.cmp(&b.key));
    index.citations.sort_by(|a, b| a.key.cmp(&b.key));
    Ok(IndexReply {
        version,
        index: Some(index),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn etiquetas_fuera_de_comentarios() {
        let src = "\\section{A}\\label{sec:a}\n% \\label{comentada}\n50\\% \\label{eq:b} y \\label {fig:c}";
        let keys: Vec<_> = labels_in(src, "m.tex")
            .into_iter()
            .map(|l| (l.key, l.line))
            .collect();
        assert_eq!(
            keys,
            [("sec:a".into(), 1), ("eq:b".into(), 3), ("fig:c".into(), 3)]
        );
    }

    #[test]
    fn entradas_bib_con_titulo() {
        let bib = r#"
@comment{ignorar, esto}
@Book{knuth1984,
  title = {The {\TeX}book},
  author = {Knuth},
}
@article{ einstein1905 ,
  author = "Einstein",
  title = "Zur Elektrodynamik
           bewegter Körper",
}
@misc{sin-titulo, note = {x}}
"#;
        let entries = bib_entries(bib, "r.bib");
        let summary: Vec<_> = entries
            .iter()
            .map(|e| (e.key.as_str(), e.kind.as_str(), e.title.as_deref()))
            .collect();
        assert_eq!(
            summary,
            [
                ("knuth1984", "book", Some("The \\TeXbook")),
                (
                    "einstein1905",
                    "article",
                    Some("Zur Elektrodynamik bewegter Körper")
                ),
                ("sin-titulo", "misc", None),
            ]
        );
    }

    #[test]
    fn indexa_el_proyecto() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        fs::create_dir_all(root.join("caps")).unwrap();
        fs::create_dir_all(root.join(".jutex/build")).unwrap();
        fs::write(root.join("main.tex"), "\\label{z}\\label{a}").unwrap();
        fs::write(root.join("caps/1.tex"), "\\label{cap:1}").unwrap();
        fs::write(root.join(".jutex/build/x.tex"), "\\label{interno}").unwrap();
        fs::write(root.join("refs.bib"), "@book{k, title={T}}").unwrap();
        let index = build(root).unwrap();
        let keys: Vec<_> = index.labels.iter().map(|l| l.key.as_str()).collect();
        assert_eq!(keys, ["a", "cap:1", "z"]);
        assert_eq!(index.labels[1].file, "caps/1.tex");
        assert_eq!(index.citations[0].key, "k");
    }

    #[test]
    fn solo_relee_lo_que_cambio_y_no_reenvia_un_indice_igual() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        fs::write(root.join("main.tex"), "\\label{a}").unwrap();
        fs::write(root.join("refs.bib"), "@book{k, title={T}}").unwrap();
        let first = build_since(root, None).unwrap();
        assert_eq!(first.index.as_ref().unwrap().labels.len(), 1);
        // Nothing changed: no index sent.
        let same = build_since(root, Some(&first.version)).unwrap();
        assert_eq!(same.version, first.version);
        assert_eq!(same.index, None);
        // A file changes (another size): a new version with the new label.
        fs::write(root.join("main.tex"), "\\label{a}\\label{bb}").unwrap();
        let changed = build_since(root, Some(&first.version)).unwrap();
        assert_ne!(changed.version, first.version);
        let keys: Vec<_> = changed
            .index
            .unwrap()
            .labels
            .into_iter()
            .map(|l| l.key)
            .collect();
        assert_eq!(keys, ["a", "bb"]);
        // A file removed also changes it.
        fs::remove_file(root.join("refs.bib")).unwrap();
        let removed = build_since(root, Some(&changed.version)).unwrap();
        assert!(removed.index.unwrap().citations.is_empty());
    }
}
