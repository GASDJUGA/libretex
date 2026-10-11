//! The package catalog of the package manager: TeX Live's database combined with CTAN's
//! index, with each package's installation status for the active backend, and the mapping
//! `.sty` → package → collection (→ pacman package).

use crate::tex::ctan::CtanEntry;
use crate::tex::tlpdb::{Tlpdb, pacman_package};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Installed,
    Missing,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageHit {
    /// TeX Live name (or the CTAN key for packages that are not in TeX Live).
    pub name: String,
    pub caption: String,
    pub version: Option<String>,
    pub license: Option<String>,
    pub in_texlive: bool,
    pub in_ctan: bool,
    pub status: Status,
    /// For pacman's TeX Live: the system package that ships it (`texlive-latexextra`).
    pub pacman_package: Option<String>,
    /// Style/class files it provides (first few).
    pub styles: Vec<String>,
}

/// How to know what is installed.
#[derive(Debug, Clone)]
pub enum Installed {
    /// Packages installed in a TeX Live with its own database (managed, official).
    Names(HashSet<String>),
    /// pacman's TeX Live: the collections whose `texlive-…` package is installed.
    PacmanCollections(HashSet<String>),
    /// Unknown here (another distribution): `kpsewhich` decides later.
    Unknown,
}

/// The collections installed with pacman, from `pacman -Qq` output (`texlive-latexextra`).
pub fn pacman_collections(pacman_q: &str) -> HashSet<String> {
    pacman_q
        .lines()
        .filter_map(|line| line.trim().strip_prefix("texlive-"))
        .filter(|name| !["bin", "doc", "meta"].contains(name))
        .map(|name| format!("collection-{name}"))
        .collect()
}

pub struct Catalog {
    tl: Tlpdb,
    ctan: HashMap<String, CtanEntry>,
    installed: Installed,
}

/// Lowercase without accents, for matching.
fn fold(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'ä' | 'â' => 'a',
            'é' | 'è' | 'ë' | 'ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' => 'o',
            'ú' | 'ù' | 'ü' | 'û' => 'u',
            'ñ' => 'n',
            c => c,
        })
        .collect()
}

/// Relevance of a package for a query (0: not a match).
fn score(query: &str, tokens: &[&str], name: &str, caption: &str) -> u32 {
    let name = fold(name);
    if name == query {
        return 1000;
    }
    if name.starts_with(query) {
        return 700u32.saturating_sub(name.len() as u32);
    }
    if name.contains(query) {
        return 400u32.saturating_sub(name.len() as u32);
    }
    let text = format!("{name} {}", fold(caption));
    if !tokens.iter().all(|t| text.contains(t)) {
        return 0;
    }
    100 + tokens.iter().filter(|t| name.contains(**t)).count() as u32 * 20
}

impl Catalog {
    pub fn new(tl: Tlpdb, ctan: Vec<CtanEntry>, installed: Installed) -> Self {
        let ctan = ctan.into_iter().map(|e| (e.key.clone(), e)).collect();
        Self {
            tl,
            ctan,
            installed,
        }
    }

    fn status_of(&self, name: &str) -> (Status, Option<String>) {
        let in_texlive = self.tl.packages.contains_key(name);
        match &self.installed {
            Installed::Names(names) if names.contains(name) => (Status::Installed, None),
            Installed::Names(_) if in_texlive || !self.ctan.is_empty() => (Status::Missing, None),
            Installed::Names(_) => (Status::Unknown, None),
            Installed::PacmanCollections(installed) => match self.tl.collection_of.get(name) {
                Some(collection) if installed.contains(collection) => (Status::Installed, None),
                Some(collection) => (Status::Missing, pacman_package(collection)),
                None => (Status::Unknown, None),
            },
            Installed::Unknown => (Status::Unknown, None),
        }
    }

    fn hit(&self, name: &str) -> Option<PackageHit> {
        let tl = self.tl.packages.get(name);
        let ctan = self.ctan.get(name);
        if tl.is_none() && ctan.is_none() {
            return None;
        }
        let (status, pacman_package) = self.status_of(name);
        let caption = tl
            .map(|p| p.shortdesc.clone())
            .filter(|c| !c.is_empty())
            .or_else(|| ctan.map(|c| c.caption.clone()))
            .unwrap_or_default();
        Some(PackageHit {
            name: name.to_owned(),
            caption,
            version: tl.and_then(|p| p.version.clone()),
            license: tl.and_then(|p| p.license.clone()),
            in_texlive: tl.is_some(),
            in_ctan: ctan.is_some(),
            status,
            pacman_package,
            styles: tl
                .map(|p| p.styles.iter().take(8).cloned().collect())
                .unwrap_or_default(),
        })
    }

