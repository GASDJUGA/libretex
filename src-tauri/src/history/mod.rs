//! Local version history of a project (5.7): a git repository in `.libretex/history.git`
//! with the project folder as its work tree, separate from any `.git` the user has. Versions
//! are commits: manual ones with a name («Guardar versión»), automatic ones every few minutes
//! when something changed and after each successful compilation.

use crate::error::{AppError, AppResult};
use crate::projects::meta::META_DIR;
use git2::{IndexAddOption, Oid, Repository, Signature, Sort};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Files bigger than this are not kept in the history.
pub const MAX_FILE_BYTES: u64 = 50 * 1024 * 1024;
/// Longest version name.
pub const MAX_NAME_CHARS: usize = 100;
/// Most versions listed.
pub const MAX_LISTED: usize = 1000;

const KIND_TRAILER: &str = "LibreTeX-Kind: ";

/// Never in the history: LibreTeX's data, the user's own repository and LaTeX's outputs.
const EXCLUDE: &str = "\
# Escrito por LibreTeX: lo que el historial no guarda.
/.libretex/
/.git/
*.aux
*.log
*.out
*.toc
*.lof
*.lot
*.fls
*.fdb_latexmk
*.synctex.gz
*.synctex
*.bbl
*.blg
*.bcf
*.run.xml
*.xdv
*.dvi
*.nav
*.snm
*.idx
*.ind
*.ilg
*~
.*.swp
";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VersionKind {
    /// Saved by the user, with a name.
    Manual,
    /// Every few minutes, when something changed.
    Auto,
    /// After a successful compilation.
    Compile,
}

impl VersionKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Auto => "auto",
            Self::Compile => "compile",
        }
    }

    fn parse(text: &str) -> Self {
        match text {
            "manual" => Self::Manual,
            "compile" => Self::Compile,
            _ => Self::Auto,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    /// Commit id (hex).
    pub id: String,
    pub kind: VersionKind,
    /// The user's name for a manual version; empty for automatic ones.
    pub name: String,
    /// Milliseconds since the Unix epoch.
    pub time: i64,
}

fn git_error(e: git2::Error) -> AppError {
    AppError::Other(format!("historial: {}", e.message()))
}

fn git_dir(root: &Path) -> PathBuf {
    root.join(META_DIR).join("history.git")
}

/// The history repository of `root`, created the first time.
pub fn open(root: &Path) -> AppResult<Repository> {
    let dir = git_dir(root);
    let repo = if dir.join("HEAD").is_file() {
        Repository::open_bare(&dir).map_err(git_error)?
    } else {
        fs::create_dir_all(&dir).map_err(|e| AppError::io(&dir, e))?;
        Repository::init_bare(&dir).map_err(git_error)?
    };
    // Kept up to date in case a newer LibreTeX excludes more.
    let exclude = dir.join("info").join("exclude");
    if fs::read_to_string(&exclude).ok().as_deref() != Some(EXCLUDE) {
        fs::create_dir_all(dir.join("info")).map_err(|e| AppError::io(&dir, e))?;
        fs::write(&exclude, EXCLUDE).map_err(|e| AppError::io(&exclude, e))?;
    }
    repo.set_workdir(root, false).map_err(git_error)?;
    Ok(repo)
}

/// A version name: trimmed, one line, not too long.
pub fn clean_name(name: &str) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty()
        || name.chars().count() > MAX_NAME_CHARS
        || name.chars().any(char::is_control)
    {
        return Err(AppError::InvalidName {
            name: name.to_owned(),
            reason: "el nombre de la versión debe tener entre 1 y 100 caracteres, en una línea",
        });
    }
    Ok(name.to_owned())
}

