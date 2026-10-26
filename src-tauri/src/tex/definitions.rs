//! Commands and environments that the packages of a document define, read from their style
//! files (pedido del usuario: autocompletar los comandos de cualquier paquete cargado, como
//! `\hslash` de amssymb, no solo los de una tabla). The style files are found like TeX does
//! (`kpsewhich`, from the project folder, so a project's own `.sty` counts too) and the
//! packages they load are followed. Only public names are kept: no `@`, `_` or `:`.

use regex::Regex;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::SystemTime;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Command,
    Environment,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Definition {
    /// Without the backslash (`hslash`, `tcolorbox`).
    pub name: String,
    pub kind: Kind,
    /// Mandatory arguments in braces (a field each when completed).
    pub args: u8,
    /// Meant for math (`\DeclareMathSymbol`, `\DeclareMathOperator`…).
    pub math: bool,
    /// The package (style file) that defines it.
    pub package: String,
}

/// What one file defines and loads.
#[derive(Debug, Default, Clone)]
pub struct Parsed {
    /// Definitions with an empty `package` (filled by whoever includes the file).
    pub definitions: Vec<Definition>,
    /// Packages it loads (`\RequirePackage{amsfonts}`).
    pub requires: Vec<String>,
    /// Files it reads (`\input{tikz.code.tex}`).
    pub inputs: Vec<String>,
}

/// Most files read for one request (pgf/TikZ alone are a few dozen).
const MAX_FILES: usize = 300;
/// Larger files are skipped (no style file is near this).
const MAX_FILE_BYTES: u64 = 4 * 1024 * 1024;
/// Most packages asked at once.
const MAX_PACKAGES: usize = 200;

/// A package or file name that can be passed to `kpsewhich` (never read as an option or path).
pub fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 100
        && name
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphanumeric())
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// A public command name: letters only, not a conditional (`\iffoo`) and longer than one
/// letter.
fn public_command(name: &str) -> bool {
    name.len() > 1 && name.chars().all(|c| c.is_ascii_alphabetic()) && !name.starts_with("if")
}

fn public_environment(name: &str) -> bool {
    let base = name.strip_suffix('*').unwrap_or(name);
    !base.is_empty() && base.chars().all(|c| c.is_ascii_alphabetic())
}

/// The text without comments (`%` not escaped, to the end of the line).
fn strip_comments(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for line in text.lines() {
        let bytes = line.as_bytes();
        let mut cut = line.len();
        for (i, &b) in bytes.iter().enumerate() {
            if b == b'%' {
                let slashes = bytes[..i].iter().rev().take_while(|&&c| c == b'\\').count();
                if slashes % 2 == 0 {
                    cut = i;
                    break;
                }
            }
        }
        out.push_str(&line[..cut]);
        out.push('\n');
    }
    out
}

/// Mandatory brace arguments of an xparse argument specification (`m o m` → 2, `O{x} m` → 1).
pub fn spec_arguments(spec: &str) -> u8 {
    let chars: Vec<char> = spec.chars().collect();
    let mut count = 0u8;
    let mut i = 0;
    // Skips a `{…}` group (nested) starting at `chars[i]`, or a single token.
    let skip_group = |i: usize| -> usize {
        if chars.get(i) != Some(&'{') {
            return i + 1;
        }
        let mut depth = 0;
        let mut j = i;
        while j < chars.len() {
            match chars[j] {
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        return j + 1;
                    }
                }
                _ => {}
            }
            j += 1;
        }
        j
    };
    while i < chars.len() {
        let c = chars[i];
        i += 1;
        match c {
            'm' | 'v' => count = count.saturating_add(1),
            // A processor `>{…}` or a default `={…}` before the argument.
            '>' | '=' => i = skip_group(i),
            'O' | 'e' => i = skip_group(i),
            'r' | 'd' | 'R' | 'D' | 'E' => {
                // Two delimiter tokens (one group for `E`), then a default for `R`/`D`/`E`.
                if c == 'E' {
                    i = skip_group(i);
                } else {
                    i = skip_group(i);
                    i = skip_group(i);
                }
                if matches!(c, 'R' | 'D' | 'E') {
                    i = skip_group(i);
                }
            }
            't' => i = skip_group(i),
            _ => {}
        }
    }
    count
}

