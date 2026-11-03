//! Starting latexmk faster on Windows, where a MiKTeX program takes about 0.2 s just to start
//! (it loads ~135 DLLs). Measured on a recompile of the XeLaTeX template: 2.0 s → 1.45 s.
//!
//! - MiKTeX's `latexmk.exe` is a MiKTeX program that only starts Perl on `latexmk.pl`: Perl
//!   runs the script directly.
//! - latexmk asks `kpsewhich` for every `.bib` and `.bst` file on every run: its `$kpsewhich`
//!   command goes through `kpsewhich-cache.pl`, which reuses an answer while its files exist.

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};

use crate::tex::detect::find_in_path;

/// The cache script, written to LibreTeX's cache folder when it is missing or outdated.
const KPSEWHICH_CACHE_SCRIPT: &str = include_str!("kpsewhich-cache.pl");

/// The first Windows Perl in `path` (Strawberry's, TeX Live's). The Perl of MSYS2 and Git for
/// Windows (`…\usr\bin`, next to `msys-2.0.dll`) or Cygwin makes latexmk write `/c/…` paths
/// that Windows programs (bibtex) do not understand; MiKTeX's own launcher skips it too.
fn native_perl(path: &OsStr) -> Option<PathBuf> {
    std::env::split_paths(path)
        .filter(|dir| {
            !["msys-2.0.dll", "cygwin1.dll"]
                .iter()
                .any(|dll| dir.join(dll).is_file())
        })
        .find_map(|dir| crate::tex::detect::executable_in(&dir, "perl"))
}

/// What to run for `latexmk_exe`: Perl and the script of MiKTeX's latexmk when both are there
/// (`…\miktex\bin\x64\latexmk.exe` → `…\scripts\latexmk\latexmk.pl`), else the exe itself.
pub fn launch(latexmk_exe: &Path, path: &OsStr) -> (PathBuf, Vec<OsString>) {
    let direct = || {
        let name = latexmk_exe.file_name()?.to_str()?;
        if !name.eq_ignore_ascii_case("latexmk.exe") {
            return None;
        }
        // x64 → bin → miktex → the MiKTeX installation.
        let install = latexmk_exe.ancestors().nth(4)?;
        let script = install.join("scripts").join("latexmk").join("latexmk.pl");
        let perl = native_perl(path)?;
        script
            .is_file()
            .then(|| (perl, vec![script.into_os_string()]))
    };
    direct().unwrap_or_else(|| (latexmk_exe.to_owned(), Vec::new()))
}

/// latexmk's `-e` option that sends its `kpsewhich` lookups through the cache, kept in
/// `cache_dir` (one file per project). `None` (latexmk asks kpsewhich as usual) if Perl or
/// kpsewhich are missing, the script cannot be written, or a path has characters that would
/// need quoting (`%` is a latexmk placeholder, `"` would end the argument).
pub fn kpsewhich_cache_option(path: &OsStr, cache_dir: &Path, root: &Path) -> Option<[String; 2]> {
    let perl = native_perl(path)?;
    let kpsewhich = find_in_path("kpsewhich", path)?;
    let dir = cache_dir.join("kpsewhich");
    std::fs::create_dir_all(&dir).ok()?;
    let script = dir.join("kpsewhich-cache.pl");
    if std::fs::read_to_string(&script).ok().as_deref() != Some(KPSEWHICH_CACHE_SCRIPT) {
        crate::util::fs::atomic_write(&script, KPSEWHICH_CACHE_SCRIPT.as_bytes()).ok()?;
    }
    let cache = dir.join(format!("{}.cache", project_key(root)));
    let paths =
        [perl, script, cache, kpsewhich].map(|p| p.display().to_string().replace('\\', "/"));
    if paths.iter().any(|p| p.contains(['%', '"'])) {
        return None;
    }
    let command = paths.map(|p| format!("\"{p}\"")).join(" ") + " %S";
    Some([
        "-e".to_owned(),
        format!("$kpsewhich = {};", perl_string(&command)),
    ])
}

/// A Perl single-quoted string with `text`.
fn perl_string(text: &str) -> String {
    format!("'{}'", text.replace('\\', "\\\\").replace('\'', "\\'"))
}

