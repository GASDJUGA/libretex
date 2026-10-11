//! Running `latexmk`: command line, streamed output and cancellation of the whole process
//! group (latexmk and the engines it starts).

use crate::error::{AppError, AppResult};
use crate::projects::meta::{Compiler, META_DIR};
use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Command;

pub use crate::tex::process::{Run, kill_group};

/// Build folder, relative to the project root.
pub fn build_dir() -> PathBuf {
    Path::new(META_DIR).join("build")
}

/// PDF produced for `main_file`, relative to the project root (latexmk names it after the
/// main file and writes it to the build folder, whatever subfolder the main file is in).
pub fn pdf_path(main_file: &str) -> PathBuf {
    let stem = Path::new(main_file)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "main".to_owned());
    build_dir().join(format!("{stem}.pdf"))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileOptions {
    pub compiler: Compiler,
    /// Draft mode: images are drawn as boxes (faster).
    #[serde(default)]
    pub draft: bool,
    /// Stop at the first error instead of trying to continue.
    #[serde(default)]
    pub halt_on_error: bool,
    /// Allow `\write18` (needed by minted); off unless the project enables it.
    #[serde(default)]
    pub shell_escape: bool,
}

/// latexmk's arguments for compiling `main_file` with `options`.
pub fn latexmk_args(main_file: &str, options: &CompileOptions) -> Vec<String> {
    let engine = match options.compiler {
        Compiler::Pdflatex => "-pdf",
        Compiler::Xelatex => "-xelatex",
        Compiler::Lualatex => "-lualatex",
    };
    let mut args = vec![
        engine.to_owned(),
        "-synctex=1".to_owned(),
        "-interaction=nonstopmode".to_owned(),
        "-file-line-error".to_owned(),
        format!("-outdir={}", build_dir().display()),
    ];
    if options.halt_on_error {
        args.push("-halt-on-error".to_owned());
    }
    args.push(
        if options.shell_escape {
            "-shell-escape"
        } else {
            "-no-shell-escape"
        }
        .to_owned(),
    );
    if options.draft {
        args.push("-usepretex=\\PassOptionsToPackage{draft}{graphicx}".to_owned());
    }
    args.push(main_file.to_owned());
    args
}

