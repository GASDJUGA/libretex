// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    disable_webkit_dmabuf_renderer();

    libretex_lib::run()
}

/// WebKitGTK's DMA-BUF renderer shows blank windows or crashes the Wayland
/// connection ("Error 71 (Protocol error)") with NVIDIA drivers. Disable it
/// unless the user already chose a value for the variable.
#[cfg(target_os = "linux")]
fn disable_webkit_dmabuf_renderer() {
    const VAR: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";
    if std::env::var_os(VAR).is_none() {
        // SAFETY: since Rust 2024 `set_var` is unsafe because modifying the
        // environment is a data race if other threads read it concurrently.
        // This runs first thing in `main`, before Tauri/GTK or any other code
        // could spawn threads, so the process is still single-threaded.
        unsafe { std::env::set_var(VAR, "1") };
    }
}
