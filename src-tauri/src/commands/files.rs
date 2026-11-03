//! Tauri commands for a project's files. Paths are relative to the project root and are
//! validated in `files` / `util::paths`.

use crate::commands::projects::with_ctx;
use crate::error::{AppError, AppResult};
use crate::files::search::{self, Replaced, SearchQuery, SearchResults};
use crate::files::{self, FileNode, TextFile};
use crate::state::AppState;
use serde::Serialize;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn list_tree(state: State<'_, AppState>, id: String) -> AppResult<Vec<FileNode>> {
    with_ctx(&state, move |ctx| files::list_tree(&ctx.path_of(&id)?)).await
}

#[tauri::command]
pub async fn read_text_file(
    state: State<'_, AppState>,
    id: String,
    path: String,
) -> AppResult<TextFile> {
    with_ctx(&state, move |ctx| {
        files::read_text(&ctx.path_of(&id)?, &path)
    })
    .await
}

/// Saves a text file atomically; returns its new modification time (ms).
#[tauri::command]
pub async fn write_text_file(
    state: State<'_, AppState>,
    id: String,
    path: String,
    content: String,
) -> AppResult<u64> {
    with_ctx(&state, move |ctx| {
        files::write_text(&ctx.path_of(&id)?, &path, &content)
    })
    .await
}

#[tauri::command]
pub async fn create_file(state: State<'_, AppState>, id: String, path: String) -> AppResult<()> {
    with_ctx(&state, move |ctx| {
        files::create_file(&ctx.path_of(&id)?, &path, "")
    })
    .await
}

#[tauri::command]
pub async fn create_folder(state: State<'_, AppState>, id: String, path: String) -> AppResult<()> {
    with_ctx(&state, move |ctx| {
        files::create_folder(&ctx.path_of(&id)?, &path)
    })
    .await
}

#[tauri::command]
pub async fn rename_entry(
    state: State<'_, AppState>,
    id: String,
    path: String,
    new_name: String,
) -> AppResult<String> {
    with_ctx(&state, move |ctx| {
        files::rename(&ctx.path_of(&id)?, &path, &new_name)
    })
    .await
}

#[tauri::command]
pub async fn move_entry(
    state: State<'_, AppState>,
    id: String,
    path: String,
    dest_folder: String,
) -> AppResult<String> {
    with_ctx(&state, move |ctx| {
        files::move_entry(&ctx.path_of(&id)?, &path, &dest_folder)
    })
    .await
}

#[tauri::command]
pub async fn duplicate_entry(
    state: State<'_, AppState>,
    id: String,
    path: String,
) -> AppResult<String> {
    with_ctx(&state, move |ctx| {
        files::duplicate(&ctx.path_of(&id)?, &path)
    })
    .await
}

/// Sends a file or folder to the system trash.
#[tauri::command]
pub async fn delete_entry(state: State<'_, AppState>, id: String, path: String) -> AppResult<()> {
    with_ctx(&state, move |ctx| {
        files::delete(&ctx.path_of(&id)?, &path, ctx.trash.as_ref())
    })
    .await
}

/// Shows the native file picker and copies the chosen files into `folder`. Returns the new
/// relative paths (empty if cancelled).
#[tauri::command]
pub async fn upload_files_dialog(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    folder: String,
    title: String,
) -> AppResult<Vec<String>> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().set_title(title).blocking_pick_files()
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?;
    let Some(picked) = picked else {
        return Ok(Vec::new());
    };
    let sources = picked
        .into_iter()
        .map(|p| p.into_path().map_err(|e| AppError::Other(e.to_string())))
        .collect::<AppResult<Vec<_>>>()?;
    with_ctx(&state, move |ctx| {
        files::import(&ctx.path_of(&id)?, &folder, &sources)
    })
    .await
}

/// Payload of the `project-files-changed` event.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FilesChanged {
    project_id: String,
    paths: Vec<String>,
    /// Those of `paths` that no longer exist (deleted or moved away). The others exist: if
    /// they were already in the tree only their contents changed (an autosave), and the
    /// tree does not need to be read again.
    removed: Vec<String>,
}

/// Starts watching the project for external changes (replacing any previous watch). Changes
/// arrive as `project-files-changed` events.
#[tauri::command]
pub async fn watch_project(
    app: AppHandle,
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    let root = with_ctx(&state, {
        let id = id.clone();
        move |ctx| ctx.path_of(&id)
    })
    .await?;
    // The image viewer loads project files through the asset protocol; only opened projects
    // are reachable.
    app.asset_protocol_scope()
        .allow_directory(&root, true)
        .map_err(|e| AppError::Other(e.to_string()))?;
    let base = root.clone();
    let watcher = files::watch::watch(&root, move |paths| {
        let removed = paths
            .iter()
            .filter(|p| base.join(p).symlink_metadata().is_err())
            .cloned()
            .collect();
        let _ = app.emit(
            "project-files-changed",
            FilesChanged {
                project_id: id.clone(),
                paths,
                removed,
            },
        );
    })?;
    // One watcher per window: each window watches the project it shows.
    state
        .watchers
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .insert(window.label().to_owned(), watcher);
    Ok(())
}

