//! Tauri commands about the TeX distribution.

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::tex::detect::{self, TexStatus};
use tauri::State;

/// TeX tools found (cached; `refresh` detects them again).
#[tauri::command]
pub async fn tex_status(state: State<'_, AppState>, refresh: bool) -> AppResult<TexStatus> {
    if !refresh
        && let Some(cached) = state
            .tex_status
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    {
        return Ok(cached);
    }
    let path = state.tex_path.clone();
    let status = tauri::async_runtime::spawn_blocking(move || detect::detect(&path))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;
    *state.tex_status.lock().unwrap_or_else(|p| p.into_inner()) = Some(status.clone());
    Ok(status)
}
