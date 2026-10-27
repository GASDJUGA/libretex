//! Settings (5.8): read, change and the projects folder (chosen in a native dialog).

use crate::error::{AppError, AppResult};
use crate::settings::{self, Settings};
use crate::state::AppState;
use serde::Serialize;
use serde_json::{Map, Value};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

/// The settings and where new projects go now (shown with `~`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsInfo {
    pub settings: Settings,
    pub projects_dir: String,
}

fn info(state: &AppState, settings: Settings) -> SettingsInfo {
    let ctx = state.ctx();
    let dir = ctx.projects_dir.display().to_string();
    let projects_dir = match &ctx.home_dir {
        Some(home) => match ctx.projects_dir.strip_prefix(home) {
            Ok(rest) if rest.as_os_str().is_empty() => "~".to_owned(),
            Ok(rest) => format!("~/{}", rest.display()),
            Err(_) => dir,
        },
        None => dir,
    };
    SettingsInfo {
        settings,
        projects_dir,
    }
}

/// Runs a change of `settings.json` off the main thread, one at a time, and applies it.
async fn change<F>(state: &State<'_, AppState>, f: F) -> AppResult<SettingsInfo>
where
    F: FnOnce(&std::path::Path) -> AppResult<Settings> + Send + 'static,
{
    let path = state.settings_file.clone();
    let lock = state.settings_lock.clone();
    let settings = tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().unwrap_or_else(|p| p.into_inner());
        f(&path)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;
    state.apply_settings(&settings);
    Ok(info(state, settings))
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> AppResult<SettingsInfo> {
    let path = state.settings_file.clone();
    let settings = tauri::async_runtime::spawn_blocking(move || settings::load(&path))
        .await
        .map_err(|e| AppError::Other(e.to_string()))??;
    Ok(info(&state, settings))
}

/// Changes editable settings (each key validated; see `settings::update`).
#[tauri::command]
pub async fn update_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    changes: Map<String, Value>,
) -> AppResult<SettingsInfo> {
    let info = change(&state, move |path| settings::update(path, &changes)).await?;
    // The macOS menu bar follows the interface language.
    #[cfg(target_os = "macos")]
    if let Ok(menu) = crate::platform::menu::build(&app, &info.settings.locale) {
        let _ = app.set_menu(menu);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
    Ok(info)
}

/// Asks for the folder of new projects (native dialog); `None` if cancelled.
#[tauri::command]
pub async fn choose_projects_dir(
    app: AppHandle,
    state: State<'_, AppState>,
    title: String,
) -> AppResult<Option<SettingsInfo>> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().set_title(title).blocking_pick_folder()
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?;
    let Some(folder) = picked else {
        return Ok(None);
    };
    let folder = folder
        .into_path()
        .map_err(|e| AppError::Other(e.to_string()))?;
    let folder = folder
        .canonicalize()
        .map_err(|e| AppError::io(&folder, e))?;
    if !folder.is_dir() {
        return Err(AppError::NotFound(folder));
    }
    let value = Value::String(folder.display().to_string());
    change(&state, move |path| {
        settings::set(path, "projectsDir", value)
    })
    .await
    .map(Some)
}

/// Installed monospace fonts, for the editor font.
#[tauri::command]
pub async fn monospace_fonts(app: AppHandle) -> AppResult<Vec<String>> {
    use crate::platform::fonts;
    // AppKit's font manager only works on the main thread.
    if cfg!(target_os = "macos") {
        crate::platform::on_main_thread(&app, fonts::monospace).await
    } else {
        tauri::async_runtime::spawn_blocking(fonts::monospace)
            .await
            .map_err(|e| AppError::Other(e.to_string()))
    }
}