#[tauri::command]
pub fn unwatch_project(window: tauri::WebviewWindow, state: State<'_, AppState>) {
    state
        .watchers
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .remove(window.label());
}

/// Copies files the user dropped on the window into `folder`. `paths` must be exactly the ones
/// of the last native drop event (the Rust and webview events may arrive in either order, so
/// this waits briefly for it).
#[tauri::command]
pub async fn import_dropped(
    state: State<'_, AppState>,
    id: String,
    folder: String,
    paths: Vec<String>,
) -> AppResult<Vec<String>> {
    let wanted: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
    let start = Instant::now();
    loop {
        let dropped = state
            .dropped
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone();
        if !wanted.is_empty() && wanted.iter().all(|p| dropped.contains(p)) {
            break;
        }
        if start.elapsed() > Duration::from_secs(1) {
            return Err(AppError::Forbidden(
                "rutas que no vienen de soltar archivos".into(),
            ));
        }
        tokio_sleep(Duration::from_millis(25)).await;
    }
    with_ctx(&state, move |ctx| {
        files::import(&ctx.path_of(&id)?, &folder, &wanted)
    })
    .await
}

async fn tokio_sleep(duration: Duration) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(duration)).await;
}

/// Labels and bibliography entries of the project, for autocompletion.
#[tauri::command]
pub async fn project_index(
    state: State<'_, AppState>,
    id: String,
    known: Option<String>,
) -> AppResult<files::index::IndexReply> {
    with_ctx(&state, move |ctx| {
        files::index::build_since(&ctx.path_of(&id)?, known.as_deref())
    })
    .await
}

/// Every occurrence of a text or regular expression in the project's text files.
#[tauri::command]
pub async fn search_project(
    state: State<'_, AppState>,
    id: String,
    query: SearchQuery,
) -> AppResult<SearchResults> {
    with_ctx(&state, move |ctx| {
        search::search(&ctx.path_of(&id)?, &query)
    })
    .await
}

/// Replaces the occurrences in the given files (validated paths of the project).
#[tauri::command]
pub async fn replace_in_project(
    state: State<'_, AppState>,
    id: String,
    query: SearchQuery,
    replacement: String,
    paths: Vec<String>,
) -> AppResult<Vec<Replaced>> {
    with_ctx(&state, move |ctx| {
        search::replace(&ctx.path_of(&id)?, &query, &replacement, &paths)
    })
    .await
}

/// An image read from the clipboard, waiting for a name.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardImage {
    /// `png` or `jpg`: the file it will be.
    pub extension: &'static str,
    pub bytes: usize,
}

/// Pasting without text in the editor: reads the clipboard's image, if any, and keeps it for
/// this window until it is named (`save_clipboard_image`) or dropped.
#[tauri::command]
pub async fn read_clipboard_image(
    app: AppHandle,
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
) -> AppResult<Option<ClipboardImage>> {
    // The clipboard (GTK, AppKit) is read on the main thread; converting the image, if needed,
    // is done here, so a large one does not freeze the window.
    let read =
        crate::platform::on_main_thread(&app, crate::platform::clipboard::read_image).await?;
    let bytes = match read {
        Some(image) => tauri::async_runtime::spawn_blocking(move || image.into_bytes())
            .await
            .map_err(|e| AppError::Other(e.to_string()))?,
        None => None,
    };
    let mut pasted = state.pasted_images.lock().expect("pasted images");
    pasted.remove(window.label());
    let Some(bytes) = bytes else { return Ok(None) };
    let Some(kind) = files::images::ImageKind::of(&bytes) else {
        return Ok(None);
    };
    let image = ClipboardImage {
        extension: kind.extension(),
        bytes: bytes.len(),
    };
    pasted.insert(window.label().to_owned(), bytes);
    Ok(Some(image))
}

/// Saves the pasted image as `<name>` in the project's figures folder (`figuresDir` of its
/// `project.json`). Returns its path relative to the root.
#[tauri::command]
pub async fn save_clipboard_image(
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> AppResult<String> {
    let label = window.label().to_owned();
    let bytes = state
        .pasted_images
        .lock()
        .expect("pasted images")
        .get(&label)
        .cloned()
        .ok_or_else(|| AppError::Other("no hay una imagen pegada".into()))?;
    let saved = with_ctx(&state, move |ctx| {
        let root = ctx.path_of(&id)?;
        let meta = crate::projects::meta::read_meta(&root)?.unwrap_or_default();
        files::images::save_image(&root, &meta.figures_dir, &name, &bytes)
    })
    .await?;
    // Kept until saved: a name already taken can be changed and tried again.
    state
        .pasted_images
        .lock()
        .expect("pasted images")
        .remove(&label);
    Ok(saved)
}

/// The user cancelled the paste: the image is dropped.
#[tauri::command]
pub fn discard_clipboard_image(window: tauri::WebviewWindow, state: State<'_, AppState>) {
    state
        .pasted_images
        .lock()
        .expect("pasted images")
        .remove(window.label());
}
