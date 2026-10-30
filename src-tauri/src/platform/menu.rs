//! The macOS menu bar.
//!
//! Tauri's default one quits with ⌘Q right away (`terminate:`), without letting the windows
//! save what was typed in the last second. This one is the same but in the interface's
//! language, and its «Salir» closes every window the way their close button does: each saves
//! first, and the app ends with the last one.

use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager, Wry};

const QUIT: &str = "libretex-quit";

/// The menu's texts in the interface language (`es` by default).
fn texts(locale: &str) -> [&'static str; 6] {
    if locale == "en" {
        [
            "Edit",
            "Window",
            "Quit LibreTeX",
            "Hide LibreTeX",
            "Hide Others",
            "Show All",
        ]
    } else {
        [
            "Edición",
            "Ventana",
            "Salir de LibreTeX",
            "Ocultar LibreTeX",
            "Ocultar otros",
            "Mostrar todo",
        ]
    }
}

pub fn build(app: &AppHandle, locale: &str) -> tauri::Result<Menu<Wry>> {
    let [edit, window, quit, hide, hide_others, show_all] = texts(locale);
    let info = app.package_info();
    let about = AboutMetadata {
        name: Some(info.name.clone()),
        version: Some(info.version.to_string()),
        ..Default::default()
    };
    let separator = || PredefinedMenuItem::separator(app);
    Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                &info.name,
                true,
                &[
                    &PredefinedMenuItem::about(app, None, Some(about))?,
                    &separator()?,
                    &PredefinedMenuItem::services(app, None)?,
                    &separator()?,
                    &PredefinedMenuItem::hide(app, Some(hide))?,
                    &PredefinedMenuItem::hide_others(app, Some(hide_others))?,
                    &PredefinedMenuItem::show_all(app, Some(show_all))?,
                    &separator()?,
                    &MenuItem::with_id(app, QUIT, quit, true, Some("CmdOrCtrl+Q"))?,
                ],
            )?,
            // Without it the webview gets no ⌘C/⌘V/⌘X/⌘Z/⌘A.
            &Submenu::with_items(
                app,
                edit,
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &separator()?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                window,
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                    &separator()?,
                    &PredefinedMenuItem::fullscreen(app, None)?,
                    &separator()?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?,
        ],
    )
}

/// «Salir»: asks every visible window to close (each saves first); the hidden spare one is
/// closed with the last of them (`commands::windows::on_window_event`).
pub fn on_menu_event(app: &AppHandle, id: &str) {
    if id != QUIT {
        return;
    }
    for window in app.webview_windows().values() {
        if window.is_visible().unwrap_or(true) {
            let _ = window.close();
        }
    }
}
