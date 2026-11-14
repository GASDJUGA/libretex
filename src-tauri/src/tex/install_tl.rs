//! JuTeX's own TeX Live (5.6, backend 1): a user installation in
//! `~/.local/share/jutex/texlive/<year>` made with the official `install-tl`, so `tlmgr`
//! works without root. It never touches the system PATH; JuTeX puts it first when
//! compiling. Network use happens only here, when the user asks for it.

use crate::error::{AppError, AppResult};
use crate::tex::process;
use serde::Serialize;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

/// The official installer for this system: a `.tar.gz` for Unix, a `.zip` for Windows (which
/// brings the Perl it runs on, `tlperl`).
#[cfg(not(windows))]
pub const INSTALLER_FILE: &str = "install-tl-unx.tar.gz";
#[cfg(windows)]
pub const INSTALLER_FILE: &str = "install-tl.zip";

/// Where the installer is downloaded from (the CTAN mirror redirector picks a nearby mirror).
pub fn installer_url() -> String {
    format!("https://mirror.ctan.org/systems/texlive/tlnet/{INSTALLER_FILE}")
}

/// TeX Live's signing key, as published by TUG. Where it comes from does not matter: only a
/// signature by the key with [`TEXLIVE_KEY_FINGERPRINT`] is accepted.
const TEXLIVE_KEY_URL: &str = "https://tug.org/texlive/files/texlive.asc";

/// Fingerprint of TeX Live's key (https://www.tug.org/texlive/verify.html). The installer
/// comes from a mirror chosen by CTAN's redirector, run by anyone: its checksum must be
/// signed by this key before it is run.
pub const TEXLIVE_KEY_FINGERPRINT: &str = "C78B82D8C79512F79CC0D7C80D5E5D9106BAB6BC";

/// Largest checksum, signature or key file accepted.
const MAX_SMALL_DOWNLOAD: u64 = 256 * 1024;

/// Installed after the basic scheme: what the default template (XeLaTeX + babel spanish)
/// needs. Everything else is installed on demand from the package manager.
pub const BASE_PACKAGES: [&str; 8] = [
    "xetex",
    "xetexconfig",
    "fontspec",
    "lm",
    "babel-spanish",
    "hyphen-spanish",
    "latexmk",
    // SyncTeX between the editor and the PDF (not in the basic scheme).
    "synctex",
];

/// The `install-tl` profile: basic scheme, no docs or sources, PATH untouched (on Windows,
/// also no Start menu shortcuts nor file associations). Paths with `/`, also on Windows.
pub fn profile(texdir: &Path, texmf_local: &Path, year: &str) -> String {
    let slashes = |p: &Path| p.display().to_string().replace('\\', "/");
    let dir = slashes(texdir);
    let windows = if cfg!(windows) {
        "tlpdbopt_desktop_integration 0\ntlpdbopt_file_assocs 0\n"
    } else {
        ""
    };
    format!(
        "selected_scheme scheme-basic
TEXDIR {dir}
TEXMFLOCAL {local}
TEXMFSYSCONFIG {dir}/texmf-config
TEXMFSYSVAR {dir}/texmf-var
TEXMFHOME ~/texmf
TEXMFCONFIG ~/.texlive{year}/texmf-config
TEXMFVAR ~/.texlive{year}/texmf-var
instopt_adjustpath 0
instopt_adjustrepo 1
instopt_letter 0
instopt_portable 0
instopt_write18_restricted 1
tlpdbopt_autobackup 1
tlpdbopt_install_docfiles 0
tlpdbopt_install_srcfiles 0
{windows}",
        local = slashes(texmf_local),
    )
}

/// `gpg`/`gpgv`: in the `PATH` (with its usual extra places), or on Windows those of Git for
/// Windows, which ships them in `…\Git\usr\bin` but only puts `…\Git\cmd` in the `PATH`.
fn gnupg_tool(name: &'static str, path: &std::ffi::OsStr) -> AppResult<PathBuf> {
    let found = crate::tex::detect::find_in_path(name, path);
    #[cfg(windows)]
    let found = found.or_else(|| {
        let git = crate::tex::detect::find_in_path("git", path)?;
        // …\Git\cmd\git.exe → …\Git\usr\bin
        let usr_bin = git.parent()?.parent()?.join("usr").join("bin");
        crate::tex::detect::executable_in(&usr_bin, name)
    });
    found.ok_or(AppError::MissingTool(name))
}

