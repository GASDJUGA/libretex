//! What the local history (`crate::history`, `.jutex/history.git`) and the backup with
//! Git (`crate::backup`, the project's own `.git`) do alike: record the project as it is on
//! disk, tell what a commit changed, read a file as it was, and bring files back.

use crate::error::{AppError, AppResult};
use crate::projects::meta::is_meta_dir;
use crate::projects::trash::TrashBin;
use crate::util::fs::atomic_write;
use git2::{IndexAddOption, Oid, Repository};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

/// Files bigger than this are not recorded (GitHub refuses files over 100 MB).
pub const MAX_FILE_BYTES: u64 = 50 * 1024 * 1024;

/// What LaTeX writes next to the sources: never recorded.
pub const LATEX_OUTPUTS: [&str; 22] = [
    "*.aux",
    "*.log",
    "*.out",
    "*.toc",
    "*.lof",
    "*.lot",
    "*.fls",
    "*.fdb_latexmk",
    "*.synctex.gz",
    "*.synctex",
    "*.bbl",
    "*.blg",
    "*.bcf",
    "*.run.xml",
    "*.xdv",
    "*.dvi",
    "*.nav",
    "*.snm",
    "*.idx",
    "*.ind",
    "*.ilg",
    "*~",
];

pub fn git_error(e: git2::Error) -> AppError {
    AppError::Other(format!("git: {}", e.message()))
}

/// How a file changed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeKind {
    Added,
    Modified,
    Deleted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FileChange {
    pub path: String,
    pub kind: ChangeKind,
}

/// A file as it was in a commit: its text, or `binary` if it is not text (images…).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionFile {
    /// `None` if the file did not exist in that commit.
    pub content: Option<String>,
    pub binary: bool,
}

pub fn commit_of<'r>(repo: &'r Repository, id: &str) -> AppResult<git2::Commit<'r>> {
    let oid = Oid::from_str(id).map_err(|_| AppError::NotFound(PathBuf::from(id)))?;
    repo.find_commit(oid)
        .map_err(|_| AppError::NotFound(PathBuf::from(id)))
}

/// Whether `rel` (relative to the root) is too big to record.
pub fn too_big(root: &Path, rel: &Path) -> bool {
    fs::metadata(root.join(rel)).is_ok_and(|m| m.len() > MAX_FILE_BYTES)
}

/// Puts the work tree in the index (new, changed and deleted files; what is ignored,
/// `.jutex/` and files over [`MAX_FILE_BYTES`] stay out) and returns the tree to commit.
pub fn stage_all(repo: &Repository, root: &Path) -> AppResult<Oid> {
    let mut index = repo.index().map_err(git_error)?;
    // JuTeX's folder never goes in, whatever a `.gitignore` says.
    let mut skip = |path: &Path, _: &[u8]| -> i32 {
        let private = path
            .components()
            .next()
            .is_some_and(|c| is_meta_dir(c.as_os_str()));
        i32::from(private || too_big(root, path))
    };
    index
        .add_all(["*"], IndexAddOption::DEFAULT, Some(&mut skip))
        .map_err(git_error)?;
    // Files deleted since the last commit.
    index.update_all(["*"], None).map_err(git_error)?;
    index.write().map_err(git_error)?;
    index.write_tree().map_err(git_error)
}

fn slash_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

/// What commit `id` changed, compared with its first parent (sorted by path).
pub fn changes_of(repo: &Repository, id: &str) -> AppResult<Vec<FileChange>> {
    let commit = commit_of(repo, id)?;
    let tree = commit.tree().map_err(git_error)?;
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)
        .map_err(git_error)?;
    let mut out: Vec<FileChange> = diff
        .deltas()
        .filter_map(|delta| {
            let kind = match delta.status() {
                git2::Delta::Added => ChangeKind::Added,
                git2::Delta::Deleted => ChangeKind::Deleted,
                git2::Delta::Modified | git2::Delta::Typechange => ChangeKind::Modified,
                _ => return None,
            };
            let file = if kind == ChangeKind::Deleted {
                delta.old_file()
            } else {
                delta.new_file()
            };
            Some(FileChange {
                path: slash_path(file.path()?),
                kind,
            })
        })
        .collect();
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

fn blob_at(repo: &Repository, tree: &git2::Tree, path: &str) -> AppResult<Option<Vec<u8>>> {
    let Ok(entry) = tree.get_path(Path::new(path)) else {
        return Ok(None);
    };
    let blob = repo.find_blob(entry.id()).map_err(git_error)?;
    Ok(Some(blob.content().to_vec()))
}

