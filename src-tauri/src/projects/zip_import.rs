//! Safe extraction of project ZIPs (including those exported by Overleaf).

use crate::error::{AppError, AppResult};
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use zip::ZipArchive;

const MAX_ENTRIES: usize = 50_000;
const MAX_TOTAL_BYTES: u64 = 2 * 1024 * 1024 * 1024;

/// Extracts `zip_path` into `dest` (created if needed).
///
/// Entries with unsafe names (absolute, `..`) make the whole archive invalid; symlinks and
/// macOS metadata (`__MACOSX/`, `.DS_Store`) are skipped. When every entry sits inside a single
/// top-level folder, that folder is stripped so the project files end up directly in `dest`.
pub fn extract(zip_path: &Path, dest: &Path) -> AppResult<()> {
    let file = fs::File::open(zip_path).map_err(|e| AppError::io(zip_path, e))?;
    let invalid = |msg: String| AppError::InvalidZip(msg);
    let mut archive = ZipArchive::new(file).map_err(|e| invalid(e.to_string()))?;
    if archive.len() > MAX_ENTRIES {
        return Err(invalid(format!("demasiadas entradas ({})", archive.len())));
    }

    // First pass: validate names and sizes, collect what to extract.
    let mut entries: Vec<(usize, PathBuf, bool)> = Vec::new();
    let mut total: u64 = 0;
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| invalid(e.to_string()))?;
        // `enclosed_name` silently strips a leading root; an absolute name is suspicious, so
        // the whole archive is rejected instead.
        if is_absolute_name(entry.name()) {
            return Err(invalid(format!("ruta absoluta: {}", entry.name())));
        }
        let name = entry
            .enclosed_name()
            .ok_or_else(|| invalid(format!("ruta insegura: {}", entry.name())))?;
        if is_junk(&name) || entry.is_symlink() {
            continue;
        }
        total = total.saturating_add(entry.size());
        if total > MAX_TOTAL_BYTES {
            return Err(invalid("contenido demasiado grande".into()));
        }
        entries.push((i, name, entry.is_dir()));
    }

    let strip = common_top_folder(&entries);
    fs::create_dir_all(dest).map_err(|e| AppError::io(dest, e))?;
    for (i, name, is_dir) in entries {
        let rel = match &strip {
            Some(top) => name
                .strip_prefix(top)
                .expect("all entries share the top folder")
                .to_owned(),
            None => name,
        };
        if rel.as_os_str().is_empty() {
            continue;
        }
        let target = dest.join(&rel);
        if is_dir {
            fs::create_dir_all(&target).map_err(|e| AppError::io(&target, e))?;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| AppError::io(parent, e))?;
        }
        let mut entry = archive.by_index(i).map_err(|e| invalid(e.to_string()))?;
        let mut out = fs::File::create(&target).map_err(|e| AppError::io(&target, e))?;
        io::copy(&mut entry, &mut out).map_err(|e| AppError::io(&target, e))?;
    }
    Ok(())
}

fn is_absolute_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    name.starts_with(['/', '\\'])
        || (bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':')
}

fn is_junk(name: &Path) -> bool {
    name.components()
        .any(|c| matches!(c, Component::Normal(n) if n == "__MACOSX" || n == ".DS_Store"))
}