/// The Perl that runs `install-tl`, with what it needs: the system's on Unix, the one the
/// Windows installer brings (as `install-tl-windows.bat` does, without its window).
fn installer_perl(installer: &Path) -> Command {
    #[cfg(not(windows))]
    {
        let _ = installer;
        crate::platform::process::command("perl")
    }
    #[cfg(windows)]
    {
        let tlperl = installer.join("tlpkg").join("tlperl");
        let bin = tlperl.join("bin");
        let mut command = crate::platform::process::command(bin.join("perl.exe"));
        let path = std::env::var_os("PATH").unwrap_or_default();
        let paths = std::iter::once(bin).chain(std::env::split_paths(&path));
        if let Ok(path) = std::env::join_paths(paths) {
            command.env("PATH", path);
        }
        command
            .env("PERL5LIB", tlperl.join("lib"))
            .env_remove("PERL5OPT")
            .env_remove("PERLIO");
        command
    }
}

/// Unpacks the installer in `work`: `tar` reads both formats, but only Windows' own
/// (`System32\tar.exe`, bsdtar) reads `.zip`; Git for Windows' is GNU tar.
fn extract(archive: &Path, work: &Path) -> AppResult<()> {
    #[cfg(not(windows))]
    let mut command = crate::platform::process::command("tar");
    #[cfg(windows)]
    let mut command = crate::platform::process::command(
        std::env::var_os("SystemRoot")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(r"C:\Windows"))
            .join("System32")
            .join("tar.exe"),
    );
    let status = command
        .arg("-xf")
        .arg(archive)
        .arg("-C")
        .arg(work)
        .status()
        .map_err(|e| AppError::Other(format!("tar: {e}")))?;
    if status.success() {
        Ok(())
    } else {
        Err(AppError::Other(
            "no se pudo descomprimir el instalador".into(),
        ))
    }
}

/// TeX Live year from `install-tl --version` («TeX Live (https://tug.org/texlive) version 2026»).
pub fn release_year(version_output: &str) -> Option<String> {
    version_output.lines().find_map(|line| {
        let rest = line.trim().strip_prefix("TeX Live")?;
        let year = rest.rsplit("version").next()?.trim();
        (year.len() == 4 && year.chars().all(|c| c.is_ascii_digit())).then(|| year.to_owned())
    })
}

/// A package being installed: `(done, total, package)` from a progress line of
/// `install-tl` («Installing [007/339, time/total: …]: amsmath [31k]») or of `tlmgr install`
/// («[3/11, 00:00/00:00] install: fontspec [27k]»).
pub fn parse_progress(line: &str) -> Option<(u32, u32, String)> {
    let start = line.find('[')?;
    let rest = &line[start + 1..];
    let (counts, rest) = rest.split_once(',')?;
    let (done, total) = counts.split_once('/')?;
    let (done, total) = (done.trim().parse().ok()?, total.trim().parse().ok()?);
    let after = rest.split_once(']')?.1;
    let package = after
        .trim_start_matches([':', ' '])
        .trim_start_matches("install:")
        .split_whitespace()
        .next()?
        .to_owned();
    Some((done, total, package))
}

/// One step of the installation, sent to the UI.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", tag = "step")]
pub enum Progress {
    /// Downloading the installer (bytes).
    Download {
        done: u64,
        total: Option<u64>,
    },
    Extract,
    /// Installing the basic scheme with install-tl.
    Install {
        done: u32,
        total: u32,
        package: String,
    },
    /// Installing the template's packages with tlmgr.
    Packages {
        done: u32,
        total: u32,
        package: String,
    },
    /// A line of output (for the log).
    Line {
        line: String,
    },
}

/// A running installation: cancel flag and the process to kill.
#[derive(Default)]
pub struct Job {
    cancelled: AtomicBool,
    pid: Mutex<Option<u32>>,
}

impl Job {
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        if let Some(pid) = *self.pid.lock().unwrap_or_else(|p| p.into_inner()) {
            process::kill_group(pid);
        }
    }

    fn check(&self) -> AppResult<()> {
        if self.cancelled.load(Ordering::SeqCst) {
            Err(AppError::Cancelled)
        } else {
            Ok(())
        }
    }
}

