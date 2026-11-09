//! Finds the TeX tools JuTeX needs and reports their versions.

use serde::Serialize;
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::time::{Duration, Instant};

/// A version query should answer almost instantly; a hung tool must not block startup.
const VERSION_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Tool {
    pub path: String,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct TexStatus {
    pub latexmk: Option<Tool>,
    pub pdflatex: Option<Tool>,
    pub xelatex: Option<Tool>,
    pub lualatex: Option<Tool>,
    pub synctex: Option<Tool>,
    pub biber: Option<Tool>,
    pub bibtex: Option<Tool>,
    /// e.g. «TeX Live 2026/Arch Linux», from the engines' banner.
    pub distribution: Option<String>,
}

/// Standard locations appended after the user's `PATH`: an app started from the desktop menu
/// may get a shorter `PATH` than a terminal (on Arch, `biber` lives in `vendor_perl`, added by
/// `/etc/profile`).
#[cfg(all(unix, not(target_os = "macos")))]
const FALLBACK_DIRS: &[&str] = &["/usr/local/bin", "/usr/bin", "/usr/bin/vendor_perl"];

/// On macOS an app opened from the Dock or Finder gets only `/usr/bin:/bin:/usr/sbin:/sbin`:
/// MacTeX links its tools from `/Library/TeX/texbin` and Homebrew (`gpgv`, a TeX of its own)
/// installs in `/opt/homebrew/bin` (Apple Silicon) or `/usr/local/bin` (Intel).
#[cfg(target_os = "macos")]
const FALLBACK_DIRS: &[&str] = &[
    "/Library/TeX/texbin",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
];

#[cfg(unix)]
fn fallback_dirs() -> Vec<PathBuf> {
    FALLBACK_DIRS.iter().map(PathBuf::from).collect()
}

/// On Windows an app started from the Start menu gets the `PATH` Explorer had when the session
/// started: a TeX installed afterwards may be missing. MiKTeX installs in `bin\x64` for the
/// user (`%LOCALAPPDATA%\Programs`) or for everyone (`%ProgramFiles%`), and its `latexmk`
/// needs a Perl of its own: Strawberry Perl. (The official TeX Live in `C:\texlive` is added
/// by `backends::tex_path`.) Strawberry's `C:\Strawberry` is at the root of the drive, where
/// any user can create folders: only used if it belongs to the user or the system
/// (`platform::owner`).
#[cfg(windows)]
fn fallback_dirs() -> Vec<PathBuf> {
    let env = |name| std::env::var_os(name).map(PathBuf::from);
    let miktex = Path::new("MiKTeX").join("miktex").join("bin").join("x64");
    let strawberry = system_drive().join("Strawberry");
    let perl = strawberry.join("perl").join("bin");
    [
        env("LOCALAPPDATA").map(|d| d.join("Programs").join(&miktex)),
        env("ProgramFiles").map(|d| d.join(&miktex)),
        crate::platform::owner::trusted_tree(&strawberry, &perl).then_some(perl),
    ]
    .into_iter()
    .flatten()
    .collect()
}

/// The root of the drive Windows is on (`C:\`).
#[cfg(windows)]
pub fn system_drive() -> PathBuf {
    let drive = std::env::var_os("SystemDrive").unwrap_or_else(|| "C:".into());
    PathBuf::from(format!("{}\\", drive.to_string_lossy()))
}

/// `PATH` used for TeX tools: `extra_dirs` (e.g. JuTeX's own TeX Live) first, then the
/// user's `PATH`, then a few standard locations.
pub fn search_path(extra_dirs: &[PathBuf], path_var: Option<&OsStr>) -> OsString {
    search_path_with(extra_dirs, path_var, &fallback_dirs())
}

fn search_path_with(
    extra_dirs: &[PathBuf],
    path_var: Option<&OsStr>,
    fallbacks: &[PathBuf],
) -> OsString {
    let mut dirs: Vec<PathBuf> = extra_dirs.iter().filter(|d| d.is_dir()).cloned().collect();
    if let Some(path) = path_var {
        dirs.extend(std::env::split_paths(path));
    }
    for fallback in fallbacks {
        if fallback.is_dir() && !dirs.contains(fallback) {
            dirs.push(fallback.clone());
        }
    }
    std::env::join_paths(dirs).unwrap_or_default()
}

/// `bin` folders of TeX Live installations under `root` (e.g.
/// `…/texlive/2026/bin/x86_64-linux`), newest year first.
pub fn texlive_bin_dirs(root: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(root) else {
        return Vec::new();
    };
    let is_year = |p: &PathBuf| {
        p.file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.len() == 4 && n.chars().all(|c| c.is_ascii_digit()))
    };
    let mut years: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(is_year)
        .collect();
    years.sort();
    years
        .into_iter()
        .rev()
        .filter_map(|year| std::fs::read_dir(year.join("bin")).ok())
        .flat_map(|platforms| platforms.filter_map(Result::ok).map(|e| e.path()))
        .filter(|p| p.is_dir())
        .collect()
}

