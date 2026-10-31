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
    /// Run even if latexmk thinks everything is up to date (`-g`); see [`last_run_failed`].
    #[serde(skip)]
    pub force: bool,
    /// `None`: latexmk reads its configuration files as usual, the project's included (a
    /// trusted project). `Some(files)`: only these (the system's and the user's, see
    /// [`outside_rc_files`]); a `.latexmkrc` in the project is Perl code that latexmk runs.
    #[serde(skip)]
    pub rc_files: Option<Vec<PathBuf>>,
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
        // With `/` on every system: latexmk accepts it on Windows too.
        format!("-outdir={META_DIR}/build"),
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
    if options.force {
        args.push("-g".to_owned());
    }
    if let Some(files) = &options.rc_files {
        args.push("-norc".to_owned());
        for file in files {
            args.push("-r".to_owned());
            args.push(file.display().to_string());
        }
    }
    args.push(main_file.to_owned());
    args
}

/// Configuration files of latexmk in a project folder (Perl code it runs when compiling).
pub const PROJECT_RC_FILES: [&str; 2] = [".latexmkrc", "latexmkrc"];

/// Whether the project has its own latexmk configuration.
pub fn has_project_rc(root: &Path) -> bool {
    PROJECT_RC_FILES
        .iter()
        .any(|name| root.join(name).is_file())
}

/// The latexmk configuration files outside the project, found as latexmk itself finds them
/// on Unix: the system's (`LATEXMKRCSYS`, or the first of its usual places) and the user's
/// (`$XDG_CONFIG_HOME/latexmk/latexmkrc`, else `~/.latexmkrc`). `env` reads a variable.
pub fn outside_rc_files(env: impl Fn(&str) -> Option<OsString>) -> Vec<PathBuf> {
    let first = |candidates: Vec<PathBuf>| candidates.into_iter().find(|p| p.is_file());
    let mut files = Vec::new();
    let system = match env("LATEXMKRCSYS") {
        Some(file) => Some(PathBuf::from(file)).filter(|p| p.is_file()),
        None => first(
            ["LatexMk", "latexmkrc"]
                .iter()
                .flat_map(|name| {
                    [
                        "/etc",
                        "/opt/local/share/latexmk",
                        "/usr/local/share/latexmk",
                        "/usr/local/lib/latexmk",
                    ]
                    .map(|dir| Path::new(dir).join(name))
                })
                .collect(),
        ),
    };
    files.extend(system);
    let home = env("HOME").filter(|h| !h.is_empty()).map(PathBuf::from);
    let config = env("XDG_CONFIG_HOME").map(PathBuf::from).or_else(|| {
        home.as_ref()
            .map(|h| h.join(".config"))
            .filter(|d| d.is_dir())
    });
    let mut user = Vec::new();
    user.extend(config.map(|c| c.join("latexmk").join("latexmkrc")));
    user.extend(home.map(|h| h.join(".latexmkrc")));
    files.extend(first(user));
    files
}

/// The main file as latexmk may receive it: a `.tex` file inside the project, never
/// something latexmk would read as an option (`-pdflatex=…` would run any program; the
/// main file comes from the project's `project.json`, which may come from anywhere).
pub fn check_main_file(root: &Path, main_file: &str) -> AppResult<()> {
    let invalid = |reason: &'static str| AppError::InvalidName {
        name: main_file.to_owned(),
        reason,
    };
    if main_file.starts_with('-') {
        return Err(invalid("el archivo principal no puede empezar con «-»"));
    }
    let path = crate::util::paths::resolve_existing(root, main_file)?;
    if !path.is_file() || path.extension().is_none_or(|e| e != "tex") {
        return Err(invalid("el archivo principal no es un .tex del proyecto"));
    }
    Ok(())
}

/// Whether the last run of `main_file` in `root` stopped with a TeX error (a `!` line in its
/// log). latexmk does not record a missing file (`x.sty`) as a dependency: once the package
/// is installed it would answer «Nothing to do» and keep the old error, so the next run after
/// a failure is forced.
pub fn last_run_failed(root: &Path, main_file: &str) -> bool {
    let log = root.join(pdf_path(main_file).with_extension("log"));
    std::fs::read(log)
        .map(|bytes| {
            String::from_utf8_lossy(&bytes)
                .lines()
                .any(|line| line.starts_with("! "))
        })
        .unwrap_or(false)
}