/// Downloads `url` to `dest`, reporting bytes; stops when the job is cancelled. Returns the
/// address it finally came from (the mirror the redirector chose).
fn download(url: &str, dest: &Path, job: &Job, on: &mut dyn FnMut(Progress)) -> AppResult<String> {
    use ureq::ResponseExt;
    let mut response = ureq::get(url)
        .call()
        .map_err(|e| AppError::Network(e.to_string()))?;
    let source = response.get_uri().to_string();
    let total = response
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok());
    let mut reader = response.body_mut().as_reader();
    let mut file = std::fs::File::create(dest).map_err(|e| AppError::io(dest, e))?;
    let mut buf = vec![0u8; 64 * 1024];
    let mut done = 0u64;
    loop {
        job.check()?;
        let n = reader
            .read(&mut buf)
            .map_err(|e| AppError::Network(e.to_string()))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])
            .map_err(|e| AppError::io(dest, e))?;
        done += n as u64;
        on(Progress::Download { done, total });
    }
    file.sync_all().map_err(|e| AppError::io(dest, e))?;
    Ok(source)
}

/// A small file (checksum, signature, key).
fn fetch_small(url: &str) -> AppResult<Vec<u8>> {
    let mut response = ureq::get(url)
        .call()
        .map_err(|e| AppError::Network(e.to_string()))?;
    let mut bytes = Vec::new();
    response
        .body_mut()
        .as_reader()
        .take(MAX_SMALL_DOWNLOAD)
        .read_to_end(&mut bytes)
        .map_err(|e| AppError::Network(e.to_string()))?;
    Ok(bytes)
}

/// The primary key fingerprint of a good signature in `gpgv --status-fd` output, if any
/// (`[GNUPG:] VALIDSIG <subkey> … <primary>`).
pub fn signed_by(status: &str) -> Option<&str> {
    status
        .lines()
        .find_map(|line| line.strip_prefix("[GNUPG:] VALIDSIG "))
        .and_then(|rest| rest.split_whitespace().last())
}

/// The SHA-512 that a `.sha512` file gives for `file_name` (lowercase hex).
pub fn expected_sha512(text: &str, file_name: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let mut parts = line.split_whitespace();
        let hash = parts.next()?;
        let name = parts.next()?.trim_start_matches('*');
        (name == file_name && hash.len() == 128 && hash.chars().all(|c| c.is_ascii_hexdigit()))
            .then(|| hash.to_ascii_lowercase())
    })
}

/// SHA-512 of a file, in lowercase hex.
fn sha512_of(path: &Path) -> AppResult<String> {
    use sha2::{Digest, Sha512};
    let mut file = std::fs::File::open(path).map_err(|e| AppError::io(path, e))?;
    let mut hasher = Sha512::new();
    std::io::copy(&mut file, &mut hasher).map_err(|e| AppError::io(path, e))?;
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

/// Checks the downloaded installer before running it: its checksum (from the same mirror)
/// must be signed by TeX Live's key and match the file. Uses the system's `gpg`/`gpgv`
/// (part of every Arch system: pacman needs them; on macOS, Homebrew's `gnupg`) in a folder
/// of its own.
fn verify_installer(tarball: &Path, source: &str, work: &Path) -> AppResult<()> {
    let invalid = || {
        AppError::Other(
            "el instalador de TeX Live descargado no tiene una firma válida de TeX Live; no se \
             ejecutó (prueba de nuevo más tarde: el espejo puede estar a medio actualizar)"
                .into(),
        )
    };
    // With the standard locations: opened from the Dock, macOS gives no Homebrew in `PATH`.
    let path = crate::tex::detect::search_path(&[], std::env::var_os("PATH").as_deref());
    let gpg = gnupg_tool("gpg", &path)?;
    let gpgv = gnupg_tool("gpgv", &path)?;
    let dir = work.join("verificar");
    std::fs::create_dir_all(dir.join("gnupg")).map_err(|e| AppError::io(&dir, e))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let home = dir.join("gnupg");
        std::fs::set_permissions(&home, std::fs::Permissions::from_mode(0o700))
            .map_err(|e| AppError::io(&home, e))?;
    }
    let write = |name: &str, bytes: &[u8]| {
        let file = dir.join(name);
        std::fs::write(&file, bytes).map_err(|e| AppError::io(&file, e))?;
        Ok::<_, AppError>(file)
    };
    let checksum = write(
        "installer.sha512",
        &fetch_small(&format!("{source}.sha512"))?,
    )?;
    let signature = write(
        "installer.sha512.asc",
        &fetch_small(&format!("{source}.sha512.asc"))?,
    )?;
    let key = write("texlive.asc", &fetch_small(TEXLIVE_KEY_URL)?)?;
    // The keyring is named relative to `dir` (its working folder): gpg reads `C:` in
    // `C:\…\texlive.gpg` as the type of keyring (`type:path`), and Git for Windows' gpgv
    // finds nothing.
    let keyring = "./texlive.gpg";
    let dearmor = crate::platform::process::command(gpg)
        .current_dir(&dir)
        .arg("--homedir")
        .arg(dir.join("gnupg"))
        .args(["--batch", "--no-autostart", "--yes", "--output", keyring])
        .arg("--dearmor")
        .arg(&key)
        .output()
        .map_err(|e| AppError::Other(format!("gpg: {e}")))?;
    if !dearmor.status.success() {
        return Err(invalid());
    }
    let verify = crate::platform::process::command(gpgv)
        .current_dir(&dir)
        .args(["--keyring", keyring, "--status-fd", "1"])
        .arg(&signature)
        .arg(&checksum)
        .output()
        .map_err(|e| AppError::Other(format!("gpgv: {e}")))?;
    let status = String::from_utf8_lossy(&verify.stdout);
    if !verify.status.success() || signed_by(&status) != Some(TEXLIVE_KEY_FINGERPRINT) {
        return Err(invalid());
    }
    let text = std::fs::read_to_string(&checksum).map_err(|e| AppError::io(&checksum, e))?;
    let name = tarball
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    match expected_sha512(&text, &name) {
        Some(expected) if expected == sha512_of(tarball)? => Ok(()),
        _ => Err(invalid()),
    }
}

