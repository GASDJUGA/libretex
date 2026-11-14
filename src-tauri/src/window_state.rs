//! The main window comes back as it was when the app closed: its size, maximized or not, and
//! fullscreen on the same monitor (pedido del usuario). Kept in `window.json`, next to the
//! settings.
//!
//! On Wayland an app cannot place its window: a normal or maximized window goes where the
//! compositor puts it, but a fullscreen one can be sent to a monitor
//! (`set_fullscreen_on_monitor`, GTK's `fullscreen_on_monitor` on Linux).

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

/// Smallest size the main window accepts (`tauri.conf.json`).
const MIN_SIZE: (f64, f64) = (800.0, 500.0);

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct WindowState {
    /// Logical size of the window when it is neither maximized nor fullscreen.
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub maximized: bool,
    pub fullscreen: bool,
    /// The monitor it was on.
    pub monitor: Option<MonitorRef>,
}

/// A monitor as Tauri describes it (physical pixels): its place in the desktop and its name.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MonitorRef {
    pub name: Option<String>,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// What the window looks like now.
#[derive(Debug, Clone, PartialEq)]
pub struct Observed {
    /// Logical inner size.
    pub size: (f64, f64),
    pub maximized: bool,
    pub fullscreen: bool,
    pub monitor: Option<MonitorRef>,
}

/// The state to remember: a maximized or fullscreen window keeps the size it had before.
pub fn next(previous: &WindowState, now: &Observed) -> WindowState {
    let normal = !now.maximized && !now.fullscreen;
    WindowState {
        width: if normal {
            Some(now.size.0)
        } else {
            previous.width
        },
        height: if normal {
            Some(now.size.1)
        } else {
            previous.height
        },
        maximized: now.maximized,
        fullscreen: now.fullscreen,
        monitor: now.monitor.clone().or_else(|| previous.monitor.clone()),
    }
}

/// Which of `monitors` is the saved one: the one in the same place and size, or else the one
/// with the same name. `None` if it is no longer connected.
pub fn pick_monitor(saved: &MonitorRef, monitors: &[MonitorRef]) -> Option<usize> {
    let same_place = |m: &MonitorRef| {
        (m.x, m.y, m.width, m.height) == (saved.x, saved.y, saved.width, saved.height)
    };
    monitors.iter().position(same_place).or_else(|| {
        saved
            .name
            .as_ref()
            .and_then(|name| monitors.iter().position(|m| m.name.as_ref() == Some(name)))
    })
}

/// The size to give the window, at least the smallest it accepts.
pub fn restored_size(state: &WindowState) -> Option<(f64, f64)> {
    let (width, height) = (state.width?, state.height?);
    if !width.is_finite() || !height.is_finite() {
        return None;
    }
    Some((width.max(MIN_SIZE.0), height.max(MIN_SIZE.1)))
}

/// The saved state; nothing saved (or a broken file) is the default window.
pub fn load(path: &Path) -> WindowState {
    crate::util::fs::read_json(path)
        .ok()
        .flatten()
        .unwrap_or_default()
}

/// Not remembered if it cannot be written: the window opens as by default next time.
pub fn save(path: &Path, state: &WindowState) {
    let _ = crate::util::fs::write_json(path, state);
}

fn monitor_ref(monitor: &tauri::Monitor) -> MonitorRef {
    MonitorRef {
        name: monitor.name().cloned(),
        x: monitor.position().x,
        y: monitor.position().y,
        width: monitor.size().width,
        height: monitor.size().height,
    }
}

/// Whether the window is fullscreen, also when the desktop put it there (KDE's shortcut):
/// on Linux Tauri only knows about the fullscreen it asked for, GTK knows them all.
fn is_fullscreen(window: &tauri::Window) -> bool {
    #[cfg(target_os = "linux")]
    {
        use gtk::prelude::WidgetExt;
        if let Ok(gtk_window) = window.gtk_window() {
            return gtk_window
                .window()
                .is_some_and(|w| w.state().contains(gtk::gdk::WindowState::FULLSCREEN));
        }
    }
    window.is_fullscreen().unwrap_or(false)
}

/// Whether what the window reports now says how it looks: not while it is minimized, when
/// Windows reports a 0×0 size and «not maximized» (it would open at the smallest size).
pub fn shows_its_state(minimized: bool, width: u32, height: u32) -> bool {
    !minimized && width > 0 && height > 0
}

/// How the window looks now; `None` while it is minimized.
fn observe(window: &tauri::Window) -> Option<Observed> {
    let size = window.inner_size().ok()?;
    let minimized = window.is_minimized().unwrap_or(false);
    if !shows_its_state(minimized, size.width, size.height) {
        return None;
    }
    let scale = window.scale_factor().unwrap_or(1.0);
    Some(Observed {
        size: (size.width as f64 / scale, size.height as f64 / scale),
        maximized: window.is_maximized().unwrap_or(false),
        fullscreen: is_fullscreen(window),
        monitor: window
            .current_monitor()
            .ok()
            .flatten()
            .map(|m| monitor_ref(&m)),
    })
}

