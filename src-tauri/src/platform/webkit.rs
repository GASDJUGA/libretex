//! WebKitGTK 2.54 redraws only what changed (damage tracking). With the NVIDIA driver the
//! screen then showed the previous frame again for a while: a line just typed went back and
//! forth between before and after, a hover between on and off, every two frames for up to a
//! second, without any change in the page (pedido del usuario; seen in screen recordings).
//! With both damage features off, those long flickers did not come back; the whole window
//! is composited each frame, which costs the GPU next to nothing. A short one (~0.3 s) when
//! the window becomes active again still happens now and then: that one is not from here.
//!
//! The feature API exists since WebKitGTK 2.42 and these features since 2.54; the functions
//! are looked up when running, so an older WebKit still starts (and has nothing to turn off).

use std::ffi::{CStr, c_char, c_void};
use std::sync::OnceLock;

use gtk::glib::translate::ToGlibPtr;

const DAMAGE_FEATURES: [&CStr; 2] = [
    c"PropagateDamagingInformation",
    c"UseDamagingInformationForCompositing",
];

type Settings = *mut c_void;
type Feature = *mut c_void;
type FeatureList = *mut c_void;

/// The WebKitGTK feature functions, if this WebKit has them.
struct Api {
    all_features: unsafe extern "C" fn() -> FeatureList,
    list_length: unsafe extern "C" fn(FeatureList) -> usize,
    list_get: unsafe extern "C" fn(FeatureList, usize) -> Feature,
    list_unref: unsafe extern "C" fn(FeatureList),
    identifier: unsafe extern "C" fn(Feature) -> *const c_char,
    get_enabled: unsafe extern "C" fn(Settings, Feature) -> i32,
    set_enabled: unsafe extern "C" fn(Settings, Feature, i32),
}

/// The function `name` from the libraries already loaded (WebKit, via wry), as `F`.
///
/// # Safety
/// `F` must be the function pointer type of that C function.
unsafe fn find<F: Copy>(name: &CStr) -> Option<F> {
    assert_eq!(size_of::<F>(), size_of::<*mut c_void>());
    // SAFETY: dlsym only reads the name.
    let ptr = unsafe { libc::dlsym(libc::RTLD_DEFAULT, name.as_ptr()) };
    // SAFETY: same size, and the caller guarantees the type.
    (!ptr.is_null()).then(|| unsafe { std::mem::transmute_copy::<*mut c_void, F>(&ptr) })
}

fn api() -> Option<&'static Api> {
    static API: OnceLock<Option<Api>> = OnceLock::new();
    API.get_or_init(|| {
        // SAFETY: the types of `Api` are those of webkit/WebKitFeature.h and WebKitSettings.h.
        unsafe {
            Some(Api {
                all_features: find(c"webkit_settings_get_all_features")?,
                list_length: find(c"webkit_feature_list_get_length")?,
                list_get: find(c"webkit_feature_list_get")?,
                list_unref: find(c"webkit_feature_list_unref")?,
                identifier: find(c"webkit_feature_get_identifier")?,
                get_enabled: find(c"webkit_settings_get_feature_enabled")?,
                set_enabled: find(c"webkit_settings_set_feature_enabled")?,
            })
        }
    })
    .as_ref()
}

/// Calls `f` with each damage feature this WebKit has.
fn for_each_damage_feature(api: &Api, mut f: impl FnMut(Feature)) {
    // SAFETY: the list owns its features until it is released, after the loop.
    unsafe {
        let list = (api.all_features)();
        for i in 0..(api.list_length)(list) {
            let feature = (api.list_get)(list, i);
            let id = CStr::from_ptr((api.identifier)(feature));
            if DAMAGE_FEATURES.contains(&id) {
                f(feature);
            }
        }
        (api.list_unref)(list);
    }
}

/// Turns the damage features off in `settings`. Returns whether one of them was on.
fn disable_damage_tracking(settings: &webkit2gtk::Settings) -> bool {
    let Some(api) = api() else { return false };
    let raw: *mut webkit2gtk::ffi::WebKitSettings = settings.to_glib_none().0;
    let mut changed = false;
    for_each_damage_feature(api, |feature| {
        // SAFETY: a live settings object and a feature from WebKit's own list.
        unsafe {
            if (api.get_enabled)(raw.cast(), feature) != 0 {
                (api.set_enabled)(raw.cast(), feature, 0);
                changed = true;
            }
        }
    });
    changed
}

/// Applies the fix to a new window. The page is loaded again if something changed: WebKit
/// reads these features when it sets the page's compositing up.
pub fn apply(window: &tauri::WebviewWindow) {
    let _ = window.with_webview(|platform| {
        use webkit2gtk::WebViewExt;
        let view = platform.inner();
        if let Some(settings) = view.settings()
            && disable_damage_tracking(&settings)
        {
            view.reload();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    /// New settings, as a web view gets them (without GTK, which these tests do not start).
    fn new_settings() -> webkit2gtk::Settings {
        use gtk::glib::translate::FromGlibPtrFull;
        // SAFETY: a new object we own.
        unsafe { webkit2gtk::Settings::from_glib_full(webkit2gtk::ffi::webkit_settings_new()) }
    }

    fn enabled(settings: &webkit2gtk::Settings) -> Vec<bool> {
        let Some(api) = api() else { return Vec::new() };
        let raw: *mut webkit2gtk::ffi::WebKitSettings = settings.to_glib_none().0;
        let mut out = Vec::new();
        // SAFETY: as in `disable_damage_tracking`.
        for_each_damage_feature(api, |f| {
            out.push(unsafe { (api.get_enabled)(raw.cast(), f) } != 0)
        });
        out
    }

    // WebKit in its own process: it takes the first thread that uses it as its main thread
    // (another test thread using it aborts the run), and with WebKit started in the test
    // process a program run by another test (`tex::detect`) sometimes came back without output.
    #[test]
    fn apaga_el_seguimiento_de_danos_de_webkit() {
        let out = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--ignored",
                "--exact",
                "platform::webkit::tests::en_su_proceso",
            ])
            .output()
            .unwrap();
        let stdout = String::from_utf8_lossy(&out.stdout);
        assert!(
            out.status.success(),
            "{stdout}{}",
            String::from_utf8_lossy(&out.stderr)
        );
        assert!(stdout.contains("1 passed"), "{stdout}");
    }

    #[test]
    #[ignore = "corre en su propio proceso, desde apaga_el_seguimiento_de_danos_de_webkit"]
    fn en_su_proceso() {
        let settings = new_settings();
        let before = enabled(&settings);
        // Arch with WebKitGTK 2.54: both there and on by default. Elsewhere (an older WebKit,
        // as in the CI) there may be nothing to turn off, which is fine.
        if std::env::var_os("CI").is_none() {
            assert_eq!(before, [true, true]);
        }
        let changed = disable_damage_tracking(&settings);
        assert_eq!(changed, before.iter().any(|&on| on));
        assert!(enabled(&settings).iter().all(|&on| !on));
        // Nothing left to do: a window is not loaded twice.
        assert!(!disable_damage_tracking(&settings));
    }
}
