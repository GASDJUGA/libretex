//! Exporting the project (5.7): the compiled PDF and a ZIP of the sources, saved where the
//! user picks in a native dialog (the webview never sends a path).

use crate::commands::compile::built_pdf;
use crate::commands::projects::with_ctx;
use crate::error::{AppError, AppResult};
use crate::projects::export;
use crate::state::AppState;
use std::path::PathBuf;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

/// Native «save as» dialog; `None` if cancelled.
async fn ask_destination(
    app: AppHandle,
    title: String,
    file_name: String,
    filter: (&'static str, &'static str),
) -> AppResult<Option<PathBuf>> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title(title)
            .set_file_name(file_name)
            .add_filter(filter.0, &[filter.1])
            .blocking_save_file()
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?;
    picked
        .map(|p| p.into_path().map_err(|e| AppError::Other(e.to_string())))
        .transpose()
}

/// Where it was saved, shown with `~`.
fn shown(state: &State<'_, AppState>, path: &std::path::Path) -> String {
    state.ctx().display(path)
}

/// Saves a copy of the compiled PDF; returns where (or `None` if cancelled).
#[tauri::command]
pub async fn export_pdf(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    title: String,
) -> AppResult<Option<String>> {
    let (root, pdf) = built_pdf(&state, id).await?;
    let name = root.file_name().map_or_else(
        || "documento".to_owned(),
        |n| n.to_string_lossy().into_owned(),
    );
    let Some(dest) = ask_destination(app, title, format!("{name}.pdf"), ("PDF", "pdf")).await?
    else {
        return Ok(None);
    };
    let to = dest.clone();
    tauri::async_runtime::spawn_blocking(move || export::copy_pdf(&pdf, &to))
        .await
        .map_err(|e| AppError::Other(e.to_string()))??;
    Ok(Some(shown(&state, &dest)))
}

/// Saves a ZIP of the project's sources (importable in Overleaf); returns where.
#[tauri::command]
pub async fn export_zip(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    title: String,
) -> AppResult<Option<String>> {
    let root = with_ctx(&state, move |ctx| ctx.path_of(&id)).await?;
    let name = root.file_name().map_or_else(
        || "proyecto".to_owned(),
        |n| n.to_string_lossy().into_owned(),
    );
    let Some(dest) = ask_destination(app, title, format!("{name}.zip"), ("ZIP", "zip")).await?
    else {
        return Ok(None);
    };
    if dest.starts_with(&root) {
        // A ZIP inside the project would end up inside the next ZIP.
        return Err(AppError::Forbidden(
            "el ZIP dentro del propio proyecto".into(),
        ));
    }
    let to = dest.clone();
    tauri::async_runtime::spawn_blocking(move || export::zip_sources(&root, &to))
        .await
        .map_err(|e| AppError::Other(e.to_string()))??;
    Ok(Some(shown(&state, &dest)))
}
