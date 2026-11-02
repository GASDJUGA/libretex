//! Package backends (5.6): which TeX distribution LibreTeX can manage packages with.
//!
//! 1. TeX Live managed by LibreTeX (user install, `tlmgr` works without root).
//! 2. The official TeX Live in /usr/local/texlive, if the user can write to it; if only root
//!    can (MacTeX, or one installed with sudo), read-only: packages come with `sudo tlmgr`.
//! 3. The TeX Live of pacman: read-only (packages come with `pacman -S texlive-…`).
//! 4. MiKTeX (Windows, also Linux): writable with `miktex packages`, for the user.
//! 5. Any other TeX found in the PATH: read-only.

use crate::tex::detect::{find_in_path, texlive_bin_dirs};
use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BackendKind {
    Managed,
    Official,
    /// The official TeX Live when only root can modify it (MacTeX).
    OfficialReadOnly,
    Pacman,
    /// MiKTeX: packages are installed with `miktex packages`, for the user (no administrator).
    Miktex,
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
    /// `tlmgr` of this installation, if any (for read-only ones, only for queries); for MiKTeX,
    /// its `miktex` program.
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
            // `tlmgr` (`tlmgr.bat` on Windows).
            let tlmgr = crate::tex::detect::executable_in(&bin, "tlmgr")?;
            // …/2026/bin/x86_64-linux → …/2026
            let install = bin.parent()?.parent()?.to_owned();
            Some((install, tlmgr))
        })
        .collect()
}

fn year_of(install: &Path) -> Option<String> {
    install
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
}

/// MacTeX links its tools from `/Library/TeX/texbin`: that `tlmgr` is the one users know (and
/// the one in their terminal's `PATH`), for the command they copy.
fn short_tlmgr(tlmgr: &Path) -> PathBuf {
    let texbin = Path::new("/Library/TeX/texbin/tlmgr");
    let same = |a: &Path, b: &Path| {
        dunce::canonicalize(a)
            .ok()
            .is_some_and(|a| dunce::canonicalize(b).ok() == Some(a))
    };
    if same(texbin, tlmgr) {
        texbin.to_owned()
    } else {
        tlmgr.to_owned()
    }
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
                BackendKind::OfficialReadOnly
            },
            year: year_of(&install),
            root: Some(install.display().to_string()),
            tlmgr: Some(short_tlmgr(&tlmgr).display().to_string()),
            writable,
        });
    }
    let kpsewhich = find_in_path("kpsewhich", at.path);
    // Resolved: MacTeX's `/Library/TeX/texbin` links into the official TeX Live, already listed.
    let real = |p: &Path| dunce::canonicalize(p).unwrap_or_else(|_| p.to_owned());
    let from_managed_or_official = kpsewhich.as_ref().is_some_and(|k| {
        let k = real(k);
        k.starts_with(real(at.managed)) || k.starts_with(real(at.official))
    });
    if let Some(kpsewhich) = kpsewhich.filter(|_| !from_managed_or_official) {
        let bin = kpsewhich.parent();
        // MiKTeX's `miktex` sits next to its kpsewhich (`…\MiKTeX\miktex\bin\x64`).
        let miktex = bin.and_then(|dir| crate::tex::detect::executable_in(dir, "miktex"));
        let pacman = at.pacman && at.system_tlpdb.is_file();
        available.push(match miktex {
            Some(miktex) => Backend {
                kind: BackendKind::Miktex,
                year: None,
                // …\MiKTeX\miktex\bin\x64 → …\MiKTeX
                root: kpsewhich
                    .ancestors()
                    .nth(4)
                    .map(|p| p.display().to_string()),
                // The program that manages its packages (`miktex`, not tlmgr).
                tlmgr: Some(miktex.display().to_string()),
                writable: true,
            },
            None => Backend {
                kind: if pacman {
                    BackendKind::Pacman
                } else {
                    BackendKind::ReadOnly
                },
                year: None,
                root: bin.map(|p| p.display().to_string()),
                tlmgr: find_in_path("tlmgr", at.path).map(|t| t.display().to_string()),
                writable: false,
            },
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
        official: &official_texlive(),
        system_tlpdb: Path::new(SYSTEM_TLPDB),
        pacman: Path::new("/usr/bin/pacman").is_file(),
        path: &path,
        choice,
    })
}

/// The official TeX Live (`install-tl` default): `/usr/local/texlive`, on Windows
/// `C:\texlive`.
pub fn official_texlive() -> PathBuf {
    #[cfg(windows)]
    return crate::tex::detect::system_drive().join("texlive");
    #[cfg(not(windows))]
    return PathBuf::from("/usr/local/texlive");
}

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
    extra.extend(texlive_bin_dirs(&official_texlive()));
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
    fn un_enlace_al_tex_live_oficial_no_lo_repite() {
        // Like MacTeX: /Library/TeX/texbin → /usr/local/texlive/2026/bin/universal-darwin.
        let f = Fixture::new();
        f.texlive("official", "2026");
        executable(&f.path("official/2026/bin/x86_64-linux/kpsewhich"));
        std::os::unix::fs::symlink(f.path("official/2026/bin/x86_64-linux"), f.path("texbin"))
            .unwrap();
        let found = f.detect(false, &["texbin"]);
        assert_eq!(found.available.len(), 1);
        assert_eq!(found.available[0].kind, BackendKind::Official);
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
            let active = found.active.unwrap();
            assert_eq!(active.kind, BackendKind::OfficialReadOnly);
            assert!(!active.writable);
            assert!(active.tlmgr.unwrap().ends_with("tlmgr"));
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
        let first = system.iter().find(|d| !d.starts_with(official_texlive()));
        assert_eq!(first, Some(&f.path("usr/bin")));
    }
}

#[cfg(all(test, windows))]
mod windows_tests {
    use super::*;
    use tempfile::TempDir;

    /// MiKTeX for the user: its kpsewhich with `miktex` next to it is a writable backend whose
    /// packages are managed with `miktex`.
    #[test]
    fn miktex_es_un_backend_escribible() {
        let tmp = TempDir::new().unwrap();
        let bin = tmp.path().join(r"Programs\MiKTeX\miktex\bin\x64");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("kpsewhich.exe"), "").unwrap();
        let detect = |path: &Path| {
            detect_backends(&Locations {
                managed: &tmp.path().join("libretex"),
                official: &tmp.path().join("texlive"),
                system_tlpdb: &tmp.path().join("no.tlpdb"),
                pacman: false,
                path: path.as_os_str(),
                choice: TexChoice::Auto,
            })
        };
        // Without `miktex`: some other TeX, read-only.
        assert_eq!(detect(&bin).active.unwrap().kind, BackendKind::ReadOnly);

        std::fs::write(bin.join("miktex.exe"), "").unwrap();
        let active = detect(&bin).active.unwrap();
        assert_eq!(active.kind, BackendKind::Miktex);
        assert!(active.writable);
        assert_eq!(
            active.tlmgr.as_deref(),
            Some(bin.join("miktex.exe").to_str().unwrap())
        );
        assert_eq!(
            active.root.as_deref(),
            Some(tmp.path().join(r"Programs\MiKTeX").to_str().unwrap())
        );
    }
}
