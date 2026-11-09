// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// The WebKitGTK settings below only apply on Linux, but their tests run everywhere.
#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

fn main() {
    #[cfg(target_os = "linux")]
    configure_webkit_rendering();

    jutex_lib::run()
}

const DISABLE_DMABUF: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";
const NV_EXPLICIT_SYNC: &str = "__NV_DISABLE_EXPLICIT_SYNC";

/// What the system looks like, for choosing how WebKitGTK renders.
#[derive(Debug, Clone, Copy, Default)]
struct System {
    wayland: bool,
    nvidia: bool,
    /// `JUTEX_SAFE_RENDERER=1`: the user asks for the old, software-composited path.
    safe: bool,
    /// The user already chose `WEBKIT_DISABLE_DMABUF_RENDERER`.
    user_set_dmabuf: bool,
}

/// Environment variables to set (only those the user has not set).
///
/// WebKitGTK on Wayland with NVIDIA drivers: its DMA-BUF renderer crashes the Wayland
/// connection ("Error 71 (Protocol error)") because of the driver's explicit sync. Turning
/// the whole renderer off (`WEBKIT_DISABLE_DMABUF_RENDERER=1`) avoids the crash but leaves
/// the page without GPU compositing, and scrolling stutters on large screens. Instead, keep
/// the GPU renderer and disable only the driver's explicit sync. `JUTEX_SAFE_RENDERER=1`
/// brings back the old behavior in case a system still fails.
fn renderer_vars(system: System) -> Vec<(&'static str, &'static str)> {
    if system.safe {
        vec![(DISABLE_DMABUF, "1")]
    } else if system.wayland && system.nvidia && !system.user_set_dmabuf {
        vec![(NV_EXPLICIT_SYNC, "1")]
    } else {
        Vec::new()
    }
}

/// `JUTEX_SAFE_RENDERER=1` (or `LIBRETEX_SAFE_RENDERER=1`, its name before 2.0.0).
fn safe_renderer_requested(var: impl Fn(&str) -> Option<std::ffi::OsString>) -> bool {
    ["JUTEX_SAFE_RENDERER", "LIBRETEX_SAFE_RENDERER"]
        .iter()
        .any(|name| var(name).is_some_and(|v| v == "1"))
}

#[cfg(target_os = "linux")]
fn configure_webkit_rendering() {
    use std::env::var_os;

    let system = System {
        wayland: var_os("WAYLAND_DISPLAY").is_some()
            || var_os("XDG_SESSION_TYPE").is_some_and(|v| v == "wayland"),
        nvidia: std::path::Path::new("/proc/driver/nvidia/version").exists(),
        safe: safe_renderer_requested(|name| var_os(name)),
        user_set_dmabuf: var_os(DISABLE_DMABUF).is_some(),
    };
    for (name, value) in renderer_vars(system) {
        if var_os(name).is_none() {
            // SAFETY: since Rust 2024 `set_var` is unsafe because modifying the
            // environment is a data race if other threads read it concurrently. This runs
            // first thing in `main`, before Tauri/GTK or any other code could spawn
            // threads, so the process is still single-threaded.
            unsafe { std::env::set_var(name, value) };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_modo_seguro_acepta_el_nombre_viejo() {
        let env = |pairs: &'static [(&'static str, &'static str)]| {
            move |name: &str| {
                pairs
                    .iter()
                    .find(|(n, _)| *n == name)
                    .map(|(_, v)| std::ffi::OsString::from(v))
            }
        };
        assert!(safe_renderer_requested(env(&[(
            "JUTEX_SAFE_RENDERER",
            "1"
        )])));
        assert!(safe_renderer_requested(env(&[(
            "LIBRETEX_SAFE_RENDERER",
            "1"
        )])));
        assert!(!safe_renderer_requested(env(&[(
            "JUTEX_SAFE_RENDERER",
            "0"
        )])));
        assert!(!safe_renderer_requested(env(&[])));
    }

    #[test]
    fn wayland_con_nvidia_usa_la_gpu_sin_sync_explicita() {
        let system = System {
            wayland: true,
            nvidia: true,
            ..Default::default()
        };
        assert_eq!(renderer_vars(system), [(NV_EXPLICIT_SYNC, "1")]);
    }

    #[test]
    fn otros_sistemas_no_se_tocan() {
        let x11_nvidia = System {
            nvidia: true,
            ..Default::default()
        };
        assert!(renderer_vars(x11_nvidia).is_empty());
        let wayland_amd = System {
            wayland: true,
            ..Default::default()
        };
        assert!(renderer_vars(wayland_amd).is_empty());
    }

    #[test]
    fn respeta_al_usuario_y_el_modo_seguro() {
        let chosen = System {
            wayland: true,
            nvidia: true,
            user_set_dmabuf: true,
            ..Default::default()
        };
        assert!(renderer_vars(chosen).is_empty());
        let safe = System {
            wayland: true,
            nvidia: true,
            safe: true,
            ..Default::default()
        };
        assert_eq!(renderer_vars(safe), [(DISABLE_DMABUF, "1")]);
    }
}
