//! WebView2 settings Tauri does not expose, and files dropped on a window from the Explorer.
//!
//! The browser's own shortcuts are off: Ctrl+R/F5 would reload the app, Ctrl+P print it,
//! Ctrl+J open the downloads, Ctrl+wheel and pinching zoom the whole interface, and a swipe
//! go back. The page still gets those keys (Ctrl+F, Ctrl+J and Ctrl+wheel are LibreTeX's).
//!
//! Files dropped from the Explorer: Tauri's drop handler replaces WebView2's, which leaves the
//! page without HTML5 drag and drop (tabs, the file tree), so it is turned off there
//! (`tauri.windows.conf.json`, `build_window`). The page then receives the drop and posts the
//! dropped files (`File` objects, folders too) to WebView2 as additional objects
//! (`lib/windowsDrop.ts`); their paths are read here. Only the user can put a file in such an
//! object (by dropping it or choosing it), so the webview still cannot name arbitrary paths
//! for `import_dropped`.

use crate::state::AppState;
use std::path::PathBuf;
use tauri::{Emitter, Manager};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2, ICoreWebView2File, ICoreWebView2Settings3, ICoreWebView2Settings5,
    ICoreWebView2Settings6, ICoreWebView2WebMessageReceivedEventArgs,
    ICoreWebView2WebMessageReceivedEventArgs2,
};
use webview2_com::{WebMessageReceivedEventHandler, take_pwstr};
use windows_core::{Interface, PWSTR};

/// The message the page posts with the dropped files.
const MESSAGE: &str = "libretex-files-dropped";
/// The paths, sent back to the window they were dropped on.
const EVENT: &str = "files-dropped";

/// Sets up `window`'s webview: no browser shortcuts, and the drop messages of its page.
pub fn attach(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    let target = window.clone();
    window.with_webview(move |platform| {
        let handler = WebMessageReceivedEventHandler::create(Box::new(move |_, args| {
            if let Some(paths) = args.as_ref().and_then(dropped) {
                received(&target, paths);
            }
            Ok(())
        }));
        let mut token = 0;
        // SAFETY: COM calls on the webview's thread, where `with_webview` runs.
        unsafe {
            if let Ok(core) = platform.controller().CoreWebView2() {
                without_browser_shortcuts(&core);
                let _ = core.add_WebMessageReceived(&handler, &mut token);
            }
        }
    })
}

/// Turns the browser's shortcuts off (see the module's notes); each setting needs a newer
/// runtime than the last, so a missing one is skipped.
fn without_browser_shortcuts(core: &ICoreWebView2) {
    // SAFETY: COM calls on valid interfaces, on the webview's thread.
    unsafe {
        let Ok(settings) = core.Settings() else {
            return;
        };
        let _ = settings.SetIsZoomControlEnabled(false);
        if let Ok(settings) = settings.cast::<ICoreWebView2Settings3>() {
            let _ = settings.SetAreBrowserAcceleratorKeysEnabled(false);
        }
        if let Ok(settings) = settings.cast::<ICoreWebView2Settings5>() {
            let _ = settings.SetIsPinchZoomEnabled(false);
        }
        if let Ok(settings) = settings.cast::<ICoreWebView2Settings6>() {
            let _ = settings.SetIsSwipeNavigationEnabled(false);
        }
    }
}

/// The paths of the files posted with the drop message, or `None` for other messages (Tauri's
/// own calls arrive here too).
fn dropped(args: &ICoreWebView2WebMessageReceivedEventArgs) -> Option<Vec<PathBuf>> {
    // SAFETY: COM calls on valid interfaces; each string WebView2 returns is freed by
    // `take_pwstr`, and only read when the call succeeded.
    unsafe {
        let mut text = PWSTR::null();
        args.TryGetWebMessageAsString(&mut text).ok()?;
        if take_pwstr(text) != MESSAGE {
            return None;
        }
        let objects = args
            .cast::<ICoreWebView2WebMessageReceivedEventArgs2>()
            .ok()?
            .AdditionalObjects()
            .ok()?;
        let mut count = 0;
        objects.Count(&mut count).ok()?;
        let mut paths = Vec::new();
        for i in 0..count {
            // A dropped folder comes as a `File` too.
            let Ok(file) = objects
                .GetValueAtIndex(i)
                .and_then(|object| object.cast::<ICoreWebView2File>())
            else {
                continue;
            };
            let mut path = PWSTR::null();
            if file.Path(&mut path).is_ok() {
                let path = take_pwstr(path);
                if !path.is_empty() {
                    paths.push(PathBuf::from(path));
                }
            }
        }
        Some(paths)
    }
}

/// Kept as the last drop (what `import_dropped` accepts) and sent to the page.
fn received(window: &tauri::WebviewWindow, paths: Vec<PathBuf>) {
    if let Some(state) = window.try_state::<AppState>() {
        *state.dropped.lock().unwrap_or_else(|p| p.into_inner()) = paths.clone();
    }
    let _ = window.emit_to(
        tauri::EventTarget::webview_window(window.label()),
        EVENT,
        paths,
    );
}
