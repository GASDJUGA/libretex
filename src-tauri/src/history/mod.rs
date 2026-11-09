//! Local version history of a project (5.7): a git repository in `.jutex/history.git`
//! with the project folder as its work tree, separate from any `.git` the user has. Versions
//! are commits: manual ones with a name («Guardar versión»), automatic ones every few minutes
//! when something changed and after each successful compilation.

use crate::error::{AppError, AppResult};
use crate::gitops::{self, LATEX_OUTPUTS, git_error};
use crate::projects::meta::META_DIR;
use crate::projects::trash::TrashBin;
use git2::{Oid, Repository, Signature, Sort};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub use crate::gitops::{ChangeKind, FileChange, MAX_FILE_BYTES, VersionFile};

/// Longest version name.
pub const MAX_NAME_CHARS: usize = 100;
/// Most versions listed.
pub const MAX_LISTED: usize = 1000;

const KIND_TRAILER: &str = "JuTeX-Kind: ";
/// The same line in versions made by LibreTeX (before 2.0.0).
const LEGACY_KIND_TRAILER: &str = "LibreTeX-Kind: ";

/// Never in the history: JuTeX's data, the user's own repository and LaTeX's outputs.
fn exclude_file() -> String {
    let mut out = String::from(
        "# Escrito por JuTeX: lo que el historial no guarda.\n/.jutex/\n/.libretex/\n/.git/\n",
    );
    for pattern in LATEX_OUTPUTS {
        out.push_str(pattern);
        out.push('\n');
    }
    out.push_str(".*.swp\n");
    out
}

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
    // Kept up to date in case a newer JuTeX excludes more.
    let exclude = dir.join("info").join("exclude");
    let wanted = exclude_file();
    if fs::read_to_string(&exclude).ok() != Some(wanted.clone()) {
        fs::create_dir_all(dir.join("info")).map_err(|e| AppError::io(&dir, e))?;
        fs::write(&exclude, wanted).map_err(|e| AppError::io(&exclude, e))?;
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
    let tree_id = gitops::stage_all(&repo, root)?;

    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    if kind != VersionKind::Manual && parent.as_ref().is_some_and(|p| p.tree_id() == tree_id) {
        return Ok(None);
    }
    let tree = repo.find_tree(tree_id).map_err(git_error)?;
    // A local signature: the history never leaves the machine.
    let signature = Signature::now("JuTeX", "jutex@localhost").map_err(git_error)?;
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
        .find_map(|l| {
            l.strip_prefix(KIND_TRAILER)
                .or_else(|| l.strip_prefix(LEGACY_KIND_TRAILER))
        })
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

/// What a version changed, compared with the one before it (sorted by path).
pub fn changes(root: &Path, id: &str) -> AppResult<Vec<FileChange>> {
    gitops::changes_of(&open(root)?, id)
}

/// `path` as it was in version `id`.
pub fn file_at(root: &Path, id: &str, path: &str) -> AppResult<VersionFile> {
    gitops::file_in(&open(root)?, id, path)
}

/// The current state is kept as a version before restoring, so nothing is lost.
fn keep_current(root: &Path, what: &str) -> AppResult<()> {
    snapshot(
        root,
        VersionKind::Manual,
        Some(&format!("Antes de restaurar {what}")),
    )?;
    Ok(())
}

/// Brings back `path` as it was in version `id` (deleted if it did not exist then).
pub fn restore_file(root: &Path, id: &str, path: &str, trash: &dyn TrashBin) -> AppResult<()> {
    let repo = open(root)?;
    gitops::restore_file_in(&repo, root, id, path, trash, || {
        keep_current(root, &format!("«{path}»"))
    })
}

/// Brings the whole project back to version `id`: its files as they were, and the files
/// added since (those the history knew) to the trash. Files the history never kept
/// (ignored ones, LaTeX's outputs) are left alone. Returns the paths that changed.
pub fn restore_project(root: &Path, id: &str, trash: &dyn TrashBin) -> AppResult<Vec<String>> {
    let repo = open(root)?;
    // After keep_current, HEAD is exactly what is on disk now.
    gitops::restore_tree_in(&repo, root, id, trash, || keep_current(root, "el proyecto"))
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

    #[test]
    fn las_versiones_nuevas_son_de_jutex() {
        let dir = project(&[("main.tex", "a")]);
        let v = snapshot(dir.path(), VersionKind::Compile, None)
            .unwrap()
            .unwrap();
        let repo = open(dir.path()).unwrap();
        let commit = repo.find_commit(Oid::from_str(&v.id).unwrap()).unwrap();
        assert_eq!(commit.author().name().ok(), Some("JuTeX"));
        assert_eq!(commit.author().email().ok(), Some("jutex@localhost"));
        assert!(
            commit
                .message()
                .unwrap()
                .contains("\nJuTeX-Kind: compile\n")
        );
        assert!(git_dir(dir.path()).starts_with(dir.path().join(".jutex")));
    }

    #[test]
    fn lee_el_tipo_de_versiones_de_libretex() {
        let dir = project(&[("main.tex", "a")]);
        snapshot(dir.path(), VersionKind::Manual, Some("primera")).unwrap();
        // A version written by LibreTeX before the rename.
        let repo = open(dir.path()).unwrap();
        let head = repo.head().unwrap().peel_to_commit().unwrap();
        let sig = Signature::now("LibreTeX", "libretex@localhost").unwrap();
        repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            "compile\n\nLibreTeX-Kind: compile\n",
            &head.tree().unwrap(),
            &[&head],
        )
        .unwrap();
        let versions = list(dir.path()).unwrap();
        assert_eq!(versions[0].kind, VersionKind::Compile);
        assert_eq!(versions[1].kind, VersionKind::Manual);
        assert_eq!(versions[1].name, "primera");
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
    fn guarda_las_fuentes_y_no_lo_generado_ni_lo_de_jutex() {
        let dir = project(&[
            ("main.tex", "hola"),
            ("capitulos/a.tex", "a"),
            ("figuras/f.pdf", "%PDF figura"),
            ("main.aux", "x"),
            ("main.log", "x"),
            ("main.synctex.gz", "x"),
            (".jutex/project.json", "{}"),
            (".jutex/build/main.pdf", "x"),
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
        // The user's repository has no commits and nothing staged by JuTeX.
        assert!(user.head().is_err());
        assert!(user.index().unwrap().is_empty());
        assert!(root.join(".jutex/history.git/HEAD").is_file());
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
        assert!(!dir.path().join(".jutex/history.git").exists());
    }

    use crate::projects::trash::fake::FakeTrash;

    #[test]
    fn cambios_de_cada_version_y_archivos_como_eran() {
        let dir = project(&[("main.tex", "uno"), ("viejo.tex", "x")]);
        let root = dir.path();
        let first = snapshot(root, VersionKind::Auto, None).unwrap().unwrap();
        fs::write(root.join("main.tex"), "dos").unwrap();
        fs::write(root.join("nuevo.tex"), "n").unwrap();
        fs::remove_file(root.join("viejo.tex")).unwrap();
        fs::write(root.join("fig.png"), [0u8, 159, 146, 150]).unwrap();
        let second = snapshot(root, VersionKind::Auto, None).unwrap().unwrap();

        let summary = |v: &Version| -> Vec<(String, ChangeKind)> {
            changes(root, &v.id)
                .unwrap()
                .into_iter()
                .map(|c| (c.path, c.kind))
                .collect()
        };
        assert_eq!(
            summary(&first),
            [
                ("main.tex".into(), ChangeKind::Added),
                ("viejo.tex".into(), ChangeKind::Added)
            ]
        );
        assert_eq!(
            summary(&second),
            [
                ("fig.png".into(), ChangeKind::Added),
                ("main.tex".into(), ChangeKind::Modified),
                ("nuevo.tex".into(), ChangeKind::Added),
                ("viejo.tex".into(), ChangeKind::Deleted),
            ]
        );
        assert_eq!(
            file_at(root, &first.id, "main.tex")
                .unwrap()
                .content
                .as_deref(),
            Some("uno")
        );
        assert_eq!(file_at(root, &first.id, "nuevo.tex").unwrap().content, None);
        assert!(file_at(root, &second.id, "fig.png").unwrap().binary);
        assert!(matches!(
            changes(root, "no-es-un-id"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn restaurar_un_archivo_guarda_antes_lo_actual() {
        let dir = project(&[("main.tex", "uno")]);
        let root = dir.path();
        let trash_dir = TempDir::new().unwrap();
        let trash = FakeTrash::new(trash_dir.path().join("papelera"));
        let first = snapshot(root, VersionKind::Auto, None).unwrap().unwrap();
        fs::write(root.join("main.tex"), "dos").unwrap();
        fs::write(root.join("nuevo.tex"), "n").unwrap();
        restore_file(root, &first.id, "main.tex", &trash).unwrap();
        assert_eq!(fs::read_to_string(root.join("main.tex")).unwrap(), "uno");
        // «dos» is still in the history, as the version saved before restoring.
        let before = &list(root).unwrap()[0];
        assert_eq!(before.name, "Antes de restaurar «main.tex»");
        assert_eq!(
            file_at(root, &before.id, "main.tex")
                .unwrap()
                .content
                .as_deref(),
            Some("dos")
        );
        // A file that did not exist in that version goes to the trash.
        restore_file(root, &first.id, "nuevo.tex", &trash).unwrap();
        assert!(!root.join("nuevo.tex").exists());
        assert_eq!(trash.list().unwrap().len(), 1);
    }

    #[test]
    fn restaurar_el_proyecto_recupera_exactamente_el_contenido() {
        let dir = project(&[("main.tex", "uno"), ("cap/a.tex", "a"), ("fig.png", "png")]);
        let root = dir.path();
        let trash_dir = TempDir::new().unwrap();
        let trash = FakeTrash::new(trash_dir.path().join("papelera"));
        let first = snapshot(root, VersionKind::Manual, Some("v1"))
            .unwrap()
            .unwrap();
        fs::write(root.join("main.tex"), "dos").unwrap();
        fs::remove_file(root.join("cap/a.tex")).unwrap();
        fs::write(root.join("cap/b.tex"), "b").unwrap();
        fs::write(root.join("main.log"), "salida").unwrap();
        snapshot(root, VersionKind::Auto, None).unwrap();
        fs::write(root.join("main.tex"), "tres sin guardar en el historial").unwrap();

        let changed = restore_project(root, &first.id, &trash).unwrap();
        assert_eq!(changed, ["cap/a.tex", "cap/b.tex", "main.tex"]);
        assert_eq!(fs::read_to_string(root.join("main.tex")).unwrap(), "uno");
        assert_eq!(fs::read_to_string(root.join("cap/a.tex")).unwrap(), "a");
        assert!(!root.join("cap/b.tex").exists());
        assert_eq!(fs::read_to_string(root.join("fig.png")).unwrap(), "png");
        // Not kept by the history: untouched.
        assert_eq!(fs::read_to_string(root.join("main.log")).unwrap(), "salida");
        // What was on disk (even unsaved in the history) is a version now.
        let kept = &list(root).unwrap()[0];
        assert_eq!(kept.name, "Antes de restaurar el proyecto");
        assert_eq!(
            file_at(root, &kept.id, "main.tex")
                .unwrap()
                .content
                .as_deref(),
            Some("tres sin guardar en el historial")
        );
    }

    #[test]
    fn no_escribe_fuera_del_proyecto_ni_en_jutex() {
        let dir = project(&[("main.tex", "x")]);
        let root = dir.path();
        let trash_dir = TempDir::new().unwrap();
        let trash = FakeTrash::new(trash_dir.path().join("papelera"));
        let v = snapshot(root, VersionKind::Auto, None).unwrap().unwrap();
        for bad in [
            "../fuera.tex",
            ".jutex/project.json",
            ".git/config",
            "/etc/passwd",
        ] {
            assert!(restore_file(root, &v.id, bad, &trash).is_err(), "{bad}");
        }
    }
}
