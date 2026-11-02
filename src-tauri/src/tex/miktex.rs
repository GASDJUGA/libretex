//! MiKTeX as a package backend (the most common TeX on Windows): its package database
//! (`miktex packages list`) as the catalog, and installing, removing and updating packages
//! with `miktex packages …` in the user's own MiKTeX, without administrator rights. Installing,
//! updating and looking for updates download from MiKTeX's repository, only when asked.

use crate::error::{AppError, AppResult};
use crate::tex::install_tl::{Job, Progress, run_step};
use crate::tex::tlmgr::{Operation, valid_package_name};
use crate::tex::tlpdb::{TlPackage, Tlpdb};
use std::collections::HashSet;
use std::ffi::OsStr;
use std::path::Path;
use std::time::Duration;

/// One line per package: id, installed, version, license, title, files (`;`-separated).
const LIST_TEMPLATE: &str = "{id}\t{isInstalled}\t{version}\t{licenseType}\t{title}\t{runFiles}";

/// MiKTeX's database, read in about a second (8 000 packages); it is cached with the catalog.
const LIST_TIMEOUT: Duration = Duration::from_secs(60);
/// `check-update` asks the repository about every package (~15 s).
const UPDATE_TIMEOUT: Duration = Duration::from_secs(180);

/// The packages of `miktex packages list --template LIST_TEMPLATE`, as a TeX Live database
/// (so the catalog does not care which distribution it is), and the installed ones. MiKTeX's
/// own programs (`miktex-xetex-bin-x64-2.9`) are not offered as packages.
pub fn parse_list(text: &str) -> (Tlpdb, HashSet<String>) {
    let mut db = Tlpdb::default();
    let mut installed = HashSet::new();
    for line in text.lines() {
        let mut fields = line.split('\t');
        let (Some(id), Some(is_installed)) = (fields.next(), fields.next()) else {
            continue;
        };
        if !valid_package_name(id) {
            continue;
        }
        let mut field = || fields.next().map(str::trim).filter(|f| !f.is_empty());
        let (version, license, title, files) = (field(), field(), field(), field());
        let styles: Vec<String> = files
            .unwrap_or_default()
            .split(';')
            .filter(|f| f.ends_with(".sty") || f.ends_with(".cls"))
            .filter_map(|f| f.rsplit('/').next())
            .map(str::to_owned)
            .collect();
        for style in &styles {
            db.file_owner
                .entry(style.clone())
                .or_insert_with(|| id.to_owned());
        }
        if is_installed == "true" {
            installed.insert(id.to_owned());
        }
        db.packages.insert(
            id.to_owned(),
            TlPackage {
                name: id.to_owned(),
                category: if id.starts_with("miktex-") {
                    "MiKTeX".to_owned()
                } else {
                    "Package".to_owned()
                },
                shortdesc: title.unwrap_or_default().to_owned(),
                version: version.map(str::to_owned),
                license: license.map(str::to_owned),
                styles,
            },
        );
    }
    (db, installed)
}

/// MiKTeX's package database and its installed packages.
pub fn read_catalog(miktex: &Path, path: &OsStr) -> Option<(Tlpdb, HashSet<String>)> {
    let output = crate::tex::detect::output_with_timeout(
        crate::platform::process::command(miktex)
            .args(["packages", "list", "--template", LIST_TEMPLATE])
            .env("PATH", path),
        LIST_TIMEOUT,
    )?;
    output
        .status
        .success()
        .then(|| parse_list(&String::from_utf8_lossy(&output.stdout)))
}

fn checked(name: &str) -> AppResult<&str> {
    if valid_package_name(name) {
        Ok(name)
    } else {
        Err(AppError::InvalidName {
            name: name.to_owned(),
            reason: "no es un nombre de paquete de MiKTeX",
        })
    }
}

/// Runs `miktex packages <operation> <package>`, forwarding its output.
pub fn run(
    miktex: &Path,
    operation: Operation,
    package: &str,
    job: &Job,
    on: &mut dyn FnMut(Progress),
) -> AppResult<()> {
    let package = checked(package)?;
    let mut command = crate::platform::process::command(miktex);
    command.args(["packages", operation.verb(), package]);
    run_step(command, "miktex", job, on, |done, total, package| {
        Progress::Packages {
            done,
            total,
            package,
        }
    })
}