/// Runs `command` in its own process group, forwarding lines and progress; fails with the
/// last lines of output if it exits with an error.
pub(crate) fn run_step(
    mut command: Command,
    label: &str,
    job: &Job,
    on: &mut dyn FnMut(Progress),
    progress: impl Fn(u32, u32, String) -> Progress,
) -> AppResult<()> {
    command.env("LANG", "C");
    let run = process::spawn(command, label)?;
    *job.pid.lock().unwrap_or_else(|p| p.into_inner()) = Some(run.pid());
    let mut tail: Vec<String> = Vec::new();
    let status = run.wait(|line| {
        if let Some((done, total, package)) = parse_progress(&line) {
            on(progress(done, total, package));
        }
        tail.push(line.clone());
        if tail.len() > 20 {
            tail.remove(0);
        }
        on(Progress::Line { line });
    });
    *job.pid.lock().unwrap_or_else(|p| p.into_inner()) = None;
    job.check()?;
    let status = status?;
    if status.success() {
        Ok(())
    } else {
        Err(AppError::Other(format!(
            "{label} terminó con error:\n{}",
            tail.join("\n")
        )))
    }
}

/// Installs JuTeX's TeX Live in `root/<year>` (`root` = …/jutex/texlive), using
/// `work` for the downloaded installer. On error or cancellation nothing is left behind.
/// Returns the installation folder.
pub fn install(
    root: &Path,
    work: &Path,
    job: &Job,
    on: &mut dyn FnMut(Progress),
) -> AppResult<PathBuf> {
    if !crate::tex::detect::texlive_bin_dirs(root).is_empty() {
        return Err(AppError::AlreadyExists(root.to_owned()));
    }
    let _ = std::fs::remove_dir_all(work);
    std::fs::create_dir_all(work).map_err(|e| AppError::io(work, e))?;
    let tarball = work.join(INSTALLER_FILE);
    let source = download(&installer_url(), &tarball, job, on)?;
    job.check()?;
    on(Progress::Line {
        line: "Verificando la firma del instalador (TeX Live)…".into(),
    });
    verify_installer(&tarball, &source, work)?;

    on(Progress::Extract);
    extract(&tarball, work)?;
    let installer = std::fs::read_dir(work)
        .map_err(|e| AppError::io(work, e))?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .find(|p| p.join("install-tl").is_file())
        .ok_or_else(|| AppError::Other("el paquete del instalador no tiene install-tl".into()))?;
    let version = installer_perl(&installer)
        .arg(installer.join("install-tl"))
        .arg("--version")
        .output()
        .map_err(|e| AppError::Other(format!("perl: {e}")))?;
    let year = release_year(&String::from_utf8_lossy(&version.stdout))
        .ok_or_else(|| AppError::Other("no se pudo saber la versión de TeX Live".into()))?;

    let texdir = root.join(&year);
    let texmf_local = root.join("texmf-local");
    let result = (|| {
        job.check()?;
        let profile_file = work.join("jutex.profile");
        std::fs::write(&profile_file, profile(&texdir, &texmf_local, &year))
            .map_err(|e| AppError::io(&profile_file, e))?;
        let mut command = installer_perl(&installer);
        command
            .arg(installer.join("install-tl"))
            .arg(format!("--profile={}", profile_file.display()))
            .arg("--no-interaction")
            // Text mode: on Windows install-tl would open its window otherwise.
            .arg("-no-gui")
            .current_dir(&installer);
        run_step(command, "install-tl", job, on, |done, total, package| {
            Progress::Install {
                done,
                total,
                package,
            }
        })?;

        // `tlmgr` (`tlmgr.bat` on Windows).
        let tlmgr = crate::tex::detect::texlive_bin_dirs(root)
            .into_iter()
            .find_map(|bin| crate::tex::detect::executable_in(&bin, "tlmgr"))
            .ok_or_else(|| AppError::Other("la instalación no tiene tlmgr".into()))?;
        let mut command = crate::platform::process::command(tlmgr);
        command.arg("install").args(BASE_PACKAGES);
        run_step(command, "tlmgr", job, on, |done, total, package| {
            Progress::Packages {
                done,
                total,
                package,
            }
        })
    })();
    let _ = std::fs::remove_dir_all(work);
    if let Err(error) = result {
        // A partial installation is useless: remove it (it is JuTeX's own folder).
        let _ = std::fs::remove_dir_all(&texdir);
        let _ = std::fs::remove_dir_all(&texmf_local);
        return Err(error);
    }
    Ok(texdir)
}