struct Patterns {
    newcommand: Regex,
    document_command: Regex,
    def: Regex,
    let_: Regex,
    math_symbol: Regex,
    math_alphabet: Regex,
    text_symbol: Regex,
    environment: Regex,
    document_environment: Regex,
    theorem: Regex,
    tcolorbox: Regex,
    tcolorbox_xparse: Regex,
    tcbtheorem: Regex,
    other_environment: Regex,
    requires: Regex,
    input: Regex,
}

/// A brace group with one level of nesting (`{O{} m}`, `{ t\big o }`).
const GROUP: &str = r"\{((?:[^{}]|\{[^{}]*\})*)\}";
/// `{\name}` or `\name`: the name is captured with what could follow it, to reject `\tcb@info`.
const NAME: &str = r"[ \t]*\{?[ \t]*\\([A-Za-z@_:]+)";

static PATTERNS: LazyLock<Patterns> = LazyLock::new(|| {
    let re = |s: &str| Regex::new(s).expect("valid regex");
    Patterns {
        newcommand: re(&format!(
            r"(?m)^[ \t]*\\(newcommand|renewcommand|providecommand|DeclareRobustCommand|DeclareMathOperator)\*?{NAME}[ \t]*\}}?[ \t]*(?:\[(\d)\])?[ \t]*(\[)?"
        )),
        document_command: re(&format!(
            r"(?m)^[ \t]*\\(?:New|Renew|Provide|Declare)(?:Expandable)?DocumentCommand{NAME}[ \t]*\}}?[ \t]*{GROUP}"
        )),
        def: re(
            r"(?m)^[ \t]*(?:\\(?:long|protected|global|outer)[ \t]*)*\\[gex]?def[ \t]*\\([A-Za-z@_:]+)((?:#\d|[^{\n#])*)",
        ),
        let_: re(
            r"(?m)^[ \t]*(?:\\global[ \t]*)?\\let[ \t]*\\([A-Za-z@_:]+)[ \t]*=?[ \t]*\\([A-Za-z@]+)",
        ),
        math_symbol: re(&format!(
            r"(?m)^[ \t]*\\(DeclareMathSymbol|DeclareMathDelimiter|DeclareMathAccent|DeclareMathRadical|DeclarePairedDelimiterX?){NAME}"
        )),
        math_alphabet: re(&format!(
            r"(?m)^[ \t]*\\(?:DeclareMathAlphabet|DeclareSymbolFontAlphabet){NAME}"
        )),
        text_symbol: re(&format!(
            r"(?m)^[ \t]*\\(?:DeclareTextSymbol|DeclareTextCommand|DeclareTextCommandDefault|DeclareTextSymbolDefault){NAME}"
        )),
        environment: re(
            r"\\(?:newenvironment|renewenvironment|lstnewenvironment)\*?[ \t]*\{[ \t]*([A-Za-z]+\*?)[ \t]*\}[ \t]*(?:\[(\d)\])?[ \t]*(\[)?",
        ),
        document_environment: re(&format!(
            r"\\(?:New|Renew|Provide|Declare)DocumentEnvironment[ \t]*\{{[ \t]*([A-Za-z]+\*?)[ \t]*\}}[ \t]*{GROUP}"
        )),
        theorem: re(r"\\newtheorem\*?[ \t]*\{[ \t]*([A-Za-z]+)[ \t]*\}"),
        tcolorbox: re(
            r"\\(?:new|renew)tcolorbox[ \t]*(?:\[[^\]]*\])?[ \t]*\{[ \t]*([A-Za-z]+\*?)[ \t]*\}[ \t]*(?:\[(\d)\])?[ \t]*(\[)?",
        ),
        tcolorbox_xparse: re(&format!(
            r"\\(?:New|Renew|Provide|Declare)TColorBox[ \t]*(?:\[[^\]]*\])?[ \t]*\{{[ \t]*([A-Za-z]+\*?)[ \t]*\}}[ \t]*{GROUP}"
        )),
        tcbtheorem: re(
            r"\\(?:new|renew|New|Renew)(?:tcb|Tcb)(?:theorem|Theorem)[ \t]*(?:\[[^\]]*\])?[ \t]*\{[ \t]*([A-Za-z]+)[ \t]*\}",
        ),
        other_environment: re(
            r"\\(?:newtcblisting|renewtcblisting|DeclareTCBListing|NewTCBListing|newmdenv|newmdtheoremenv|declaretheorem|newfloat|DeclareFloatingEnvironment)[ \t]*(?:\[[^\]]*\])?[ \t]*\{[ \t]*([A-Za-z]+\*?)[ \t]*\}",
        ),
        requires: re(
            r"\\(?:RequirePackage|RequirePackageWithOptions|usepackage)[ \t]*(?:\[[^\]]*\])?[ \t]*\{([^}]*)\}",
        ),
        // `\input{x}` or `\input x`, not `\inputencoding`.
        input: re(r"\\input(?:[ \t]+|[ \t]*\{[ \t]*)([A-Za-z0-9][A-Za-z0-9._-]*)"),
    }
});