/// The packages `miktex packages check-update` lists as updatable (one id per line).
pub fn parse_updates(output: &str) -> HashSet<String> {
    output
        .lines()
        .map(str::trim)
        .filter(|line| valid_package_name(line))
        .map(str::to_owned)
        .collect()
}

/// Asks MiKTeX's repository whether `package` has an update (network).
pub fn has_update(miktex: &Path, package: &str) -> AppResult<bool> {
    let package = checked(package)?;
    let output = crate::tex::detect::output_with_timeout(
        crate::platform::process::command(miktex).args(["packages", "check-update"]),
        UPDATE_TIMEOUT,
    )
    .ok_or_else(|| AppError::Network("MiKTeX no respondió".into()))?;
    // 100: there are updates; 0: none.
    if !matches!(output.status.code(), Some(0 | 100)) {
        return Err(AppError::Network(
            String::from_utf8_lossy(&output.stderr).trim().to_owned(),
        ));
    }
    Ok(parse_updates(&String::from_utf8_lossy(&output.stdout)).contains(package))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Lines as MiKTeX 25.12 writes them.
    const LIST: &str = "physics\ttrue\t1.3\tlppl\tMacros supporting the Mathematics of Physics\ttexmf/tex/latex/physics/physics.sty;texmf/tpm/packages/physics.tpm\n\
ctex\tfalse\t2.5.10\tlppl\tLaTeX classes and packages for Chinese typesetting\ttexmf/tex/latex/ctex/ctex.sty;texmf/tex/latex/ctex/ctexart.cls\n\
miktex-xetex-bin-x64-2.9\ttrue\t\t\tXeTeX binaries\t\n\
12many\tfalse\t0.3\tlppl\tGeneralising mathematical index sets\t\n\
\n\
roto\n";

    #[test]
    fn la_lista_de_miktex_como_catalogo() {
        let (db, installed) = parse_list(LIST);
        assert_eq!(db.packages.len(), 4);
        let physics = &db.packages["physics"];
        assert_eq!(physics.category, "Package");
        assert_eq!(physics.version.as_deref(), Some("1.3"));
        assert_eq!(physics.license.as_deref(), Some("lppl"));
        assert_eq!(physics.styles, ["physics.sty"]);
        assert_eq!(db.packages["ctex"].styles, ["ctex.sty", "ctexart.cls"]);
        assert_eq!(db.file_owner["ctexart.cls"], "ctex");
        // MiKTeX's own programs are not offered.
        assert_eq!(db.packages["miktex-xetex-bin-x64-2.9"].category, "MiKTeX");
        assert_eq!(db.packages["miktex-xetex-bin-x64-2.9"].version, None);
        assert_eq!(
            installed,
            HashSet::from(["physics".to_owned(), "miktex-xetex-bin-x64-2.9".to_owned()])
        );
    }

    #[test]
    fn actualizaciones_de_check_update() {
        let out = "amsmath\nbabel\nmiktex-bibtex-bin-x64-2.9\r\ntcolorbox\n\n";
        let updates = parse_updates(out);
        assert!(updates.contains("tcolorbox"));
        assert!(updates.contains("miktex-bibtex-bin-x64-2.9"));
        assert!(!updates.contains("physics"));
    }

    #[test]
    fn un_nombre_invalido_no_llega_a_miktex() {
        let job = Job::default();
        let error = run(
            Path::new("miktex"),
            Operation::Install,
            "--repository=http://x",
            &job,
            &mut |_| {},
        )
        .unwrap_err();
        assert!(matches!(error, AppError::InvalidName { .. }));
    }

    /// With the MiKTeX of this machine (none in the CI): its database and the installed
    /// packages, without network.
    #[test]
    fn catalogo_del_miktex_instalado() {
        let path = crate::tex::detect::search_path(&[], std::env::var_os("PATH").as_deref());
        let Some(miktex) = crate::tex::detect::find_in_path("miktex", &path) else {
            return;
        };
        let (db, installed) = read_catalog(&miktex, &path).unwrap();
        assert!(db.packages.len() > 1000);
        assert!(installed.contains("latex-tools") || installed.contains("amsmath"));
        assert!(db.file_owner.contains_key("amsmath.sty"));
    }
}