/// Starts latexmk in `root` with `path` as PATH. Output lines (stdout and stderr) arrive on
/// `Run::next_line`.
pub fn start(
    root: &Path,
    path: &OsString,
    main_file: &str,
    options: &CompileOptions,
) -> AppResult<Run> {
    check_main_file(root, main_file)?;
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
            force: false,
            rc_files: None,
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
            force: true,
            rc_files: None,
        };
        let args = latexmk_args("caps/tesis.tex", &opts);
        assert_eq!(args[0], "-pdf");
        assert!(args.contains(&"-halt-on-error".to_owned()));
        assert!(args.contains(&"-shell-escape".to_owned()));
        assert!(!args.contains(&"-no-shell-escape".to_owned()));
        assert!(args.contains(&"-g".to_owned()));
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

    #[test]
    fn proyecto_sin_confianza_sin_su_latexmkrc() {
        let opts = CompileOptions {
            rc_files: Some(vec![PathBuf::from("/home/ana/.latexmkrc")]),
            ..options(Compiler::Xelatex)
        };
        let args = latexmk_args("main.tex", &opts);
        let n = args.len();
        assert_eq!(
            args[n - 4..],
            ["-norc", "-r", "/home/ana/.latexmkrc", "main.tex"]
        );
    }

    #[test]
    fn archivos_de_configuracion_fuera_del_proyecto() {
        let dir = TempDir::new().unwrap();
        let home = dir.path().join("home");
        let config = home.join(".config");
        fs::create_dir_all(config.join("latexmk")).unwrap();
        fs::write(home.join(".latexmkrc"), "").unwrap();
        let system = dir.path().join("LatexMk");
        fs::write(&system, "").unwrap();
        let vars = |extra: Vec<(&'static str, OsString)>| {
            move |name: &str| {
                extra
                    .iter()
                    .find(|(k, _)| *k == name)
                    .map(|(_, v)| v.clone())
            }
        };
        // ~/.latexmkrc when there is none in ~/.config; the system one from LATEXMKRCSYS.
        let found = outside_rc_files(vars(vec![
            ("HOME", home.clone().into()),
            ("LATEXMKRCSYS", system.clone().into()),
        ]));
        assert_eq!(found, [system.clone(), home.join(".latexmkrc")]);
        // The XDG one comes first.
        fs::write(config.join("latexmk/latexmkrc"), "").unwrap();
        let found = outside_rc_files(vars(vec![("HOME", home.clone().into())]));
        assert_eq!(found.last(), Some(&config.join("latexmk/latexmkrc")));
    }

    #[test]
    fn archivo_principal_valido() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        fs::create_dir(root.join("caps")).unwrap();
        fs::write(root.join("main.tex"), "").unwrap();
        fs::write(root.join("caps/tesis.tex"), "").unwrap();
        fs::write(root.join("-pdf.tex"), "").unwrap();
        fs::write(root.join("notas.txt"), "").unwrap();
        assert!(check_main_file(root, "main.tex").is_ok());
        assert!(check_main_file(root, "caps/tesis.tex").is_ok());
        // What latexmk would take as an option (`-pdflatex=cmd` runs a program).
        assert!(check_main_file(root, "-pdflatex=touch x").is_err());
        assert!(check_main_file(root, "-pdf.tex").is_err());
        assert!(check_main_file(root, "../fuera.tex").is_err());
        assert!(check_main_file(root, "/etc/passwd").is_err());
        assert!(check_main_file(root, "notas.txt").is_err());
        assert!(check_main_file(root, "falta.tex").is_err());
    }

    #[test]
    fn el_latexmkrc_del_proyecto_solo_corre_si_se_confia() {
        let Some(path) = tex_path() else { return };
        let tmp = project("\\documentclass{article}\n\\begin{document}\nHola\n\\end{document}\n");
        // Perl that latexmk runs on reading it: here it only leaves a file behind.
        fs::write(
            tmp.path().join(".latexmkrc"),
            "open(my $f, '>', 'ejecutado'); close($f);\n",
        )
        .unwrap();
        let untrusted = CompileOptions {
            rc_files: Some(Vec::new()),
            ..options(Compiler::Pdflatex)
        };
        start(tmp.path(), &path, "main.tex", &untrusted)
            .unwrap()
            .wait(|_| {})
            .unwrap();
        assert!(!tmp.path().join("ejecutado").exists());
        start(tmp.path(), &path, "main.tex", &options(Compiler::Pdflatex))
            .unwrap()
            .wait(|_| {})
            .unwrap();
        assert!(tmp.path().join("ejecutado").exists());
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

    #[test]
    fn tras_instalar_el_sty_faltante_se_fuerza_la_recompilacion() {
        let Some(path) = tex_path() else { return };
        let tmp = project(
            "\\documentclass{article}\n\\usepackage{paquetelibretex}\n\\begin{document}\nHola\n\\end{document}\n",
        );
        let compile = |force: bool| {
            let opts = CompileOptions {
                force,
                ..options(Compiler::Pdflatex)
            };
            let run = start(tmp.path(), &path, "main.tex", &opts).unwrap();
            run.wait(|_| {}).unwrap().success()
        };
        assert!(!last_run_failed(tmp.path(), "main.tex"), "sin log todavía");
        assert!(!compile(false));
        assert!(last_run_failed(tmp.path(), "main.tex"));
        // The package gets installed (here, next to the document; installed in TeX Live's
        // tree, latexmk alone answers «Nothing to do» and keeps the old error: tried by hand).
        fs::write(
            tmp.path().join("paquetelibretex.sty"),
            "\\ProvidesPackage{paquetelibretex}\n",
        )
        .unwrap();
        assert!(compile(last_run_failed(tmp.path(), "main.tex")));
        assert!(!last_run_failed(tmp.path(), "main.tex"));
    }

    #[cfg(unix)]
    #[test]
    fn cancelar_mata_latexmk_y_el_motor() {
        use std::time::{Duration, Instant};
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
