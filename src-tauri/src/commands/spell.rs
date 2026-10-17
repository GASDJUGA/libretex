//! The personal dictionary of the spell checker (see `crate::spell`).

use crate::error::{AppError, AppResult};
use crate::spell;
use crate::state::AppState;
use std::path::PathBuf;
use tauri::State;

/// Runs a dictionary operation off the main thread, one at a time.
async fn with_dictionary<F>(state: &State<'_, AppState>, f: F) -> AppResult<Vec<String>>
where
    F: FnOnce(&std::path::Path) -> AppResult<Vec<String>> + Send + 'static,
{
    let path: PathBuf = state.dictionary_file.clone();
    let lock = state.dictionary_lock.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().unwrap_or_else(|p| p.into_inner());
        f(&path)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn personal_dictionary(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    with_dictionary(&state, spell::read_words).await
}

#[tauri::command]
pub async fn add_to_dictionary(state: State<'_, AppState>, word: String) -> AppResult<Vec<String>> {
    with_dictionary(&state, move |path| spell::add_word(path, &word)).await
}

#[tauri::command]
pub async fn remove_from_dictionary(
    state: State<'_, AppState>,
    word: String,
) -> AppResult<Vec<String>> {
    with_dictionary(&state, move |path| spell::remove_word(path, &word)).await
}
