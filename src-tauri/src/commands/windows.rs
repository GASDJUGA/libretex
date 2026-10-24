//! Commands for several windows (see `windows.rs`). Events go to every window with the label
//! of the one they are for (`to`); each window ignores the others'.

use crate::commands::projects::with_ctx;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::windows::{self, MAIN};
use serde::Serialize;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowStart {
    pub label: String,
    /// The first window: it restores and remembers its tabs.
    pub main: bool,
    /// The project a new window opens with.
    pub project: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OtherWindow {
    pub label: String,
    pub projects: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShowProject {
    to: String,
    id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GiveProject {
    to: String,
    id: String,
    target: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CloseRequested {
    to: String,
}

fn registry(state: &AppState) -> std::sync::MutexGuard<'_, windows::Windows> {
    state.windows.lock().unwrap_or_else(|p| p.into_inner())
}

/// Shows `id` in window `to` (it opens or switches to its tab) and brings it to the front.
fn show_in(app: &AppHandle, to: &str, id: &str) {
    if let Some(target) = app.get_webview_window(to) {
        let _ = target.unminimize();
        let _ = target.set_focus();
    }
    let _ = app.emit(
        "window-show-project",
        ShowProject {
            to: to.to_owned(),
            id: id.to_owned(),
        },
    );
}

/// What this window starts with (asked once when it loads).
#[tauri::command]
pub fn window_start(window: WebviewWindow, state: State<'_, AppState>) -> WindowStart {
    let label = window.label().to_owned();
    let project = registry(&state).take_pending(&label);
    WindowStart {
        main: label == MAIN,
        label,
        project,
    }
}

/// The project tabs this window has now.
#[tauri::command]
pub fn set_window_projects(window: WebviewWindow, state: State<'_, AppState>, ids: Vec<String>) {
    registry(&state).set(window.label(), ids);
}

/// Before opening `id` in this window: true if it can. If another window has it, that window
/// comes to the front showing it (false).
#[tauri::command]
pub fn claim_project(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppState>,
    id: String,
) -> bool {
    let label = window.label().to_owned();
    let owner = registry(&state).owner(&id).map(str::to_owned);
    match owner {
        Some(owner) if owner != label && app.get_webview_window(&owner).is_some() => {
            show_in(&app, &owner, &id);
            false
        }
        _ => {
            registry(&state).adopt(&label, &id);
            true
        }
    }
}

/// Opens `id` (already closed in this window, its files saved) in a new window.
#[tauri::command]
pub async fn open_project_window(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    let path = with_ctx(&state, {
        let id = id.clone();
        move |ctx| ctx.path_of(&id)
    })
    .await?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let label = {
        let mut windows = registry(&state);
        windows.release(window.label(), &id);
        windows.new_window(&id)
    };
    let built =
        tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("index.html".into()))
            .title(format!("{name} — LibreTeX"))
            .inner_size(1280.0, 800.0)
            .min_inner_size(800.0, 500.0)
            .build();
    if let Err(error) = built {
        registry(&state).remove_window(&label);
        return Err(AppError::Other(error.to_string()));
    }
    Ok(())
}

/// The other windows and their projects (to move a tab to one of them).
#[tauri::command]
pub fn other_windows(window: WebviewWindow, state: State<'_, AppState>) -> Vec<OtherWindow> {
    registry(&state)
        .others(window.label())
        .into_iter()
        .map(|(label, projects)| OtherWindow { label, projects })
        .collect()
}

/// A tab of another window was dropped on this one: that window is asked to give it (it saves
/// and closes the tab, then calls `give_project`).
#[tauri::command]
pub fn request_project(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppState>,
    id: String,
) {
    let label = window.label().to_owned();
    let owner = registry(&state).owner(&id).map(str::to_owned);
    match owner {
        Some(owner) if owner == label => {}
        Some(owner) if app.get_webview_window(&owner).is_some() => {
            let _ = app.emit(
                "window-give-project",
                GiveProject {
                    to: owner,
                    id,
                    target: label,
                },
            );
        }
        _ => {
            registry(&state).adopt(&label, &id);
            show_in(&app, &label, &id);
        }
    }
}

/// This window closed `id` (files saved): window `target` opens it.
#[tauri::command]
pub fn give_project(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppState>,
    id: String,
    target: String,
) -> AppResult<()> {
    if !windows::is_window_label(&target) {
        return Err(AppError::Forbidden(format!("ventana «{target}»")));
    }
    // If the target window is gone, the project comes back here.
    let to = if app.get_webview_window(&target).is_some() {
        target
    } else {
        window.label().to_owned()
    };
    {
        let mut windows = registry(&state);
        windows.release(window.label(), &id);
        windows.adopt(&to, &id);
    }
    show_in(&app, &to, &id);
    Ok(())
}

/// The window's title (the project on screen), to tell the windows apart in the task bar.
#[tauri::command]
pub fn set_window_title(window: WebviewWindow, title: String) -> AppResult<()> {
    let title: String = title
        .chars()
        .filter(|c| !c.is_control())
        .take(200)
        .collect();
    window
        .set_title(&title)
        .map_err(|e| AppError::Other(e.to_string()))
}

/// The window saved its files and closes.
#[tauri::command]
pub fn close_window(window: WebviewWindow, state: State<'_, AppState>) -> AppResult<()> {
    registry(&state).closing_now(window.label());
    window.destroy().map_err(|e| AppError::Other(e.to_string()))
}

/// Window events: closing asks the window to save first (a second close within a few
/// seconds closes it anyway); a destroyed window frees its projects and its watcher.
pub fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    let Some(state) = window.try_state::<AppState>() else {
        return;
    };
    let label = window.label().to_owned();
    match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            if registry(&state).ask_to_close(&label, Instant::now()) {
                api.prevent_close();
                let _ = window.emit("window-close-requested", CloseRequested { to: label });
            }
        }
        tauri::WindowEvent::Destroyed => {
            registry(&state).remove_window(&label);
            state
                .watchers
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .remove(&label);
        }
        _ => {}
    }
}