/// The single top-level folder shared by all entries, if there is one and no file lives at
/// the top level.
fn common_top_folder(entries: &[(usize, PathBuf, bool)]) -> Option<PathBuf> {
    let mut top: Option<&std::ffi::OsStr> = None;
    for (_, name, is_dir) in entries {
        let mut components = name.components();
        let first = components.next()?.as_os_str();
        if components.next().is_none() && !is_dir {
            return None; // a file at the top level
        }
        match top {
            None => top = Some(first),
            Some(t) if t == first => {}
            Some(_) => return None,
        }
    }
    top.map(PathBuf::from)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;
    use zip::write::SimpleFileOptions;

    /// Writes a ZIP with `(name, contents)` entries; names ending in `/` are folders.
    pub fn make_zip(path: &Path, entries: &[(&str, &str)]) {
        let mut zip = zip::ZipWriter::new(fs::File::create(path).unwrap());
        for (name, contents) in entries {
            if name.ends_with('/') {
                zip.add_directory(*name, SimpleFileOptions::default())
                    .unwrap();
            } else {
                zip.start_file(*name, SimpleFileOptions::default()).unwrap();
                zip.write_all(contents.as_bytes()).unwrap();
            }
        }
        zip.finish().unwrap();
    }

    #[test]
    fn extrae_un_zip_plano_como_el_de_overleaf() {
        let tmp = TempDir::new().unwrap();
        let zip = tmp.path().join("p.zip");
        make_zip(
            &zip,
            &[
                ("main.tex", "A"),
                ("figs/", ""),
                ("figs/a.png", "B"),
                ("__MACOSX/x", ""),
            ],
        );
        let dest = tmp.path().join("out");
        extract(&zip, &dest).unwrap();
        assert_eq!(fs::read_to_string(dest.join("main.tex")).unwrap(), "A");
        assert_eq!(fs::read_to_string(dest.join("figs/a.png")).unwrap(), "B");
        assert!(!dest.join("__MACOSX").exists());
    }

    #[test]
    fn quita_la_carpeta_raiz_comun() {
        let tmp = TempDir::new().unwrap();
        let zip = tmp.path().join("p.zip");
        make_zip(
            &zip,
            &[
                ("tesis/", ""),
                ("tesis/main.tex", "A"),
                ("tesis/caps/1.tex", "B"),
            ],
        );
        let dest = tmp.path().join("out");
        extract(&zip, &dest).unwrap();
        assert!(dest.join("main.tex").is_file());
        assert!(dest.join("caps/1.tex").is_file());
        assert!(!dest.join("tesis").exists());
    }

    #[test]
    fn no_quita_la_carpeta_si_hay_archivos_en_la_raiz() {
        let tmp = TempDir::new().unwrap();
        let zip = tmp.path().join("p.zip");
        make_zip(&zip, &[("main.tex", "A"), ("caps/1.tex", "B")]);
        let dest = tmp.path().join("out");
        extract(&zip, &dest).unwrap();
        assert!(dest.join("caps/1.tex").is_file());
    }

    #[test]
    fn rechaza_zip_slip() {
        let tmp = TempDir::new().unwrap();
        // ZipWriter strips a leading `/`, so absolute names are covered by a fixture below.
        for evil in ["../fuera.tex", "a/../../fuera.tex"] {
            let zip = tmp.path().join("evil.zip");
            make_zip(&zip, &[("main.tex", "A"), (evil, "X")]);
            let dest = tmp.path().join("out");
            assert!(
                matches!(extract(&zip, &dest), Err(AppError::InvalidZip(_))),
                "{evil}"
            );
            assert!(!tmp.path().join("fuera.tex").exists());
        }
    }

    #[test]
    fn rechaza_zips_maliciosos_reales() {
        // Generated with Python's zipfile, which keeps absolute and `..` names verbatim.
        let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/zips");
        let tmp = TempDir::new().unwrap();
        for name in ["absoluto.zip", "padre.zip"] {
            let dest = tmp.path().join(name);
            assert!(
                matches!(
                    extract(&fixtures.join(name), &dest),
                    Err(AppError::InvalidZip(_))
                ),
                "{name}"
            );
        }
        assert!(!Path::new("/tmp/libretex-fuera.tex").exists());
        assert!(!tmp.path().join("libretex-fuera.tex").exists());
    }

    #[test]
    fn detecta_nombres_absolutos() {
        for abs in ["/etc/x", "\\\\srv\\x", "C:\\x", "c:/x", "a:b.tex"] {
            assert!(is_absolute_name(abs), "{abs}");
        }
        for rel in ["main.tex", "a/b.tex", "ab:c.tex", "1:x"] {
            assert!(!is_absolute_name(rel), "{rel}");
        }
    }

    #[test]
    fn rechaza_archivos_que_no_son_zip() {
        let tmp = TempDir::new().unwrap();
        let fake = tmp.path().join("x.zip");
        fs::write(&fake, "hola").unwrap();
        assert!(matches!(
            extract(&fake, &tmp.path().join("o")),
            Err(AppError::InvalidZip(_))
        ));
    }
}
