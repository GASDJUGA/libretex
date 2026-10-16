//! TeX Live's package database (`tlpkg/texlive.tlpdb`): names, descriptions, versions,
//! licenses, the files each package provides and which collection it belongs to.

use std::collections::HashMap;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TlPackage {
    pub name: String,
    pub category: String,
    pub shortdesc: String,
    pub version: Option<String>,
    pub license: Option<String>,
    /// LaTeX style and class files it provides (basenames: `physics.sty`).
    pub styles: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct Tlpdb {
    pub packages: HashMap<String, TlPackage>,
    /// Package → the collection that depends on it.
    pub collection_of: HashMap<String, String>,
    /// Style/class file basename → package (`ctex.sty` → `ctex`).
    pub file_owner: HashMap<String, String>,
}

/// Files whose basename is worth indexing (what `\usepackage`/`\documentclass` load).
fn is_style(path: &str) -> bool {
    path.ends_with(".sty") || path.ends_with(".cls")
}

/// Parses the text of a `texlive.tlpdb`. Platform-specific packages (`latexmk.x86_64-linux`)
/// are skipped: the user sees the package, tlmgr adds the binaries.
pub fn parse(text: &str) -> Tlpdb {
    let mut db = Tlpdb::default();
    let mut current: Option<TlPackage> = None;
    let mut in_runfiles = false;
    let mut depends: Vec<String> = Vec::new();

    let finish = |package: Option<TlPackage>, depends: &mut Vec<String>, db: &mut Tlpdb| {
        let Some(package) = package else { return };
        if package.category == "Collection" {
            for dep in depends.drain(..) {
                db.collection_of
                    .entry(dep)
                    .or_insert_with(|| package.name.clone());
            }
        }
        depends.clear();
        if package.name.contains('.') {
            return;
        }
        for style in &package.styles {
            db.file_owner
                .entry(style.clone())
                .or_insert_with(|| package.name.clone());
        }
        db.packages.insert(package.name.clone(), package);
    };

    for line in text.lines() {
        if line.is_empty() {
            finish(current.take(), &mut depends, &mut db);
            in_runfiles = false;
            continue;
        }
        if let Some(file) = line.strip_prefix(' ') {
            if in_runfiles && let Some(package) = current.as_mut() {
                let path = file.split_whitespace().next().unwrap_or("");
                if is_style(path) {
                    let base = path.rsplit('/').next().unwrap_or(path).to_owned();
                    if !package.styles.contains(&base) {
                        package.styles.push(base);
                    }
                }
            }
            continue;
        }
        let (key, value) = line.split_once(' ').unwrap_or((line, ""));
        in_runfiles = key == "runfiles";
        match key {
            "name" => {
                finish(current.take(), &mut depends, &mut db);
                current = Some(TlPackage {
                    name: value.to_owned(),
                    ..Default::default()
                });
            }
            _ => {
                let Some(package) = current.as_mut() else {
                    continue;
                };
                match key {
                    "category" => package.category = value.to_owned(),
                    "shortdesc" => package.shortdesc = value.to_owned(),
                    "catalogue-version" => package.version = Some(value.to_owned()),
                    "catalogue-license" => package.license = Some(value.to_owned()),
                    "depend" => depends.push(value.to_owned()),
                    _ => {}
                }
            }
        }
    }
    finish(current.take(), &mut depends, &mut db);
    db
}

/// The pacman package that ships a TeX Live collection (Arch splits TeX Live by collection):
/// `collection-latexextra` → `texlive-latexextra`.
pub fn pacman_package(collection: &str) -> Option<String> {
    collection
        .strip_prefix("collection-")
        .map(|name| format!("texlive-{name}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = include_str!("../../../tests/fixtures/tlpdb/sample.tlpdb");

    #[test]
    fn paquetes_con_descripcion_version_licencia_y_estilos() {
        let db = parse(SAMPLE);
        let physics = &db.packages["physics"];
        assert_eq!(
            physics.shortdesc,
            "Macros supporting the Mathematics of Physics"
        );
        assert_eq!(physics.version.as_deref(), Some("1.3"));
        assert_eq!(physics.license.as_deref(), Some("lppl"));
        assert_eq!(physics.styles, ["physics.sty"]);
        assert!(db.packages["ctex"].styles.contains(&"ctex.sty".to_owned()));
        assert!(
            db.packages["ctex"]
                .styles
                .contains(&"ctexart.cls".to_owned())
        );
        // Platform binaries are not listed as packages.
        assert!(!db.packages.contains_key("latexmk.x86_64-linux"));
        assert!(db.packages.contains_key("latexmk"));
    }

    #[test]
    fn archivo_a_paquete_y_paquete_a_coleccion() {
        let db = parse(SAMPLE);
        assert_eq!(db.file_owner["ctex.sty"], "ctex");
        assert_eq!(db.file_owner["physics.sty"], "physics");
        assert_eq!(db.file_owner["amsmath.sty"], "amsmath");
        assert_eq!(db.collection_of["ctex"], "collection-langchinese");
        assert_eq!(db.collection_of["physics"], "collection-mathscience");
        assert_eq!(db.collection_of["minted"], "collection-latexextra");
    }

    #[test]
    fn colecciones_a_paquetes_de_pacman() {
        assert_eq!(
            pacman_package("collection-langchinese").as_deref(),
            Some("texlive-langchinese")
        );
        assert_eq!(pacman_package("scheme-basic"), None);
    }

    #[test]
    fn el_tlpdb_completo_del_sistema_se_lee_rapido() {
        let Ok(text) = std::fs::read_to_string("/usr/share/tlpkg/texlive.tlpdb") else {
            return;
        };
        let started = std::time::Instant::now();
        let db = parse(&text);
        assert!(db.packages.len() > 3000);
        assert_eq!(
            db.file_owner.get("physics.sty").map(String::as_str),
            Some("physics")
        );
        assert!(started.elapsed().as_secs_f64() < 2.0);
    }
}
