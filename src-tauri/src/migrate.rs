//! From LibreTeX to JuTeX (2.0.0): the app's own folders (settings, data with the TeX Live
//! of the app, cache and the webview's storage) are moved to their new names the first time
//! JuTeX starts. A folder whose new name already exists is left alone, and nothing old is
//! deleted unless it was fully copied.

use std::io;
use std::path::{Path, PathBuf};

/// A folder to move from its LibreTeX name to its JuTeX name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MovePair {
    pub from: PathBuf,
    pub to: PathBuf,
}

/// The app's folders under one name (as `directories::ProjectDirs` gives them).
#[derive(Debug, Clone)]
pub struct AppDirs {
    pub config: PathBuf,
    pub data: PathBuf,
    pub cache: PathBuf,
}

/// The app's identifier before and after the rename: the webview keeps its storage (sessions,
/// tabs, panel sizes) in a folder with this name. Must match `tauri.conf.json`.
pub const OLD_IDENTIFIER: &str = "org.libretex.app";
pub const NEW_IDENTIFIER: &str = "org.jutex.app";

/// What to move: config, data and cache (once each: on macOS config and data are the same
/// folder), and the webview's folder if this system has one.
pub fn app_pairs(
    old: &AppDirs,
    new: &AppDirs,
    webview: Option<(PathBuf, PathBuf)>,
) -> Vec<MovePair> {
    let mut pairs: Vec<MovePair> = Vec::new();
    let candidates = [
        (&old.config, &new.config),
        (&old.data, &new.data),
        (&old.cache, &new.cache),
    ];
    for (from, to) in candidates {
        let pair = MovePair {
            from: from.clone(),
            to: to.clone(),
        };
        if !pairs.contains(&pair) {
            pairs.push(pair);
        }
    }
    if let Some((from, to)) = webview {
        pairs.push(MovePair { from, to });
    }
    pairs
}

/// The pairs of this system: LibreTeX's folders and JuTeX's, and the webview's storage
/// (Linux: `~/.local/share/<id>`, Windows: `%LOCALAPPDATA%\<id>`, macOS:
/// `~/Library/WebKit/<id>`).
pub fn system_pairs() -> Vec<MovePair> {
    let dirs = |org: &str, app: &str| {
        directories::ProjectDirs::from("org", org, app).map(|d| AppDirs {
            config: d.config_dir().to_owned(),
            data: d.data_dir().to_owned(),
            cache: d.cache_dir().to_owned(),
        })
    };
    let (Some(old), Some(new)) = (dirs("LibreTeX", "libretex"), dirs("JuTeX", "jutex")) else {
        return Vec::new();
    };
    let webview = directories::BaseDirs::new().map(|base| {
        let parent = if cfg!(target_os = "macos") {
            base.home_dir().join("Library").join("WebKit")
        } else if cfg!(windows) {
            base.data_local_dir().to_owned()
        } else {
            base.data_dir().to_owned()
        };
        (parent.join(OLD_IDENTIFIER), parent.join(NEW_IDENTIFIER))
    });
    app_pairs(&old, &new, webview)
}

/// Whether some folder is still to be moved: its old name exists and its new one does not.
pub fn pending(pairs: &[MovePair]) -> bool {
    pairs.iter().any(|p| p.from.is_dir() && !p.to.exists())
}

/// Moves each old folder to its new name if the old one exists and the new one does not.
/// Returns one warning per folder that could not be moved (and was left as it was).
pub fn migrate(pairs: &[MovePair]) -> Vec<String> {
    let mut warnings = Vec::new();
    for pair in pairs {
        if !pair.from.is_dir() || pair.to.exists() {
            continue;
        }
        if let Err(error) = move_dir(&pair.from, &pair.to) {
            warnings.push(format!(
                "no se pudo mover {} a {}: {error}",
                pair.from.display(),
                pair.to.display()
            ));
        }
    }
    warnings
}

/// Renames `from` to `to` (creating `to`'s parent); if renaming fails (another disk), copies
/// and then removes the original.
pub fn move_dir(from: &Path, to: &Path) -> io::Result<()> {
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent)?;
    }
    match rename(from, to) {
        Ok(()) => Ok(()),
        Err(_) => copy_then_remove(from, to),
    }
}

