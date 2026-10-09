//! Application state shared by the commands.

use crate::error::{AppError, AppResult};
use crate::files::watch::ProjectWatcher;
use crate::projects::ops::Ctx;
use crate::projects::trash::SystemTrash;
use crate::util::fs::read_json;
use directories::{BaseDirs, ProjectDirs};
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

pub struct AppState {
    pub ctx: Ctx,
    /// Serializes operations that read-modify-write `projects.json`.
    pub registry_lock: Arc<Mutex<()>>,
    /// Watcher of the project open in the editor (one at a time).
    pub watcher: Mutex<Option<ProjectWatcher>>,
    /// Paths of the last files the user dropped on the window (native event). Only these can
    /// be imported with `import_dropped`, so the webview cannot copy arbitrary paths.
    pub dropped: Mutex<Vec<PathBuf>>,
}

/// The subset of `settings.json` needed so far (the full settings arrive in phase 9).
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    projects_dir: Option<PathBuf>,
}

impl AppState {
    pub fn new(app: &AppHandle) -> AppResult<Self> {
        let dirs = ProjectDirs::from("org", "LibreTeX", "libretex")
            .ok_or_else(|| AppError::Other("no se encontró la carpeta personal".into()))?;
        let home = BaseDirs::new().map(|b| b.home_dir().to_owned());
        let config_dir = dirs.config_dir().to_owned();
        let settings: Settings = read_json(&config_dir.join("settings.json"))?.unwrap_or_default();
        let projects_dir = settings
            .projects_dir
            .or_else(|| home.as_ref().map(|h| h.join("LibreTeX")))
            .ok_or_else(|| AppError::Other("no se encontró la carpeta personal".into()))?;
        let templates_dir = app
            .path()
            .resource_dir()
            .map_err(|e| AppError::Other(e.to_string()))?
            .join("templates");

        Ok(Self {
            ctx: Ctx {
                registry_file: config_dir.join("projects.json"),
                projects_dir,
                templates_dir,
                home_dir: home,
                trash_log_file: dirs.data_dir().join("trashed.json"),
                trash: Arc::new(SystemTrash),
            },
            registry_lock: Arc::new(Mutex::new(())),
            watcher: Mutex::new(None),
            dropped: Mutex::new(Vec::new()),
        })
    }
}
