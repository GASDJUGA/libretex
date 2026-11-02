//! Validation of paths coming from the frontend.
//!
//! Every path the frontend sends is relative to a project root. It is resolved here,
//! canonicalized (which resolves symlinks) and checked to stay inside the root, so neither
//! `..` nor a symlink pointing outside the project can be used to escape it.

use crate::error::{AppError, AppResult};
use std::path::{Component, Path, PathBuf};

/// Resolves `rel` inside `root`, requiring the target to exist.
pub fn resolve_existing(root: &Path, rel: &str) -> AppResult<PathBuf> {
    let path = resolve_new(root, rel)?;
    if path.symlink_metadata().is_err() {
        return Err(AppError::NotFound(path));
    }
    Ok(path)
}

/// Resolves `rel` inside `root` for a target that may not exist yet (new file or folder).
///
/// The deepest existing ancestor is canonicalized and must lie inside the canonical root;
/// the remaining components do not exist, so they cannot be symlinks.
pub fn resolve_new(root: &Path, rel: &str) -> AppResult<PathBuf> {
    let root = canonical_root(root)?;
    let parts = normal_components(rel)?;

    let mut existing = root.clone();
    let mut rest = parts.as_slice();
    while let Some((first, tail)) = rest.split_first() {
        let next = existing.join(first);
        if next.symlink_metadata().is_err() {
            break;
        }
        existing = dunce::canonicalize(&next).map_err(|_| AppError::OutsideRoot(rel.to_owned()))?;
        if !existing.starts_with(&root) {
            return Err(AppError::OutsideRoot(rel.to_owned()));
        }
        rest = tail;
    }

    Ok(rest.iter().fold(existing, |path, part| path.join(part)))
}

/// Path of `abs` relative to `root`, with `/` separators, for sending to the frontend.
pub fn to_relative(root: &Path, abs: &Path) -> AppResult<String> {
    let rel = abs
        .strip_prefix(root)
        .map_err(|_| AppError::OutsideRoot(abs.display().to_string()))?;
    Ok(rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/"))
}

/// `path` for showing to the user, with the home folder written as `~` and the separators of
/// the system (`~/LibreTeX/Tesis`, on Windows `~\LibreTeX\Tesis`).
pub fn tilde(path: &Path, home: Option<&Path>) -> String {
    match home.map(|home| path.strip_prefix(home)) {
        Some(Ok(rest)) => std::iter::once("~".into())
            .chain(rest.components().map(|c| c.as_os_str().to_string_lossy()))
            .collect::<Vec<_>>()
            .join(std::path::MAIN_SEPARATOR_STR),
        _ => path.display().to_string(),
    }
}

/// `path` (written with `/`) with the separators of the system, for comparing in tests.
#[cfg(test)]
pub fn native(path: &str) -> String {
    path.replace('/', std::path::MAIN_SEPARATOR_STR)
}

/// Links the folder `link` to `target`. On Windows a symlink needs Developer Mode, so it
/// falls back to a junction, which `canonicalize` and `is_symlink` treat the same way.
#[cfg(test)]
pub fn link_dir(target: &Path, link: &Path) {
    #[cfg(unix)]
    std::os::unix::fs::symlink(target, link).unwrap();
    #[cfg(windows)]
    if std::os::windows::fs::symlink_dir(target, link).is_err() {
        let status = crate::platform::process::command("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(link)
            .arg(target)
            .stdout(std::process::Stdio::null())
            .status()
            .unwrap();
        assert!(status.success(), "mklink /J {}", link.display());
    }
}

/// Links the file `link` to `target`; `false` where the system does not allow it (Windows
/// without Developer Mode).
#[cfg(test)]
pub fn link_file(target: &Path, link: &Path) -> bool {
    #[cfg(unix)]
    return std::os::unix::fs::symlink(target, link).is_ok();
    #[cfg(windows)]
    return std::os::windows::fs::symlink_file(target, link).is_ok();
}

/// The Unix absolute `path`, made absolute on this system too (`C:/home/x` on Windows), for
/// tests.
#[cfg(test)]
pub fn absolute(path: &str) -> String {
    if cfg!(windows) {
        format!("C:{path}")
    } else {
        path.to_owned()
    }
}

/// Checks a single file, folder or project name typed by the user.
pub fn validate_name(name: &str) -> AppResult<&str> {
    let invalid = |reason| AppError::InvalidName {
        name: name.to_owned(),
        reason,
    };
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(invalid("está vacío"));
    }
    if trimmed != name {
        return Err(invalid("empieza o termina con espacios"));
    }
    if name == "." || name == ".." {
        return Err(invalid("nombre reservado"));
    }
    if name.contains(['/', '\\', '\0']) {
        return Err(invalid("contiene «/», «\\» o caracteres nulos"));
    }
    if name.chars().any(char::is_control) {
        return Err(invalid("contiene caracteres de control"));
    }
    if name.len() > 255 {
        return Err(invalid("es demasiado largo"));
    }
    if cfg!(windows)
        && let Some(reason) = windows_problem(name)
    {
        return Err(invalid(reason));
    }
    Ok(name)
}

/// Why Windows would not accept `name` as a file or folder name, if it would not.
fn windows_problem(name: &str) -> Option<&'static str> {
    if name.contains(['<', '>', ':', '"', '|', '?', '*']) {
        return Some("contiene alguno de los caracteres < > : \" | ? *");
    }
    if name.ends_with(['.', ' ']) {
        return Some("termina en punto o espacio");
    }
    // Reserved device names, also with an extension (`nul.tex`).
    let stem = name
        .split('.')
        .next()
        .unwrap_or(name)
        .trim_end()
        .to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ["COM", "LPT"].iter().any(|prefix| {
            stem.strip_prefix(prefix).is_some_and(|n| {
                matches!(
                    n,
                    "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
                )
            })
        });
    reserved.then_some("es un nombre reservado de Windows")
}

