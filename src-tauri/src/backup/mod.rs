//! Backup with Git (5.9): the project's own repository (`<project>/.git`), visible and usable
//! with other tools, unlike the local history in `.libretex/history.git`. Nothing here runs
//! by itself: the user turns it on per project and backs up with a message. Local work goes
//! through `git2`; talking to a remote (GitHub) is in [`remote`].

pub mod remote;

use crate::error::{AppError, AppResult};
use crate::gitops::{self, ChangeKind, FileChange, LATEX_OUTPUTS, VersionFile, git_error};
use crate::projects::trash::TrashBin;
use crate::util::fs::atomic_write;
use git2::{
    Oid, Repository, RepositoryInitOptions, RepositoryOpenFlags, Signature, Sort, Status,
    StatusOptions,
};
use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::fs;
use std::path::Path;

/// Most backups listed.
pub const MAX_LISTED: usize = 1000;
/// Longest backup message.
pub const MAX_MESSAGE_CHARS: usize = 1000;

/// The author of the backups (`user.name` / `user.email`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Identity {
    pub name: String,
    pub email: String,
}

impl Identity {
    /// Trimmed and checked: a name and an e-mail address that git accepts as they are.
    pub fn clean(&self) -> AppResult<Self> {
        let name = self.name.trim();
        let email = self.email.trim();
        let bad = |c: char| c.is_control() || matches!(c, '<' | '>');
        if name.is_empty() || name.chars().count() > 100 || name.chars().any(bad) {
            return Err(AppError::InvalidName {
                name: name.to_owned(),
                reason: "el nombre del autor debe tener entre 1 y 100 caracteres, sin < ni >",
            });
        }
        let parts: Vec<&str> = email.split('@').collect();
        if email.chars().count() > 200
            || email.starts_with('-')
            || email.chars().any(|c| bad(c) || c.is_whitespace())
            || parts.len() != 2
            || parts.iter().any(|p| p.is_empty())
        {
            return Err(AppError::InvalidName {
                name: email.to_owned(),
                reason: "el correo no es válido",
            });
        }
        Ok(Self {
            name: name.to_owned(),
            email: email.to_owned(),
        })
    }
}

/// Where the author comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum IdentitySource {
    /// `git config` (the repository's, or the user's global one).
    Git,
    /// Asked by LibreTeX once and kept in `settings.json`.
    Libretex,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupStatus {
    /// The project has its own repository (`<project>/.git`).
    pub enabled: bool,
    /// Not enabled, but the project is inside another repository (a folder with many
    /// projects, for instance): turning it on makes a separate one.
    pub inside_other_repo: bool,
    /// The current branch (`None` with a detached HEAD).
    pub branch: Option<String>,
    pub identity: Option<Identity>,
    pub identity_source: Option<IdentitySource>,
    /// URL of `origin`.
    pub remote: Option<String>,
    /// There is a remote branch to compare with (known since the last push or pull).
    pub tracking: bool,
    /// Backups not pushed yet, and remote commits not brought yet (as last fetched).
    pub ahead: usize,
    pub behind: usize,
    /// Files changed since the last backup.
    pub pending: usize,
    /// «Subir después de cada respaldo» (`backupPush` in `project.json`).
    pub push_after_backup: bool,
}

/// Lines LibreTeX makes sure the project's `.gitignore` has.
fn gitignore_lines() -> Vec<&'static str> {
    let mut lines = vec![".libretex/"];
    lines.extend(LATEX_OUTPUTS);
    lines
}

const GITIGNORE_HEADER: &str = "# LibreTeX: datos del editor y archivos que genera LaTeX";

/// Adds to `<root>/.gitignore` the lines it lacks (creating it if needed). Returns whether
/// it changed.
pub fn ensure_gitignore(root: &Path) -> AppResult<bool> {
    let path = root.join(".gitignore");
    let current = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(AppError::io(&path, e)),
    };
    let present: std::collections::HashSet<&str> = current.lines().map(str::trim).collect();
    let missing: Vec<&str> = gitignore_lines()
        .into_iter()
        // `/.libretex/` or `.libretex` also do.
        .filter(|l| {
            let bare = l.trim_end_matches('/');
            ![*l, bare, &format!("/{l}"), &format!("/{bare}")]
                .iter()
                .any(|v| present.contains(v))
        })
        .collect();
    if missing.is_empty() {
        return Ok(false);
    }
    let mut out = current.clone();
    if !out.is_empty() {
        if !out.ends_with('\n') {
            out.push('\n');
        }
        out.push('\n');
    }
    out.push_str(GITIGNORE_HEADER);
    out.push('\n');
    for line in missing {
        out.push_str(line);
        out.push('\n');
    }
    atomic_write(&path, out.as_bytes())?;
    Ok(true)
}