/// `std::fs::rename`; on Windows retried for a few seconds while the folder is in use: just
/// after LibreTeX closes, its webview's processes take a moment to let go of their files.
fn rename(from: &Path, to: &Path) -> io::Result<()> {
    #[cfg(windows)]
    for _ in 0..15 {
        match std::fs::rename(from, to) {
            Err(e) if e.kind() == io::ErrorKind::PermissionDenied => {
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
            done => return done,
        }
    }
    std::fs::rename(from, to)
}

/// Copies `from` into `to` (which must not exist) and only then removes `from`. If the copy
/// fails, whatever was copied is removed and `from` stays as it was.
pub fn copy_then_remove(from: &Path, to: &Path) -> io::Result<()> {
    if let Err(error) = copy_tree(from, to) {
        let _ = std::fs::remove_dir_all(to);
        return Err(error);
    }
    std::fs::remove_dir_all(from)
}

/// Copies a folder recursively, keeping links as links (on Unix).
fn copy_tree(from: &Path, to: &Path) -> io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let source = entry.path();
        let target = to.join(entry.file_name());
        let kind = entry.file_type()?;
        if kind.is_symlink() {
            #[cfg(unix)]
            std::os::unix::fs::symlink(std::fs::read_link(&source)?, &target)?;
            #[cfg(not(unix))]
            {
                if source.is_dir() {
                    copy_tree(&source, &target)?;
                } else {
                    std::fs::copy(&source, &target)?;
                }
            }
        } else if kind.is_dir() {
            copy_tree(&source, &target)?;
        } else {
            std::fs::copy(&source, &target)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn pair(root: &Path, from: &str, to: &str) -> MovePair {
        MovePair {
            from: root.join(from),
            to: root.join(to),
        }
    }

    #[test]
    fn mueve_lo_viejo_si_lo_nuevo_no_existe() {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir_all(tmp.path().join("old/sub")).unwrap();
        fs::write(tmp.path().join("old/settings.json"), "{}").unwrap();
        fs::write(tmp.path().join("old/sub/x"), "x").unwrap();
        let warnings = migrate(&[pair(tmp.path(), "old", "deep/new")]);
        assert!(warnings.is_empty(), "{warnings:?}");
        assert_eq!(
            fs::read_to_string(tmp.path().join("deep/new/settings.json")).unwrap(),
            "{}"
        );
        assert_eq!(
            fs::read_to_string(tmp.path().join("deep/new/sub/x")).unwrap(),
            "x"
        );
        assert!(!tmp.path().join("old").exists());
    }

    #[test]
    fn no_toca_nada_si_lo_nuevo_ya_existe() {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir_all(tmp.path().join("old")).unwrap();
        fs::create_dir_all(tmp.path().join("new")).unwrap();
        fs::write(tmp.path().join("old/a"), "viejo").unwrap();
        fs::write(tmp.path().join("new/a"), "nuevo").unwrap();
        assert!(migrate(&[pair(tmp.path(), "old", "new")]).is_empty());
        assert_eq!(
            fs::read_to_string(tmp.path().join("old/a")).unwrap(),
            "viejo"
        );
        assert_eq!(
            fs::read_to_string(tmp.path().join("new/a")).unwrap(),
            "nuevo"
        );
    }

    #[test]
    fn pendiente_solo_si_hay_algo_que_mover() {
        let tmp = tempfile::tempdir().unwrap();
        let p = pair(tmp.path(), "old", "new");
        assert!(!pending(std::slice::from_ref(&p)), "sin carpeta vieja");
        fs::create_dir_all(tmp.path().join("old")).unwrap();
        assert!(pending(std::slice::from_ref(&p)));
        fs::create_dir_all(tmp.path().join("new")).unwrap();
        assert!(!pending(&[p]), "la nueva ya existe");
    }

    /// Windows: a folder with a file open inside cannot be renamed until it is closed (as
    /// LibreTeX's webview right after LibreTeX closes); the move waits for it.
    #[cfg(windows)]
    #[test]
    fn espera_a_que_se_suelte_la_carpeta() {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir_all(tmp.path().join("old/EBWebView")).unwrap();
        fs::write(tmp.path().join("old/EBWebView/LOCK"), "x").unwrap();
        let open = fs::File::open(tmp.path().join("old/EBWebView/LOCK")).unwrap();
        let release = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(500));
            drop(open);
        });
        assert!(migrate(&[pair(tmp.path(), "old", "new")]).is_empty());
        release.join().unwrap();
        assert!(tmp.path().join("new/EBWebView/LOCK").is_file());
        assert!(!tmp.path().join("old").exists());
    }

    #[test]
    fn sin_carpeta_vieja_no_hace_nada() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(migrate(&[pair(tmp.path(), "old", "new")]).is_empty());
        assert!(!tmp.path().join("new").exists());
    }

    #[test]
    fn pares_repetidos_se_migran_una_vez() {
        // macOS: settings and data are the same folder.
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir_all(tmp.path().join("old")).unwrap();
        fs::write(tmp.path().join("old/a"), "a").unwrap();
        let p = pair(tmp.path(), "old", "new");
        assert!(migrate(&[p.clone(), p]).is_empty());
        assert!(tmp.path().join("new/a").is_file());
    }

    #[test]
    fn la_copia_conserva_los_enlaces() {
        // TeX Live's bin folder is full of relative links (latex -> pdftex).
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir_all(tmp.path().join("old/bin")).unwrap();
        fs::write(tmp.path().join("old/bin/pdftex"), "motor").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink("pdftex", tmp.path().join("old/bin/latex")).unwrap();
        copy_then_remove(&tmp.path().join("old"), &tmp.path().join("new")).unwrap();
        assert!(!tmp.path().join("old").exists());
        assert_eq!(
            fs::read_to_string(tmp.path().join("new/bin/pdftex")).unwrap(),
            "motor"
        );
        #[cfg(unix)]
        assert_eq!(
            fs::read_link(tmp.path().join("new/bin/latex")).unwrap(),
            Path::new("pdftex")
        );
    }

    #[cfg(unix)]
    #[test]
    fn copia_fallida_deja_el_origen() {
        use std::os::unix::fs::PermissionsExt;
        let tmp = tempfile::tempdir().unwrap();
        let old = tmp.path().join("old");
        fs::create_dir_all(&old).unwrap();
        fs::write(old.join("a"), "a").unwrap();
        fs::write(old.join("secreto"), "s").unwrap();
        fs::set_permissions(old.join("secreto"), fs::Permissions::from_mode(0o000)).unwrap();
        if fs::read(old.join("secreto")).is_ok() {
            return; // root reads anything: nothing to test here
        }
        assert!(copy_then_remove(&old, &tmp.path().join("new")).is_err());
        assert!(old.join("a").is_file());
        assert!(old.join("secreto").exists());
        assert!(!tmp.path().join("new").exists());
        fs::set_permissions(old.join("secreto"), fs::Permissions::from_mode(0o644)).unwrap();
    }

    #[test]
    fn las_carpetas_de_la_app_sin_repetir() {
        let old = AppDirs {
            config: "/o/conf".into(),
            data: "/o/conf".into(),
            cache: "/o/cache".into(),
        };
        let new = AppDirs {
            config: "/n/conf".into(),
            data: "/n/conf".into(),
            cache: "/n/cache".into(),
        };
        let pairs = app_pairs(&old, &new, Some(("/w/old".into(), "/w/new".into())));
        assert_eq!(
            pairs,
            vec![
                MovePair {
                    from: "/o/conf".into(),
                    to: "/n/conf".into()
                },
                MovePair {
                    from: "/o/cache".into(),
                    to: "/n/cache".into()
                },
                MovePair {
                    from: "/w/old".into(),
                    to: "/w/new".into()
                },
            ]
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn en_linux_las_rutas_son_las_de_xdg() {
        let pairs = system_pairs();
        let names: Vec<(String, String)> = pairs
            .iter()
            .map(|p| {
                let name = |path: &Path| path.file_name().unwrap().to_string_lossy().into_owned();
                (name(&p.from), name(&p.to))
            })
            .collect();
        // ~/.config, ~/.local/share and ~/.cache, then the webview's ~/.local/share/<id>.
        assert_eq!(
            names,
            [
                ("libretex", "jutex"),
                ("libretex", "jutex"),
                ("libretex", "jutex"),
                (OLD_IDENTIFIER, NEW_IDENTIFIER)
            ]
            .map(|(a, b)| (a.to_owned(), b.to_owned()))
        );
        let base = directories::BaseDirs::new().unwrap();
        assert_eq!(pairs[0].to, base.config_dir().join("jutex"));
        assert_eq!(pairs[3].to, base.data_dir().join(NEW_IDENTIFIER));
    }

    /// The real TeX Live of the app, copied elsewhere (as when moving to another disk),
    /// still compiles: its paths are relative to where it is.
    #[test]
    #[ignore = "copia el TeX Live de LibreTeX de esta máquina (~225 MB)"]
    fn el_tex_live_movido_compila() {
        // Where LibreTeX kept it on each system (`AppState::texlive_dir`): in macOS
        // `~/Library/Application Support/org.LibreTeX.libretex/texlive`.
        let Some(dirs) = directories::ProjectDirs::from("org", "LibreTeX", "libretex") else {
            return;
        };
        let source = dirs.data_dir().join("texlive");
        if !source.is_dir() {
            eprintln!("sin TeX Live de LibreTeX en {}", source.display());
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let copy = tmp.path().join("copia");
        fs::create_dir_all(&copy).unwrap();
        // copy_then_remove would delete the original: copy into a scratch first.
        let scratch = tmp.path().join("texlive-viejo");
        copy_tree(&source, &scratch).unwrap();
        copy_then_remove(&scratch, &copy.join("texlive")).unwrap();
        let bin = fs::read_dir(copy.join("texlive"))
            .unwrap()
            .flatten()
            .map(|e| e.path().join("bin"))
            .find(|b| b.is_dir())
            .and_then(|b| fs::read_dir(b).unwrap().flatten().map(|e| e.path()).next())
            .expect("bin/<plataforma>");
        let doc = tmp.path().join("doc");
        fs::create_dir_all(&doc).unwrap();
        fs::write(
            doc.join("main.tex"),
            "\\documentclass{article}\\usepackage[spanish]{babel}\\begin{document}Hola\\end{document}",
        )
        .unwrap();
        let path = std::env::join_paths(
            std::iter::once(bin.clone())
                .chain(std::env::split_paths(&std::env::var_os("PATH").unwrap())),
        )
        .unwrap();
        let status = std::process::Command::new(bin.join("xelatex"))
            .args(["-interaction=nonstopmode", "main.tex"])
            .current_dir(&doc)
            .env("PATH", path)
            .status()
            .unwrap();
        assert!(status.success());
        assert!(doc.join("main.pdf").is_file());
    }
}
