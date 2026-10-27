//! Settings (5.8): read, change and the projects folder (chosen in a native dialog).

use crate::error::{AppError, AppResult};
use crate::settings::{self, Settings};
use crate::state::AppState;
use serde::Serialize;
use serde_json::{Map, Value};
use std::path::Path;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

/// The settings, where new projects go now and where LibreTeX keeps its own files (paths
/// shown with `~`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsInfo {
    pub settings: Settings,
    pub projects_dir: String,
    pub app_dirs: AppDirs,
}

/// LibreTeX's folders: XDG on Linux (`~/.config/libretex`…), `~/Library/…` on macOS.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDirs {
    /// `settings.json`, `projects.json`, the personal dictionary.
    pub config: String,
    /// The TeX Live of LibreTeX, the trash list.
    pub data: String,
    pub cache: String,
}

/// `path` with the home folder written as `~`.
fn tilde(path: &Path, home: Option<&Path>) -> String {
    match home.map(|home| path.strip_prefix(home)) {
        Some(Ok(rest)) if rest.as_os_str().is_empty() => "~".to_owned(),
        Some(Ok(rest)) => format!("~/{}", rest.display()),
        _ => path.display().to_string(),
    }
}

fn info(state: &AppState, settings: Settings) -> SettingsInfo {
    let ctx = state.ctx();
    let home = ctx.home_dir.as_deref();
    let parent = |path: &Path| tilde(path.parent().unwrap_or(path), home);
    SettingsInfo {
        settings,
        projects_dir: tilde(&ctx.projects_dir, home),
        app_dirs: AppDirs {
            config: parent(&state.settings_file),
            data: parent(&state.texlive_dir),
            cache: tilde(&state.cache_dir, home),
        },
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rutas_con_la_carpeta_personal_como_virgulilla() {
        let home = Path::new("/Users/ana");
        assert_eq!(
            tilde(
                Path::new("/Users/ana/Library/Caches/org.LibreTeX.libretex"),
                Some(home)
            ),
            "~/Library/Caches/org.LibreTeX.libretex"
        );
        assert_eq!(tilde(home, Some(home)), "~");
        assert_eq!(
            tilde(Path::new("/Volumes/Tesis"), Some(home)),
            "/Volumes/Tesis"
        );
        assert_eq!(tilde(Path::new("/x"), None), "/x");
    }
}
