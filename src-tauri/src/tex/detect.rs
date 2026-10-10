//! Finds the TeX tools LibreTeX needs and reports their versions.

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
const FALLBACK_DIRS: [&str; 3] = ["/usr/local/bin", "/usr/bin", "/usr/bin/vendor_perl"];

/// `PATH` used for TeX tools: `extra_dirs` (e.g. LibreTeX's own TeX Live) first, then the
/// user's `PATH`, then a few standard locations.
pub fn search_path(extra_dirs: &[PathBuf], path_var: Option<&OsStr>) -> OsString {
    search_path_with(extra_dirs, path_var, &FALLBACK_DIRS)
}

fn search_path_with(
    extra_dirs: &[PathBuf],
    path_var: Option<&OsStr>,
    fallbacks: &[&str],
) -> OsString {
    let mut dirs: Vec<PathBuf> = extra_dirs.iter().filter(|d| d.is_dir()).cloned().collect();
    if let Some(path) = path_var {
        dirs.extend(std::env::split_paths(path));
    }
    for fallback in fallbacks.iter().map(PathBuf::from) {
        if fallback.is_dir() && !dirs.contains(&fallback) {
            dirs.push(fallback);
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
    std::env::split_paths(path)
        .map(|dir| dir.join(name))
        .find(|p| is_executable(p))
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.is_file()
}

/// Runs a command and waits at most `timeout`; `None` if it fails to start or takes too long.
pub fn output_with_timeout(command: &mut Command, timeout: Duration) -> Option<Output> {
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .ok()?;
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return child.wait_with_output().ok(),
            Ok(None) if start.elapsed() < timeout => std::thread::sleep(Duration::from_millis(20)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
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
        Command::new(&exe).arg(flag).env("PATH", path),
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
        let mine = tmp.path().join("libretex-texlive/bin");
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
        let out = output_with_timeout(Command::new("sleep").arg("5"), Duration::from_millis(200));
        assert!(out.is_none());
        assert!(start.elapsed() < Duration::from_secs(2));
    }
}