#[cfg(test)]
mod tests {
    #[test]
    fn firma_y_suma_del_instalador() {
        let status = "[GNUPG:] NEWSIG\n[GNUPG:] GOODSIG 4CE1877E19438C70 TeX Live\n\
            [GNUPG:] VALIDSIG D8F2F86057A857E42A88106A4CE1877E19438C70 2026-10-23 1792799853 0 4 0 1 10 01 C78B82D8C79512F79CC0D7C80D5E5D9106BAB6BC\n";
        assert_eq!(signed_by(status), Some(TEXLIVE_KEY_FINGERPRINT));
        assert_eq!(signed_by("[GNUPG:] BADSIG 4CE1877E19438C70 x\n"), None);
        let hash = "D4".repeat(64);
        let text = format!("{hash}  install-tl-unx.tar.gz\n");
        assert_eq!(
            expected_sha512(&text, "install-tl-unx.tar.gz"),
            Some(hash.to_ascii_lowercase())
        );
        assert_eq!(expected_sha512(&text, "otro.tar.gz"), None);
        assert_eq!(
            expected_sha512("abc  install-tl-unx.tar.gz", "install-tl-unx.tar.gz"),
            None
        );
    }

    /// Against the real files (network): `cargo test -- --ignored firma_real`.
    #[test]
    #[ignore]
    fn firma_real_del_instalador() {
        let work = tempfile::TempDir::new().unwrap();
        let tarball = work.path().join(INSTALLER_FILE);
        let job = Job::default();
        let source = download(&installer_url(), &tarball, &job, &mut |_| {}).unwrap();
        verify_installer(&tarball, &source, work.path()).unwrap();
        // A changed byte is rejected.
        let mut bytes = std::fs::read(&tarball).unwrap();
        bytes[1000] ^= 1;
        std::fs::write(&tarball, bytes).unwrap();
        assert!(verify_installer(&tarball, &source, work.path()).is_err());
    }

    use super::*;

    /// Installs for real in a temporary folder (network, ~200 MB, about a minute) and compiles
    /// a document with XeLaTeX and babel-spanish using only that TeX Live:
    /// `cargo test -- --ignored instalacion_real`.
    #[test]
    #[ignore]
    fn instalacion_real() {
        let tmp = tempfile::TempDir::new().unwrap();
        let root = tmp.path().join("texlive");
        let job = Job::default();
        let install = install(&root, &tmp.path().join("trabajo"), &job, &mut |p| {
            eprintln!("{p:?}")
        })
        .unwrap();
        let bin = crate::tex::detect::texlive_bin_dirs(&root).remove(0);
        assert!(install.starts_with(&root));
        std::fs::write(
            tmp.path().join("doc.tex"),
            "\\documentclass{article}\\usepackage{fontspec}\\usepackage[spanish]{babel}\n\\begin{document}Canción\\end{document}\n",
        )
        .unwrap();
        // Only this TeX Live (and the system's basic tools).
        let system: Vec<PathBuf> = if cfg!(windows) {
            let system32 = PathBuf::from(std::env::var_os("SystemRoot").unwrap()).join("System32");
            // install-tl uses PowerShell on Windows (every app has it in its PATH).
            vec![system32.join("WindowsPowerShell").join("v1.0"), system32]
        } else {
            vec!["/usr/bin".into(), "/bin".into()]
        };
        let path = std::env::join_paths(std::iter::once(bin.clone()).chain(system)).unwrap();
        let latexmk = crate::tex::detect::executable_in(&bin, "latexmk").unwrap();
        let status = crate::platform::process::command(latexmk)
            .args(["-xelatex", "-interaction=nonstopmode", "doc.tex"])
            .current_dir(tmp.path())
            .env("PATH", path)
            .status()
            .unwrap();
        assert!(status.success());
        assert!(tmp.path().join("doc.pdf").is_file());
    }