/// The project's own repository, if it has one (never a repository of a parent folder).
pub fn open(root: &Path) -> AppResult<Option<Repository>> {
    if root.join(".git").symlink_metadata().is_err() {
        return Ok(None);
    }
    let repo = Repository::open_ext(root, RepositoryOpenFlags::NO_SEARCH, &[] as &[&OsStr])
        .map_err(git_error)?;
    let same = repo
        .workdir()
        .and_then(|w| dunce::canonicalize(w).ok())
        .zip(dunce::canonicalize(root).ok())
        .is_some_and(|(w, r)| w == r);
    if !same {
        return Err(AppError::Forbidden(
            "el repositorio .git del proyecto tiene otra carpeta de trabajo".into(),
        ));
    }
    Ok(Some(repo))
}

fn require(root: &Path) -> AppResult<Repository> {
    open(root)?.ok_or_else(|| AppError::Forbidden("el respaldo con Git no está activado".into()))
}

/// The author from a `git config`, if complete.
fn config_identity(mut config: git2::Config) -> Option<Identity> {
    let config = config.snapshot().ok()?;
    let name = config.get_string("user.name").ok()?;
    let email = config.get_string("user.email").ok()?;
    Identity { name, email }.clean().ok()
}

fn git_identity(repo: &Repository) -> Option<Identity> {
    config_identity(repo.config().ok()?)
}

/// The author of new backups: `git config` (of `repo`, or the global one), else the one
/// LibreTeX asked for.
fn identity(
    repo: Option<&Repository>,
    fallback: Option<&Identity>,
) -> Option<(Identity, IdentitySource)> {
    match repo {
        Some(repo) => git_identity(repo),
        None => git2::Config::open_default().ok().and_then(config_identity),
    }
    .map(|i| (i, IdentitySource::Git))
    .or_else(|| {
        fallback
            .and_then(|i| i.clean().ok())
            .map(|i| (i, IdentitySource::Libretex))
    })
}

/// Turns the backup on: `git init` (branch `main`) if there is no repository (an existing one
/// is used as it is), the LaTeX `.gitignore`, and the author in the repository's config if
/// `git config` has none.
pub fn enable(root: &Path, author: Option<&Identity>) -> AppResult<()> {
    let repo = match open(root)? {
        Some(repo) => repo,
        None => {
            let mut options = RepositoryInitOptions::new();
            options.initial_head("main").no_reinit(true);
            Repository::init_opts(root, &options).map_err(git_error)?
        }
    };
    ensure_gitignore(root)?;
    if git_identity(&repo).is_none()
        && let Some(author) = author
    {
        let author = author.clean()?;
        let mut config = repo.config().map_err(git_error)?;
        let mut local = config
            .open_level(git2::ConfigLevel::Local)
            .map_err(git_error)?;
        local
            .set_str("user.name", &author.name)
            .map_err(git_error)?;
        local
            .set_str("user.email", &author.email)
            .map_err(git_error)?;
        drop(local);
        config.snapshot().map_err(git_error)?;
    }
    Ok(())
}

/// The current branch: its short name (also before the first commit), `None` if detached.
fn branch_name(repo: &Repository) -> Option<String> {
    let head = repo.find_reference("HEAD").ok()?;
    let target = head.symbolic_target().ok()??;
    target.strip_prefix("refs/heads/").map(str::to_owned)
}

/// The remote branch to compare with: the upstream of the current branch, or
/// `origin/<branch>`.
fn tracking_oid(repo: &Repository) -> Option<Oid> {
    let branch = branch_name(repo)?;
    let local = format!("refs/heads/{branch}");
    let upstream = repo
        .branch_upstream_name(&local)
        .ok()
        .and_then(|b| b.as_str().ok().map(str::to_owned))
        .unwrap_or_else(|| format!("refs/remotes/origin/{branch}"));
    repo.refname_to_id(&upstream).ok()
}

/// Commits reachable from `oid`.
fn count_commits(repo: &Repository, oid: Oid) -> AppResult<usize> {
    let mut walk = repo.revwalk().map_err(git_error)?;
    walk.push(oid).map_err(git_error)?;
    Ok(walk.count())
}

fn head_oid(repo: &Repository) -> Option<Oid> {
    repo.head().ok().and_then(|h| h.target())
}

/// Where the project's `origin` points ([`remote::repo_key`]), if it has one.
pub fn origin_key(root: &Path) -> Option<String> {
    let repo = open(root).ok()??;
    let remote = repo.find_remote("origin").ok()?;
    remote::repo_key(remote.url().ok()?)
}

