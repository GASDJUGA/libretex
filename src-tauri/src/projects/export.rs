//! Exporting a project (5.7): its sources as a ZIP that Overleaf can import (without
//! LibreTeX's data, the user's `.git` or what LaTeX generates).

use crate::error::{AppError, AppResult};
use crate::projects::meta::META_DIR;
use crate::util::paths::to_relative;
use std::fs;
use std::io::Write;
use std::path::Path;
use zip::write::SimpleFileOptions;

/// LaTeX's outputs: not sources.
const GENERATED: [&str; 21] = [
    "aux",
    "log",
    "out",
    "toc",
    "lof",
    "lot",
    "fls",
    "fdb_latexmk",
    "synctex",
    "bbl",
    "blg",
    "bcf",
    "xdv",
    "dvi",
    "nav",
    "snm",
    "idx",
    "ind",
    "ilg",
    "vrb",
    "run.xml",
];

fn generated(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".synctex.gz")
        || GENERATED
            .iter()
            .any(|ext| lower.ends_with(&format!(".{ext}")))
}

/// The project's source files (relative paths, sorted).
pub fn sources(root: &Path) -> AppResult<Vec<String>> {
    let root = dunce::canonicalize(root).map_err(|e| AppError::io(root, e))?;
    let walker = ignore::WalkBuilder::new(&root)
        // Everything the user made, dotfiles too (`.latexmkrc`), whatever their .gitignore says.
        .standard_filters(false)
        .follow_links(false)
        .filter_entry(|e| {
            e.depth() != 1 || !matches!(e.file_name().to_str(), Some(META_DIR | ".git"))
        })
        .build();
    let mut files = Vec::new();
    for entry in walker.filter_map(Result::ok) {
        if !entry.file_type().is_some_and(|t| t.is_file()) {
            continue;
        }
        if generated(&entry.file_name().to_string_lossy()) {
            continue;
        }
        files.push(to_relative(&root, entry.path())?);
    }
    files.sort();
    Ok(files)
}

/// Writes the sources of `root` as a ZIP at `dest` (atomically); returns how many files.
pub fn zip_sources(root: &Path, dest: &Path) -> AppResult<usize> {
    let files = sources(root)?;
    let dir = dest
        .parent()
        .ok_or_else(|| AppError::Other(format!("sin carpeta: {}", dest.display())))?;
    let tmp = tempfile_in(dir)?;
    {
        let file = fs::File::create(&tmp).map_err(|e| AppError::io(&tmp, e))?;
        let mut zip = zip::ZipWriter::new(file);
        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o644);
        let zip_error = |e: zip::result::ZipError| AppError::Other(e.to_string());
        for rel in &files {
            let path = root.join(rel);
            let bytes = fs::read(&path).map_err(|e| AppError::io(&path, e))?;
            zip.start_file(rel.as_str(), options).map_err(zip_error)?;
            zip.write_all(&bytes).map_err(|e| AppError::io(&tmp, e))?;
        }
        zip.finish().map_err(zip_error)?;
    }
    fs::rename(&tmp, dest).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        AppError::io(dest, e)
    })?;
    Ok(files.len())
}

/// A free temporary path next to the destination (same filesystem, so `rename` works).
fn tempfile_in(dir: &Path) -> AppResult<std::path::PathBuf> {
    for n in 0..1000 {
        let candidate = dir.join(format!(".libretex-export-{}-{n}.tmp", std::process::id()));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err(AppError::AlreadyExists(dir.to_owned()))
}

/// Copies the compiled PDF to `dest` (atomically).
pub fn copy_pdf(pdf: &Path, dest: &Path) -> AppResult<()> {
    let bytes = fs::read(pdf).map_err(|e| AppError::io(pdf, e))?;
    crate::util::fs::atomic_write(dest, &bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use tempfile::TempDir;

    fn project(files: &[&str]) -> TempDir {
        let dir = TempDir::new().unwrap();
        for path in files {
            let full = dir.path().join(path);
            fs::create_dir_all(full.parent().unwrap()).unwrap();
            fs::write(&full, format!("contenido de {path}")).unwrap();
        }
        dir
    }

    #[test]
    fn el_zip_tiene_las_fuentes_y_nada_mas() {
        let dir = project(&[
            "main.tex",
            "capitulos/a.tex",
            "figuras/f.png",
            "refs.bib",
            ".latexmkrc",
            "datos/ignorado.csv",
            ".gitignore",
            "main.aux",
            "main.log",
            "main.synctex.gz",
            "main.run.xml",
            ".libretex/project.json",
            ".libretex/build/main.pdf",
            ".libretex/history.git/HEAD",
            ".git/config",
        ]);
        fs::write(dir.path().join(".gitignore"), "datos/\n").unwrap();
        let out = TempDir::new().unwrap();
        let dest = out.path().join("Proyecto.zip");
        assert_eq!(zip_sources(dir.path(), &dest).unwrap(), 7);

        let mut zip = zip::ZipArchive::new(fs::File::open(&dest).unwrap()).unwrap();
        let mut names: Vec<_> = zip.file_names().map(|n| n.unwrap().into_owned()).collect();
        names.sort();
        assert_eq!(
            names,
            [
                ".gitignore",
                ".latexmkrc",
                "capitulos/a.tex",
                "datos/ignorado.csv",
                "figuras/f.png",
                "main.tex",
                "refs.bib"
            ]
        );
        let mut content = String::new();
        zip.by_name("capitulos/a.tex")
            .unwrap()
            .read_to_string(&mut content)
            .unwrap();
        assert!(content.ends_with("capitulos/a.tex"));
        // Nothing left behind but the ZIP.
        assert_eq!(fs::read_dir(out.path()).unwrap().count(), 1);
    }

    #[test]
    fn copia_el_pdf() {
        let dir = project(&[".libretex/build/main.pdf"]);
        let dest = dir.path().join("exportado.pdf");
        copy_pdf(&dir.path().join(".libretex/build/main.pdf"), &dest).unwrap();
        assert!(
            fs::read_to_string(dest)
                .unwrap()
                .starts_with("contenido de")
        );
    }

    #[test]
    fn el_zip_se_vuelve_a_importar_igual() {
        let dir = project(&["main.tex", "capitulos/a.tex", "figuras/f.png", "main.log"]);
        let out = TempDir::new().unwrap();
        let zip_path = out.path().join("p.zip");
        zip_sources(dir.path(), &zip_path).unwrap();
        let back = out.path().join("importado");
        crate::projects::zip_import::extract(&zip_path, &back).unwrap();
        assert_eq!(
            sources(&back).unwrap(),
            ["capitulos/a.tex", "figuras/f.png", "main.tex"]
        );
        assert_eq!(
            fs::read_to_string(back.join("capitulos/a.tex")).unwrap(),
            "contenido de capitulos/a.tex"
        );
    }
}
