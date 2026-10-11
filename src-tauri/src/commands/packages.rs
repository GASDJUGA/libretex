//! Package manager commands (5.6).

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::tex::backends::{Backends, Locations, detect_backends};
use crate::tex::install_tl::{self, Job, Progress};
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

/// The package backends found and the active one.
#[tauri::command]
pub async fn package_backends(state: State<'_, AppState>) -> AppResult<Backends> {
    let managed = state.texlive_dir.clone();
    let path = state.tex_path();
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

/// Installs LibreTeX's TeX Live (downloads it from CTAN: only when the user asks). Progress
/// arrives as `texlive-install` events; returns when it finishes (or fails, or is cancelled).
#[tauri::command]
pub async fn install_managed_texlive(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let job = {
        let mut slot = state.texlive_job.lock().unwrap_or_else(|p| p.into_inner());
        if slot.is_some() {
            return Err(AppError::Other(
                "ya hay una instalación de TeX Live en curso".into(),
            ));
        }
        let job = Arc::new(Job::default());
        *slot = Some(job.clone());
        job
    };
    let root = state.texlive_dir.clone();
    let work = state.cache_dir.join("install-tl");
    let result = tauri::async_runtime::spawn_blocking(move || {
        install_tl::install(&root, &work, &job, &mut |progress: Progress| {
            let _ = app.emit("texlive-install", progress);
        })
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()));
    *state.texlive_job.lock().unwrap_or_else(|p| p.into_inner()) = None;
    let texdir = result??;
    // From now on LibreTeX's TeX Live comes first when compiling.
    state.refresh_tex_path();
    Ok(texdir.display().to_string())
}

/// Cancels the running installation (its partial files are removed).
#[tauri::command]
pub fn cancel_managed_texlive(state: State<'_, AppState>) {
    if let Some(job) = state
        .texlive_job
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .as_ref()
    {
        job.cancel();
    }
}
