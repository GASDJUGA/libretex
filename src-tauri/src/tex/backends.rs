//! Package backends (5.6): which TeX distribution LibreTeX can manage packages with.
//!
//! 1. TeX Live managed by LibreTeX (user install, `tlmgr` works without root).
//! 2. The official TeX Live in /usr/local/texlive, if the user can write to it.
//! 3. The TeX Live of pacman: read-only (packages come with `pacman -S texlive-…`).
//! 4. Any other TeX found in the PATH: read-only.

use crate::tex::detect::{find_in_path, texlive_bin_dirs};
use serde::{Deserialize, Serialize};
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

/// Which TeX the user wants LibreTeX to use (`texDistribution` in `settings.json`).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TexChoice {
    /// LibreTeX's TeX Live if installed, else what the system has.
    #[default]
    Auto,
    /// LibreTeX's TeX Live (with its package manager).
    Libretex,
    /// The system's TeX (pacman, or the official one in /usr/local/texlive).
    System,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Backends {
    /// The one LibreTeX uses (see [`TexChoice`]); compiling uses this TeX too.
    pub active: Option<Backend>,
    pub available: Vec<Backend>,
    pub choice: TexChoice,
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
    /// The user's `PATH` (without LibreTeX's TeX Live), to find the system's TeX.
    pub path: &'a OsStr,
    pub choice: TexChoice,
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
    let wanted = |b: &&Backend| match at.choice {
        TexChoice::Auto => false,
        TexChoice::Libretex => b.kind == BackendKind::Managed,
        TexChoice::System => b.kind != BackendKind::Managed,
    };
    // What the user chose if it exists, else the first writable one, else the first found.
    let active = available
        .iter()
        .find(wanted)
        .or_else(|| available.iter().find(|b| b.writable))
        .or_else(|| available.first())
        .cloned();
    Backends {
        active,
        available,
        choice: at.choice,
    }
}

/// The backends of this machine (Arch's locations), with the user's choice.
pub fn detect_system(managed: &Path, choice: TexChoice) -> Backends {
    let path = crate::tex::detect::search_path(&[], std::env::var_os("PATH").as_deref());
    detect_backends(&Locations {
        managed,
        official: Path::new(OFFICIAL_TEXLIVE),
        system_tlpdb: Path::new(SYSTEM_TLPDB),
        pacman: Path::new("/usr/bin/pacman").is_file(),
        path: &path,
        choice,
    })
}

/// The official TeX Live (`install-tl` default).
pub const OFFICIAL_TEXLIVE: &str = "/usr/local/texlive";
/// The distribution's full TeX Live database (Arch ships one with every package).
pub const SYSTEM_TLPDB: &str = "/usr/share/tlpkg/texlive.tlpdb";

/// `PATH` for TeX tools: the active backend's TeX first, then the user's `PATH`. LibreTeX's
/// TeX Live goes in only when it is the active one.
pub fn tex_path(
    managed: &Path,
    backends: &Backends,
    path_var: Option<&OsStr>,
) -> std::ffi::OsString {
    let mut extra = Vec::new();
    if backends
        .active
        .as_ref()
        .is_some_and(|b| b.kind == BackendKind::Managed)
    {
        extra.extend(texlive_bin_dirs(managed));
    }
    extra.extend(texlive_bin_dirs(Path::new(OFFICIAL_TEXLIVE)));
    crate::tex::detect::search_path(&extra, path_var)
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
            self.detect_with(pacman, path_dirs, TexChoice::Auto)
        }
        fn detect_with(&self, pacman: bool, path_dirs: &[&str], choice: TexChoice) -> Backends {
            let path = std::env::join_paths(path_dirs.iter().map(|d| self.path(d))).unwrap();
            detect_backends(&Locations {
                managed: &self.path("managed"),
                official: &self.path("official"),
                system_tlpdb: &self.path("usr/share/tlpkg/texlive.tlpdb"),
                pacman,
                path: &path,
                choice,
            })
        }
    }

    #[test]
    fn sin_tex_no_hay_backend() {
        let f = Fixture::new();
        assert_eq!(f.detect(true, &["usr/bin"]), Backends::default());
        // A choice that does not exist changes nothing.
        let none = f.detect_with(true, &["usr/bin"], TexChoice::Libretex);
        assert_eq!(none.active, None);
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

    #[test]
    fn el_usuario_elige_entre_el_de_libretex_y_el_del_sistema() {
        let f = Fixture::new();
        executable(&f.path("usr/bin/kpsewhich"));
        std::fs::create_dir_all(f.path("usr/share/tlpkg")).unwrap();
        std::fs::write(f.path("usr/share/tlpkg/texlive.tlpdb"), "").unwrap();
        f.texlive("managed", "2026");
        let kind = |choice| {
            f.detect_with(true, &["usr/bin"], choice)
                .active
                .unwrap()
                .kind
        };
        assert_eq!(kind(TexChoice::Auto), BackendKind::Managed);
        assert_eq!(kind(TexChoice::Libretex), BackendKind::Managed);
        assert_eq!(kind(TexChoice::System), BackendKind::Pacman);
        let found = f.detect_with(true, &["usr/bin"], TexChoice::System);
        assert_eq!(found.available.len(), 2, "los dos se listan");
        assert_eq!(found.choice, TexChoice::System);
    }

    #[test]
    fn sin_tex_del_sistema_se_usa_el_de_libretex_aunque_se_elija_el_sistema() {
        let f = Fixture::new();
        f.texlive("managed", "2026");
        let found = f.detect_with(true, &["usr/bin"], TexChoice::System);
        assert_eq!(found.active.unwrap().kind, BackendKind::Managed);
    }

    #[test]
    fn el_path_lleva_el_tex_live_de_libretex_solo_si_es_el_activo() {
        let f = Fixture::new();
        executable(&f.path("usr/bin/kpsewhich"));
        f.texlive("managed", "2026");
        let user_path = std::env::join_paths([f.path("usr/bin")]).unwrap();
        let managed_bin = f.path("managed/2026/bin/x86_64-linux");
        let dirs = |choice| {
            let backends = f.detect_with(true, &["usr/bin"], choice);
            let path = tex_path(&f.path("managed"), &backends, Some(&user_path));
            std::env::split_paths(&path).collect::<Vec<_>>()
        };
        assert_eq!(dirs(TexChoice::Libretex)[0], managed_bin);
        assert!(!dirs(TexChoice::System).contains(&managed_bin));
        // The machine's official TeX Live (MacTeX on a Mac) may come first.
        let system = dirs(TexChoice::System);
        let first = system.iter().find(|d| !d.starts_with(OFFICIAL_TEXLIVE));
        assert_eq!(first, Some(&f.path("usr/bin")));
    }
}