/// Changes since the last backup.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pending {
    pub changes: Vec<FileChange>,
    /// Files too big to back up (they stay out).
    pub too_big: Vec<String>,
}

fn pending_in(repo: &Repository, root: &Path) -> AppResult<Pending> {
    let mut options = StatusOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false)
        .exclude_submodules(true);
    let statuses = repo.statuses(Some(&mut options)).map_err(git_error)?;
    let mut changes = Vec::new();
    let mut too_big = Vec::new();
    for entry in statuses.iter() {
        let Ok(path) = entry.path() else { continue };
        // Never backed up (see `gitops::stage_all`), even if no `.gitignore` says so.
        if path.split('/').next() == Some(crate::projects::meta::META_DIR) {
            continue;
        }
        let status = entry.status();
        let deleted = status.intersects(Status::WT_DELETED | Status::INDEX_DELETED)
            && !Path::new(path).exists();
        let kind = if deleted {
            ChangeKind::Deleted
        } else if status.intersects(Status::WT_NEW | Status::INDEX_NEW) {
            ChangeKind::Added
        } else if status.intersects(
            Status::WT_MODIFIED
                | Status::INDEX_MODIFIED
                | Status::WT_TYPECHANGE
                | Status::INDEX_TYPECHANGE
                | Status::WT_RENAMED
                | Status::INDEX_RENAMED,
        ) {
            ChangeKind::Modified
        } else {
            continue;
        };
        if kind != ChangeKind::Deleted && gitops::too_big(root, Path::new(path)) {
            too_big.push(path.to_owned());
            continue;
        }
        changes.push(FileChange {
            path: path.to_owned(),
            kind,
        });
    }
    changes.sort_by(|a, b| a.path.cmp(&b.path));
    too_big.sort();
    Ok(Pending { changes, too_big })
}

/// Files changed since the last backup.
pub fn pending(root: &Path) -> AppResult<Pending> {
    pending_in(&require(root)?, root)
}