/// Records the project as it is on disk now. Automatic versions are skipped when nothing
/// changed since the last one (returns `None`); manual ones are always recorded.
pub fn snapshot(root: &Path, kind: VersionKind, name: Option<&str>) -> AppResult<Option<Version>> {
    let name = match (kind, name) {
        (VersionKind::Manual, Some(name)) => clean_name(name)?,
        (VersionKind::Manual, None) => {
            return Err(AppError::InvalidName {
                name: String::new(),
                reason: "una versión manual necesita un nombre",
            });
        }
        _ => String::new(),
    };
    let repo = open(root)?;
    let mut index = repo.index().map_err(git_error)?;
    let mut too_big = |path: &Path, _: &[u8]| -> i32 {
        let big = fs::metadata(root.join(path)).is_ok_and(|m| m.len() > MAX_FILE_BYTES);
        i32::from(big)
    };
    index
        .add_all(["*"], IndexAddOption::DEFAULT, Some(&mut too_big))
        .map_err(git_error)?;
    // Files deleted since the last version.
    index.update_all(["*"], None).map_err(git_error)?;
    index.write().map_err(git_error)?;
    let tree_id = index.write_tree().map_err(git_error)?;

    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    if kind != VersionKind::Manual && parent.as_ref().is_some_and(|p| p.tree_id() == tree_id) {
        return Ok(None);
    }
    let tree = repo.find_tree(tree_id).map_err(git_error)?;
    // A local signature: the history never leaves the machine.
    let signature = Signature::now("LibreTeX", "libretex@localhost").map_err(git_error)?;
    let title = if name.is_empty() {
        kind.as_str().to_owned()
    } else {
        name.clone()
    };
    let message = format!("{title}\n\n{KIND_TRAILER}{}\n", kind.as_str());
    let parents: Vec<_> = parent.iter().collect();
    let id = repo
        .commit(
            Some("HEAD"),
            &signature,
            &signature,
            &message,
            &tree,
            &parents,
        )
        .map_err(git_error)?;
    Ok(Some(version(&repo, id)?))
}

fn version(repo: &Repository, id: Oid) -> AppResult<Version> {
    let commit = repo.find_commit(id).map_err(git_error)?;
    let message = commit.message().unwrap_or("");
    let kind = message
        .lines()
        .find_map(|l| l.strip_prefix(KIND_TRAILER))
        .map_or(VersionKind::Auto, |k| VersionKind::parse(k.trim()));
    let name = if kind == VersionKind::Manual {
        message.lines().next().unwrap_or("").to_owned()
    } else {
        String::new()
    };
    Ok(Version {
        id: id.to_string(),
        kind,
        name,
        time: commit.time().seconds() * 1000,
    })
}

