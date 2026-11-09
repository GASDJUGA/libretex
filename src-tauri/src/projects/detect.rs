//! Detection of a project's main file and compiler from its sources.

use crate::projects::meta::{Compiler, META_DIR};
use crate::util::paths::to_relative;
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

/// How deep to look for `.tex` files when opening a folder.
const MAX_DEPTH: usize = 4;
/// Only the start of a file is read to look for `\documentclass`.
const MAX_HEAD_BYTES: usize = 64 * 1024;

/// Removes a `%` comment from a LaTeX line (ignoring escaped `\%`).
pub(crate) fn strip_comment(line: &str) -> &str {
    let bytes = line.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => i += 2,
            b'%' => return &line[..i],
            _ => i += 1,
        }
    }
    line
}

/// Whether `source` declares `\documentclass` outside a comment.
pub fn has_documentclass(source: &str) -> bool {
    source
        .lines()
        .any(|line| strip_comment(line).contains("\\documentclass"))
}

/// `.tex` files (relative paths) that contain `\documentclass`: candidates for the main file.
/// `main.tex` comes first, then shallower files, then alphabetical order.
pub fn main_file_candidates(root: &Path) -> Vec<String> {
    let mut found: Vec<(bool, usize, String)> = WalkDir::new(root)
        .max_depth(MAX_DEPTH)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| e.depth() == 0 || !is_hidden_or_meta(e.file_name()))
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "tex"))
        .filter(|e| read_head(e.path()).is_some_and(|s| has_documentclass(&s)))
        .filter_map(|e| {
            let rel = to_relative(root, e.path()).ok()?;
            let is_main = rel == "main.tex";
            Some((!is_main, e.depth(), rel))
        })
        .collect();
    found.sort();
    found.into_iter().map(|(_, _, rel)| rel).collect()
}

/// Guesses the compiler: a `% !TEX program = …` magic comment wins; otherwise packages that
/// need XeLaTeX or LuaLaTeX; otherwise pdfLaTeX.
pub fn detect_compiler(source: &str) -> Compiler {
    for line in source.lines().take(20) {
        let lower = line.trim().to_ascii_lowercase();
        if let Some(rest) = lower.strip_prefix('%') {
            let rest = rest.trim_start();
            if let Some(value) = rest
                .strip_prefix("!tex program")
                .or_else(|| rest.strip_prefix("!tex ts-program"))
                .and_then(|r| r.trim_start().strip_prefix('='))
            {
                match value.trim() {
                    "xelatex" => return Compiler::Xelatex,
                    "lualatex" => return Compiler::Lualatex,
                    "pdflatex" => return Compiler::Pdflatex,
                    _ => {}
                }
            }
        }
    }
    let code: String = source
        .lines()
        .map(strip_comment)
        .collect::<Vec<_>>()
        .join("\n");
    let uses = |needle: &str| code.contains(needle);
    if uses("\\directlua") || uses("{luacode}") || uses("{luatextra}") || uses("{luacode") {
        Compiler::Lualatex
    } else if uses("{fontspec}")
        || uses("{polyglossia}")
        || uses("{unicode-math}")
        || uses("{xeCJK}")
    {
        Compiler::Xelatex
    } else {
        Compiler::Pdflatex
    }
}

fn is_hidden_or_meta(name: &std::ffi::OsStr) -> bool {
    let name = name.to_string_lossy();
    name.starts_with('.') || name == META_DIR || name == "node_modules"
}

fn read_head(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    let head = &bytes[..bytes.len().min(MAX_HEAD_BYTES)];
    Some(String::from_utf8_lossy(head).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn documentclass_ignora_comentarios() {
        assert!(has_documentclass("\\documentclass{article}\n"));
        assert!(has_documentclass(
            "% preámbulo\n  \\documentclass[12pt]{report}"
        ));
        assert!(!has_documentclass(
            "% \\documentclass{article}\n\\section{x}"
        ));
        assert!(has_documentclass(
            "50\\% de descuento \\documentclass{article}"
        ));
        assert!(!has_documentclass("\\input{capitulo}"));
    }

    #[test]
    fn candidatos_con_main_primero_y_sin_carpetas_ocultas() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        let doc = "\\documentclass{article}\n\\begin{document}\\end{document}\n";
        fs::create_dir_all(root.join("capitulos")).unwrap();
        fs::create_dir_all(root.join(".jutex/build")).unwrap();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::write(root.join("anexo.tex"), doc).unwrap();
        fs::write(root.join("main.tex"), doc).unwrap();
        fs::write(root.join("capitulos/borrador.tex"), doc).unwrap();
        fs::write(root.join("capitulos/intro.tex"), "\\section{Intro}").unwrap();
        fs::write(root.join(".jutex/build/main.tex"), doc).unwrap();
        fs::write(root.join(".git/x.tex"), doc).unwrap();
        fs::write(root.join("notas.txt"), doc).unwrap();

        assert_eq!(
            main_file_candidates(root),
            ["main.tex", "anexo.tex", "capitulos/borrador.tex"]
        );
    }

    #[test]
    fn sin_candidatos_en_carpeta_sin_documentos() {
        let tmp = TempDir::new().unwrap();
        fs::write(tmp.path().join("a.tex"), "\\section{x}").unwrap();
        assert!(main_file_candidates(tmp.path()).is_empty());
    }

    #[test]
    fn detecta_el_compilador() {
        assert_eq!(
            detect_compiler("% !TEX program = lualatex\n\\usepackage{fontspec}"),
            Compiler::Lualatex
        );
        assert_eq!(
            detect_compiler("%!TEX TS-program = xelatex\n"),
            Compiler::Xelatex
        );
        assert_eq!(
            detect_compiler("% !TeX program=pdflatex\n\\usepackage{fontspec}"),
            Compiler::Pdflatex
        );
        assert_eq!(
            detect_compiler("\\usepackage{fontspec}\n\\usepackage[spanish]{babel}"),
            Compiler::Xelatex
        );
        assert_eq!(
            detect_compiler("\\usepackage{polyglossia}"),
            Compiler::Xelatex
        );
        assert_eq!(detect_compiler("\\usepackage{luacode}"), Compiler::Lualatex);
        assert_eq!(
            detect_compiler("\\usepackage[utf8]{inputenc}"),
            Compiler::Pdflatex
        );
        assert_eq!(
            detect_compiler("% \\usepackage{fontspec}\n"),
            Compiler::Pdflatex
        );
    }
}