/// Starts latexmk in `root` with `path` as PATH. Output lines (stdout and stderr) arrive on
/// `Run::next_line`.
pub fn start(
    root: &Path,
    path: &OsString,
    main_file: &str,
    options: &CompileOptions,
) -> AppResult<Run> {
    // Resolve latexmk through the TeX PATH (Command would use the parent's PATH otherwise).
    let exe = crate::tex::detect::find_in_path("latexmk", path)
        .ok_or_else(|| AppError::NotFound(PathBuf::from("latexmk")))?;
    let mut command = Command::new(exe);
    command
        .args(latexmk_args(main_file, options))
        .current_dir(root)
        .env("PATH", path)
        // Engines print UTF-8; keep the log free of the terminal width wrapping (max_print_line).
        .env("max_print_line", "10000");
    crate::tex::process::spawn(command, "latexmk")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{Duration, Instant};
    use tempfile::TempDir;

    #[test]
    fn ruta_del_pdf_segun_el_archivo_principal() {
        let build = build_dir();
        assert_eq!(pdf_path("main.tex"), build.join("main.pdf"));
        assert_eq!(pdf_path("capitulos/tesis.tex"), build.join("tesis.pdf"));
        assert_eq!(pdf_path(""), build.join("main.pdf"));
    }

    fn options(compiler: Compiler) -> CompileOptions {
        CompileOptions {
            compiler,
            draft: false,
            halt_on_error: false,
            shell_escape: false,
        }
    }

    #[test]
    fn argumentos_por_defecto() {
        assert_eq!(
            latexmk_args("main.tex", &options(Compiler::Xelatex)),
            [
                "-xelatex",
                "-synctex=1",
                "-interaction=nonstopmode",
                "-file-line-error",
                "-outdir=.libretex/build",
                "-no-shell-escape",
                "main.tex",
            ]
        );
    }

    #[test]
    fn argumentos_con_opciones() {
        let opts = CompileOptions {
            compiler: Compiler::Pdflatex,
            draft: true,
            halt_on_error: true,
            shell_escape: true,
        };
        let args = latexmk_args("caps/tesis.tex", &opts);
        assert_eq!(args[0], "-pdf");
        assert!(args.contains(&"-halt-on-error".to_owned()));
        assert!(args.contains(&"-shell-escape".to_owned()));
        assert!(!args.contains(&"-no-shell-escape".to_owned()));
        assert!(
            args.iter()
                .any(|a| a.starts_with("-usepretex=") && a.contains("{draft}{graphicx}"))
        );
        assert_eq!(args.last().unwrap(), "caps/tesis.tex");
        assert_eq!(
            latexmk_args("m.tex", &options(Compiler::Lualatex))[0],
            "-lualatex"
        );
    }

    /// PATH for the real-latexmk tests, or None (test skipped) where TeX is not installed,
    /// as in CI.
    fn tex_path() -> Option<OsString> {
        let path = crate::tex::detect::search_path(&[], std::env::var_os("PATH").as_deref());
        crate::tex::detect::find_in_path("latexmk", &path)?;
        crate::tex::detect::find_in_path("pdflatex", &path)?;
        Some(path)
    }

    fn project(source: &str) -> TempDir {
        let tmp = TempDir::new().unwrap();
        fs::write(tmp.path().join("main.tex"), source).unwrap();
        tmp
    }

    #[test]
    fn compila_un_documento_real() {
        let Some(path) = tex_path() else { return };
        let tmp = project("\\documentclass{article}\\begin{document}Hola\\end{document}\n");
        let run = start(tmp.path(), &path, "main.tex", &options(Compiler::Pdflatex)).unwrap();
        let mut lines = Vec::new();
        let status = run.wait(|l| lines.push(l)).unwrap();
        assert!(status.success(), "{}", lines.join("\n"));
        let build = tmp.path().join(".libretex/build");
        assert!(build.join("main.pdf").is_file());
        assert!(build.join("main.synctex.gz").is_file(), "SyncTeX activo");
        assert!(!lines.is_empty(), "la salida se transmite");
    }

    #[test]
    fn un_error_falla_y_queda_en_el_log_con_archivo_y_linea() {
        let Some(path) = tex_path() else { return };
        let tmp = project(
            "\\documentclass{article}\n\\begin{document}\n\\comandoinexistente\n\\end{document}\n",
        );
        let run = start(tmp.path(), &path, "main.tex", &options(Compiler::Pdflatex)).unwrap();
        let status = run.wait(|_| {}).unwrap();
        assert!(!status.success());
        let log = fs::read_to_string(tmp.path().join(".libretex/build/main.log")).unwrap();
        assert!(
            log.contains("main.tex:3: Undefined control sequence"),
            "{log}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn cancelar_mata_latexmk_y_el_motor() {
        let Some(path) = tex_path() else { return };
        // An endless loop: the engine never finishes on its own.
        let tmp =
            project("\\documentclass{article}\\begin{document}\\def\\a{\\a}\\a\\end{document}\n");
        let run = start(tmp.path(), &path, "main.tex", &options(Compiler::Pdflatex)).unwrap();
        let pid = run.pid();
        std::thread::sleep(Duration::from_millis(800));
        let started = Instant::now();
        kill_group(pid);
        let status = run.wait(|_| {}).unwrap();
        assert!(!status.success());
        assert!(started.elapsed() < Duration::from_secs(5));
        // No process of the group survives.
        std::thread::sleep(Duration::from_millis(1200));
        // SAFETY: signal 0 only checks whether the group still exists.
        let alive = unsafe { libc::killpg(pid as libc::pid_t, 0) } == 0;
        assert!(!alive, "quedaron procesos del grupo");
    }
}

/// Removes the auxiliary files of the build folder, keeping the PDFs (so the viewer still
/// has something to show). Returns how many files were removed.
pub fn clean_build(root: &Path) -> AppResult<usize> {
    let dir = root.join(build_dir());
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Ok(0);
    };
    let mut removed = 0;
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if path.extension().is_some_and(|e| e == "pdf") {
            continue;
        }
        let result = if path.is_dir() {
            std::fs::remove_dir_all(&path)
        } else {
            std::fs::remove_file(&path)
        };
        result.map_err(|e| AppError::io(&path, e))?;
        removed += 1;
    }
    Ok(removed)
}

#[cfg(test)]
mod clean_tests {
    use super::*;

    #[test]
    fn limpia_auxiliares_y_conserva_el_pdf() {
        let tmp = tempfile::TempDir::new().unwrap();
        let build = tmp.path().join(".libretex/build");
        std::fs::create_dir_all(build.join("sub")).unwrap();
        for f in [
            "main.pdf",
            "main.aux",
            "main.log",
            "main.synctex.gz",
            "main.fdb_latexmk",
        ] {
            std::fs::write(build.join(f), "").unwrap();
        }
        assert_eq!(clean_build(tmp.path()).unwrap(), 5);
        let left: Vec<_> = std::fs::read_dir(&build)
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        assert_eq!(left, ["main.pdf"]);
        assert_eq!(clean_build(&tmp.path().join("nada")).unwrap(), 0);
    }
}
