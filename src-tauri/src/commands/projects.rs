//! Tauri commands for the home screen. They are thin wrappers over `projects::ops`; file
//! system work runs on the blocking thread pool so the UI never freezes.

use crate::error::{AppError, AppResult};
use crate::projects::ops::{Ctx, OpenFolderResult, ProjectSummary, TrashedProject};
use crate::projects::templates::TemplateInfo;
use crate::state::AppState;
use std::path::PathBuf;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// Runs `f` with the context on the blocking pool, holding the registry lock.
pub(crate) async fn with_ctx<T, F>(state: &State<'_, AppState>, f: F) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce(&Ctx) -> AppResult<T> + Send + 'static,
{
    let ctx = state.ctx();
    let lock = state.registry_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        f(&ctx)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> AppResult<Vec<ProjectSummary>> {
    with_ctx(&state, |ctx| ctx.list()).await
}

#[tauri::command]
pub async fn list_templates(state: State<'_, AppState>) -> AppResult<Vec<TemplateInfo>> {
    with_ctx(&state, |ctx| ctx.templates()).await
}

#[tauri::command]
pub async fn create_project(
    state: State<'_, AppState>,
    name: String,
    template: Option<String>,
) -> AppResult<ProjectSummary> {
    with_ctx(&state, move |ctx| ctx.create(&name, template.as_deref())).await
}

/// Shows the native folder picker and registers the chosen folder. `None` if cancelled.
#[tauri::command]
pub async fn open_folder_dialog(
    app: AppHandle,
    state: State<'_, AppState>,
    title: String,
) -> AppResult<Option<OpenFolderResult>> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().set_title(title).blocking_pick_folder()
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?;
    let Some(folder) = picked else {
        return Ok(None);
    };
    let folder = into_path(folder)?;
    with_ctx(&state, move |ctx| ctx.open_folder(&folder))
        .await
        .map(Some)
}

/// Shows the native file picker for a ZIP and imports it. `None` if cancelled.
#[tauri::command]
pub async fn import_zip_dialog(
    app: AppHandle,
    state: State<'_, AppState>,
    title: String,
    filter_name: String,
) -> AppResult<Option<OpenFolderResult>> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title(title)
            .add_filter(filter_name, &["zip"])
            .blocking_pick_file()
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?;
    let Some(file) = picked else { return Ok(None) };
    let file = into_path(file)?;
    with_ctx(&state, move |ctx| ctx.import_zip(&file))
        .await
        .map(Some)
}

#[tauri::command]
pub async fn set_main_file(
    state: State<'_, AppState>,
    id: String,
    path: String,
) -> AppResult<ProjectSummary> {
    with_ctx(&state, move |ctx| ctx.set_main_file(&id, &path)).await
}

/// The user trusts the project to run programs when compiling (shell escape, its
/// `.latexmkrc`), after the warning shown by the frontend.
#[tauri::command]
pub async fn trust_project(state: State<'_, AppState>, id: String) -> AppResult<ProjectSummary> {
    with_ctx(&state, move |ctx| ctx.trust(&id)).await
}

#[tauri::command]
pub async fn open_project(state: State<'_, AppState>, id: String) -> AppResult<ProjectSummary> {
    with_ctx(&state, move |ctx| ctx.open(&id)).await
}

/// Changes the project's compiler and/or spelling language (project.json).
#[tauri::command]
pub async fn update_project_meta(
    state: State<'_, AppState>,
    id: String,
    compiler: Option<crate::projects::meta::Compiler>,
    spell_lang: Option<String>,
    figures_dir: Option<String>,
) -> AppResult<ProjectSummary> {
    let changes = crate::projects::ops::MetaChanges {
        compiler,
        spell_lang,
        figures_dir,
    };
    with_ctx(&state, move |ctx| ctx.update_meta(&id, changes)).await
}

#[tauri::command]
pub async fn rename_project(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> AppResult<ProjectSummary> {
    with_ctx(&state, move |ctx| ctx.rename(&id, &name)).await
}

#[tauri::command]
pub async fn duplicate_project(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<ProjectSummary> {
    with_ctx(&state, move |ctx| ctx.duplicate(&id)).await
}

#[tauri::command]
pub async fn trash_project(state: State<'_, AppState>, id: String) -> AppResult<()> {
    with_ctx(&state, move |ctx| ctx.trash(&id)).await
}

#[tauri::command]
pub async fn forget_project(state: State<'_, AppState>, id: String) -> AppResult<()> {
    with_ctx(&state, move |ctx| ctx.forget(&id)).await
}

#[tauri::command]
pub async fn list_trashed(state: State<'_, AppState>) -> AppResult<Vec<TrashedProject>> {
    with_ctx(&state, |ctx| ctx.list_trashed()).await
}

#[tauri::command]
pub async fn restore_trashed(
    state: State<'_, AppState>,
    trash_id: String,
) -> AppResult<ProjectSummary> {
    with_ctx(&state, move |ctx| ctx.restore_trashed(&trash_id)).await
}

/// Permanently deletes a project that JuTeX sent to the trash.
#[tauri::command]
pub async fn purge_trashed(state: State<'_, AppState>, trash_id: String) -> AppResult<()> {
    with_ctx(&state, move |ctx| ctx.purge_trashed(&trash_id)).await
}

/// Opens the system file manager with the project folder selected.
#[tauri::command]
pub async fn reveal_project(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    let path = with_ctx(&state, move |ctx| ctx.path_of(&id)).await?;
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| AppError::Other(e.to_string()))
}

fn into_path(picked: tauri_plugin_dialog::FilePath) -> AppResult<PathBuf> {
    picked
        .into_path()
        .map_err(|e| AppError::Other(e.to_string()))
}
