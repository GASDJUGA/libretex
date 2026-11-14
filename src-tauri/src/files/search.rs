//! Search and replace in every text file of a project (the «Buscar en el proyecto» panel).
//! Files are walked with `ignore` (hidden folders such as `.jutex/` and `.git/` and what
//! the project's `.gitignore` excludes are skipped); LaTeX's auxiliary outputs, binary files
//! and files too big for the editor are not searched.

use crate::error::{AppError, AppResult};
use crate::files::{MAX_TEXT_BYTES, read_text, write_text};
use crate::util::paths::to_relative;
use regex::{NoExpand, Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// Results stop here (the panel says that there are more).
pub const MAX_MATCHES: usize = 5_000;
/// Characters of the line shown before the match in a result (short: the panel is narrow).
const CONTEXT_BEFORE: usize = 16;
/// Characters shown of the match and after it.
const CONTEXT_MATCH: usize = 200;
const CONTEXT_AFTER: usize = 120;

/// Files written by LaTeX tools: never what the user is looking for.
const AUX_EXTENSIONS: [&str; 22] = [
    "aux",
    "log",
    "out",
    "toc",
    "lof",
    "lot",
    "fls",
    "fdb_latexmk",
    "synctex",
    "gz",
    "bbl",
    "blg",
    "bcf",
    "xdv",
    "dvi",
    "nav",
    "snm",
    "idx",
    "ind",
    "ilg",
    "pdf",
    "xml",
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    pub text: String,
    /// `text` is a regular expression (Rust `regex` syntax) instead of plain text.
    #[serde(default)]
    pub regex: bool,
    #[serde(default)]
    pub case_sensitive: bool,
    /// Only where the text is not preceded or followed by a letter, digit or `_`.
    #[serde(default)]
    pub whole_word: bool,
}

/// One occurrence. Lines are 1-based; columns count UTF-16 code units, like the editor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub line: usize,
    pub column: usize,
    pub end_line: usize,
    pub end_column: usize,
    /// The line around the match, to show it: text before, the match (up to the end of
    /// the line) and text after.
    pub before: String,
    pub text: String,
    pub after: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FileMatches {
    pub path: String,
    pub matches: Vec<SearchMatch>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct SearchResults {
    pub files: Vec<FileMatches>,
    /// More matches than [`MAX_MATCHES`]: the rest are not listed.
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Replaced {
    pub path: String,
    pub count: usize,
}

/// The query as a regular expression.
pub fn compile(query: &SearchQuery) -> AppResult<Regex> {
    if query.text.is_empty() {
        return Err(AppError::InvalidSearch("la búsqueda está vacía".into()));
    }
    let pattern = if query.regex {
        format!("(?:{})", query.text)
    } else {
        regex::escape(&query.text)
    };
    // Half word boundaries: also `\frac` as a whole word (`\b` needs a letter at the edge).
    let pattern = if query.whole_word {
        format!(r"\b{{start-half}}{pattern}\b{{end-half}}")
    } else {
        pattern
    };
    RegexBuilder::new(&pattern)
        .case_insensitive(!query.case_sensitive)
        .multi_line(true)
        .size_limit(1 << 22)
        .build()
        .map_err(|e| AppError::InvalidSearch(e.to_string()))
}

/// The project's searchable files (relative paths, sorted).
pub fn searchable_files(root: &Path) -> AppResult<Vec<String>> {
    let root = dunce::canonicalize(root).map_err(|e| AppError::io(root, e))?;
    let walker = ignore::WalkBuilder::new(&root)
        .hidden(true)
        .follow_links(false)
        .git_ignore(true)
        .git_global(false)
        .git_exclude(false)
        // A `.gitignore` counts even if the project is not a git repository.
        .require_git(false)
        .build();
    let mut files = Vec::new();
    for entry in walker.filter_map(Result::ok) {
        if !entry.file_type().is_some_and(|t| t.is_file()) {
            continue;
        }
        let path = entry.path();
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if AUX_EXTENSIONS.contains(&ext.as_str()) || is_image(&ext) {
            continue;
        }
        if entry
            .metadata()
            .map(|m| m.len() > MAX_TEXT_BYTES)
            .unwrap_or(true)
        {
            continue;
        }
        files.push(to_relative(&root, path)?);
    }
    files.sort();
    Ok(files)
}

fn is_image(ext: &str) -> bool {
    matches!(
        ext,
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "tif" | "tiff" | "eps" | "ico" | "zip"
    )
}

/// UTF-8 text without NUL bytes (a leading BOM is dropped), or None.
fn text_of(bytes: Vec<u8>) -> Option<String> {
    if bytes.contains(&0) {
        return None;
    }
    let mut text = String::from_utf8(bytes).ok()?;
    if text.starts_with('\u{feff}') {
        text.remove(0);
    }
    // As the editor sees it (`read_text`): a CRLF file's lines end at the same places.
    if text.contains("\r\n") {
        text = text.replace("\r\n", "\n");
    }
    Some(text)
}

fn utf16_len(s: &str) -> usize {
    s.chars().map(char::len_utf16).sum()
}

/// The last `max` characters of `s` (with «…» if cut), without leading spaces.
fn tail(s: &str, max: usize) -> String {
    let count = s.chars().count();
    if count <= max {
        return s.trim_start().to_owned();
    }
    let start = s.char_indices().nth(count - max).map_or(0, |(i, _)| i);
    format!("…{}", &s[start..])
}

/// The first `max` characters of `s` (with «…» if cut).
fn head(s: &str, max: usize) -> String {
    match s.char_indices().nth(max) {
        Some((i, _)) => format!("{}…", &s[..i]),
        None => s.to_owned(),
    }
}

/// Occurrences of `re` in `text`, at most `limit` (empty matches are skipped).
pub fn find_in_text(re: &Regex, text: &str, limit: usize) -> Vec<SearchMatch> {
    // Byte offset where each line starts.
    let starts: Vec<usize> = std::iter::once(0)
        .chain(text.match_indices('\n').map(|(i, _)| i + 1))
        .collect();
    let line_at = |offset: usize| starts.partition_point(|&s| s <= offset) - 1;
    let line_end = |line: usize| {
        let end = starts.get(line + 1).map_or(text.len(), |&s| s - 1);
        if text[..end].ends_with('\r') {
            end - 1
        } else {
            end
        }
    };
    re.find_iter(text)
        .filter(|m| !m.is_empty())
        .take(limit)
        .map(|m| {
            let line = line_at(m.start());
            let end_line = line_at(m.end());
            let line_start = starts[line];
            let shown_end = m.end().min(line_end(line)).max(m.start());
            SearchMatch {
                line: line + 1,
                column: utf16_len(&text[line_start..m.start()]),
                end_line: end_line + 1,
                end_column: utf16_len(&text[starts[end_line]..m.end()]),
                before: tail(&text[line_start..m.start()], CONTEXT_BEFORE),
                text: head(&text[m.start()..shown_end], CONTEXT_MATCH),
                after: head(&text[shown_end..line_end(line)], CONTEXT_AFTER),
            }
        })
        .collect()
}

/// Every occurrence of `query` in the project's text files.
pub fn search(root: &Path, query: &SearchQuery) -> AppResult<SearchResults> {
    let re = compile(query)?;
    let mut results = SearchResults::default();
    let mut total = 0;
    for rel in searchable_files(root)? {
        let Ok(bytes) = fs::read(root.join(&rel)) else {
            continue;
        };
        let Some(text) = text_of(bytes) else {
            continue;
        };
        // One more than allowed tells that there are more.
        let mut matches = find_in_text(&re, &text, MAX_MATCHES + 1 - total);
        if total + matches.len() > MAX_MATCHES {
            matches.truncate(MAX_MATCHES - total);
            results.truncated = true;
        }
        total += matches.len();
        if !matches.is_empty() {
            results.files.push(FileMatches { path: rel, matches });
        }
        if results.truncated {
            break;
        }
    }
    Ok(results)
}

/// Replaces every occurrence of `query` in `paths` (files of the project) with
/// `replacement`; with a regular expression, `$1`/`${name}` insert its groups. Each changed
/// file is written atomically. Returns how many were replaced in each changed file.
pub fn replace(
    root: &Path,
    query: &SearchQuery,
    replacement: &str,
    paths: &[String],
) -> AppResult<Vec<Replaced>> {
    let re = compile(query)?;
    let mut done = Vec::new();
    for rel in paths {
        // Validates the path (inside the project, not `.jutex/`) like opening it would.
        let file = read_text(root, rel)?;
        let count = re
            .find_iter(&file.content)
            .filter(|m| !m.is_empty())
            .count();
        if count == 0 {
            continue;
        }
        let changed = if query.regex {
            re.replace_all(&file.content, replacement)
        } else {
            re.replace_all(&file.content, NoExpand(replacement))
        };
        write_text(root, rel, &changed)?;
        done.push(Replaced {
            path: rel.clone(),
            count,
        });
    }
    Ok(done)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn query(text: &str) -> SearchQuery {
        SearchQuery {
            text: text.into(),
            regex: false,
            case_sensitive: false,
            whole_word: false,
        }
    }

    fn found(q: &SearchQuery, text: &str) -> Vec<(usize, usize, usize, usize)> {
        find_in_text(&compile(q).unwrap(), text, 100)
            .into_iter()
            .map(|m| (m.line, m.column, m.end_line, m.end_column))
            .collect()
    }

    fn project(files: &[(&str, &[u8])]) -> TempDir {
        let dir = TempDir::new().unwrap();
        for (path, content) in files {
            let path = dir.path().join(path);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, content).unwrap();
        }
        dir
    }

    #[test]
    fn texto_literal_sin_distinguir_mayusculas() {
        let text = "Campo eléctrico\nEL CAMPO y el campo.";
        assert_eq!(
            found(&query("campo"), text),
            [(1, 0, 1, 5), (2, 3, 2, 8), (2, 14, 2, 19)]
        );
        let exact = SearchQuery {
            case_sensitive: true,
            ..query("campo")
        };
        assert_eq!(found(&exact, text), [(2, 14, 2, 19)]);
        // Special characters of regular expressions are literal.
        assert_eq!(found(&query("$x^2$"), "a $x^2$ b"), [(1, 2, 1, 7)]);
    }

    #[test]
    fn columnas_en_unidades_utf16_como_el_editor() {
        // «é» is one unit, «𝐱» (outside the BMP) two; a CRLF line ending does not count.
        let text = "é𝐱 tensión\r\ntensión";
        assert_eq!(
            found(&query("tensión"), text),
            [(1, 4, 1, 11), (2, 0, 2, 7)]
        );
        let m = &find_in_text(&compile(&query("tensión")).unwrap(), text, 10)[0];
        assert_eq!(
            (m.before.as_str(), m.text.as_str(), m.after.as_str()),
            ("é𝐱 ", "tensión", "")
        );
    }

    #[test]
    fn palabra_completa_tambien_para_comandos() {
        let whole = |t: &str| SearchQuery {
            whole_word: true,
            ..query(t)
        };
        assert_eq!(
            found(&whole("vec"), "\\vec{v} vector v_vec vec"),
            [(1, 1, 1, 4), (1, 21, 1, 24)]
        );
        // `\frac` is a word although it starts with a backslash; not inside `\fracs`.
        assert_eq!(
            found(&whole("\\frac"), "\\frac{1}{2} \\fracs"),
            [(1, 0, 1, 5)]
        );
        // Accented letters are letters.
        assert_eq!(found(&whole("tensi"), "tensión tensi"), [(1, 8, 1, 13)]);
    }

    #[test]
    fn expresiones_regulares_y_errores() {
        let re = SearchQuery {
            regex: true,
            ..query(r"\\(sub)*section\{")
        };
        assert_eq!(
            found(&re, "\\section{A}\n\\subsection{B}\n\\subsubsection{C}").len(),
            3
        );
        // `^`/`$` per line.
        let starts = SearchQuery {
            regex: true,
            ..query("^%")
        };
        assert_eq!(
            found(&starts, "a % b\n% c\n%d"),
            [(2, 0, 2, 1), (3, 0, 3, 1)]
        );
        // Matches that cross lines report where they end.
        let multi = SearchQuery {
            regex: true,
            ..query(r"a\s+b")
        };
        assert_eq!(found(&multi, "xa\n  b"), [(1, 1, 2, 3)]);
        // Empty matches are not results.
        let empty = SearchQuery {
            regex: true,
            ..query("x*")
        };
        assert_eq!(found(&empty, "ab x"), [(1, 3, 1, 4)]);
        let bad = SearchQuery {
            regex: true,
            ..query("(sin cerrar")
        };
        assert!(matches!(compile(&bad), Err(AppError::InvalidSearch(_))));
        assert!(matches!(
            compile(&query("")),
            Err(AppError::InvalidSearch(_))
        ));
    }

    #[test]
    fn contexto_recortado_en_lineas_largas() {
        let line = format!("{}campo{}", "a".repeat(100), "b".repeat(300));
        let m = &find_in_text(&compile(&query("campo")).unwrap(), &line, 10)[0];
        assert_eq!(m.before.chars().count(), CONTEXT_BEFORE + 1);
        assert!(m.before.starts_with('…'));
        assert_eq!(m.text, "campo");
        assert!(m.after.ends_with('…'));
    }

    #[test]
    fn recorre_solo_archivos_de_texto_del_usuario() {
        let dir = project(&[
            ("main.tex", b"campo"),
            ("capitulos/a.tex", b"Campo y campo"),
            ("refs.bib", b"title = {campo}"),
            ("main.log", b"campo"),
            ("main.aux", b"campo"),
            ("figura.png", b"campo"),
            ("binario.dat", b"campo\0"),
            (".jutex/build/main.log", b"campo"),
            (".git/config", b"campo"),
            ("generado/x.tex", b"campo"),
            (".gitignore", b"generado/\n"),
        ]);
        let results = search(dir.path(), &query("campo")).unwrap();
        let summary: Vec<_> = results
            .files
            .iter()
            .map(|f| (f.path.as_str(), f.matches.len()))
            .collect();
        assert_eq!(
            summary,
            [("capitulos/a.tex", 2), ("main.tex", 1), ("refs.bib", 1)]
        );
        assert!(!results.truncated);
    }

    #[test]
    fn limita_la_cantidad_de_resultados() {
        let many = "x\n".repeat(MAX_MATCHES);
        let dir = project(&[("a.tex", many.as_bytes()), ("b.tex", b"x x")]);
        let results = search(dir.path(), &query("x")).unwrap();
        let total: usize = results.files.iter().map(|f| f.matches.len()).sum();
        assert_eq!(total, MAX_MATCHES);
        assert!(results.truncated);
    }

    #[test]
    fn reemplaza_en_los_archivos_indicados() {
        let dir = project(&[
            ("main.tex", b"Campo, campo y $campo$."),
            ("otro.tex", b"campo"),
            ("nada.tex", b"sin coincidencias"),
        ]);
        let done = replace(
            dir.path(),
            &query("campo"),
            "$E$",
            &["main.tex".into(), "nada.tex".into()],
        )
        .unwrap();
        assert_eq!(
            done,
            [Replaced {
                path: "main.tex".into(),
                count: 3
            }]
        );
        // Plain text: `$` is not a group reference.
        assert_eq!(
            fs::read_to_string(dir.path().join("main.tex")).unwrap(),
            "$E$, $E$ y $$E$$."
        );
        assert_eq!(
            fs::read_to_string(dir.path().join("otro.tex")).unwrap(),
            "campo"
        );
    }

    #[test]
    fn archivos_con_crlf() {
        let dir = project(&[("win.tex", b"uno\r\ndos campo\r\ntres\r\n")]);
        // Line and context as the editor sees them, and `$` before the line break.
        let re = SearchQuery {
            regex: true,
            ..query("campo$")
        };
        let found = search(dir.path(), &re).unwrap();
        let m = &found.files[0].matches[0];
        assert_eq!((m.line, m.column, m.after.as_str()), (2, 4, ""));
        // Replacing keeps the file's CRLF.
        replace(dir.path(), &query("campo"), "x", &["win.tex".into()]).unwrap();
        assert_eq!(
            fs::read(dir.path().join("win.tex")).unwrap(),
            b"uno\r\ndos x\r\ntres\r\n"
        );
    }

    #[test]
    fn reemplazo_con_grupos_de_la_expresion() {
        let dir = project(&[("main.tex", b"\\textbf{a} y \\textbf{b c}")]);
        let re = SearchQuery {
            regex: true,
            case_sensitive: true,
            ..query(r"\\textbf\{([^}]*)\}")
        };
        replace(dir.path(), &re, r"\emph{$1}", &["main.tex".into()]).unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("main.tex")).unwrap(),
            "\\emph{a} y \\emph{b c}"
        );
    }

    #[test]
    fn el_reemplazo_valida_las_rutas() {
        let dir = project(&[("main.tex", b"campo"), (".jutex/project.json", b"{}")]);
        for bad in ["../fuera.tex", "/etc/passwd", ".jutex/project.json"] {
            assert!(
                replace(dir.path(), &query("campo"), "x", &[bad.into()]).is_err(),
                "{bad}"
            );
        }
    }
}