/// What `text` (a style file, or a preamble) defines and loads.
pub fn parse(text: &str) -> Parsed {
    let p = &*PATTERNS;
    let text = strip_comments(text);
    let mut out = Parsed::default();
    let mut seen = HashSet::new();
    let mut push = |name: &str, kind: Kind, args: u8, math: bool, out: &mut Parsed| {
        let ok = match kind {
            Kind::Command => public_command(name),
            Kind::Environment => public_environment(name),
        };
        if ok && seen.insert((kind, name.to_owned())) {
            out.definitions.push(Definition {
                name: name.to_owned(),
                kind,
                args,
                math,
                package: String::new(),
            });
        }
    };
    // `[n]` arguments with a `[default]` after it: the first one is optional.
    let mandatory = |count: Option<regex::Match>, optional: bool| -> u8 {
        let n = count
            .and_then(|m| m.as_str().parse::<u8>().ok())
            .unwrap_or(0);
        if optional { n.saturating_sub(1) } else { n }
    };

    for c in p.newcommand.captures_iter(&text) {
        let operator = &c[1] == "DeclareMathOperator";
        let args = if operator {
            0
        } else {
            mandatory(c.get(3), c.get(4).is_some())
        };
        push(&c[2], Kind::Command, args, operator, &mut out);
    }
    for c in p.document_command.captures_iter(&text) {
        push(&c[1], Kind::Command, spec_arguments(&c[2]), false, &mut out);
    }
    for c in p.math_symbol.captures_iter(&text) {
        let args = u8::from(matches!(
            &c[1],
            "DeclareMathAccent" | "DeclarePairedDelimiter" | "DeclarePairedDelimiterX"
        ));
        push(&c[2], Kind::Command, args, true, &mut out);
    }
    for c in p.math_alphabet.captures_iter(&text) {
        push(&c[1], Kind::Command, 1, true, &mut out);
    }
    for c in p.text_symbol.captures_iter(&text) {
        push(&c[1], Kind::Command, 0, false, &mut out);
    }
    for c in p.def.captures_iter(&text) {
        let args = c[2].matches('#').count().min(9) as u8;
        push(&c[1], Kind::Command, args, false, &mut out);
    }
    for c in p.let_.captures_iter(&text) {
        // `\let\x\relax` declares or clears a name; it does not make a command.
        if !matches!(
            &c[2],
            "relax" | "undefined" | "@undefined" | "empty" | "@empty"
        ) {
            push(&c[1], Kind::Command, 0, false, &mut out);
        }
    }

    for c in p.environment.captures_iter(&text) {
        push(
            &c[1],
            Kind::Environment,
            mandatory(c.get(2), c.get(3).is_some()),
            false,
            &mut out,
        );
    }
    for c in p.document_environment.captures_iter(&text) {
        push(
            &c[1],
            Kind::Environment,
            spec_arguments(&c[2]),
            false,
            &mut out,
        );
    }
    for c in p.theorem.captures_iter(&text) {
        push(&c[1], Kind::Environment, 0, false, &mut out);
    }
    for c in p.tcolorbox.captures_iter(&text) {
        push(
            &c[1],
            Kind::Environment,
            mandatory(c.get(2), c.get(3).is_some()),
            false,
            &mut out,
        );
    }
    for c in p.tcolorbox_xparse.captures_iter(&text) {
        push(
            &c[1],
            Kind::Environment,
            spec_arguments(&c[2]),
            false,
            &mut out,
        );
    }
    // `\newtcbtheorem{ejemplo}`: `\begin{ejemplo}{título}{etiqueta}` and, unnumbered,
    // `\begin{ejemplo*}{título}`.
    for c in p.tcbtheorem.captures_iter(&text) {
        push(&c[1], Kind::Environment, 2, false, &mut out);
        push(
            &format!("{}*", &c[1]),
            Kind::Environment,
            1,
            false,
            &mut out,
        );
    }
    for c in p.other_environment.captures_iter(&text) {
        push(&c[1], Kind::Environment, 0, false, &mut out);
    }

    // `\foo` with `\endfoo` is the environment `foo` (`\tcolorbox`/`\endtcolorbox`).
    let commands: HashSet<String> = out
        .definitions
        .iter()
        .filter(|d| d.kind == Kind::Command)
        .map(|d| d.name.clone())
        .collect();
    let paired: Vec<(String, u8)> = out
        .definitions
        .iter()
        .filter(|d| d.kind == Kind::Command && commands.contains(&format!("end{}", d.name)))
        .map(|d| (d.name.clone(), d.args))
        .collect();
    for (name, args) in paired {
        push(&name, Kind::Environment, args, false, &mut out);
    }

    for c in p.requires.captures_iter(&text) {
        for name in c[1].split(',').map(str::trim) {
            if valid_name(name) && !out.requires.iter().any(|r| r == name) {
                out.requires.push(name.to_owned());
            }
        }
    }
    for c in p.input.captures_iter(&text) {
        let name = c[1].trim_end_matches('.');
        if !valid_name(name) {
            continue;
        }
        // Only TeX code (`tikz.code.tex`): `.def` files are encodings and drivers (hyperref's
        // `puenc.def` declares thousands of PDF-string symbols).
        let file = match Path::new(name).extension().and_then(|e| e.to_str()) {
            None => format!("{name}.tex"),
            Some("tex") => name.to_owned(),
            Some(_) => continue,
        };
        if !out.inputs.contains(&file) {
            out.inputs.push(file);
        }
    }
    out
}

