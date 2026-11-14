//! Package operations with `tlmgr` (writable backends: JuTeX's TeX Live or a writable
//! official one): install, remove, update and check for updates. Installing and updating
//! download from the TeX Live repository, only when the user asks.

use crate::error::{AppError, AppResult};
use crate::tex::install_tl::{Job, Progress, run_step};
use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Operation {
    Install,
    Remove,
    Update,
}

impl Operation {
    pub(crate) fn verb(self) -> &'static str {
        match self {
            Self::Install => "install",
            Self::Remove => "remove",
            Self::Update => "update",
        }
    }
}

/// A TeX Live package name: letters, digits, `.`, `_`, `-`, `+`, not starting with `-`
/// (so it can never be taken for a tlmgr option).
pub fn valid_package_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 100
        && !name.starts_with(['-', '.'])
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '+'))
}

fn checked(name: &str) -> AppResult<&str> {
    if valid_package_name(name) {
        Ok(name)
    } else {
        Err(AppError::InvalidName {
            name: name.to_owned(),
            reason: "no es un nombre de paquete de TeX Live",
        })
    }
}

/// Runs `tlmgr <operation> <package>` forwarding output and progress lines.
pub fn run(
    tlmgr: &Path,
    operation: Operation,
    package: &str,
    job: &Job,
    on: &mut dyn FnMut(Progress),
) -> AppResult<()> {
    let package = checked(package)?;
    let mut command = crate::platform::process::command(tlmgr);
    command.arg(operation.verb());
    if operation == Operation::Remove {
        // Without --force tlmgr refuses packages that a collection depends on; the user
        // asked to remove this one explicitly.
        command.arg("--force");
    }
    command.arg("--").arg(package);
    run_step(command, "tlmgr", job, on, |done, total, package| {
        Progress::Packages {
            done,
            total,
            package,
        }
    })
}

/// Whether `tlmgr --machine-readable update --list` lists `package` as updatable.
pub fn parse_update_list(output: &str, package: &str) -> bool {
    output
        .lines()
        .skip_while(|l| l.trim() != "end-of-header")
        .skip(1)
        .take_while(|l| l.trim() != "end-of-updates")
        .any(|line| {
            let mut fields = line.split('\t');
            fields.next() == Some(package) && fields.next() == Some("u")
        })
}

/// Asks the repository whether `package` has an update (network).
pub fn has_update(tlmgr: &Path, package: &str) -> AppResult<bool> {
    let package = checked(package)?;
    let output = crate::tex::detect::output_with_timeout(
        crate::platform::process::command(tlmgr)
            .args(["--machine-readable", "update", "--list", "--"])
            .arg(package),
        std::time::Duration::from_secs(120),
    )
    .ok_or_else(|| AppError::Network("tlmgr no respondió".into()))?;
    if !output.status.success() {
        return Err(AppError::Network(
            String::from_utf8_lossy(&output.stderr).trim().to_owned(),
        ));
    }
    Ok(parse_update_list(
        &String::from_utf8_lossy(&output.stdout),
        package,
    ))
}

/// First local documentation file of `package` from `texdoc -l -M` («arg\tscore\tfile…»).
pub fn parse_texdoc(output: &str) -> Option<PathBuf> {
    output
        .lines()
        .filter_map(|line| line.split('\t').nth(2))
        .map(PathBuf::from)
        .find(|p| p.is_absolute())
}

/// The package's local documentation, if any (TeX Live installs often have none).
pub fn local_docs(package: &str, path: &std::ffi::OsStr) -> Option<PathBuf> {
    let package = checked(package).ok()?;
    let texdoc = crate::tex::detect::find_in_path("texdoc", path)?;
    let output = crate::tex::detect::output_with_timeout(
        crate::platform::process::command(texdoc)
            .args(["-l", "-M", "--"])
            .arg(package)
            .env("PATH", path),
        std::time::Duration::from_secs(20),
    )?;
    parse_texdoc(&String::from_utf8_lossy(&output.stdout)).filter(|p| p.is_file())
}

/// CTAN's page of a package (opened in the browser when there is no local documentation).
pub fn ctan_page(package: &str) -> AppResult<String> {
    Ok(format!("https://ctan.org/pkg/{}", checked(package)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nombres_validos() {
        for ok in [
            "physics",
            "babel-spanish",
            "latexmk",
            "pgf",
            "l3kernel",
            "c++2e",
            "a_b.c",
        ] {
            assert!(valid_package_name(ok), "{ok}");
        }
        for bad in [
            "", "-force", "--all", ".hidden", "a b", "a/b", "x;rm", "ñ", "a\n",
        ] {
            assert!(!valid_package_name(bad), "{bad:?}");
        }
        assert!(ctan_page("--all").is_err());
        assert_eq!(
            ctan_page("physics").unwrap(),
            "https://ctan.org/pkg/physics"
        );
    }

    #[test]
    fn lista_de_actualizaciones() {
        let none = "location-url\thttps://x/tlnet\ntotal-bytes\t0\nend-of-header\nend-of-updates\n";
        assert!(!parse_update_list(none, "physics"));
        let some = "location-url\thttps://x\nend-of-header\nphysics\tu\t74247\t76000\t9000\nfoo\td\t1\t-\t0\nend-of-updates\n";
        assert!(parse_update_list(some, "physics"));
        assert!(!parse_update_list(some, "foo"));
        assert!(!parse_update_list(some, "physic"));
    }

    #[test]
    fn documentacion_de_texdoc() {
        let pdf =
            crate::util::paths::absolute("/usr/share/texmf-dist/doc/latex/physics/physics.pdf");
        let out = format!("physics\t10\t{pdf}\t\tPackage documentation\n");
        assert_eq!(parse_texdoc(&out), Some(PathBuf::from(pdf)));
        assert_eq!(
            parse_texdoc("Sorry, no local documentation found for \"physics\".\n"),
            None
        );
    }

    #[test]
    fn un_nombre_invalido_no_llega_a_tlmgr() {
        let job = Job::default();
        let error = run(
            Path::new("/no/existe/tlmgr"),
            Operation::Install,
            "--all",
            &job,
            &mut |_| {},
        );
        assert_eq!(error.unwrap_err().code(), "invalidName");
    }

    /// Real tlmgr of JuTeX's TeX Live (if installed in the usual place).
    #[test]
    #[ignore]
    fn instala_y_desinstala_con_tlmgr_real() {
        let root = std::env::var("JUTEX_TEST_TLMGR").expect("ruta de tlmgr");
        let tlmgr = Path::new(&root);
        let job = Job::default();
        let mut packages = 0;
        run(tlmgr, Operation::Install, "physics", &job, &mut |p| {
            if matches!(p, Progress::Packages { .. }) {
                packages += 1
            }
        })
        .unwrap();
        assert!(packages >= 1);
        assert!(!has_update(tlmgr, "physics").unwrap());
        run(tlmgr, Operation::Remove, "physics", &job, &mut |_| {}).unwrap();
    }
}
