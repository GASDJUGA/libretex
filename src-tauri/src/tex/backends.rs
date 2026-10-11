//! Package backends (5.6): which TeX distribution LibreTeX can manage packages with.
//!
//! 1. TeX Live managed by LibreTeX (user install, `tlmgr` works without root).
//! 2. The official TeX Live in /usr/local/texlive, if the user can write to it.
//! 3. The TeX Live of pacman: read-only (packages come with `pacman -S texlive-…`).
//! 4. Any other TeX found in the PATH: read-only.

use crate::tex::detect::{find_in_path, texlive_bin_dirs};
use serde::Serialize;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BackendKind {
    Managed,
    Official,
    Pacman,
    ReadOnly,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Backend {
    pub kind: BackendKind,
    /// The installation (e.g. `…/texlive/2026`), when known.
    pub root: Option<String>,
    /// TeX Live year, when known.
    pub year: Option<String>,
    /// `tlmgr` of this installation, if any (for read-only ones, only for queries).
    pub tlmgr: Option<String>,
    /// Packages can be installed and removed with it.
    pub writable: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Backends {
    /// The one LibreTeX uses: the first writable one, else the first found.
    pub active: Option<Backend>,
    pub available: Vec<Backend>,
}

/// Where to look (parameters, so tests can use temporary folders).
pub struct Locations<'a> {
    /// LibreTeX's own TeX Live (`~/.local/share/libretex/texlive`).
    pub managed: &'a Path,
    /// The official TeX Live (`/usr/local/texlive`).
    pub official: &'a Path,
    /// Database of the distribution's TeX Live (`/usr/share/tlpkg/texlive.tlpdb` on Arch).
    pub system_tlpdb: &'a Path,
    /// `pacman` is the package manager (Arch and derivatives).
    pub pacman: bool,
    /// `PATH` used for TeX tools.
    pub path: &'a OsStr,
}

/// Whether the current user can create files in `dir`.
#[cfg(unix)]
pub fn is_writable(dir: &Path) -> bool {
    use std::os::unix::ffi::OsStrExt;
    let Ok(c_path) = std::ffi::CString::new(dir.as_os_str().as_bytes()) else {
        return false;
    };
    // SAFETY: `access` only reads the NUL-terminated path we pass.
    unsafe { libc::access(c_path.as_ptr(), libc::W_OK) == 0 }
}

#[cfg(not(unix))]
pub fn is_writable(dir: &Path) -> bool {
    dir.metadata().is_ok_and(|m| !m.permissions().readonly())
}

/// TeX Live installations under `root` (one per year) that have `tlmgr`.
fn texlive_installs(root: &Path) -> Vec<(PathBuf, PathBuf)> {
    texlive_bin_dirs(root)
        .into_iter()
        .filter_map(|bin| {
            let tlmgr = bin.join("tlmgr");
            // …/2026/bin/x86_64-linux → …/2026
            let install = bin.parent()?.parent()?.to_owned();
            tlmgr.is_file().then_some((install, tlmgr))
        })
        .collect()
}

fn year_of(install: &Path) -> Option<String> {
    install
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
}

/// The backends found, newest installation first within each kind.
pub fn detect_backends(at: &Locations) -> Backends {
    let mut available = Vec::new();
    for (install, tlmgr) in texlive_installs(at.managed) {
        available.push(Backend {
            kind: BackendKind::Managed,
            year: year_of(&install),
            root: Some(install.display().to_string()),
            tlmgr: Some(tlmgr.display().to_string()),
            writable: true,
        });
    }
    for (install, tlmgr) in texlive_installs(at.official) {
        let writable = is_writable(&install.join("tlpkg"));
        available.push(Backend {
            kind: if writable {
                BackendKind::Official
            } else {
                BackendKind::ReadOnly
            },
            year: year_of(&install),
            root: Some(install.display().to_string()),
            tlmgr: Some(tlmgr.display().to_string()),
            writable,
        });
    }
    let kpsewhich = find_in_path("kpsewhich", at.path);
    let from_managed_or_official = kpsewhich
        .as_ref()
        .is_some_and(|k| k.starts_with(at.managed) || k.starts_with(at.official));
    if let Some(kpsewhich) = kpsewhich.filter(|_| !from_managed_or_official) {
        let pacman = at.pacman && at.system_tlpdb.is_file();
        available.push(Backend {
            kind: if pacman {
                BackendKind::Pacman
            } else {
                BackendKind::ReadOnly
            },
            year: None,
            root: kpsewhich.parent().map(|p| p.display().to_string()),
            tlmgr: find_in_path("tlmgr", at.path).map(|t| t.display().to_string()),
            writable: false,
        });
    }
    let active = available
        .iter()
        .find(|b| b.writable)
        .or_else(|| available.first())
        .cloned();
    Backends { active, available }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    use tempfile::TempDir;

    fn executable(path: &Path) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).unwrap();
    }

    struct Fixture {
        tmp: TempDir,
    }

    impl Fixture {
        fn new() -> Self {
            Self {
                tmp: TempDir::new().unwrap(),
            }
        }
        fn path(&self, rel: &str) -> PathBuf {
            self.tmp.path().join(rel)
        }
        fn texlive(&self, root: &str, year: &str) {
            executable(&self.path(&format!("{root}/{year}/bin/x86_64-linux/tlmgr")));
            std::fs::create_dir_all(self.path(&format!("{root}/{year}/tlpkg"))).unwrap();
        }
        fn detect(&self, pacman: bool, path_dirs: &[&str]) -> Backends {
            let path = std::env::join_paths(path_dirs.iter().map(|d| self.path(d))).unwrap();
            detect_backends(&Locations {
                managed: &self.path("managed"),
                official: &self.path("official"),
                system_tlpdb: &self.path("usr/share/tlpkg/texlive.tlpdb"),
                pacman,
                path: &path,
            })
        }
    }

    #[test]
    fn sin_tex_no_hay_backend() {
        let f = Fixture::new();
        assert_eq!(f.detect(true, &["usr/bin"]), Backends::default());
    }

    #[test]
    fn tex_live_de_pacman_solo_lectura() {
        let f = Fixture::new();
        executable(&f.path("usr/bin/kpsewhich"));
        executable(&f.path("usr/bin/tlmgr"));
        std::fs::create_dir_all(f.path("usr/share/tlpkg")).unwrap();
        std::fs::write(f.path("usr/share/tlpkg/texlive.tlpdb"), "").unwrap();
        let found = f.detect(true, &["usr/bin"]);
        let active = found.active.unwrap();
        assert_eq!(active.kind, BackendKind::Pacman);
        assert!(!active.writable);
        assert!(active.tlmgr.unwrap().ends_with("usr/bin/tlmgr"));
        // Without pacman (another distribution): generic read-only.
        assert_eq!(
            f.detect(false, &["usr/bin"]).active.unwrap().kind,
            BackendKind::ReadOnly
        );
    }

    #[test]
    fn el_gestionado_tiene_prioridad_y_el_mas_nuevo_primero() {
        let f = Fixture::new();
        executable(&f.path("usr/bin/kpsewhich"));
        f.texlive("managed", "2025");
        f.texlive("managed", "2026");
        let found = f.detect(true, &["usr/bin"]);
        let active = found.active.unwrap();
        assert_eq!(active.kind, BackendKind::Managed);
        assert_eq!(active.year.as_deref(), Some("2026"));
        assert!(active.writable);
        assert_eq!(found.available.len(), 3);
        assert_eq!(found.available[2].kind, BackendKind::ReadOnly);
    }

    #[test]
    fn el_oficial_es_escribible_solo_si_se_puede_escribir_en_tlpkg() {
        let f = Fixture::new();
        f.texlive("official", "2026");
        let found = f.detect(true, &[]);
        assert_eq!(found.active.as_ref().unwrap().kind, BackendKind::Official);
        assert!(found.active.unwrap().writable);

        std::fs::set_permissions(
            f.path("official/2026/tlpkg"),
            std::fs::Permissions::from_mode(0o555),
        )
        .unwrap();
        // root can write anywhere: the check only means something for a normal user.
        if !is_writable(&f.path("official/2026/tlpkg")) {
            let found = f.detect(true, &[]);
            assert_eq!(found.active.unwrap().kind, BackendKind::ReadOnly);
        }
        std::fs::set_permissions(
            f.path("official/2026/tlpkg"),
            std::fs::Permissions::from_mode(0o755),
        )
        .unwrap();
    }

    #[test]
    fn el_tex_del_path_que_es_el_gestionado_no_se_cuenta_dos_veces() {
        let f = Fixture::new();
        f.texlive("managed", "2026");
        executable(&f.path("managed/2026/bin/x86_64-linux/kpsewhich"));
        let found = f.detect(true, &["managed/2026/bin/x86_64-linux"]);
        assert_eq!(found.available.len(), 1);
    }
}