/// Parsed files by path, kept while their modification time does not change.
type Cache = HashMap<PathBuf, (Option<SystemTime>, Arc<Parsed>)>;
static CACHE: LazyLock<Mutex<Cache>> = LazyLock::new(|| Mutex::new(HashMap::new()));

fn parsed(path: &Path) -> Option<Arc<Parsed>> {
    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_file() || meta.len() > MAX_FILE_BYTES {
        return None;
    }
    let modified = meta.modified().ok();
    let cache = CACHE.lock().unwrap_or_else(|p| p.into_inner());
    if let Some((at, parsed)) = cache.get(path)
        && *at == modified
    {
        return Some(parsed.clone());
    }
    drop(cache);
    let bytes = std::fs::read(path).ok()?;
    let result = Arc::new(parse(&String::from_utf8_lossy(&bytes)));
    CACHE
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .insert(path.to_owned(), (modified, result.clone()));
    Some(result)
}

/// Where each file is, like TeX finds it: the project folder first, then `kpsewhich` (one call
/// for all, from the project folder).
fn locate(root: &Path, files: &[String], tex_path: &OsStr) -> HashMap<String, PathBuf> {
    let mut found = HashMap::new();
    let canonical_root = root.canonicalize().ok();
    let mut missing = Vec::new();
    for file in files {
        let local = root.join(file);
        let inside = local
            .canonicalize()
            .ok()
            .zip(canonical_root.as_ref())
            .is_some_and(|(p, r)| p.starts_with(r) && p.is_file());
        if inside {
            found.insert(file.clone(), local);
        } else {
            missing.push(file);
        }
    }
    if missing.is_empty() {
        return found;
    }
    let Some(kpsewhich) = crate::tex::detect::find_in_path("kpsewhich", tex_path) else {
        return found;
    };
    let Ok(output) = std::process::Command::new(kpsewhich)
        .args(&missing)
        .current_dir(root)
        .env("PATH", tex_path)
        .output()
    else {
        return found;
    };
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let path = PathBuf::from(line.trim());
        if let Some(name) = path.file_name().and_then(|n| n.to_str())
            && missing.iter().any(|m| *m == name)
        {
            found.entry(name.to_owned()).or_insert(path);
        }
    }
    found
}

