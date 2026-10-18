//! Backup with Git and GitHub (5.9, see `crate::backup`).

use crate::backup::{self, Backup, BackupStatus, Identity, Pending, remote};
use crate::error::{AppError, AppResult};
use crate::gitops::{FileChange, VersionFile};
use crate::projects::meta::read_meta;
use crate::state::AppState;
use std::path::{Path, PathBuf};
use tauri::State;

/// The author LibreTeX asked for (`gitName`/`gitEmail` in `settings.json`), if any.
fn saved_identity(state: &AppState) -> Option<Identity> {
    crate::settings::load(&state.settings_file)
        .ok()
        .and_then(|s| s.git_identity())
}

/// Runs a backup operation off the main thread, one at a time; `f` gets the project root
/// and the saved author.
async fn with_backup<T, F>(state: &State<'_, AppState>, id: &str, f: F) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce(&Path, Option<&Identity>) -> AppResult<T> + Send + 'static,
{
    let root: PathBuf = state.ctx().path_of(id)?;
    let author = saved_identity(state);
    let lock = state.backup_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().unwrap_or_else(|p| p.into_inner());
        f(&root, author.as_ref())
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

fn status_of(root: &Path, author: Option<&Identity>) -> AppResult<BackupStatus> {
    let push = read_meta(root)?.is_some_and(|m| m.backup_push);
    backup::status(root, author, push)
}

/// Where the project's backup stands (no network: remote counts as last fetched).
#[tauri::command]
pub async fn backup_status(state: State<'_, AppState>, id: String) -> AppResult<BackupStatus> {
    with_backup(&state, &id, status_of).await
}

/// Turns the backup on (`git init` if needed, `.gitignore`, author). `author` is asked only
/// when `git config` has none; it is kept in `settings.json` for the next projects.
#[tauri::command]
pub async fn backup_enable(
    state: State<'_, AppState>,
    id: String,
    author: Option<Identity>,
) -> AppResult<BackupStatus> {
    let author = author.map(|a| a.clean()).transpose()?;
    if let Some(author) = &author {
        let _guard = state
            .settings_lock
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let changes = serde_json::json!({ "gitName": author.name, "gitEmail": author.email });
        crate::settings::update(
            &state.settings_file,
            changes.as_object().expect("objeto JSON"),
        )?;
    }
    with_backup(&state, &id, move |root, saved| {
        backup::enable(root, author.as_ref().or(saved))?;
        status_of(root, author.as_ref().or(saved))
    })
    .await
}

/// The signed-in GitHub account as a backup author, with its private *noreply* address
/// (uses the network: only when the user asks for it).
#[tauri::command]
pub async fn github_identity() -> AppResult<Identity> {
    tauri::async_runtime::spawn_blocking(remote::github_identity)
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

/// Files changed since the last backup.
#[tauri::command]
pub async fn backup_pending(state: State<'_, AppState>, id: String) -> AppResult<Pending> {
    with_backup(&state, &id, |root, _| backup::pending(root)).await
}

/// Backs up the project with `message`; `None` if nothing changed.
#[tauri::command]
pub async fn backup_create(
    state: State<'_, AppState>,
    id: String,
    message: String,
) -> AppResult<Option<Backup>> {
    with_backup(&state, &id, move |root, author| {
        backup::backup(root, &message, author)
    })
    .await
}

/// The backups, newest first.
#[tauri::command]
pub async fn backup_list(state: State<'_, AppState>, id: String) -> AppResult<Vec<Backup>> {
    with_backup(&state, &id, |root, _| backup::list(root)).await
}

/// What backup `version` changed.
#[tauri::command]
pub async fn backup_changes(
    state: State<'_, AppState>,
    id: String,
    version: String,
) -> AppResult<Vec<FileChange>> {
    with_backup(&state, &id, move |root, _| backup::changes(root, &version)).await
}

/// A file as it was in a backup.
#[tauri::command]
pub async fn backup_file(
    state: State<'_, AppState>,
    id: String,
    version: String,
    path: String,
) -> AppResult<VersionFile> {
    with_backup(&state, &id, move |root, _| {
        backup::file_at(root, &version, &path)
    })
    .await
}

/// Brings back one file from a backup (what is there now is backed up first).
#[tauri::command]
pub async fn backup_restore_file(
    state: State<'_, AppState>,
    id: String,
    version: String,
    path: String,
) -> AppResult<()> {
    let trash = state.ctx().trash.clone();
    with_backup(&state, &id, move |root, author| {
        backup::restore_file(root, &version, &path, author, trash.as_ref())
    })
    .await
}

/// Brings the project back to a backup; returns the paths that changed.
#[tauri::command]
pub async fn backup_restore(
    state: State<'_, AppState>,
    id: String,
    version: String,
) -> AppResult<Vec<String>> {
    let trash = state.ctx().trash.clone();
    with_backup(&state, &id, move |root, author| {
        backup::restore_project(root, &version, author, trash.as_ref())
    })
    .await
}
