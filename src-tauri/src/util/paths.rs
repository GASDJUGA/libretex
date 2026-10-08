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
        existing = next
            .canonicalize()
            .map_err(|_| AppError::OutsideRoot(rel.to_owned()))?;
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
    Ok(name)
}

fn canonical_root(root: &Path) -> AppResult<PathBuf> {
    root.canonicalize().map_err(|e| AppError::io(root, e))
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
        let root = root.canonicalize().unwrap();
        let outside = outside.canonicalize().unwrap();
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

    #[cfg(unix)]
    #[test]
    fn rechaza_symlinks_que_salen_del_proyecto() {
        let f = fixture();
        std::os::unix::fs::symlink(&f.outside, f.root.join("atajo")).unwrap();
        std::os::unix::fs::symlink(f.outside.join("secreto.txt"), f.root.join("enlace.txt"))
            .unwrap();

        for rel in [
            "atajo",
            "atajo/secreto.txt",
            "atajo/nuevo.tex",
            "enlace.txt",
        ] {
            assert!(
                matches!(resolve_new(&f.root, rel), Err(AppError::OutsideRoot(_))),
                "{rel}"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn rechaza_symlinks_rotos() {
        let f = fixture();
        std::os::unix::fs::symlink("/no/existe", f.root.join("roto")).unwrap();
        assert!(matches!(
            resolve_new(&f.root, "roto"),
            Err(AppError::OutsideRoot(_))
        ));
    }

    #[cfg(unix)]
    #[test]
    fn acepta_symlinks_internos() {
        let f = fixture();
        std::os::unix::fs::symlink(f.root.join("capitulos"), f.root.join("caps")).unwrap();
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
}
