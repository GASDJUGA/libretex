//! LibreTeX's own TeX Live (5.6, backend 1): a user installation in
//! `~/.local/share/libretex/texlive/<year>` made with the official `install-tl`, so `tlmgr`
//! works without root. It never touches the system PATH; LibreTeX puts it first when
//! compiling. Network use happens only here, when the user asks for it.

use crate::error::{AppError, AppResult};
use crate::tex::process;
use serde::Serialize;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

/// The official installer (the CTAN mirror redirector picks a nearby mirror).
pub const INSTALLER_URL: &str =
    "https://mirror.ctan.org/systems/texlive/tlnet/install-tl-unx.tar.gz";

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

/// The `install-tl` profile: basic scheme, no docs or sources, PATH untouched.
pub fn profile(texdir: &Path, texmf_local: &Path, year: &str) -> String {
    let dir = texdir.display();
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
",
        local = texmf_local.display(),
    )
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

/// Downloads `url` to `dest`, reporting bytes; stops when the job is cancelled.
fn download(url: &str, dest: &Path, job: &Job, on: &mut dyn FnMut(Progress)) -> AppResult<()> {
    let mut response = ureq::get(url)
        .call()
        .map_err(|e| AppError::Network(e.to_string()))?;
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
    file.sync_all().map_err(|e| AppError::io(dest, e))
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

/// Installs LibreTeX's TeX Live in `root/<year>` (`root` = …/libretex/texlive), using
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
    let tarball = work.join("install-tl-unx.tar.gz");
    download(INSTALLER_URL, &tarball, job, on)?;

    on(Progress::Extract);
    let status = Command::new("tar")
        .arg("-xzf")
        .arg(&tarball)
        .arg("-C")
        .arg(work)
        .status()
        .map_err(|e| AppError::Other(format!("tar: {e}")))?;
    if !status.success() {
        return Err(AppError::Other(
            "no se pudo descomprimir el instalador".into(),
        ));
    }
    let installer = std::fs::read_dir(work)
        .map_err(|e| AppError::io(work, e))?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .find(|p| p.join("install-tl").is_file())
        .ok_or_else(|| AppError::Other("el paquete del instalador no tiene install-tl".into()))?;
    let version = Command::new("perl")
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
        let profile_file = work.join("libretex.profile");
        std::fs::write(&profile_file, profile(&texdir, &texmf_local, &year))
            .map_err(|e| AppError::io(&profile_file, e))?;
        let mut command = Command::new("perl");
        command
            .arg(installer.join("install-tl"))
            .arg(format!("--profile={}", profile_file.display()))
            .arg("--no-interaction")
            .current_dir(&installer);
        run_step(command, "install-tl", job, on, |done, total, package| {
            Progress::Install {
                done,
                total,
                package,
            }
        })?;

        let tlmgr = crate::tex::detect::texlive_bin_dirs(root)
            .into_iter()
            .map(|bin| bin.join("tlmgr"))
            .find(|t| t.is_file())
            .ok_or_else(|| AppError::Other("la instalación no tiene tlmgr".into()))?;
        let mut command = Command::new(tlmgr);
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
        // A partial installation is useless: remove it (it is LibreTeX's own folder).
        let _ = std::fs::remove_dir_all(&texdir);
        let _ = std::fs::remove_dir_all(&texmf_local);
        return Err(error);
    }
    Ok(texdir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn perfil_esquema_basico_sin_tocar_el_path() {
        let text = profile(
            Path::new("/home/u/.local/share/libretex/texlive/2026"),
            Path::new("/home/u/.local/share/libretex/texlive/texmf-local"),
            "2026",
        );
        assert!(text.starts_with("selected_scheme scheme-basic\n"));
        assert!(text.contains("\nTEXDIR /home/u/.local/share/libretex/texlive/2026\n"));
        assert!(
            text.contains("\nTEXMFSYSVAR /home/u/.local/share/libretex/texlive/2026/texmf-var\n")
        );
        assert!(text.contains("\nTEXMFVAR ~/.texlive2026/texmf-var\n"));
        assert!(text.contains("\ninstopt_adjustpath 0\n"));
        assert!(text.contains("\ntlpdbopt_install_docfiles 0\n"));
        assert!(!text.contains("collection-"));
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