/// The commands and environments the `packages` define, with those of the packages they load
/// (the packages asked first; each name once, the first definition wins).
pub fn collect(root: &Path, packages: &[String], tex_path: &OsStr) -> Vec<Definition> {
    // Files to read, level by level: (file name, package it belongs to).
    let mut level: Vec<(String, String)> = packages
        .iter()
        .filter(|p| valid_name(p))
        .take(MAX_PACKAGES)
        .map(|p| (format!("{p}.sty"), p.clone()))
        .collect();
    let mut visited = HashSet::new();
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    let mut files_read = 0;
    while !level.is_empty() && files_read < MAX_FILES {
        level.retain(|(file, _)| visited.insert(file.clone()));
        let names: Vec<String> = level.iter().map(|(f, _)| f.clone()).collect();
        let paths = locate(root, &names, tex_path);
        let mut next = Vec::new();
        for (file, package) in level {
            if files_read >= MAX_FILES {
                break;
            }
            let Some(parsed) = paths.get(&file).and_then(|p| parsed(p)) else {
                continue;
            };
            files_read += 1;
            for definition in &parsed.definitions {
                if seen.insert((definition.kind, definition.name.clone())) {
                    out.push(Definition {
                        package: package.clone(),
                        ..definition.clone()
                    });
                }
            }
            for required in &parsed.requires {
                next.push((format!("{required}.sty"), required.clone()));
            }
            for input in &parsed.inputs {
                next.push((input.clone(), package.clone()));
            }
        }
        level = next;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(parsed: &Parsed, kind: Kind) -> Vec<(String, u8, bool)> {
        parsed
            .definitions
            .iter()
            .filter(|d| d.kind == kind)
            .map(|d| (d.name.clone(), d.args, d.math))
            .collect()
    }

    #[test]
    fn comandos_de_latex2e_xparse_def_y_simbolos() {
        let parsed = parse(
            r#"
\DeclareMathSymbol{\hslash}         {\mathord}{AMSb}{"7D}
\newcommand{\foo}[2]{#1#2}
\newcommand\bar[2][x]{#1#2}
\DeclareRobustCommand*{\baz}{z}
\DeclareMathOperator{\Tr}{Tr}
\DeclareDocumentCommand\braket{ m o m }{x}
\NewDocumentCommand{\qux}{ O{a} m }{x}
\def\pair#1#2{(#1,#2)}
  \DeclareMathAlphabet{\mathfrak}{U}{euf}{m}{n}
\DeclareMathAccent{\widecheck}{\mathord}{x}{"71}
\def\tcb@info#1{x}
\def\@quantity{x}
\newcommand{\x}{y}
\newif\iffoo
\def\iffoo{x}
\let\alias\foo
\let\clear\relax
% \newcommand{\commented}{x}
"#,
        );
        assert_eq!(
            names(&parsed, Kind::Command),
            vec![
                ("foo".into(), 2, false),
                ("bar".into(), 1, false),
                ("baz".into(), 0, false),
                ("Tr".into(), 0, true),
                ("braket".into(), 2, false),
                ("qux".into(), 1, false),
                ("hslash".into(), 0, true),
                ("widecheck".into(), 1, true),
                ("mathfrak".into(), 1, true),
                ("pair".into(), 2, false),
                ("alias".into(), 0, false),
            ]
        );
    }

    #[test]
    fn entornos_propios_y_de_tcolorbox() {
        let parsed = parse(
            r"
\newtcbtheorem[number within=chapter]{ejemplo}{Ejemplo}{
  colback=blue!5}{ej}
\newtcolorbox{definicion}{colback=red!5}
\newtcolorbox{caja}[2][]{title=#2,#1}
\DeclareTColorBox{nota}{ O{} m }{title=#2}
\newenvironment{prueba}[1]{x}{y}
\NewDocumentEnvironment{mi}{ m m }{x}{y}
\newtheorem{teorema}{Teorema}
\newtheorem*{lema}{Lema}
\newenvironment{#1}{x}{y}
\def\marco#1{x}
\def\endmarco{y}
",
        );
        assert_eq!(
            names(&parsed, Kind::Environment),
            vec![
                ("prueba".into(), 1, false),
                ("mi".into(), 2, false),
                ("teorema".into(), 0, false),
                ("lema".into(), 0, false),
                ("definicion".into(), 0, false),
                ("caja".into(), 1, false),
                ("nota".into(), 1, false),
                ("ejemplo".into(), 2, false),
                ("ejemplo*".into(), 1, false),
                ("marco".into(), 1, false),
            ]
        );
    }

    #[test]
    fn paquetes_y_archivos_que_carga() {
        let parsed = parse(
            r"
\RequirePackage{pgf,pgffor} % comentario
\RequirePackage[x]{amsfonts}[1995/01/01]
\input{tikz.code.tex}
\input pgfrcs
\input{puenc.def}
\input\tcbpkgprefix#2\relax
\inputencoding{utf8}
",
        );
        assert_eq!(parsed.requires, vec!["pgf", "pgffor", "amsfonts"]);
        assert_eq!(parsed.inputs, vec!["tikz.code.tex", "pgfrcs.tex"]);
    }

    #[test]
    fn argumentos_de_xparse() {
        assert_eq!(spec_arguments("m"), 1);
        assert_eq!(spec_arguments(" m o m "), 2);
        assert_eq!(spec_arguments("O{a,b} m"), 1);
        assert_eq!(spec_arguments(r"s t\big g o d() d|| "), 0);
        assert_eq!(spec_arguments("D<>{x} +m >{\\SplitList{,}} m"), 2);
        assert_eq!(spec_arguments("E{^_}{{}{}} m"), 1);
    }

    #[test]
    fn nombres_validos() {
        assert!(valid_name("amssymb"));
        assert!(valid_name("tikz.code.tex"));
        assert!(!valid_name("-output-directory"));
        assert!(!valid_name("../x"));
        assert!(!valid_name("a/b"));
        assert!(!valid_name(""));
    }

    #[test]
    fn sty_del_proyecto_y_sus_dependencias() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("mio.sty"),
            "\\RequirePackage{otro}\n\\newcommand{\\vel}[1]{\\dot{#1}}\n\\input{parte}\n",
        )
        .unwrap();
        std::fs::write(dir.path().join("otro.sty"), "\\newcommand{\\acc}{a}\n").unwrap();
        std::fs::write(dir.path().join("parte.tex"), "\\newenvironment{caja}{}{}\n").unwrap();
        let defs = collect(dir.path(), &["mio".into(), "-x".into()], OsStr::new(""));
        let got: Vec<(&str, &str)> = defs
            .iter()
            .map(|d| (d.name.as_str(), d.package.as_str()))
            .collect();
        assert_eq!(got, vec![("vel", "mio"), ("acc", "otro"), ("caja", "mio")]);
    }

    /// With the TeX of this machine (skipped if there is none): `\hslash` comes from amssymb
    /// and `\mathbb` from amsfonts, which amssymb loads.
    #[test]
    fn paquetes_instalados() {
        let path = std::env::var_os("PATH").unwrap_or_default();
        if crate::tex::detect::find_in_path("kpsewhich", &path).is_none() {
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        let defs = collect(dir.path(), &["amssymb".into()], &path);
        let find = |name: &str| defs.iter().find(|d| d.name == name);
        let Some(hslash) = find("hslash") else {
            return; // amssymb not installed
        };
        assert!(hslash.math);
        assert_eq!(hslash.package, "amssymb");
        let mathbb = find("mathbb").expect("\\mathbb de amsfonts");
        assert_eq!((mathbb.package.as_str(), mathbb.args), ("amsfonts", 1));
    }
}
