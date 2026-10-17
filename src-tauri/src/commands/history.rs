//! The project's version history (5.7, see `crate::history`).

use crate::error::{AppError, AppResult};
use crate::history::{self, FileChange, Version, VersionFile, VersionKind};
use crate::state::AppState;
use std::path::{Path, PathBuf};
use tauri::State;

/// Runs a history operation off the main thread, one at a time.
async fn with_history<T, F>(state: &State<'_, AppState>, id: &str, f: F) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce(&Path) -> AppResult<T> + Send + 'static,
{
    let root: PathBuf = state.ctx().path_of(id)?;
    let lock = state.history_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().unwrap_or_else(|p| p.into_inner());
        f(&root)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

/// Records a version: `manual` with a name («Guardar versión»), or `auto` (only if something
/// changed; `None` otherwise). Versions after compiling are recorded by the backend.
#[tauri::command]
pub async fn history_snapshot(
    state: State<'_, AppState>,
    id: String,
    kind: VersionKind,
    name: Option<String>,
) -> AppResult<Option<Version>> {
    if kind == VersionKind::Compile {
        return Err(AppError::Forbidden("versión de compilación".into()));
    }
    with_history(&state, &id, move |root| {
        history::snapshot(root, kind, name.as_deref())
    })
    .await
}

/// The project's versions, newest first.
#[tauri::command]
pub async fn history_list(state: State<'_, AppState>, id: String) -> AppResult<Vec<Version>> {
    with_history(&state, &id, history::list).await
}

/// What version `version` changed, compared with the one before it.
#[tauri::command]
pub async fn history_changes(
    state: State<'_, AppState>,
    id: String,
    version: String,
) -> AppResult<Vec<FileChange>> {
    with_history(&state, &id, move |root| history::changes(root, &version)).await
}

/// A file as it was in a version.
#[tauri::command]
pub async fn history_file(
    state: State<'_, AppState>,
    id: String,
    version: String,
    path: String,
) -> AppResult<VersionFile> {
    with_history(&state, &id, move |root| {
        history::file_at(root, &version, &path)
    })
    .await
}

/// Brings back one file as it was in a version (what is there now is kept as a version).
#[tauri::command]
pub async fn history_restore_file(
    state: State<'_, AppState>,
    id: String,
    version: String,
    path: String,
) -> AppResult<()> {
    let trash = state.ctx().trash.clone();
    with_history(&state, &id, move |root| {
        history::restore_file(root, &version, &path, trash.as_ref())
    })
    .await
}

/// Brings the project back to a version; returns the paths that changed.
#[tauri::command]
pub async fn history_restore(
    state: State<'_, AppState>,
    id: String,
    version: String,
) -> AppResult<Vec<String>> {
    let trash = state.ctx().trash.clone();
    with_history(&state, &id, move |root| {
        history::restore_project(root, &version, trash.as_ref())
    })
    .await
}