fn canonical_root(root: &Path) -> AppResult<PathBuf> {
    dunce::canonicalize(root).map_err(|e| AppError::io(root, e))
}

fn normal_components(rel: &str) -> AppResult<Vec<PathBuf>> {
    let path = Path::new(rel);
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => parts.push(PathBuf::from(part)),
            Component::CurDir => {}
            Component::ParentDir => return Err(AppError::ParentComponent(rel.to_owned())),
            Component::RootDir | Component::Prefix(_) => {
                return Err(AppError::AbsolutePath(rel.to_owned()));
            }
        }
    }
    Ok(parts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    struct Fixture {
        _tmp: TempDir,
        root: PathBuf,
        outside: PathBuf,
    }

    /// tmp/
    ///   proyecto/ main.tex, capitulos/intro.tex
    ///   fuera/ secreto.txt
    fn fixture() -> Fixture {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().join("proyecto");
        let outside = tmp.path().join("fuera");
        fs::create_dir_all(root.join("capitulos")).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(root.join("main.tex"), "").unwrap();
        fs::write(root.join("capitulos/intro.tex"), "").unwrap();
        fs::write(outside.join("secreto.txt"), "").unwrap();
        let root = dunce::canonicalize(root).unwrap();
        let outside = dunce::canonicalize(outside).unwrap();
        Fixture {
            _tmp: tmp,
            root,
            outside,
        }
    }

    #[test]
    fn resuelve_rutas_relativas_dentro_del_proyecto() {
        let f = fixture();
        assert_eq!(
            resolve_existing(&f.root, "main.tex").unwrap(),
            f.root.join("main.tex")
        );
        assert_eq!(
            resolve_existing(&f.root, "./capitulos/intro.tex").unwrap(),
            f.root.join("capitulos/intro.tex")
        );
        assert_eq!(resolve_existing(&f.root, "").unwrap(), f.root);
    }

    #[test]
    fn rechaza_componentes_padre() {
        let f = fixture();
        for rel in [
            "../fuera/secreto.txt",
            "capitulos/../../fuera",
            "capitulos/../main.tex",
            "..",
        ] {
            assert!(
                matches!(resolve_new(&f.root, rel), Err(AppError::ParentComponent(_))),
                "{rel}"
            );
        }
    }

    #[test]
    fn rechaza_rutas_absolutas() {
        let f = fixture();
        let abs = f.outside.join("secreto.txt");
        for rel in ["/etc/passwd", abs.to_str().unwrap()] {
            assert!(
                matches!(resolve_new(&f.root, rel), Err(AppError::AbsolutePath(_))),
                "{rel}"
            );
        }
    }

    #[test]
    fn rechaza_symlinks_que_salen_del_proyecto() {
        let f = fixture();
        link_dir(&f.outside, &f.root.join("atajo"));
        let mut rels = vec!["atajo", "atajo/secreto.txt", "atajo/nuevo.tex"];
        if link_file(&f.outside.join("secreto.txt"), &f.root.join("enlace.txt")) {
            rels.push("enlace.txt");
        }

        for rel in rels {
            assert!(
                matches!(resolve_new(&f.root, rel), Err(AppError::OutsideRoot(_))),
                "{rel}"
            );
        }
    }

    #[test]
    fn rechaza_symlinks_rotos() {
        let f = fixture();
        link_dir(&f.outside.join("no-existe"), &f.root.join("roto"));
        assert!(matches!(
            resolve_new(&f.root, "roto"),
            Err(AppError::OutsideRoot(_))
        ));
    }

    #[test]
    fn acepta_symlinks_internos() {
        let f = fixture();
        link_dir(&f.root.join("capitulos"), &f.root.join("caps"));
        assert_eq!(
            resolve_existing(&f.root, "caps/intro.tex").unwrap(),
            f.root.join("capitulos/intro.tex")
        );
    }

    #[test]
    fn rutas_nuevas_bajo_carpetas_existentes_o_no() {
        let f = fixture();
        assert_eq!(
            resolve_new(&f.root, "capitulos/nuevo.tex").unwrap(),
            f.root.join("capitulos/nuevo.tex")
        );
        assert_eq!(
            resolve_new(&f.root, "figuras/2026/a.png").unwrap(),
            f.root.join("figuras/2026/a.png")
        );
        assert!(matches!(
            resolve_existing(&f.root, "capitulos/nuevo.tex"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn la_raiz_puede_darse_sin_canonicalizar() {
        let f = fixture();
        let root_with_dot = f.root.join("capitulos").join("..");
        assert_eq!(
            resolve_existing(&root_with_dot, "main.tex").unwrap(),
            f.root.join("main.tex")
        );
    }

    #[test]
    fn convierte_a_relativa_con_barras() {
        let f = fixture();
        assert_eq!(
            to_relative(&f.root, &f.root.join("capitulos/intro.tex")).unwrap(),
            "capitulos/intro.tex"
        );
        assert!(to_relative(&f.root, &f.outside).is_err());
    }

    #[test]
    fn rutas_con_la_carpeta_personal_como_virgulilla() {
        let home = Path::new("/Users/ana");
        assert_eq!(
            tilde(
                Path::new("/Users/ana/Library/Caches/org.LibreTeX.libretex"),
                Some(home)
            ),
            native("~/Library/Caches/org.LibreTeX.libretex")
        );
        assert_eq!(tilde(home, Some(home)), "~");
        assert_eq!(
            tilde(Path::new("/Volumes/Tesis"), Some(home)),
            "/Volumes/Tesis"
        );
        assert_eq!(tilde(Path::new("/x"), None), "/x");
    }

    #[test]
    fn valida_nombres() {
        for ok in ["main.tex", "Tesis de magíster", "a", "ñandú (copia)"] {
            assert!(validate_name(ok).is_ok(), "{ok}");
        }
        let long = "a".repeat(256);
        for bad in [
            "",
            " ",
            " a",
            "a ",
            ".",
            "..",
            "a/b",
            "a\\b",
            "a\0b",
            "a\nb",
            long.as_str(),
        ] {
            assert!(validate_name(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn nombres_que_windows_no_acepta() {
        for ok in [
            "main.tex",
            "consola.tex",
            "com10",
            "COM0",
            "nulo",
            "añoñ",
            ".latexmkrc",
        ] {
            assert_eq!(windows_problem(ok), None, "{ok}");
        }
        for bad in [
            "CON", "con.tex", "Nul", "aux.aux", "COM1", "lpt9.txt", "COM¹", "a:b", "¿qué?", "x*",
            "a<b>", "\"cita\"", "a|b", "final.", "final ",
        ] {
            assert!(windows_problem(bad).is_some(), "{bad:?}");
        }
        // Only Windows rejects them.
        assert_eq!(validate_name("Tarea: física").is_err(), cfg!(windows));
    }
}
