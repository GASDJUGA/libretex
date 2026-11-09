//! Application state shared by the commands.

use crate::error::{AppError, AppResult};
use crate::files::watch::ProjectWatcher;
use crate::projects::ops::{Ctx, NewProjectDefaults};
use crate::projects::trash::SystemTrash;
use crate::settings::Settings;
use crate::tex::backends::{Backends, TexChoice, detect_system};
use directories::{BaseDirs, ProjectDirs};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

pub struct AppState {
    /// Paths and defaults for project operations; replaced when the settings change.
    ctx: std::sync::RwLock<Ctx>,
    /// Serializes operations that read-modify-write `projects.json`.
    pub registry_lock: Arc<Mutex<()>>,
    /// Watcher of the project on screen in each window (by window label).
    pub watchers: Mutex<std::collections::HashMap<String, ProjectWatcher>>,
    /// Which window has which project (several windows, like a browser).
    pub windows: Mutex<crate::windows::Windows>,
    /// JuTeX's own TeX Live (`~/.local/share/jutex/texlive`).
    pub texlive_dir: PathBuf,
    /// Cache (`~/.cache/jutex`): downloaded installer, CTAN index.
    pub cache_dir: PathBuf,
    /// Package catalog (TeX Live database + CTAN index + installed status), built on first
    /// use and dropped when what it depends on changes.
    pub catalog: Mutex<Option<Arc<crate::tex::catalog::Catalog>>>,
    /// The running package operation (install/remove/update), if any (one at a time).
    pub package_job: Mutex<Option<Arc<crate::tex::install_tl::Job>>>,
    /// The running installation of JuTeX's TeX Live, if any (one at a time).
    pub texlive_job: Mutex<Option<Arc<crate::tex::install_tl::Job>>>,
    /// `PATH` for TeX tools: the chosen TeX (see `tex::backends::tex_path`), then the
    /// user's `PATH`.
    tex_path: std::sync::RwLock<std::ffi::OsString>,
    /// Which TeX JuTeX uses (`texDistribution` in `settings.json`).
    tex_choice: std::sync::RwLock<TexChoice>,
    /// `~/.config/jutex/settings.json`.
    pub settings_file: PathBuf,
    /// Serializes changes to the projects' history repositories (`.jutex/history.git`).
    pub history_lock: Arc<Mutex<()>>,
    /// Serializes operations on the projects' own git repositories (backup, 5.9).
    pub backup_lock: Arc<Mutex<()>>,
    /// Running network operations of the backup (push, pull, create), by project.
    pub backup_jobs:
        Arc<Mutex<std::collections::HashMap<String, crate::commands::backup::NetJobState>>>,
    /// Serializes changes to `settings.json`.
    pub settings_lock: Arc<Mutex<()>>,
    /// The personal dictionary, `~/.config/jutex/dictionary.txt`.
    pub dictionary_file: PathBuf,
    /// Serializes changes to the personal dictionary.
    pub dictionary_lock: Arc<Mutex<()>>,
    /// Compilations per project (one running, at most one pending).
    pub compile_queue: Mutex<crate::tex::queue::Queue<crate::commands::compile::CompileRequest>>,
    /// Last detection of the TeX tools (refreshed on demand).
    pub tex_status: Mutex<Option<crate::tex::detect::TexStatus>>,
    /// Paths of the last files the user dropped on the window (native event). Only these can
    /// be imported with `import_dropped`, so the webview cannot copy arbitrary paths.
    pub dropped: Mutex<Vec<PathBuf>>,
    /// The image read from the clipboard when pasting, by window label, until the user names
    /// it (`save_clipboard_image`) or cancels: its bytes never travel to the webview.
    pub pasted_images: Mutex<std::collections::HashMap<String, Vec<u8>>>,
}

impl AppState {
    pub fn new(app: &AppHandle) -> AppResult<Self> {
        let dirs = ProjectDirs::from("org", "JuTeX", "jutex")
            .ok_or_else(|| AppError::Other("no se encontró la carpeta personal".into()))?;
        let home = BaseDirs::new().map(|b| b.home_dir().to_owned());
        let config_dir = dirs.config_dir().to_owned();
        let settings_file = config_dir.join("settings.json");
        let settings = crate::settings::load(&settings_file)?;
        let projects_dir = settings
            .projects_dir
            .clone()
            .or_else(|| home.as_deref().map(default_projects_dir))
            .ok_or_else(|| AppError::Other("no se encontró la carpeta personal".into()))?;
        let templates_dir = app
            .path()
            .resource_dir()
            .map_err(|e| AppError::Other(e.to_string()))?
            .join("templates");

        Ok(Self {
            ctx: std::sync::RwLock::new(Ctx {
                registry_file: config_dir.join("projects.json"),
                projects_dir,
                templates_dir,
                home_dir: home,
                trash_log_file: dirs.data_dir().join("trashed.json"),
                trash: Arc::new(SystemTrash::new(dirs.data_dir())),
                new_project: new_project_defaults(&settings),
            }),
            settings_lock: Arc::new(Mutex::new(())),
            history_lock: Arc::new(Mutex::new(())),
            backup_lock: Arc::new(Mutex::new(())),
            backup_jobs: Arc::new(Mutex::new(std::collections::HashMap::new())),
            registry_lock: Arc::new(Mutex::new(())),
            watchers: Mutex::new(std::collections::HashMap::new()),
            windows: Mutex::new(crate::windows::Windows::default()),
            dropped: Mutex::new(Vec::new()),
            texlive_dir: dirs.data_dir().join("texlive"),
            cache_dir: dirs.cache_dir().to_owned(),
            texlive_job: Mutex::new(None),
            catalog: Mutex::new(None),
            package_job: Mutex::new(None),
            tex_path: std::sync::RwLock::new(compute_tex_path(
                &dirs.data_dir().join("texlive"),
                settings.tex_distribution,
            )),
            tex_choice: std::sync::RwLock::new(settings.tex_distribution),
            dictionary_file: config_dir.join("dictionary.txt"),
            dictionary_lock: Arc::new(Mutex::new(())),
            settings_file,
            tex_status: Mutex::new(None),
            compile_queue: Mutex::new(crate::tex::queue::Queue::default()),
            pasted_images: Mutex::new(std::collections::HashMap::new()),
        })
    }
}