/// First executable called `name` in `path` (a `PATH`-style list).
pub fn find_in_path(name: &str, path: &OsStr) -> Option<PathBuf> {
    std::env::split_paths(path).find_map(|dir| executable_in(&dir, name))
}

#[cfg(unix)]
pub fn executable_in(dir: &Path, name: &str) -> Option<PathBuf> {
    use std::os::unix::fs::PermissionsExt;
    let path = dir.join(name);
    path.metadata()
        .is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .then_some(path)
}

/// Programs that `Command` can start on Windows, in the order `cmd.exe` tries them. Files
/// without an extension (shell scripts of Git for Windows or MSYS2) are not programs here.
#[cfg(windows)]
const EXECUTABLE_EXTENSIONS: &[&str] = &["exe", "com", "bat", "cmd"];

#[cfg(windows)]
pub fn executable_in(dir: &Path, name: &str) -> Option<PathBuf> {
    let has_extension = Path::new(name).extension().is_some_and(|ext| {
        EXECUTABLE_EXTENSIONS
            .iter()
            .any(|e| ext.eq_ignore_ascii_case(e))
    });
    if has_extension {
        let path = dir.join(name);
        return path.is_file().then_some(path);
    }
    EXECUTABLE_EXTENSIONS
        .iter()
        .map(|ext| dir.join(format!("{name}.{ext}")))
        .find(|p| p.is_file())
}

/// Runs a command and waits at most `timeout`; `None` if it fails to start or takes too long.
/// Its output is read while it runs: a program that writes more than the pipe holds (~64 KB,
/// MiKTeX's package list is 12 MB) would otherwise wait forever for someone to read it.
pub fn output_with_timeout(command: &mut Command, timeout: Duration) -> Option<Output> {
    use std::io::Read;
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .ok()?;
    let read_all = |stream: Option<Box<dyn Read + Send>>| {
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            if let Some(mut stream) = stream {
                let _ = stream.read_to_end(&mut bytes);
            }
            bytes
        })
    };
    let stdout = read_all(child.stdout.take().map(|s| Box::new(s) as _));
    let stderr = read_all(child.stderr.take().map(|s| Box::new(s) as _));
    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if start.elapsed() < timeout => std::thread::sleep(Duration::from_millis(20)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    };
    Some(Output {
        status,
        stdout: stdout.join().ok()?,
        stderr: stderr.join().ok()?,
    })
}

/// Version string from a tool's `--version`/`-v` output.
pub fn parse_version(tool: &str, output: &str) -> Option<String> {
    let first = output.lines().map(str::trim).find(|l| !l.is_empty())?;
    match tool {
        // «Latexmk, John Collins, 15 June 2025. Version 4.87»
        "latexmk" => output.split("Version ").nth(1).map(|v| v.trim().to_owned()),
        // «biber version: 2.22»
        "biber" => first.split("version:").nth(1).map(|v| v.trim().to_owned()),
        // «This is LuaHBTeX, Version 1.24.0 (TeX Live 2026/Arch Linux)»
        "lualatex" => first
            .split("Version ")
            .nth(1)
            .map(|v| before_paren(v).to_owned()),
        // «pdfTeX 3.141592653-2.6-1.40.29 (TeX Live …)», «XeTeX …», «BibTeX 0.99e (…)»
        _ => Some(before_paren(first).to_owned()),
    }
}

fn before_paren(text: &str) -> &str {
    text.split(" (").next().unwrap_or(text).trim()
}

/// Distribution in the parentheses of an engine banner: «… (TeX Live 2026/Arch Linux)».
pub fn parse_distribution(banner: &str) -> Option<String> {
    let first = banner.lines().next()?;
    let open = first.rfind('(')?;
    let close = first[open..].find(')')? + open;
    let inside = first[open + 1..close].trim();
    (!inside.is_empty()).then(|| inside.to_owned())
}

