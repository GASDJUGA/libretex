//! SyncTeX through the `synctex` command line tool: source → PDF (`view`) and PDF → source
//! (`edit`). Coordinates are PDF points (1/72 in) with the origin at the top-left of the page.

use crate::error::{AppError, AppResult};
use crate::tex::detect::{find_in_path, output_with_timeout};
use serde::Serialize;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// `synctex` answers in milliseconds; a hung one must not block the UI for long.
const TIMEOUT: Duration = Duration::from_secs(10);

/// A box in the PDF that comes from the requested source line.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfRect {
    pub page: u32,
    pub left: f64,
    pub top: f64,
    pub width: f64,
    pub height: f64,
}

/// The source position of a point in the PDF, as `synctex` reports it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourcePoint {
    /// The input file as recorded by TeX (absolute, may contain `./`).
    pub input: String,
    pub line: u32,
}

/// `key:value` lines between `SyncTeX result begin` and `SyncTeX result end`.
fn result_fields(output: &str) -> impl Iterator<Item = (&str, &str)> {
    output
        .lines()
        .skip_while(|l| l.trim() != "SyncTeX result begin")
        .skip(1)
        .take_while(|l| l.trim() != "SyncTeX result end")
        .filter_map(|l| l.split_once(':'))
}

/// Boxes of a `synctex view` answer (one record per `Output:`), without duplicates. Each
/// record gives the box origin `h`/`v` (left, baseline), its width `W` and height `H`.
pub fn parse_view(output: &str) -> Vec<PdfRect> {
    #[derive(Default)]
    struct Record {
        page: Option<u32>,
        h: Option<f64>,
        v: Option<f64>,
        w: Option<f64>,
        hh: Option<f64>,
    }
    fn finish(record: Record, rects: &mut Vec<PdfRect>) {
        if let (Some(page), Some(h), Some(v), Some(w), Some(hh)) =
            (record.page, record.h, record.v, record.w, record.hh)
        {
            let rect = PdfRect {
                page,
                left: h,
                top: v - hh,
                width: w,
                height: hh,
            };
            if !rects.contains(&rect) {
                rects.push(rect);
            }
        }
    }

    let mut rects = Vec::new();
    let mut record: Option<Record> = None;
    for (key, value) in result_fields(output) {
        let value = value.trim();
        match key {
            "Output" => {
                if let Some(done) = record.replace(Record::default()) {
                    finish(done, &mut rects);
                }
            }
            "Page" => record.get_or_insert_default().page = value.parse().ok(),
            "h" => record.get_or_insert_default().h = value.parse().ok(),
            "v" => record.get_or_insert_default().v = value.parse().ok(),
            "W" => record.get_or_insert_default().w = value.parse().ok(),
            "H" => record.get_or_insert_default().hh = value.parse().ok(),
            _ => {}
        }
    }
    if let Some(done) = record {
        finish(done, &mut rects);
    }
    rects
}

/// The first source position of a `synctex edit` answer.
pub fn parse_edit(output: &str) -> Option<SourcePoint> {
    let mut input = None;
    for (key, value) in result_fields(output) {
        match key {
            "Input" => input = Some(value.trim().to_owned()),
            "Line" => {
                let line: i64 = value.trim().parse().ok()?;
                return Some(SourcePoint {
                    input: input?,
                    line: u32::try_from(line).ok().filter(|l| *l > 0)?,
                });
            }
            _ => {}
        }
    }
    None
}

/// The project file (relative path) that a recorded input refers to, if it is inside `root`.
/// Files of the distribution (.cls, .sty) and of the build folder are not editable sources.
pub fn source_in_project(root: &Path, input: &str) -> Option<String> {
    let root = dunce::canonicalize(root).ok()?;
    let path = dunce::canonicalize(PathBuf::from(input)).ok()?;
    if path.starts_with(root.join(crate::projects::meta::META_DIR)) {
        return None;
    }
    crate::util::paths::to_relative(&root, &path).ok()
}