/// `path` as it was in commit `id`.
pub fn file_in(repo: &Repository, id: &str, path: &str) -> AppResult<VersionFile> {
    let tree = commit_of(repo, id)?.tree().map_err(git_error)?;
    Ok(match blob_at(repo, &tree, path)? {
        None => VersionFile {
            content: None,
            binary: false,
        },
        Some(bytes) => match String::from_utf8(bytes) {
            Ok(text) if !text.contains('\0') => VersionFile {
                content: Some(text.trim_start_matches('\u{feff}').to_owned()),
                binary: false,
            },
            _ => VersionFile {
                content: None,
                binary: true,
            },
        },
    })
}

/// A path of the project that may be written back: inside the root, not JuTeX's data
/// nor a git directory.
pub fn writable(root: &Path, rel: &str) -> AppResult<PathBuf> {
    let first = Path::new(rel).components().next();
    if matches!(first, Some(std::path::Component::Normal(c)) if is_meta_dir(c) || c == ".git") {
        return Err(AppError::Forbidden(rel.to_owned()));
    }
    crate::util::paths::resolve_new(root, rel)
}

/// Puts `content` (or nothing: the file goes to the trash) at `rel`.
fn put(root: &Path, rel: &str, content: Option<&[u8]>, trash: &dyn TrashBin) -> AppResult<()> {
    let path = writable(root, rel)?;
    match content {
        Some(bytes) => {
            if let Some(dir) = path.parent() {
                fs::create_dir_all(dir).map_err(|e| AppError::io(dir, e))?;
            }
            atomic_write(&path, bytes)
        }
        None if path.symlink_metadata().is_ok() => trash.delete(&path),
        None => Ok(()),
    }
}

/// Brings back `path` as it was in commit `id` (to the trash if it did not exist then).
/// `keep` records what is there now first, so nothing is lost.
pub fn restore_file_in(
    repo: &Repository,
    root: &Path,
    id: &str,
    path: &str,
    trash: &dyn TrashBin,
    keep: impl FnOnce() -> AppResult<()>,
) -> AppResult<()> {
    let tree = commit_of(repo, id)?.tree().map_err(git_error)?;
    let content = blob_at(repo, &tree, path)?;
    writable(root, path)?;
    keep()?;
    put(root, path, content.as_deref(), trash)
}

/// Brings the whole project back to commit `id`: its files as they were, and the files
/// recorded since to the trash. Files never recorded (ignored ones, LaTeX's outputs) are
/// left alone. `keep` must leave HEAD equal to what is on disk. Returns the changed paths.
pub fn restore_tree_in(
    repo: &Repository,
    root: &Path,
    id: &str,
    trash: &dyn TrashBin,
    keep: impl FnOnce() -> AppResult<()>,
) -> AppResult<Vec<String>> {
    let target = commit_of(repo, id)?.tree().map_err(git_error)?;
    keep()?;
    let head = repo
        .head()
        .and_then(|h| h.peel_to_tree())
        .map_err(git_error)?;
    let diff = repo
        .diff_tree_to_tree(Some(&head), Some(&target), None)
        .map_err(git_error)?;
    let mut changed = Vec::new();
    for delta in diff.deltas() {
        let (path, content) = match delta.status() {
            git2::Delta::Deleted => (delta.old_file().path(), None),
            _ => (
                delta.new_file().path(),
                Some(
                    repo.find_blob(delta.new_file().id())
                        .map_err(git_error)?
                        .content()
                        .to_vec(),
                ),
            ),
        };
        let Some(rel) = path.map(slash_path) else {
            continue;
        };
        put(root, &rel, content.as_deref(), trash)?;
        changed.push(rel);
    }
    changed.sort();
    Ok(changed)
}

/// The paths of a tree that changed between two commits (`from` `None`: everything in `to`).
pub fn changed_between(repo: &Repository, from: Option<Oid>, to: Oid) -> AppResult<Vec<String>> {
    let tree_of = |id: Oid| repo.find_commit(id).and_then(|c| c.tree());
    let old = from.map(tree_of).transpose().map_err(git_error)?;
    let new = tree_of(to).map_err(git_error)?;
    let diff = repo
        .diff_tree_to_tree(old.as_ref(), Some(&new), None)
        .map_err(git_error)?;
    let mut paths: Vec<String> = diff
        .deltas()
        .filter_map(|d| d.new_file().path().or(d.old_file().path()).map(slash_path))
        .collect();
    paths.sort();
    paths.dedup();
    Ok(paths)
}