fn query(name: &str, path: &OsStr) -> (Option<Tool>, Option<String>) {
    let Some(exe) = find_in_path(name, path) else {
        return (None, None);
    };
    let flag = match name {
        "latexmk" => "-v",
        "synctex" => "help",
        _ => "--version",
    };
    let output = output_with_timeout(
        crate::platform::process::command(&exe)
            .arg(flag)
            .env("PATH", path),
        VERSION_TIMEOUT,
    );
    let text = output
        .map(|o| {
            format!(
                "{}{}",
                String::from_utf8_lossy(&o.stdout),
                String::from_utf8_lossy(&o.stderr)
            )
        })
        .unwrap_or_default();
    let version = if name == "synctex" {
        text.lines()
            .find_map(|l| l.split("version ").nth(1))
            .map(|v| v.trim().to_owned())
    } else {
        parse_version(name, &text)
    };
    let tool = Tool {
        path: exe.display().to_string(),
        version,
    };
    (Some(tool), parse_distribution(&text))
}

/// Looks for every tool in `path`.
pub fn detect(path: &OsStr) -> TexStatus {
    let (latexmk, _) = query("latexmk", path);
    let (pdflatex, d1) = query("pdflatex", path);
    let (xelatex, d2) = query("xelatex", path);
    let (lualatex, d3) = query("lualatex", path);
    let (synctex, _) = query("synctex", path);
    let (biber, _) = query("biber", path);
    let (bibtex, _) = query("bibtex", path);
    TexStatus {
        latexmk,
        pdflatex,
        xelatex,
        lualatex,
        synctex,
        biber,
        bibtex,
        distribution: d1.or(d2).or(d3),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn versiones_de_las_salidas_reales() {
        assert_eq!(
            parse_version(
                "latexmk",
                "Latexmk, John Collins, 15 June 2025. Version 4.87\n"
            )
            .as_deref(),
            Some("4.87")
        );
        assert_eq!(
            parse_version(
                "pdflatex",
                "pdfTeX 3.141592653-2.6-1.40.29 (TeX Live 2026/Arch Linux)\nkpathsea version 6.4.2"
            )
            .as_deref(),
            Some("pdfTeX 3.141592653-2.6-1.40.29")
        );
        assert_eq!(
            parse_version(
                "xelatex",
                "XeTeX 3.141592653-2.6-0.999998 (TeX Live 2026/Arch Linux)"
            )
            .as_deref(),
            Some("XeTeX 3.141592653-2.6-0.999998")
        );
        assert_eq!(
            parse_version(
                "lualatex",
                "This is LuaHBTeX, Version 1.24.0 (TeX Live 2026/Arch Linux)\nDevelopment id: 7724"
            )
            .as_deref(),
            Some("1.24.0")
        );
        assert_eq!(
            parse_version("biber", "biber version: 2.22\n").as_deref(),
            Some("2.22")
        );
        assert_eq!(
            parse_version("bibtex", "BibTeX 0.99e (TeX Live 2026/Arch Linux)").as_deref(),
            Some("BibTeX 0.99e")
        );
    }

    #[test]
    fn distribucion_del_banner() {
        assert_eq!(
            parse_distribution("XeTeX 3.14-0.999998 (TeX Live 2026/Arch Linux)\nkpathsea")
                .as_deref(),
            Some("TeX Live 2026/Arch Linux")
        );
        assert_eq!(parse_distribution("sin paréntesis"), None);
    }

    #[cfg(unix)]
    #[test]
    fn busca_ejecutables_con_prioridad_a_los_directorios_extra() {
        use std::os::unix::fs::PermissionsExt;
        let tmp = TempDir::new().unwrap();
        let mine = tmp.path().join("jutex-texlive/bin");
        let system = tmp.path().join("usr/bin");
        std::fs::create_dir_all(&mine).unwrap();
        std::fs::create_dir_all(&system).unwrap();
        for dir in [&mine, &system] {
            let exe = dir.join("latexmk");
            std::fs::write(&exe, "#!/bin/sh\necho 'Latexmk, x. Version 9.99'\n").unwrap();
            std::fs::set_permissions(&exe, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        std::fs::write(system.join("noexec"), "").unwrap();

        // No fallback dirs: the host's real /usr/bin must not leak into the test.
        let path = search_path_with(
            &[mine.clone(), tmp.path().join("no-existe")],
            Some(system.as_os_str()),
            &[],
        );
        assert_eq!(find_in_path("latexmk", &path), Some(mine.join("latexmk")));
        assert_eq!(find_in_path("noexec", &path), None);

        let status = detect(&path);
        assert_eq!(status.latexmk.unwrap().version.as_deref(), Some("9.99"));
        assert!(status.xelatex.is_none());
    }

    #[cfg(windows)]
    #[test]
    fn busca_ejecutables_con_extension_en_windows() {
        let tmp = TempDir::new().unwrap();
        let mine = tmp.path().join("jutex-texlive").join("bin");
        let system = tmp.path().join("bin");
        std::fs::create_dir_all(&mine).unwrap();
        std::fs::create_dir_all(&system).unwrap();
        std::fs::write(mine.join("latexmk.exe"), "").unwrap();
        std::fs::write(system.join("latexmk.exe"), "").unwrap();
        // A shell script of Git for Windows or MSYS2: not a program for `Command`.
        std::fs::write(system.join("synctex"), "#!/bin/sh\n").unwrap();
        std::fs::write(system.join("tlmgr.bat"), "").unwrap();

        let path = search_path_with(std::slice::from_ref(&mine), Some(system.as_os_str()), &[]);
        assert_eq!(
            find_in_path("latexmk", &path),
            Some(mine.join("latexmk.exe"))
        );
        assert_eq!(find_in_path("tlmgr", &path), Some(system.join("tlmgr.bat")));
        assert_eq!(
            find_in_path("tlmgr.bat", &path),
            Some(system.join("tlmgr.bat"))
        );
        assert_eq!(find_in_path("synctex", &path), None);
    }

    #[test]
    fn las_carpetas_de_respaldo_van_despues_del_path_y_sin_repetir() {
        let tmp = TempDir::new().unwrap();
        let [user, miktex, missing] =
            ["usuario", "miktex", "no-existe"].map(|d| tmp.path().join(d));
        std::fs::create_dir_all(&user).unwrap();
        std::fs::create_dir_all(&miktex).unwrap();
        let path = search_path_with(
            &[],
            Some(user.as_os_str()),
            &[miktex.clone(), user.clone(), missing],
        );
        assert_eq!(
            std::env::split_paths(&path).collect::<Vec<_>>(),
            [user, miktex]
        );
    }

    /// MiKTeX for the user and Strawberry Perl, also with a `PATH` that has neither (an app
    /// started from the Start menu before the session saw them). Strawberry's installer runs
    /// as administrator, so its folders belong to the system and are used.
    #[cfg(windows)]
    #[test]
    fn respaldos_de_windows() {
        let dirs = fallback_dirs();
        let local = PathBuf::from(std::env::var_os("LOCALAPPDATA").unwrap());
        assert!(dirs.contains(&local.join(r"Programs\MiKTeX\miktex\bin\x64")));
        let perl = system_drive().join(r"Strawberry\perl\bin");
        assert_eq!(dirs.contains(&perl), perl.is_dir());
    }

    #[test]
    fn instalaciones_de_tex_live_mas_nueva_primero() {
        let tmp = TempDir::new().unwrap();
        for year in ["2025", "2026"] {
            std::fs::create_dir_all(tmp.path().join(year).join("bin/x86_64-linux")).unwrap();
        }
        std::fs::create_dir_all(tmp.path().join("texmf-local")).unwrap();
        let dirs = texlive_bin_dirs(tmp.path());
        assert_eq!(
            dirs,
            [
                tmp.path().join("2026/bin/x86_64-linux"),
                tmp.path().join("2025/bin/x86_64-linux")
            ]
        );
        assert!(texlive_bin_dirs(&tmp.path().join("no-existe")).is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn un_comando_colgado_no_bloquea() {
        let start = Instant::now();
        let out = output_with_timeout(
            crate::platform::process::command("sleep").arg("5"),
            Duration::from_millis(200),
        );
        assert!(out.is_none());
        assert!(start.elapsed() < Duration::from_secs(2));
    }

    /// More than a pipe holds (MiKTeX's package list is 12 MB) must not block until the timeout.
    #[test]
    fn una_salida_grande_no_bloquea() {
        let tmp = TempDir::new().unwrap();
        let file = tmp.path().join("grande.txt");
        std::fs::write(&file, "una línea de prueba\n".repeat(50_000)).unwrap();
        let mut command = if cfg!(windows) {
            let mut c = Command::new("cmd");
            c.arg("/C").arg("type").arg(&file);
            c
        } else {
            let mut c = Command::new("cat");
            c.arg(&file);
            c
        };
        let start = Instant::now();
        let out = output_with_timeout(&mut command, Duration::from_secs(10)).unwrap();
        assert!(start.elapsed() < Duration::from_secs(5));
        assert!(out.status.success());
        assert_eq!(
            out.stdout.len(),
            std::fs::metadata(&file).unwrap().len() as usize
        );
    }

    #[cfg(windows)]
    #[test]
    fn un_comando_colgado_no_bloquea_en_windows() {
        let start = Instant::now();
        // About 5 s: one ping per second.
        let out = output_with_timeout(
            crate::platform::process::command("ping").args(["-n", "6", "127.0.0.1"]),
            Duration::from_millis(200),
        );
        assert!(out.is_none());
        assert!(start.elapsed() < Duration::from_secs(2));
    }
}