fn run(root: &Path, tex_path: &OsStr, args: &[&OsStr]) -> AppResult<String> {
    let exe = find_in_path("synctex", tex_path)
        .ok_or_else(|| AppError::NotFound(PathBuf::from("synctex")))?;
    let output = output_with_timeout(
        crate::platform::process::command(exe)
            .args(args)
            .current_dir(root)
            .env("PATH", tex_path),
        TIMEOUT,
    )
    .ok_or_else(|| AppError::Other("synctex no respondió".into()))?;
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Boxes in `pdf` produced by `line` of `file` (absolute paths).
pub fn forward(
    root: &Path,
    tex_path: &OsStr,
    pdf: &Path,
    file: &Path,
    line: u32,
    column: u32,
) -> AppResult<Vec<PdfRect>> {
    let input = format!("{line}:{column}:{}", file.display());
    let output = run(
        root,
        tex_path,
        &[
            "view".as_ref(),
            "-i".as_ref(),
            input.as_ref(),
            "-o".as_ref(),
            pdf.as_os_str(),
        ],
    )?;
    Ok(parse_view(&output))
}

/// Source position of the point (`x`, `y`) of `page` in `pdf`.
pub fn inverse(
    root: &Path,
    tex_path: &OsStr,
    pdf: &Path,
    page: u32,
    x: f64,
    y: f64,
) -> AppResult<Option<SourcePoint>> {
    let target = format!("{page}:{x}:{y}:{}", pdf.display());
    let output = run(
        root,
        tex_path,
        &["edit".as_ref(), "-o".as_ref(), target.as_ref()],
    )?;
    Ok(parse_edit(&output))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    const VIEW_TWO: &str = include_str!("../../../tests/fixtures/synctex/view-two-records.txt");
    const VIEW_OTHER: &str = include_str!("../../../tests/fixtures/synctex/view-other-file.txt");
    const VIEW_NONE: &str = include_str!("../../../tests/fixtures/synctex/view-no-match.txt");
    const EDIT_OTHER: &str = include_str!("../../../tests/fixtures/synctex/edit-other-file.txt");

    #[test]
    fn view_sin_duplicados_y_con_la_caja_de_la_linea() {
        // Two records for the same line box (different x/y): one rectangle.
        let rects = parse_view(VIEW_TWO);
        assert_eq!(rects.len(), 1);
        let r = &rects[0];
        assert_eq!(r.page, 1);
        assert!((r.left - 125.798264).abs() < 1e-6);
        assert!((r.top - (301.282776 - 11.331469)).abs() < 1e-6);
        assert!((r.width - 358.655029).abs() < 1e-6);
        assert!((r.height - 11.331469).abs() < 1e-6);
    }

    #[test]
    fn view_de_un_archivo_incluido_y_sin_coincidencias() {
        assert_eq!(parse_view(VIEW_OTHER)[0].page, 3);
        assert!(parse_view(VIEW_NONE).is_empty());
        assert!(parse_view("").is_empty());
    }

    #[test]
    fn edit_da_archivo_y_linea() {
        assert_eq!(
            parse_edit(EDIT_OTHER),
            Some(SourcePoint {
                input: "/home/usuario/LibreTeX/Ejemplo/./capitulos/fin.tex".into(),
                line: 2
            })
        );
        assert_eq!(parse_edit(VIEW_NONE), None);
        let no_line = "SyncTeX result begin\nInput:/a.tex\nLine:0\nSyncTeX result end\n";
        assert_eq!(parse_edit(no_line), None);
    }

    #[test]
    fn solo_fuentes_dentro_del_proyecto() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().join("proyecto");
        std::fs::create_dir_all(root.join("capitulos")).unwrap();
        std::fs::create_dir_all(root.join(".libretex/build")).unwrap();
        std::fs::write(root.join("capitulos/fin.tex"), "").unwrap();
        std::fs::write(root.join(".libretex/build/main.aux"), "").unwrap();
        std::fs::write(tmp.path().join("fuera.tex"), "").unwrap();

        let recorded = format!("{}/./capitulos/fin.tex", root.display());
        assert_eq!(
            source_in_project(&root, &recorded).as_deref(),
            Some("capitulos/fin.tex")
        );
        let aux = format!("{}/.libretex/build/main.aux", root.display());
        assert_eq!(source_in_project(&root, &aux), None);
        let outside = format!("{}/./../fuera.tex", root.display());
        assert_eq!(source_in_project(&root, &outside), None);
        assert_eq!(
            source_in_project(&root, "/usr/share/texmf-dist/no-existe.cls"),
            None
        );
    }

    /// End to end with the installed TeX: compile, then go source → PDF → source.
    #[test]
    fn ida_y_vuelta_con_synctex_real() {
        let path = crate::tex::detect::search_path(&[], std::env::var_os("PATH").as_deref());
        if find_in_path("synctex", &path).is_none() || find_in_path("pdflatex", &path).is_none() {
            eprintln!("sin synctex/pdflatex: se omite");
            return;
        }
        let tmp = TempDir::new().unwrap();
        // Canonical, like a project's root (on Windows `%TEMP%` may use short names, `GASD_J~1`,
        // and TeX records the inputs as the folder was given).
        let root = &dunce::canonicalize(tmp.path()).unwrap();
        std::fs::write(
            root.join("main.tex"),
            "\\documentclass{article}\n\\begin{document}\nPrimera línea.\n\n\\newpage\nSegunda página aquí.\n\\end{document}\n",
        )
        .unwrap();
        let options = crate::tex::latexmk::CompileOptions {
            compiler: crate::projects::meta::Compiler::Pdflatex,
            draft: false,
            halt_on_error: false,
            shell_escape: false,
            force: false,
            rc_files: None,
            kpsewhich_cache: None,
        };
        let status = crate::tex::latexmk::start(root, &path, "main.tex", &options)
            .unwrap()
            .wait(|_| {})
            .unwrap();
        assert!(status.success());
        let pdf = root.join(crate::tex::latexmk::pdf_path("main.tex"));
        let main = dunce::canonicalize(root.join("main.tex")).unwrap();

        let rects = forward(root, &path, &pdf, &main, 6, 1).unwrap();
        assert_eq!(rects.first().map(|r| r.page), Some(2));

        let r = &rects[0];
        let point = inverse(
            root,
            &path,
            &pdf,
            r.page,
            r.left + 5.0,
            r.top + r.height / 2.0,
        )
        .unwrap()
        .unwrap();
        assert_eq!(point.line, 6);
        assert_eq!(
            source_in_project(root, &point.input).as_deref(),
            Some("main.tex")
        );
    }
}