    #[test]
    fn perfil_esquema_basico_sin_tocar_el_path() {
        let text = profile(
            Path::new("/home/u/.local/share/jutex/texlive/2026"),
            Path::new("/home/u/.local/share/jutex/texlive/texmf-local"),
            "2026",
        );
        assert!(text.starts_with("selected_scheme scheme-basic\n"));
        assert!(text.contains("\nTEXDIR /home/u/.local/share/jutex/texlive/2026\n"));
        assert!(text.contains("\nTEXMFSYSVAR /home/u/.local/share/jutex/texlive/2026/texmf-var\n"));
        assert!(text.contains("\nTEXMFVAR ~/.texlive2026/texmf-var\n"));
        assert!(text.contains("\ninstopt_adjustpath 0\n"));
        assert!(text.contains("\ntlpdbopt_install_docfiles 0\n"));
        assert!(!text.contains("collection-"));
        // On Windows, no Start menu shortcuts nor file associations.
        assert_eq!(
            text.contains("\ntlpdbopt_desktop_integration 0\ntlpdbopt_file_assocs 0\n"),
            cfg!(windows)
        );
    }

    /// Windows paths go into the profile with `/`.
    #[cfg(windows)]
    #[test]
    fn perfil_con_rutas_de_windows() {
        let text = profile(
            Path::new(r"C:\Users\ana\AppData\Roaming\JuTeX\texlive\2026"),
            Path::new(r"C:\Users\ana\AppData\Roaming\JuTeX\texlive\texmf-local"),
            "2026",
        );
        assert!(text.contains("\nTEXDIR C:/Users/ana/AppData/Roaming/JuTeX/texlive/2026\n"));
        assert!(
            text.contains("\nTEXMFLOCAL C:/Users/ana/AppData/Roaming/JuTeX/texlive/texmf-local\n")
        );
        assert!(!text.contains('\\'));
    }

    #[test]
    fn anio_de_la_version() {
        let out = "install-tl (TeX Live Cross Platform Installer) revision 80485\nTeX Live (https://tug.org/texlive) version 2026\n";
        assert_eq!(release_year(out).as_deref(), Some("2026"));
        assert_eq!(release_year("algo raro"), None);
    }

    #[test]
    fn progreso_de_install_tl_y_de_tlmgr() {
        assert_eq!(
            parse_progress(
                "Installing [007/339, time/total: 00:01/00:28]: antique-spanish-units [1k]"
            ),
            Some((7, 339, "antique-spanish-units".into()))
        );
        assert_eq!(
            parse_progress("Installing [1/4, time/total: ??:??/??:??]: hyphen-base [23k]"),
            Some((1, 4, "hyphen-base".into()))
        );
        assert_eq!(
            parse_progress("[3/11, 00:00/00:00] install: fontspec [27k]"),
            Some((3, 11, "fontspec".into()))
        );
        assert_eq!(
            parse_progress("[09:58:25] running updmap-sys --nohash ...done"),
            None
        );
        assert_eq!(parse_progress("Loading https://ctan.dcc.uchile.cl/…"), None);
    }

    #[test]
    fn no_reinstala_si_ya_existe() {
        let tmp = tempfile::TempDir::new().unwrap();
        std::fs::create_dir_all(tmp.path().join("2026/bin/x86_64-linux")).unwrap();
        let job = Job::default();
        let error = install(tmp.path(), &tmp.path().join("work"), &job, &mut |_| {}).unwrap_err();
        assert_eq!(error.code(), "alreadyExists");
    }

    #[test]
    fn cancelar_marca_el_trabajo() {
        let job = Job::default();
        assert!(job.check().is_ok());
        job.cancel();
        assert_eq!(job.check().unwrap_err().code(), "cancelled");
    }
}
