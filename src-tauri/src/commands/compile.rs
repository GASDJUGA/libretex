//! Compilation commands: queue per project, streamed output and cancellation.

use crate::commands::projects::with_ctx;
use crate::error::{AppError, AppResult};
use crate::projects::meta::{Compiler, read_meta};
use crate::state::AppState;
use crate::tex::latexmk::{self, CompileOptions};
use crate::tex::queue::Requested;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

/// Options chosen in the UI. Shell escape is not here: it comes from the project's
/// metadata, never from the webview.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileRequest {
    pub compiler: Compiler,
    #[serde(default)]
    pub draft: bool,
    #[serde(default)]
    pub halt_on_error: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileQueued {
    /// Id of the run that started, or null if it was queued behind a running one.
    pub run_id: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Started {
    project_id: String,
    run_id: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Output {
    project_id: String,
    run_id: u64,
    lines: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Finished {
    project_id: String,
    run_id: u64,
    /// `success`, `failed` or `cancelled`.
    status: &'static str,
    duration_ms: u64,
    /// Contents of the engine's .log (empty if it was not written).
    log: String,
    /// The PDF, relative to the project root, if this run produced or updated it.
    pdf: Option<String>,
    /// Main file that was compiled.
    main_file: String,
    /// Error starting latexmk, if any.
    error: Option<String>,
}

/// Biggest log sent to the webview.
const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;
/// Output lines are sent in batches.
const OUTPUT_BATCH: Duration = Duration::from_millis(100);

fn modified(path: &Path) -> Option<u128> {
    path.metadata()
        .ok()?
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis())
}

/// Runs one compilation, emitting its events; then the pending request, if any.
fn run_loop(
    app: AppHandle,
    project_id: String,
    root: PathBuf,
    mut run_id: u64,
    mut request: CompileRequest,
) {
    let state = app.state::<AppState>();
    loop {
        let meta = read_meta(&root).ok().flatten().unwrap_or_default();
        let options = CompileOptions {
            compiler: request.compiler,
            draft: request.draft,
            halt_on_error: request.halt_on_error,
            shell_escape: meta.shell_escape,
            force: latexmk::last_run_failed(&root, &meta.main_file),
        };
        let pdf_rel = latexmk::pdf_path(&meta.main_file);
        let pdf_before = modified(&root.join(&pdf_rel));
        let started = Instant::now();
        let _ = app.emit(
            "compile-started",
            Started {
                project_id: project_id.clone(),
                run_id,
            },
        );

        let outcome =
            latexmk::start(&root, &state.tex_path(), &meta.main_file, &options).and_then(|run| {
                state
                    .compile_queue
                    .lock()
                    .unwrap_or_else(|p| p.into_inner())
                    .started(&project_id, run_id, run.pid());
                let mut batch = Vec::new();
                let mut last_sent = Instant::now();
                let status = run.wait(|line| {
                    batch.push(line);
                    if last_sent.elapsed() >= OUTPUT_BATCH {
                        let lines = std::mem::take(&mut batch);
                        let _ = app.emit(
                            "compile-output",
                            Output {
                                project_id: project_id.clone(),
                                run_id,
                                lines,
                            },
                        );
                        last_sent = Instant::now();
                    }
                })?;
                if !batch.is_empty() {
                    let _ = app.emit(
                        "compile-output",
                        Output {
                            project_id: project_id.clone(),
                            run_id,
                            lines: batch,
                        },
                    );
                }
                Ok(status)
            });

        let (cancelled, next) = state
            .compile_queue
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .finished(&project_id, run_id);
        let log_path = root.join(pdf_rel.with_extension("log"));
        let log = match log_path.metadata() {
            Ok(m) if m.len() <= MAX_LOG_BYTES => {
                String::from_utf8_lossy(&std::fs::read(&log_path).unwrap_or_default()).into_owned()
            }
            _ => String::new(),
        };
        let pdf_after = modified(&root.join(&pdf_rel));
        let (status, error) = match &outcome {
            _ if cancelled => ("cancelled", None),
            Ok(status) if status.success() => ("success", None),
            Ok(_) => ("failed", None),
            Err(e) => ("failed", Some(e.to_string())),
        };
        let _ = app.emit(
            "compile-finished",
            Finished {
                project_id: project_id.clone(),
                run_id,
                status,
                duration_ms: started.elapsed().as_millis() as u64,
                log,
                pdf: (pdf_after.is_some() && pdf_after != pdf_before)
                    .then(|| pdf_rel.to_string_lossy().replace('\\', "/")),
                main_file: meta.main_file.clone(),
                error,
            },
        );
        match next {
            Some((id, pending)) => {
                run_id = id;
                request = pending;
            }
            None => break,
        }
    }
}

/// Compiles the project (or queues the request if a compilation is running). Progress and
/// results arrive as `compile-started`, `compile-output` and `compile-finished` events.
#[tauri::command]
pub async fn compile_project(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
    request: CompileRequest,
) -> AppResult<CompileQueued> {
    let root = with_ctx(&state, {
        let id = id.clone();
        move |ctx| ctx.path_of(&id)
    })
    .await?;
    if crate::tex::detect::find_in_path("latexmk", &state.tex_path()).is_none() {
        return Err(AppError::NotFound(PathBuf::from("latexmk")));
    }
    let requested = state
        .compile_queue
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .request(&id, request.clone());
    match requested {
        Requested::Queued => Ok(CompileQueued { run_id: None }),
        Requested::Start(run_id) => {
            let app = app.clone();
            std::thread::Builder::new()
                .name("libretex-compile".into())
                .spawn(move || run_loop(app, id, root, run_id, request))
                .map_err(|e| AppError::Other(e.to_string()))?;
            Ok(CompileQueued {
                run_id: Some(run_id),
            })
        }
    }
}

/// Stops the running compilation of the project (the whole process group) and drops any
/// pending one.
#[tauri::command]
pub fn cancel_compile(state: tauri::State<'_, AppState>, id: String) {
    if let Some(pid) = state
        .compile_queue
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .cancel(&id)
    {
        latexmk::kill_group(pid);
    }
}

/// Removes the auxiliary files of `.libretex/build` (keeps the PDF).
#[tauri::command]
pub async fn clean_build(state: tauri::State<'_, AppState>, id: String) -> AppResult<usize> {
    with_ctx(&state, move |ctx| latexmk::clean_build(&ctx.path_of(&id)?)).await
}

/// Project root and compiled PDF (absolute); `notFound` if it has not been compiled yet.
pub(crate) async fn built_pdf(
    state: &tauri::State<'_, AppState>,
    id: String,
) -> AppResult<(PathBuf, PathBuf)> {
    with_ctx(state, move |ctx| {
        let root = ctx.path_of(&id)?;
        let main_file = read_meta(&root)?.unwrap_or_default().main_file;
        let pdf = root.join(latexmk::pdf_path(&main_file));
        if pdf.is_file() {
            Ok((root, pdf))
        } else {
            Err(AppError::NotFound(pdf))
        }
    })
    .await
}

/// Bytes of the compiled PDF, for the built-in viewer (sent as raw binary, not JSON).
#[tauri::command]
pub async fn read_pdf(
    state: tauri::State<'_, AppState>,
    id: String,
) -> AppResult<tauri::ipc::Response> {
    let (_, pdf) = built_pdf(&state, id).await?;
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        std::fs::read(&pdf).map_err(|e| AppError::io(pdf, e))
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Opens the compiled PDF with the system's default viewer.
#[tauri::command]
pub async fn open_pdf(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    let (_, pdf) = built_pdf(&state, id).await?;
    app.opener()
        .open_path(pdf.to_string_lossy(), None::<&str>)
        .map_err(|e| AppError::Other(e.to_string()))
}

/// Opens the file manager with the compiled PDF selected.
#[tauri::command]
pub async fn reveal_pdf(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    let (_, pdf) = built_pdf(&state, id).await?;
    app.opener()
        .reveal_item_in_dir(pdf)
        .map_err(|e| AppError::Other(e.to_string()))
}
