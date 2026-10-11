//! Package manager commands (5.6).

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::tex::backends::{BackendKind, Backends, Locations, detect_backends};
use crate::tex::catalog::{Catalog, Installed, PackageHit, Status, pacman_collections};
use crate::tex::install_tl::{self, Job, Progress};
use crate::tex::{ctan, tlpdb};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

/// The distribution's full TeX Live database (Arch ships one with every package).
const SYSTEM_TLPDB: &str = "/usr/share/tlpkg/texlive.tlpdb";

fn detect(managed: &Path, path: &std::ffi::OsStr) -> Backends {
    detect_backends(&Locations {
        managed,
        official: Path::new("/usr/local/texlive"),
        system_tlpdb: Path::new(SYSTEM_TLPDB),
        pacman: Path::new("/usr/bin/pacman").is_file(),
        path,
    })
}

/// Runs blocking work off the async runtime.
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

/// The package backends found and the active one.
#[tauri::command]
pub async fn package_backends(state: State<'_, AppState>) -> AppResult<Backends> {
    let managed = state.texlive_dir.clone();
    let path = state.tex_path();
    blocking(move || Ok(detect(&managed, &path))).await
}

/// Where the catalog's TeX Live database comes from.
fn catalog_tlpdb(cache_dir: &Path, backends: &Backends) -> Option<PathBuf> {
    let cached = ctan::tlpdb_file(cache_dir);
    if cached.is_file() {
        return Some(cached);
    }
    if Path::new(SYSTEM_TLPDB).is_file() {
        return Some(PathBuf::from(SYSTEM_TLPDB));
    }
    let root = backends.active.as_ref()?.root.as_ref()?;
    let own = Path::new(root).join("tlpkg/texlive.tlpdb");
    own.is_file().then_some(own)
}

/// Builds the catalog for the active backend.
fn build_catalog(cache_dir: &Path, backends: &Backends) -> Catalog {
    let read = |path: &Path| tlpdb::parse(&std::fs::read_to_string(path).unwrap_or_default());
    let tl = catalog_tlpdb(cache_dir, backends)
        .map(|p| read(&p))
        .unwrap_or_default();
    let installed = match backends.active.as_ref() {
        Some(b) if matches!(b.kind, BackendKind::Managed | BackendKind::Official) => b
            .root
            .as_ref()
            .map(|root| read(&Path::new(root).join("tlpkg/texlive.tlpdb")))
            .map(|db| Installed::Names(db.packages.into_keys().collect()))
            .unwrap_or(Installed::Unknown),
        Some(b) if b.kind == BackendKind::Pacman => std::process::Command::new("pacman")
            .arg("-Qq")
            .output()
            .ok()
            .map(|o| {
                Installed::PacmanCollections(pacman_collections(&String::from_utf8_lossy(
                    &o.stdout,
                )))
            })
            .unwrap_or(Installed::Unknown),
        _ => Installed::Unknown,
    };
    Catalog::new(tl, ctan::load_index(cache_dir), installed)
}

/// The cached catalog, built if needed.
async fn catalog(state: &State<'_, AppState>) -> AppResult<Arc<Catalog>> {
    if let Some(catalog) = state
        .catalog
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .clone()
    {
        return Ok(catalog);
    }
    let managed = state.texlive_dir.clone();
    let cache = state.cache_dir.clone();
    let path = state.tex_path();
    let built =
        blocking(move || Ok(Arc::new(build_catalog(&cache, &detect(&managed, &path))))).await?;
    *state.catalog.lock().unwrap_or_else(|p| p.into_inner()) = Some(built.clone());
    Ok(built)
}

/// Fills unknown statuses with `kpsewhich` (one call for all): installed if one of the
/// package's style files is found.
fn fill_with_kpsewhich(hits: &mut [PackageHit], path: &std::ffi::OsStr) {
    let files: Vec<&String> = hits
        .iter()
        .filter(|h| h.status == Status::Unknown)
        .filter_map(|h| h.styles.first())
        .collect();
    let Some(kpsewhich) = crate::tex::detect::find_in_path("kpsewhich", path) else {
        return;
    };
    if files.is_empty() {
        return;
    }
    let Ok(output) = std::process::Command::new(kpsewhich)
        .args(&files)
        .env("PATH", path)
        .output()
    else {
        return;
    };
    let found: std::collections::HashSet<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|l| l.rsplit('/').next().map(str::to_owned))
        .collect();
    for hit in hits.iter_mut().filter(|h| h.status == Status::Unknown) {
        if let Some(style) = hit.styles.first() {
            hit.status = if found.contains(style) {
                Status::Installed
            } else {
                Status::Missing
            };
        }
    }
}

/// Packages matching `query` (TeX Live and CTAN), best first.
#[tauri::command]
pub async fn search_packages(
    state: State<'_, AppState>,
    query: String,
) -> AppResult<Vec<PackageHit>> {
    let catalog = catalog(&state).await?;
    let path = state.tex_path();
    blocking(move || {
        let mut hits = catalog.search(&query, 60);
        fill_with_kpsewhich(&mut hits, &path);
        Ok(hits)
    })
    .await
}

/// The package that provides a style or class file (`physics.sty`), if known.
#[tauri::command]
pub async fn package_for_file(
    state: State<'_, AppState>,
    file: String,
) -> AppResult<Option<PackageHit>> {
    let catalog = catalog(&state).await?;
    let path = state.tex_path();
    blocking(move || {
        let mut hit: Vec<PackageHit> = catalog.package_for_file(&file).into_iter().collect();
        fill_with_kpsewhich(&mut hit, &path);
        Ok(hit.pop())
    })
    .await
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogInfo {
    pub ctan: ctan::IndexInfo,
    /// The full TeX Live database was downloaded (ms), or null (the system's is used).
    pub texlive_saved_at: Option<u64>,
}

fn catalog_info(cache_dir: &Path) -> CatalogInfo {
    CatalogInfo {
        ctan: ctan::IndexInfo {
            saved_at: ctan::saved_at(&ctan::index_file(cache_dir)),
            packages: ctan::load_index(cache_dir).len(),
        },
        texlive_saved_at: ctan::saved_at(&ctan::tlpdb_file(cache_dir)),
    }
}

/// What the catalog's offline data is and how fresh.
#[tauri::command]
pub async fn package_catalog_info(state: State<'_, AppState>) -> AppResult<CatalogInfo> {
    let cache = state.cache_dir.clone();
    blocking(move || Ok(catalog_info(&cache))).await
}

/// Downloads CTAN's index (and TeX Live's database when the system has no full one): only
/// when the user asks. The catalog is rebuilt on the next search.
#[tauri::command]
pub async fn refresh_package_catalog(state: State<'_, AppState>) -> AppResult<CatalogInfo> {
    let cache = state.cache_dir.clone();
    let info = blocking(move || {
        ctan::download(ctan::INDEX_URL, &ctan::index_file(&cache))?;
        if !Path::new(SYSTEM_TLPDB).is_file() {
            ctan::download(ctan::TLPDB_URL, &ctan::tlpdb_file(&cache))?;
        }
        Ok(catalog_info(&cache))
    })
    .await?;
    *state.catalog.lock().unwrap_or_else(|p| p.into_inner()) = None;
    Ok(info)
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
    // From now on LibreTeX's TeX Live comes first when compiling (and in the catalog).
    state.refresh_tex_path();
    *state.catalog.lock().unwrap_or_else(|p| p.into_inner()) = None;
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
