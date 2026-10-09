//! Tauri commands for a project's files. Paths are relative to the project root and are
//! validated in `files` / `util::paths`.

use crate::commands::projects::with_ctx;
use crate::error::{AppError, AppResult};
use crate::files::{self, FileNode, TextFile};
use crate::state::AppState;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn list_tree(state: State<'_, AppState>, id: String) -> AppResult<Vec<FileNode>> {
    with_ctx(&state, move |ctx| files::list_tree(&ctx.path_of(&id)?)).await
}

#[tauri::command]
pub async fn read_text_file(
    state: State<'_, AppState>,
    id: String,
    path: String,
) -> AppResult<TextFile> {
    with_ctx(&state, move |ctx| {
        files::read_text(&ctx.path_of(&id)?, &path)
    })
    .await
}

/// Saves a text file atomically; returns its new modification time (ms).
#[tauri::command]
pub async fn write_text_file(
    state: State<'_, AppState>,
    id: String,
    path: String,
    content: String,
) -> AppResult<u64> {
    with_ctx(&state, move |ctx| {
        files::write_text(&ctx.path_of(&id)?, &path, &content)
    })
    .await
}

#[tauri::command]
pub async fn create_file(state: State<'_, AppState>, id: String, path: String) -> AppResult<()> {
    with_ctx(&state, move |ctx| {
        files::create_file(&ctx.path_of(&id)?, &path, "")
    })
    .await
}

#[tauri::command]
pub async fn create_folder(state: State<'_, AppState>, id: String, path: String) -> AppResult<()> {
    with_ctx(&state, move |ctx| {
        files::create_folder(&ctx.path_of(&id)?, &path)
    })
    .await
}

#[tauri::command]
pub async fn rename_entry(
    state: State<'_, AppState>,
    id: String,
    path: String,
    new_name: String,
) -> AppResult<String> {
    with_ctx(&state, move |ctx| {
        files::rename(&ctx.path_of(&id)?, &path, &new_name)
    })
    .await
}

#[tauri::command]
pub async fn move_entry(
    state: State<'_, AppState>,
    id: String,
    path: String,
    dest_folder: String,
) -> AppResult<String> {
    with_ctx(&state, move |ctx| {
        files::move_entry(&ctx.path_of(&id)?, &path, &dest_folder)
    })
    .await
}

#[tauri::command]
pub async fn duplicate_entry(
    state: State<'_, AppState>,
    id: String,
    path: String,
) -> AppResult<String> {
    with_ctx(&state, move |ctx| {
        files::duplicate(&ctx.path_of(&id)?, &path)
    })
    .await
}

/// Sends a file or folder to the system trash.
#[tauri::command]
pub async fn delete_entry(state: State<'_, AppState>, id: String, path: String) -> AppResult<()> {
    with_ctx(&state, move |ctx| {
        files::delete(&ctx.path_of(&id)?, &path, ctx.trash.as_ref())
    })
    .await
}

/// Shows the native file picker and copies the chosen files into `folder`. Returns the new
/// relative paths (empty if cancelled).
#[tauri::command]
pub async fn upload_files_dialog(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    folder: String,
    title: String,
) -> AppResult<Vec<String>> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().set_title(title).blocking_pick_files()
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?;
    let Some(picked) = picked else {
        return Ok(Vec::new());
    };
    let sources = picked
        .into_iter()
        .map(|p| p.into_path().map_err(|e| AppError::Other(e.to_string())))
        .collect::<AppResult<Vec<_>>>()?;
    with_ctx(&state, move |ctx| {
        files::import(&ctx.path_of(&id)?, &folder, &sources)
    })
    .await
}
