//! Code that depends on the operating system (see «Reglas desde ya» in CLAUDE.md).

use crate::error::{AppError, AppResult};

pub mod clipboard;
pub mod fonts;
#[cfg(target_os = "macos")]
pub mod menu;
pub mod process;
#[cfg(target_os = "macos")]
pub mod trash;
#[cfg(windows)]
pub mod webview2;

/// Runs `f` on the main thread (where GTK and AppKit want to be called) and waits for it.
pub async fn on_main_thread<T: Send + 'static>(
    app: &tauri::AppHandle,
    f: impl FnOnce() -> T + Send + 'static,
) -> AppResult<T> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(f());
    })
    .map_err(|e| AppError::Other(e.to_string()))?;
    tauri::async_runtime::spawn_blocking(move || rx.recv())
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
        .map_err(|e| AppError::Other(e.to_string()))
}
