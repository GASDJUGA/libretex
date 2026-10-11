//! Package manager commands (5.6).

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::tex::backends::{Backends, Locations, detect_backends};
use std::path::Path;
use tauri::State;

/// The package backends found and the active one.
#[tauri::command]
pub async fn package_backends(state: State<'_, AppState>) -> AppResult<Backends> {
    let managed = state.texlive_dir.clone();
    let path = state.tex_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        detect_backends(&Locations {
            managed: &managed,
            official: Path::new("/usr/local/texlive"),
            system_tlpdb: Path::new("/usr/share/tlpkg/texlive.tlpdb"),
            pacman: Path::new("/usr/bin/pacman").is_file(),
            path: &path,
        })
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))
}