    /// Packages matching `query` (name first, then description), best first.
    pub fn search(&self, query: &str, limit: usize) -> Vec<PackageHit> {
        let query = fold(query.trim());
        if query.is_empty() {
            return Vec::new();
        }
        let tokens: Vec<&str> = query.split_whitespace().collect();
        let mut scored: Vec<(u32, &str)> = Vec::new();
        let mut seen = HashSet::new();
        // TeX Live packages (no collections or schemes), then CTAN-only ones.
        for package in self.tl.packages.values() {
            if package.category != "Package" && package.category != "ConTeXt" {
                continue;
            }
            let caption = self
                .ctan
                .get(&package.name)
                .map_or(&package.shortdesc, |c| &c.caption);
            let s = score(
                &query,
                &tokens,
                &package.name,
                &format!("{} {caption}", package.shortdesc),
            );
            if s > 0 {
                seen.insert(package.name.as_str());
                scored.push((s, package.name.as_str()));
            }
        }
        for entry in self.ctan.values() {
            if seen.contains(entry.key.as_str()) {
                continue;
            }
            let s = score(&query, &tokens, &entry.key, &entry.caption);
            if s > 0 {
                scored.push((s, entry.key.as_str()));
            }
        }
        scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(b.1)));
        scored
            .into_iter()
            .take(limit)
            .filter_map(|(_, name)| self.hit(name))
            .collect()
    }

    /// One package by name.
    pub fn get(&self, name: &str) -> Option<PackageHit> {
        self.hit(name)
    }

    /// The package that provides a style/class file (`physics.sty`).
    pub fn package_for_file(&self, file: &str) -> Option<PackageHit> {
        let base = file.rsplit('/').next().unwrap_or(file);
        self.tl.file_owner.get(base).and_then(|name| self.hit(name))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tex::{ctan, tlpdb};

    const TLPDB: &str = include_str!("../../../tests/fixtures/tlpdb/sample.tlpdb");
    const CTAN: &str = include_str!("../../../tests/fixtures/ctan/packages.json");

    fn catalog(installed: Installed) -> Catalog {
        Catalog::new(
            tlpdb::parse(TLPDB),
            ctan::parse_index(CTAN).unwrap(),
            installed,
        )
    }

    #[test]
    fn nombre_exacto_primero_luego_prefijo_y_descripcion() {
        let c = catalog(Installed::Unknown);
        let names: Vec<_> = c
            .search("physics", 10)
            .into_iter()
            .map(|h| h.name)
            .collect();
        assert_eq!(names.first().map(String::as_str), Some("physics"));
        // By description (and without caring about case or accents).
        let found = c.search("CHINESE typesetting", 10);
        assert_eq!(found.first().map(|h| h.name.as_str()), Some("ctex"));
        assert!(c.search("", 10).is_empty());
        assert!(c.search("ornitorrinco", 10).is_empty());
    }

    #[test]
    fn paquetes_solo_de_ctan_tambien_aparecen() {
        let c = catalog(Installed::Unknown);
        let hit = c.search("tcolorbox", 5).into_iter().next().unwrap();
        assert!(!hit.in_texlive && hit.in_ctan);
        let physics = c.get("physics").unwrap();
        assert!(physics.in_texlive && physics.in_ctan);
        assert_eq!(physics.version.as_deref(), Some("1.3"));
    }

    #[test]
    fn estado_con_pacman_por_coleccion() {
        let installed =
            pacman_collections("texlive-basic\ntexlive-mathscience\ntexlive-bin\nperl\n");
        assert!(installed.contains("collection-mathscience"));
        assert!(!installed.contains("collection-bin"));
        let c = catalog(Installed::PacmanCollections(installed));
        assert_eq!(c.get("physics").unwrap().status, Status::Installed);
        let ctex = c.get("ctex").unwrap();
        assert_eq!(ctex.status, Status::Missing);
        assert_eq!(ctex.pacman_package.as_deref(), Some("texlive-langchinese"));
    }

    #[test]
    fn estado_con_tex_live_propio() {
        let c = catalog(Installed::Names(["physics".to_owned()].into()));
        assert_eq!(c.get("physics").unwrap().status, Status::Installed);
        assert_eq!(c.get("ctex").unwrap().status, Status::Missing);
        assert_eq!(c.get("ctex").unwrap().pacman_package, None);
    }

    #[test]
    fn de_sty_a_paquete() {
        let c = catalog(Installed::Unknown);
        assert_eq!(c.package_for_file("ctex.sty").unwrap().name, "ctex");
        assert_eq!(
            c.package_for_file("texmf/tex/physics.sty").unwrap().name,
            "physics"
        );
        assert!(c.package_for_file("noexiste.sty").is_none());
    }
}