/// Where projects go when the user has not chosen a folder: `~/JuTeX`, or `~/LibreTeX` if
/// only that one exists (a user of LibreTeX before 2.0.0 keeps their folder; both can be
/// used, projects are registered by their path).
pub fn default_projects_dir(home: &std::path::Path) -> std::path::PathBuf {
    let current = home.join("JuTeX");
    let legacy = home.join("LibreTeX");
    if !current.exists() && legacy.is_dir() {
        legacy
    } else {
        current
    }
}

fn new_project_defaults(settings: &Settings) -> NewProjectDefaults {
    NewProjectDefaults {
        compiler: settings.default_compiler,
        spell_lang: settings.default_spell_lang.clone(),
    }
}

/// `PATH` for TeX tools: the active backend's TeX first, then the user's `PATH`.
fn compute_tex_path(texlive_dir: &std::path::Path, choice: TexChoice) -> std::ffi::OsString {
    let backends = detect_system(texlive_dir, choice);
    crate::tex::backends::tex_path(texlive_dir, &backends, std::env::var_os("PATH").as_deref())
}

impl AppState {
    /// The current `PATH` for TeX tools.
    pub fn tex_path(&self) -> std::ffi::OsString {
        self.tex_path
            .read()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }

    /// Recomputes the TeX `PATH` (after installing JuTeX's TeX Live or choosing another
    /// TeX) and forgets the cached detection and package catalog.
    pub fn refresh_tex_path(&self) {
        *self.tex_path.write().unwrap_or_else(|p| p.into_inner()) =
            compute_tex_path(&self.texlive_dir, self.tex_choice());
        *self.tex_status.lock().unwrap_or_else(|p| p.into_inner()) = None;
        *self.catalog.lock().unwrap_or_else(|p| p.into_inner()) = None;
    }

    pub fn tex_choice(&self) -> TexChoice {
        *self.tex_choice.read().unwrap_or_else(|p| p.into_inner())
    }

    /// The package backends of this machine and the active one (the TeX used to compile).
    pub fn backends(&self) -> Backends {
        detect_system(&self.texlive_dir, self.tex_choice())
    }

    /// Saves the user's choice of TeX in `settings.json` (keeping its other keys) and
    /// switches to it.
    pub fn set_tex_choice(&self, choice: TexChoice) -> AppResult<()> {
        let value = serde_json::to_value(choice).map_err(|e| AppError::Other(e.to_string()))?;
        {
            let _guard = self.settings_lock.lock().unwrap_or_else(|p| p.into_inner());
            crate::settings::set(&self.settings_file, "texDistribution", value)?;
        }
        *self.tex_choice.write().unwrap_or_else(|p| p.into_inner()) = choice;
        self.refresh_tex_path();
        Ok(())
    }

    /// A copy of the project context, for one operation.
    pub fn ctx(&self) -> Ctx {
        self.ctx.read().unwrap_or_else(|p| p.into_inner()).clone()
    }

    /// Applies saved settings that the backend uses (projects folder, new-project defaults).
    pub fn apply_settings(&self, settings: &Settings) {
        let mut ctx = self.ctx.write().unwrap_or_else(|p| p.into_inner());
        if let Some(dir) = &settings.projects_dir {
            ctx.projects_dir = dir.clone();
        }
        ctx.new_project = new_project_defaults(settings);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn instalacion_nueva_usa_jutex() {
        let home = tempfile::tempdir().unwrap();
        assert_eq!(default_projects_dir(home.path()), home.path().join("JuTeX"));
    }

    #[test]
    fn con_libretex_usa_libretex() {
        let home = tempfile::tempdir().unwrap();
        std::fs::create_dir(home.path().join("LibreTeX")).unwrap();
        assert_eq!(
            default_projects_dir(home.path()),
            home.path().join("LibreTeX")
        );
    }

    #[test]
    fn con_las_dos_usa_jutex() {
        let home = tempfile::tempdir().unwrap();
        std::fs::create_dir(home.path().join("LibreTeX")).unwrap();
        std::fs::create_dir(home.path().join("JuTeX")).unwrap();
        assert_eq!(default_projects_dir(home.path()), home.path().join("JuTeX"));
    }
}
