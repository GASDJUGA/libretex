//! SyncTeX commands: jump from the editor to the PDF and from the PDF to the editor.

use crate::commands::compile::built_pdf;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::tex::synctex::{self, PdfRect};
use crate::util::paths::resolve_existing;
use serde::Serialize;

/// A position in a project file.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceLocation {
    /// Relative to the project root.
    pub file: String,
    pub line: u32,
}

/// Boxes of the PDF produced by `line` of `file` (source → PDF).
#[tauri::command]
pub async fn synctex_forward(
    state: tauri::State<'_, AppState>,
    id: String,
    file: String,
    line: u32,
    column: u32,
) -> AppResult<Vec<PdfRect>> {
    let (root, pdf) = built_pdf(&state, id).await?;
    // The file comes from the webview: it must be inside the project.
    let source = resolve_existing(&root, &file)?;
    let tex_path = state.tex_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        synctex::forward(&root, &tex_path, &pdf, &source, line.max(1), column.max(1))
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

/// The project file and line behind a point of the PDF (PDF → source), or null if it does
/// not come from a project file (e.g. the class or a package).
#[tauri::command]
pub async fn synctex_inverse(
    state: tauri::State<'_, AppState>,
    id: String,
    page: u32,
    x: f64,
    y: f64,
) -> AppResult<Option<SourceLocation>> {
    let (root, pdf) = built_pdf(&state, id).await?;
    let tex_path = state.tex_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let point = synctex::inverse(&root, &tex_path, &pdf, page.max(1), x, y)?;
        Ok(point.and_then(|p| {
            synctex::source_in_project(&root, &p.input)
                .map(|file| SourceLocation { file, line: p.line })
        }))
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}