/// Keeps how the main window looked the last time it was resized or moved without being
/// minimized: closed from the taskbar while minimized, it is remembered as it was then.
pub fn note(window: &tauri::Window, seen: &Mutex<Option<Observed>>) {
    if let Some(now) = observe(window) {
        *seen.lock().unwrap_or_else(|p| p.into_inner()) = Some(now);
    }
}

/// Remembers how the main window is (when it is asked to close); if it is minimized, how it
/// was last seen (nothing changes if it was never seen).
pub fn remember(window: &tauri::Window, path: &Path, seen: &Mutex<Option<Observed>>) {
    let now = observe(window).or_else(|| seen.lock().unwrap_or_else(|p| p.into_inner()).clone());
    if let Some(now) = now {
        save(path, &next(&load(path), &now));
    }
}

/// Puts the main window back as it was and shows it (at startup). It starts hidden
/// (`tauri.conf.json`): shown at its default size first, the window manager kept that size as
/// the one to go back to when leaving fullscreen.
pub fn restore(window: &tauri::WebviewWindow, path: &Path) {
    apply(window, &load(path));
    let _ = window.show();
}

fn apply(window: &tauri::WebviewWindow, state: &WindowState) {
    if let Some((width, height)) = restored_size(state) {
        let _ = window.set_size(tauri::LogicalSize::new(width, height));
    }
    if state.maximized {
        let _ = window.maximize();
    }
    if state.fullscreen {
        let monitors: Vec<tauri::Monitor> = window.available_monitors().unwrap_or_default();
        let refs: Vec<MonitorRef> = monitors.iter().map(monitor_ref).collect();
        match state.monitor.as_ref().and_then(|m| pick_monitor(m, &refs)) {
            Some(i) => {
                let at = monitors[i].position();
                let _ = window.set_fullscreen_on_monitor(tauri::PhysicalPosition::new(
                    at.x as f64,
                    at.y as f64,
                ));
            }
            None => {
                let _ = window.set_fullscreen(true);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn monitor(name: &str, x: i32) -> MonitorRef {
        MonitorRef {
            name: Some(name.into()),
            x,
            y: 0,
            width: 2560,
            height: 1440,
        }
    }

    fn observed(maximized: bool, fullscreen: bool) -> Observed {
        Observed {
            size: (1500.0, 900.0),
            maximized,
            fullscreen,
            monitor: Some(monitor("DELL", 1920)),
        }
    }

    #[test]
    fn una_ventana_normal_guarda_su_tamano() {
        let state = next(&WindowState::default(), &observed(false, false));
        assert_eq!((state.width, state.height), (Some(1500.0), Some(900.0)));
        assert!(!state.maximized && !state.fullscreen);
        assert_eq!(state.monitor, Some(monitor("DELL", 1920)));
    }

    #[test]
    fn maximizada_o_en_pantalla_completa_conserva_el_tamano_de_antes() {
        let before = WindowState {
            width: Some(1200.0),
            height: Some(700.0),
            ..Default::default()
        };
        for (maximized, fullscreen) in [(true, false), (false, true), (true, true)] {
            let state = next(&before, &observed(maximized, fullscreen));
            assert_eq!((state.width, state.height), (Some(1200.0), Some(700.0)));
            assert_eq!((state.maximized, state.fullscreen), (maximized, fullscreen));
        }
    }

    #[test]
    fn el_monitor_se_reconoce_por_su_lugar_y_si_no_por_su_nombre() {
        let monitors = [monitor("LG", 0), monitor("DELL", 2560)];
        // Same place and size.
        assert_eq!(pick_monitor(&monitor("otro", 2560), &monitors), Some(1));
        // Moved in the desktop layout: by its name.
        assert_eq!(pick_monitor(&monitor("DELL", 1920), &monitors), Some(1));
        // Disconnected.
        assert_eq!(pick_monitor(&monitor("HP", 5000), &monitors), None);
        assert_eq!(pick_monitor(&monitor("HP", 5000), &[]), None);
    }

    #[test]
    fn minimizada_no_dice_como_se_ve() {
        assert!(shows_its_state(false, 1100, 700));
        // Windows: a minimized window reports 0×0 and «not maximized».
        assert!(!shows_its_state(true, 0, 0));
        assert!(!shows_its_state(true, 1100, 700));
        assert!(!shows_its_state(false, 0, 0));
    }

    #[test]
    fn el_tamano_restaurado_respeta_el_minimo() {
        let mut state = WindowState::default();
        assert_eq!(restored_size(&state), None);
        state.width = Some(300.0);
        state.height = Some(1000.0);
        assert_eq!(restored_size(&state), Some((800.0, 1000.0)));
        state.width = Some(f64::NAN);
        assert_eq!(restored_size(&state), None, "un archivo editado a mano");
    }

    #[test]
    fn se_guarda_y_se_lee() {
        let tmp = tempfile::TempDir::new().unwrap();
        let path = tmp.path().join("window.json");
        assert_eq!(load(&path), WindowState::default());
        let state = next(&WindowState::default(), &observed(false, true));
        save(&path, &state);
        assert_eq!(load(&path), state);
        std::fs::write(&path, "{ roto").unwrap();
        assert_eq!(load(&path), WindowState::default());
    }
}