/// Where the project's backup stands. `fallback` is the author LibreTeX asked for.
pub fn status(
    root: &Path,
    fallback: Option<&Identity>,
    push_after_backup: bool,
) -> AppResult<BackupStatus> {
    let Some(repo) = open(root)? else {
        let inside_other_repo = root
            .parent()
            .is_some_and(|parent| Repository::discover(parent).is_ok());
        let (identity, identity_source) = identity(None, fallback).unzip();
        return Ok(BackupStatus {
            enabled: false,
            inside_other_repo,
            branch: None,
            identity,
            identity_source,
            remote: None,
            tracking: false,
            ahead: 0,
            behind: 0,
            pending: 0,
            push_after_backup,
        });
    };
    let (identity, identity_source) = identity(Some(&repo), fallback).unzip();
    let remote = repo
        .find_remote("origin")
        .ok()
        .and_then(|r| r.url().ok().map(str::to_owned));
    let tracked = tracking_oid(&repo);
    let (ahead, behind) = match (head_oid(&repo), tracked) {
        (Some(head), Some(remote)) => repo.graph_ahead_behind(head, remote).unwrap_or((0, 0)),
        // Nothing pushed yet: every backup is ahead.
        (Some(_), None) => (list_in(&repo, None)?.len(), 0),
        _ => (0, 0),
    };
    Ok(BackupStatus {
        enabled: true,
        inside_other_repo: false,
        branch: branch_name(&repo),
        identity,
        identity_source,
        remote,
        tracking: tracked.is_some(),
        ahead,
        behind,
        pending: pending_in(&repo, root)?.changes.len(),
        push_after_backup,
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    /// Commit id (hex).
    pub id: String,
    /// The first line of its message.
    pub message: String,
    pub author: String,
    /// Milliseconds since the Unix epoch.
    pub time: i64,
    /// Already in the remote branch (`None`: there is none).
    pub pushed: Option<bool>,
}

fn list_in(repo: &Repository, tracked: Option<Oid>) -> AppResult<Vec<Backup>> {
    let Some(head) = head_oid(repo) else {
        return Ok(Vec::new());
    };
    // What the remote branch does not have.
    let unpushed: Option<std::collections::HashSet<Oid>> = match tracked {
        Some(remote) => {
            let mut walk = repo.revwalk().map_err(git_error)?;
            walk.push(head).map_err(git_error)?;
            walk.hide(remote).map_err(git_error)?;
            Some(walk.filter_map(Result::ok).collect())
        }
        None => None,
    };
    let mut walk = repo.revwalk().map_err(git_error)?;
    walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
        .map_err(git_error)?;
    walk.push(head).map_err(git_error)?;
    walk.take(MAX_LISTED)
        .map(|id| {
            let id = id.map_err(git_error)?;
            let commit = repo.find_commit(id).map_err(git_error)?;
            Ok(Backup {
                id: id.to_string(),
                message: commit.summary().ok().flatten().unwrap_or("").to_owned(),
                author: commit.author().name().unwrap_or("").to_owned(),
                time: commit.time().seconds() * 1000,
                pushed: unpushed.as_ref().map(|u| !u.contains(&id)),
            })
        })
        .collect()
}

/// The backups (commits of the current branch), newest first.
pub fn list(root: &Path) -> AppResult<Vec<Backup>> {
    let repo = require(root)?;
    let tracked = tracking_oid(&repo);
    list_in(&repo, tracked)
}

/// A backup message: trimmed, not empty, not too long.
pub fn clean_message(message: &str) -> AppResult<String> {
    let message = message.trim();
    if message.is_empty()
        || message.chars().count() > MAX_MESSAGE_CHARS
        || message.chars().any(|c| c.is_control() && c != '\n')
    {
        return Err(AppError::InvalidName {
            name: message.chars().take(40).collect(),
            reason: "el mensaje del respaldo debe tener entre 1 y 1000 caracteres",
        });
    }
    Ok(message.to_owned())
}

fn commit_all(
    repo: &Repository,
    root: &Path,
    message: &str,
    author: &Identity,
) -> AppResult<Option<Oid>> {
    let tree_id = gitops::stage_all(repo, root)?;
    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    if parent.as_ref().is_some_and(|p| p.tree_id() == tree_id) {
        return Ok(None);
    }
    let tree = repo.find_tree(tree_id).map_err(git_error)?;
    let signature = Signature::now(&author.name, &author.email).map_err(git_error)?;
    let parents: Vec<_> = parent.iter().collect();
    let id = repo
        .commit(
            Some("HEAD"),
            &signature,
            &signature,
            &format!("{message}\n"),
            &tree,
            &parents,
        )
        .map_err(git_error)?;
    Ok(Some(id))
}

fn author_of(repo: &Repository, fallback: Option<&Identity>) -> AppResult<Identity> {
    identity(Some(repo), fallback)
        .map(|(i, _)| i)
        .ok_or(AppError::NeedsIdentity)
}

/// Backs up the project as it is on disk, with `message`. `None` if nothing changed since
/// the last backup.
pub fn backup(
    root: &Path,
    message: &str,
    fallback: Option<&Identity>,
) -> AppResult<Option<Backup>> {
    let message = clean_message(message)?;
    let repo = require(root)?;
    let author = author_of(&repo, fallback)?;
    ensure_gitignore(root)?;
    let Some(id) = commit_all(&repo, root, &message, &author)? else {
        return Ok(None);
    };
    let tracked = tracking_oid(&repo);
    Ok(list_in(&repo, tracked)?
        .into_iter()
        .find(|b| b.id == id.to_string()))
}

/// What backup `id` changed, compared with the one before it.
pub fn changes(root: &Path, id: &str) -> AppResult<Vec<FileChange>> {
    gitops::changes_of(&require(root)?, id)
}

/// `path` as it was in backup `id`.
pub fn file_at(root: &Path, id: &str, path: &str) -> AppResult<VersionFile> {
    gitops::file_in(&require(root)?, id, path)
}

/// What is on disk now becomes a backup before restoring (if it changed), so nothing is lost.
fn keep_current(repo: &Repository, root: &Path, author: &Identity, what: &str) -> AppResult<()> {
    commit_all(repo, root, &format!("Antes de restaurar {what}"), author)?;
    Ok(())
}

/// Brings back `path` as it was in backup `id`.
pub fn restore_file(
    root: &Path,
    id: &str,
    path: &str,
    fallback: Option<&Identity>,
    trash: &dyn TrashBin,
) -> AppResult<()> {
    let repo = require(root)?;
    let author = author_of(&repo, fallback)?;
    gitops::restore_file_in(&repo, root, id, path, trash, || {
        keep_current(&repo, root, &author, &format!("«{path}»"))
    })
}

/// Brings the project back to backup `id`; returns the paths that changed. The restored
/// files show up as changes for the next backup (nothing is rewritten in the repository).
pub fn restore_project(
    root: &Path,
    id: &str,
    fallback: Option<&Identity>,
    trash: &dyn TrashBin,
) -> AppResult<Vec<String>> {
    let repo = require(root)?;
    let author = author_of(&repo, fallback)?;
    gitops::restore_tree_in(&repo, root, id, trash, || {
        keep_current(&repo, root, &author, "el proyecto")
    })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::projects::trash::fake::FakeTrash;
    use tempfile::TempDir;

    pub fn project(files: &[(&str, &str)]) -> TempDir {
        let dir = TempDir::new().unwrap();
        for (path, content) in files {
            let path = dir.path().join(path);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, content).unwrap();
        }
        dir
    }

    pub fn ana() -> Identity {
        Identity {
            name: "Ana".into(),
            email: "ana@users.noreply.github.com".into(),
        }
    }

    /// A repository whose author comes only from its own config (tests must not depend on
    /// the machine's `~/.gitconfig`).
    pub(crate) fn enabled(files: &[(&str, &str)]) -> TempDir {
        let dir = project(files);
        enable(dir.path(), None).unwrap();
        let repo = open(dir.path()).unwrap().unwrap();
        let mut config = repo
            .config()
            .unwrap()
            .open_level(git2::ConfigLevel::Local)
            .unwrap();
        config.set_str("user.name", "Ana").unwrap();
        config
            .set_str("user.email", "ana@users.noreply.github.com")
            .unwrap();
        dir
    }

    fn summary(changes: &[FileChange]) -> Vec<(&str, ChangeKind)> {
        changes.iter().map(|c| (c.path.as_str(), c.kind)).collect()
    }

    #[test]
    fn identidad_valida() {
        assert_eq!(
            Identity {
                name: "  Ana ".into(),
                email: " ana@x.cl ".into()
            }
            .clean()
            .unwrap(),
            Identity {
                name: "Ana".into(),
                email: "ana@x.cl".into()
            }
        );
        for (name, email) in [
            ("", "a@b"),
            ("A<b>", "a@b"),
            ("Ana", "sin-arroba"),
            ("Ana", "a@b@c"),
            ("Ana", "a b@c"),
            ("Ana", "-a@b"),
            ("Ana", "@b"),
        ] {
            let id = Identity {
                name: name.into(),
                email: email.into(),
            };
            assert!(id.clean().is_err(), "{name} {email}");
        }
    }

    #[test]
    fn sin_repositorio_no_esta_activado() {
        let dir = project(&[("main.tex", "x")]);
        let s = status(dir.path(), None, false).unwrap();
        assert!(!s.enabled);
        assert!(!dir.path().join(".git").exists());
        assert!(matches!(
            backup(dir.path(), "x", None),
            Err(AppError::Forbidden(_))
        ));
    }

    #[test]
    fn un_repositorio_de_la_carpeta_padre_no_se_usa() {
        let parent = TempDir::new().unwrap();
        Repository::init(parent.path()).unwrap();
        let root = parent.path().join("tesis");
        fs::create_dir(&root).unwrap();
        fs::write(root.join("main.tex"), "x").unwrap();
        let s = status(&root, None, false).unwrap();
        assert!(!s.enabled && s.inside_other_repo);
        // Turning it on makes the project's own repository.
        enable(&root, Some(&ana())).unwrap();
        assert!(root.join(".git").is_dir());
        assert!(status(&root, None, false).unwrap().enabled);
    }

    #[test]
    fn activar_crea_main_el_gitignore_y_guarda_el_autor() {
        let dir = project(&[("main.tex", "x")]);
        let root = dir.path();
        enable(root, Some(&ana())).unwrap();
        let repo = open(root).unwrap().unwrap();
        assert_eq!(branch_name(&repo).as_deref(), Some("main"));
        let ignore = fs::read_to_string(root.join(".gitignore")).unwrap();
        assert!(ignore.contains(".libretex/\n*.aux\n"), "{ignore}");
        let local = repo
            .config()
            .unwrap()
            .open_level(git2::ConfigLevel::Local)
            .unwrap();
        // Unless the machine's git config already has an author, LibreTeX's goes in.
        if git_identity(&repo).is_some_and(|i| i == ana()) {
            assert_eq!(local.get_string("user.email").unwrap(), ana().email);
        }
        // Enabling again changes nothing.
        enable(root, Some(&ana())).unwrap();
        assert_eq!(fs::read_to_string(root.join(".gitignore")).unwrap(), ignore);
    }

    #[test]
    fn un_repositorio_existente_se_usa_tal_cual() {
        let dir = project(&[("main.tex", "x"), (".gitignore", "datos/\n/.libretex\n")]);
        let root = dir.path();
        let repo = Repository::init(root).unwrap();
        let mut config = repo
            .config()
            .unwrap()
            .open_level(git2::ConfigLevel::Local)
            .unwrap();
        config.set_str("user.name", "Bea").unwrap();
        config.set_str("user.email", "bea@x.cl").unwrap();
        enable(root, Some(&ana())).unwrap();
        let ignore = fs::read_to_string(root.join(".gitignore")).unwrap();
        // The user's lines stay; `.libretex` was already there.
        assert!(
            ignore.starts_with("datos/\n/.libretex\n\n# LibreTeX"),
            "{ignore}"
        );
        assert_eq!(ignore.matches("libretex/").count(), 0, "{ignore}");
        let s = status(root, Some(&ana()), false).unwrap();
        assert_eq!(s.identity.unwrap().name, "Bea");
        assert_eq!(s.identity_source, Some(IdentitySource::Git));
    }

    #[test]
    fn respalda_lo_del_usuario_y_no_lo_generado() {
        let dir = enabled(&[
            ("main.tex", "hola"),
            ("cap/a.tex", "a"),
            ("main.aux", "x"),
            (".libretex/project.json", "{}"),
            (".libretex/build/main.pdf", "%PDF"),
        ]);
        let root = dir.path();
        assert_eq!(
            summary(&pending(root).unwrap().changes),
            [
                (".gitignore", ChangeKind::Added),
                ("cap/a.tex", ChangeKind::Added),
                ("main.tex", ChangeKind::Added)
            ]
        );
        let first = backup(root, " Primer respaldo ", None).unwrap().unwrap();
        assert_eq!(first.message, "Primer respaldo");
        assert_eq!(first.author, "Ana");
        assert_eq!(first.pushed, None);
        assert!(pending(root).unwrap().changes.is_empty());
        // Nothing changed: no empty backup.
        assert!(backup(root, "otro", None).unwrap().is_none());

        fs::write(root.join("main.tex"), "chao").unwrap();
        fs::remove_file(root.join("cap/a.tex")).unwrap();
        fs::write(root.join("b.tex"), "b").unwrap();
        assert_eq!(
            summary(&pending(root).unwrap().changes),
            [
                ("b.tex", ChangeKind::Added),
                ("cap/a.tex", ChangeKind::Deleted),
                ("main.tex", ChangeKind::Modified)
            ]
        );
        let second = backup(root, "Segundo", None).unwrap().unwrap();
        assert_eq!(
            summary(&changes(root, &second.id).unwrap()),
            [
                ("b.tex", ChangeKind::Added),
                ("cap/a.tex", ChangeKind::Deleted),
                ("main.tex", ChangeKind::Modified)
            ]
        );
        let names: Vec<_> = list(root).unwrap().into_iter().map(|b| b.message).collect();
        assert_eq!(names, ["Segundo", "Primer respaldo"]);
        assert_eq!(
            file_at(root, &first.id, "main.tex")
                .unwrap()
                .content
                .as_deref(),
            Some("hola")
        );
        let s = status(root, None, false).unwrap();
        assert_eq!((s.pending, s.ahead, s.tracking), (0, 2, false));
    }

    #[test]
    fn libretex_nunca_entra_aunque_lo_quiten_del_gitignore() {
        let dir = enabled(&[("main.tex", "x"), (".libretex/project.json", "{}")]);
        let root = dir.path();
        fs::write(root.join(".gitignore"), "").unwrap();
        let b = backup(root, "x", None).unwrap().unwrap();
        let files: Vec<_> = changes(root, &b.id)
            .unwrap()
            .into_iter()
            .map(|c| c.path)
            .collect();
        assert_eq!(files, [".gitignore", "main.tex"]);
        // And the line is back.
        assert!(
            fs::read_to_string(root.join(".gitignore"))
                .unwrap()
                .contains(".libretex/")
        );
    }

    #[test]
    fn archivos_enormes_quedan_fuera_y_se_avisan() {
        let dir = enabled(&[("main.tex", "x")]);
        let root = dir.path();
        let big = fs::File::create(root.join("video.mp4")).unwrap();
        big.set_len(gitops::MAX_FILE_BYTES + 1).unwrap();
        let p = pending(root).unwrap();
        assert_eq!(p.too_big, ["video.mp4"]);
        let b = backup(root, "x", None).unwrap().unwrap();
        assert!(
            changes(root, &b.id)
                .unwrap()
                .iter()
                .all(|c| c.path != "video.mp4")
        );
    }

    #[test]
    fn sin_autor_pide_uno_y_usa_el_de_libretex() {
        let dir = project(&[("main.tex", "x")]);
        let root = dir.path();
        enable(root, None).unwrap();
        let repo = open(root).unwrap().unwrap();
        if git_identity(&repo).is_none() {
            assert!(matches!(
                backup(root, "x", None),
                Err(AppError::NeedsIdentity)
            ));
        }
        let b = backup(root, "x", Some(&ana())).unwrap().unwrap();
        assert!(!b.author.is_empty());
    }

    #[test]
    fn restaurar_respalda_antes_lo_actual() {
        let dir = enabled(&[("main.tex", "uno"), ("cap/a.tex", "a")]);
        let root = dir.path();
        let trash_dir = TempDir::new().unwrap();
        let trash = FakeTrash::new(trash_dir.path().join("papelera"));
        let first = backup(root, "v1", None).unwrap().unwrap();
        fs::write(root.join("main.tex"), "dos").unwrap();
        fs::write(root.join("cap/b.tex"), "b").unwrap();
        backup(root, "v2", None).unwrap();
        fs::write(root.join("main.tex"), "tres sin respaldar").unwrap();

        restore_file(root, &first.id, "main.tex", None, &trash).unwrap();
        assert_eq!(fs::read_to_string(root.join("main.tex")).unwrap(), "uno");
        let kept = &list(root).unwrap()[0];
        assert_eq!(kept.message, "Antes de restaurar «main.tex»");
        assert_eq!(
            file_at(root, &kept.id, "main.tex")
                .unwrap()
                .content
                .as_deref(),
            Some("tres sin respaldar")
        );

        let changed = restore_project(root, &first.id, None, &trash).unwrap();
        // main.tex is «uno» already; cap/b.tex was added after v1.
        assert_eq!(changed, ["cap/b.tex"]);
        assert!(!root.join("cap/b.tex").exists());
        assert_eq!(fs::read_to_string(root.join("cap/a.tex")).unwrap(), "a");
        // Restored files are changes for the next backup; the repository keeps everything.
        assert_eq!(
            summary(&pending(root).unwrap().changes),
            [("cap/b.tex", ChangeKind::Deleted)]
        );
        assert_eq!(list(root).unwrap().len(), 4);
        for bad in ["../fuera.tex", ".git/config", ".libretex/project.json"] {
            assert!(
                restore_file(root, &first.id, bad, None, &trash).is_err(),
                "{bad}"
            );
        }
    }

    #[test]
    fn el_git_del_sistema_ve_lo_mismo() {
        let Some(git) = remote::tool("git") else {
            return;
        };
        let dir = enabled(&[("main.tex", "x"), ("main.aux", "y")]);
        let root = dir.path();
        backup(root, "uno", None).unwrap();
        let status = std::process::Command::new(&git)
            .args(["status", "--porcelain"])
            .current_dir(root)
            .output()
            .unwrap();
        assert!(status.status.success());
        assert_eq!(String::from_utf8_lossy(&status.stdout), "");
        let log = std::process::Command::new(&git)
            .args(["log", "--format=%s|%an"])
            .current_dir(root)
            .output()
            .unwrap();
        assert_eq!(String::from_utf8_lossy(&log.stdout), "uno|Ana\n");
    }

    /// `git` with a fixed author, in `dir` (for the «other clone» of the tests).
    fn git_in(dir: &Path, args: &[&str]) {
        let git = remote::tool("git").unwrap();
        let out = std::process::Command::new(git)
            .args(["-c", "user.name=Otra", "-c", "user.email=otra@x.cl"])
            .args(args)
            .current_dir(dir)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{args:?}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
    }

    /// A project backed up once, with a local bare repository as its `origin` (GitHub's
    /// stand-in: the URL check is for what the user types, not tested here).
    fn with_origin() -> (TempDir, TempDir) {
        let dir = enabled(&[("main.tex", "uno\n")]);
        let origin = TempDir::new().unwrap();
        let mut options = RepositoryInitOptions::new();
        options.bare(true).initial_head("main");
        Repository::init_opts(origin.path(), &options).unwrap();
        open(dir.path())
            .unwrap()
            .unwrap()
            .remote("origin", origin.path().to_str().unwrap())
            .unwrap();
        backup(dir.path(), "v1", None).unwrap().unwrap();
        (dir, origin)
    }

    #[test]
    fn subir_y_traer_cambios_de_otro_clon() {
        if remote::tool("git").is_none() {
            return;
        }
        let (dir, origin) = with_origin();
        let root = dir.path();
        let mut phases = Vec::new();
        remote::push(root, |_| {}, |p| phases.push(p.phase)).unwrap();
        let s = status(root, None, false).unwrap();
        assert_eq!((s.tracking, s.ahead, s.behind), (true, 0, 0));
        assert!(list(root).unwrap().iter().all(|b| b.pushed == Some(true)));

        // A change made in another clone.
        let other = TempDir::new().unwrap();
        git_in(
            other.path(),
            &["clone", "-q", origin.path().to_str().unwrap(), "c"],
        );
        let clone = other.path().join("c");
        fs::write(clone.join("main.tex"), "uno\ndos\n").unwrap();
        fs::write(clone.join("nuevo.tex"), "n").unwrap();
        git_in(&clone, &["add", "-A"]);
        git_in(&clone, &["commit", "-q", "-m", "desde otro clon"]);
        git_in(&clone, &["push", "-q", "origin", "main"]);

        remote::fetch(root, |_| {}, |_| {}).unwrap();
        assert_eq!(status(root, None, false).unwrap().behind, 1);
        let pulled = remote::fast_forward(root).unwrap();
        assert_eq!(pulled.commits, 1);
        assert_eq!(pulled.changed, ["main.tex", "nuevo.tex"]);
        // Git for Windows writes CRLF (`core.autocrlf` of its system config).
        assert_eq!(
            fs::read_to_string(root.join("main.tex"))
                .unwrap()
                .replace("\r\n", "\n"),
            "uno\ndos\n"
        );
        assert_eq!(list(root).unwrap()[0].message, "desde otro clon");
        assert!(pending(root).unwrap().changes.is_empty());
        // Nothing more to bring.
        assert_eq!(remote::fast_forward(root).unwrap().commits, 0);
    }

    #[test]
    fn si_ambos_lados_cambiaron_no_mezcla_nada() {
        if remote::tool("git").is_none() {
            return;
        }
        let (dir, origin) = with_origin();
        let root = dir.path();
        remote::push(root, |_| {}, |_| {}).unwrap();
        let other = TempDir::new().unwrap();
        git_in(
            other.path(),
            &["clone", "-q", origin.path().to_str().unwrap(), "c"],
        );
        let clone = other.path().join("c");
        fs::write(clone.join("main.tex"), "remoto\n").unwrap();
        git_in(&clone, &["commit", "-qam", "remoto"]);
        git_in(&clone, &["push", "-q", "origin", "main"]);

        fs::write(root.join("main.tex"), "local\n").unwrap();
        backup(root, "local", None).unwrap();
        // Pushing is refused…
        assert!(matches!(
            remote::push(root, |_| {}, |_| {}),
            Err(AppError::Diverged(_))
        ));
        // …and pulling explains it without touching anything.
        remote::fetch(root, |_| {}, |_| {}).unwrap();
        let s = status(root, None, false).unwrap();
        assert_eq!((s.ahead, s.behind), (1, 1));
        assert!(matches!(
            remote::fast_forward(root),
            Err(AppError::Diverged(_))
        ));
        assert_eq!(
            fs::read_to_string(root.join("main.tex")).unwrap(),
            "local\n"
        );
    }

    #[test]
    fn traer_no_pisa_cambios_sin_respaldar() {
        if remote::tool("git").is_none() {
            return;
        }
        let (dir, origin) = with_origin();
        let root = dir.path();
        remote::push(root, |_| {}, |_| {}).unwrap();
        let other = TempDir::new().unwrap();
        git_in(
            other.path(),
            &["clone", "-q", origin.path().to_str().unwrap(), "c"],
        );
        let clone = other.path().join("c");
        fs::write(clone.join("main.tex"), "remoto\n").unwrap();
        git_in(&clone, &["commit", "-qam", "remoto"]);
        git_in(&clone, &["push", "-q", "origin", "main"]);

        fs::write(root.join("main.tex"), "sin respaldar\n").unwrap();
        remote::fetch(root, |_| {}, |_| {}).unwrap();
        assert!(matches!(
            remote::fast_forward(root),
            Err(AppError::LocalChanges(_))
        ));
        assert_eq!(
            fs::read_to_string(root.join("main.tex")).unwrap(),
            "sin respaldar\n"
        );
    }

    #[test]
    fn conectar_valida_la_direccion() {
        let dir = enabled(&[("main.tex", "x")]);
        let root = dir.path();
        assert!(remote::connect_url(root, "file:///tmp/x").is_err());
        remote::connect_url(root, "https://github.com/ana/tesis.git").unwrap();
        remote::connect_url(root, "git@github.com:ana/tesis.git").unwrap();
        assert_eq!(
            status(root, None, false).unwrap().remote.as_deref(),
            Some("git@github.com:ana/tesis.git")
        );
        // Without backups there is nothing to push (and no network is used).
        assert!(matches!(
            remote::push(root, |_| {}, |_| {}),
            Err(AppError::Forbidden(_))
        ));
    }
}