/// The versions, newest first (at most [`MAX_LISTED`]).
pub fn list(root: &Path) -> AppResult<Vec<Version>> {
    if !git_dir(root).join("HEAD").is_file() {
        return Ok(Vec::new());
    }
    let repo = open(root)?;
    if repo.head().is_err() {
        return Ok(Vec::new());
    }
    let mut walk = repo.revwalk().map_err(git_error)?;
    walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
        .map_err(git_error)?;
    walk.push_head().map_err(git_error)?;
    walk.take(MAX_LISTED)
        .map(|id| version(&repo, id.map_err(git_error)?))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn project(files: &[(&str, &str)]) -> TempDir {
        let dir = TempDir::new().unwrap();
        for (path, content) in files {
            let path = dir.path().join(path);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, content).unwrap();
        }
        dir
    }

    fn files_of(root: &Path, version: &Version) -> Vec<String> {
        let repo = open(root).unwrap();
        let commit = repo
            .find_commit(Oid::from_str(&version.id).unwrap())
            .unwrap();
        let mut files = Vec::new();
        commit
            .tree()
            .unwrap()
            .walk(git2::TreeWalkMode::PreOrder, |dir, entry| {
                if entry.kind() == Some(git2::ObjectType::Blob) {
                    files.push(format!("{dir}{}", entry.name().unwrap()));
                }
                git2::TreeWalkResult::Ok
            })
            .unwrap();
        files.sort();
        files
    }

    #[test]
    fn guarda_las_fuentes_y_no_lo_generado_ni_lo_de_libretex() {
        let dir = project(&[
            ("main.tex", "hola"),
            ("capitulos/a.tex", "a"),
            ("figuras/f.pdf", "%PDF figura"),
            ("main.aux", "x"),
            ("main.log", "x"),
            ("main.synctex.gz", "x"),
            (".libretex/project.json", "{}"),
            (".libretex/build/main.pdf", "x"),
            (".git/config", "x"),
        ]);
        let v = snapshot(dir.path(), VersionKind::Auto, None)
            .unwrap()
            .unwrap();
        assert_eq!(
            files_of(dir.path(), &v),
            ["capitulos/a.tex", "figuras/f.pdf", "main.tex"]
        );
    }

    #[test]
    fn las_automaticas_solo_si_algo_cambio_las_manuales_siempre() {
        let dir = project(&[("main.tex", "uno")]);
        let root = dir.path();
        assert!(snapshot(root, VersionKind::Auto, None).unwrap().is_some());
        assert!(
            snapshot(root, VersionKind::Compile, None)
                .unwrap()
                .is_none()
        );
        let manual = snapshot(root, VersionKind::Manual, Some("  Entrega 1 ")).unwrap();
        assert_eq!(manual.unwrap().name, "Entrega 1");
        fs::write(root.join("main.tex"), "dos").unwrap();
        assert!(
            snapshot(root, VersionKind::Compile, None)
                .unwrap()
                .is_some()
        );
        // Deleting a file is a change too.
        fs::write(root.join("extra.tex"), "x").unwrap();
        let with_extra = snapshot(root, VersionKind::Auto, None).unwrap().unwrap();
        fs::remove_file(root.join("extra.tex")).unwrap();
        let without = snapshot(root, VersionKind::Auto, None).unwrap().unwrap();
        assert!(files_of(root, &with_extra).contains(&"extra.tex".to_owned()));
        assert!(!files_of(root, &without).contains(&"extra.tex".to_owned()));

        let kinds: Vec<_> = list(root).unwrap().iter().map(|v| v.kind).collect();
        assert_eq!(
            kinds,
            [
                VersionKind::Auto,
                VersionKind::Auto,
                VersionKind::Compile,
                VersionKind::Manual,
                VersionKind::Auto
            ]
        );
    }

    #[test]
    fn no_toca_el_repositorio_git_del_usuario() {
        let dir = project(&[("main.tex", "x")]);
        let root = dir.path();
        let user = Repository::init(root).unwrap();
        snapshot(root, VersionKind::Manual, Some("v1")).unwrap();
        // The user's repository has no commits and nothing staged by LibreTeX.
        assert!(user.head().is_err());
        assert!(user.index().unwrap().is_empty());
        assert!(root.join(".libretex/history.git/HEAD").is_file());
    }

    #[test]
    fn respeta_el_gitignore_del_proyecto_y_omite_archivos_enormes() {
        let dir = project(&[
            ("main.tex", "x"),
            ("datos/x.csv", "1"),
            (".gitignore", "datos/\n"),
        ]);
        let root = dir.path();
        let big = fs::File::create(root.join("enorme.bin")).unwrap();
        big.set_len(MAX_FILE_BYTES + 1).unwrap();
        let v = snapshot(root, VersionKind::Auto, None).unwrap().unwrap();
        assert_eq!(files_of(root, &v), [".gitignore", "main.tex"]);
    }

    #[test]
    fn nombres_validos() {
        assert!(clean_name("").is_err());
        assert!(clean_name("a\nb").is_err());
        assert!(clean_name(&"x".repeat(101)).is_err());
        assert!(snapshot(Path::new("/nada"), VersionKind::Manual, None).is_err());
        assert_eq!(clean_name(" Borrador final ").unwrap(), "Borrador final");
    }

    #[test]
    fn sin_historial_la_lista_esta_vacia() {
        let dir = project(&[("main.tex", "x")]);
        assert!(list(dir.path()).unwrap().is_empty());
        assert!(!dir.path().join(".libretex/history.git").exists());
    }
}