/// A short name for the cache of the project in `root`.
fn project_key(root: &Path) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(root.to_string_lossy().to_lowercase().as_bytes());
    digest[..8].iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn perl_ejecuta_el_script_de_miktex_directamente() {
        let tmp = TempDir::new().unwrap();
        let bin = tmp.path().join(r"MiKTeX\miktex\bin\x64");
        let scripts = tmp.path().join(r"MiKTeX\scripts\latexmk");
        let perl_dir = tmp.path().join(r"Strawberry\perl\bin");
        for dir in [&bin, &scripts, &perl_dir] {
            std::fs::create_dir_all(dir).unwrap();
        }
        let exe = bin.join("latexmk.exe");
        std::fs::write(&exe, "").unwrap();
        std::fs::write(perl_dir.join("perl.exe"), "").unwrap();
        // Git for Windows' Perl comes first in a Git Bash PATH: skipped.
        let msys = tmp.path().join(r"Git\usr\bin");
        std::fs::create_dir_all(&msys).unwrap();
        std::fs::write(msys.join("perl.exe"), "").unwrap();
        std::fs::write(msys.join("msys-2.0.dll"), "").unwrap();
        let path = std::env::join_paths([&msys, &perl_dir]).unwrap();

        // Without the script: the exe, as before.
        assert_eq!(launch(&exe, &path), (exe.clone(), Vec::new()));

        std::fs::write(scripts.join("latexmk.pl"), "").unwrap();
        assert_eq!(
            launch(&exe, &path),
            (
                perl_dir.join("perl.exe"),
                vec![scripts.join("latexmk.pl").into_os_string()]
            )
        );
        // Without Perl, or a latexmk that is not MiKTeX's: the exe.
        assert_eq!(launch(&exe, OsStr::new("")), (exe.clone(), Vec::new()));
        let other = tmp.path().join("latexmk.bat");
        assert_eq!(launch(&other, &path), (other.clone(), Vec::new()));
    }

    /// End to end with the installed TeX: a document with a bibliography, compiled twice; the
    /// second time latexmk gets the .bib and the .bst from the cache.
    #[test]
    fn compila_con_bibliografia_y_cache_de_kpsewhich() {
        use crate::projects::meta::Compiler;
        use crate::tex::latexmk::{CompileOptions, start};
        let path = crate::tex::detect::search_path(&[], std::env::var_os("PATH").as_deref());
        if ["latexmk", "pdflatex", "bibtex", "perl", "kpsewhich"]
            .iter()
            .any(|tool| find_in_path(tool, &path).is_none())
        {
            eprintln!("sin TeX completo: se omite");
            return;
        }
        let tmp = TempDir::new().unwrap();
        let root = &dunce::canonicalize(tmp.path()).unwrap();
        let cache_dir = root.join("cache");
        std::fs::write(
            root.join("main.tex"),
            "\\documentclass{article}\n\\begin{document}\nVer \\cite{knuth}.\n\\bibliographystyle{plain}\n\\bibliography{refs}\n\\end{document}\n",
        )
        .unwrap();
        std::fs::write(
            root.join("refs.bib"),
            "@book{knuth, author={Knuth}, title={The TeXbook}, year={1984}}\n",
        )
        .unwrap();
        let options = CompileOptions {
            compiler: Compiler::Pdflatex,
            draft: false,
            halt_on_error: false,
            shell_escape: false,
            force: false,
            rc_files: None,
            kpsewhich_cache: Some(cache_dir.clone()),
        };
        for pass in 1..=2 {
            if pass == 2 {
                std::fs::write(
                    root.join("main.tex"),
                    "\\documentclass{article}\n\\begin{document}\nVer \\cite{knuth} otra vez.\n\\bibliographystyle{plain}\n\\bibliography{refs}\n\\end{document}\n",
                )
                .unwrap();
            }
            let mut lines = Vec::new();
            let status = start(root, &path, "main.tex", &options)
                .unwrap()
                .wait(|l| lines.push(l))
                .unwrap();
            assert!(status.success(), "pasada {pass}:\n{}", lines.join("\n"));
        }
        let pdf = root.join(".libretex/build/main.pdf");
        assert!(pdf.is_file());
        let bbl = std::fs::read_to_string(root.join(".libretex/build/main.bbl")).unwrap();
        assert!(bbl.contains("The TeXbook"));
        let caches: Vec<_> = std::fs::read_dir(cache_dir.join("kpsewhich"))
            .unwrap()
            .filter_map(Result::ok)
            .filter(|e| e.path().extension().is_some_and(|x| x == "cache"))
            .collect();
        assert_eq!(caches.len(), 1);
        let cache = std::fs::read_to_string(caches[0].path()).unwrap();
        assert!(cache.contains("refs.bib"), "{cache}");
        assert!(cache.contains("plain.bst"), "{cache}");
    }

    #[test]
    fn cadenas_de_perl_y_claves_de_proyecto() {
        assert_eq!(
            perl_string(r#""C:/a b/perl.exe" %S"#),
            r#"'"C:/a b/perl.exe" %S'"#
        );
        assert_eq!(perl_string(r"it's \x"), r"'it\'s \\x'");
        // The same project, written with other case, shares its cache (Windows paths).
        assert_eq!(
            project_key(Path::new(r"C:\Users\Ana\LibreTeX\Tesis")),
            project_key(Path::new(r"c:\users\ana\libretex\tesis"))
        );
        assert_ne!(
            project_key(Path::new(r"C:\Tesis")),
            project_key(Path::new(r"C:\Apuntes"))
        );
    }
}
